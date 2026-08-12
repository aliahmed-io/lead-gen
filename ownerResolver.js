// @ts-check
/**
 * @module ownerResolver
 * @description Stage 2 of the owner discovery pipeline: identifies the human
 * behind the business using public search results — no API keys required.
 *
 * Strategy:
 *   1. Merge person evidence already harvested from the website (weighted).
 *   2. Run public search-engine lookups for `"[business]" [location] owner`
 *      style queries via DuckDuckGo's public HTML endpoint (polite UA,
 *      8s timeout, max 2 queries per lead).
 *   3. Parse titles/snippets for capitalized person names near role keywords.
 *   4. Merge into a ranked candidate list with per-source confidence.
 *
 * Cache: results are kept in-memory per domain for the session, so batch
 * runs never double-query the same business.
 */
const https = require('https');
const http = require('http');

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

/**
 * @typedef {Object} OwnerCandidate
 * @property {string} name
 * @property {string} role - e.g. 'Owner', 'Founder', 'CEO', 'unknown'
 * @property {string} source - 'website_jsonld' | 'website_text' | 'website_hcard' | 'search' | 'website_title'
 * @property {number} confidence - 0..100
 */

const SEARCH_TIMEOUT = 8000;
const MAX_SEARCH_QUERIES = 2;
const SEARCH_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/** @type {Record<string, {candidates: OwnerCandidate[], at: number}>} */
const searchCache = {};
const CACHE_TTL = 15 * 60 * 1000;

const ROLE_KEYWORDS = /\b(owner|founder|co-founder|cofounder|ceo|chief executive|principal|president|proprietor|partner|director)\b/i;

const SOURCE_CONFIDENCE = {
  website_jsonld: 75,
  website_text: 70,
  website_hcard: 60,
  website_title: 35,
  search: 55,
};

/* ------------------------------------------------------------------ */
/*  Search                                                            */
/* ------------------------------------------------------------------ */

/**
 * Fetch public web-search results for a query (no API key). Tries Bing's
 * public results page first; falls back to DuckDuckGo's HTML endpoint.
 * Either provider may rate-limit or serve a challenge, so null is a
 * valid "no data" outcome — the pipeline degrades gracefully.
 * @param {string} query
 * @returns {Promise<string|null>} raw HTML or null
 */
