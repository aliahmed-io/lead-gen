// @ts-check
/**
 * @module run_halal_scraper
 * @description Standalone runner for halal e-commerce lead scraping.
 * - Reads queries from search_queries.json
 * - Stores results in halal_leads_db.json (separate from main DB)
 * - Exports to halal_leads.xlsx
 * - Runs until 10,000 leads are reached or all queries exhausted
 * - Fully resumable: re-running skips already-completed queries
 */

const fs = require('fs');
const path = require('path');

/* ------------------------------------------------------------------ */
/*  Override DB_FILE before requiring config or db                    */
/* ------------------------------------------------------------------ */
const HALAL_DB_FILE = path.resolve(__dirname, 'halal_leads_db.json');
const TARGET_LEADS = 10_000;

process.env.HALAL_RUN = 'true';

// ── Speed: inject --delay before config.js is required so it picks up
//    the faster value (250ms). Default is 500–2000ms which is too slow.
//    250ms is fast but still human-like enough to avoid bans.
if (!process.argv.some(a => a.startsWith('--delay='))) {
  process.argv.push('--delay=250');
}


const { scrapeAllQueries } = require('./scraper');
const { findEmails } = require('./emailFinder');
const { LeadsDatabase } = require('./db');
const { preventSleep, allowSleep } = require('./keepAwake');
const XLSX = require('xlsx');

/* ------------------------------------------------------------------ */
/*  Halal-specific Excel export (separate from leads.xlsx)            */
/* ------------------------------------------------------------------ */
const HALAL_OUTPUT_FILE = path.resolve(__dirname, 'halal_leads.xlsx');

/**
 * @param {any[]} leads
 * @returns {string} output path
 */
