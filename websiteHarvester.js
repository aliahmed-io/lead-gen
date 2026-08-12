// @ts-check
/**
 * @module websiteHarvester
 * @description Stage 1 of the owner discovery pipeline: deep-crawls a lead's
 * website and extracts BOTH emails and person names with their roles.
 *
 * What it harvests:
 *   1. Emails from homepage + about/team/contact pages (reuse of
 *      emailFinder.js extraction helpers) — personal emails are preferred,
 *      role mailboxes (info@, contact@) are reported separately for the
 *      fallback ladder.
 *   2. Person names attached to owner-ish roles (owner, founder, CEO,
 *      principal, head chef, manager) from visible text near role keywords,
 *      JSON-LD `Person` structured data, and title-tag hints.
 *
 * Polite settings: 4s per-page timeout, capped page visits, single UA.
 */
const axios = require('axios');
const cheerio = require('cheerio');
const emailFinder = require('./emailFinder');

/**
 * Extract a lowercase domain from a URL (emailFinder doesn't export its
 * internal extractDomain, so we reimplement the same semantics here).
 * @param {string} url
 * @returns {string}
 */
function extractDomain(url) {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const HARVEST_PATHS = [
  '',
  '/about',
  '/about-us',
  '/aboutus',
  '/our-story',
  '/team',
  '/our-team',
  '/leadership',
  '/staff',
  '/people',
  '/contact',
  '/contact-us',
  '/contactus',
];

const ROLE_KEYWORDS = /\b(owner|founder|co-founder|cofounder|ceo|chief executive|principal|president|proprietor|director|head chef|general manager|managing partner|managing director)\b/i;

const ROLE_RANK = {
  owner: 10,
  proprietor: 10,
  founder: 9,
  'co-founder': 8,
  cofounder: 8,
  ceo: 8,
  'chief executive': 8,
  president: 7,
  principal: 7,
  'managing director': 7,
  'managing partner': 7,
  director: 6,
  'head chef': 6,
  'general manager': 5,
  manager: 4,
};

/** @type {Record<string, number>} */
const ROLE_RANK_MAP = ROLE_RANK;

const PAGE_TIMEOUT = 4000;
const MAX_PAGES = 8;
const MAX_HARVEST_TIME = 25000;

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/**
 * @typedef {Object} HarvestedPerson
 * @property {string} name
 * @property {string} role
 * @property {string} source - 'text_near_role' | 'jsonld' | 'title_tag' | 'hcard'
 * @property {number} confidence - 0..100
 */

/**
 * @typedef {Object} HarvestResult
 * @property {string[]} emails - personal-looking emails found on the site
 * @property {string[]} roleEmails - generic role mailboxes (info@ etc.)
 * @property {HarvestedPerson[]} persons - ranked by role confidence
 * @property {number} pagesVisited
 * @property {string} domain
 */

/* ------------------------------------------------------------------ */
/*  HTTP                                                              */
/* ------------------------------------------------------------------ */

/**
 * @param {string} url
 * @returns {Promise<string|null>}
 */
async function fetchHtml(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PAGE_TIMEOUT + 1000);
  try {
    const resp = await axios.get(url, {
      signal: controller.signal,
      timeout: PAGE_TIMEOUT,
      maxContentLength: 3 * 1024 * 1024,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      maxRedirects: 2,
      validateStatus: () => true,
    });
    clearTimeout(timeoutId);
    if (resp.status >= 400) return null;
    return typeof resp.data === 'string' ? resp.data : String(resp.data);
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Person-name extraction                                            */
/* ------------------------------------------------------------------ */

/**
 * Collect Person entries from JSON-LD blocks.
 * @param {any} $
 * @returns {HarvestedPerson[]}
 */
function extractJsonLdPersons($) {
  /** @type {HarvestedPerson[]} */
  const out = [];
  $('script[type="application/ld+json"]').each((/** @type {number} */ _i, /** @type {any} */ el) => {
    const raw = ($(el).html() || '').toString();
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    const walk = /** @type {(o: unknown) => void} */ (o => {
      if (!o || typeof o !== 'object') return;
      if (Array.isArray(o)) { o.forEach(walk); return; }
      const obj = /** @type {Record<string, unknown>} */ (o);
      const t = String(obj['@type'] || obj.type || '');
      if (/Person/i.test(t)) {
        const name = String(obj.name || obj.givenName || '');
        const role = String(obj.jobTitle || obj.role || '');
        if (name && name.length > 2) {
          out.push({
            name: String(obj.name || `${obj.givenName || ''} ${obj.familyName || ''}`).trim(),
            role: role || 'Person',
            source: 'jsonld',
            confidence: 75,
          });
        }
      }
      for (const v of Object.values(obj)) walk(v);
    });
    walk(/** @type {Record<string, unknown>} */ (parsed));
  });
  return out;
}

/**
 * Collect h-card microformat persons.
 * @param {any} $
 * @returns {HarvestedPerson[]}
 */
function extractHcardPersons($) {
  /** @type {HarvestedPerson[]} */
  const out = [];
  $('.h-card, [class*="h-card"]').each((/** @type {number} */ _i, /** @type {any} */ el) => {
    const name = String($('.p-name', el).first().text() || '').trim();
    const role = String($('.p-job-title, .p-org, [class*="title"], [class*="role"]', el).first().text() || '').trim();
    if (name && name.length > 2) {
      out.push({ name, role: role || 'Person', source: 'hcard', confidence: 60 });
    }
  });
  return out;
}

/**
 * Find names appearing directly before/after a role keyword in visible text.
 * e.g. "Meet our owner John Smith" or "John Smith, Owner & Founder".
 * @param {any} $
 * @returns {HarvestedPerson[]}
 */
function extractTextRolePersons($) {
  /** @type {HarvestedPerson[]} */
  const out = [];
  const seen = new Set();
  /* focus on common heading/text blocks — headings carry most role mentions */
  $('h1, h2, h3, h4, h5, p, li, span, div').each((/** @type {number} */ _i, /** @type {any} */ el) => {
    const text = String($(el).text() || '').replace(/\s+/g, ' ').trim();
    if (text.length < 10 || text.length > 300) return;
    const match = text.match(ROLE_KEYWORDS);
    if (!match) return;
    const role = String(match[1]);
    /* try to pull a capitalized name adjacent to the role keyword */
    const idx = text.toLowerCase().indexOf(role.toLowerCase());
    const before = text.slice(Math.max(0, idx - 45), idx);
    const after = text.slice(idx + role.length, idx + role.length + 45);
    const nameCap = /\b([A-Z][a-z]+(?:\s+(?:[A-Z][a-z]+|[A-Z]\.?))+)\b/;
    const cand = (before.match(nameCap) || after.match(nameCap));
    if (cand) {
      const name = cand[1].trim();
      if (seen.has(name.toLowerCase())) return;
      seen.add(name.toLowerCase());
      /* name must not start with a generic/greeting word */
      if (/^(The|Our|My|Your|His|Her|Meet|Visit|Contact|Email|Call|Say|Hi|Hello|Welcome|New|Local|Best|Top|Small|Family)$/i.test(name)) return;
      const roleRank = ROLE_RANK_MAP[role.toLowerCase()] ?? 4;
      out.push({ name, role, source: 'text_near_role', confidence: Math.min(85, 55 + roleRank * 3) });
    }
  });
  return out;
}

/**
 * Pull a name hint from the page title (e.g. "Contact John Smith | Acme Co").
 * @param {any} $
 * @returns {HarvestedPerson | null}
 */
function extractTitleTagPerson($) {
  const title = ($('title').first().text() || '').trim();
  const m = title.match(/([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){1,2})\s*[|,]/);
  if (m && m[1].split(/\s+/).length === 2) {
    const name = m[1];
    /* heuristic: brand/person-page titles usually include a role word or
     * 'Meet/Contact'; skip titles that look like plain business names */
    if (/(meet|contact|founder|owner|owner|chef|barber|stylist|dentist|doctor|dr\b|attorney|agent|broker|consultant|welcome)/i.test(title)) {
      return { name, role: 'From page title', source: 'title_tag', confidence: 35 };
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Orchestrator                                                      */
/* ------------------------------------------------------------------ */

/**
 * Deep-harvest a lead's website for emails and owner identities.
 * @param {{ website: string; name?: string; businessName?: string; city?: string; state?: string }} lead
 * @returns {Promise<HarvestResult>}
 */
async function harvestWebsite(lead) {
  const website = (lead.website || '').trim();
  if (!website) return { emails: [], roleEmails: [], persons: [], pagesVisited: 0, domain: '' };

  let baseUrl;
  try {
    const u = new URL(website.startsWith('http') ? website : `https://${website}`);
    baseUrl = `${u.protocol}//${u.host}`;
  } catch {
    return { emails: [], roleEmails: [], persons: [], pagesVisited: 0, domain: '' };
  }
  const domain = extractDomain(website);
  const visited = new Set();
  const emails = new Set();
  const roleEmails = new Set();
  const persons = [];
  const deadline = Date.now() + MAX_HARVEST_TIME;
  let pagesVisited = 0;

  for (const rel of HARVEST_PATHS) {
    if (pagesVisited >= MAX_PAGES || Date.now() > deadline) break;
    const url = rel ? `${baseUrl}${rel}` : `${baseUrl}/`;
    if (visited.has(url)) continue;
    visited.add(url);
    pagesVisited++;

    const html = await fetchHtml(url);
    if (!html) continue;

    /* emails */
    for (const e of emailFinder.extractEmailsFromHtml(html)) {
      if (!e.toLowerCase().includes(domain)) continue;
      if (/^(info|contact|sales|support|help|admin|office|mail|hello|team|staff|billing|accounts|webmaster|noreply|no-reply|marketing|media|press|hr|recruiting)\b@/i.test(e)) {
        roleEmails.add(e.toLowerCase());
      } else {
        emails.add(e.toLowerCase());
      }
    }

    /* persons — only from relevant pages (home/about/team/contact) */
    const relevant = rel === '' || /about|team|leadership|staff|people|contact|story/i.test(rel);
    if (relevant) {
      const $ = cheerio.load(html);
      for (const p of extractJsonLdPersons($)) persons.push(p);
      for (const p of extractHcardPersons($)) persons.push(p);
      for (const p of extractTextRolePersons($)) persons.push(p);
      const titlePerson = extractTitleTagPerson($);
      if (titlePerson) persons.push(titlePerson);
    }
  }

  /* rank persons: highest role confidence first, dedupe by lowercase name */
  const ranked = [];
  const seen = new Set();
  for (const p of persons.sort((a, b) => b.confidence - a.confidence)) {
    if (seen.has(p.name.toLowerCase())) continue;
    seen.add(p.name.toLowerCase());
    ranked.push(p);
  }

  return { emails: Array.from(emails), roleEmails: Array.from(roleEmails), persons: ranked.slice(0, 6), pagesVisited, domain };
}

module.exports = { harvestWebsite, ROLE_KEYWORDS };
