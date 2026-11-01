'use strict';

// Mailbox probing: connect to the recipient's own mail server and ask whether it would accept the address.
// No message is ever sent (the session stops after RCPT TO). A random address detects catch-all domains.
const net = require('node:net');
const os = require('node:os');
const crypto = require('node:crypto');
const dns = require('node:dns').promises;
const { bounded } = require('../verification');
const { resolvePublic } = require('../network');

const USER_UNKNOWN = /5\.1\.1|5\.1\.10|5\.4\.1|user unknown|unknown user|no such (?:user|mailbox|recipient)|does(?: not|n't) exist|mailbox (?:unavailable|not found)|recipient (?:not found|rejected)|invalid (?:mailbox|recipient)|address rejected/i;
const POLICY_BLOCK = /5\.7\.\d|block|spam|blacklist|denied|reputation|policy|not (?:allowed|permitted)|rbl|spamhaus|poor reputation/i;

function classifyReply(code, message) {
  if (code === 250 || code === 251) return 'accepted';
  if (code >= 400 && code < 500) return 'temporary';
  if (code >= 500) {
    if (/5\.2\.2|mailbox full|quota|storage|capacity/i.test(message)) return 'capacity-limited';
    if (USER_UNKNOWN.test(message) && !/5\.7\./.test(message)) return 'rejected';
    if (POLICY_BLOCK.test(message)) return 'blocked';
    return 'inconclusive';
  }
  return 'inconclusive';
}

function detectProvider(mxHosts) {
  const joined = mxHosts.join(' ').toLowerCase();
  if (/google\.com|googlemail\.com/.test(joined)) return 'google-workspace';
  if (/outlook\.com|protection\.outlook|microsoft/.test(joined)) return 'microsoft-365';
  if (/zoho\./.test(joined)) return 'zoho';
  if (/pphosted|mimecast|barracuda|proofpoint|messagelabs|ironport/.test(joined)) return 'security-gateway';
  if (/secureserver\.net/.test(joined)) return 'godaddy';
  return 'other';
}

function smtpSession({ host, port = 25, helo, mailFrom = '', rcpts, timeoutMs = 15000, connect = options => net.connect(options) }) {
  return new Promise(resolve => {
    const out = { host, connected: false, banner: '', results: [], error: null };
    const socket = connect({ host, port });
    let buffer = '', step = 'banner', index = 0, done = false, timer, pending = '', totalTimer;
    const finish = error => { if (done) return; done = true; clearTimeout(timer); clearTimeout(totalTimer); try { socket.destroy(); } catch { /* already closed */ } if (error) out.error = error; resolve(out); };
    totalTimer = setTimeout(() => finish('total-deadline'), timeoutMs * 2);
    const arm = () => { clearTimeout(timer); timer = setTimeout(() => finish('timeout'), timeoutMs); };
    const send = line => { arm(); socket.write(line + '\r\n'); };
    const handle = (code, text) => {
      if (step === 'banner') { out.banner = text.slice(0, 200); if (code !== 220) return finish('banner-' + code); step = 'ehlo'; return send('EHLO ' + helo); }
      if (step === 'ehlo') { if (code !== 250) { step = 'helo'; return send('HELO ' + helo); } step = 'mail'; return send('MAIL FROM:<' + mailFrom + '>'); }
      if (step === 'helo') { if (code !== 250) return finish('helo-' + code); step = 'mail'; return send('MAIL FROM:<' + mailFrom + '>'); }
      if (step === 'mail') { if (code !== 250) { out.mailFromReply = { code, message: text.slice(0, 200) }; return finish('mail-from-' + code); } step = 'rcpt'; return send('RCPT TO:<' + rcpts[0] + '>'); }
      if (step === 'rcpt') {
        out.results.push({ rcpt: rcpts[index], code, message: text.slice(0, 240) });
        index++;
        if (code === 421 || index >= rcpts.length) { step = 'quit'; try { socket.write('QUIT\r\n'); } catch { /* ignore */ } return finish(); }
        return send('RCPT TO:<' + rcpts[index] + '>');
      }
    };
    socket.setEncoding('utf8');
    socket.on('connect', () => { out.connected = true; arm(); });
    socket.on('data', chunk => {
      buffer += chunk;
      if (buffer.length + pending.length > 65536) { finish('response-too-large'); return; }
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, ''); buffer = buffer.slice(newline + 1);
        const match = line.match(/^(\d{3})([ -])(.*)$/); if (!match) continue;
        pending += (pending ? ' ' : '') + match[3];
        if (match[2] === ' ') { const text = pending; pending = ''; handle(Number(match[1]), text); }
      }
    });
    socket.on('error', error => finish(error.code || error.message));
    socket.on('close', () => finish(out.results.length ? null : 'closed'));
    arm();
  });
}

