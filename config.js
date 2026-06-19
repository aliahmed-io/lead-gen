/**
 * @module config
 * @description Central configuration for the Google Maps lead scraper.
 * All tunable parameters live here for easy adjustment.
 */

const path = require('path');

/* ------------------------------------------------------------------ */
/*  Output                                                            */
/* ------------------------------------------------------------------ */

/** @type {string} Path for the Excel output file */
const OUTPUT_FILE = 'leads.xlsx';

/** @type {string} Path for the JSON database file */
const DB_FILE = path.resolve(__dirname, 'leads_db.json');

const isE2E = process.env.E2E_TESTS === 'true';

const delayArg = process.argv.find(arg => arg.startsWith('--delay='));
const delayVal = delayArg ? parseInt(delayArg.split('=')[1] || '', 10) : null;

/* ------------------------------------------------------------------ */
/*  Scraping limits                                                   */
/* ------------------------------------------------------------------ */

/** @type {number} Maximum results to collect per search query (stops earlier if feed exhausted) */
const MAX_RESULTS_PER_QUERY = isE2E ? 2 : 300;

/** @type {number} Concurrent website visits for email extraction (axios phase) */
const CONCURRENCY = isE2E ? 2 : 10;

/** @type {number} Concurrent pages for Playwright email fallback */
const PLAYWRIGHT_EMAIL_CONCURRENCY = isE2E ? 2 : 5;

/** @type {boolean} Run Playwright browser in headless mode */
const HEADLESS = true;

/** @type {boolean} Enable Playwright fallback for sites where axios found no email */
const USE_PLAYWRIGHT_FALLBACK = true;

/* ------------------------------------------------------------------ */
/*  Timing & anti-ban                                                 */
/* ------------------------------------------------------------------ */

/** @type {number} Minimum random delay between individual results (ms) */
const RESULT_DELAY_MIN = delayVal !== null ? delayVal : (isE2E ? 0 : 500);

/** @type {number} Maximum random delay between individual results (ms) */
const RESULT_DELAY_MAX = delayVal !== null ? delayVal : (isE2E ? 0 : 1000);

/** @type {number} Minimum delay between search queries (ms) */
const QUERY_DELAY_MIN = delayVal !== null ? delayVal : (isE2E ? 0 : 1000);

/** @type {number} Maximum delay between search queries (ms) */
const QUERY_DELAY_MAX = delayVal !== null ? delayVal : (isE2E ? 0 : 2000);

/** @type {number} Take a break after this many total results scraped */
const BREAK_AFTER_RESULTS = isE2E ? 10000 : 500;

/** @type {number} Minimum break duration (ms) — 5 seconds */
const BREAK_DURATION_MIN = isE2E ? 0 : 5000;

/** @type {number} Maximum break duration (ms) — 10 seconds */
const BREAK_DURATION_MAX = isE2E ? 0 : 10000;

/** @type {number} Website timeout in milliseconds */
const WEBSITE_TIMEOUT = isE2E ? 1000 : 5000;

/** @type {number} Playwright page timeout for email fallback (ms) */
const PLAYWRIGHT_PAGE_TIMEOUT = isE2E ? 1000 : 5000;

/** @type {number} Timeout for Google Maps page loads (ms) */
const MAPS_PAGE_TIMEOUT = isE2E ? 2000 : 35000;

/** @type {number} Delay between sub-page requests on the same domain (ms min) */
const SAME_DOMAIN_DELAY_MIN = 0;

/** @type {number} Delay between sub-page requests on the same domain (ms max) */
const SAME_DOMAIN_DELAY_MAX = 0;

/** @type {number} How often to auto-save the database (every N new records) */
const DB_AUTOSAVE_INTERVAL = 10;

/* ------------------------------------------------------------------ */
/*  User agents                                                       */
/* ------------------------------------------------------------------ */

/**
 * @type {string[]}
 * Realistic Chrome user-agent strings rotated between requests.
 */
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
];

/* ------------------------------------------------------------------ */
/*  Viewport pool (randomised per session)                            */
/* ------------------------------------------------------------------ */

