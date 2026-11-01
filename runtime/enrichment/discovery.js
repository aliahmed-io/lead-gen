'use strict';
const crypto = require('node:crypto');
const { app, domain, publicUrl, sha } = require('./common');
const { providerLookup } = require('./providers');
const { loadRobots, allowed } = app('./runtime/pipeline/robots');
const { fetchPage } = app('./runtime/pipeline/http');
const { createEngine } = app('./runtime/master-research');
const { DAY } = require('./segments');
async function discover(registry, { limit = 20, concurrency = 3, maxSearchCalls = 0, runId = crypto.randomUUID(), env = process.env, engine, fetcher = fetchPage, signal, segment = 'priority_ar_decor', ...options } = {}) {
  if (!Number.isInteger(limit) || limit < 0 || limit > 10000 || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 6) throw new Error('Invalid research limit/concurrency');
  engine = engine || createEngine({ cheerio: app('cheerio'), network: app('./runtime/network'), verification: app('./runtime/verification'), chainDomains: app('./runtime/chain-domains'), fetcher: async (url, _redirects, opts) => {
    const r = await fetcher(url, { signal: opts.signal });
    if (r.status < 200 || r.status >= 300) throw new Error('Website HTTP ' + r.status);
    if (opts.allowedHost && domain(r.url || url) !== opts.allowedHost) throw new Error('Cross-domain identity review required');
    return r;
  } });
  const all = registry.prioritizedDomains(segment);
  const searchRequested = Boolean(env.BRAVE_SEARCH_API_KEY) && maxSearchCalls > 0;
  const reusable = cached => cached && cached.expires > registry.now() && (!searchRequested || JSON.parse(cached.payload).searchUsed === true);
  const uncached = all.filter(b => !reusable(registry.db.prepare('SELECT expires,payload FROM requests WHERE key=?').get(sha('owner-discovery-v1:' + b.domain))));
  const candidates = uncached.slice(0, limit), queue = [...candidates];
  const result = { considered: candidates.length, crawled: 0, successfulWebsites: 0, websiteOutcomes: {}, cached: all.length - uncached.length, ownersObserved: 0, contactObservations: 0, deferred: [], searchConfigured: Boolean(env.BRAVE_SEARCH_API_KEY), paidSearchBudget: maxSearchCalls, emailsSent: 0 };
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length && !signal?.aborted) {
      const b = queue.shift(), key = sha('owner-discovery-v1:' + b.domain);
      const previous = registry.db.prepare('SELECT * FROM requests WHERE key=?').get(key);
      if (reusable(previous)) { result.cached++; continue; }
      const origin = new URL(b.website.includes('://') ? b.website : 'https://' + b.website).origin;
      try {
        const robots = await loadRobots(origin, { fetchPage: fetcher, signal });
        if (robots.status === 'unreachable' || robots.delay > 10000 || !allowed(robots, origin + '/')) throw new Error('robots-policy-or-crawl-delay-held');
        let seeds = ['/', '/about', '/about-us', '/pages/about-us'].map(p => new URL(p, origin).href), searchUsed = false;
        if (maxSearchCalls > 0) {
          const search = await providerLookup(registry, 'brave', 'search', { q: 'site:' + b.domain + ' ("founder" OR "owner" OR "our team")', count: 10 }, { ...options, env, maxCalls: maxSearchCalls, runId });
          if (search.data) {
            searchUsed = true;
            const urls = (search.data.web?.results || []).map(r => publicUrl(r.url)).filter(u => domain(u) === b.domain);
            seeds = [...new Set([...urls, ...seeds])];
          } else if (previous && previous.expires > registry.now()) { result.cached++; continue; }
        }
        const site = await engine.crawlSite(origin + '/', { seedUrls: seeds, maxPages: 10, timeoutMs: 70000, robots, signal });
        const assessment = engine.assessBusiness({ ...b, emails: b.emails || [] }, site);
        const useful = site.pages.some(p => !p.blocked && !p.parked);
        result.websiteOutcomes[site.status] = (result.websiteOutcomes[site.status] || 0) + 1;
        if (useful) result.successfulWebsites++;
        let observed = 0;
        for (const o of assessment.owners.filter(o => !o.historical)) {
          const owner = registry.owner(b.domain, o.name, { role: o.role, sourceUrl: o.sourceUrl, snippet: o.snippet, provenance: 'public-website-owner-candidate' });
          if (owner) { observed++; result.ownersObserved++; }
        }
        for (const c of assessment.contacts.filter(c => c.ownerBinding && !c.ownerBinding.historical)) {
          const owner = registry.findOwner(b.domain, c.ownerBinding.name); if (!owner) continue;
          if (registry.contact(c.email, owner.id, { provenance: c.bindingEvidence === 'published-person-email' ? 'published-person-email' : 'inferred-association', sourceUrl: c.sourceUrl, evidence: c.snippet, verification: null })) result.contactObservations++;
        }
        const payload = { status: site.status, checkedAt: registry.now(), pages: site.pages.map(p => p.url), ownersObserved: observed, errors: site.errors, searchUsed };
        registry.db.prepare('INSERT OR REPLACE INTO requests VALUES(?,?,?,?,?)').run(key, 'public-owner-research', useful ? 'complete' : 'failed', registry.now() + (useful ? 14 * DAY : DAY), JSON.stringify(payload));
        registry.event('owner-research', { domain: b.domain, ...payload }); result.crawled++;
      } catch (e) {
        const reason = /robots-policy/.test(e.message) ? 'robots-policy-or-crawl-delay-held' : 'website-research-failed';
        registry.db.prepare('INSERT OR REPLACE INTO requests VALUES(?,?,?,?,?)').run(key, 'public-owner-research', 'failed', registry.now() + DAY, JSON.stringify({ reason }));
        registry.event('owner-research-held', { domain: b.domain, reason }); result.deferred.push({ domain: b.domain, reason });
      }
    }
  }));
  return result;
}
module.exports = { discover };
