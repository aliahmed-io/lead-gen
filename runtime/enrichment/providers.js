'use strict';
const { normalizeStatus, parseCsv } = require('./common').app('./runtime/research-verification');
const { domain, email, personKey, publicUrl, decisionMaker, sha } = require('./common');
const { contactVerification } = require('./registry');
const ROLE = /\b(?:owner|founder|cofounder|co-founder|proprietor|ceo|chief executive|president)\b/i;
async function api(provider, operation, params, { env = process.env, fetcher = fetch } = {}) {
  const hunter = provider === 'hunter', key = env[hunter ? 'HUNTER_API_KEY' : 'BRAVE_SEARCH_API_KEY'];
  if (!key) throw Object.assign(new Error('provider-not-configured'), { safeCode: 'provider-not-configured' });
  if (!['hunter', 'brave'].includes(provider) || hunter && !['email-finder', 'domain-search'].includes(operation) || !hunter && operation !== 'search') throw new Error('Unsupported provider operation');
  const url = new URL(hunter ? 'https://api.hunter.io/v2/' + operation : 'https://api.search.brave.com/res/v1/web/search');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const response = await fetcher(url, { headers: hunter ? { 'X-API-KEY': key } : { 'X-Subscription-Token': key, Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(25000) });
  const retry = response.headers.get('retry-after');
  const retryMs = /^\d+$/.test(retry || '') ? Number(retry) * 1000 : Math.max(0, Date.parse(retry) - Date.now()) || 0;
  if (!response.ok) { await response.body?.cancel(); throw Object.assign(new Error('Provider HTTP ' + response.status), { safeCode: 'provider-http-' + response.status, retryMs, status: response.status }); }
  const chunks = []; let size = 0;
  for await (const chunk of response.body) { size += chunk.length; if (size > 2 * 1024 * 1024) throw Object.assign(new Error('Provider response too large'), { safeCode: 'response-too-large' }); chunks.push(Buffer.from(chunk)); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw Object.assign(new Error('Provider returned malformed JSON'), { safeCode: 'malformed-response' }); }
}
function verification(raw, observedAt) {
  const date = raw?.date || raw?.verifiedAt;
  const stamp = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date + 'T00:00:00+03:00' : date);
  if (!Number.isFinite(stamp) || stamp > observedAt + 300000) return null;
  return { status: normalizeStatus(raw.status), verifiedAt: new Date(stamp).toISOString() };
}
function ingestHunter(registry, businessDomain, data, expectedOwner) {
  const result = { owners: 0, contacts: 0, held: [] }, now = registry.now();
  const list = Array.isArray(data.emails) ? data.emails : data.email ? [{ ...data, value: data.email }] : [];
  if (data.domain && domain(data.domain) !== businessDomain) return { ...result, held: ['provider-company-domain-mismatch'] };
  for (const item of list) {
    const name = [item.first_name, item.last_name].filter(Boolean).join(' ');
    let owner = expectedOwner;
    if (owner && name && personKey(owner.name) !== personKey(name)) { result.held.push('provider-person-mismatch'); continue; }
    if (!owner) {
      if (!decisionMaker(item.position) || !name.includes(' ')) { result.held.push('not-a-named-owner-or-executive'); continue; }
      owner = registry.owner(businessDomain, name, { role: item.position, sourceUrl: 'https://hunter.io/', provenance: 'provider-reported-role-needs-independent-confirmation', provider: 'Hunter' });
      if (owner) result.owners++;
    }
    if (!owner) continue;
    const sources = (item.sources || []).map(s => publicUrl(s.uri)).filter(Boolean);
    const status = data.accept_all || item.accept_all ? 'accept_all' : item.verification?.status;
    const v = verification({ ...(item.verification || {}), status }, now);
    const ok = registry.contact(item.value || item.email, owner.id, { provenance: item.provenance === 'found' ? 'provider-reported-published-address' : 'provider-inferred-address', provider: 'Hunter', sourceUrl: sources[0] || '', sourceUrls: sources, verification: v, roleConfirmed: false });
    if (ok) result.contacts++; else result.held.push('invalid-generic-or-unrelated-email');
  }
  return result;
}
async function providerLookup(registry, provider, operation, params, options) {
  const env = options.env || process.env;
  const credential = env[provider === 'hunter' ? 'HUNTER_API_KEY' : 'BRAVE_SEARCH_API_KEY'];
  if (!credential) return { blocked: 'provider-not-configured' };
  const fingerprint = sha(credential), policyKey = 'provider-cooldown:' + provider;
  const cooldown = registry.db.prepare('SELECT value FROM meta WHERE key=?').get(policyKey);
  if (cooldown) { const policy = JSON.parse(cooldown.value); if (policy.fingerprint === fingerprint && policy.until > registry.now()) return { blocked: 'provider-cooldown', stopProvider: true }; }
  const reserved = registry.reserve(provider, { operation, ...params }, options.maxCalls, options.runId);
  if (reserved.blocked) return reserved;
  if (reserved.cached) return reserved.state === 'complete' ? { data: reserved.payload, cached: true } : { blocked: reserved.state === 'reserved' ? 'previous-request-outcome-uncertain-do-not-rebill' : 'provider-retry-not-due' };
  try {
    const result = await (options.api || api)(provider, operation, params, options);
    registry.complete(reserved.key, provider, result); return { data: result, cached: false };
  } catch (e) {
    const safe = { error: e.safeCode || 'provider-request-failed', status: e.status || null };
    // A lost response may have incurred a charge. Keep its reservation until an
    // operator reconciles it rather than silently billing the same request again.
    if (e.status === 404) { registry.complete(reserved.key, provider, { data: {}, notFound: true }); return { data: { data: {} }, cached: false }; }
    if (e.status) registry.complete(reserved.key, provider, safe, { failed: true, retryMs: e.retryMs || 0 });
    if ([401, 402, 403, 429].includes(e.status)) registry.db.prepare('INSERT OR REPLACE INTO meta VALUES(?,?)').run(policyKey, JSON.stringify({ fingerprint, until: registry.now() + Math.max(e.retryMs || 0, 60000), reason: safe.error }));
    registry.event('lookup-failed', { provider, operation, ...safe });
    return { blocked: safe.error, stopProvider: !e.status || [401, 402, 403, 429, 451].includes(e.status) };
  }
}
async function findEmails(registry, { maxCalls = 0, runId, segment = 'priority_ar_decor', ...options }) {
  const hosts = registry.prioritizedDomains(segment), domains = new Set(hosts.map(b => b.domain));
  const owners = registry.owners().filter(o => domains.has(o.domain) && o.fullNameCandidate && !registry.suppressed(o.domain, o.id));
  const resolvedDomains = new Set(registry.contacts().filter(c => contactVerification(c, registry.now()).status !== 'invalid').map(c => c.domain));
  const verifiedOwners = new Set(registry.contacts().filter(c => contactVerification(c, registry.now()).status === 'valid').map(c => c.ownerId));
  const progress = { attemptedOwners: 0, attemptedDomains: 0, contactObservations: 0, held: [], configured: Boolean((options.env || process.env).HUNTER_API_KEY), maxCalls };
  if (!progress.configured || maxCalls === 0) return progress;
  for (const owner of owners) {
    if (options.signal?.aborted) break;
    if (verifiedOwners.has(owner.id)) continue;
    const lookup = await providerLookup(registry, 'hunter', 'email-finder', { domain: owner.domain, full_name: owner.name, max_duration: 10 }, { ...options, maxCalls, runId });
    if (lookup.blocked === 'provider-http-451') registry.suppress('owner', owner.id, 'provider-processing-opt-out');
    if (lookup.blocked) { progress.held.push(lookup.blocked); if (lookup.stopProvider || lookup.blocked === 'budget-exhausted') return progress; continue; }
    const result = ingestHunter(registry, owner.domain, lookup.data.data || {}, owner); if (result.contacts) resolvedDomains.add(owner.domain); progress.attemptedOwners++; progress.contactObservations += result.contacts;
  }
  for (const b of hosts) {
    if (options.signal?.aborted) break;
    if (resolvedDomains.has(b.domain)) continue;
    const lookup = await providerLookup(registry, 'hunter', 'domain-search', { domain: b.domain, type: 'personal', seniority: 'executive', limit: 10 }, { ...options, maxCalls, runId });
    if (lookup.blocked === 'provider-http-451') registry.suppress('domain', b.domain, 'provider-processing-opt-out');
    if (lookup.blocked) { progress.held.push(lookup.blocked); if (lookup.stopProvider || lookup.blocked === 'budget-exhausted') break; continue; }
    const result = ingestHunter(registry, b.domain, lookup.data.data || {}); if (result.contacts) resolvedDomains.add(b.domain); progress.attemptedDomains++; progress.contactObservations += result.contacts;
  }
  return progress;
}
function importFinder(registry, file, { provider, verifiedAt } = {}) {
  if (!provider || provider.length > 100) throw new Error('Supply the actual finder-provider name');
  const source = registry.snapshot(file), rows = parseCsv(source.data.toString('utf8'));
  const headers = (rows.shift() || []).map(h => h.trim().toLowerCase().replace(/[^a-z0-9]/g, ''));
  const column = names => headers.findIndex(h => names.includes(h));
  const nameCol = column(['ownername', 'fullname', 'name']), domainCol = column(['domain', 'companydomain', 'website']), emailCol = column(['email', 'emailaddress']);
  if ([nameCol, domainCol, emailCol].some(i => i < 0)) throw new Error('Finder CSV needs owner_name/full_name, domain and email columns');
  const statusCol = column(['status', 'verificationstatus', 'emailstatus']), dateCol = column(['verifiedat', 'verificationdate']), sourceCol = column(['sourceurl', 'emailsourceurl']);
  const staged = [], held = [];
  for (const row of rows) {
    const host = domain(row[domainCol]), owner = registry.findOwner(host, row[nameCol]);
    const address = email(row[emailCol]);
    if (!owner || !address) { held.push({ reason: owner ? 'invalid-or-generic-email' : 'unknown-owner-domain-pair' }); continue; }
    const v = verification({ status: row[statusCol] || 'unknown', date: row[dateCol] || verifiedAt }, registry.now());
    staged.push({ address, owner, evidence: { provider, provenance: 'finder-reported-association-needs-review', sourceUrl: publicUrl(row[sourceCol] || ''), reportSha256: source.hash, verification: v } });
  }
  registry.db.exec('BEGIN');
  try {
    let imported = 0; for (const row of staged) if (registry.contact(row.address, row.owner.id, row.evidence)) imported++; else held.push({ reason: 'email-domain-does-not-match-owner-business' });
    registry.event('finder-import', { provider, reportSha256: source.hash, imported, held }); registry.db.exec('COMMIT'); return { imported, held, reportSha256: source.hash, sendApproved: 0 };
  } catch (e) { registry.db.exec('ROLLBACK'); throw e; }
}
function importVerification(registry, file, { provider, verifiedAt } = {}) {
  if (!provider || provider.length > 100) throw new Error('Supply the actual verifier-provider name');
  const source = registry.snapshot(file), rows = parseCsv(source.data.toString('utf8'));
  const headers = (rows.shift() || []).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const e = headers.findIndex(h => ['email', 'emailaddress'].includes(h)), s = headers.findIndex(h => ['status', 'result', 'verificationstatus'].includes(h));
  if (e < 0 || s < 0) throw new Error('Verification CSV needs email and status/result');
  if (!verification({ date: verifiedAt, status: 'unknown' }, registry.now())) throw new Error('Supply the actual verification date, not a future date');
  let matched = 0, unmatched = 0;
  registry.db.exec('BEGIN');
  try {
    const contacts = registry.contacts();
    for (const row of rows) {
      const list = contacts.filter(c => c.email === String(row[e]).trim().toLowerCase());
      if (!list.length) { unmatched++; continue; }
      for (const c of list) { registry.contact(c.email, c.ownerId, { provider, provenance: 'external-mailbox-verification-not-owner-proof', reportSha256: source.hash, verification: verification({ date: verifiedAt, status: row[s] }, registry.now()) }); matched++; }
    }
    registry.event('verification-import', { provider, reportSha256: source.hash, matched, unmatched }); registry.db.exec('COMMIT'); return { matched, unmatched, sendApproved: 0 };
  } catch (error) { registry.db.exec('ROLLBACK'); throw error; }
}
module.exports = { api, verification, ingestHunter, providerLookup, findEmails, importFinder, importVerification, ROLE, decisionMaker };
