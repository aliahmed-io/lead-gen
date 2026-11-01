'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path'); const os = require('node:os');
const { Registry, contactVerification } = require('../runtime/enrichment/registry');
const { classify, DAY } = require('../runtime/enrichment/segments');
const { domain, sha } = require('../runtime/enrichment/common');
const { importFinder, importVerification, providerLookup, ingestHunter, findEmails, api, decisionMaker } = require('../runtime/enrichment/providers');
const { discover } = require('../runtime/enrichment/discovery');
const { screenNewBusiness } = require('../runtime/enrichment/screen');
const NOW = Date.parse('2026-10-28T08:00:00Z');
const furniture = { ecommerce: 'confirmed', niche: 'confirmed', sampleProducts: ['Oak dining table', 'Velvet sofa', 'Sideboard'], evidence: ['Published catalogue'] };
function fixture(count = 1) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leadgen-enrichment-'));
  const registry = new Registry(path.join(dir, 'working'), { now: () => NOW });
  const businesses = Object.fromEntries(Array.from({ length: count }, (_, i) => [i, { id: String(i), name: 'Oak ' + i, website: 'https://oak' + i + '.example', country: 'US', city: 'City', emails: [] }]));
  const source = path.join(dir, 'original-master.json'); fs.writeFileSync(source, JSON.stringify({ businesses }));
  const proof = path.join(dir, 'evidence.json'); fs.writeFileSync(proof, JSON.stringify(Object.values(businesses).map(b => ({ businessId: b.id, website: b.website, commerce: furniture, owners: [], candidates: [] }))));
  registry.intake(source, proof);
  const owner = registry.owner('oak0.example', 'Jane Smith', { role: 'Owner', sourceUrl: 'https://oak0.example/about', snippet: 'Jane Smith, Owner' });
  return { dir, registry, source, proof, owner };
}
test('classification prioritizes furniture placement and keeps other ecommerce for later', () => {
  assert.equal(classify({}, { commerce: furniture }, NOW).segment, 'priority_ar_decor');
  assert.equal(classify({}, { commerce: { ecommerce: 'confirmed', niche: 'off-topic', sampleProducts: ['Watches'] } }, NOW).segment, 'later_ecommerce');
  assert.ok(classify({}, { commerce: furniture }, NOW).arFitScore > classify({}, { commerce: { ...furniture, sampleProducts: ['Mirror'] } }, NOW).arFitScore);
});
test('no cart, blocked pages, catalog-only and platform tags never create a permanent exclusion', () => {
  for (const state of ['blocked', 'timeout', 'robots-disallowed', 'done']) assert.equal(classify({ platforms: ['Shopify'] }, { state, commerce: { ecommerce: 'catalog-only' } }, NOW).segment, 'research_needed');
});
test('explicit same-business no-online-sales evidence expires and conflicting commerce stays a store', () => {
  const b = { website: 'https://oak.example', nonEcommerceEvidence: { explicit: true, sourceUrl: 'https://oak.example/faq', snippet: 'We do not sell online.' } };
  const negative = classify(b, {}, NOW); assert.equal(negative.segment, 'ignore_non_ecommerce'); assert.equal(negative.recheckAt, NOW + 90 * DAY);
  assert.equal(classify(b, { commerce: furniture }, NOW).segment, 'priority_ar_decor');
  b.nonEcommerceEvidence.sourceUrl = 'https://other.example'; assert.equal(classify(b, {}, NOW).segment, 'research_needed');
});
test('canonical domains reject credentials, private addresses and malformed input', () => {
  assert.equal(domain('https://www.OAK.example/shop'), 'oak.example');
  for (const s of ['https://user:pass@oak.example', 'http://127.0.0.1', 'https://oak.example:9999', 'file:///tmp/a']) assert.equal(domain(s), '');
});
test('10k-business intake is resumable, deduplicates domains and preserves original bytes', () => {
  const f = fixture(10000), before = sha(fs.readFileSync(f.source));
  f.registry.intake(f.source, f.proof);
  assert.equal(f.registry.stats().businesses, 10000); assert.equal(f.registry.stats().uniqueDomains, 10000);
  assert.equal(f.registry.prioritizedDomains().length, 10000);
  assert.equal(sha(fs.readFileSync(f.source)), before); assert.equal(f.registry.screen('https://www.oak0.example').skip, true);
  assert.equal(f.registry.screen('oak0.example', { mode: 'research' }).skip, false); f.registry.close();
});
test('generated fixtures cannot poison a real business or suppress future discovery', () => {
  const f = fixture(); const data = JSON.parse(fs.readFileSync(f.source)); data.businesses.fake = { ...data.businesses[0], id: 'fake', dataQuality: { suspectedGenerated: true } };
  const copy = path.join(f.dir, 'source-with-fixture.copy.json'); fs.writeFileSync(copy, JSON.stringify(data)); f.registry.intake(copy);
  assert.equal(f.registry.stats().businesses, 2); assert.equal(f.registry.prioritizedDomains().length, 1); f.registry.close();
});
test('CSV finder imports match exact known owners, retain provenance and never approve sending', () => {
  const f = fixture(), report = path.join(f.dir, 'finder.csv');
  fs.writeFileSync(report, 'owner_name,domain,email,status,verified_at\nJane Smith,oak0.example,jane@oak0.example,valid,2026-10-28\nJohn Employee,oak0.example,john@oak0.example,valid,2026-10-28\nJane Smith,oak0.example,jane@unrelated.example,valid,2026-10-28');
  const before = sha(fs.readFileSync(report)); const r = importFinder(f.registry, report, { provider: 'Fixture finder' });
  assert.equal(r.imported, 1); assert.equal(r.held.length, 2); assert.equal(sha(fs.readFileSync(report)), before);
  const c = f.registry.contacts()[0]; assert.equal(c.sendApproved, false); assert.equal(contactVerification(c, NOW).status, 'valid');
  importFinder(f.registry, report, { provider: 'Fixture finder' }); assert.equal(f.registry.contacts()[0].evidence.length, 1); f.registry.close();
});
test('verification conflicts, catch-alls, future and stale dates stay held; unmatched addresses are retained in counts', () => {
  const f = fixture(), report = path.join(f.dir, 'verify.csv');
  f.registry.contact('jane@oak0.example', f.owner.id, { provenance: 'inferred', verification: { status: 'valid', verifiedAt: '2026-10-28T00:00:00Z' } });
  fs.writeFileSync(report, 'email,status\njane@oak0.example,invalid\nstranger@oak0.example,valid');
  const r = importVerification(f.registry, report, { provider: 'Verifier', verifiedAt: '2026-10-28' }); assert.equal(r.unmatched, 1);
  assert.equal(contactVerification(f.registry.contacts()[0], NOW).status, 'conflict');
  assert.throws(() => importVerification(f.registry, report, { provider: 'Verifier', verifiedAt: '2099-01-01' }));
  assert.equal(contactVerification({ evidence: [{ verification: { status: 'valid', verifiedAt: '2025-01-01' } }] }, NOW).status, 'unverified'); f.registry.close();
});
test('durable provider cache is order-independent and budgets stop calls before spending', async () => {
  const f = fixture(); let calls = 0;
  const opts = { env: { HUNTER_API_KEY: 'fixture-key' }, maxCalls: 1, runId: 'run', api: async () => { calls++; return { data: {} }; } };
  await providerLookup(f.registry, 'hunter', 'email-finder', { domain: 'oak0.example', full_name: 'Jane Smith' }, opts);
  const cached = await providerLookup(f.registry, 'hunter', 'email-finder', { full_name: 'Jane Smith', domain: 'oak0.example' }, opts);
  assert.equal(cached.cached, true); assert.equal(calls, 1);
  const blocked = await providerLookup(f.registry, 'hunter', 'domain-search', { domain: 'oak0.example' }, opts); assert.equal(blocked.blocked, 'budget-exhausted'); f.registry.close();
});
test('an uncertain charged request is not automatically submitted again after a timeout', async () => {
  const f = fixture(); let calls = 0;
  const opts = { env: { HUNTER_API_KEY: 'secret-fixture-key' }, maxCalls: 10, runId: 'run', api: async () => { calls++; throw new Error('secret-fixture-key network failed'); } };
  await providerLookup(f.registry, 'hunter', 'email-finder', { domain: 'oak0.example' }, opts);
  const again = await providerLookup(f.registry, 'hunter', 'email-finder', { domain: 'oak0.example' }, { ...opts, runId: 'new-run' });
  assert.equal(calls, 1); assert.match(again.blocked, /uncertain/);
  assert.ok(!JSON.stringify(f.registry.db.prepare('SELECT * FROM events').all()).includes('secret-fixture-key')); f.registry.close();
});
test('provider rate limits pause different requests and later runs until Retry-After passes', async () => {
  const f = fixture(); let calls = 0;
  const opts = { env: { HUNTER_API_KEY: 'fixture' }, maxCalls: 10, runId: 'limited', api: async () => { calls++; throw Object.assign(new Error('limited'), { status: 429, safeCode: 'provider-http-429', retryMs: 300000 }); } };
  await providerLookup(f.registry, 'hunter', 'email-finder', { domain: 'oak0.example', full_name: 'Jane Smith' }, opts);
  const held = await providerLookup(f.registry, 'hunter', 'domain-search', { domain: 'other.example' }, { ...opts, runId: 'later' });
  assert.equal(held.blocked, 'provider-cooldown'); assert.equal(calls, 1); f.registry.close();
});
test('explicit non-ecommerce exclusions allow research again after their recheck date', () => {
  const f = fixture(); const classification = classify({ website: 'https://oak0.example', nonEcommerceEvidence: { explicit: true, sourceUrl: 'https://oak0.example/faq', snippet: 'We do not sell online.' } }, {}, NOW);
  f.registry.db.prepare('UPDATE businesses SET classification=?').run(JSON.stringify(classification));
  assert.equal(f.registry.screen('oak0.example', { mode: 'research' }).skip, true);
  f.registry.now = () => NOW + 91 * DAY;
  assert.equal(f.registry.screen('oak0.example', { mode: 'research' }).skip, false);
  assert.equal(screenNewBusiness({ website: 'https://oak0.example' }, { folder: f.registry.folder, now: NOW + 91 * DAY, mode: 'research' }).skip, false); f.registry.close();
});
test('provider matching rejects wrong people, unrelated companies, generic inboxes and ordinary staff', () => {
  const f = fixture();
  assert.equal(ingestHunter(f.registry, 'oak0.example', { domain: 'wrong.example', email: 'jane@oak0.example' }, f.owner).contacts, 0);
  assert.equal(ingestHunter(f.registry, 'oak0.example', { email: 'jane@oak0.example', first_name: 'Other', last_name: 'Person' }, f.owner).contacts, 0);
  assert.equal(ingestHunter(f.registry, 'oak0.example', { emails: [{ value: 'bob@oak0.example', first_name: 'Bob', last_name: 'Jones', position: 'Sales associate' }] }).owners, 0);
  assert.equal(ingestHunter(f.registry, 'oak0.example', { email: 'info@oak0.example' }, f.owner).contacts, 0); f.registry.close();
});
test('provider-inferred addresses remain inferred even when their mailbox is valid', () => {
  const f = fixture(); ingestHunter(f.registry, 'oak0.example', { email: 'jane@oak0.example', provenance: 'inferred', verification: { status: 'valid', date: '2026-10-28' } }, f.owner);
  const c = f.registry.contacts()[0]; assert.equal(c.evidence[0].provenance, 'provider-inferred-address'); assert.equal(c.sendApproved, false); f.registry.close();
});
test('product owners, assistant executives and vice presidents are not treated as business owners', () => {
  for (const role of ['Product Owner', 'Vice President of Sales', 'Assistant to CEO']) assert.equal(decisionMaker(role), false);
  for (const role of ['Owner', 'Co-Founder', 'CEO', 'President', 'Founder and Product Owner']) assert.equal(decisionMaker(role), true);
  const f = fixture(); assert.equal(f.registry.owner('oak0.example', 'John Employee', { role: 'Product Owner', sourceUrl: 'https://oak0.example/team' }), null); f.registry.close();
});
test('a failed named-person finder falls back to executive domain discovery within the shared budget', async () => {
  const f = fixture(); const operations = [];
  const result = await findEmails(f.registry, { maxCalls: 2, runId: 'fallback', env: { HUNTER_API_KEY: 'fixture' }, api: async (_p, operation) => {
    operations.push(operation); return operation === 'email-finder' ? { data: {} } : { data: { domain: 'oak0.example', emails: [{ first_name: 'Sam', last_name: 'Lee', position: 'Co-Founder', value: 'sam@oak0.example' }] } };
  } });
  assert.deepEqual(operations, ['email-finder', 'domain-search']); assert.equal(result.contactObservations, 1); assert.ok(f.registry.findOwner('oak0.example', 'Sam Lee')); f.registry.close();
});
test('no configured key or zero budget performs no provider request', async () => {
  const f = fixture(); let calls = 0;
  await findEmails(f.registry, { maxCalls: 10, runId: 'x', env: {}, api: async () => { calls++; } });
  await findEmails(f.registry, { maxCalls: 0, runId: 'x', env: { HUNTER_API_KEY: 'fixture' }, api: async () => { calls++; } });
  assert.equal(calls, 0); f.registry.close();
});
test('provider processing opt-outs suppress future lookups and contact exports', async () => {
  const f = fixture(); f.registry.contact('jane@oak0.example', f.owner.id, { provenance: 'inferred' });
  await findEmails(f.registry, { maxCalls: 1, runId: 'privacy', env: { HUNTER_API_KEY: 'fixture' }, api: async () => { throw Object.assign(new Error('opt-out'), { status: 451, safeCode: 'provider-http-451' }); } });
  assert.equal(f.registry.findOwner('oak0.example', 'Jane Smith'), null);
  assert.equal(f.registry.export().distinctEmailsForMailboxChecking, 0); f.registry.close();
});
test('repeated discovery batches advance past cached domains instead of reselecting the first batch', async () => {
  const f = fixture(2); let crawls = 0;
  const engine = { crawlSite: async () => { crawls++; return { pages: [], errors: [], status: 'unavailable' }; }, assessBusiness: () => ({ owners: [], contacts: [] }) };
  const options = { limit: 1, engine, fetcher: async () => ({ status: 404, headers: {}, text: '' }), env: {} };
  await discover(f.registry, options); await discover(f.registry, options); assert.equal(crawls, 2); f.registry.close();
});
test('enabling a configured search provider upgrades a cached free research pass immediately', async () => {
  const f = fixture(); let crawls = 0, searches = 0;
  const engine = { crawlSite: async () => { crawls++; return { pages: [{url:'https://oak0.example/about'}], errors: [], status: 'researched' }; }, assessBusiness: () => ({ owners: [], contacts: [] }) };
  const shared = { limit: 1, engine, fetcher: async () => ({ status: 404, headers: {}, text: '' }) };
  await discover(f.registry, { ...shared, env: {} });
  await discover(f.registry, { ...shared, env: { BRAVE_SEARCH_API_KEY: 'fixture' }, maxSearchCalls: 1, api: async () => { searches++; return { web: { results: [{url:'https://oak0.example/about'}] } }; } });
  assert.equal(crawls, 2); assert.equal(searches, 1); f.registry.close();
});
test('reimporting the same classification evidence does not renew its freshness', () => {
  const f = fixture(); const first = f.registry.businesses()[0].classification.checkedAt;
  f.registry.now = () => NOW + 2 * DAY; f.registry.intake(f.source, f.proof);
  assert.equal(f.registry.businesses()[0].classification.checkedAt, first); f.registry.close();
});
test('public owner research honors robots, resumes from cache and never calls paid APIs by default', async () => {
  const f = fixture(); let crawls = 0;
  const engine = { crawlSite: async () => { crawls++; return { pages: [{ url: 'https://oak0.example/about' }], errors: [], status: 'researched' }; }, assessBusiness: () => ({ owners: [{ name: 'Sam Lee', role: 'Founder', sourceUrl: 'https://oak0.example/about', snippet: 'Sam Lee, Founder' }], contacts: [] }) };
  const fetcher = async () => ({ status: 404, headers: {}, text: '' });
  await discover(f.registry, { limit: 1, engine, fetcher, env: {} }); await discover(f.registry, { limit: 1, engine, fetcher, env: {} });
  assert.equal(crawls, 1); assert.ok(f.registry.findOwner('oak0.example', 'Sam Lee')); assert.equal(f.registry.db.prepare("SELECT count(*) n FROM events WHERE type='lookup-reserved'").get().n, 0); f.registry.close();
});
test('scraper screening is read-only, preserves unknowns for research and handles a missing registry', () => {
  const f = fixture();
  assert.equal(screenNewBusiness({ website: 'https://www.oak0.example' }, { folder: f.registry.folder, now: NOW }).skip, true);
  assert.equal(screenNewBusiness({ website: 'https://oak0.example' }, { folder: f.registry.folder, now: NOW, mode: 'research' }).skip, false);
  assert.equal(screenNewBusiness({ website: 'https://new.example' }, { folder: path.join(f.dir, 'not-created') }).skip, false); f.registry.close();
});
test('writer lease prevents two enrichment jobs from racing on the same registry', async () => {
  const f = fixture(), second = new Registry(f.registry.folder, { now: () => NOW });
  await f.registry.exclusive(async () => assert.rejects(second.exclusive(async () => {}), /Another enrichment writer/)); second.close(); f.registry.close();
});
test('exports deduplicate verification uploads and preserve all businesses without approving recipients', () => {
  const f = fixture(); f.registry.contact('jane@oak0.example', f.owner.id, { provenance: 'inferred', verification: null });
  const a = f.registry.export(), b = f.registry.export(); assert.notEqual(a.output, b.output); assert.equal(a.distinctEmailsForMailboxChecking, 1);
  assert.equal(a.sendApproved, 0); assert.equal(a.businesses, 1); assert.match(fs.readFileSync(path.join(a.output, 'owner-contact-review.csv'), 'utf8'), /"no"/); f.registry.close();
});
test('API keys stay in headers and redirecting provider requests is disabled', async () => {
  let options, requestUrl;
  await api('hunter', 'email-finder', { domain: 'oak0.example' }, { env: { HUNTER_API_KEY: 'secret-fixture-key' }, fetcher: async (url, opts) => { options = opts; requestUrl = url.href; return new globalThis.Response(JSON.stringify({ data: {} }), { status: 200 }); } });
  assert.equal(options.headers['X-API-KEY'], 'secret-fixture-key'); assert.ok(!requestUrl.includes('secret-fixture-key')); assert.equal(options.redirect, 'error');
});

test('an upgraded registry does not renew archived classification evidence',()=>{
 const f=fixture();const before=f.registry.businesses()[0].classification.checkedAt;const folder=f.registry.folder;
 f.registry.db.exec('DELETE FROM source_observations');f.registry.close();
 const upgraded=new Registry(folder,{now:()=>NOW+2*DAY});upgraded.intake(f.source,f.proof);
 assert.equal(upgraded.businesses()[0].classification.checkedAt,before);upgraded.close();
});