/** @type {Array<{width:number, height:number}>} */
const VIEWPORTS = [
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1536, height: 864 },
  { width: 1280, height: 800 },
  { width: 1920, height: 1080 },
];

/* ------------------------------------------------------------------ */
/*  Search queries — Texas, Florida, North Carolina                   */
/* ------------------------------------------------------------------ */

const ALL_QUERIES = [
  // ─── Texas — Furniture ──────────────────────────────────────────
  'furniture store Texas',
  'furniture store Houston TX',
  'furniture store Dallas TX',
  'furniture store San Antonio TX',
  'furniture store Austin TX',
  'furniture store Fort Worth TX',
  'furniture store El Paso TX',
  'furniture store Arlington TX',
  'furniture store Plano TX',
  'furniture store Lubbock TX',
  'furniture store Corpus Christi TX',
  'furniture store Amarillo TX',
  'furniture store Frisco TX',
  'furniture store McKinney TX',
  'furniture store Waco TX',
  'furniture store Midland TX',
  'furniture store Denton TX',
  'furniture store Round Rock TX',
  'furniture store Beaumont TX',
  'furniture store Tyler TX',
  'furniture store College Station TX',
  'furniture store Sugar Land TX',
  'furniture store Conroe TX',

  // ─── Texas — Home Decor ─────────────────────────────────────────
  'home decor store Texas',
  'home decor store Houston TX',
  'home decor store Dallas TX',
  'home decor store San Antonio TX',
  'home decor store Austin TX',
  'home decor store Fort Worth TX',
  'home decor store Plano TX',
  'home decor store Frisco TX',
  'home furnishing store Houston TX',
  'home furnishing store Dallas TX',
  'home furnishing store Austin TX',
  'interior design store Houston TX',
  'interior design store Dallas TX',
  'interior design store Austin TX',
  'home accessories store Houston TX',
  'home accessories store Dallas TX',
  'home accessories store San Antonio TX',

  // ─── Florida — Furniture ────────────────────────────────────────
  'furniture store Florida',
  'furniture store Miami FL',
  'furniture store Orlando FL',
  'furniture store Tampa FL',
  'furniture store Jacksonville FL',
  'furniture store Fort Lauderdale FL',
  'furniture store West Palm Beach FL',
  'furniture store St Petersburg FL',
  'furniture store Hialeah FL',
  'furniture store Cape Coral FL',
  'furniture store Tallahassee FL',
  'furniture store Gainesville FL',
  'furniture store Clearwater FL',
  'furniture store Lakeland FL',
  'furniture store Boca Raton FL',
  'furniture store Sarasota FL',
  'furniture store Naples FL',
  'furniture store Fort Myers FL',
  'furniture store Daytona Beach FL',
  'furniture store Kissimmee FL',
  'furniture store Ocala FL',
  'furniture store Palm Coast FL',
  'furniture store Pompano Beach FL',

  // ─── Florida — Home Decor ──────────────────────────────────────
  'home decor store Florida',
  'home decor store Miami FL',
  'home decor store Orlando FL',
  'home decor store Tampa FL',
  'home decor store Jacksonville FL',
  'home decor store Fort Lauderdale FL',
  'home decor store West Palm Beach FL',
  'home decor store Boca Raton FL',
  'home decor store Naples FL',
  'home decor store Sarasota FL',
  'home furnishing store Miami FL',
  'home furnishing store Orlando FL',
  'home furnishing store Tampa FL',
  'interior design store Miami FL',
  'interior design store Orlando FL',
  'interior design store Tampa FL',
  'home accessories store Miami FL',

  // ─── North Carolina — Furniture ─────────────────────────────────
  'furniture store North Carolina',
  'furniture store Charlotte NC',
  'furniture store Raleigh NC',
  'furniture store Greensboro NC',
  'furniture store Durham NC',
  'furniture store Winston-Salem NC',
  'furniture store Fayetteville NC',
  'furniture store Wilmington NC',
  'furniture store High Point NC',
  'furniture store Asheville NC',
  'furniture store Cary NC',
  'furniture store Concord NC',
  'furniture store Gastonia NC',
  'furniture store Chapel Hill NC',
  'furniture store Huntersville NC',
  'furniture store Mooresville NC',
  'furniture store Hickory NC',
  'furniture store Apex NC',
  'furniture store Burlington NC',
  'furniture store Kannapolis NC',

  // ─── North Carolina — Home Decor ────────────────────────────────
  'home decor store North Carolina',
  'home decor store Charlotte NC',
  'home decor store Raleigh NC',
  'home decor store Greensboro NC',
  'home decor store Durham NC',
  'home decor store Winston-Salem NC',
  'home decor store Wilmington NC',
  'home decor store Asheville NC',
  'home decor store High Point NC',
  'home decor store Cary NC',
  'home furnishing store Charlotte NC',
  'home furnishing store Raleigh NC',
  'home furnishing store Greensboro NC',
  'interior design store Charlotte NC',
  'interior design store Raleigh NC',
  'interior design store Asheville NC',
  'home accessories store Charlotte NC',
  'home accessories store Raleigh NC',

  // ─── Texas New Queries ──────────────────────────────────────────
  'furniture store Laredo TX',
  'furniture store McAllen TX',
  'furniture store Brownsville TX',
  'furniture store Killeen TX',
  'furniture store Abilene TX',
  'furniture store Wichita Falls TX',
  'furniture store Odessa TX',
  'furniture store San Angelo TX',
  'furniture store Longview TX',
  'furniture store Galveston TX',
  'furniture store Victoria TX',
  'furniture store Port Arthur TX',
  'furniture store Harlingen TX',
  'furniture store Temple TX',
  'furniture store Texarkana TX',
  'home decor store El Paso TX',
  'home decor store Laredo TX',
  'home decor store McAllen TX',
  'home decor store Lubbock TX',
  'home decor store Amarillo TX',
  'home decor store Corpus Christi TX',

  // ─── Florida New Queries ────────────────────────────────────────
  'furniture store Pensacola FL',
  'furniture store Panama City FL',
  'furniture store St. Augustine FL',
  'furniture store Port St. Lucie FL',
  'furniture store Fort Pierce FL',
  'furniture store Melbourne FL',
  'furniture store Hollywood FL',
  'furniture store Pembroke Pines FL',
  'furniture store Coral Springs FL',
  'furniture store Delray Beach FL',
  'furniture store Boynton Beach FL',
  'furniture store Key West FL',
  'furniture store Bradenton FL',
  'furniture store Venice FL',
  'furniture store Port Charlotte FL',
  'furniture store Brandon FL',
  'furniture store Spring Hill FL',
  'home decor store Tallahassee FL',
  'home decor store Pensacola FL',
  'home decor store Port St. Lucie FL',
  'home decor store Fort Myers FL',
  'home decor store Bradenton FL',
  'home decor store Lakeland FL',
  'home decor store Gainesville FL',

  // ─── North Carolina New Queries ─────────────────────────────────
  'furniture store Jacksonville NC',
  'furniture store Greenville NC',
  'furniture store Rocky Mount NC',
  'furniture store Wilson NC',
  'furniture store Goldsboro NC',
  'furniture store Salisbury NC',
  'furniture store Statesville NC',
  'furniture store Shelby NC',
  'furniture store Morganton NC',
  'furniture store Kernersville NC',
  'furniture store Thomasville NC',
  'furniture store Lexington NC',
  'furniture store Wake Forest NC',
  'furniture store Garner NC',
  'furniture store Clayton NC',
  'furniture store Fuquay-Varina NC',
  'furniture store Holly Springs NC',
  'home decor store Fayetteville NC',
  'home decor store Greenville NC',
  'home decor store Jacksonville NC',
  'home decor store Rocky Mount NC',
  'home decor store Goldsboro NC',
  'home decor store Concord NC',
  'home decor store Gastonia NC',
  'home decor store Chapel Hill NC',
  'furniture store Grand Prairie TX',
  'home decor store Grand Prairie TX',
  'furniture store Pasadena TX',
  'home decor store Pasadena TX',
  'furniture store Pearland TX',
  'home decor store Pearland TX',
  'furniture store Allen TX',
  'home decor store Allen TX',
  'furniture store League City TX',
  'home decor store League City TX',
  'furniture store Richardson TX',
  'home decor store Richardson TX',
  'furniture store Mesquite TX',
  'home decor store Mesquite TX',
  'furniture store Carrollton TX',
  'home decor store Carrollton TX',
  'furniture store Lewisville TX',
  'home decor store Lewisville TX',
  'furniture store New Braunfels TX',
  'home decor store New Braunfels TX',
  'furniture store Baytown TX',
  'home decor store Baytown TX',
  'furniture store Missouri City TX',
  'home decor store Missouri City TX',
  'furniture store Mansfield TX',
  'home decor store Mansfield TX',
  'furniture store San Marcos TX',
  'home decor store San Marcos TX',
  'furniture store Pflugerville TX',
  'home decor store Pflugerville TX',
  'furniture store Rowlett TX',
  'home decor store Rowlett TX',
  'furniture store Euless TX',
  'home decor store Euless TX',
  'furniture store DeSoto TX',
  'home decor store DeSoto TX',
  'furniture store Grapevine TX',
  'home decor store Grapevine TX',
  'furniture store Bedford TX',
  'home decor store Bedford TX',
  'furniture store Cedar Park TX',
  'home decor store Cedar Park TX',
  'furniture store Leander TX',
  'home decor store Leander TX',
  'furniture store Wylie TX',
  'home decor store Wylie TX',
  'furniture store Burleson TX',
  'home decor store Burleson TX',
  'furniture store Rockwall TX',
  'home decor store Rockwall TX',
  'furniture store Little Elm TX',
  'home decor store Little Elm TX',
  'furniture store Keller TX',
  'home decor store Keller TX',
  'furniture store The Colony TX',
  'home decor store The Colony TX',
  'furniture store Temple TX',
  'home decor store Temple TX',
  'furniture store Haltom City TX',
  'home decor store Haltom City TX',
  'furniture store Hurst TX',
  'home decor store Hurst TX',
  'furniture store Coppell TX',
  'home decor store Coppell TX',
  'furniture store Duncanville TX',
  'home decor store Duncanville TX',
  'furniture store Lancaster TX',
  'home decor store Lancaster TX',
  'furniture store Friendswood TX',
  'home decor store Friendswood TX',
  'furniture store Rosenberg TX',
  'home decor store Rosenberg TX',
  'furniture store Waxahachie TX',
  'home decor store Waxahachie TX',
  'furniture store Cleburne TX',
  'home decor store Cleburne TX',
  'furniture store Southlake TX',
  'home decor store Southlake TX',
  'furniture store Farmers Branch TX',
  'home decor store Farmers Branch TX',
  'furniture store Weatherford TX',
  'home decor store Weatherford TX',
  'furniture store Greenville TX',
  'home decor store Greenville TX',
  'furniture store Alvin TX',
  'home decor store Alvin TX',
  'furniture store Forney TX',
  'home decor store Forney TX',
  'furniture store Seguin TX',
  'home decor store Seguin TX',
  'furniture store Midlothian TX',
  'home decor store Midlothian TX',
  'furniture store Schertz TX',
  'home decor store Schertz TX',
  'furniture store Lufkin TX',
  'home decor store Lufkin TX',
  'furniture store Nacogdoches TX',
  'home decor store Nacogdoches TX',
  'furniture store Corsicana TX',
  'home decor store Corsicana TX',
  'furniture store Bryan TX',
  'home decor store Bryan TX',
  'furniture store Huntsville TX',
  'home decor store Huntsville TX',
  'furniture store Marshall TX',
  'home decor store Marshall TX',
  'furniture store Paris TX',
  'home decor store Paris TX',
  'furniture store Denison TX',
  'home decor store Denison TX',
  'furniture store Sherman TX',
  'home decor store Sherman TX',
  'furniture store Mount Pleasant TX',
  'home decor store Mount Pleasant TX',
  'furniture store Miramar FL',
  'home decor store Miramar FL',
  'furniture store Coral Gables FL',
  'home decor store Coral Gables FL',
  'furniture store Davie FL',
  'home decor store Davie FL',
  'furniture store Plantation FL',
  'home decor store Plantation FL',
  'furniture store Sunrise FL',
  'home decor store Sunrise FL',
  'furniture store Miami Beach FL',
  'home decor store Miami Beach FL',
  'furniture store Jupiter FL',
  'home decor store Jupiter FL',
  'furniture store Deerfield Beach FL',
  'home decor store Deerfield Beach FL',
  'furniture store Margate FL',
  'home decor store Margate FL',
  'furniture store Coconut Creek FL',
  'home decor store Coconut Creek FL',
  'furniture store Wellington FL',
  'home decor store Wellington FL',
  'furniture store North Miami FL',
  'home decor store North Miami FL',
  'furniture store Port Orange FL',
  'home decor store Port Orange FL',
  'furniture store Apopka FL',
  'home decor store Apopka FL',
  'furniture store Sanford FL',
  'home decor store Sanford FL',
  'furniture store Weston FL',
  'home decor store Weston FL',
  'furniture store Deltona FL',
  'home decor store Deltona FL',
  'furniture store Tamarac FL',
  'home decor store Tamarac FL',
  'furniture store Pinellas Park FL',
  'home decor store Pinellas Park FL',
  'furniture store Ocoee FL',
  'home decor store Ocoee FL',
  'furniture store Palm Beach Gardens FL',
  'home decor store Palm Beach Gardens FL',
  'furniture store Winter Garden FL',
  'home decor store Winter Garden FL',
  'furniture store Daytona Beach FL',
  'home decor store Daytona Beach FL',
  'furniture store Cutler Bay FL',
  'home decor store Cutler Bay FL',
  'furniture store North Miami Beach FL',
  'home decor store North Miami Beach FL',
  'furniture store Bonita Springs FL',
  'home decor store Bonita Springs FL',
  'furniture store Oakland Park FL',
  'home decor store Oakland Park FL',
  'furniture store Greenacres FL',
  'home decor store Greenacres FL',
  'furniture store Altamonte Springs FL',
  'home decor store Altamonte Springs FL',
  'furniture store Lake Worth FL',
  'home decor store Lake Worth FL',
  'furniture store Ormond Beach FL',
  'home decor store Ormond Beach FL',
  'furniture store Hallandale Beach FL',
  'home decor store Hallandale Beach FL',
  'furniture store Aventura FL',
  'home decor store Aventura FL',
  'furniture store Oviedo FL',
  'home decor store Oviedo FL',
  'furniture store Winter Springs FL',
  'home decor store Winter Springs FL',
  'furniture store Royal Palm Beach FL',
  'home decor store Royal Palm Beach FL',
  'furniture store Riviera Beach FL',
  'home decor store Riviera Beach FL',
  'furniture store Winter Haven FL',
  'home decor store Winter Haven FL',
  'furniture store Titusville FL',
  'home decor store Titusville FL',
  'furniture store Plant City FL',
  'home decor store Plant City FL',
  'furniture store Dunedin FL',
  'home decor store Dunedin FL',
  'furniture store Tarpon Springs FL',
  'home decor store Tarpon Springs FL',
  'furniture store Coral Springs FL',
  'home decor store Coral Springs FL',
  'furniture store Boynton Beach FL',
  'home decor store Boynton Beach FL',
  'furniture store Delray Beach FL',
  'home decor store Delray Beach FL',
  'furniture store Venice FL',
  'home decor store Venice FL',
  'furniture store Stuart FL',
  'home decor store Stuart FL',
  'furniture store Vero Beach FL',
  'home decor store Vero Beach FL',
  'furniture store Sebastian FL',
  'home decor store Sebastian FL',
  'furniture store Leesburg FL',
  'home decor store Leesburg FL',
  'furniture store Eustis FL',
  'home decor store Eustis FL',
  'furniture store Indian Trail NC',
  'home decor store Indian Trail NC',
  'furniture store Monroe NC',
  'home decor store Monroe NC',
  'furniture store Sanford NC',
  'home decor store Sanford NC',
  'furniture store Matthews NC',
  'home decor store Matthews NC',
  'furniture store New Bern NC',
  'home decor store New Bern NC',
  'furniture store Clemmons NC',
  'home decor store Clemmons NC',
  'furniture store Lexington NC',
  'home decor store Lexington NC',
  'furniture store Thomasville NC',
  'home decor store Thomasville NC',
  'furniture store Holly Springs NC',
  'home decor store Holly Springs NC',
  'furniture store Fuquay-Varina NC',
  'home decor store Fuquay-Varina NC',
  'furniture store Garner NC',
  'home decor store Garner NC',
  'furniture store Wake Forest NC',
  'home decor store Wake Forest NC',
  'furniture store Cornelius NC',
  'home decor store Cornelius NC',
  'furniture store Mint Hill NC',
  'home decor store Mint Hill NC',
  'furniture store Mooresville NC',
  'home decor store Mooresville NC',
  'furniture store Hickory NC',
  'home decor store Hickory NC',
  'furniture store Apex NC',
  'home decor store Apex NC',
  'furniture store Burlington NC',
  'home decor store Burlington NC',
  'furniture store Kannapolis NC',
  'home decor store Kannapolis NC',
  'furniture store Jacksonville NC',
  'home decor store Jacksonville NC',
  'furniture store Greenville NC',
  'home decor store Greenville NC',
  'furniture store Rocky Mount NC',
  'home decor store Rocky Mount NC',
  'furniture store Wilson NC',
  'home decor store Wilson NC',
  'furniture store Goldsboro NC',
  'home decor store Goldsboro NC',
  'furniture store Salisbury NC',
  'home decor store Salisbury NC',
  'furniture store Statesville NC',
  'home decor store Statesville NC',
  'furniture store Shelby NC',
  'home decor store Shelby NC',
  'furniture store Morganton NC',
  'home decor store Morganton NC',
  'furniture store Kernersville NC',
  'home decor store Kernersville NC',
  'furniture store Hendersonville NC',
  'home decor store Hendersonville NC',
  'furniture store Kinston NC',
  'home decor store Kinston NC',
  'furniture store Mount Airy NC',
  'home decor store Mount Airy NC',
  'furniture store Lumberton NC',
  'home decor store Lumberton NC',
  'furniture store Lenoir NC',
  'home decor store Lenoir NC',
  'furniture store Elizabeth City NC',
  'home decor store Elizabeth City NC',
  'furniture store Clayton NC',
  'home decor store Clayton NC',
  'furniture store Carrboro NC',
  'home decor store Carrboro NC',
  'furniture store Leland NC',
  'home decor store Leland NC',
  'furniture store Boone NC',
  'home decor store Boone NC',
  'furniture store Hope Mills NC',
  'home decor store Hope Mills NC',
  'furniture store Pinehurst NC',
  'home decor store Pinehurst NC',
  'furniture store Southern Pines NC',
  'home decor store Southern Pines NC',
  'furniture store Havelock NC',
  'home decor store Havelock NC',
  'furniture store Roanoke Rapids NC',
  'home decor store Roanoke Rapids NC',
  'furniture store Garrison NC',
  'home decor store Garrison NC',
];

