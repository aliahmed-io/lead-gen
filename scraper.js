/**
 * @module scraper
 * @description Google Maps search-results scraper with anti-ban
 * measures, automatic breaks, and extended data extraction.
 *
 * Launches a Playwright Chromium instance, executes each configured
 * search query, scrolls the results feed up to 300 results (or until
 * exhausted), then navigates to each place page to extract structured
 * business data. Takes a configurable break every N results.
 */

const dns = require('dns').promises;
const { chromium } = require('playwright');
const { findEmails } = require('./emailFinder');
const {
  HEADLESS,
  MAX_RESULTS_PER_QUERY,
  USER_AGENTS,
  VIEWPORTS,
  RESULT_DELAY_MIN,
  RESULT_DELAY_MAX,
  QUERY_DELAY_MIN,
  QUERY_DELAY_MAX,
  BREAK_AFTER_RESULTS,
  BREAK_DURATION_MIN,
  BREAK_DURATION_MAX,
  MAPS_PAGE_TIMEOUT,
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
 * Sleep for a random duration between `min` and `max` milliseconds.
 * @param {number} min
 * @param {number} max
 * @returns {Promise<void>}
 */
function randomDelay(min, max) {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Return a random element from an array.
 * @template T
 * @param {T[]} arr
 * @returns {T}
 */
function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Return a random user-agent string.
 * @returns {string}
 */
function getRandomUserAgent() {
  return randomItem(USER_AGENTS);
}

/**
 * Return a random viewport from configured list.
 * @returns {{ width: number, height: number }}
 */
function getRandomViewport() {
  return randomItem(VIEWPORTS);
}

/**
 * Detect browser/context crash errors by message pattern.
 * @param {Error} err
 * @returns {boolean}
 */
function isBrowserCrash(err) {
  const msg = (err?.message || '').toLowerCase();
  return [
    'target closed',
    'browser closed',
    'browser has been closed',
    'protocol error',
    'session closed',
    'execution context was destroyed',
    'connection refused',
  ].some((pattern) => msg.includes(pattern));
}

/**
 * Create a new browser context with stealth and a fresh page with route blocking.
 * @param {import('playwright').Browser} browser
 * @returns {Promise<{ context: import('playwright').BrowserContext, page: import('playwright').Page }>}
 */
async function createFreshContext(browser) {
  const viewport = getRandomViewport();
  const context = await browser.newContext({
    userAgent: getRandomUserAgent(),
    viewport,
    locale: 'en-US',
    timezoneId: 'America/Chicago',
  });
  await applyStealth(context);
  const page = await context.newPage();
  await page.route(
    /\.(png|jpg|jpeg|gif|webp|mp4|webm|svg)(\?.*)?$/i,
    (route) => route.abort()
  );
  return { context, page };
}

/* ------------------------------------------------------------------ */
/*  Address parsing                                                   */
/* ------------------------------------------------------------------ */

/**
 * Parse a US-formatted address string into city / state components.
 *
 * @param {string} address
 * @returns {{ city: string, state: string, fullAddress: string }}
 */
function parseAddress(address) {
  if (!address) return { city: '', state: '', fullAddress: '' };

  const cleaned = address
    .replace(/,?\s*(USA|United States|US)\s*$/i, '')
    .trim();

  const parts = cleaned.split(',').map((p) => p.trim());
  let city = '';
  let state = '';

  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    const stateZip = last.match(/^([A-Z]{2})\s+\d{5}(?:-\d{4})?$/);
    const bare = last.match(/^([A-Z]{2})$/);

    if (stateZip) {
      state = stateZip[1];
      city = parts[parts.length - 2];
    } else if (bare) {
      state = bare[1];
      city = parts[parts.length - 2];
    } else {
      for (let i = parts.length - 1; i >= 0; i--) {
        const m = parts[i].match(/\b([A-Z]{2})\b/);
        if (m) {
          state = m[1];
          if (i > 0) city = parts[i - 1];
          break;
        }
      }
    }
  }

  if (/^\d+\s/.test(city)) city = '';

  return { city, state, fullAddress: address };
}

/* ------------------------------------------------------------------ */
/*  Anti-detection helpers                                            */
/* ------------------------------------------------------------------ */

/**
 * Inject stealth scripts into a browser context to mask automation
 * fingerprints (WebDriver flag, plugin count, languages).
 *
 * @param {import('playwright').BrowserContext} context
 */
async function applyStealth(context) {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
    });
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });

    /* Override Permissions API to avoid detection */
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (params) =>
      params.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission })
        : originalQuery(params);
  });
}

