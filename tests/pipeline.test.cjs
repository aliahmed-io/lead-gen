'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const cheerio = require('cheerio');
const network = require('../runtime/network');
const verification = require('../runtime/verification');
const chainDomains = require('../runtime/chain-domains');
const { FetchError } = require('../runtime/pipeline/http');
const { loadRobots } = require('../runtime/pipeline/robots');
const { probeSite } = require('../runtime/pipeline/probe');
const { assessCommerce, detectPlatforms } = require('../runtime/pipeline/commerce');
const { namePatterns, ownerEmailCandidates } = require('../runtime/pipeline/emails');
const { createSmtpProber, classifyReply } = require('../runtime/pipeline/smtp');
const { decide, TIERS } = require('../runtime/pipeline/decide');
const { run, exportAll } = require('../runtime/pipeline/runner');
const { host } = require('../runtime/master-research');

const page = (body, title = 'Shop') => ({ status: 200, contentType: 'text/html', headers: {}, chain: [], text: '<html><head><title>' + title + '</title></head><body>' + body + '</body></html>' });
const json = (value, headers = {}) => ({ status: 200, contentType: 'application/json', headers, chain: [], text: JSON.stringify(value) });
const notFound = () => ({ status: 404, contentType: 'text/html', headers: {}, chain: [], text: '' });

test('name patterns cover common business shapes and reject single names', () => {
  assert.deepEqual(namePatterns('Janece Stone').slice(0, 4), ['janece', 'janece.stone', 'janecestone', 'jstone']);
  assert.deepEqual(namePatterns('Cher'), []);
  assert.ok(namePatterns('José Álvarez').includes('jose.alvarez'));
});

test('owner candidates never include generic mailboxes and keep published addresses first', () => {
  const list = ownerEmailCandidates({ owners: [{ name: 'Jane Doe', sourceUrl: 'u' }], siteDomain: 'oak.com', storedEmails: ['info@oak.com', 'x@gmail.com'], personalDomains: new Set(['gmail.com']), contacts: [
    { email: 'info@oak.com', department: true, ownerBinding: null },
    { email: 'jane@oak.com', department: false, bindingEvidence: 'published-person-email', ownerBinding: { name: 'Jane Doe', kind: 'same-person-block' }, sourceUrl: 'https://oak.com/about' },
  ] });
  assert.equal(list[0].email, 'jane@oak.com'); assert.equal(list[0].via, 'published');
  assert.ok(!list.some(c => c.email.startsWith('info@')));
  assert.ok(list.some(c => c.email === 'jane.doe@oak.com' && c.via === 'derived'));
  assert.ok(!list.some(c => c.email.endsWith('gmail.com')));
});

test('SMTP replies classify correctly', () => {
  assert.equal(classifyReply(250, 'OK'), 'accepted');
  assert.equal(classifyReply(550, '5.1.1 The email account that you tried to reach does not exist'), 'rejected');
  assert.equal(classifyReply(550, '5.7.1 Service unavailable, client host blocked by Spamhaus'), 'blocked');
  assert.equal(classifyReply(451, 'Greylisted, try later'), 'temporary');
});