function createSmtpProber({ resolveMx = domain => dns.resolveMx(domain), helo = process.env.PROBE_HELO || os.hostname(), mailFrom = process.env.PROBE_MAIL_FROM || '', delayMs = 1500, timeoutMs = 15000, connect, resolveHost = resolvePublic, sleep = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  const lastByHost = new Map();
  const politeness = async host => { const wait = (lastByHost.get(host) || 0) + delayMs - Date.now(); lastByHost.set(host, Math.max(Date.now(), (lastByHost.get(host) || 0) + delayMs)); if (wait > 0) await sleep(wait); };

  async function verifyDomain(domain, emails) {
    let records;
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain) || emails.length > 100 || emails.some(e => !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(e) || e.split('@')[1] !== domain)) throw new Error('Invalid SMTP probe input');
    if (/[\r\n]/.test(helo + mailFrom)) throw new Error('Invalid SMTP command identity');
    try { records = (await bounded(resolveMx(domain), 5000)).filter(r => r.exchange && r.exchange !== '.').sort((a, b) => a.priority - b.priority); } catch (error) {
      const permanent = ['ENODATA', 'ENOTFOUND'].includes(error.code);
      return { domain, status: permanent ? 'no-mx' : 'dns-temporary', mx: [], provider: 'none', catchAll: null, perEmail: Object.fromEntries(emails.map(e => [e, { status: permanent ? 'no-mx' : 'temporary', message: 'MX lookup: ' + (error.code || error.message) }])) };
    }
    if (!records.length) return { domain, status: 'no-mx', mx: [], provider: 'none', catchAll: null, perEmail: Object.fromEntries(emails.map(e => [e, { status: 'no-mx', message: 'No MX records' }])) };
    const mx = records.map(r => r.exchange); const provider = detectProvider(mx);
    const randomRcpt = 'probe-' + crypto.randomBytes(6).toString('hex') + '@' + domain;
    const rcpts = [randomRcpt, ...emails];
    let session = null, lastError = null;
    for (const exchange of mx.slice(0, 3)) {
      await politeness(exchange);
      let record;
      try { record = await bounded(resolveHost(exchange), 5000); } catch (error) { lastError = 'mx-host-not-public: ' + error.message; continue; }
      if (!record?.address) { lastError = 'MX resolver returned no pinned address'; continue; }
      session = await smtpSession({ host: record.address, helo, mailFrom, rcpts, timeoutMs, connect });
      if (session.results.length) break;
      lastError = session.error; session = null;
    }
    if (!session) return { domain, status: 'unreachable', mx, provider, catchAll: null, error: lastError, perEmail: Object.fromEntries(emails.map(e => [e, { status: 'unreachable', message: String(lastError || 'no session').slice(0, 160) }])) };
    const byRcpt = new Map(session.results.map(r => [r.rcpt, r]));
    const random = byRcpt.get(randomRcpt); const randomClass = random ? classifyReply(random.code, random.message) : 'inconclusive';
    const catchAll = randomClass === 'accepted' ? true : randomClass === 'rejected' ? false : null;
    const perEmail = {};
    for (const email of emails) {
      const reply = byRcpt.get(email);
      if (!reply) { perEmail[email] = { status: 'inconclusive', message: 'Server ended the session before this address was checked' }; continue; }
      let status = classifyReply(reply.code, reply.message);
      if (catchAll === true && status === 'accepted') status = 'catch-all';
      else if (catchAll === null && status === 'accepted') status = 'inconclusive';
      perEmail[email] = { status, code: reply.code, message: reply.message };
    }
    return { domain, status: 'probed', mx, provider, catchAll, randomProbe: random ? { code: random.code, status: randomClass } : null, perEmail };
  }
  return { verifyDomain };
}

module.exports = { createSmtpProber, smtpSession, classifyReply, detectProvider };
