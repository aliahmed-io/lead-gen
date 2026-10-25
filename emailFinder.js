// @ts-nocheck
/**
 * @module emailFinder
 * @description Multi-strategy email extraction and platform detection.
 *
 * Phase 1 (axios + Cheerio):
 *   Fast HTTP requests to a broad list of page paths, plus dynamic
 *   contact-link discovery, structured-data parsing, and email
 *   deobfuscation.
 *
 * Phase 2 (Playwright fallback — optional):
 *   For sites where Phase 1 found nothing, launches a headless browser
 *   to render JavaScript-heavy pages and re-scans the rendered DOM.
 *   Skips known national chains that never expose emails.
 */

const dns = require('dns').promises;
const {safeFetchText}=require('./runtime/network');
const cheerio = require('cheerio');
const pLimit = require('p-limit');
const { chromium } = require('playwright');
const {
  CONCURRENCY,
  PLAYWRIGHT_EMAIL_CONCURRENCY,
  WEBSITE_TIMEOUT,
  PLAYWRIGHT_PAGE_TIMEOUT,
  USER_AGENTS,
  EMAIL_SCAN_PATHS,
  EMAIL_REGEX,
  EMAIL_BLACKLIST_PATTERNS,
  CHAIN_DOMAINS,
  SAME_DOMAIN_DELAY_MIN,
  SAME_DOMAIN_DELAY_MAX,
  HEADLESS,
  USE_PLAYWRIGHT_FALLBACK,
} = require('./config');
const {
  cleanEmailAddress,
  isValidSyntax,
  isRoleBasedEmail,
  checkDomainBlacklist,
} = require('./verifier');

/* ------------------------------------------------------------------ */
/*  Utilities                                                         */
/* ------------------------------------------------------------------ */

/**
 * Ensures the system has an active internet connection.
 * Freezes execution by sleeping in a loop if offline.
 * @param {string} [context] - optional context for warnings.
 */