function fakeSmtpServer(behaviour) {
  return new Promise(resolve => {
    const server = net.createServer(socket => {
      socket.write('220 test ESMTP\r\n');
      let buffer = '';
      socket.on('data', chunk => {
        buffer += chunk.toString();
        let i;
        while ((i = buffer.indexOf('\r\n')) >= 0) {
          const line = buffer.slice(0, i); buffer = buffer.slice(i + 2);
          if (/^EHLO/i.test(line)) socket.write('250-test\r\n250 OK\r\n');
          else if (/^MAIL FROM/i.test(line)) socket.write('250 OK\r\n');
          else if (/^RCPT TO/i.test(line)) { const rcpt = line.match(/<(.+)>/)[1]; socket.write(behaviour(rcpt) + '\r\n'); }
          else if (/^QUIT/i.test(line)) { socket.write('221 bye\r\n'); socket.end(); }
        }
      });
      socket.on('error', () => {});
    }).listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('SMTP prober separates accepted, rejected and catch-all domains without sending mail', async () => {
  const normal = await fakeSmtpServer(rcpt => rcpt.startsWith('jane@') ? '250 OK' : '550 5.1.1 User unknown');
  const catchAll = await fakeSmtpServer(() => '250 OK');
  try {
    const make = server => createSmtpProber({ resolveMx: async () => [{ exchange: 'mx.test', priority: 1 }], resolveHost: async () => ({address:'192.0.2.10',family:4}), connect: () => net.connect({ host: '127.0.0.1', port: server.address().port }), delayMs: 0, helo: 'probe.test' });
    const a = await make(normal).verifyDomain('oak.com', ['jane@oak.com', 'bob@oak.com']);
    assert.equal(a.catchAll, false);
    assert.equal(a.perEmail['jane@oak.com'].status, 'accepted');
    assert.equal(a.perEmail['bob@oak.com'].status, 'rejected');
    const b = await make(catchAll).verifyDomain('any.com', ['jane@any.com']);
    assert.equal(b.catchAll, true);
    assert.equal(b.perEmail['jane@any.com'].status, 'catch-all');
  } finally { normal.close(); catchAll.close(); }
});

test('SMTP prober reports no-mx and unreachable honestly', async () => {
  const none = createSmtpProber({ resolveMx: async () => { const e = new Error('x'); e.code = 'ENODATA'; throw e; } });
  assert.equal((await none.verifyDomain('x.com', ['a@x.com'])).perEmail['a@x.com'].status, 'no-mx');
  const down = createSmtpProber({ resolveMx: async () => [{ exchange: 'mx.test', priority: 1 }], resolveHost: async () => ({address:'192.0.2.10',family:4}), connect: () => net.connect({ host: '127.0.0.1', port: 1 }), delayMs: 0 });
  assert.equal((await down.verifyDomain('x.com', ['a@x.com'])).perEmail['a@x.com'].status, 'unreachable');
});

test('robots: 4xx means no restrictions, 5xx means retry, 2xx is parsed', async () => {
  const mk = response => ({ fetchPage: async () => { if (response instanceof Error) throw response; return response; } });
  assert.equal((await loadRobots('https://a.com', mk({ status: 403, text: '', contentType: '' }))).status, 'not-published');
  const five = await loadRobots('https://a.com', mk({ status: 503, text: '', contentType: '' }));
  assert.equal(five.status, 'unreachable'); assert.equal(five.retryable, true);
  const net_ = await loadRobots('https://a.com', mk(new FetchError('x', 'timeout', true)));
  assert.equal(net_.status, 'unreachable');
  const ok = await loadRobots('https://a.com', mk({ status: 200, contentType: 'text/plain', text: 'User-agent: *\nDisallow: /private\nSitemap: https://a.com/s.xml' }));
  assert.equal(ok.status, 'loaded'); assert.deepEqual(ok.sitemaps, ['https://a.com/s.xml']);
});

test('probe falls back across www/apex and http/https, and classifies dead and blocked sites', async () => {
  const seen = [];
  const fetchPage = async url => { seen.push(url); if (url === 'https://www.a.com/') return page('hello'); throw new FetchError('x', url.startsWith('https://a.com') ? 'reset' : 'timeout', true); };
  const live = await probeSite('a.com', { fetchPage, host });
  assert.equal(live.state, 'live'); assert.equal(live.origin, 'https://www.a.com'); assert.equal(live.domainChanged, false);
  const dead = await probeSite('dead.com', { fetchPage: async () => { throw new FetchError('x', 'dns', false); }, host });
  assert.equal(dead.state, 'dns-dead');
  const wall = await probeSite('wall.com', { fetchPage: async () => ({ status: 403, text: '', headers: {} }), host });
  assert.equal(wall.state, 'blocked'); assert.equal(wall.retryable, true);
  const moved = await probeSite('old.com', { fetchPage: async () => ({ ...page('x'), url: 'https://new.com/' }), host });
  assert.equal(moved.domainChanged, true); assert.equal(moved.finalDomain, 'new.com');
});

test('platform detection does not label every page Magento', () => {
  assert.deepEqual(detectPlatforms('<img src="/a/image/x.png">'), []);
  assert.deepEqual(detectPlatforms('<script src="https://cdn.shopify.com/s.js"></script>'), ['Shopify']);
});

test('commerce: Shopify catalog API with priced furniture confirms ecommerce and niche', async () => {
  const products = ['Oak dining table', 'Velvet sofa', 'Wool rug', 'Bed frame', 'Gift card'].map(title => ({ title, product_type: '', tags: [], variants: [{ price: '199.00', available: true }] }));
  const fetchPage = async url => url.includes('/products.json') ? json({ products }) : notFound();
  const r = await assessCommerce({ origin: 'https://s.com', html: '<script src="https://cdn.shopify.com/x.js"></script>', headers: {}, crawl: { commerce: [], niche: [], platforms: [] }, robots: { rules: [], delay: 0, sitemaps: [] }, fetchPage });
  assert.equal(r.ecommerce, 'confirmed'); assert.equal(r.niche, 'confirmed'); assert.equal(r.productCount, 5);
});

test('commerce: a brochure site with no purchasing is catalog-only or none, never ecommerce', async () => {
  const fetchPage = async () => notFound();
  const r = await assessCommerce({ origin: 'https://b.com', html: '<p>Sofas</p>', headers: {}, crawl: { commerce: [], niche: [{ terms: ['sofas', 'beds'] }], platforms: [] }, robots: { rules: [], delay: 0, sitemaps: [] }, fetchPage });
  assert.equal(r.ecommerce, 'none'); assert.equal(r.niche, 'likely');
});

test('commerce: a Shopify store with quote-only unpriced products is still ecommerce, not catalog-only', async () => {
  const products = ['Oak dining table', 'Velvet sofa', 'Wool rug'].map(title => ({ title, product_type: '', tags: [], variants: [{ price: '0.00', available: false }] }));
  const fetchPage = async url => url.includes('/products.json') ? json({ products }) : notFound();
  const r = await assessCommerce({ origin: 'https://q.com', html: '<script src="https://cdn.shopify.com/x.js"></script>', headers: {}, crawl: { commerce: [], niche: [], platforms: [] }, robots: { rules: [], delay: 0, sitemaps: [] }, fetchPage });
  assert.equal(r.ecommerce, 'likely');
});

test('commerce: a Shopify store whose product API is blocked is still ecommerce', async () => {
  const fetchPage = async () => notFound();
  const r = await assessCommerce({ origin: 'https://p.com', html: '<script src="https://cdn.shopify.com/x.js"></script>', headers: {}, crawl: { commerce: [], niche: [], platforms: [] }, robots: { rules: [], delay: 0, sitemaps: [] }, fetchPage });
  assert.equal(r.ecommerce, 'likely');
});

test('commerce: a Magento site with a cart route is ecommerce', async () => {
  const fetchPage = async () => notFound();
  const r = await assessCommerce({ origin: 'https://m.com', html: '<div data-mage-init="{}"></div>', headers: {}, crawl: { commerce: [{ kind: 'cart-route' }], niche: [], platforms: [] }, robots: { rules: [], delay: 0, sitemaps: [] }, fetchPage });
  assert.equal(r.ecommerce, 'likely');
});

test('commerce: WooCommerce markup with no products, cart or sitemap stays none', async () => {
  const fetchPage = async () => notFound();
  const r = await assessCommerce({ origin: 'https://w.com', html: '<body class="woocommerce">x</body>', headers: {}, crawl: { commerce: [], niche: [], platforms: [] }, robots: { rules: [], delay: 0, sitemaps: [] }, fetchPage });
  assert.equal(r.ecommerce, 'none');
});

test('commerce respects robots disallow for API probes', async () => {
  let called = false;
  const fetchPage = async () => { called = true; return notFound(); };
  await assessCommerce({ origin: 'https://s.com', html: '<script src="https://cdn.shopify.com/x.js"></script>', headers: {}, crawl: { commerce: [], niche: [], platforms: [] }, robots: { rules: [{ allow: false, path: '/' }], delay: 0, sitemaps: [] }, fetchPage });
  assert.equal(called, false);
});

const baseAssess = (over = {}) => ({ excludedReasons: [], owners: [], contacts: [], identityTitleMatch: true, ...over });
const doneJob = (over = {}) => ({ state: 'done', final: true, probe: { finalDomain: 'oak.com', domainChanged: false }, crawl: { status: 'researched' }, ...over });
const store = { ecommerce: 'confirmed', niche: 'confirmed', platforms: ['Shopify'] };
const owner = { name: 'Jane Doe', sourceUrl: 'u', kind: 'published-text', historical: false };

test('decide: published owner email is tier A; rejected published email drops out with a flag', () => {
  const contacts = [{ email: 'jane@oak.com', department: false, bindingEvidence: 'published-person-email', ownerBinding: { name: 'Jane Doe', kind: 'same-person-block' }, sourceUrl: 'https://oak.com/about' }];
  const a = decide({ business: { id: '1', name: 'Oak Haven Furniture' }, job: doneJob(), assess: baseAssess({ owners: [owner], contacts }), commerce: store });
  assert.equal(a.tier, TIERS.A); assert.equal(a.bestEmail.proof, 'published-person-email-association');
  const r = decide({ business: { id: '1', name: 'Oak Haven Furniture' }, job: doneJob(), assess: baseAssess({ owners: [owner], contacts }), commerce: store, mailboxes: { 'jane@oak.com': { status: 'rejected' }, 'jane.doe@oak.com': { status: 'rejected' }, 'jane@oak.com ': {} } });
  assert.notEqual(r.tier, TIERS.A); assert.ok(r.flags.some(f => f.startsWith('published-email-rejected')));
});

test('decide: a derived address remains tier B even with SMTP acceptance', () => {
  const args = { business: { id: '1', name: 'Oak Haven Furniture' }, job: doneJob(), assess: baseAssess({ owners: [owner] }), commerce: store };
  assert.equal(decide({ ...args, mailboxes: { 'jane@oak.com': { status: 'accepted' } } }).tier, TIERS.B);
  assert.equal(decide({ ...args, mailboxes: { 'jane@oak.com': { status: 'catch-all' } } }).tier, TIERS.B);
  const all = {}; for (const c of ['jane', 'jane.doe', 'janedoe', 'jdoe', 'j.doe', 'jane_doe', 'janed', 'doe', 'doej']) all[c + '@oak.com'] = { status: 'rejected' };
  assert.equal(decide({ ...args, mailboxes: all }).tier, TIERS.C);
});

test('decide: no owner is tier D; not ecommerce or not furniture is excluded; failures are unresolved', () => {
  const b = { id: '1', name: 'Oak Haven Furniture' };
  assert.equal(decide({ business: b, job: doneJob(), assess: baseAssess(), commerce: store }).tier, TIERS.D);
  assert.equal(decide({ business: b, job: doneJob(), assess: baseAssess({ owners: [owner] }), commerce: { ecommerce: 'catalog-only', niche: 'confirmed' } }).tier, TIERS.U);
  assert.equal(decide({ business: b, job: doneJob(), assess: baseAssess({ owners: [owner] }), commerce: { ecommerce: 'confirmed', niche: 'none' } }).tier, TIERS.U);
  assert.equal(decide({ business: b, job: { state: 'blocked', final: true, probe: {} }, assess: baseAssess(), commerce: null }).tier, TIERS.U);
  assert.equal(decide({ business: b, job: { state: 'dns-dead', final: true, probe: {} }, assess: baseAssess(), commerce: null }).tier, TIERS.X);
  assert.equal(decide({ business: b, job: { state: 'timeout', final: false, attempts: 1, probe: {} }, assess: baseAssess(), commerce: null }).reasons[0], 'research-not-finished');
});

test('decide: identity mismatch after a domain change never reaches tier A', () => {
  const contacts = [{ email: 'jane@other.com', department: false, ownerBinding: { name: 'Jane Doe', kind: 'same-person-block' }, sourceUrl: 'https://oak.com/about' }];
  const d = decide({ business: { id: '1', name: 'Oak Haven Furniture' }, job: doneJob({ probe: { finalDomain: 'other.com', domainChanged: true } }), assess: baseAssess({ owners: [owner], contacts, identityTitleMatch: false }), commerce: store });
  assert.equal(d.tier, TIERS.B); assert.ok(d.flags.includes('business-identity-needs-review'));
});

test('end to end: retries converge, results are tiered, source stays untouched, exports never overwrite', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'leadgen-qualify-'));
  const biz = (name, website, emails = ['info@' + website]) => ({ name, website, emails, dataQuality: {}, categories: ['furniture'], names: [name], platforms: [] });
  const list = [biz('Oak Haven Furniture', 'oakhaven.com'), biz('Flaky Furniture', 'flaky.com'), biz('Dead Furniture', 'dead.example'), biz('Brochure Furniture', 'brochure.com'), biz('Quiet Furniture', 'quiet.com'), biz('Walled Furniture', 'walled.com')];
  const master = { schemaVersion: 1, metadata: {}, businesses: Object.fromEntries(list.map((b, i) => [i, { ...b, id: 'b' + i }])) };
  const input = path.join(tmp, 'master.json'); fs.writeFileSync(input, JSON.stringify(master));
  const before = fs.readFileSync(input);
  const cart = '<button>Add to cart</button><a href="/pages/our-story">Our story</a>';
  const furniture = '<h1>Furniture and home decor</h1><p>Sofas, dining tables, beds, rugs and lighting.</p>';
  const calls = {};
  const fetchPage = async url => {
    const u = new URL(url), h = u.hostname.replace(/^www\./, ''); calls[h] = (calls[h] || 0) + 1;
    if (u.pathname === '/robots.txt') return notFound();
    if (u.pathname.includes('products.json') || u.pathname.includes('wp-json') || u.pathname.includes('sitemap')) return notFound();
    if (h === 'dead.example') throw new FetchError('ENOTFOUND', 'dns', false);
    if (h === 'flaky.com' && calls[h] <= 2) throw new FetchError('socket hang up', 'reset', true);
    if (h === 'walled.com') return { status: 403, text: '', headers: {}, contentType: '' };
    if (h === 'oakhaven.com') return u.pathname === '/pages/our-story' ? page('<p>Jane Doe, Owner — <a href="mailto:jane@oakhaven.com">jane@oakhaven.com</a></p>', 'Our story - Oak Haven Furniture') : page(furniture + cart, 'Oak Haven Furniture');
    if (h === 'flaky.com') return u.pathname === '/pages/our-story' ? page('<p>Sam Lee, Founder</p>', 'Our story - Flaky Furniture') : page(furniture + cart, 'Flaky Furniture');
    if (h === 'quiet.com') return page(furniture + '<button>Add to cart</button>', 'Quiet Furniture');
    if (h === 'brochure.com') return page(furniture + '<p>Visit our showroom.</p>', 'Brochure Furniture');
    return notFound();
  };
  const smtp = { verifyDomain: async (domain, emails) => ({ domain, status: 'probed', mx: ['mx.' + domain], provider: 'other', catchAll: domain === 'flaky.com', perEmail: Object.fromEntries(emails.map(e => [e, domain === 'flaky.com' ? { status: 'catch-all' } : { status: 'accepted', code: 250 }])) }) };
  let clock = 1_000_000; const sleeps = [];
  const options = { input, workdir: path.join(tmp, 'work'), concurrency: 3, deps: { fetchPage, cheerio, network, verification, chainDomains, smtp, mxResolver: async () => [{exchange:'mx.fixture.test',priority:1}], now: () => clock, sleep: async ms => { sleeps.push(ms); clock += ms; } }, backoffScale: 0.001, maxWaitMs: 3600000 };
  const session = await run(options);
  const byName = Object.fromEntries(session.decisions().map(r => [r.business.name, r.decision]));
  assert.equal(byName['Oak Haven Furniture'].tier, TIERS.A);
  assert.equal(byName['Oak Haven Furniture'].bestEmail.email, 'jane@oakhaven.com');
  assert.equal(byName['Flaky Furniture'].tier, TIERS.B, 'flaky site recovered on retry; owner found; catch-all domain stays unverified');
  assert.ok(sleeps.length >= 1, 'convergence loop waited for the retry');
  assert.equal(byName['Dead Furniture'].tier, TIERS.X);
  assert.equal(byName['Brochure Furniture'].tier, TIERS.U);
  assert.equal(byName['Quiet Furniture'].tier, TIERS.D);
  assert.equal(byName['Walled Furniture'].tier, TIERS.U);
  assert.equal(session.final.websitesWaitingRetry, 0);
  const first = exportAll(session), second = exportAll(session);
  assert.notEqual(first.output, second.output);
  assert.equal(first.tiers.A_published_owner_needs_verification, 1);
  assert.match(fs.readFileSync(path.join(first.output, '01-published-owner-contacts-NEED-VERIFICATION.csv'), 'utf8'), /jane@oakhaven\.com/);
  assert.match(fs.readFileSync(path.join(first.output, '07-UPLOAD-TO-PAID-VERIFIER.csv'), 'utf8'), /jane@oakhaven\.com/);
  assert.ok(!fs.readFileSync(path.join(first.output, '07-UPLOAD-TO-PAID-VERIFIER.csv'), 'utf8').includes('sam@flaky.com'));
  const verificationDoc = JSON.parse(fs.readFileSync(path.join(first.output, '05-research-results.json'), 'utf8'));
  const { reconcile } = require('../runtime/research-verification');
  const verified = reconcile(verificationDoc, 'email,status\njane@oakhaven.com,valid', { provider: 'Fixture verifier', verifiedAt: new Date().toISOString() });
  assert.equal(verified.counts.passedPaidVerification, 1); assert.equal(verified.counts.sendApproved, 0);
  assert.equal(first.emailsSent, 0);
  assert.deepEqual(fs.readFileSync(input), before);
  const callsBefore = { ...calls };
  const resumed = await run({ ...options, input: undefined });
  assert.deepEqual(calls, callsBefore, 'a completed workdir resumes without refetching anything');
  assert.equal(resumed.final.websitesFinal, resumed.final.websites);
  session.db.close(); resumed.db.close();
});