/**
 * Return `true` if the page displays a CAPTCHA challenge.
 * @param {import('playwright').Page} page
 * @returns {Promise<boolean>}
 */
async function detectCaptcha(page) {
  const indicators = [
    'recaptcha',
    'captcha',
    'unusual traffic',
    'not a robot',
    'verify you are human',
    'automated queries',
    'sorry/index',
  ];
  const content = await page.content();
  const lower = content.toLowerCase();
  return indicators.some((i) => lower.includes(i));
}

/**
 * Dismiss cookie-consent, sign-in, and download-app overlays.
 * @param {import('playwright').Page} page
 */
async function dismissOverlays(page) {
  const selectors = [
    'button[aria-label="Accept all"]',
    'button[aria-label="Reject all"]',
    'form[action*="consent"] button',
    'button[aria-label="Close"]',
    'button[aria-label="No thanks"]',
    'button[aria-label="Dismiss"]',
  ];

  for (const sel of selectors) {
    try {
      const btn = await page.$(sel);
      if (btn && (await btn.isVisible())) {
        await btn.click();
        await randomDelay(300, 700);
      }
    } catch {
      /* non-critical */
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Break logic                                                       */
/* ------------------------------------------------------------------ */

/**
 * Pause execution for a randomised duration (3–5 min default) and log
 * a countdown so the operator knows the script is alive.
 *
 * @param {number} totalScraped - running total for the log message.
 */
async function takeBreak(totalScraped) {
  const duration =
    Math.floor(
      Math.random() * (BREAK_DURATION_MAX - BREAK_DURATION_MIN + 1)
    ) + BREAK_DURATION_MIN;

  const mins = (duration / 60000).toFixed(1);
  console.log(
    `\n\u2615 Break after ${totalScraped} results \u2014 pausing ${mins} min to stay safe...`
  );

  const endTime = Date.now() + duration;
  while (Date.now() < endTime) {
    const remaining = Math.ceil((endTime - Date.now()) / 1000);
    process.stdout.write(`\r   \u23F3 Resuming in ${remaining}s...   `);
    await new Promise((r) => setTimeout(r, Math.min(15000, remaining * 1000)));
  }

  process.stdout.write(
    '\r   \u2705 Break complete. Resuming scraping...          \n'
  );
}

/* ------------------------------------------------------------------ */
/*  Feed scrolling                                                    */
/* ------------------------------------------------------------------ */

/**
 * Scroll the Maps results feed until `targetCount` unique place links
 * are visible or no new results appear after several scroll attempts.
 *
 * @param {import('playwright').Page} page
 * @param {number} targetCount
 */
async function scrollResultsFeed(page, targetCount) {
  const feedSel = 'div[role="feed"]';
  const MAX_STALE = 6;
  let lastCount = 0;
  let stale = 0;

  for (let i = 0; i < 80; i++) {
    const count = await page.$$eval(
      `${feedSel} a[href*="/maps/place/"]`,
      (anchors) => {
        const seen = new Set();
        return anchors.filter((a) => {
          if (seen.has(a.href)) return false;
          seen.add(a.href);
          return true;
        }).length;
      }
    );

    if (count >= targetCount) break;

    if (count === lastCount) {
      stale++;
      if (stale >= MAX_STALE) break;
    } else {
      stale = 0;
    }
    lastCount = count;

    await page.$eval(feedSel, (el) => (el.scrollTop = el.scrollHeight));
    await randomDelay(2000, 3500);

    const endReached = await page.evaluate(() => {
      const feed = document.querySelector('div[role="feed"]');
      if (!feed) return false;
      const t = feed.innerText || '';
      return (
        t.includes("You've reached the end of the list") ||
        t.includes('No more results')
      );
    });
    if (endReached) break;
  }
}

/* ------------------------------------------------------------------ */
/*  Business detail extraction                                        */
/* ------------------------------------------------------------------ */

/**
 * Extract structured business data from the Maps place-detail panel.
 * Grabs name, website, phone, address, rating, reviews, category,
 * price level, and current open/closed status.
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<Object|null>}
 */
async function extractBusinessDetails(page) {
  return page.evaluate(() => {
    /* ---- Name ---------------------------------------------------- */
    const nameEl = document.querySelector('h1');
    const name = nameEl?.textContent?.trim() || '';
    if (!name) return null;

    /* ---- Website ------------------------------------------------- */
    const websiteEl = document.querySelector('a[data-item-id="authority"]');
    let website = '';
    if (websiteEl) {
      website = websiteEl.href || websiteEl.getAttribute('href') || '';
      if (website.includes('google.com/url')) {
        try {
          const u = new URL(website);
          website =
            u.searchParams.get('q') ||
            u.searchParams.get('url') ||
            website;
        } catch { /* keep */ }
      }
    }

    /* ---- Phone --------------------------------------------------- */
    const phoneEl = document.querySelector(
      'button[data-item-id^="phone:tel:"]'
    );
    let phone = '';
    if (phoneEl) {
      const itemId = phoneEl.getAttribute('data-item-id') || '';
      phone = itemId.replace('phone:tel:', '').trim();
      if (!phone) {
        phone =
          phoneEl.textContent?.replace(/[^\d+\-() ]/g, '').trim() || '';
      }
    }

    /* ---- Address ------------------------------------------------- */
    const addressEl =
      document.querySelector('button[data-item-id="address"]') ||
      document.querySelector('button[data-item-id^="address"]');
    const address = addressEl?.textContent?.trim() || '';

    /* ---- Rating & Reviews ---------------------------------------- */
    let rating = '';
    let reviews = '';

    const rc =
      document.querySelector('div.F7nice') ||
      document.querySelector('div.fontDisplayLarge') ||
      document.querySelector('[role="img"][aria-label*="star"]')
        ?.parentElement;

    if (rc) {
      const rs = rc.querySelector('span[aria-hidden="true"]');
      rating = rs?.textContent?.trim() || '';

      const revSpan =
        rc.querySelector('span[aria-label*="review"]') ||
        rc.querySelector('span:last-child');
      if (revSpan) {
        const raw =
          revSpan.textContent ||
          revSpan.getAttribute('aria-label') ||
          '';
        const m = raw.match(/([\d,]+)/);
        reviews = m ? m[1].replace(/,/g, '') : '';
      }
    }

    if (!rating) {
      const img = document.querySelector(
        '[role="img"][aria-label*="star"]'
      );
      if (img) {
        const lbl = img.getAttribute('aria-label') || '';
        const rm = lbl.match(/([\d.]+)\s*star/i);
        rating = rm ? rm[1] : '';
        const revm = lbl.match(/([\d,]+)\s*review/i);
        reviews = revm ? revm[1].replace(/,/g, '') : '';
      }
    }

    /* ---- Category ------------------------------------------------ */
    const catEl =
      document.querySelector(
        'button[jsaction*="pane.rating.category"]'
      ) || document.querySelector('button[jsaction*="category"]');
    const category = catEl?.textContent?.trim() || '';

    /* ---- Price level --------------------------------------------- */
    let priceLevel = '';
    const priceEl = document.querySelector(
      'span[aria-label*="Price"], span[aria-label*="price"]'
    );
    if (priceEl) {
      priceLevel = priceEl.textContent?.trim() || '';
    }
    if (!priceLevel) {
      /* Sometimes shown right after the category as "$" / "$$" etc. */
      const allSpans = document.querySelectorAll(
        'span[aria-label*="$"], span[jsan*="price"]'
      );
      for (const sp of allSpans) {
        const t = sp.textContent?.trim() || '';
        if (/^\${1,4}$/.test(t)) {
          priceLevel = t;
          break;
        }
      }
    }

    /* ---- Opening status ------------------------------------------ */
    let openStatus = '';
    const ohContainer = document.querySelector(
      '[data-item-id="oh"]'
    );
    if (ohContainer) {
      const statusSpan = ohContainer.querySelector(
        'span[class]'
      );
      openStatus = statusSpan?.textContent?.trim() || '';
    }

    /* ---- Description (if visible) -------------------------------- */
    let description = '';
    const descEl = document.querySelector(
      'div[class*="WeS02d"]'
    );
    if (descEl) {
      description = descEl.textContent?.trim().slice(0, 500) || '';
    }

    /* ---- Social links -------------------------------------------- */
    const socialLinks = {};
    const allLinks = document.querySelectorAll('a[href]');
    for (const link of allLinks) {
      const href = link.href || '';
      if (href.includes('facebook.com/')) socialLinks.facebook = href;
      if (href.includes('instagram.com/')) socialLinks.instagram = href;
      if (href.includes('twitter.com/') || href.includes('x.com/'))
        socialLinks.twitter = href;
      if (href.includes('youtube.com/')) socialLinks.youtube = href;
      if (href.includes('linkedin.com/')) socialLinks.linkedin = href;
      if (href.includes('pinterest.com/')) socialLinks.pinterest = href;
      if (href.includes('tiktok.com/')) socialLinks.tiktok = href;
    }

    /* ---- Maps URL ------------------------------------------------ */
    const mapsUrl = window.location.href;

    return {
      name,
      website,
      phone,
      address,
      rating: rating ? parseFloat(rating) : null,
      reviews: reviews ? parseInt(reviews, 10) : null,
      category,
      priceLevel,
      openStatus,
      description,
      socialLinks,
      mapsUrl,
    };
  });
}

/* ------------------------------------------------------------------ */
/*  Validation                                                        */
/* ------------------------------------------------------------------ */

/**
 * Validate that a scraped business is legitimate and not an offline error page.
 * @param {Object} details
 * @returns {boolean}
 */
function isValidBusiness(details) {
  if (!details || !details.name) return false;

  const nameLower = details.name.toLowerCase();

  // Reject known offline / browser connection error messages
  if (
    nameLower.includes('internet') ||
    nameLower.includes('connection') ||
    nameLower.includes('الإنترنت') ||
    nameLower.includes('الانترنت') ||
    nameLower.includes('اتصال') ||
    nameLower.includes('خرائط google') ||
    nameLower.includes('google maps')
  ) {
    return false;
  }

  // Reject if it is completely empty of any identifying info other than name
  if (
    !details.address &&
    !details.category &&
    !details.phone &&
    !details.website
  ) {
    return false;
  }

  return true;
}

/* ------------------------------------------------------------------ */
/*  Single-query scraping                                             */
/* ------------------------------------------------------------------ */

/**
 * Scrape Google Maps results for one search query.
 *
 * @param {import('playwright').Page} page
 * @param {string} query
 * @param {import('./db').LeadsDatabase} db
 * @param {{total: number, sinceBreak: number}} counters - mutable counters.
 * @param {boolean} isFirstQueryOfSession
 * @returns {Promise<{success: boolean, results: Array<Object>, newCount: number, captchaStuck?: boolean}>}
 */
async function scrapeQuery(page, query, db, counters, isFirstQueryOfSession) {
  const results = [];
  let newCount = 0;
  let success = false;

  console.log(`\n\u{1F50D} Searching Google Maps: "${query}"`);

  try {
    await ensureOnline('Google Maps query search');
    const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: MAPS_PAGE_TIMEOUT,
    });

    await dismissOverlays(page);

    /* CAPTCHA gate ------------------------------------------------ */
    if (await detectCaptcha(page)) {
      console.warn(
        '\u26A0\uFE0F  CAPTCHA detected! Solve it in the browser window.'
      );
      console.warn('\u23F8\uFE0F  Pausing 90 seconds...');
      await new Promise((r) => setTimeout(r, 90000));

      if (await detectCaptcha(page)) {
        console.warn('\u26A0\uFE0F  CAPTCHA still present after 90s. Waiting another 120s...');
        await new Promise((r) => setTimeout(r, 120000));

        if (await detectCaptcha(page)) {
          console.error('\u274C CAPTCHA persists after 3.5 min. Signaling for context relaunch.');
          return { success: false, results, newCount, captchaStuck: true };
        }
      }
      console.log('\u2705 CAPTCHA resolved.');
    }

    success = true;

    /* Wait for feed or single result ------------------------------ */
    const hasFeed = await page
      .waitForSelector('div[role="feed"]', { timeout: 15000 })
      .catch(() => null);

    if (!hasFeed) {
      try {
        await page.waitForSelector('h1', { timeout: 8000 });
        const single = await extractBusinessDetails(page);
        if (single && single.name) {
          if (isValidBusiness(single)) {
            const parsed = parseAddress(single.address);
            single.city = parsed.city;
            single.state = parsed.state;

            if (!db.has(single)) {
              db.add(single);
              results.push(single);
              newCount++;
              const leadNum = ++global.leadCounter;
              single.leadNum = leadNum;
              console.log(`lead no ${leadNum} , ${single.name}, phase 1 complete`);
              if (single.website) {
                await findEmails([single], db);
              } else {
                console.log(`lead no ${leadNum} , ${single.name}, phase 2 complete (no website)`);
                console.log('completed starting a new lead');
              }
            } else {
              console.log(`   ⏭️ ${single.name} (already in DB)`);
            }
          } else {
            console.warn(`   ⚠️ Invalid/offline page detected. Skipping.`);
            success = false;
          }
        }
      } catch {
        console.warn(`\u26A0\uFE0F  No results for "${query}".`);
      }
      return { success, results, newCount };
    }

    // Removed the flaky fast-skip check. We will now check accurately during the visit loop.

    /* Scroll feed ------------------------------------------------- */
    await scrollResultsFeed(page, MAX_RESULTS_PER_QUERY);

    /* Collect unique place URLs ----------------------------------- */
    const placeLinks = await page.$$eval(
      'div[role="feed"] a[href*="/maps/place/"]',
      (anchors) => {
        const seen = new Set();
        return anchors
          .filter((a) => {
            if (seen.has(a.href)) return false;
            seen.add(a.href);
            return true;
          })
          .map((a) => ({
            href: a.href,
            label: a.getAttribute('aria-label') || '',
          }));
      }
    );

    const targets = placeLinks.slice(0, MAX_RESULTS_PER_QUERY);
    console.log(`   Found ${targets.length} results in feed`);

    /* Visit each place page --------------------------------------- */
    let first20AllInDb = true;

    for (let i = 0; i < targets.length; i++) {
      const { href, label } = targets[i];

      /* Break check */
      counters.sinceBreak++;
      if (counters.sinceBreak >= BREAK_AFTER_RESULTS) {
        counters.total += counters.sinceBreak;
        await takeBreak(counters.total);
        counters.sinceBreak = 0;
      }

      try {
        /* Detail page navigation with retry */
        let detailNavSuccess = false;
        for (let navAttempt = 0; navAttempt < 3; navAttempt++) {
          try {
            await page.goto(href, {
              waitUntil: 'domcontentloaded',
              timeout: MAPS_PAGE_TIMEOUT,
            });
            detailNavSuccess = true;
            break;
          } catch (navErr) {
            if (navAttempt < 2) {
              console.warn(
                `   [${i + 1}/${targets.length}] \u26A0\uFE0F  Detail nav failed (attempt ${navAttempt + 1}/3): ${navErr.message}. Retrying in 3s...`
              );
              await ensureOnline('detail page retry');
              await new Promise((r) => setTimeout(r, 3000));
            } else {
              throw navErr;
            }
          }
        }
        if (!detailNavSuccess) {
          first20AllInDb = false;
          continue;
        }

        await page
          .waitForSelector('h1', { timeout: 8000 })
          .catch(() => null);

        await randomDelay(800, 1500);

        const details = await extractBusinessDetails(page);

        if (details && details.name) {
          if (isValidBusiness(details)) {
            const parsed = parseAddress(details.address);
            details.city = parsed.city;
            details.state = parsed.state;

            if (!db.has(details)) {
              db.add(details);
              results.push(details);
              newCount++;
              first20AllInDb = false; // We found a new lead!
              
              const leadNum = ++global.leadCounter;
              details.leadNum = leadNum;
              console.log(`lead no ${leadNum} , ${details.name}, phase 1 complete`);
              if (details.website) {
                await findEmails([details], db);
              } else {
                console.log(`lead no ${leadNum} , ${details.name}, phase 2 complete (no website)`);
                console.log('completed starting a new lead');
              }
            } else {
              console.log(
                `   [${i + 1}/${targets.length}] ⏭️ ${label || details.name} (already in DB)`
              );
            }
          } else {
            console.warn(`   [${i + 1}/${targets.length}] ⚠️ Invalid/offline page, skipping.`);
            first20AllInDb = false;
          }
        } else {
          first20AllInDb = false;
        }

        /* If we just finished checking the 20th item (i == 19) and ALL of them were in DB, skip rest of query */
        if (i === 19 && first20AllInDb) {
          if (isFirstQueryOfSession) {
            console.log(`   [Info] The first 20 leads are already in DB, but since we just restarted, we will NOT skip. We are resuming this query to get the rest of the leads!`);
          } else {
            console.log(`   ⏭️ The first 20 leads were all already in DB. Skipping the rest of this query.`);
            break;
          }
        }

        await randomDelay(RESULT_DELAY_MIN, RESULT_DELAY_MAX);
      } catch (err) {
        console.warn(
          `   [${i + 1}/${targets.length}] \u26A0\uFE0F  Error: ${err.message}`
        );
        first20AllInDb = false;
      }
    }
  } catch (err) {
    console.error(`\u274C Query error "${query}": ${err.message}`);
    success = false;
  }

  return { success, results, newCount };
}

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/**
 * Execute all configured search queries, writing new businesses into
 * the database and returning the newly-discovered records.
 *
 * @param {string[]} queries
 * @param {import('./db').LeadsDatabase} db
 * @param {Function} [onQueryComplete] - async callback invoked after a query with new results
 * @returns {Promise<Array<Object>>} Newly added business records.
 */
async function scrapeAllQueries(queries, db, onQueryComplete) {
  const allNew = [];
  const counters = { total: 0, sinceBreak: 0 };
  let isFirstQueryOfSession = true;

  await ensureOnline('Google Maps scraper initialization');

  let browser = await chromium.launch({
    headless: HEADLESS,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--window-size=1366,768',
    ],
  });

  try {
    let { context, page } = await createFreshContext(browser);
    let queriesSinceRecycle = 0;

    for (let qi = 0; qi < queries.length; qi++) {
      const query = queries[qi];

      if (db.isQueryCompleted(query)) {
        console.log(
          `\n\u23ED\uFE0F Query ${qi + 1}/${queries.length} already completed: "${query}" (skipping)`
        );
        continue;
      }

      /* --- Context recycling every 10 queries to prevent memory leaks --- */
      queriesSinceRecycle++;
      if (queriesSinceRecycle > 10) {
        console.log('\n\u267B\uFE0F  Recycling browser context to free memory...');
        try { await context.close(); } catch { /* already gone */ }
        ({ context, page } = await createFreshContext(browser));
        queriesSinceRecycle = 1;
        console.log('\u2705 Fresh context ready.');
      }

      console.log(
        `\n\u{1F4C3} Query ${qi + 1}/${queries.length}: "${query}"`
      );

      /* --- Query-level retry with exponential backoff (3 attempts) --- */
      const QUERY_BACKOFFS = [30000, 60000, 120000];
      let querySucceeded = false;

      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) {
          const delaySec = QUERY_BACKOFFS[attempt - 1] / 1000;
          console.warn(
            `   \u{1F504} Retry ${attempt}/3 for "${query}" in ${delaySec}s...`
          );
          await new Promise((r) => setTimeout(r, QUERY_BACKOFFS[attempt - 1]));

          /* Rotate user-agent on retry */
          try {
            await context.setExtraHTTPHeaders({
              'User-Agent': getRandomUserAgent(),
            });
          } catch {
            /* context may be dead, crash recovery below will handle it */
          }
        } else {
          /* Rotate user-agent per query */
          await context.setExtraHTTPHeaders({
            'User-Agent': getRandomUserAgent(),
          });
        }

        try {
          const scrapeResult = await scrapeQuery(page, query, db, counters);
          allNew.push(...scrapeResult.results);

          console.log(
            `   \u2192 ${scrapeResult.newCount} new businesses added (DB total: ${db.size()})`
          );

          /* Handle CAPTCHA-stuck: close context, relaunch fresh, retry */
          if (scrapeResult.captchaStuck) {
            console.warn('   \u{1F6A8} CAPTCHA stuck — relaunching fresh context...');
            try { await context.close(); } catch { /* ignore */ }
            ({ context, page } = await createFreshContext(browser));
            queriesSinceRecycle = 0;
            continue;
          }

          if (scrapeResult.success) {
            db.markQueryCompleted(query);
            db.save();
            querySucceeded = true;
            if (onQueryComplete && scrapeResult.newCount > 0) {
              await onQueryComplete(scrapeResult.results);
            }
            const currentSuccess = db.getAll().filter(b => b.emails && b.emails.length > 0).length;
            if (currentSuccess >= 2000) {
               console.log('\n\u2705 Target of 2,000 successful leads reached! Aborting further Google Maps searches.');
               return allNew;
            }
            break;
          }
          /* success: false but not captchaStuck — retry */
          console.warn(
            `   \u26A0\uFE0F  Query "${query}" returned success:false (attempt ${attempt + 1}/3).`
          );
        } catch (queryErr) {
          /* --- Browser crash recovery --- */
          if (isBrowserCrash(queryErr)) {
            console.error(
              `   \u{1F4A5} Browser crash detected: ${queryErr.message}`
            );
            console.log('   \u23F3 Closing old browser and relaunching in 5s...');
            try { await context.close(); } catch { /* ignore */ }
            try { await browser.close(); } catch { /* ignore */ }
            await new Promise((r) => setTimeout(r, 5000));
            await ensureOnline('browser crash recovery');
            browser = await chromium.launch({
              headless: HEADLESS,
              args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-infobars',
                '--window-size=1366,768',
              ],
            });
            ({ context, page } = await createFreshContext(browser));
            queriesSinceRecycle = 0;
            console.log('   \u2705 New browser launched. Retrying same query...');
            continue;
          }
          /* Non-crash error — log and retry */
          console.error(
            `   \u274C Query error (attempt ${attempt + 1}/3): ${queryErr.message}`
          );
        }
      }

      if (!querySucceeded) {
        console.error(
          `   \u274C Query "${query}" failed after 3 attempts. Moving to next query (will retry on next run).`
        );
      }

      /* Inter-query delay */
      if (qi < queries.length - 1) {
        await randomDelay(QUERY_DELAY_MIN, QUERY_DELAY_MAX);
      }
    }

    try { await context.close(); } catch { /* may already be closed */ }
  } finally {
    try { await browser.close(); } catch { /* may already be closed */ }
  }

  console.log(
    `\n\u{1F4CA} Scraping complete: ${allNew.length} new businesses | ${db.size()} total in DB`
  );
  return allNew;
}

module.exports = { scrapeAllQueries, randomDelay, getRandomUserAgent };
