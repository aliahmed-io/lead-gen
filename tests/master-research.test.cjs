'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const req = createRequire('D:/leadgen/package.json');
const { createEngine, eligibleLead, ownerNames, robotsRules, robotsAllows, csv } = require('../runtime/master-research');
const deps = { cheerio: req('cheerio'), network: req('./runtime/network'), verification: req('./runtime/verification'), chainDomains: ['bigchain.com'] };
const engine = createEngine(deps);
const page = body => '<html><head><title>Oak Studio Furniture</title></head><body>' + body + '</body></html>';
const shopping = '<h1>Oak Studio Furniture</h1><p>Shop our handmade furniture, sofas and dining tables.</p><button>Add to cart</button>';
const lead = { id: 'business-test', name: 'Oak Studio', website: 'https://oakstudio.test', emails: ['old@oakstudio.test'], categories: ['furniture'], names: [], platforms: [], dataQuality: {} };
function siteFrom(body) { const facts = engine.factsFromHtml(page(body), lead.website); return { ...facts, pages: [{ title: 'Oak Studio Furniture', url: lead.website, blocked: false, parked: false }], status: 'researched', checkedAt: new Date().toISOString() }; }

test('selects the existing-email furniture pool and excludes generated records', () => {
  assert.equal(eligibleLead(lead), true);
  assert.equal(eligibleLead({ ...lead, emails: [] }), false);
  assert.equal(eligibleLead({ ...lead, dataQuality: { suspectedGenerated: true } }), false);
});
test('a public JSON-LD founder email is evidence, not sending approval', () => {
  const body = shopping + '<script type="application/ld+json">' + JSON.stringify({ '@type': 'Organization', url: lead.website, founder: { name: 'Jane Smith', email: 'jane@oakstudio.test' }, numberOfEmployees: { minValue: 2, maxValue: 15 } }) + '</script>';
  const out = engine.assessBusiness(lead, siteFrom(body));
  assert.equal(out.contacts.find(c => c.email === 'jane@oakstudio.test').evidenceTier, 'published-owner-email-candidate');
  assert.equal(out.contacts[0].mailboxVerification, 'not-performed');
  assert.equal(out.sendApproved, false);
  assert.deepEqual([out.sizeEvidence.minimum, out.sizeEvidence.maximum], [2, 15]);
});
test('a founder mention does not assign a remote general employee email', () => {
  const out = engine.assessBusiness(lead, siteFrom(shopping + '<p>Our Founder: Jane Smith</p><p>Contact our employee bob@oakstudio.test</p>'));
  assert.equal(out.contacts.find(c => c.email === 'bob@oakstudio.test').evidenceTier, 'general-contact-only');
});
test('a generic mailbox remains a department contact even beside an owner', () => {
  const out = engine.assessBusiness(lead, siteFrom(shopping + '<p>Jane Smith, Owner. Email info@oakstudio.test</p>'));
  assert.equal(out.contacts[0].department, true);
  assert.equal(out.contacts[0].evidenceTier, 'general-contact-only');
});
test('same small profile card binds one owner name to one mailto', () => {
  const out = engine.assessBusiness(lead, siteFrom(shopping + '<section><h3>Jane Smith</h3><p>Owner</p><a href="mailto:jane@oakstudio.test">Email Jane</a></section>'));
  assert.equal(out.contacts[0].ownerBinding.name, 'Jane Smith');
  assert.equal(out.contacts[0].evidenceTier, 'published-owner-email-candidate');
});
test('two people or addresses in one block do not prove assignment', () => {
  const out = engine.assessBusiness(lead, siteFrom(shopping + '<p>Jane Smith, Owner. Robert Jones, Owner. jane@oakstudio.test robert@oakstudio.test</p>'));
  assert.ok(out.contacts.every(c => c.evidenceTier !== 'published-owner-email-candidate'));
});
test('historical founders are held rather than exported as current owner candidates', () => {
  const out = engine.assessBusiness(lead, siteFrom(shopping + '<p>Founded by Jane Smith in 1950. jane@oakstudio.test</p>'));
  assert.ok(out.contacts.every(c => c.evidenceTier !== 'published-owner-email-candidate'));
});
test('testimonials and reviews do not supply owner evidence', () => {
  const out = engine.assessBusiness(lead, siteFrom(shopping + '<blockquote><p>Jane Smith, Owner. jane@oakstudio.test</p></blockquote>'));
  assert.ok(out.contacts.every(c => !c.ownerBinding));
});
test('footer addresses are retained as general contacts', () => {
  const out = engine.assessBusiness(lead, siteFrom(shopping + '<footer><a href="mailto:hello@oakstudio.test">Contact us</a></footer>'));
  assert.ok(out.contacts.some(c => c.email === 'hello@oakstudio.test'));
});
test('published exact-name matching is explicitly a weaker inference', () => {
  const out = engine.assessBusiness(lead, siteFrom(shopping + '<p>Jane Smith, Owner</p><p>jane.smith@oakstudio.test</p>'));
  const c = out.contacts.find(c => c.email === 'jane.smith@oakstudio.test');
  assert.equal(c.ownerBinding.kind, 'published-name-email-match');
  assert.equal(c.evidenceTier, 'owner-email-needs-review');
});
test('an existing first-name email is retained as an inference, never presented as published ownership proof', () => {
  const out = engine.assessBusiness({ ...lead, emails: ['jane@oakstudio.test'] }, siteFrom(shopping + '<p>Jane Smith, Owner</p>'));
  const c = out.contacts.find(c => c.email === 'jane@oakstudio.test');
  assert.equal(c.ownerBinding.kind, 'first-name-only-email-match');
  assert.equal(c.sourceUrl, '');
  assert.equal(c.evidenceTier, 'owner-email-needs-review');
});
test('a Shopify footprint or stored ecommerce label alone is not purchasing evidence', () => {
  const out = engine.assessBusiness(lead, siteFrom('<h1>Furniture and sofas</h1><script>Shopify.shop="oakstudio"</script>'));
  assert.equal(out.ecommerceEvidenceFound, false);
});
test('structured product offer plus cart link establishes commerce evidence', () => {
  const out = engine.assessBusiness(lead, siteFrom('<h1>Furniture and sofas</h1><a href="/cart">Basket</a><script type="application/ld+json">{"@type":"Product","name":"Oak dining table","offers":{"price":100}}</script>'));
  assert.equal(out.ecommerceEvidenceFound, true);
});
test('known chain and published employee counts above 250 exclude candidates', () => {
  const body = shopping + '<p>Jane Smith, Owner. jane@oakstudio.test</p><p>We employ 900 people</p>';
  assert.ok(engine.assessBusiness(lead, siteFrom(body)).excludedReasons.includes('published-employee-count-over-250'));
  assert.ok(engine.assessBusiness({ ...lead, website: 'https://bigchain.com' }, siteFrom(shopping)).excludedReasons.includes('known-chain-or-enterprise'));
});
test('unrelated business structured data cannot identify this store owner', () => {
  const out = engine.assessBusiness(lead, siteFrom(shopping + '<script type="application/ld+json">{"@type":"Organization","url":"https://elsewhere.test","founder":{"name":"Jane Smith","email":"jane@elsewhere.test"}}</script>'));
  assert.equal(out.owners.length, 0);
});
test('website business-name mismatch holds the contact for identity review', () => {
  const out = engine.assessBusiness({ ...lead, name: 'Different Brand' }, siteFrom(shopping + '<p>Jane Smith, Owner. jane@oakstudio.test</p>'));
  assert.ok(out.contacts.every(c => c.evidenceTier !== 'published-owner-email-candidate'));
});
test('rejects addresses that are system assets, disposable or syntactically invalid', () => {
  assert.equal(engine.allowedEmail('image@2x.png'), '');
  assert.equal(engine.allowedEmail('a@mailinator.com'), '');
  assert.equal(engine.allowedEmail('no-reply@oakstudio.test'), '');
  assert.equal(engine.allowedEmail('jane@oakstudio.test'), 'jane@oakstudio.test');
});
test('robots uses longest path and explicit Allow wins ties', () => {
  const rules = robotsRules('User-agent: *\nDisallow: /private\nAllow: /private/about\nCrawl-delay: 2');
  assert.equal(robotsAllows(rules, 'https://oakstudio.test/private/staff'), false);
  assert.equal(robotsAllows(rules, 'https://oakstudio.test/private/about'), true);
  assert.equal(rules.delay, 2000);
});
test('specific robots group supersedes wildcard group', () => {
  const rules = robotsRules('User-agent: *\nDisallow: /\nUser-agent: LeadGen\nAllow: /');
  assert.equal(robotsAllows(rules, 'https://oakstudio.test/about'), true);
});
test('null MX is not usable mail routing; positive MX still does not verify a mailbox', async () => {
  const no = createEngine({ ...deps, mxResolver: async () => [{ exchange: '.', priority: 0 }] });
  assert.equal((await no.domainMail('jane@oakstudio.test')).status, 'no-mail-routing');
  const yes = createEngine({ ...deps, mxResolver: async () => [{ exchange: 'mx.oakstudio.test', priority: 10 }] });
  assert.equal((await yes.domainMail('jane@oakstudio.test')).mailboxVerified, false);
});
test('crawler respects robots, stays on the same domain and does not send messages', async () => {
  const requested = [];
  const crawler = createEngine({ ...deps, fetcher: async url => {
    requested.push(url);
    if (url.endsWith('/robots.txt')) return { text: 'User-agent: *\nDisallow: /private', url };
    return { text: page(shopping + '<a href="/private/about">About</a><a href="https://elsewhere.test/team">Team</a>'), url, contentType: 'text/html' };
  } });
  const out = await crawler.crawlSite(lead.website, { maxPages: 3, timeoutMs: 5000 });
  assert.ok(!requested.some(u => u.includes('/private') || u.includes('elsewhere')));
  assert.equal(out.emailsSent, 0);
  assert.equal(out.status, 'researched');
});
test('crawler does not accept a cross-domain fetch result', async () => {
  const crawler = createEngine({ ...deps, fetcher: async url => url.endsWith('/robots.txt') ? { text: '', url } : { text: page(shopping), url: 'https://other.test' } });
  const out = await crawler.crawlSite(lead.website, { maxPages: 1, timeoutMs: 5000 });
  assert.equal(out.pages.length, 0);
});
test('CSV quotes evidence and prevents formula execution in spreadsheet readers', () => {
  const out = csv(['email', 'evidence'], [['jane@oakstudio.test', '=HYPERLINK("x")'], ['a@b.test', 'Jane said "hello", owner']]);
  assert.ok(out.includes('"\'=HYPERLINK(""x"")"'));
  assert.ok(out.includes('Jane said ""hello"", owner'));
});
test('name extraction does not treat a business label as a person', () => {
  assert.deepEqual(ownerNames('Our Founder: Oak Furniture Store'), []);
  assert.ok(ownerNames('Jane Smith, founder').includes('Jane Smith'));
  assert.ok(ownerNames('Jane Smith is the owner').includes('Jane Smith'));
  assert.ok(ownerNames('Our business is owned and operated by Jane Smith').includes('Jane Smith'));
  assert.ok(ownerNames('The store was founded in 1985 by Jane Smith').includes('Jane Smith'));
});
