'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { sha, slug, domain, personKey, publicUrl, email, csv, decisionMaker } = require('./common');
const { classify, DAY } = require('./segments');
class Registry {
  constructor(folder, { now = () => Date.now() } = {}) {
    this.folder = path.resolve(folder); this.now = now;
    fs.mkdirSync(this.folder, { recursive: true });
    this.db = new DatabaseSync(path.join(this.folder, 'enrichment.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS businesses(id TEXT PRIMARY KEY,domain TEXT NOT NULL,payload TEXT NOT NULL,classification TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS business_domain ON businesses(domain);
      CREATE TABLE IF NOT EXISTS owners(id TEXT PRIMARY KEY,domain TEXT NOT NULL,name_key TEXT NOT NULL,payload TEXT NOT NULL,UNIQUE(domain,name_key));
      CREATE TABLE IF NOT EXISTS contacts(email TEXT NOT NULL,owner_id TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(email,owner_id));
      CREATE TABLE IF NOT EXISTS requests(key TEXT PRIMARY KEY,provider TEXT NOT NULL,state TEXT NOT NULL,expires INTEGER NOT NULL,payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,at INTEGER NOT NULL,type TEXT NOT NULL,payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sources(sha TEXT PRIMARY KEY,path TEXT NOT NULL,snapshot TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS source_observations(sha TEXT PRIMARY KEY,observed_at REAL NOT NULL);
      CREATE TABLE IF NOT EXISTS suppressions(scope TEXT NOT NULL,key TEXT NOT NULL,reason TEXT NOT NULL,at INTEGER NOT NULL,PRIMARY KEY(scope,key));
      CREATE TABLE IF NOT EXISTS leases(name TEXT PRIMARY KEY,token TEXT NOT NULL,expires INTEGER NOT NULL);`);
    // Existing registries may predate source observations and have archived source copies.
    // Conservatively retain their oldest saved evidence age instead of renewing it on upgrade.
    this.db.prepare(`INSERT OR IGNORE INTO source_observations(sha,observed_at)
      SELECT sha,(SELECT MIN(json_extract(classification,'$.checkedAt')) FROM businesses)
      FROM sources WHERE (SELECT MIN(json_extract(classification,'$.checkedAt')) FROM businesses) IS NOT NULL`).run();
    const version = this.db.prepare("SELECT value FROM meta WHERE key='version'").get()?.value;
    if (version && version !== 'enrichment-v1') throw new Error('Unsupported registry version; use a new working folder');
    this.db.prepare('INSERT OR IGNORE INTO meta VALUES(?,?)').run('version', 'enrichment-v1');
  }
  event(type, payload) { this.db.prepare('INSERT INTO events(at,type,payload) VALUES(?,?,?)').run(this.now(), type, JSON.stringify(payload)); }
  suppressed(host, ownerId) { return Boolean(this.db.prepare("SELECT 1 FROM suppressions WHERE (scope='domain' AND key=?) OR (scope='owner' AND key=?)").get(host, ownerId || '')); }
  suppress(scope, key, reason) { this.db.prepare('INSERT OR REPLACE INTO suppressions VALUES(?,?,?,?)').run(scope, key, reason, this.now()); this.event('processing-suppressed', { scope, key, reason }); }
  async exclusive(work) {
    const token = crypto.randomUUID();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const prior = this.db.prepare("SELECT * FROM leases WHERE name='writer'").get();
      if (prior && prior.expires > this.now()) throw new Error('Another enrichment writer is active');
      this.db.prepare('INSERT OR REPLACE INTO leases VALUES(?,?,?)').run('writer', token, this.now() + 240000); this.db.exec('COMMIT');
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
    const heartbeat = setInterval(() => this.db.prepare("UPDATE leases SET expires=? WHERE name='writer' AND token=?").run(this.now() + 240000, token), 30000);
    try { return await work(); } finally { clearInterval(heartbeat); this.db.prepare("DELETE FROM leases WHERE name='writer' AND token=?").run(token); }
  }
  snapshot(file) {
    const data = fs.readFileSync(file), hash = sha(data), dir = path.join(this.folder, 'source-copies'); fs.mkdirSync(dir, { recursive: true });
    const copy = path.join(dir, hash + path.extname(file));
    if (!fs.existsSync(copy)) fs.writeFileSync(copy, data, { flag: 'wx' });
    else if (sha(fs.readFileSync(copy)) !== hash) throw new Error('Preserved source copy changed');
    this.db.prepare('INSERT OR IGNORE INTO sources VALUES(?,?,?)').run(hash, path.resolve(file), copy);
    this.db.prepare('INSERT OR IGNORE INTO source_observations VALUES(?,?)').run(hash, Math.min(this.now(), fs.statSync(file).mtimeMs));
    const observedAt = this.db.prepare('SELECT observed_at FROM source_observations WHERE sha=?').get(hash).observed_at;
    return { data, hash, path: path.resolve(file), observedAt };
  }
  intake(masterFile, qualificationFile) {
    const source = this.snapshot(masterFile), qualification = qualificationFile ? this.snapshot(qualificationFile) : null;
    const parsed = JSON.parse(source.data), records = Array.isArray(parsed) ? parsed : Object.values(parsed.businesses || {});
    const evidence = qualification ? JSON.parse(qualification.data) : [];
    if (!Array.isArray(evidence)) throw new Error('Qualification input must be evidence.json, an array');
    const byId = new Map(evidence.map(r => [r.businessId, r]));
    const byDomain = new Map(evidence.filter(r => domain(r.website)).map(r => [domain(r.website), r]));
    const evidenceTime = qualificationFile ? Math.min(this.now(), qualification.observedAt) : this.now();
    const put = this.db.prepare('INSERT OR REPLACE INTO businesses VALUES(?,?,?,?)');
    this.db.exec('BEGIN');
    try {
      for (const b of records) {
        const host = domain(b.website || ''), id = sha([b.dataQuality?.suspectedGenerated ? 'fixture' : 'real', host, slug(b.name), slug(b.country), slug(b.state), slug(b.city), !host ? slug(b.address) : ''].join(':'));
        const old = this.db.prepare('SELECT payload,classification FROM businesses WHERE id=?').get(id);
        const decision = byId.get(b.id) || byDomain.get(host);
        const classification = decision || !old ? classify(b, decision, evidenceTime) : JSON.parse(old.classification);
        const previous = old ? JSON.parse(old.payload) : {};
        const compact = { id, name: b.name || '', website: b.website || '', domain: host, country: b.country || '', state: b.state || '', city: b.city || '', categories: b.categories || [], emails: [...new Set([...(previous.emails || []), ...(b.emails || [])])], sourceIds: [...new Set([...(previous.sourceIds || []), b.id].filter(Boolean))], sourceHashes: [...new Set([...(previous.sourceHashes || []), source.hash])], suspectedGenerated: Boolean(b.dataQuality?.suspectedGenerated), checkedAt: this.now() };
        put.run(id, host, JSON.stringify(compact), JSON.stringify(classification));
      }
      for (const d of evidence) {
        const host = domain(d.website); if (!host) continue;
        for (const o of d.owners || []) this.owner(host, o.name, { role: o.role, sourceUrl: o.evidenceUrl, snippet: o.snippet, provenance: 'public-website-owner-candidate' });
        for (const c of d.candidates || []) if (c.via !== 'derived') {
          const owner = this.findOwner(host, c.ownerName); if (!owner) continue;
          this.contact(c.email, owner.id, { provenance: c.via === 'published' ? 'published-person-email' : 'inferred-association', sourceUrl: c.emailSourceUrl, evidence: c.snippet, verification: null });
        }
      }
      this.event('intake', { sourceSha256: source.hash, qualificationSha256: qualification?.hash || null, inputRecords: records.length }); this.db.exec('COMMIT');
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
    if (sha(fs.readFileSync(masterFile)) !== source.hash) throw new Error('Original source changed externally during intake');
    return this.stats();
  }
  owner(host, name, evidence) {
    host = domain(host); name = String(name || '').trim();
    if (!host || !decisionMaker(evidence.role) || (!require('./common').usableName(name) && !/^[\p{L}][\p{L}'’-]{1,30}$/u.test(name)) || !publicUrl(evidence.sourceUrl)) return null;
    const id = sha(host + ':' + personKey(name)); if (this.suppressed(host, id)) return null;
    const prior = this.findOwner(host, name);
    const item = { id, domain: host, name, fullNameCandidate: name.includes(' '), role: evidence.role || '', evidence: [...(prior?.evidence || []), evidence].filter((v, i, a) => a.findIndex(x => JSON.stringify(x) === JSON.stringify(v)) === i).slice(-30), currentOwnershipConfirmed: false, sendApproved: false };
    this.db.prepare('INSERT OR REPLACE INTO owners VALUES(?,?,?,?)').run(id, host, personKey(name), JSON.stringify(item)); return item;
  }
  findOwner(host, name) { const r = this.db.prepare('SELECT payload FROM owners WHERE domain=? AND name_key=?').get(domain(host), personKey(name)); const owner = r ? JSON.parse(r.payload) : null; return owner && !this.suppressed(owner.domain, owner.id) ? owner : null; }
  contact(raw, ownerId, evidence) {
    const address = email(raw), owner = this.db.prepare('SELECT payload FROM owners WHERE id=?').get(ownerId);
    if (!address || !owner) return false;
    const o = JSON.parse(owner.payload), mailDomain = address.split('@')[1];
    if (this.suppressed(o.domain, o.id)) return false;
    const personal = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'proton.me'];
    if (mailDomain !== o.domain && !mailDomain.endsWith('.' + o.domain) && !personal.includes(mailDomain)) return false;
    const prior = this.db.prepare('SELECT payload FROM contacts WHERE email=? AND owner_id=?').get(address, ownerId);
    const old = prior ? JSON.parse(prior.payload) : null;
    const history = [...(old?.evidence || [])];
    if (!history.some(e => { const value = { ...e }; delete value.observedAt; return JSON.stringify(value) === JSON.stringify(evidence); })) history.push({ ...evidence, observedAt: this.now() });
    const item = { email: address, ownerId, domain: o.domain, ownerName: o.name, evidence: history, sendApproved: false };
    this.db.prepare('INSERT OR REPLACE INTO contacts VALUES(?,?,?)').run(address, ownerId, JSON.stringify(item)); return true;
  }
  businesses() { return this.db.prepare('SELECT payload,classification FROM businesses').all().map(r => ({ ...JSON.parse(r.payload), classification: JSON.parse(r.classification) })); }
  owners() { return this.db.prepare('SELECT payload FROM owners').all().map(r => JSON.parse(r.payload)); }
  contacts() { return this.db.prepare('SELECT payload FROM contacts').all().map(r => JSON.parse(r.payload)); }
  prioritizedDomains(segment = 'priority_ar_decor') {
    if (!['priority_ar_decor', 'later_ecommerce'].includes(segment)) throw new Error('Only ecommerce segments can be enriched');
    const domains = new Map(); for (const b of this.businesses().filter(b => b.classification.segment === segment && !this.suppressed(b.domain))) {
      if (b.domain && (!domains.has(b.domain) || domains.get(b.domain).classification.arFitScore < b.classification.arFitScore)) domains.set(b.domain, b);
    }
    return [...domains.values()].sort((a, b) => b.classification.arFitScore - a.classification.arFitScore || a.domain.localeCompare(b.domain));
  }
  screen(raw, { mode = 'discover' } = {}) {
    const host = domain(raw); if (!host) return { skip: true, reason: 'invalid-website' };
    const rows = this.db.prepare('SELECT classification FROM businesses WHERE domain=?').all(host).map(r => JSON.parse(r.classification));
    const hasCommerce = rows.some(r => ['priority_ar_decor', 'later_ecommerce'].includes(r.segment));
    const freshIgnore = rows.find(r => r.ignoreNewScraping && r.recheckAt > this.now() && (!hasCommerce || r.segment !== 'ignore_non_ecommerce'));
    if (freshIgnore) return { skip: true, reason: freshIgnore.reason, recheckAt: freshIgnore.recheckAt };
    const real = rows.some(r => r.segment !== 'excluded_data');
    return { skip: mode === 'discover' && real, reason: real ? mode === 'discover' ? 'already-known-use-enrichment-queue' : 'known-domain-research-allowed' : 'new-domain' };
  }
  reserve(provider, params, maxCalls, runId) {
    if (!Number.isInteger(maxCalls) || maxCalls < 0 || maxCalls > 10000) throw new Error('Lookup budget must be an integer from 0 to 10000');
    const canonical = JSON.stringify(Object.fromEntries(Object.entries(params).sort(([a], [b]) => a.localeCompare(b))));
    const key = sha(provider + ':' + canonical), cached = this.db.prepare('SELECT * FROM requests WHERE key=?').get(key);
    if (cached && (cached.expires > this.now() || cached.state === 'reserved')) return { key, cached: true, state: cached.state, payload: JSON.parse(cached.payload) };
    const used = this.db.prepare("SELECT count(*) n FROM events WHERE type='lookup-reserved' AND json_extract(payload,'$.runId')=? AND json_extract(payload,'$.provider')=?").get(runId, provider).n;
    if (used >= maxCalls) return { key, blocked: 'budget-exhausted' };
    this.db.prepare('INSERT OR REPLACE INTO requests VALUES(?,?,?,?,?)').run(key, provider, 'reserved', this.now() + DAY, JSON.stringify({ reservedAt: this.now() }));
    this.event('lookup-reserved', { provider, runId, key }); return { key, cached: false };
  }
  complete(key, provider, result, { retryMs = 0, failed = false } = {}) {
    this.db.prepare('UPDATE requests SET state=?,expires=?,payload=? WHERE key=? AND provider=?').run(failed ? 'failed' : 'complete', this.now() + (failed ? Math.max(retryMs, 60000) : 30 * DAY), JSON.stringify(result), key, provider);
  }
  stats() {
    const segments = {}; const businesses = this.businesses(); for (const b of businesses) segments[b.classification.segment] = (segments[b.classification.segment] || 0) + 1;
    const real = businesses.filter(b => b.classification.segment !== 'excluded_data');
    return { businesses: businesses.length, nongeneratedBusinesses: real.length, uniqueDomains: new Set(businesses.map(b => b.domain).filter(Boolean)).size, nongeneratedUniqueDomains: new Set(real.map(b => b.domain).filter(Boolean)).size, segments, owners: this.owners().length, contacts: this.contacts().length, emailsSent: 0, sendApproved: 0 };
  }
  export({ segment = 'priority_ar_decor' } = {}) {
    const out = path.join(this.folder, 'exports-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex')); fs.mkdirSync(out);
    const write = (name, value) => fs.writeFileSync(path.join(out, name), value, { flag: 'wx' });
    const businesses = this.businesses(), owners = this.owners(), contacts = this.contacts();
    const usableContacts = contacts.filter(c => !this.suppressed(c.domain, c.ownerId));
    for (const segment of ['priority_ar_decor', 'later_ecommerce', 'ignore_non_ecommerce', 'research_needed', 'excluded_data', 'excluded_outreach']) write(segment + '.csv', csv(['business', 'domain', 'source_country', 'source_city', 'ar_fit_score', 'reason', 'ecommerce', 'recheck_at', 'business_key'], businesses.filter(b => b.classification.segment === segment).map(b => [b.name, b.domain, b.country, b.city, b.classification.arFitScore, b.classification.reason, b.classification.ecommerce, new Date(b.classification.recheckAt).toISOString(), b.id])));
    write('due-for-requalification.csv', csv(['business', 'domain', 'previous_segment', 'recheck_at'], businesses.filter(b => b.classification.recheckAt <= this.now() && b.classification.segment !== 'excluded_data').map(b => [b.name, b.domain, b.classification.segment, new Date(b.classification.recheckAt).toISOString()])));
    const priority = new Set(this.prioritizedDomains(segment).map(b => b.domain));
    const contactedOwnerIds = new Set(contacts.map(c => c.ownerId));
    const queue = owners.filter(o => priority.has(o.domain) && !this.suppressed(o.domain, o.id) && !contactedOwnerIds.has(o.id));
    write('owner-finder-queue.csv', csv(['owner_name', 'domain', 'role', 'name_completeness', 'owner_key', 'source_url'], queue.map(o => [o.name, o.domain, o.role, o.fullNameCandidate ? 'full-name-candidate' : 'partial-needs-research', o.id, o.evidence[0]?.sourceUrl])));
    const ownersById = new Map(owners.map(o => [o.id, o]));
    write('owner-contact-review.csv', csv(['email', 'owner_name', 'domain', 'provenance', 'mailbox_status', 'verification_date', 'role', 'owner_source_url', 'email_source_url', 'owner_key', 'send_approved'], usableContacts.filter(c => priority.has(c.domain)).map(c => {
      const e = c.evidence.filter(e => e.provenance !== 'external-mailbox-verification-not-owner-proof').at(-1) || c.evidence.at(-1), v = contactVerification(c, this.now()), o = ownersById.get(c.ownerId);
      return [c.email, c.ownerName, c.domain, e.provenance, v.status, v.verifiedAt || '', o?.role || '', o?.evidence[0]?.sourceUrl || '', e.sourceUrl || '', c.ownerId, 'no'];
    })));
    const eligible = usableContacts.filter(c => priority.has(c.domain) && !['invalid', 'valid'].includes(contactVerification(c, this.now()).status));
    const upload = [...new Set(eligible.map(c => c.email))];
    write('mailbox-verification-candidates-OWNER-REVIEW-REQUIRED.csv', csv(['email'], upload.map(e => [e])));
    const approvedMailbox = usableContacts.filter(c => priority.has(c.domain) && contactVerification(c, this.now()).status === 'valid');
    write('mailbox-valid-STILL-NEEDS-OWNER-REVIEW.csv', csv(['email', 'owner_name', 'domain', 'send_approved'], approvedMailbox.map(c => [c.email, c.ownerName, c.domain, 'no'])));
    write('registry-evidence.json', JSON.stringify({ version: 'enrichment-v1', businesses, owners, contacts, sendApproved: false }, null, 2));
    const summary = { ...this.stats(), output: out, priorityDomains: priority.size, finderRequests: queue.length, distinctEmailsForMailboxChecking: upload.length, mailboxValidCandidates: approvedMailbox.length };
    write('SUMMARY.json', JSON.stringify(summary, null, 2)); return summary;
  }
  close() { this.db.close(); }
}
function contactVerification(contact, now) {
  const states = contact.evidence.filter(e => e.verification).map(e => e.verification).filter(v => Number.isFinite(Date.parse(v.verifiedAt)) && Date.parse(v.verifiedAt) <= now + 300000 && now - Date.parse(v.verifiedAt) <= 30 * DAY);
  if (!states.length) return { status: 'unverified' };
  const latest = states.at(-1), statuses = new Set(states.map(v => v.status));
  return { ...latest, status: statuses.size > 1 ? 'conflict' : latest.status };
}
module.exports = { Registry, contactVerification };