const queryArg = process.argv.find(arg => arg.startsWith('--query='));
const queryVal = queryArg ? (queryArg.split('=')[1] || '').replace(/^["']|["']$/g, '') : null;
const SEARCH_QUERIES = queryVal ? [queryVal] : (isE2E ? ['test query'] : ALL_QUERIES);

/* ------------------------------------------------------------------ */
/*  Email scanning                                                    */
/* ------------------------------------------------------------------ */

/**
 * @type {string[]}
 * Static paths to visit on every business website when hunting for emails.
 * Dynamic contact-link discovery supplements these.
 */
const EMAIL_SCAN_PATHS = [
  '',
  '/contact',
  '/contact-us',
  '/contactus',
  '/about',
  '/about-us',
  '/aboutus',
  '/customer-service',
  '/help',
  '/get-in-touch',
  '/connect',
  '/info',
  '/support',
  '/our-story',
  '/pages/contact',
  '/pages/about',
  '/pages/contact-us',
];

/**
 * @type {RegExp}
 * Pattern for matching email addresses in page content.
 */
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/**
 * @type {RegExp[]}
 * Patterns that look like emails but are false positives.
 */
const EMAIL_BLACKLIST_PATTERNS = [
  /@.*\.(png|jpg|jpeg|gif|svg|webp|css|js|map|woff|woff2|ttf|eot|ico)$/i,
  /^(example|test|your|info|user|admin|name|email|username|support)@(example|test|domain|email|yoursite|company|site|sample)\./i,
  /@(2x|3x)\./i,
  /wixpress\.com$/i,
  /sentry\.io$/i,
  /sentry-next\.wixpress\.com$/i,
  /schema\.org$/i,
  /w3\.org$/i,
  /googleusercontent\.com$/i,
  /googleapis\.com$/i,
  /gstatic\.com$/i,
  /facebook\.com$/i,
  /twitter\.com$/i,
  /instagram\.com$/i,
  /placeholder/i,
  /noreply/i,
  /no-reply/i,
  /donotreply/i,
  /webpack/i,
  /localhost/i,
  /changeme/i,
];

/**
 * @type {string[]}
 * Domains of large national chains whose corporate sites never expose
 * store-level email addresses. Skipped during Playwright fallback to
 * save time (axios pass still runs for completeness).
 */
const CHAIN_DOMAINS = [
  'roomstogo.com',
  'athome.com',
  'homegoods.com',
  'tjmaxx.com',
  'ashleyfurniture.com',
  'ashleyhomestore.com',
  'wayfair.com',
  'westelm.com',
  'potterybarn.com',
  'crateandbarrel.com',
  'havertys.com',
  'zgallerie.com',
  'kirklands.com',
  'worldmarket.com',
  'americanfreight.com',
  'la-z-boy.com',
  'lazboy.com',
  'bassettfurniture.com',
  'roomandboard.com',
  'perigold.com',
  'livingspaces.com',
  'kanesfurniture.com',
  'furniturerow.com',
  'nadeaufurniture.com',
  'naturepedic.com',
  'kimbrells.com',
  'ikea.com',
  'target.com',
  'walmart.com',
  'amazon.com',
  'overstock.com',
  'pier1.com',
  'cb2.com',
  'rfresto.com',
  'valuecityfurniture.com',
  'dfresto.com',
  'bfresto.com',
];

module.exports = {
  OUTPUT_FILE,
  DB_FILE,
  SEARCH_QUERIES,
  MAX_RESULTS_PER_QUERY,
  CONCURRENCY,
  PLAYWRIGHT_EMAIL_CONCURRENCY,
  HEADLESS,
  USE_PLAYWRIGHT_FALLBACK,
  RESULT_DELAY_MIN,
  RESULT_DELAY_MAX,
  QUERY_DELAY_MIN,
  QUERY_DELAY_MAX,
  BREAK_AFTER_RESULTS,
  BREAK_DURATION_MIN,
  BREAK_DURATION_MAX,
  WEBSITE_TIMEOUT,
  PLAYWRIGHT_PAGE_TIMEOUT,
  MAPS_PAGE_TIMEOUT,
  SAME_DOMAIN_DELAY_MIN,
  SAME_DOMAIN_DELAY_MAX,
  DB_AUTOSAVE_INTERVAL,
  USER_AGENTS,
  VIEWPORTS,
  EMAIL_SCAN_PATHS,
  EMAIL_REGEX,
  EMAIL_BLACKLIST_PATTERNS,
  CHAIN_DOMAINS,
};