function publicSearch(query) {
  return new Promise(resolve => {
    try {
      const url = 'https://www.bing.com/search?q=' + encodeURIComponent(query);
      const client = url.startsWith('https') ? https : http;
      const req = client.get(url, {
        headers: {
          'User-Agent': SEARCH_UA,
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
        timeout: SEARCH_TIMEOUT,
      }, res => {
        if (res.statusCode && res.statusCode >= 400) { res.destroy(); resolve(null); return; }
        /** @type {Buffer[]} */
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        res.on('error', () => resolve(null));
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
    } catch {
      resolve(null);
    }
  });
}

/**
 * Pull capitalized person-name candidates from search result titles/snippets.
 * @param {string} html
 * @param {string} businessName - used to avoid treating the business name as a person
 * @returns {OwnerCandidate[]}
 */
function parseSearchResults(html, businessName) {
  const out = [];
  const seen = new Set();
  /* DuckDuckGo result blocks: <a class="result__a">title</a> + snippets */
  const blocks = html.match(/result__a[^>]*>([^<]{6,200})<\/a>/g) || [];
  const texts = blocks
    .map(b => (b.match(/>([^<]{6,200})<\/a>/) || [])[1] || '')
    .map(t => t.replace(/&#x27;|&quot;|&#39;/g, "'").replace(/&amp;/g, '&').trim());
  /* Bing result titles: <h2><a ...>title</a></h2> */
  const bingBlocks = html.match(/<h2><a[^>]*>([^<]{6,200})<\/a><\/h2>/g) || [];
  const bingTexts = bingBlocks
    .map(b => (b.match(/>([^<]{6,200})<\/a>/) || [])[1] || '')
    .map(t => t.replace(/&#x27;|&quot;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim());
  /* Bing snippets (b_caption) — often contain "Owner: John Smith" lines */
  const captionBlocks = html.match(/<div class="b_caption">[^<]{0,10}<p>([^<]{6,400})/g) || [];
  const captionTexts = captionBlocks
    .map(b => (b.match(/<p>([^<]{6,400})/) || [])[1] || '')
    .map(t => t.replace(/&#x27;|&quot;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim());
  /* Markup-agnostic fallback: strip tags and scan the raw visible text.
   * Works regardless of which provider served the page and how it marked up
   * titles/snippets — role keywords near a capitalized name anywhere on the
   * results page are fair game. */
  const visibleText = html
    .replace(/<script[^>]*>.*?<\/script>/gs, ' ')
    .replace(/<style[^>]*>.*?<\/style>/gs, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&quot;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ');
  const visibleTexts = visibleText.split(/\.(?=\s|$)/)
    .map(s => s.trim())
    .filter(s => s.length > 10 && s.length < 400 && ROLE_KEYWORDS.test(s));
  const allTexts = [...texts, ...bingTexts, ...captionTexts, ...visibleTexts];

  const nameCap = /\b([A-Z][a-z]{2,}(?:\s+(?:[A-Z][a-z]{2,}|[A-Z]\.))+)\b/;
  /* business name words to exclude from person guesses */
  const bizWords = new Set(businessName.toLowerCase().split(/[^a-z]+/).filter(w => w.length > 2));

  for (const t of allTexts) {
    if (!ROLE_KEYWORDS.test(t)) continue;
    const m = t.match(nameCap);
    if (!m) continue;
    const name = m[1].trim();
    const lw = name.toLowerCase();
    if (seen.has(lw)) continue;
    if (bizWords.has(lw.split(/\s+/)[0]) || bizWords.has(lw.split(/\s+/)[1] || '')) continue;
    if (/^(The|Our|Meet|Visit|Contact|Email|Call|Say|Hi|Hello|Welcome|New|Local|Best|Top|Small|Family|How|Why|What|When|Where|Who)$/i.test(name.split(' ')[0])) continue;
    const roleMatch = t.match(ROLE_KEYWORDS);
    seen.add(lw);
    out.push({
      name,
      role: roleMatch ? roleMatch[1].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'unknown',
      source: 'search',
      confidence: SOURCE_CONFIDENCE.search,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Orchestrator                                                      */
/* ------------------------------------------------------------------ */

/**
 * Resolve owner identity candidates for a lead.
 * @param {{ website: string; name?: string; businessName?: string; city?: string; state?: string; persons?: import('./websiteHarvester').HarvestedPerson[] }} lead
 * @returns {Promise<OwnerCandidate[]>} ranked list (highest confidence first)
 */
async function resolveOwnerIdentity(lead) {
  const businessName = String(lead.name || lead.businessName || '').trim();
  const city = String(lead.city || '').trim();
  const state = String(lead.state || '').trim();
  const location = [city, state].filter(Boolean).join(', ');

  /* start from website-harvested persons, re-sourced */
  const candidates = [];
  for (const p of (lead.persons || [])) {
    const source = p.source === 'jsonld' ? 'website_jsonld'
      : p.source === 'hcard' ? 'website_hcard'
      : p.source === 'title_tag' ? 'website_title'
      : 'website_text';
    candidates.push({ name: p.name, role: p.role, source, confidence: p.confidence });
  }

  /* search-engine lookups (cached per location+business) */
  const cacheKey = `${businessName.toLowerCase()}|${location.toLowerCase()}`;
  const cached = searchCache[cacheKey];
  let searched = [];
  if (cached && Date.now() - cached.at < CACHE_TTL) {
    searched = cached.candidates;
  } else if (businessName && location) {
    const queries = [
      `"${businessName}" ${location} owner`,
      `"${businessName}" ${location} founder OR CEO`,
    ];
    for (const q of queries.slice(0, MAX_SEARCH_QUERIES)) {
      const html = await publicSearch(q);
      if (html) searched.push(...parseSearchResults(html, businessName));
      /* pace the search provider */
      await new Promise(r => setTimeout(r, 700));
    }
    searchCache[cacheKey] = { candidates: searched, at: Date.now() };
  }

  /* merge + rank; dedupe by lowercase name keeping highest confidence */
  const all = [...candidates, ...searched];
  const byName = new Map();
  for (const c of all) {
    const key = c.name.toLowerCase();
    const existing = byName.get(key);
    if (!existing || c.confidence > existing.confidence) byName.set(key, c);
  }
  return Array.from(byName.values()).sort((a, b) => b.confidence - a.confidence).slice(0, 5);
}

/** @param {string} name e.g. 'John Smith' */
function nameVariants(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return [];
  const first = parts[0].toLowerCase().replace(/[^a-z]/g, '');
  const rest = parts.slice(1).map(p => p.toLowerCase().replace(/[^a-z]/g, '')).join('');
  const variants = [
    first,                      // john@
    `${first}.${rest}@`,        // john.smith@ (caller appends domain)
    `${first[0]}.${rest}@`,     // j.smith@
    `${first}${rest}@`,         // johnsmith@
    `${first[0]}${rest}@`,      // jsmith@
  ];
  return variants.map(v => v.replace(/\.$/, ''));
}

module.exports = { resolveOwnerIdentity, nameVariants, parseSearchResults, publicSearch };
