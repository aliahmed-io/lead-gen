'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { DatabaseSync } = require('node:sqlite');
const { createEngine, eligibleLead, host, sha, csv } = require('../runtime/master-research');
const VERSION = 'owner-research-v1';
function arg(name, fallback) { const v = process.argv.find(s => s.startsWith('--' + name + '=')); return v ? v.slice(name.length + 3) : fallback; }
const input = path.resolve(arg('input', 'D:/leadgen/MASTER_LEADS_2026-10-26.json'));
const appRoot = path.resolve(arg('app-root', path.join(__dirname, '..')));
const output = path.resolve(arg('output', path.join(process.cwd(), 'research-working', 'furniture-' + new Date().toISOString().replace(/[:.]/g, '-'))));
const concurrency = Number(arg('concurrency', '10'));
const limit = Number(arg('limit', '2181'));
const maxPages = Number(arg('pages', '8'));
const siteTimeoutMs = Number(arg('timeout-ms', '45000'));
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16) throw new Error('Concurrency must be 1–16');
if (!Number.isInteger(limit) || limit < 1 || limit > 10000) throw new Error('Limit must be 1–10000');
if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 12) throw new Error('Pages must be 1–12');
if (!Number.isInteger(siteTimeoutMs) || siteTimeoutMs < 5000 || siteTimeoutMs > 120000) throw new Error('Timeout must be 5000–120000 ms');
fs.mkdirSync(output, { recursive: true });
const source = fs.readFileSync(input);
const sourceHash = sha(source);
const snapshot = path.join(output, 'source-master.copy.json');
if (!fs.existsSync(snapshot)) fs.writeFileSync(snapshot, source, { flag: 'wx' });
else if (sha(fs.readFileSync(snapshot)) !== sourceHash) throw new Error('Snapshot mismatch: use a new output folder; no source file was changed');
const master = JSON.parse(source);
const appRequire = createRequire(path.join(appRoot, 'package.json'));
const network = appRequire('./runtime/network');
const verification = appRequire('./runtime/verification');
const chainDomains = appRequire('./runtime/chain-domains');
const engine = createEngine({ cheerio: appRequire('cheerio'), network, verification, chainDomains });
const db = new DatabaseSync(path.join(output, 'research-working.sqlite'));
db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sites (domain TEXT PRIMARY KEY,result TEXT NOT NULL,completed_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS businesses (id TEXT PRIMARY KEY,result TEXT NOT NULL);');
const getMeta = db.prepare('SELECT value FROM meta WHERE key=?');
const previousHash = getMeta.get('sourceSha256')?.value;
if (previousHash && previousHash !== sourceHash) throw new Error('Input changed: use a new output folder');
if (getMeta.get('version')?.value && getMeta.get('version').value !== VERSION) throw new Error('Research version changed: use a new output folder');
const setMeta = db.prepare('INSERT OR REPLACE INTO meta(key,value) VALUES(?,?)');
setMeta.run('sourceSha256', sourceHash); setMeta.run('version', VERSION);
const saveSite = db.prepare('INSERT OR REPLACE INTO sites(domain,result,completed_at) VALUES(?,?,?)');
const getSite = db.prepare('SELECT result FROM sites WHERE domain=?');
const saveBusiness = db.prepare('INSERT OR REPLACE INTO businesses(id,result) VALUES(?,?)');
const selected = Object.values(master.businesses).filter(eligibleLead).sort((a, b) => {
  const score = value => (value.platforms || []).some(p => /shopify|woocommerce|magento|bigcommerce/i.test(p)) * 10 + /united states|usa|^us$/i.test(value.country || '') * 2;
  return score(b) - score(a) || a.id.localeCompare(b.id);
}).slice(0, limit);
const groups = new Map();
const emptySite = (website, status) => ({ website, domain: host(website), status, checkedAt: new Date().toISOString(), pages: [], errors: [], owners: [], contacts: [], sizeFacts: [], commerce: [], niche: [], platforms: [] });
for (const b of selected) {
  const d = host(b.website);
  if (!d || chainDomains.some(c => d === c || d.endsWith('.' + c))) {
    saveBusiness.run(b.id, JSON.stringify(engine.assessBusiness(b, emptySite(b.website, d ? 'excluded-known-chain' : 'no-public-website'))));
    continue;
  }
  if (!groups.has(d)) {
    let website = b.website;
    try { website = new URL(/^https?:\/\//i.test(website) ? website : 'https://' + website).origin + '/'; } catch { /* Crawler will record invalid source. */ }
    groups.set(d, { domain: d, website, businesses: [] });
  }
  groups.get(d).businesses.push(b);
}
const retry = process.argv.includes('--retry-failed');
const retryTransient = process.argv.includes('--retry-transient');
const exportOnly = process.argv.includes('--export-only');
const jobs = [...groups.values()];
let cursor = 0, visited = 0, cached = 0, active = 0, stopping = false;
const abort = new AbortController();
process.on('SIGINT', () => { stopping = true; abort.abort(); });
process.on('SIGTERM', () => { stopping = true; abort.abort(); });
function progress() {
  const counts = { version: VERSION, updatedAt: new Date().toISOString(), input, sourceSha256: sourceHash, selectedBusinesses: selected.length, uniqueWebsiteJobs: jobs.length, websiteJobsCompletedThisInvocation: visited, cachedJobs: cached, activeJobs: active, remainingJobs: Math.max(0, jobs.length - visited), businessResultsSaved: db.prepare('SELECT count(*) AS n FROM businesses').get().n, campaignsChanged: false, emailsSent: 0, paidVerificationPerformed: false };
  fs.writeFileSync(path.join(output, 'progress.json'), JSON.stringify(counts, null, 2));
  console.log(JSON.stringify(counts));
}
async function work() {
  while (cursor < jobs.length && !stopping) {
    const job = jobs[cursor++]; active++;
    try {
      let saved = getSite.get(job.domain); let site = saved && JSON.parse(saved.result);
      const failed = site && !site.pages?.some(p => !p.blocked && !p.parked);
      const transient = failed && site.errors?.some(e => /timed?\s*out|deadline exceeded|ECONNRESET|EAI_AGAIN|ETIMEDOUT|HTTP 50[0234]/i.test(e.reason || ''));
      if (!site || retry && failed || retryTransient && transient) {
        if (exportOnly) continue;
        site = await engine.crawlSite(job.website, { maxPages, timeoutMs: siteTimeoutMs, signal: abort.signal });
        saveSite.run(job.domain, JSON.stringify(site), new Date().toISOString());
      } else cached++;
      for (const b of job.businesses) saveBusiness.run(b.id, JSON.stringify(engine.assessBusiness(b, site)));
    } catch (e) {
      // Preserve failures as explicit unknowns, not a completed successful research result.
      const site = { ...emptySite(job.website, 'research-error'), errors: [{ reason: String(e.message).slice(0, 200) }] };
      saveSite.run(job.domain, JSON.stringify(site), new Date().toISOString());
      for (const b of job.businesses) saveBusiness.run(b.id, JSON.stringify(engine.assessBusiness(b, site)));
    } finally { active--; visited++; if (visited % 25 === 0) progress(); }
  }
}
async function exportResults() {
  const selectedIds = new Set(selected.map(b => b.id));
  const businesses = db.prepare('SELECT result FROM businesses').all().map(r => JSON.parse(r.result)).filter(b => selectedIds.has(b.businessId));
  const candidates = new Map();
  for (const b of businesses) for (const c of b.contacts) {
    if (!c.ownerBinding || c.department || b.excludedReasons.length) continue;
    if (!candidates.has(c.email)) candidates.set(c.email, { ...c, businessIds: [], businesses: [], websites: [], evidenceTier: c.evidenceTier, sourceEvidence: [] });
    const item = candidates.get(c.email);
    item.businessIds.push(b.businessId); item.businesses.push(b.name); item.websites.push(b.website);
    item.sourceEvidence.push({ businessId: b.businessId, owner: c.ownerBinding.name, ownerSourceUrl: c.ownerBinding.sourceUrl, emailSourceUrl: c.sourceUrl, snippet: c.snippet, ownerEvidence: c.ownerBinding.snippet, kind: c.ownerBinding.kind, tier: c.evidenceTier });
    if (c.evidenceTier === 'published-owner-email-candidate') item.evidenceTier = c.evidenceTier;
  }
  const allCandidates = [...candidates.values()];
  for (const c of allCandidates) {
    const names = [...new Set(c.sourceEvidence.map(e => e.owner.toLowerCase()))];
    if (names.length > 1) { c.evidenceTier = 'owner-email-needs-review'; c.conflictingOwnerNames = names; }
  }
  let mxCursor = 0;
  await Promise.all(Array.from({ length: 8 }, async () => { while (mxCursor < allCandidates.length) { const c = allCandidates[mxCursor++]; c.freeMailRoutingCheck = await engine.domainMail(c.email); } }));
  const priority = allCandidates.filter(c => c.evidenceTier === 'published-owner-email-candidate' && c.freeMailRoutingCheck.status === 'mail-routing-found');
  const review = allCandidates.filter(c => !priority.includes(c));
  const out = path.join(output, 'exports-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + process.pid);
  fs.mkdirSync(out, { recursive: false });
  const write = (name, data) => fs.writeFileSync(path.join(out, name), data, { flag: 'wx' });
  const evidenceHeaders = ['email', 'owner_name', 'business_names', 'business_ids', 'websites', 'evidence_tier', 'email_source_url', 'owner_source_url', 'evidence_excerpt', 'free_dns_check', 'paid_verification', 'current_ownership_confirmed', 'send_approved'];
  const rows = items => items.map(c => [c.email, c.ownerBinding.name, [...new Set(c.businesses)], [...new Set(c.businessIds)], [...new Set(c.websites)], c.evidenceTier, c.sourceUrl, c.ownerBinding.sourceUrl, c.snippet, c.freeMailRoutingCheck.status, 'not-performed', 'no', 'no']);
  write('01-owner-candidates-for-paid-verification.csv', csv(['email'], priority.map(c => [c.email])));
  write('02-owner-candidate-evidence.csv', csv(evidenceHeaders, rows(priority)));
  write('03-owner-candidates-needing-review.csv', csv(evidenceHeaders, rows(review)));
  write('04-business-research.csv', csv(['business_id', 'name', 'website', 'country', 'city', 'website_status', 'ecommerce_evidence', 'niche_evidence', 'identity_title_match', 'published_owner_candidates', 'published_email_candidates', 'exclusion_reasons', 'next_actions', 'send_approved'], businesses.map(b => [b.businessId, b.name, b.website, b.country, b.city, b.websiteStatus, b.ecommerceEvidenceFound, b.nicheEvidenceFound, b.identityTitleMatch, b.owners.map(o => o.name), b.contacts.map(c => c.email), b.excludedReasons, b.followUpNeeded, 'no'])));
  write('05-research-results.json', JSON.stringify({ version: VERSION, generatedAt: new Date().toISOString(), source: { path: input, sha256: sourceHash, preserved: true }, businesses, ownerCandidates: allCandidates, note: 'Published evidence candidates only. No paid mailbox verification, no current-owner approval, no campaign enrolment, no email sent.' }, null, 2));
  const finderRows = businesses.filter(b => !b.excludedReasons.length && b.ecommerceEvidenceFound && b.nicheEvidenceFound).flatMap(b => b.owners.filter(o => !o.historical && !b.contacts.some(c => c.evidenceTier === 'published-owner-email-candidate' && c.ownerBinding?.name === o.name)).map(o => [o.name, b.siteDomain, b.name, b.businessId, o.role, o.sourceUrl, o.snippet, b.country, b.city]));
  const uniqueFinderRows = [...new Map(finderRows.map(r => [r[0].toLowerCase() + ':' + r[1], r])).values()];
  write('06-owner-email-finder-requests.csv', csv(['owner_name', 'domain', 'business', 'business_id', 'published_role', 'owner_source_url', 'owner_evidence', 'country', 'city'], uniqueFinderRows));
  write('07-missing-owner-research-queue.csv', csv(['business_id', 'business', 'website', 'next_actions', 'suggested_public_search'], businesses.filter(b => !b.excludedReasons.length && !b.owners.some(o => !o.historical)).map(b => [b.businessId, b.name, b.website, b.followUpNeeded, 'https://www.google.com/search?q=' + encodeURIComponent('"' + b.siteDomain + '" owner founder contact')])));
  const count = predicate => businesses.filter(predicate).length;
  const summary = { version: VERSION, generatedAt: new Date().toISOString(), input, inputSha256: sourceHash, snapshot, output: out, selectedBusinesses: selected.length, processedBusinesses: businesses.length, uniqueWebsites: jobs.length, accessibleBusinesses: count(b => ['researched', 'partial-time-limit'].includes(b.websiteStatus)), businessesWithEcommerceEvidence: count(b => b.ecommerceEvidenceFound && !b.excludedReasons.length), businessesWithEcommerceAndNicheEvidence: count(b => b.ecommerceEvidenceFound && b.nicheEvidenceFound && !b.excludedReasons.length), excludedBusinesses: count(b => b.excludedReasons.length), businessesWithPublishedOwnerNames: count(b => b.owners.length && !b.excludedReasons.length), ownerEmailCandidatesUnique: allCandidates.length, priorityEmailsForPaidVerification: priority.length, ownerEmailsNeedingReview: review.length, ownerEmailFinderRequests: uniqueFinderRows.length, sendApproved: 0, emailsSent: 0, originalInputUnchanged: sha(fs.readFileSync(input)) === sourceHash, status: businesses.length === selected.length && !stopping ? 'completed' : 'partial', websiteStatusCounts: Object.fromEntries([...new Set(businesses.map(b => b.websiteStatus))].map(s => [s, count(b => b.websiteStatus === s)])) };
  if (!summary.originalInputUnchanged) throw new Error('Original source hash changed externally during research; inspect before using exports');
  write('SUMMARY.json', JSON.stringify(summary, null, 2));
  write('READ-ME.txt', [
    'OWNER CONTACT RESEARCH — ' + summary.generatedAt,
    'Original lead files were read only. A complete source snapshot and SHA-256 are retained.',
    'Upload 01-owner-candidates-for-paid-verification.csv to your chosen verifier.',
    '02 includes the public source URLs, owner-name evidence and email evidence for that list.',
    '03 needs owner/business/email review; do not bulk-send or pay to verify it blindly.',
    '04 accounts for every processed business, including excluded and unavailable websites.',
    '05 retains full structured findings; the SQLite checkpoint also retains page evidence and errors.',
    '06 contains published owner names and domains for an optional email finder where a direct address remains missing.',
    '07 lists businesses where additional public research is needed to identify an owner.',
    'A published founder can be a former owner. Confirm present ownership, business independence and size before approval.',
    'DNS/MX only establishes domain mail routing; it does NOT verify an individual mailbox.',
    'Paid valid results alone must NOT approve a contact for sending. Unknown/catch-all results stay held.',
    'No mailbox credentials were read. No verifier was charged. No campaigns were changed. No emails were sent.',
    'Resume the same command with the same --output to reuse successful research. Add --retry-failed for inaccessible sites.',
    'Every export writes to a new timestamped folder; previous exported lead lists remain intact.',
  ].join('\r\n'));
  console.log(JSON.stringify(summary));
}
async function main() {
  progress(); const ticker = setInterval(progress, 30000); ticker.unref();
  try { await Promise.all(Array.from({ length: concurrency }, work)); await exportResults(); }
  finally { clearInterval(ticker); db.close(); }
}
main().catch(e => { console.error(String(e.message)); process.exitCode = 1; });
