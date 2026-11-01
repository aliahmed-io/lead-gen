'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');
const { EventEmitter } = require('node:events');
const fs = require('node:fs'); const path = require('node:path'); const os = require('node:os');
const cheerio = require('cheerio');
const network = require('../runtime/network'); const verification = require('../runtime/verification');
const { createEngine, sha } = require('../runtime/master-research');
const { createFetcher } = require('../runtime/pipeline/http');
const { assessCommerce } = require('../runtime/pipeline/commerce');
const { ownerEmailCandidates } = require('../runtime/pipeline/emails');
const { decide, TIERS } = require('../runtime/pipeline/decide');
const { classifyReply, createSmtpProber } = require('../runtime/pipeline/smtp');
const { openStore, run } = require('../runtime/pipeline/runner');
const { probeSite } = require('../runtime/pipeline/probe');
const owner = { name: 'Jane Smith', role: 'Owner', sourceUrl: 'https://oak.test/about', snippet: 'Jane Smith, Owner', historical: false };
const commerce = { ecommerce: 'confirmed', niche: 'confirmed' };
const job = { state: 'done', final: true, probe: { finalDomain: 'oak.test' }, crawl: { status: 'researched' } };
const business = { id: 'fixture', name: 'Oak Furniture', emails: ['jane@oak.test'] };
const assess = contacts => ({ owners: [owner], contacts, excludedReasons: [], identityTitleMatch: true });

test('team labels, company names and adjacent staff cannot become owner names', () => {
  const { ownerNames } = require('../runtime/master-research');
  assert.deepEqual(ownerNames('Richard Found CEO & Founder Sophie Holmes Chief Operating Officer Jasmine Boothroyd Head of Brand'), ['Richard Found']);
  assert.deepEqual(ownerNames('Reuben Lapp Chief Executive Officer & Owner Raj Pathak Chief Operating Officer Sam Eby Chief Financial Officer'), ['Reuben Lapp']);
  assert.deepEqual(ownerNames('BLAIN MIKKONEN Co-Founder | Co-Owner | Designer GRANT KOENIG Co-Founder | Co-Owner | Designer'), ['BLAIN MIKKONEN', 'GRANT KOENIG']);
  assert.deepEqual(ownerNames("The Founder Sebastain D'souza Retailer with over 30 years of experience"), ["Sebastain D'souza"]);
  assert.deepEqual(ownerNames('Brianna Brianna Nichole Love is the founder, owner, and designer of studio apotroes.'), ['Brianna Nichole Love']);
  assert.deepEqual(ownerNames('Found Pop Limited, the owner and operator of the Site.'), []);
  assert.deepEqual(ownerNames('Supplier means Aromadrive Pty Ltd or any brand owned by Aromadrive Pty Ltd;'), []);
  assert.deepEqual(ownerNames('Meet Daisy: The Founder Behind Autumn’s Corner Children’s Furniture'), []);
  assert.deepEqual(ownerNames('Hi, I’m Sam, co-founder of Cushion Factory.'), ['Sam']);
  assert.deepEqual(ownerNames('Meet the Founder Skyler Perguidi Skyler is a student'), ['Skyler Perguidi']);
  assert.deepEqual(ownerNames('Meet the Team /Florian-Marthaler Florian Marthaler Co-Founder Hi! I’m Florian'), ['Florian Marthaler']);
  assert.deepEqual(ownerNames('Founder & CEO Michael Levin Michael Levin'), ['Michael Levin']);
  assert.deepEqual(ownerNames("Indie Ella's founder Jayna Lamb moved from Amsterdam"), ['Jayna Lamb']);
  assert.deepEqual(ownerNames('Our Founder Patents Press'), []);
  assert.deepEqual(ownerNames('Clinical Psychologist | Co-Founder & CSO'), []);
});

