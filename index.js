// @ts-check
/**
 * @module index
 * @description Main entry point for the Google Maps lead scraper.
 *
 * Orchestrates a three-phase pipeline with persistent database storage:
 *   Phase 1 — Scrape Google Maps (new businesses only).
 *   Phase 2 — Visit websites for emails (axios + Playwright fallback).
 *   Phase 3 — Export full database to Excel.
 *
 * Includes graceful shutdown (Ctrl+C saves progress), automatic breaks,
 * and database deduplication so the script can be re-run safely to
 * accumulate leads across sessions.
 *
 * Exit codes:
 *   0 — success
 *   1 — fatal error
 */

const { scrapeAllQueries } = require('./scraper');
const { findEmails } = require('./emailFinder');
const { exportToExcel, printSummary } = require('./exporter');
const { LeadsDatabase } = require('./db');
const { preventSleep, allowSleep } = require('./keepAwake');
const { SEARCH_QUERIES, OUTPUT_FILE, DB_FILE } = require('./config');

/* ------------------------------------------------------------------ */
/*  Uncaught exception / unhandled rejection safety nets              */
/* ------------------------------------------------------------------ */

process.on('uncaughtException', (err) => {
  console.error('\n\u26A0\uFE0F  [uncaughtException]', err.message);
  console.error(err.stack);
  try {
    if (db) /** @type {import('./db').LeadsDatabase} */ (db).save();
    allowSleep();
  } catch { /* best-effort */ }
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error(
    '\n\u26A0\uFE0F  [unhandledRejection]',
    reason instanceof Error ? reason.message : reason
  );
  if (reason instanceof Error) console.error(reason.stack);
  try {
    if (db) /** @type {import('./db').LeadsDatabase} */ (db).save();
    allowSleep();
  } catch { /* best-effort */ }
  process.exit(1);
});

/* ------------------------------------------------------------------ */
/*  Global state for graceful shutdown                                */
/* ------------------------------------------------------------------ */

/** @type {import('./db').LeadsDatabase|null} */
let db = null;

/** @type {boolean} */
let isShuttingDown = false;

/**
 * Handle SIGINT (Ctrl+C): save the database and export whatever we
 * have so far, then exit cleanly.
 */
function setupGracefulShutdown() {
  process.on('SIGINT', () => {
    if (isShuttingDown) {
      console.log('\nForce quitting...');
      process.exit(1);
    }
    isShuttingDown = true;
    console.log(
      '\n\n\u{1F6D1} Graceful shutdown \u2014 saving progress...'
    );

    try {
      if (db) {
        db.save();
        console.log('   \u2705 Database saved.');

        const all = db.getAll();
        if (all.length > 0) {
          const outputPath = exportToExcel(all);
          console.log(`   \u2705 Excel exported: ${outputPath}`);
        }

        db.markRunComplete();
      }
    } catch (err) {
      console.error('   \u26A0\uFE0F  Error during shutdown:', err instanceof Error ? err.message : String(err));
    }

    try {
      allowSleep();
    } catch {
      /* ignore */
    }

    process.exit(0);
  });
}

/* ------------------------------------------------------------------ */
/*  Main pipeline                                                     */
/* ------------------------------------------------------------------ */

/**
 * Run the full lead-generation pipeline.
 * @returns {Promise<void>}
 */
