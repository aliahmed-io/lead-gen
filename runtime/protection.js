'use strict';
const store = require('./store');
const MAX_PER_ACCOUNT = 100;
const MAX_TOTAL = 600;
const DIAGNOSTIC_TTL = 30 * 60000;
const HOUR = 3600000;

function windowStats(id, now = Date.now()) {
  const rows = store.connection().prepare('SELECT type,email,at,payload FROM events WHERE account_id=? AND at>=?').all(String(id), now - 7 * 24 * HOUR);
  const events = rows.map(r => ({...JSON.parse(r.payload), type:r.type, email:r.email, at:r.at}));
  const day = events.filter(e => e.at >= now - 24 * HOUR);
  const sent = day.filter(e => e.type === 'sent').length;
  const bounces = new Set(day.filter(e => e.type === 'hard_bounce').map(e => e.email)).size;
  return {
    sent, bounces, bounceRate:sent ? bounces / sent : 0,
    complaints:events.filter(e => e.type === 'complaint').length,
    temporaryErrors:events.filter(e => e.at >= now - HOUR && (e.type === 'soft_bounce' || e.type === 'send_error' && ['temporary','throttle'].includes(e.kind))).length,
    policyErrors:day.filter(e => e.type === 'send_error' && e.kind === 'policy').length,
  };
}

function risk(id, now = Date.now()) {
  const stats = windowStats(id, now);
  const threshold = Math.min(Number(store.read('settings').bounceThreshold) || 0.02, 0.02);
  if (stats.complaints) return {kind:'complaint', reason:'A reported complaint requires review', review:true, cooldown:24 * HOUR};
  if (stats.policyErrors) return {kind:'policy', reason:'Provider policy rejection requires review', review:true, cooldown:24 * HOUR};
  if (stats.bounces >= 2 || stats.sent >= 10 && stats.bounceRate >= threshold) return {kind:'bounce', reason:'Recent hard-bounce warning threshold reached', review:true, cooldown:24 * HOUR};
  if (stats.temporaryErrors >= 3) return {kind:'temporary', reason:'Repeated recent deferrals or temporary failures', review:false, cooldown:HOUR};
  return null;
}

function hold(id, kind, reason, {review=false, cooldown=HOUR, now=Date.now(), extend=false} = {}) {
  return store.mutate('campaign', c => {
    const st = c.accountState[String(id)] ||= {};
    // Automated recovery must never clear an operator's explicit pause.
    const changed = !st.autoPaused || st.protectionKind !== kind;
    st.autoPaused = true;
    st.autoPauseReason = reason;
    st.protectionKind = kind;
    st.requiresReview = Boolean(st.requiresReview || review);
    st.pausedAt ||= now;
    st.pauseUntil = Math.max(st.pauseUntil || 0, changed || extend || !st.pauseUntil ? now + cooldown : st.pauseUntil);
    if(kind==='auth'||kind==='connection')st.nextHealthCheckAt=Math.max(st.nextHealthCheckAt||0,now+(kind==='auth'?HOUR:300000));
    st.recoveryChecks = 0;
    st.lastRecoveryCheckAt = null;
    if (changed) store.record('account_protection_pause', {accountId:id, kind, reason, requiresReview:st.requiresReview, pauseUntil:st.pauseUntil});
  });
}

function diagnosticsPass(st, now = Date.now()) {
  return st.lastSmtpStatus === 'pass' && st.lastImapStatus === 'pass' &&
    st.lastDiagnosticAt && now - st.lastDiagnosticAt <= DIAGNOSTIC_TTL &&
    ['spf','dmarc','dkim','mx'].every(k => st.dnsResult?.[k]?.pass);
}

function evaluate(id, {diagnosticCompleted=false, now=Date.now()} = {}) {
  const warning = risk(id, now);
  if (warning) { hold(id, warning.kind, warning.reason, {...warning, now}); return {paused:true, reason:warning.reason}; }
  return store.mutate('campaign', c => {
    const st = c.accountState[String(id)] ||= {};
    if (!st.autoPaused) return {paused:false};
    if (!diagnosticsPass(st, now)) { st.recoveryChecks=0; return {paused:true}; }
    if (!diagnosticCompleted || st.manualHold || st.requiresReview || !st.protectionKind || now < (st.pauseUntil || 0)) return {paused:true};
    if (!st.lastRecoveryCheckAt || now - st.lastRecoveryCheckAt >= 15 * 60000) {
      st.recoveryChecks=(st.recoveryChecks || 0)+1;
      st.lastRecoveryCheckAt=now;
    }
    if (st.recoveryChecks < 2) return {paused:true};
    st.autoPaused=false;st.autoPauseReason=null;st.protectionKind=null;st.consecutiveErrors=0;
    // A recovered account starts below its ceiling; it does not immediately run at 100/day.
    st.recoveryStartedAt=now;st.recoveryCap=10;
    store.record('account_protection_recovered', {accountId:id, recoveryCap:10});
    return {paused:false, recovered:true};
  });
}

function dailyCap(account, settings, now=Date.now()) {
  const st = store.read('campaign').accountState[String(account.id)] || {};
  let cap = Math.min(MAX_PER_ACCOUNT, settings.maxEmailsPerDay);
  if (st.recoveryStartedAt) cap=Math.min(cap, 10 * Math.pow(2, Math.min(4, Math.floor(Math.max(0,now-st.recoveryStartedAt)/(24*HOUR)))));
  return cap;
}

function monitorCurrent(now=Date.now()) {
  const m=store.read('protectionMonitor', {});
  return m.status==='online' && m.heartbeatAt && now-m.heartbeatAt<120000;
}

module.exports={MAX_PER_ACCOUNT,MAX_TOTAL,DIAGNOSTIC_TTL,windowStats,risk,hold,diagnosticsPass,evaluate,dailyCap,monitorCurrent};
