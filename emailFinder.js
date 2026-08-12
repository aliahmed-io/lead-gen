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
const { errOf } = require('./utils');
const axios = require('axios');
const cheerio = require('cheerio');
const pLimit = require('p-limit');
const { chromium } = require('playwright');
const {
  CONCURRENCY,
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
  return !EMAIL_BLACKLIST_PATTERNS.some((p) => p.test(email));
}

/* ------------------------------------------------------------------ */
/*  Email extraction — core                                           */
/* ------------------------------------------------------------------ */

/**
 * Extract validated emails from raw HTML using multiple strategies:
 *   1. Visible text content
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

  /* 1. Text content */
  const text = $.text();
  for (const e of text.match(EMAIL_REGEX) || []) {
    if (isValidEmail(e)) emails.add(e.toLowerCase());
  }

  /* 2. mailto: links */
  $('a[href^="mailto:"]').each((_i, el) => {
    const href = $(el).attr('href') || '';
    const raw = href.replace(/^mailto:/i, '').split('?')[0].trim();
    if (raw && EMAIL_REGEX.test(raw) && isValidEmail(raw)) {
      emails.add(raw.toLowerCase());
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
        if (isValidEmail(e)) emails.add(e.toLowerCase());
      }
    }
  });

  /* 4. Raw HTML source */
  for (const e of html.match(EMAIL_REGEX) || []) {
    if (isValidEmail(e)) emails.add(e.toLowerCase());
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
  for (const e of deobfuscateEmails(text)) {
    emails.add(e);
  }
  for (const e of deobfuscateEmails(html)) {
    emails.add(e);
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
async function fetchPage(url) {
  const MAX_NETWORK_RETRIES = 0; // Don't retry network errors on initial bulk scan to save time
  const BASE_DELAY_MS = 1000;

  for (let attempt = 0; attempt <= MAX_NETWORK_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), WEBSITE_TIMEOUT + 1000);
    
    try {
      const resp = await axios.get(url, {
        signal: controller.signal,
        timeout: WEBSITE_TIMEOUT,
        maxContentLength: 3 * 1024 * 1024, // 3MB limit
        maxBodyLength: 3 * 1024 * 1024,
        headers: {
          'User-Agent': getRandomUserAgent(),
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          Connection: 'keep-alive',
        },
        maxRedirects: 3, // Reduced from 5
        validateStatus: () => true,
        decompress: true,
      });
      clearTimeout(timeoutId);

      if (resp.status === 429) {
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        return null;
      }

      if (resp.status >= 400) {
        return null;
      }

      return typeof resp.data === 'string' ? resp.data : String(resp.data);
    } catch (err) {
      clearTimeout(timeoutId);
      const code = err.code || '';
      const msg = (errOf(err).message || '').toUpperCase();
      const isNetworkError =
        NETWORK_ERROR_CODES.some((c) => code === c || msg.includes(c));

      if (isNetworkError && attempt < MAX_NETWORK_RETRIES) {
        await new Promise((r) => setTimeout(r, BASE_DELAY_MS));
        continue;
      }

      return null;
    }
  }

  return null;
}

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
  const baseUrl = normalizeUrl(business.website);

  if (!baseUrl) {
    return {
      ...business,
      emails: [],
      email: '',
      platform: 'Unknown',
      emailStatus: 'no-website',
    };
  }

  const allEmails = new Set();
  let platform = 'Other';
  let emailStatus = 'success';
  const visitedUrls = new Set();
  let anyPageFetched = false;

  try {
    /* ── Static paths ─────────────────────────────────────────── */
    let homepageHtml = null;

    for (const path of EMAIL_SCAN_PATHS) {
      const url = baseUrl + path;
      if (visitedUrls.has(url)) continue;
      visitedUrls.add(url);

      try {
        const html = await fetchPage(url);
        if (!html) {
          if (path === '') {
            break; // Homepage failed to load entirely, domain is likely unreachable.
          }
          continue;
        }

        anyPageFetched = true;

        if (path === '') {
          homepageHtml = html;
          platform = detectPlatform(html);
        }

        for (const e of extractEmailsFromHtml(html)) allEmails.add(e);
        if (allEmails.size >= 2) break; // Optimization: stop if we found emails
      } catch {
        /* individual path failure — continue */
      }

      if (anyPageFetched && SAME_DOMAIN_DELAY_MAX > 0) {
        await randomDelay(SAME_DOMAIN_DELAY_MIN, SAME_DOMAIN_DELAY_MAX);
      }
    }

    /* ── Dynamic contact-link discovery ────────────────────────── */
    if (homepageHtml && allEmails.size === 0) {
      const discovered = discoverContactLinks(homepageHtml, baseUrl);

      for (const dUrl of discovered) {
        if (visitedUrls.has(dUrl)) continue;
        visitedUrls.add(dUrl);

        try {
          const html = await fetchPage(dUrl);
          if (html) {
            anyPageFetched = true;
            for (const e of extractEmailsFromHtml(html)) allEmails.add(e);
            if (allEmails.size >= 2) break; // Optimization
          }
        } catch {
          /* skip */
        }

        if (anyPageFetched && SAME_DOMAIN_DELAY_MAX > 0) {
          await randomDelay(SAME_DOMAIN_DELAY_MIN, SAME_DOMAIN_DELAY_MAX);
        }
      }
    }
  } catch (err) {
    const msg = errOf(err).message || '';
    if (
      err.code === 'ECONNABORTED' ||
      msg.includes('timeout') ||
      msg.includes('ETIMEDOUT')
    ) {
      emailStatus = 'timeout';
    } else {
      emailStatus = 'error';
    }
  }

  const emailList = Array.from(allEmails);
  const emailStr = emailList.join('; ');

  let finalStatus = emailStatus;
  if (emailList.length > 0) {
    finalStatus = 'found';
  } else if (!anyPageFetched) {
    finalStatus = 'error';
  } else {
    finalStatus = 'success';
  }

  return {
    ...business,
    emails: emailList,
    email: emailStr,
    platform,
    emailStatus: finalStatus,
  };
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
async function findEmails(businesses, db) {
  const isDryRun = process.argv.includes('--dry-run');
  if (isDryRun) {
    console.log('⚡ Dry-run mode active. Skipping unified email extraction.');
    return businesses;
  }
  const withWebsites = businesses.filter(
    (b) => b.website && b.website.trim().length > 0
  );

  console.log(
    `\n\u{1F4E7} Phase 2 \u2014 Unified Email Extraction: processing ${withWebsites.length} websites...`
  );

  // Guard against offline periods during long extraction runs.
  await ensureOnline('email extraction');

  // Excel export is deferred to the pipeline's final export step (exporter.js),
  // so nothing is imported here to keep the per-lead loop lean.

  /** Browser-crash error signatures. */
  const BROWSER_CRASH_PATTERNS = [
    'Target closed',
    'Browser closed',
    'Protocol error',
    'Session closed',
    'Execution context was destroyed',
  ];

  function isBrowserCrash(err) {
    const msg = (err && errOf(err).message) || '';
    return BROWSER_CRASH_PATTERNS.some((p) => msg.includes(p));
  }

  /** Helper: launch a fresh Playwright browser. */
  async function launchBrowser() {
    const b = await chromium.launch({
      headless: HEADLESS,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    return b;
  }

  let browser = null;
  let browserRelaunchCount = 0;
  const MAX_BROWSER_RELAUNCHES = 3;

  if (USE_PLAYWRIGHT_FALLBACK) {
    browser = await launchBrowser();
  }

  try {
    const limit = pLimit(CONCURRENCY);
    let completedCount = 0;
    let foundCount = 0;

    const tasks = withWebsites.map((biz) =>
      limit(async () => {
        /* ── Top-level error containment: NEVER let a single lead crash Promise.all ── */
        
        // Ensure no lead can hang for more than 60 seconds (Hard Kill Timeout)
        const hardTimeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Hard kill timeout: lead took over 60 seconds')), 60000);
        });

        const taskExecution = async () => {
          // Removed 2000 leads hard limit          // Assign leadNum immediately at task start and log Phase 1
          const leadNum = biz.leadNum || ++global.leadCounter;
          biz.leadNum = leadNum;
          if (!biz.isPhase1Logged) {
            console.log(`lead no ${leadNum} , ${biz.name}, phase 1 complete`);
            biz.isPhase1Logged = true;
          }

          let emails = [];
          let platform = 'Other';
          let emailStatus = 'success';

          // 1. Run Axios + Cheerio
          try {
            const axiosResult = await processWebsiteAxios(biz);
            emails = axiosResult.emails || [];
            platform = axiosResult.platform || 'Other';
            emailStatus = axiosResult.emailStatus || 'success';
          } catch (err) {
            emailStatus = 'error';
          }

          // 2. Playwright Fallback (only if Axios found nothing, Playwright is enabled, and not a chain)
          if (USE_PLAYWRIGHT_FALLBACK && emails.length === 0 && browser) {
            const domain = extractDomain(biz.website || '');
            if (domain) {
              if (isChainDomain(domain)) {
                emailStatus = 'chain-skipped';
              } else {
                let localContext = null;
                let page = null;
                try {
                  localContext = await browser.newContext({
                    userAgent: getRandomUserAgent(),
                    viewport: { width: 1366, height: 768 },
                    locale: 'en-US',
                  });
                  page = await localContext.newPage();

                  // Block stylesheets, images, media, and fonts
                  await page.route('**/*', (route) => {
                    const type = route.request().resourceType();
                    if (['image', 'media', 'font', 'stylesheet'].includes(type)) {
                      route.abort().catch(() => {});
                    } else {
                      route.continue().catch(() => {});
                    }
                  });

                  const baseUrl = normalizeUrl(biz.website);

                  /* Homepage */
                  await page.goto(baseUrl, {
                    timeout: PLAYWRIGHT_PAGE_TIMEOUT,
                    waitUntil: 'domcontentloaded',
                  });
                  await page.waitForTimeout(2000); /* let JS render */

                  let html = await page.content();
                  emails = extractEmailsFromHtml(html);

                  /* Contact page if no emails on homepage */
                  if (emails.length === 0) {
                    for (const path of ['/contact', '/contact-us', '/pages/contact']) {
                      try {
                        await page.goto(baseUrl + path, {
                          timeout: PLAYWRIGHT_PAGE_TIMEOUT,
                          waitUntil: 'domcontentloaded',
                        });
                        await page.waitForTimeout(1500);
                        html = await page.content();
                        const found = extractEmailsFromHtml(html);
                        emails.push(...found);
                        if (emails.length > 0) break;
                      } catch {
                        /* path doesn't exist — continue */
                      }
                    }
                  }

                  if (emails.length > 0) {
                    emailStatus = 'found-playwright';
                  } else {
                    emailStatus = 'scanned';
                  }
                } catch (err) {
                  /* ── Browser crash recovery ── */
                  if (isBrowserCrash(err) && browserRelaunchCount < MAX_BROWSER_RELAUNCHES) {
                    browserRelaunchCount++;
                    console.warn(
                      `\n⚠️  [BROWSER CRASH] Relaunch ${browserRelaunchCount}/${MAX_BROWSER_RELAUNCHES} — retrying ${biz.name}...`
                    );
                    try { 
                      await Promise.race([
                        browser.close().catch(() => {}),
                        new Promise(r => setTimeout(r, 5000))
                      ]); 
                    } catch (closeErr) {
                      // Browser was already closed — safe to ignore during crash recovery.
                      void closeErr;
                    }
                    try {
                      browser = await launchBrowser();
                    } catch (launchErr) {
                      console.error('   ❌ Browser relaunch failed:', launchErr.message);
                      browser = null;
                    }
                    emailStatus = 'error';
                  } else {
                    const msg = errOf(err).message || '';
                    const isTimeout = msg.includes('timeout') || msg.includes('Navigation timeout');
                    emailStatus = isTimeout ? 'timeout' : 'error';
                  }
                  // Wait a tiny bit on error to not spin out
                  await new Promise((r) => setTimeout(r, 500));
                } finally {
                  if (page) {
                    await page.close().catch(() => {});
                  }
                  if (localContext) {
                    await localContext.close().catch(() => {});
                  }
                }
              }
            }
          }

          // 3. Save result
          const unique = [...new Set(emails)];
          const emailStr = unique.join('; ');

          db.update(biz, {
            emails: unique,
            email: emailStr,
            platform,
            emailStatus,
          });

          // Save DB only, defer Excel export to the end
          db.save();
          // exportToExcel(db.getAll());

          completedCount++;
          if (unique.length > 0) {
            foundCount++;
          }

          const statusText = unique.length > 0
            ? `emails found: ${unique.length} (${unique.join(', ')})`
            : `no email (${emailStatus})`;
          console.log(`lead no ${leadNum} , ${biz.name}, phase 2 complete (${statusText})`);
          console.log('completed starting a new lead');
        };

        try {
          await Promise.race([taskExecution(), hardTimeoutPromise]);
        } catch (outerErr) {
          /* ── Absolute last-resort catch: log, mark error, save, never throw ── */
          const leadNum = biz.leadNum || ++global.leadCounter;
          if (!biz.isPhase1Logged) {
            console.log(`lead no ${leadNum} , ${biz.name}, phase 1 complete`);
            biz.isPhase1Logged = true;
          }
          console.log(`lead no ${leadNum} , ${biz.name}, phase 2 complete (error: ${outerErr.message || outerErr})`);
          console.log('completed starting a new lead');
          db.update(biz, {
            emails: [],
            email: '',
            platform: 'Other',
            emailStatus: 'error',
          });
          db.save();
          // exportToExcel(db.getAll());
          completedCount++;
        }
      })
    );

    await Promise.all(tasks);

    console.log(
      `\n\u2705 Phase 2 complete: ${completedCount} websites processed, emails found on ${foundCount}`
    );
  } finally {
    if (browser) {
      await Promise.race([
        browser.close().catch(() => {}),
        new Promise(r => setTimeout(r, 5000))
      ]);
    }
  }

  return withWebsites.map((biz) => db.get(biz) || biz);
}

module.exports = {
  findEmails,
  ensureOnline,
  extractEmailsFromHtml,
  detectPlatform,
  isValidEmail,
  normalizeUrl,
  deobfuscateEmails,
  discoverContactLinks,
};
