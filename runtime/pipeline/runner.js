'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync, backup } = require('node:sqlite');
const { createEngine, eligibleLead, host, sha, csv } = require('../master-research');
const { probeSite } = require('./probe');
const { loadRobots, allowed } = require('./robots');
const { assessCommerce } = require('./commerce');
const { ownerEmailCandidates } = require('./emails');
const { decide, TIERS, ownersOf } = require('./decide');

const VERSION = 'qualify-v3';
const BACKOFF_MINUTES = [3, 15, 45, 120, 360];
const PERSONAL = new Set(['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com', 'live.com', 'msn.com', 'proton.me', 'protonmail.com']);
const SMTP_FINAL = new Set(['accepted', 'rejected', 'catch-all', 'no-mx']);

function openStore(file) {
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS leads (id TEXT PRIMARY KEY, domain TEXT NOT NULL, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS jobs (domain TEXT PRIMARY KEY, website TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL DEFAULT 0, final INTEGER NOT NULL DEFAULT 0, result TEXT, updated_at TEXT);
    CREATE TABLE IF NOT EXISTS mailboxes (email TEXT PRIMARY KEY, domain TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL DEFAULT 0, final INTEGER NOT NULL DEFAULT 0, result TEXT, updated_at TEXT);
    CREATE TABLE IF NOT EXISTS domain_mail (domain TEXT PRIMARY KEY, result TEXT NOT NULL, updated_at TEXT);`);
  if (!db.prepare('PRAGMA table_info(jobs)').all().some(c => c.name === 'commerce_version')) db.exec("ALTER TABLE jobs ADD COLUMN commerce_version TEXT NOT NULL DEFAULT ''");
  return db;
}

async function pool(items, size, worker, shouldStop) {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) || 0 }, async () => {
    while (cursor < items.length && !shouldStop()) { const item = items[cursor++]; await worker(item); }
  }));
}

function compactLead(b) {
  return { id: b.id, name: b.name, website: b.website, emails: b.emails || [], country: b.country || '', state: b.state || '', city: b.city || '', categories: b.categories || [], names: b.names || [] };
}

async function run(options) {
  const { input, workdir, migrateFrom, seedResearch, concurrency = 10, smtpConcurrency = 4, smtp = false, maxAttempts = 3, backoffScale = 1, converge = true, maxWaitMs = 6 * 3600 * 1000, sample = 0, work = true, filter = eligibleLead, deps, log = () => {}, signal } = options;
  fs.mkdirSync(workdir, { recursive: true });
  const databaseFile = path.join(workdir, 'qualify.sqlite');
  if (migrateFrom && path.resolve(migrateFrom).toLowerCase() === path.resolve(workdir).toLowerCase()) throw new Error('Upgrade requires a separate new working directory; the original checkpoint stays unchanged');
  if (fs.existsSync(databaseFile) && !migrateFrom) {
    const guard = new DatabaseSync(databaseFile, { readOnly: true });
    try {
      if (guard.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='meta'").get()) {
        const version = guard.prepare("SELECT value FROM meta WHERE key='version'").get()?.value;
        if (version && version !== VERSION) throw new Error('Use a new --workdir and --upgrade-from=old-working-folder; original checkpoint was not modified');
      }
    } finally { guard.close(); }
  }
  if (migrateFrom && !fs.existsSync(databaseFile)) {
    const from = new DatabaseSync(path.resolve(migrateFrom, 'qualify.sqlite'), { readOnly: true });
    try { await backup(from, databaseFile); } finally { from.close(); }
  }
  const db = openStore(databaseFile);
  const now = deps.now || (() => Date.now());
  const sleep = deps.sleep || (ms => new Promise(r => setTimeout(r, ms)));
  let stopping = false;
  let smtpSessionsThisInvocation = 0;
  signal?.addEventListener('abort', () => { stopping = true; });
  const getMeta = db.prepare('SELECT value FROM meta WHERE key=?'), setMeta = db.prepare('INSERT OR REPLACE INTO meta(key,value) VALUES(?,?)');

  // ---- Intake: read-only on the source; only the selected leads are stored in the working database.
  if (!getMeta.get('version')) {
    if (!input) throw new Error('First run needs --input');
    const source = fs.readFileSync(input);
    const master = JSON.parse(source);
    let pick = Object.values(master.businesses).filter(filter);
    if (sample > 0) { let seed = 42; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296; pick = [...pick]; for (let i = pick.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pick[i], pick[j]] = [pick[j], pick[i]]; } pick = pick.slice(0, sample); }
    const insertLead = db.prepare('INSERT OR IGNORE INTO leads(id,domain,payload) VALUES(?,?,?)');
    const insertJob = db.prepare('INSERT OR IGNORE INTO jobs(domain,website,state,final,result) VALUES(?,?,?,?,?)');
    db.exec('BEGIN');
    for (const b of pick) {
      const domain = host(b.website);
      insertLead.run(b.id, domain || 'invalid:' + b.id, JSON.stringify(compactLead(b)));
      if (!domain) insertJob.run('invalid:' + b.id, b.website || '', 'invalid-website', 1, JSON.stringify({ state: 'invalid-website' }));
      else if (deps.chainDomains.some(c => domain === c || domain.endsWith('.' + c))) insertJob.run(domain, b.website, 'excluded-known-chain', 1, JSON.stringify({ state: 'excluded-known-chain' }));
      else insertJob.run(domain, /^https?:\/\//i.test(b.website) ? b.website : 'https://' + b.website, 'pending', 0, null);
    }
    setMeta.run('version', VERSION); setMeta.run('sourceSha256', sha(source)); setMeta.run('input', path.resolve(input)); setMeta.run('createdAt', new Date().toISOString());
    db.exec('COMMIT');
  } else if (getMeta.get('version').value !== VERSION) {
    if (!migrateFrom || getMeta.get('version').value !== 'qualify-v2') throw new Error('Use a new --workdir and --upgrade-from=old-working-folder');
    setMeta.run('upgradedFrom', path.resolve(migrateFrom)); setMeta.run('version', VERSION);
    db.exec('UPDATE jobs SET next_at=0,attempts=0 WHERE final=0');
  }
  const sourcePath = input || getMeta.get('input')?.value;
  if (sourcePath) {
    const source = fs.readFileSync(sourcePath);
    if (sha(source) !== getMeta.get('sourceSha256').value) throw new Error('Input hash changed: use a new working directory; original files were not modified');
    const snapshot = path.join(workdir, 'source-master.copy.json');
    if (!fs.existsSync(snapshot)) fs.writeFileSync(snapshot, source, { flag: 'wx' });
    else if (sha(fs.readFileSync(snapshot)) !== sha(source)) throw new Error('Working source snapshot mismatch');
  }
  if (seedResearch && !getMeta.get('seedResearch')) {
    const seed = new DatabaseSync(path.resolve(seedResearch, 'research-working.sqlite'), { readOnly: true });
    try {
      if (seed.prepare('SELECT value FROM meta WHERE key=?').get('sourceSha256')?.value !== getMeta.get('sourceSha256').value) throw new Error('Research seed has a different input hash');
      const read = seed.prepare('SELECT result FROM sites WHERE domain=?');
      const save = db.prepare("UPDATE jobs SET state='done',final=1,next_at=0,result=?,commerce_version='' WHERE domain=?");
      for (const row of db.prepare("SELECT * FROM jobs WHERE state NOT IN ('done','excluded-known-chain','invalid-website','parked')").all()) {
        const raw = read.get(row.domain); if (!raw) continue;
        const crawl = JSON.parse(raw.result), first = crawl.pages?.find(p => !p.blocked && !p.parked);
        if (!first || !['researched', 'partial-time-limit'].includes(crawl.status)) continue;
        const finalUrl = first.url;
        const probe = { state: 'live', origin: new URL(finalUrl).origin, finalUrl, finalDomain: host(finalUrl), requestedDomain: row.domain, domainChanged: host(finalUrl) !== row.domain, headers: {}, source: 'preserved-public-research' };
        save.run(JSON.stringify({ domain: row.domain, website: row.website, probe, crawl, commerce: null }), row.domain);
      }
      setMeta.run('seedResearch', path.resolve(seedResearch));
    } finally { seed.close(); }
  }

  const engine = createEngine({ cheerio: deps.cheerio, network: deps.network, verification: deps.verification, chainDomains: deps.chainDomains, mxResolver: deps.mxResolver, fetcher: async (url, _redirects, opts) => {
    const response = await deps.fetchPage(url, { signal: opts?.signal });
    if (response.status < 200 || response.status >= 300) throw new Error('Website returned HTTP ' + response.status);
    if (opts?.allowedHost && host(response.url || url) !== opts.allowedHost) throw new Error('Cross-domain website request blocked');
    return { ...response, url: response.url || url };
  } });

  const leads = () => db.prepare('SELECT payload FROM leads').all().map(r => JSON.parse(r.payload));
  const emptySite = (website, status) => ({ website, domain: host(website), status, checkedAt: new Date().toISOString(), pages: [], errors: [], owners: [], contacts: [], sizeFacts: [], commerce: [], niche: [], platforms: [] });
  const saveJob = db.prepare('UPDATE jobs SET state=?,attempts=?,next_at=?,final=?,result=?,updated_at=? WHERE domain=?');

  function backoff(attempts) { return Math.round(BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)] * 60000 * backoffScale); }
  function limitFor(state) { return state === 'dns-dead' ? 2 : maxAttempts; }

  async function processSite(row) {
    const controller = new AbortController();
    const cancel = () => controller.abort(); signal?.addEventListener('abort', cancel, { once: true });
    const ctx = { fetchPage: deps.fetchPage, signal: controller.signal };
    const previous = row.result ? JSON.parse(row.result) : null;
    const reuse = row.state === 'done' && previous?.crawl?.pages?.some(p => !p.blocked && !p.parked) && previous?.probe?.origin;
    const out = reuse ? previous : { domain: row.domain, website: row.website, probe: null, robots: null, crawl: null, commerce: null };
    const totalTimer = setTimeout(() => controller.abort(), 120000);
    let state, retryable = false;
    try {
      const probe = reuse ? out.probe : await probeSite(row.website, { fetchPage: deps.fetchPage, host, signal: controller.signal });
      const html = probe.html; delete probe.html; out.probe = probe;
      if (probe.state !== 'live') { state = probe.state; retryable = probe.retryable; }
      else {
        const robots = await loadRobots(probe.origin, ctx); out.robots = { status: robots.status, delay: robots.delay, detail: robots.detail || '', message: robots.message || '' };
        if (robots.status === 'unreachable') { state = 'robots-unreachable'; retryable = true; }
        else if (!allowed(robots, probe.finalUrl)) { state = 'robots-disallowed'; }
        else if (robots.delay > 10000) { state = 'crawl-delay-too-long'; }
        else {
          const crawl = reuse ? out.crawl : await engine.crawlSite(probe.origin + '/', { maxPages: 10, timeoutMs: 90000, signal: controller.signal, robots });
          out.crawl = crawl;
          if (crawl.status === 'blocked-or-rate-limited') { state = 'blocked'; retryable = true; }
          else if (crawl.status === 'parked-or-coming-soon') state = 'parked';
          else if (crawl.status === 'browser-or-manual-review-needed') state = 'browser-or-manual-review-needed';
          else if (!['researched', 'partial-time-limit'].includes(crawl.status)) { state = 'unreachable'; retryable = true; }
          else {
            out.commerce = await assessCommerce({ origin: probe.origin, html, headers: probe.headers, crawl, robots, fetchPage: deps.fetchPage, signal: controller.signal });
            if (reuse && ['confirmed', 'likely'].includes(out.commerce.ecommerce) && ['confirmed', 'likely'].includes(out.commerce.niche)) {
              const known = crawl.pages.filter(p => p.url && !p.blocked && !p.parked && /about|contact|story|team|owner|founder|leadership|company/i.test(new URL(p.url).pathname)).map(p => p.url);
              const seedUrls = [...new Set(known.length ? known : ['/pages/about-us', '/about-us', '/contact'].map(p => new URL(p, probe.origin).href))].slice(0, 3);
              const focused = await engine.crawlSite(probe.origin + '/', { seedUrls, maxPages: 3, timeoutMs: 35000, signal: controller.signal, robots });
              const best = new Map();
              for (const c of [...focused.contacts, ...crawl.contacts].sort((a, b) => Number(Boolean(b.ownerBinding)) - Number(Boolean(a.ownerBinding)))) if (!best.has(c.email)) best.set(c.email, c);
              out.crawl = { ...crawl, contacts: [...best.values()], owners: [...focused.owners, ...crawl.owners], pages: [...crawl.pages, ...focused.pages], sizeFacts: [...focused.sizeFacts, ...crawl.sizeFacts], checkedAt: new Date().toISOString(), ownerRefresh: { status: focused.status, pages: focused.pages.map(p => p.url), errors: focused.errors } };
            }
            state = 'done';
          }
        }
      }
    } catch (error) { state = 'internal-error'; retryable = true; out.error = String(error.message).slice(0, 300); }
    finally { clearTimeout(totalTimer); signal?.removeEventListener('abort', cancel); }
    if (stopping) return;
    const attempts = row.commerce_version === VERSION ? row.attempts + 1 : 1;
    const final = state === 'done' || !retryable || attempts >= limitFor(state) ? 1 : 0;
    out.exhausted = Boolean(retryable && final);
    saveJob.run(state, attempts, final ? 0 : now() + Math.max(backoff(attempts), out.probe?.retryAfterMs || 0), final, JSON.stringify(out), new Date().toISOString(), row.domain);
    db.prepare('UPDATE jobs SET commerce_version=? WHERE domain=?').run(VERSION, row.domain);
  }

  function jobRows() { return db.prepare('SELECT * FROM jobs').all(); }
  function parsedJob(row) { const r = row.result ? JSON.parse(row.result) : {}; return { ...r, state: row.state, final: Boolean(row.final), attempts: row.attempts, needsCommerceRefresh: row.state === 'done' && row.commerce_version !== VERSION }; }
  function mailboxResults() { const map = {}; for (const r of db.prepare('SELECT email,state,result FROM mailboxes').all()) map[r.email] = { status: r.state, ...(r.result ? JSON.parse(r.result) : {}) }; return map; }

  function decisions() {
    const jobsByDomain = new Map(jobRows().map(r => [r.domain, parsedJob(r)]));
    const mail = mailboxResults();
    const routing = new Map(db.prepare('SELECT domain,result FROM domain_mail').all().map(r => [r.domain, JSON.parse(r.result).dns || null]));
    return leads().map(b => {
      const domain = host(b.website) || 'invalid:' + b.id;
      const job = jobsByDomain.get(domain);
      const crawl = job?.crawl || emptySite(b.website, job?.state || 'pending');
      const assess = engine.assessBusiness({ ...b, emails: b.emails }, crawl);
      const decision = decide({ business: b, job, assess, commerce: job?.commerce, mailboxes: mail, smtpEnabled: smtp });
      for (const c of decision.candidates) c.freeMailRoutingCheck = routing.get(c.email.split('@')[1]) || { status: 'not-checked', mailboxVerified: false };
      return { business: b, job, assess, decision };
    });
  }
  async function freeDnsStage() {
    const domains = new Map();
    for (const { decision } of decisions()) for (const c of decision.candidates) if (c.via !== 'derived') domains.set(c.email.split('@')[1], c.email);
    await pool([...domains.entries()], 8, async ([domain, email]) => {
      const dnsResult = await engine.domainMail(email);
      const prior = db.prepare('SELECT result FROM domain_mail WHERE domain=?').get(domain);
      const result = { ...(prior ? JSON.parse(prior.result) : {}), dns: dnsResult };
      db.prepare('INSERT OR REPLACE INTO domain_mail(domain,result,updated_at) VALUES(?,?,?)').run(domain, JSON.stringify(result), new Date().toISOString());
    }, () => stopping);
  }

  async function mailStage() {
    if (!smtp || !deps.smtp) return;
    const upsert = db.prepare('INSERT OR IGNORE INTO mailboxes(email,domain) VALUES(?,?)');
    for (const { decision, assess, job, business } of decisions()) {
      if (!job || job.state !== 'done' || decision.tier === TIERS.X || decision.tier === TIERS.U || decision.tier === TIERS.D) continue;
      const candidates = ownerEmailCandidates({ owners: ownersOf(assess), contacts: assess.contacts, siteDomain: job.probe.finalDomain, storedEmails: business.emails || [], personalDomains: PERSONAL });
      for (const c of candidates) upsert.run(c.email, c.email.split('@')[1]);
    }
    const due = db.prepare('SELECT email,domain,attempts FROM mailboxes WHERE final=0 AND next_at<=?').all(now());
    const byDomain = new Map();
    for (const r of due) { if (!byDomain.has(r.domain)) byDomain.set(r.domain, []); byDomain.get(r.domain).push(r); }
    const save = db.prepare('UPDATE mailboxes SET state=?,attempts=?,next_at=?,final=?,result=?,updated_at=? WHERE email=?');
    await pool([...byDomain.entries()], smtpConcurrency, async ([domain, rows]) => {
      const outcome = await deps.smtp.verifyDomain(domain, rows.map(r => r.email));
      smtpSessionsThisInvocation++;
      const priorDomain = db.prepare('SELECT result FROM domain_mail WHERE domain=?').get(domain);
      db.prepare('INSERT OR REPLACE INTO domain_mail(domain,result,updated_at) VALUES(?,?,?)').run(domain, JSON.stringify({ ...(priorDomain ? JSON.parse(priorDomain.result) : {}), status: outcome.status, mx: outcome.mx, provider: outcome.provider, catchAll: outcome.catchAll, randomProbe: outcome.randomProbe || null, error: outcome.error || '' }), new Date().toISOString());
      for (const r of rows) {
        const result = outcome.perEmail[r.email] || { status: 'inconclusive', message: 'no result' };
        const attempts = r.attempts + 1;
        const final = SMTP_FINAL.has(result.status) || attempts >= 3 ? 1 : 0;
        save.run(result.status, attempts, final ? 0 : now() + backoff(attempts), final, JSON.stringify({ code: result.code || null, message: result.message || '', provider: outcome.provider, catchAll: outcome.catchAll }), new Date().toISOString(), r.email);
      }
    }, () => stopping);
  }

  function counts() {
    const q = sql => db.prepare(sql).get().n;
    const by = Object.fromEntries(db.prepare('SELECT state, count(*) n FROM jobs GROUP BY state').all().map(r => [r.state, r.n]));
    return { version: VERSION, updatedAt: new Date().toISOString(), leads: q('SELECT count(*) n FROM leads'), websites: q('SELECT count(*) n FROM jobs'), websitesFinal: q('SELECT count(*) n FROM jobs WHERE final=1'), websitesWaitingRetry: q('SELECT count(*) n FROM jobs WHERE final=0 AND attempts>0'), websitesNeverTried: q('SELECT count(*) n FROM jobs WHERE final=0 AND attempts=0'), websitesNeedingCommerceRefresh: db.prepare("SELECT count(*) n FROM jobs WHERE state='done' AND commerce_version<>?").get(VERSION).n, websiteStates: by, smtpEnabled: smtp, smtpSessionsThisInvocation, historicalMailboxProbeRecords: q('SELECT count(*) n FROM mailboxes WHERE attempts>0'), historicalPendingMailboxRecords: q('SELECT count(*) n FROM mailboxes WHERE final=0'), emailsSent: 0, campaignsChanged: false, paidServicesUsed: false };
  }
  const writeProgress = () => { const c = counts(); fs.writeFileSync(path.join(workdir, 'progress.json'), JSON.stringify(c, null, 2)); return c; };

  const ticker = setInterval(() => log(JSON.stringify(writeProgress())), 30000); ticker.unref?.();
  try {
    for (let round = 1; work && !stopping; round++) {
      const due = db.prepare("SELECT * FROM jobs WHERE (final=0 AND next_at<=?) OR (state='done' AND commerce_version<>?)").all(now(), VERSION);
      log('round ' + round + ': ' + due.length + ' websites due');
      await pool(due, concurrency, processSite, () => stopping);
      if (!stopping) await freeDnsStage();
      if (!stopping) await mailStage();
      const c = writeProgress(); log(JSON.stringify(c));
      const next = db.prepare(smtp ? 'SELECT min(next_at) t FROM (SELECT next_at FROM jobs WHERE final=0 UNION ALL SELECT next_at FROM mailboxes WHERE final=0)' : 'SELECT min(next_at) t FROM jobs WHERE final=0').get().t;
      if (next === null || next === undefined || !converge) break;
      const wait = Math.max(0, next - now());
      if (wait > maxWaitMs) { log('stopping: next retry is ' + Math.round(wait / 60000) + ' min away (> max wait)'); break; }
      log('waiting ' + Math.round(wait / 1000) + 's for retryable websites/mailboxes');
      await sleep(wait);
    }
  } finally { clearInterval(ticker); }
  const final = writeProgress();
  return { final, db, decisions, jobRows, workdir, getMeta, counts };
}

const OWNER_COLUMNS = ['email', 'owner_name', 'business', 'website', 'tier', 'proof', 'smtp_status', 'evidence_url', 'platforms', 'ecommerce', 'furniture_decor', 'flags', 'business_id'];

function exportAll(session) {
  const rows = session.decisions();
  const sourcePath = session.getMeta.get('input')?.value;
  if (sourcePath && sha(fs.readFileSync(sourcePath)) !== session.getMeta.get('sourceSha256')?.value) throw new Error('Original input changed externally; export stopped');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-') + '-' + process.hrtime.bigint();
  const out = path.join(session.workdir, 'exports-' + stamp);
  fs.mkdirSync(out, { recursive: false });
  const write = (name, data) => fs.writeFileSync(path.join(out, name), data, { flag: 'wx' });
  const tier = t => rows.filter(r => r.decision.tier === t);
  const ownerRow = r => { const d = r.decision, b = d.bestEmail || {}; return [b.email || '', b.ownerName || d.owners[0]?.name || '', r.business.name, d.domain || r.business.website, d.tier, b.proof || '', b.smtpStatus || '', b.evidenceUrl || d.owners[0]?.evidenceUrl || '', (d.commerce?.platforms || []).join('+'), d.commerce?.ecommerce || '', d.commerce?.niche || '', d.flags.join('|'), r.business.id]; };
  write('01-published-owner-contacts-NEED-VERIFICATION.csv', csv(OWNER_COLUMNS, tier(TIERS.A).map(ownerRow)));
  write('02-inferred-addresses-REVIEW-FIRST.csv', csv(['email', 'owner_name', 'business', 'website', 'owner_evidence_url', 'smtp_status', 'provenance', 'why', 'business_id', 'email_source_url', 'association_type'], tier(TIERS.B).flatMap(r => r.decision.candidates.filter(c => c.via !== 'derived' && !['rejected', 'no-mx'].includes(c.smtp?.status)).map(c => [c.email, c.ownerName, r.business.name, r.decision.domain, c.evidenceUrl, c.smtp?.status || 'not-probed', c.evidenceKind, r.decision.reasons.join('|'), r.business.id, c.emailSourceUrl || '', c.via === 'published' ? 'published-association-business-identity-needs-review' : /name.*match/.test(c.evidenceKind || '') ? 'inferred-name-match' : 'unproven-person-email-association']))));
  const finder = new Map();
  for (const r of [...tier(TIERS.A), ...tier(TIERS.C), ...tier(TIERS.B)]) for (const o of r.decision.owners) {
    if (r.decision.tier === TIERS.A && r.decision.candidates.some(c => c.via === 'published' && c.ownerName.toLowerCase() === o.name.toLowerCase())) continue;
    const key = o.name.toLowerCase() + ':' + r.decision.domain;
    if (!finder.has(key)) finder.set(key, [o.name, r.decision.domain, r.business.name, o.role, o.evidenceUrl, r.decision.candidates.filter(c => c.ownerName.toLowerCase() === o.name.toLowerCase()).map(c => c.email + ':' + (c.smtp?.status || 'not-probed')).slice(0, 6).join(' '), r.business.id, o.name.includes(' ') ? 'full-name-candidate' : 'first-name-only-needs-more-research', 'yes']);
  }
  write('03-owner-found-need-finder.csv', csv(['owner_name', 'domain', 'business', 'role', 'owner_evidence_url', 'candidate_addresses_NOT_proof', 'business_id', 'name_completeness', 'current_owner_and_business_review_required'], [...finder.values()]));
  write('04-qualified-no-owner.csv', csv(['business', 'website', 'general_contacts', 'platforms', 'products', 'flags', 'business_id'], tier(TIERS.D).map(r => [r.business.name, r.decision.domain, r.decision.fallbackContacts.join(' '), (r.decision.commerce?.platforms || []).join('+'), r.decision.commerce?.productCount || '', r.decision.flags.join('|'), r.business.id])));
  write('05-excluded.csv', csv(['business', 'website', 'reasons', 'business_id'], tier(TIERS.X).map(r => [r.business.name, r.business.website, r.decision.reasons.join('|'), r.business.id])));
  write('06-unresolved.csv', csv(['business', 'website', 'state', 'reasons', 'next_action', 'business_id'], tier(TIERS.U).map(r => [r.business.name, r.business.website, r.decision.state, r.decision.reasons.join('|'), r.decision.nextAction, r.business.id])));
  const patterns = new Map();
  for (const r of rows) for (const c of r.decision.candidates.filter(c => c.via === 'derived')) {
    const key = c.email + ':' + c.ownerName.toLowerCase();
    if (!patterns.has(key)) patterns.set(key, [c.email, c.ownerName, r.business.name, c.evidenceUrl, c.smtp?.status || 'not-probed', 'generated-name-pattern', 'no']);
  }
  write('08-generated-patterns-NOT-VERIFIED.csv', csv(['candidate_email', 'owner_name', 'business', 'owner_source_url', 'smtp_signal_NOT_owner_proof', 'provenance', 'send_approved'], [...patterns.values()]));
  write('evidence.json', JSON.stringify(rows.map(r => r.decision), null, 2));
  const contacts = new Map();
  for (const r of rows) for (const c of r.decision.candidates.filter(c => c.via !== 'derived')) {
    const strong = r.decision.tier === TIERS.A && c.via === 'published';
    const item = { email: c.email, ownerBinding: { name: c.ownerName, sourceUrl: c.ownerSourceUrl || c.evidenceUrl, snippet: c.ownerEvidence || '', kind: c.evidenceKind }, sourceUrl: c.emailSourceUrl || '', snippet: c.snippet || '', evidenceTier: strong ? 'published-owner-email-candidate' : 'owner-email-needs-review', via: c.via, businessIds: [r.business.id], businesses: [r.business.name], sourceEvidence: [{ businessId: r.business.id, ownerName: c.ownerName, ownerSourceUrl: c.ownerSourceUrl || c.evidenceUrl, emailSourceUrl: c.emailSourceUrl || '', snippet: c.snippet || '', ownerEvidence: c.ownerEvidence || '' }], freeMailRoutingCheck: c.freeMailRoutingCheck, flags: r.decision.flags, mailboxVerification: 'not-performed', sendApproved: false };
    if (!contacts.has(c.email)) contacts.set(c.email, item);
    else {
      const previous = contacts.get(c.email);
      const best = strong ? item : previous;
      best.businessIds = [...new Set([...previous.businessIds, ...item.businessIds])];
      best.businesses = [...new Set([...previous.businesses, ...item.businesses])];
      best.sourceEvidence = [...previous.sourceEvidence, ...item.sourceEvidence];
      if (new Set(best.sourceEvidence.map(e => e.ownerName.toLowerCase())).size > 1) { best.evidenceTier = 'owner-email-needs-review'; best.flags = [...best.flags, 'conflicting-owner-names']; }
      contacts.set(c.email, best);
    }
  }
  const ownerCandidates = [...contacts.values()];
  const priority = ownerCandidates.filter(c => c.evidenceTier === 'published-owner-email-candidate' && c.freeMailRoutingCheck?.status === 'mail-routing-found');
  write('07-UPLOAD-TO-PAID-VERIFIER.csv', csv(['email'], priority.map(c => [c.email])));
  write('05-research-results.json', JSON.stringify({ version: VERSION, generatedAt: new Date().toISOString(), source: { path: sourcePath, sha256: session.getMeta.get('sourceSha256')?.value }, ownerCandidates, businesses: rows.map(r => ({ ...r.assess, qualification: r.decision })), sendApproved: 0 }, null, 2));
  const count = t => tier(t).length;
  const smtpStats = {}; for (const r of session.db.prepare('SELECT state, count(*) n FROM mailboxes GROUP BY state').all()) smtpStats[r.state] = r.n;
  const stateStats = {}; for (const r of rows) stateStats[r.decision.state] = (stateStats[r.decision.state] || 0) + 1;
  const storeRows = rows.filter(r => [TIERS.A, TIERS.B, TIERS.C, TIERS.D].includes(r.decision.tier));
  const summary = { version: VERSION, generatedAt: new Date().toISOString(), output: out, leads: rows.length, tiers: { A_published_owner_needs_verification: count(TIERS.A), B_inferred_or_pattern_needs_review: count(TIERS.B), C_owner_found_no_working_email: count(TIERS.C), D_store_candidate_no_owner: count(TIERS.D), X_excluded: count(TIERS.X), U_unresolved: count(TIERS.U) }, storeCandidates: storeRows.length, qualifiedEcommerceConfirmed: storeRows.filter(r => r.decision.commerce?.ecommerce === 'confirmed').length, qualifiedEcommerceLikely: storeRows.filter(r => r.decision.commerce?.ecommerce === 'likely').length, ecommerceConfirmed: rows.filter(r => r.decision.commerce?.ecommerce === 'confirmed').length, ecommerceLikely: rows.filter(r => r.decision.commerce?.ecommerce === 'likely').length, namedOwnerBusinesses: storeRows.filter(r => r.decision.owners.length).length, uniquePublishedEmailsForPaidVerification: priority.length, uniqueInferredOwnerAddresses: ownerCandidates.filter(c => c.evidenceTier !== 'published-owner-email-candidate').length, generatedPatternCount: patterns.size, ownerFinderRequests: finder.size, fullNameFinderRequests: [...finder.values()].filter(r => r[7] === 'full-name-candidate').length, partialNameFinderRequests: [...finder.values()].filter(r => r[7] !== 'full-name-candidate').length, websitesNeedingLaterRetry: session.counts().websitesWaitingRetry, websiteOutcomes: stateStats, historicalMailboxProbeOutcomes: smtpStats, smtpSessionsThisInvocation: session.counts().smtpSessionsThisInvocation, smtpEnabled: session.counts().smtpEnabled, sourceSha256: session.getMeta.get('sourceSha256')?.value, inputUnchanged: true, emailsSent: 0, sendApproved: 0, paidServicesUsed: false };
  write('SUMMARY.json', JSON.stringify(summary, null, 2));
  write('READ-ME.txt', ['QUALIFICATION RESULTS ' + summary.generatedAt, 'A = published person/email association with a store candidate. Paid verification and owner/business review are still required.', 'B = inferred or generated address. No proof the mailbox belongs to the named person. Review first; do not bulk-send.', 'C = owner named but no usable candidate. Use the owner-name/domain pairs in file 03 with an optional finder.', 'D = store candidate without a published owner. File 04 retains the gap.', 'X = excluded using positive evidence; U = unresolved or insufficient evidence, not discarded as a fake business.', '07-UPLOAD-TO-PAID-VERIFIER.csv contains deduplicated published candidates with mail-routing records. An empty file means no such candidates were found.', '08 contains GENERATED patterns only, separated from published evidence. SMTP acceptance does not prove owner identity or delivery.', 'Use 05-research-results.json with the existing research verification importer when paid results are available.', 'Product counts from a sitemap are lower-bound URL counts. Availability and purchase-flow evidence remain separate. USD does not establish US location.', 'Current ownership, independence and small/medium business size still need review. No candidate is approved for sending.', 'Nothing was sent, no campaign changed, no paid service used. Original lead files and earlier exports are preserved.'].join('\r\n'));
  return summary;
}

module.exports = { run, exportAll, openStore, VERSION };