async function main() {
  const startTime = Date.now();

  setupGracefulShutdown();
  preventSleep();

  const bar = '\u2550'.repeat(56);
  console.log(bar);
  console.log('\u{1F680} Google Maps Lead Scraper v2');
  console.log(bar);
  console.log(`   Queries:        ${SEARCH_QUERIES.length}`);
  console.log(`   Output file:    ${OUTPUT_FILE}`);
  console.log(`   Database:       ${DB_FILE}`);
  console.log(`   Started at:     ${new Date().toLocaleString()}`);
  console.log(bar);

  // Validate configuration
  if (!Array.isArray(SEARCH_QUERIES) || SEARCH_QUERIES.length === 0) {
    console.error('\u274C Error: SEARCH_QUERIES is invalid or empty in config.');
    process.exit(1);
  }
  if (!OUTPUT_FILE) {
    console.error('\u274C Error: OUTPUT_FILE is not defined in config.');
    process.exit(1);
  }
  if (!DB_FILE) {
    console.error('\u274C Error: DB_FILE is not defined in config.');
    process.exit(1);
  }

  /* ── Initialise database ────────────────────────────────────── */
  db = new LeadsDatabase();
  const initialCount = db.size();

  /* ── Phase 1: Clear Email Backlog ───────────────────────────── */
  try {
    const backlog = db.getNeedingEmailScan();
    if (backlog.length > 0) {
      await findEmails(backlog, db);
    }
  } catch (phase1Err) {
    console.error('\n\u274C Phase 1 (backlog) failed:', phase1Err instanceof Error ? phase1Err.message : String(phase1Err));
    if (phase1Err instanceof Error) console.error(phase1Err.stack);
    console.log('\u{1F504} Continuing to Phase 2 (Interleaved Maps/Email)...');
  }

  /* ── Phase 2: Interleaved Maps + Emails ─────────────────────── */
  try {
    const currentSuccess = db.getAll().filter(b => b.email && b.email.length > 0).length;
    if (currentSuccess >= 2000) {
      console.log('\n\u2705 Target of 2,000 successful leads reached. Skipping Maps Scraping.');
    } else {
      const newBusinesses = await scrapeAllQueries(SEARCH_QUERIES, db);

      console.log(
        `\u2705 Phase 2 complete: ${newBusinesses.length} new businesses added | ${db.size()} total in DB`
      );
    }
  } catch (phase2Err) {
    console.error('\n\u274C Phase 2 failed:', phase2Err instanceof Error ? phase2Err.message : String(phase2Err));
    if (phase2Err instanceof Error) console.error(phase2Err.stack);
    console.log('\u{1F504} Continuing to Phase 3 (export) with existing DB records...');
    try { db.save(); } catch { /* best-effort */ }
  }

  /* ── Phase 3: Excel export ────────────────────────────────── */
  try {
    console.log('\n\u{1F4C4} Phase 3 \u2014 Exporting to Excel...');
    const allLeads = db.getAll();
    const outputPath = exportToExcel(allLeads);
    console.log(`   \u2705 Saved ${allLeads.length} leads to: ${outputPath}`);

    /* ── Summary ─────────────────────────────────────────────── */
    printSummary(allLeads);
  } catch (phase3Err) {
    console.error('\n\u274C Phase 3 (export) failed:', phase3Err instanceof Error ? phase3Err.message : String(phase3Err));
    if (phase3Err instanceof Error) console.error(phase3Err.stack);
  }

  /* ── Finalise ─────────────────────────────────────────────── */
  try { db.save(); } catch { /* best-effort */ }
  db.markRunComplete();

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n\u23F1\uFE0F  Total elapsed time: ${elapsed} minutes`);
  console.log(`\u{1F4C2} Database: ${db.size()} records (was ${initialCount})`);
  console.log('\u{1F389} Done!\n');

  try {
    allowSleep();
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/*  Auto-restart loop                                                 */
/* ------------------------------------------------------------------ */

const MAX_RESTARTS = 5;
const RESTART_DELAY_MS = 30_000;

(async () => {
  
  global['leadCounter'] = 0;
  let consecutiveFailures = 0;

  // The script will now naturally resume from the last uncompleted query.

  while (consecutiveFailures < MAX_RESTARTS) {
    try {
      await main();
      // If main() resolves cleanly, we're done.
      break;
    } catch (fatalErr) {
      consecutiveFailures++;
      console.error(
        `\n\u274C main() threw (attempt ${consecutiveFailures}/${MAX_RESTARTS}):`,
        fatalErr instanceof Error ? fatalErr.message : String(fatalErr)
      );
      if (fatalErr instanceof Error) console.error(fatalErr.stack);

      // Emergency save before restarting.
      try {
        if (db) {
          /** @type {import('./db').LeadsDatabase} */ (db).save();
          console.log('\u{1F4BE} Emergency database save completed.');
        }
      } catch { /* nothing more we can do */ }

      if (consecutiveFailures >= MAX_RESTARTS) {
        console.error(
          `\n\u{1F6D1} Exhausted ${MAX_RESTARTS} restart attempts. Giving up.`
        );
        try { allowSleep(); } catch { /* ignore */ }
        process.exit(1);
      }

      console.log(
        `\u{1F504} Restarting in ${RESTART_DELAY_MS / 1000}s... ` +
        `(${consecutiveFailures}/${MAX_RESTARTS} failures)`
      );
      await new Promise((r) => setTimeout(r, RESTART_DELAY_MS));
    }
  }
  try { allowSleep(); } catch { /* ignore */ }
})().catch(err => {
  console.error('\n\u274C Fatal error in auto-restart loop:', err.message);
  console.error(err.stack);
  try { allowSleep(); } catch { /* ignore */ }
  process.exit(1);
});