test('saved owner snippets are repaired and another brand founder is retained only for review', () => {
  const engine = createEngine({ cheerio, network, verification });
  const site = { pages: [], contacts: [], owners: [
    { name: 'Sophie Holmes Chief Operating', kind: 'published-text', sourceUrl: 'https://oak.test/about', snippet: 'Richard Found CEO & Founder Sophie Holmes Chief Operating Officer' },
    { name: 'Calle Henzel', kind: 'published-text', sourceUrl: 'https://oak.test/shop', snippet: 'Calle Henzel, founder and creative force behind Henzel Studio, created this rug.' },
    { name: 'Natasha Baradaran', kind: 'published-text', sourceUrl: 'https://oak.test/shop', snippet: 'Natasha Baradaran is the founder and creative visionary behind her namesake design.' },
  ] };
  const result = engine.assessBusiness({ ...business, website: 'https://oak.test' }, site);
  assert.deepEqual(result.owners.map(o => o.name), ['Richard Found']);
  assert.equal(result.rejectedOwnerMentions.length, 2);
  assert.equal(result.rejectedOwnerMentions[0].reviewReason, 'role-refers-to-another-business');
});

test('stored first-name matches stay inferred even on catch-all or accepted servers', () => {
  const contacts = [{ email: 'jane@oak.test', department: false, unrelatedDomain: false, kind: 'stored-email-only', sourceUrl: '', bindingEvidence: 'inferred-name', ownerBinding: { ...owner, kind: 'first-name-only-email-match' } }];
  assert.equal(ownerEmailCandidates({ owners: [owner], contacts, siteDomain: 'oak.test' })[0].via, 'inferred');
  for (const status of ['accepted', 'catch-all', 'inconclusive']) {
    const out = decide({ business, job, assess: assess(contacts), commerce, mailboxes: { 'jane@oak.test': { status } } });
    assert.equal(out.tier, TIERS.B); assert.equal(out.sendApproved, false); assert.equal(out.mailboxVerified, false); assert.notEqual(out.bestEmail?.proof, 'published-on-site-next-to-owner');
  }
});
test('real published contacts still need paid verification and owner/business review', () => {
  const contacts = [{ email: 'jane@oak.test', sourceUrl: owner.sourceUrl, bindingEvidence: 'published-person-email', ownerBinding: owner }];
  const out = decide({ business, job, assess: assess(contacts), commerce });
  assert.equal(out.tier, TIERS.A); assert.equal(out.nextAction, 'paid-verification-and-owner-business-review');
  assert.ok(out.flags.includes('business-size-not-established')); assert.equal(out.currentOwnershipConfirmed, false);
});
test('owner-binding survives page-text duplicate extraction', async () => {
  const engine = createEngine({ cheerio, network, verification, fetcher: async url => ({ url, contentType: 'text/html', text: url.endsWith('/robots.txt') ? '' : '<title>Oak Furniture</title><p>Jane Smith, Owner. jane@oak.test</p><button>Add to cart</button>' }) });
  const result = await engine.crawlSite('https://oak.test', { maxPages: 1 });
  assert.equal(result.contacts.length, 1); assert.equal(result.contacts[0].ownerBinding.name, 'Jane Smith');
});
function catalog(products) {
  return assessCommerce({ origin: 'https://fixture.test', html: '<script src="https://cdn.shopify.com/x.js"></script>', headers: {}, crawl: { commerce: [], niche: [], platforms: [] }, robots: { rules: [], delay: 0, sitemaps: [] }, fetchPage: async () => ({ status: 200, headers: {}, text: JSON.stringify({ products }) }) });
}
test('pendant necklaces and game consoles cannot be classified as furniture', async () => {
  for (const titles of [['Gold Pendant Necklace', 'Silver Pendant Necklace', 'Pearl Pendant Necklace'], ['Xbox Game Console', 'Nintendo Game Console', 'Playstation Game Console']]) {
    const out = await catalog(titles.map(title => ({ title, variants: [{ price: '100', available: true }] })));
    assert.equal(out.niche, 'off-topic'); assert.equal(out.productFurnitureShare, 0);
  }
});
test('pendant lights and console tables remain furniture/decor', async () => {
  const out = await catalog(['Oak Console Table', 'Brass Pendant Light', 'Velvet Sofa'].map(title => ({ title, variants: [{ price: '100', available: true }] })));
  assert.equal(out.niche, 'confirmed'); assert.equal(out.ecommerce, 'confirmed');
});
test('all-unavailable or unknown availability products do not prove purchasing', async () => {
  const titles = ['Oak Dining Table', 'Velvet Sofa', 'Wool Rug'];
  const out = await catalog(titles.map(title => ({ title, variants: [{ price: '100', available: false }] })));
  assert.equal(out.ecommerce, 'likely'); assert.equal(out.inventoryStatus, 'sample-unavailable'); assert.equal(out.purchasingFlowTested, false);
  const unknown = await catalog(titles.map(title => ({ title, variants: [{ price: '100' }] })));
  assert.equal(unknown.inventoryStatus, 'not-established'); assert.equal(unknown.ecommerce, 'likely');
});