async function ensureOnline(context = '') {
  let printedOffline = false;
  while (true) {
    try {
      await dns.lookup('google.com');
      if (printedOffline) {
        console.log(`\n\u2705 [ONLINE] Connection restored! Resuming ${context}...`);
      }
      break;
    } catch {
      if (!printedOffline) {
        console.warn(`\n\u26A0\uFE0F  [OFFLINE] Internet connection lost! Freezing ${context} execution...`);
        printedOffline = true;
      }
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

/**
 * Return a random user-agent from the configured pool.
 * @returns {string}
 */
function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Sleep for a random duration.
 * @param {number} min
 * @param {number} max
 * @returns {Promise<void>}
 */
function randomDelay(min, max) {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Normalise a URL: add protocol if missing, strip trailing slashes.
 * @param {string} url
 * @returns {string}
 */
function normalizeUrl(url) {
  if (!url) return '';
  let clean = url.trim();
  if (!/^https?:\/\//i.test(clean)) clean = 'https://' + clean;
  return clean.replace(/\/+$/, '');
}

/**
 * Extract the hostname from a URL (lowercase, no www).
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

/**
 * Check whether a domain belongs to a known national chain.
 * @param {string} domain
 * @returns {boolean}
 */
function isChainDomain(domain) {
  return CHAIN_DOMAINS.some(
    (c) => domain === c || domain.endsWith('.' + c)
  );
}

/* ------------------------------------------------------------------ */
/*  Email validation                                                  */
/* ------------------------------------------------------------------ */

/**
 * Return `true` when a candidate email looks genuine.
 * @param {string} email
 * @returns {boolean}
 */
function isValidEmail(email) {
  if (!email || email.length > 254 || email.length < 5) return false;
  if (EMAIL_BLACKLIST_PATTERNS.some((p) => p.test(email))) return false;
  if (!isValidSyntax(email) || isRoleBasedEmail(email)) return false;
  const domain = email.split('@')[1] || '';
  if (checkDomainBlacklist(domain).blocked) return false;
  return true;
}

/**
 * Helper to clean and add an email to the accumulator Set if valid.
 * @param {string} raw
 * @param {Set<string>} set
 */
function addCleanedEmail(raw, set) {
  const cleaned = cleanEmailAddress(raw);
  if (cleaned && isValidEmail(cleaned)) {
    set.add(cleaned);
  }
}

/* ------------------------------------------------------------------ */
/*  Email extraction — core                                           */
/* ------------------------------------------------------------------ */

/**
 * Extract validated emails from raw HTML using multiple strategies:
 *   1. Space-separated visible text content (prevents tag concatenation)
 *   2. mailto: links
 *   3. All href attributes
 *   4. Raw HTML source
 *   5. JSON-LD structured data
 *   6. Obfuscated patterns ("[at]", "(at)", HTML entities)
 *
 * @param {string} html
 * @returns {string[]} Unique lowercase emails.
 */
function extractEmailsFromHtml(html) {
  const emails = new Set();
  const $ = cheerio.load(html);

  /* 1. Space-separated text content (prevents adjacent tags from gluing together) */
  const spacedText = html.replace(/<[^>]+>/g, ' ');
  for (const e of spacedText.match(EMAIL_REGEX) || []) {
    addCleanedEmail(e, emails);
  }

  /* 2. mailto: links */
  $('a[href^="mailto:"]').each((_i, el) => {
    const href = $(el).attr('href') || '';
    const raw = href.replace(/^mailto:/i, '').split('?')[0].trim();
    if (raw) {
      addCleanedEmail(raw, emails);
    }
  });

  /* 3. Any href or data attribute that embeds an email */
  $('a[href], [data-email], [data-mail]').each((_i, el) => {
    const targets = [
      $(el).attr('href'),
      $(el).attr('data-email'),
      $(el).attr('data-mail'),
    ];
    for (const t of targets) {
      if (!t) continue;
      for (const e of t.match(EMAIL_REGEX) || []) {
        addCleanedEmail(e, emails);
      }
    }
  });

  /* 4. Raw HTML source */
  for (const e of html.match(EMAIL_REGEX) || []) {
    addCleanedEmail(e, emails);
  }

  /* 5. JSON-LD structured data */
  $('script[type="application/ld+json"]').each((_i, el) => {
    try {
      const data = JSON.parse($(el).html());
      extractEmailsFromJsonLd(data, emails);
    } catch {
      /* malformed JSON-LD — skip */
    }
  });

  /* 6. Obfuscated email patterns */
  for (const e of deobfuscateEmails(spacedText)) {
    addCleanedEmail(e, emails);
  }
  for (const e of deobfuscateEmails(html)) {
    addCleanedEmail(e, emails);
  }

  return Array.from(emails);
}

/**
 * Recursively walk a JSON-LD object and pull out any email-like values.
 *
 * @param {any} obj
 * @param {Set<string>} emails - accumulator set.
 */
function extractEmailsFromJsonLd(obj, emails) {
  if (!obj || typeof obj !== 'object') return;

  if (Array.isArray(obj)) {
    for (const item of obj) extractEmailsFromJsonLd(item, emails);
    return;
  }

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      const lk = key.toLowerCase();
      if (
        lk === 'email' ||
        lk === 'contactemail' ||
        lk.includes('email')
      ) {
        for (const e of value.match(EMAIL_REGEX) || []) {
          if (isValidEmail(e)) emails.add(e.toLowerCase());
        }
      }
    } else if (typeof value === 'object') {
      extractEmailsFromJsonLd(value, emails);
    }
  }
}

/**
 * Detect obfuscated email patterns and return normalised addresses.
 *
 * Handles:
 *   "user [at] domain [dot] com"
 *   "user (at) domain (dot) com"
 *   "user AT domain DOT com"
 *   "user&#64;domain.com"
 *
 * @param {string} text
 * @returns {string[]}
 */
function deobfuscateEmails(text) {
  const found = [];

  const patterns = [
    /([a-zA-Z0-9._%+-]+)\s*\[at\]\s*([a-zA-Z0-9.-]+)\s*\[dot\]\s*([a-zA-Z]{2,})/gi,
    /([a-zA-Z0-9._%+-]+)\s*\(at\)\s*([a-zA-Z0-9.-]+)\s*\(dot\)\s*([a-zA-Z]{2,})/gi,
    /([a-zA-Z0-9._%+-]+)\s+at\s+([a-zA-Z0-9.-]+)\s+dot\s+([a-zA-Z]{2,})/gi,
  ];

  for (const pattern of patterns) {
    let m;
    while ((m = pattern.exec(text)) !== null) {
      const email = `${m[1]}@${m[2]}.${m[3]}`.toLowerCase();
      if (isValidEmail(email)) found.push(email);
    }
  }

  /* HTML entity &#64; = @ */
  const decoded = text.replace(/&#64;/gi, '@').replace(/&#46;/gi, '.');
  for (const e of decoded.match(EMAIL_REGEX) || []) {
    if (isValidEmail(e) && !found.includes(e.toLowerCase())) {
      found.push(e.toLowerCase());
    }
  }

  return found;
}

/* ------------------------------------------------------------------ */
/*  Dynamic contact-link discovery                                    */
/* ------------------------------------------------------------------ */

/**
 * Scan the homepage HTML for navigation links that look like they lead
 * to a contact or about page. Returns absolute URLs.
 *
 * @param {string} html
 * @param {string} baseUrl
 * @returns {string[]}
 */
function discoverContactLinks(html, baseUrl) {
  const $ = cheerio.load(html);
  const pattern =
    /contact|get.in.touch|reach.us|connect|email.us|about.us|our.team|customer.service/i;
  const links = new Set();

  $('a[href]').each((_i, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text() || '';

    if (pattern.test(href) || pattern.test(text)) {
      try {
        const full = new URL(href, baseUrl).href;
        /* Only follow same-domain links */
        if (
          full.startsWith('http') &&
          extractDomain(full) === extractDomain(baseUrl)
        ) {
          links.add(full);
        }
      } catch {
        /* invalid URL — skip */
      }
    }
  });

  return Array.from(links).slice(0, 5); /* cap at 5 discovered links */
}

/* ------------------------------------------------------------------ */
/*  Platform detection                                                */
/* ------------------------------------------------------------------ */

/**
 * Detect the CMS / e-commerce platform from HTML source markers.
 *
 * @param {string} html
 * @returns {"Shopify"|"WooCommerce"|"WordPress"|"Other"}
 */
function detectPlatform(html) {
  const l = html.toLowerCase();

  if (
    l.includes('cdn.shopify.com') ||
    l.includes('shopify.theme') ||
    l.includes('shopify-section') ||
    l.includes('myshopify.com')
  ) {
    return 'Shopify';
  }

  if (
    l.includes('woocommerce') ||
    l.includes('/wp-content/plugins/woocommerce')
  ) {
    return 'WooCommerce';
  }

  if (l.includes('wp-content') || l.includes('wp-includes')) {
    return 'WordPress';
  }

  return 'Other';
}

/* ------------------------------------------------------------------ */
/*  HTTP page fetching                                                */
/* ------------------------------------------------------------------ */

/** Network error codes that warrant a retry. */
const NETWORK_ERROR_CODES = [
  'ECONNREFUSED',
  'ENOTFOUND',
  'ETIMEDOUT',
  'ECONNRESET',
  'ERR_INTERNET_DISCONNECTED',
  'ECONNABORTED',
];

/**
 * Fetch a URL with axios, returning the body as a string or `null`.
 *
 * Retry policy:
 *   - Network errors: ensureOnline, then retry up to 3× with 2s / 4s / 8s backoff.
 *   - HTTP 429:       wait 10 s, retry once.
 *   - Other HTTP errors (4xx / 5xx): return `null` immediately.
 *
 * @param {string} url
 * @returns {Promise<string|null>}
 */
async function fetchPage(url){try{return (await safeFetchText(url)).text;}catch{return null;}}

/* ------------------------------------------------------------------ */
/*  Phase 1 — axios + Cheerio                                         */
/* ------------------------------------------------------------------ */

/**
 * Visit a business website using fast HTTP requests, scan configured
 * paths plus dynamically discovered links for emails, and detect the
 * site platform.
 *
 * @param {Object} business
 * @returns {Promise<Object>} Enriched business record.
 */
async function processWebsiteAxios(business) {
  let platform='Other';const extraEmails=new Set();
  const research=await require('./runtime/research').research(business,{fetcher:async(url,redirects,options)=>{const result=await safeFetchText(url,redirects,options);platform=platform==='Other'?detectPlatform(result.text):platform;for(const email of extractEmailsFromHtml(result.text))extraEmails.add(email);return result;}});
  const ownerFirst=research.contacts.filter(c=>c.ownerCandidate).map(c=>c.email);
  const emails=[...new Set([...ownerFirst,...research.contacts.map(c=>c.email),...extraEmails])];
  return {...business,emails,email:emails[0]||'',platform,research,emailStatus:research.status==='excluded'?'excluded':research.pages.length?'success':'error'};
}

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/**
 * Process all businesses in a unified queue: runs Axios first, and if
 * no email is found, immediately runs Playwright fallback (reusing a
 * shared browser instance).
 *
 * Saves progress to leads_db.json and exports to Excel in real-time
 * after every single business completes.
 *
 * @param {Array<Object>} businesses
 * @param {import('./db').LeadsDatabase} db
 * @returns {Promise<Array<Object>>} Enriched business records.
 */
async function findEmails(businesses, db, {signal}={}) {
  if(process.argv.includes('--dry-run'))return businesses;
  const targeting=require('./runtime/targeting');
  const pending=businesses.filter(b=>b.website&&!b.quarantined&&!b.archived&&!targeting.exclusion(b));
  let browser=null;
  if(USE_PLAYWRIGHT_FALLBACK)try{browser=await require('./runtime/browser').launch({headless:HEADLESS});}catch{console.log('Rendered enrichment unavailable; bounded static website research continues.');}
  let cursor=0,completed=0;
  try{await Promise.all(Array.from({length:Math.min(2,pending.length)},async()=>{while(cursor<pending.length&&!signal?.aborted){const b=pending[cursor++];try{
    let platform='Other';const extra=new Set();
    const research=await require('./runtime/research').research(b,{signal,fetcher:async(url,redirects,options)=>{const response=await safeFetchText(url,redirects,options);if(platform==='Other')platform=detectPlatform(response.text);for(const e of extractEmailsFromHtml(response.text))extra.add(e);return response;}});
    if(browser&&!signal?.aborted&&!research.contacts.some(c=>c.ownerCandidate)){
      const rendered=await require('./runtime/browser-research').renderResearch(browser,b,{signal});
      const found=new Map(research.contacts.map(c=>[c.email,c]));for(const c of rendered.contacts){if(!found.has(c.email)||c.ownerCandidate)found.set(c.email,c);}
      research.contacts=[...found.values()];research.owners.push(...rendered.owners);research.sizeFacts.push(...rendered.sizeFacts);research.pages.push(...rendered.pages);research.status=research.pages.length?'researched':'unavailable';
    }
    if(signal?.aborted)break;
    const current=db.get(b);if(!current||current.website!==b.website)continue;
    const candidates=research.contacts.filter(c=>c.ownerCandidate).map(c=>c.email);
    const emails=[...new Set([...candidates,...research.contacts.map(c=>c.email),...extra,...(current.emails||[])])];
    db.update(b,{research,emails,email:emails[0]||'',platform,emailStatus:research.pages.length?(emails.length?'found':'success'):'error'});
    completed++;console.log(JSON.stringify({websiteResearchCompleted:completed,total:pending.length,ownerCandidates:research.contacts.filter(c=>c.ownerCandidate).length}));
   }catch{if(!signal?.aborted)db.update(b,{emailStatus:'error'});}}}));
  }finally{if(browser)await browser.close().catch(()=>{});}
  return pending.map(b=>db.get(b)||b);
}

module.exports = {
  findEmails,
  extractEmailsFromHtml,
  detectPlatform,
  isValidEmail,
  normalizeUrl,
  deobfuscateEmails,
  discoverContactLinks,
};
