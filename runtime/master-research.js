'use strict';

// Read-only public research. No mailbox login, paid API, SMTP probe or campaign write.
const dns = require('node:dns').promises;
const crypto = require('node:crypto');
const FURNITURE = /furniture|furnish|home decor|أثاث|مفروشات|ديكور/i;
const OWNER = /\b(?:co[- ]?owner|owner|co[- ]?founder|founder|proprietor)\b|\bowned (?:and operated )?by\b/i;
const HISTORICAL = /\b(?:founded|established|started|created)(?:\s+in\s+\d{4})?\s+by\b|\b(?:late|former|retired|previous|original)\s+(?:owner|founder)\b|\b(?:passed away|died|in memory of)\b/i;
const DEPARTMENT = /^(?:info|hello|contact|sales|support|help|office|team|admin|billing|accounts|hr|careers|jobs|orders|service|customerservice|marketing|enquiries|inquiries|press|media|privacy|legal|webmaster|noreply|no-reply|unsubscribe|abuse|returns|customercare)(?:[.+_-].*)?$/i;
const PERSONAL_DOMAINS = new Set(['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com', 'live.com', 'msn.com', 'proton.me', 'protonmail.com']);
const DIRECTORY = /(^|\.)(?:facebook|instagram|linkedin|twitter|x|yelp|google|maps\.google|yellowpages|bbb|tripadvisor|pinterest|etsy|amazon|walmart|youtube)\.(?:com|org)$/i;
const EMAIL = /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}/ig;
const norm = value => String(value || '').replace(/\s+/g, ' ').trim();
const host = value => { try { return new URL(/^https?:\/\//i.test(value) ? value : 'https://' + value).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; } };
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const slug = value => norm(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const unique = (list, key) => [...new Map(list.map(item => [key(item), item])).values()];
function isDepartment(email) { return DEPARTMENT.test(String(email).split('@')[0]); }
function cleanEmail(value) {
  let email = String(value || '').trim().replace(/^mailto:/i, '').split('?')[0];
  try { email = decodeURIComponent(email); } catch { /* Keep original for syntax rejection. */ }
  return email.toLowerCase().replace(/[.,;:]+$/, '');
}
function eligibleLead(b) {
  return !b.dataQuality?.suspectedGenerated && FURNITURE.test([b.name, ...(b.names || []), ...(b.categories || [])].join(' ')) && (b.emails || []).length > 0;
}
function usableName(value) {
  const name = norm(value).replace(/^(?:Mr|Mrs|Ms|Dr)\.?\s+/i, '');
  return /^[\p{L}][\p{L}'’-]+(?:\s+[\p{L}][\p{L}'’-]+){1,3}$/u.test(name) && !/\b(?:our|meet|team|contact|about|store|furniture|design|founder|owner|president|company|business|customer|family|email|shop|online|read|more|privacy|terms)\b/i.test(name) ? name : '';
}
function ownerNames(text) {
  const names = [];
  const person = "([A-Z][a-zA-Z'’–-]+(?:\\s+[A-Z][a-zA-Z'’–-]+){1,3})";
  const role = '(?:[Cc]o[- ]?[Ff]ounder|[Cc]o[- ]?[Oo]wner|[Ff]ounder|[Oo]wner|[Pp]roprietor)';
  for (const expression of [new RegExp(person + '\\s*[,|–—:-]\\s*(?:the\\s+)?' + role, 'g'), new RegExp(person + '\\s+(?:is|serves as)\\s+(?:our |the |a )?' + role, 'g'), new RegExp('\\b' + role + '(?:\\s+(?:and|&)\\s+(?:CEO|President))?\\s*[:–—-]?\\s+' + person, 'g'), new RegExp('\\b(?:founded|established|started)(?: in \\d{4})? by\\s+' + person, 'g'), new RegExp('\\bowned (?:and operated )?by\\s+' + person, 'g')]) {
    for (const match of text.matchAll(expression)) { const name = usableName(match[1]); if (name) names.push(name); }
  }
  return [...new Set(names)];
}
function robotsRules(text, agent = 'leadgen website review/1.0') {
  const groups = []; let current = null;
  for (const line of String(text).split(/\r?\n/)) {
    const match = line.replace(/#.*$/, '').match(/^\s*([\w-]+)\s*:\s*(.*?)\s*$/); if (!match) continue;
    const key = match[1].toLowerCase(), value = match[2];
    if (key === 'user-agent') {
      if (!current || current.started) { current = { agents: [], rules: [], delay: 0, started: false }; groups.push(current); }
      current.agents.push(value.toLowerCase());
    } else if (current) {
      current.started = true;
      if (['allow', 'disallow'].includes(key) && value) current.rules.push({ allow: key === 'allow', path: value });
      if (key === 'crawl-delay' && Number.isFinite(Number(value))) current.delay = Math.max(current.delay, Number(value) * 1000);
    }
  }
  const matching = groups.filter(g => g.agents.some(a => a !== '*' && agent.includes(a)));
  const selected = matching.length ? matching : groups.filter(g => g.agents.includes('*'));
  return { rules: selected.flatMap(g => g.rules), delay: Math.max(800, ...selected.map(g => g.delay)) };
}
function robotsAllows(rules, url) {
  const u = new URL(url); const path = u.pathname + u.search;
  let best = null;
  for (const rule of rules.rules) {
    const regex = '^' + rule.path.split('*').map(p => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*').replace(/\\\$$/, '$');
    if (new RegExp(regex).test(path) && (!best || rule.path.length > best.path.length || rule.path.length === best.path.length && rule.allow)) best = rule;
  }
  return !best || best.allow;
}

function createEngine({ cheerio, network, verification, chainDomains = [], fetcher = network.safeFetchText, mxResolver = value => dns.resolveMx(value) }) {
  const mxCache = new Map();
  function allowedEmail(raw) {
    const email = cleanEmail(raw);
    return verification.isValidSyntax(email) && !verification.isRoleBasedEmail(email) && !verification.checkDomainBlacklist(email.split('@')[1]).blocked && !/\.(?:png|jpg|jpeg|webp|svg|gif|avif)$/i.test(email) ? email : '';
  }
  function factsFromHtml(html, url) {
    const $ = cheerio.load(html); const contacts = [], owners = [], sizeFacts = [], commerce = [], niche = [], links = [];
    const pageTitle = norm($('title').first().text());
    const add = (raw, snippet, binding = null, kind = 'visible-page') => {
      const email = allowedEmail(raw); if (!email) return;
      contacts.push({ email, sourceUrl: url, snippet: norm(snippet).slice(0, 900), kind, ownerBinding: binding, department: isDepartment(email) });
    };
    const orgTypes = /Organization|Corporation|Store|Business|OrganizationRole/;
    const visit = (obj, depth = 0, relatedBusiness = true) => {
      if (!obj || typeof obj !== 'object' || depth > 12) return;
      if (Array.isArray(obj)) return obj.slice(0, 150).forEach(v => visit(v, depth + 1, relatedBusiness));
      const type = String(obj['@type'] || '');
      if (/Product/.test(type) && obj.offers) commerce.push({ kind: 'product-offer', sourceUrl: url, snippet: norm(obj.name || 'Product with published offer').slice(0, 300) });
      if (orgTypes.test(type)) {
        const linkedDomain = host(obj.url || obj['@id'] || '');
        relatedBusiness = !linkedDomain || linkedDomain === host(url);
        if (relatedBusiness) {
          const n = obj.numberOfEmployees;
          if (n !== undefined) {
            const low = Number(n?.minValue ?? n?.value ?? n), high = Number(n?.maxValue ?? n?.value ?? n);
            if (Number.isFinite(low) && low > 0 && Number.isFinite(high) && high >= low) sizeFacts.push({ minimum: low, maximum: high, sourceUrl: url, snippet: 'Published numberOfEmployees: ' + JSON.stringify(n).slice(0, 200) });
          }
          for (const role of ['owner', 'founder']) for (const p of [obj[role]].flat().filter(Boolean)) {
            const name = usableName(typeof p === 'string' ? p : p.name);
            if (!name) continue;
            const evidence = { name, role, currentOwnershipConfirmed: false, sourceUrl: url, snippet: 'Published structured business ' + role + ': ' + name, kind: 'structured-business-person', historical: false };
            owners.push(evidence);
            if (p.email) add(p.email, evidence.snippet, evidence, 'structured-person-email');
          }
        }
      }
      if (/Person/.test(type) && OWNER.test(norm(obj.jobTitle)) && relatedBusiness) {
        const name = usableName(obj.name);
        if (name) { const evidence = { name, role: norm(obj.jobTitle), currentOwnershipConfirmed: false, sourceUrl: url, snippet: name + ', ' + norm(obj.jobTitle), kind: 'structured-person', historical: HISTORICAL.test(norm(obj.jobTitle)) }; owners.push(evidence); if (obj.email) add(obj.email, evidence.snippet, evidence, 'structured-person-email'); }
      }
      for (const [key, value] of Object.entries(obj)) if (key !== '@context' && !['review', 'reviews', 'author', 'comment', 'itemListElement'].includes(key)) visit(value, depth + 1, relatedBusiness);
    };
    $('script[type="application/ld+json"]').each((_, el) => { try { visit(JSON.parse($(el).text())); } catch { /* Ignore invalid publisher markup. */ } });
    const platform = /Shopify\.(?:shop|theme)|cdn\.shopify\.com|myshopify\.com/i.test(html) ? 'Shopify' : /woocommerce|wc-add-to-cart/i.test(html) ? 'WooCommerce' : /bigcommerce/i.test(html) ? 'BigCommerce' : /mage\/|Magento/i.test(html) ? 'Magento' : '';
    $('script,style,noscript,svg,template').remove();
    $('[hidden],[aria-hidden="true"]').remove();
    $('[data-cfemail]').each((_, el) => {
      const hex = $(el).attr('data-cfemail');
      if (!/^(?:[0-9a-f]{2}){4,255}$/i.test(hex || '')) return;
      const key = parseInt(hex.slice(0, 2), 16);
      const decoded = Array.from({ length: hex.length / 2 - 1 }, (_, i) => String.fromCharCode(parseInt(hex.slice(2 + i * 2, 4 + i * 2), 16) ^ key)).join('');
      if (allowedEmail(decoded)) { $(el).text(decoded); if ($(el).is('a')) $(el).attr('href', 'mailto:' + decoded); else if ($(el).parent().is('a')) $(el).parent().attr('href', 'mailto:' + decoded); }
    });
    $('p,li,h1,h2,h3,h4,h5,br').prepend(' ').append(' ');
    const text = norm($('body').text());
    const scope = norm([pageTitle, $('h1,h2,h3').text(), $('meta[name="description"]').attr('content'), text.slice(0, 16000)].join(' '));
    const furnitureTerms = scope.match(/\b(?:furniture|furnishings|home decor|sofas?|couches|armchairs?|dining tables?|coffee tables?|sideboards?|bookcases?|beds?|mattresses|cabinets|lighting|rugs?|wall art)\b/ig) || [];
    if (furnitureTerms.length >= 2) niche.push({ sourceUrl: url, terms: [...new Set(furnitureTerms.map(s => s.toLowerCase()))].slice(0, 15) });
    $('button,a,input[type="submit"]').each((_, el) => {
      const value = norm($(el).text() + ' ' + ($(el).attr('value') || ''));
      if (/\b(?:add to (?:cart|bag|basket)|buy now|checkout)\b/i.test(value)) commerce.push({ kind: 'purchase-control', sourceUrl: url, snippet: value.slice(0, 150) });
    });
    $('form[action],a[href]').each((_, el) => {
      const raw = $(el).attr('action') || $(el).attr('href');
      try {
        const u = new URL(raw, url); if (!['http:', 'https:'].includes(u.protocol) || host(u.href) !== host(url)) return;
        if (/\/(?:cart|checkout|basket)(?:\/|$)/i.test(u.pathname)) commerce.push({ kind: 'cart-route', sourceUrl: url, targetUrl: u.href, snippet: norm($(el).text()).slice(0, 150) || u.pathname });
        if (u.search || /\.(?:pdf|jpg|png|zip|svg|webp)$/i.test(u.pathname)) return;
        u.hash = '';
        const label = norm($(el).text());
        const priority = /owner|founder|leadership|our-team|meet-the-team|our-story/i.test(u.pathname + ' ' + label) ? 1 : /about|team|story|contact/i.test(u.pathname + ' ' + label) ? 2 : /\/products?\/|\/collections?\/|\/shop(?:\/|$)/i.test(u.pathname) ? 3 : /polic|terms|privacy/i.test(u.pathname) ? 5 : 9;
        if (priority < 9) links.push({ url: u.href, priority });
      } catch { /* Ignore malformed links. */ }
    });
    // Small, local blocks only: a founder mention elsewhere on a page is not email ownership.
    const blockEvidence = new Map();
    $('p,li,address,h1,h2,h3,h4').each((_, el) => {
      if ($(el).closest('blockquote,[itemprop="review"],.testimonial,.review,.reviews').length) return;
      const snippet = norm($(el).text()); if (!snippet || snippet.length > 650) return;
      if (OWNER.test(snippet) || HISTORICAL.test(snippet)) for (const name of ownerNames(snippet)) owners.push({ name, role: (snippet.match(OWNER) || [])[0] || 'historical founder candidate', sourceUrl: url, snippet, historical: HISTORICAL.test(snippet), currentOwnershipConfirmed: false, kind: 'published-text' });
      const count = snippet.match(/\b(?:team of|staff of|we employ|we have)\s+(\d{1,5})\s+(?:employees|people|staff|team members)\b/i);
      if (count) sizeFacts.push({ minimum: Number(count[1]), maximum: Number(count[1]), sourceUrl: url, snippet });
      blockEvidence.set(el, snippet);
    });
    $('a[href]').each((_, el) => {
      const raw = $(el).attr('href'); if (!/^mailto:/i.test(raw)) return;
      let context = $(el).parent();
      if (context.is('body,html') || context.closest('blockquote,.testimonial,.review,.reviews').length) { add(raw, $(el).text()); return; }
      for (let i = 0; i < 2 && norm(context.text()).length < 70 && !context.parent().is('body,html'); i++) context = context.parent();
      const snippet = norm(context.text());
      let names = snippet.length <= 650 && !HISTORICAL.test(snippet) ? ownerNames(snippet) : [];
      if (!names.length && snippet.length <= 650 && OWNER.test(snippet) && !HISTORICAL.test(snippet)) {
        names = [...new Set(context.find('h2,h3,h4,[itemprop="name"]').toArray().map(n => usableName($(n).text())).filter(Boolean))];
      }
      const distinctAddresses = [...new Set((snippet.match(EMAIL) || []).map(cleanEmail))];
      const binding = names.length === 1 && distinctAddresses.length <= 1 ? { name: names[0], role: (snippet.match(OWNER) || [])[0], sourceUrl: url, snippet, historical: false, currentOwnershipConfirmed: false, kind: 'same-person-block' } : null;
      if (binding) owners.push(binding);
      add(raw, snippet.length <= 900 ? snippet : $(el).text(), binding, 'mailto');
    });
    for (const snippet of blockEvidence.values()) {
      const emails = [...new Set((snippet.match(EMAIL) || []).map(cleanEmail))];
      const names = !HISTORICAL.test(snippet) ? ownerNames(snippet) : [];
      const binding = names.length === 1 && emails.length === 1 ? { name: names[0], role: (snippet.match(OWNER) || [])[0], sourceUrl: url, snippet, historical: false, currentOwnershipConfirmed: false, kind: 'same-person-block' } : null;
      for (const email of emails) add(email, snippet, binding);
    }
    // Plain body addresses retained as unassigned contacts, never automatically owners.
    for (const email of text.match(EMAIL) || []) add(email, 'Email published in page text; person attribution not established', null, 'page-text');
    const blocked = /just a moment|verify you are human|access denied|captcha|checking your browser/i.test(pageTitle) || text.length < 80 && /enable javascript|javascript is required/i.test(text);
    const parked = /domain (?:is )?for sale|buy this domain|this domain is parked|website coming soon/i.test(pageTitle + ' ' + text.slice(0, 500));
    return { pageTitle, textLength: text.length, platform, blocked, parked, contacts: unique(contacts, c => c.email + ':' + (c.ownerBinding?.name || '')), owners: unique(owners, o => slug(o.name) + ':' + o.sourceUrl), sizeFacts, commerce, niche, links: unique(links.sort((a, b) => a.priority - b.priority), l => l.url).slice(0, 30) };
  }

  async function domainMail(email) {
    const domain = email.split('@')[1];
    if (!mxCache.has(domain)) mxCache.set(domain, (async () => {
      try {
        const records = await verification.bounded(mxResolver(domain), 5000);
        const usable = records.filter(r => r.exchange && r.exchange !== '.');
        return { status: usable.length ? 'mail-routing-found' : 'no-mail-routing', mx: usable.map(r => r.exchange).slice(0, 5), checkedAt: new Date().toISOString(), mailboxVerified: false };
      } catch (e) { return { status: ['ENODATA', 'ENOTFOUND'].includes(e.code) ? 'no-mail-routing' : 'dns-unknown', checkedAt: new Date().toISOString(), mailboxVerified: false }; }
    })());
    return mxCache.get(domain);
  }

  async function crawlSite(website, { maxPages = 8, timeoutMs = 45000, signal } = {}) {
    const started = Date.now(); const controller = new AbortController(); const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true }); if (signal?.aborted) controller.abort();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const result = { website, domain: host(website), startedAt: new Date().toISOString(), checkedAt: '', status: 'unavailable', pages: [], errors: [], contacts: [], owners: [], sizeFacts: [], commerce: [], niche: [], platforms: [], robots: { status: 'not-checked' }, emailsSent: 0, paidVerificationPerformed: false };
    let lastRequest = 0, rules = { rules: [], delay: 800 };
    const request = async url => {
      if (controller.signal.aborted) throw new Error('Site research time limit');
      const delay = rules.delay - (Date.now() - lastRequest); if (delay > 0) await sleep(Math.min(delay, 10000));
      if (controller.signal.aborted) throw new Error('Site research time limit');
      lastRequest = Date.now();
      return fetcher(url, 0, { allowedHost: result.domain, signal: controller.signal });
    };
    try {
      const u = new URL(/^https?:\/\//i.test(website) ? website : 'https://' + website);
      if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || !['', '80', '443'].includes(u.port) || !u.hostname.includes('.') || DIRECTORY.test(u.hostname)) throw new Error('Not an independent public business website');
      const robotsUrl = new URL('/robots.txt', u).href;
      try {
        const r = await request(robotsUrl);
        if (host(r.url || robotsUrl) !== result.domain) throw new Error('Cross-domain robots redirect blocked');
        rules = robotsRules(r.text);
        result.robots = { status: 'loaded', sourceUrl: robotsUrl, crawlDelayMs: rules.delay };
      } catch (e) {
        const message = String(e.message);
        if (/HTTP (?:404|410)/.test(message)) result.robots = { status: 'not-published', sourceUrl: robotsUrl };
        else { result.robots = { status: 'unavailable', sourceUrl: robotsUrl }; throw new Error('Robots policy unavailable; retry required: ' + message); }
      }
      if (rules.delay > 10000) { result.status = 'deferred-crawl-delay'; return result; }
      const seen = new Set(); const queue = [{ url: u.href, priority: 0 }];
      while (queue.length && seen.size < maxPages && !controller.signal.aborted) {
        queue.sort((a, b) => a.priority - b.priority);
        const item = queue.shift(); if (seen.has(item.url)) continue; seen.add(item.url);
        if (!robotsAllows(rules, item.url)) { result.errors.push({ url: item.url, reason: 'robots-disallowed' }); continue; }
        try {
          const response = await request(item.url);
          const finalUrl = response.url || item.url;
          if (host(finalUrl) !== result.domain) throw new Error('Cross-domain redirect requires identity review');
          if (response.contentType && !/html|xhtml/i.test(response.contentType)) throw new Error('Not an HTML page');
          const facts = factsFromHtml(response.text, finalUrl);
          result.pages.push({ url: finalUrl, title: facts.pageTitle, textLength: facts.textLength, blocked: facts.blocked, parked: facts.parked, contentSha256: sha(response.text), checkedAt: new Date().toISOString() });
          if (facts.blocked || facts.parked) continue;
          for (const key of ['contacts', 'owners', 'sizeFacts', 'commerce', 'niche']) result[key].push(...facts[key]);
          if (facts.platform) result.platforms.push(facts.platform);
          for (const link of facts.links) if (!seen.has(link.url) && !queue.some(q => q.url === link.url)) queue.push(link);
          if (result.pages.length === 1 && !facts.links.some(l => /about|story|team|owner|founder/i.test(new URL(l.url).pathname))) {
            const paths = facts.platform === 'Shopify' ? ['/pages/about-us', '/pages/our-story'] : ['/about', '/about-us'];
            for (const path of paths) queue.push({ url: new URL(path, finalUrl).href, priority: 2.5 });
          }
        } catch (e) {
          result.errors.push({ url: item.url, reason: norm(e.message).slice(0, 250) });
          if (/HTTP (?:429|403|503)/.test(e.message)) { result.status = 'blocked-or-rate-limited'; break; }
        }
      }
      if (result.pages.some(p => !p.blocked && !p.parked)) result.status = controller.signal.aborted ? 'partial-time-limit' : 'researched';
      else if (result.pages.some(p => p.blocked)) result.status = 'browser-or-manual-review-needed';
      else if (result.pages.some(p => p.parked)) result.status = 'parked-or-coming-soon';
    } catch (e) { result.errors.push({ url: website, reason: norm(e.message).slice(0, 250) }); }
    finally { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); result.checkedAt = new Date().toISOString(); result.elapsedMs = Date.now() - started; }
    result.contacts = unique(result.contacts.sort((a, b) => Number(Boolean(b.ownerBinding)) - Number(Boolean(a.ownerBinding))), c => c.email).slice(0, 150);
    result.owners = unique(result.owners, o => slug(o.name) + ':' + o.sourceUrl).slice(0, 50);
    result.sizeFacts = unique(result.sizeFacts, f => f.minimum + ':' + f.maximum + ':' + f.sourceUrl);
    result.platforms = [...new Set(result.platforms)];
    return result;
  }

  function assessBusiness(b, site) {
    const domain = host(b.website); const excludedReasons = [];
    if (chainDomains.some(d => domain === d || domain.endsWith('.' + d))) excludedReasons.push('known-chain-or-enterprise');
    if (site.sizeFacts.some(f => f.minimum > 250)) excludedReasons.push('published-employee-count-over-250');
    const validPages = site.pages.filter(p => !p.blocked && !p.parked);
    const ecommerce = site.commerce.some(c => c.kind === 'purchase-control') || site.commerce.some(c => c.kind === 'product-offer') && site.commerce.some(c => c.kind === 'cart-route');
    const brandTokens = norm(b.name).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(s => s.length >= 4 && !/^(?:furniture|store|stores|outlet|design|home|decor|shop|company|interiors|llc|inc)$/.test(s));
    const titleText = validPages.map(p => p.title).join(' ').toLowerCase();
    const titleMatch = brandTokens.length > 0 && brandTokens.some(t => titleText.includes(t));
    const owners = site.owners.filter(o => !o.historical);
    const siteEmails = new Set(site.contacts.map(c => c.email));
    const stored = (b.emails || []).map(allowedEmail).filter(email => email && !siteEmails.has(email)).map(email => ({ email, sourceUrl: '', sourceBusinessId: b.id, snippet: 'Stored in the original lead dataset; not republished on the pages reached during this scan', kind: 'stored-email-only', ownerBinding: null, department: isDepartment(email) }));
    const contacts = [...site.contacts, ...stored].map(c => {
      let binding = c.ownerBinding;
      if (!binding && !c.department) {
        const local = slug(c.email.split('@')[0]);
        const matches = unique(owners.filter(o => { const parts = slug(o.name); return parts.length >= 6 && local === parts; }), o => slug(o.name));
        if (matches.length === 1) binding = { ...matches[0], kind: c.kind === 'stored-email-only' ? 'stored-full-name-email-match' : 'published-name-email-match', currentOwnershipConfirmed: false };
        if (!binding && local.length >= 4) {
          const shortMatches = unique(owners.filter(o => slug(o.name.split(' ')[0]) === local), o => slug(o.name));
          if (shortMatches.length === 1) binding = { ...shortMatches[0], kind: 'first-name-only-email-match', currentOwnershipConfirmed: false };
        }
      }
      const emailDomain = c.email.split('@')[1];
      const domainMatches = emailDomain === domain || emailDomain.endsWith('.' + domain);
      const unrelatedDomain = !domainMatches && !PERSONAL_DOMAINS.has(emailDomain);
      const directEvidence = binding && ['structured-person-email', 'structured-business-person', 'structured-person', 'same-person-block'].includes(c.kind === 'structured-person-email' ? c.kind : binding.kind) && !binding.historical;
      const suggested = Boolean(directEvidence && !c.department && !unrelatedDomain && validPages.length && ecommerce && site.niche.length && !excludedReasons.length && titleMatch);
      return { ...c, ownerBinding: binding, sourceBusinessIds: [b.id], domainMatches, unrelatedDomain, evidenceTier: suggested ? 'published-owner-email-candidate' : binding && !c.department ? 'owner-email-needs-review' : 'general-contact-only', ownerCurrentStatusConfirmed: false, mailboxVerification: 'not-performed', sendApproved: false, reasons: [!ecommerce && 'ecommerce-not-established', !site.niche.length && 'niche-not-established', !titleMatch && 'business-identity-needs-review', c.department && 'shared-department-address', unrelatedDomain && 'unrelated-email-domain', !binding && 'owner-email-link-not-established', binding?.historical && 'historical-owner-only', ...excludedReasons].filter(Boolean) };
    });
    const size = site.sizeFacts.find(f => f.minimum >= 1 && f.maximum <= 250);
    return { businessId: b.id, name: b.name, website: b.website, country: b.country || '', city: b.city || '', state: b.state || '', sourceEmailCount: b.emails.length, storedEmails: b.emails, siteDomain: domain, checkedAt: site.checkedAt, websiteStatus: site.status, ecommerceEvidenceFound: ecommerce, nicheEvidenceFound: site.niche.length > 0, identityTitleMatch: titleMatch, excludedReasons, sizeEvidence: size || null, independentBusinessConfirmed: false, owners: site.owners, contacts, followUpNeeded: [!validPages.length && 'website-unavailable-or-blocked', !ecommerce && 'confirm-online-purchasing', !site.niche.length && 'confirm-furniture-decor-products', !titleMatch && 'review-website-business-identity', !size && 'published-business-size-missing', 'confirm-current-owner-and-independent-business', !contacts.some(c => c.evidenceTier === 'published-owner-email-candidate') && 'direct-owner-email-missing', 'paid-mailbox-verification-required'].filter(Boolean), sendApproved: false };
  }
  return { factsFromHtml, crawlSite, assessBusiness, allowedEmail, domainMail };
}

function csvCell(value) {
  let s = Array.isArray(value) ? value.join(' | ') : String(value ?? '');
  // Defend CSV consumers against spreadsheet formula injection.
  let first = 0; while (first < s.length && (s.charCodeAt(first) <= 32 || /\s/.test(s[first]))) first++;
  if (/^[=+@-]/.test(s.slice(first))) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}
function csv(headers, rows) { return '\uFEFF' + [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n'; }
module.exports = { createEngine, eligibleLead, host, sha, norm, slug, isDepartment, ownerNames, usableName, robotsRules, robotsAllows, csv };