test('a backorder setting does not override WooCommerce explicitly disabling purchases', async () => {
  const out = await assessCommerce({ origin: 'https://fixture.test', html: '<div class="woocommerce"></div>', headers: {}, crawl: { commerce: [], niche: [], platforms: ['WooCommerce'] }, robots: { rules: [], delay: 0, sitemaps: [] }, fetchPage: async () => ({ status: 200, headers: {}, text: JSON.stringify(['Oak Dining Table', 'Velvet Sofa', 'Wool Rug'].map(name => ({ name, prices: { price: '10000' }, is_purchasable: false, is_in_stock: false, backorders_allowed: true }))) }) });
  assert.equal(out.ecommerce, 'likely');
  assert.equal(out.purchasableProductsInSample, 0);
});
test('a full mailbox and generic 550 rejection do not establish a nonexistent user', () => {
  assert.equal(classifyReply(550, '5.2.2 Mailbox unavailable: quota exceeded'), 'capacity-limited');
  assert.equal(classifyReply(550, 'Request unsuccessful'), 'inconclusive');
  assert.equal(classifyReply(550, '5.1.1 No such user'), 'rejected');
});
test('SMTP connection uses the validated pinned address and rejects CRLF inputs', async () => {
  let connectedHost;
  const prober = createSmtpProber({ resolveMx: async () => [{ exchange: 'mx.fixture.test', priority: 1 }], resolveHost: async () => ({ address: '192.0.2.42', family: 4 }), connect: options => {
    connectedHost = options.host; const socket = new EventEmitter(); socket.setEncoding = () => {}; socket.write = () => {}; socket.destroy = () => {};
    process.nextTick(() => socket.emit('error', Object.assign(new Error('fixture connection refused'), { code: 'ECONNREFUSED' })));
    return socket;
  }, delayMs: 0 });
  await prober.verifyDomain('oak.test', ['jane@oak.test']); assert.equal(connectedHost, '192.0.2.42');
  await assert.rejects(prober.verifyDomain('oak.test', ['jane@oak.test\r\nDATA']));
});
test('HTTP total deadline covers DNS and prevents a late connection', async () => {
  let resolveDns, requests = 0;
  const fetch = createFetcher({ resolveHost: () => new Promise(resolve => { resolveDns = resolve; }), requestFactory: () => { requests++; } });
  await assert.rejects(fetch('https://fixture.test', { totalTimeoutMs: 20 }), e => e.kind === 'timeout');
  resolveDns({ address: '192.0.2.42', family: 4 }); await new Promise(resolve => setImmediate(resolve)); assert.equal(requests, 0);
});
function responseFactory(send) {
  return (_url, options, callback) => {
    const request = new EventEmitter(); request.destroyed = false;
    request.destroy = () => { request.destroyed = true; };
    setImmediate(() => {
      const response = new PassThrough(); response.statusCode = 200; response.headers = { 'content-type': 'text/html' }; response.complete = true;
      callback(response); send(response, request, options);
    });
    return request;
  };
}
test('HTTP deadline destroys slow streams; pinned lookup is used', async () => {
  let request, address;
  const fetch = createFetcher({ resolveHost: async () => ({ address: '192.0.2.42', family: 4 }), requestFactory: responseFactory((response, req, options) => {
    request = req; options.lookup('fixture.test', {}, (_error, ip) => { address = ip; }); response.write('partial');
  }) });
  await assert.rejects(fetch('https://fixture.test', { totalTimeoutMs: 25 }), e => e.kind === 'timeout');
  assert.equal(request.destroyed, true); assert.equal(address, '192.0.2.42');
});
test('oversized and truncated HTTP responses cannot be accepted as successful pages', async () => {
  const resolveHost = async () => ({ address: '192.0.2.42', family: 4 });
  const big = createFetcher({ resolveHost, requestFactory: responseFactory(response => response.end('oversized')) });
  await assert.rejects(big('https://fixture.test', { maxBytes: 3 }), e => e.kind === 'too-large');
  const truncated = createFetcher({ resolveHost, requestFactory: responseFactory(response => { response.complete = false; response.end('partial'); }) });
  await assert.rejects(truncated('https://fixture.test'), e => e.kind === 'truncated');
});
test('upgrade copies v2 checkpoints and requires evidence refresh without changing the original', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'leadgen-upgrade-fixture-')); const oldDir = path.join(tmp, 'v2-copy'), newDir = path.join(tmp, 'v3-copy'); fs.mkdirSync(oldDir);
  const input = path.join(tmp, 'source.copy.json'); const source = JSON.stringify({ businesses: {} }); fs.writeFileSync(input, source);
  const old = openStore(path.join(oldDir, 'qualify.sqlite'));
  const put = old.prepare('INSERT INTO meta VALUES(?,?)'); put.run('version', 'qualify-v2'); put.run('input', input); put.run('sourceSha256', sha(source));
  old.prepare('INSERT INTO leads VALUES(?,?,?)').run('fixture', 'oak.test', JSON.stringify({ ...business, website: 'https://oak.test' }));
  old.prepare("INSERT INTO jobs(domain,website,state,final,result) VALUES(?,?,'done',1,?)").run('oak.test', 'https://oak.test', JSON.stringify({ probe: job.probe, commerce, crawl: job.crawl }));
  old.close();
  const upgraded = await run({ workdir: newDir, input, migrateFrom: oldDir, work: false, deps: { cheerio, network, verification, chainDomains: [] } });
  assert.equal(upgraded.decisions()[0].decision.tier, TIERS.U); assert.equal(upgraded.final.websitesNeedingCommerceRefresh, 1); assert.equal(upgraded.final.smtpEnabled, false); upgraded.db.close();
  const unchanged = openStore(path.join(oldDir, 'qualify.sqlite')); assert.equal(unchanged.prepare("SELECT value FROM meta WHERE key='version'").get().value, 'qualify-v2'); unchanged.close();
  assert.equal(fs.readFileSync(input, 'utf8'), source);
  await assert.rejects(run({ workdir: oldDir, migrateFrom: oldDir, work: false, deps: {} }), /separate new working directory/);
  await assert.rejects(run({ workdir: oldDir, work: false, deps: {} }), /original checkpoint was not modified/);
});
test('429 Retry-After stops protocol variants and preserves the requested delay', async () => {
  let calls = 0;
  const result = await probeSite('oak.test', { host: require('../runtime/master-research').host, fetchPage: async () => { calls++; return { status: 429, headers: { 'retry-after': '120' } }; } });
  assert.equal(calls, 1); assert.equal(result.retryAfterMs, 120000); assert.equal(result.state, 'blocked');
});