function halalExportToExcel(leads) {
  const sorted = [...leads].sort((a, b) => {
    const rA = typeof a.rating === 'number' ? a.rating : -1;
    const rB = typeof b.rating === 'number' ? b.rating : -1;
    return rB - rA;
  });
  const scrapedDate = new Date().toISOString().split('T')[0];
  const rows = sorted.map((l) => ({
    'Business Name': l.name || '',
    Email: l.email || '',
    'Email Status': l.emailStatus || '',
    Website: l.website || '',
    Phone: l.phone || '',
    City: l.city || '',
    State: l.state || '',
    Rating: typeof l.rating === 'number' ? l.rating : '',
    Reviews: typeof l.reviews === 'number' ? l.reviews : '',
    Platform: l.platform || '',
    Category: l.category || '',
    'Maps URL': l.mapsUrl || '',
    'Scraped Date': scrapedDate,
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 38 }, { wch: 32 }, { wch: 14 }, { wch: 38 }, { wch: 18 },
    { wch: 22 }, { wch: 8 },  { wch: 8 },  { wch: 10 }, { wch: 14 },
    { wch: 24 }, { wch: 55 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Halal Leads');
  try {
    XLSX.writeFile(wb, HALAL_OUTPUT_FILE);
  } catch (err) {
    if (/** @type {any} */ (err).code === 'EBUSY') {
      console.warn('⚠️  halal_leads.xlsx is open in another app — close it to save.');
    } else {
      console.error('❌ Error saving Excel:', err instanceof Error ? err.message : String(err));
    }
  }
  return HALAL_OUTPUT_FILE;
}

/* ------------------------------------------------------------------ */
/*  Load halal queries from search_queries.json                        */
/* ------------------------------------------------------------------ */
const sqPath = path.resolve(__dirname, 'search_queries.json');
if (!fs.existsSync(sqPath)) {
  console.error('❌ search_queries.json not found. Run: node scripts/generate_halal_queries.js');
  process.exit(1);
}

const sqData = JSON.parse(fs.readFileSync(sqPath, 'utf8'));
/** @type {string[]} */
const HALAL_QUERIES = (sqData.queries || []).map(
  /** @param {{ query: string }} q */ (q) => q.query
);

console.log(`📋 Loaded ${HALAL_QUERIES.length.toLocaleString()} halal search queries`);

/* ------------------------------------------------------------------ */
/*  Global state                                                      */
/* ------------------------------------------------------------------ */
/** @type {LeadsDatabase|null} */
let db = null;
let isShuttingDown = false;

/* ------------------------------------------------------------------ */
/*  Graceful shutdown                                                 */
/* ------------------------------------------------------------------ */
process.on('SIGINT', async () => {
  if (isShuttingDown) { process.exit(1); }
  isShuttingDown = true;
  console.log('\n\n🛑 Graceful shutdown — saving progress...');
  try {
    if (db) {
      db.save();
      console.log(`   ✅ Database saved: ${db.size()} leads`);
      const all = db.getAll();
      if (all.length > 0) {
        halalExportToExcel(all);
        console.log(`   ✅ Excel exported: halal_leads.xlsx`);
      }
    }
  } catch (err) {
    console.error('   ⚠️  Error during shutdown:', err instanceof Error ? err.message : String(err));
  }
  try { allowSleep(); } catch { /* ignore */ }
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  console.error('\n⚠️  [uncaughtException]', err.message);
  try { if (db) db.save(); allowSleep(); } catch { /* best-effort */ }
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('\n⚠️  [unhandledRejection]', reason instanceof Error ? reason.message : reason);
  try { if (db) db.save(); allowSleep(); } catch { /* best-effort */ }
  process.exit(1);
});

/* ------------------------------------------------------------------ */
/*  Main pipeline                                                     */
/* ------------------------------------------------------------------ */
async function main() {
  const startTime = Date.now();
  global['leadCounter'] = 0; // fix: prevents "lead no NaN" in scraper logs
  preventSleep();

  const bar = '═'.repeat(60);
  console.log(bar);
  console.log('🕌 HALAL E-COMMERCE LEAD SCRAPER');
  console.log(bar);
  console.log(`   Target leads:   ${TARGET_LEADS.toLocaleString()}`);
  console.log(`   Total queries:  ${HALAL_QUERIES.length.toLocaleString()}`);
  console.log(`   Database:       ${HALAL_DB_FILE}`);
  console.log(`   Output Excel:   halal_leads.xlsx`);
  console.log(`   Started at:     ${new Date().toLocaleString()}`);
  console.log(bar);

  /* ── Init DB ──────────────────────────────────────────────────── */
  db = new LeadsDatabase(HALAL_DB_FILE);
  const initialCount = db.size();
  console.log(`\n📂 Starting with ${initialCount} existing leads in halal DB`);

  if (initialCount >= TARGET_LEADS) {
    console.log(`\n✅ Already have ${initialCount} leads (≥ ${TARGET_LEADS} target). Done!`);
    const all = db.getAll();
    halalExportToExcel(all);
    console.log(`📄 Exported to: halal_leads.xlsx`);
    db.markRunComplete();
    allowSleep();
    return;
  }

  const remaining = TARGET_LEADS - initialCount;
  console.log(`\n🔍 Need ${remaining.toLocaleString()} more leads to reach ${TARGET_LEADS.toLocaleString()} target\n`);

  /* ── Clear email backlog ─────────────────────────────────────── */
  try {
    const backlog = db.getNeedingEmailScan();
    if (backlog.length > 0) {
      console.log(`📧 Processing ${backlog.length} backlogged emails first...`);
      await findEmails(backlog, db);
    }
  } catch (err) {
    console.error('⚠️  Email backlog scan failed:', err instanceof Error ? err.message : String(err));
  }

  /* ── Scrape phase ────────────────────────────────────────────── */
  let totalNew = 0;

  try {
    const newBusinesses = await scrapeAllQueries(
      HALAL_QUERIES,
      db,
      // onQueryComplete callback — check if we've hit target
      async (results) => {
        totalNew += results.length;
        const currentTotal = db.size();
        const pct = Math.min(100, ((currentTotal / TARGET_LEADS) * 100)).toFixed(1);
        console.log(
          `\n📊 Progress: ${currentTotal.toLocaleString()} / ${TARGET_LEADS.toLocaleString()} leads (${pct}%) | +${results.length} this query`
        );

        if (currentTotal >= TARGET_LEADS) {
          console.log(`\n🎯 TARGET REACHED! ${currentTotal.toLocaleString()} leads collected!`);
          // Export and stop
          try {
            const all = db.getAll();
            halalExportToExcel(all);
            console.log(`📄 Excel exported: halal_leads.xlsx`);
          } catch (exportErr) {
            console.error('⚠️  Export error:', exportErr instanceof Error ? exportErr.message : String(exportErr));
          }
          db.save();
          db.markRunComplete();
          allowSleep();
          process.exit(0);
        }
      }
    );

    totalNew = newBusinesses.length;
    console.log(`\n✅ Scraping complete: ${totalNew} new businesses | ${db.size()} total`);

  } catch (scrapeErr) {
    console.error('\n❌ Scraping phase failed:', scrapeErr instanceof Error ? scrapeErr.message : String(scrapeErr));
    console.log('💾 Saving DB and exporting what we have...');
    try { db.save(); } catch { /* best-effort */ }
  }

  /* ── Export ──────────────────────────────────────────────────── */
  try {
    console.log('\n📄 Exporting to Excel...');
    const all = db.getAll();
    halalExportToExcel(all);
    console.log(`   ✅ Exported ${all.length.toLocaleString()} leads to: halal_leads.xlsx`);
  } catch (exportErr) {
    console.error('\n❌ Export failed:', exportErr instanceof Error ? exportErr.message : String(exportErr));
  }

  try { db.save(); } catch { /* best-effort */ }
  db.markRunComplete();

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  const finalCount = db.size();
  console.log(`\n⏱️  Elapsed: ${elapsed} min | Final DB: ${finalCount.toLocaleString()} leads`);

  if (finalCount < TARGET_LEADS) {
    console.log(`\n⚠️  Reached ${finalCount.toLocaleString()} leads (target: ${TARGET_LEADS.toLocaleString()})`);
    console.log(`   Re-run this script to continue from where it left off.`);
  } else {
    console.log(`\n🎉 TARGET MET! ${finalCount.toLocaleString()} halal leads collected!`);
  }

  allowSleep();
}

/* ------------------------------------------------------------------ */
/*  Auto-restart loop (up to 5 restarts)                             */
/* ------------------------------------------------------------------ */
const MAX_RESTARTS = 5;
const RESTART_DELAY_MS = 30_000;

(async () => {
  let failures = 0;
  while (failures < MAX_RESTARTS) {
    try {
      await main();
      break;
    } catch (err) {
      failures++;
      console.error(`\n❌ main() threw (attempt ${failures}/${MAX_RESTARTS}):`, err instanceof Error ? err.message : String(err));
      try { if (db) db.save(); } catch { /* best-effort */ }
      if (failures >= MAX_RESTARTS) {
        console.error(`\n🛑 Exhausted ${MAX_RESTARTS} restart attempts. Giving up.`);
        try { allowSleep(); } catch { /* ignore */ }
        process.exit(1);
      }
      console.log(`🔄 Restarting in ${RESTART_DELAY_MS / 1000}s...`);
      await new Promise(r => setTimeout(r, RESTART_DELAY_MS));
    }
  }
  try { allowSleep(); } catch { /* ignore */ }
})().catch(err => {
  console.error('\n❌ Fatal error:', err.message);
  try { allowSleep(); } catch { /* ignore */ }
  process.exit(1);
});
