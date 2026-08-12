# Improvement task notes (scraping UI + pre-send scoring + deliverability dashboard)

## Key architecture facts (verified in code)
- `db.js` exports `{ LeadsDatabase }` class — used by scraper.js and sender.js (NEW LeadsDatabase()).
  - `db.add(business)`, `db.get(business)`, `db.update(business, updates)`, `db.has(business)`, `db.size()`, `db.getAll()`, `db.save()`, `db.markQueryCompleted(q)`, `db.isQueryCompleted(q)`, `db.markRunComplete()`, `db.data.metadata` (created, lastRun, totalRuns).
  - DB path: config.js `DB_FILE` = `leads_db.json`. Shape: `{ businesses: { key: {..., addedAt, updatedAt} }, completedQueries: [], metadata }`.
- `scraper.js` exports `{ scrapeAllQueries(queries, db, onQueryComplete) }`. Takes explicit query list — can be called programmatically with custom queries.
- `config.js`: queries from `ALL_QUERIES` or `--query=` arg (SEARCH_QUERIES). `HEADLESS`, delays, etc.
- `emailFinder.js`: exports `{ findEmails, detectPlatform, ... }`. Enriches business with emails[], email, emailStatus, platform.
- `verifier.js`: exports `{ verifyEmail(email) }` → `{ valid, reason, smtpChecked }` (valid:false for role-based/disposable/no MX; no roleBased/disposable flags — infer from reason string).
- `campaignDb.js` (module.exports = instance): `getAccountStats(accountId)` → { sentToday, totalSent, bounceCount, bounceRate, replyCount, replyRate, openCount, clickCount, lastActiveAt, health:'healthy'|'paused'|'watch'|'recovering' }; has `data.accountState[aid] = { paused, recovering }`; `data.records` keyed by email with accountId/sentAt/followedUp1At/followedUp2At/repliedAt/bouncedAt/openedAt/openCount/clickedAt/clickCount/status.
- `start.js`: node-cron, hourly IMAP scan + sender; daily 9:15 followups. Scraper NOT scheduled in cron — runs as separate process.
- `sender.js` lead flow: `new LeadsDatabase()` → getAll() → filter b.emails — leads must have `emails[]`.
- Dashboard `/api/leads` GET reads `../leads_db.json` + `../campaign_db.json` and maps businesses into LeadRecord[] with qualityTier sorting supported (`qualityScore` in allowedSortFields — already there).
- Dashboard types.ts has `BusinessDbRecord` and `LeadRecord`.
- `/api/scraper/route.ts` exists (GET count + POST 409 stub).

## DONE so far
1. `leadQuality.js` created — `scoreLead(lead, {verification})` (0-100, grade A-F, tier A-D, reasons, shouldOutreach) + `verifyWithScoring(lead)` pipeline (SMTP verify via verifier.js then score; fields written to lead: qualityScore/qualityGrade/qualityTier/qualityReasons).
2. `scraper.js` wired: after findEmails for each new lead → `verifyWithScoring(loaded)` then `db.update(loaded, {qualityScore, qualityGrade, qualityTier, qualityReasons})`.

## REMAINING backend
3. `db.js`: add metadata tracking for scrape sessions (pendingScrapeCount, currentSession). Add quality distribution stats to `getStats()`.
4. `campaignDb.js`: add `getDeliverabilitySummary()` — aggregate bounce rate trend by day (from records with bouncedAt/sentAt), per-account trends → new deliverability API.
5. `/api/scraper/route.ts`: upgrade — support POST { action: 'start', queries: [...], city?, category?, limit?, runEnrichment? } launching scraper via child_process in background (process detached), GET returns running state + progress. State persisted to a small JSON file (e.g. `scrape_state.json` next to dashboard, or reuse campaign_db metadata).
6. New dashboard API `/api/deliverability/route.ts` (GET): uses campaignDb.getAccountStats for each account + daily bounce/reply/open trends + overall.

## Dashboard pages to build
7. `/leadgen` page wizard: form (queries list, optional category/city presets, max leads, run email enrichment toggle) → start scraping → live progress (poll GET /api/scraper every 5s) with progress card, last-run info, quality distribution mini-chart.
8. New `/deliverability` page: per-account health cards (health status, bounce rate gauge-ish, total sent, reply rate), 30-day bounce/reply trend line chart (recharts), bounce-rate warnings (accounts >2% watch, >4% paused), reputation tips. Add nav link in layout.tsx.
9. Leads page: sort by qualityScore (already supported?), ensure quality pill shows pre-send quality (if existing qualityTier = engagement tier, prefer pre-send `qualityGrade` when no engagement data). Dashboard types.ts may need qualityScore added to LeadRecord.

## Verification after
- npx tsc (root, with checkJs), node --check *.js, npx eslint *.js + dashboard, node e2e_tests/runner.js (96 tests), next build.
- Commit + push.

## PROGRESS UPDATE (backend DONE)
- leadQuality.js: DONE. `scoreLead()` + `verifyWithScoring()` (maps verifier reason strings to roleBased/disposable/mxValid).
- scraper.js: DONE. Wired quality gate at BOTH db.add sites (single ~line 700, finalDetails ~line 863). Added errOf + quality fields to BusinessDetails typedef. tsc clean.
- db.js: DONE. `getStats()` now returns qualityDistribution, avgQualityScore, avgRating, verifiedCount. StoredBusiness typedef extended.
- campaignDb.js: DONE. `getDeliverabilitySummary()` → { accounts: [...{id,...}], daily: 30 rows {date,sent,bounced,replied,opened,clicked}, overall }. Gets account ids from settings.json accounts[].map(a.id) (array of 6 objects with id like "1782082773692uq5t"), fallback from records.
- dashboard /api/scraper/route.ts: DONE. GET returns {running, stopRequested, startedAt, queries, lastRun, totalLeads, remoteControl} from scrape_state.json + orphan detection (process.kill(pid,0)). POST start {queries[]} spawns `node index.js --query=Q` detached; stop sends SIGINT. Single-session lock (409).
- tsc root clean, eslint 0 errors root, E2E 96/96.

## REMAINING
1. /api/deliverability/route.ts — new, calls campaignDb.getDeliverabilitySummary(). NOTE: dashboard reads campaign_db.json directly; can just reimplement simple aggregate in TS (read records) to avoid needing campaignDb.js require (root uses CJS, needs node_modules path resolution). Simplest: require(join(ROOT, 'campaignDb.js')) won't work in Next runtime (turbopack). Better: re-read campaign_db.json in route.ts and compute stats client-side (records array keyed by email, fields accountId/sentAt/followedUp1At/followedUp2At/bouncedAt/repliedAt/openedAt/openCount/clickedAt/clickCount/status; settings.json accounts[] ids).
2. Dashboard page /deliverability: nav link + page. Recharts line chart (daily sent/bounced/replied over 30d) + per-account health cards (health pill: healthy/watch/paused/recovering; bounce rate %; total sent; reply rate; watch>2% paused>4% thresholds).
3. /leadgen wizard UI: form with query list (add/remove rows), start/stop buttons (POST /api/scraper), polling every 5s, session info, last-run stats, quality distribution bar + total leads + avg score.
4. Leads page: qualityScore sort option already in allowedSortFields; consider qualityReasons tooltip on pill.
5. Dashboard types: check LeadRecord has qualityScore/qualityGrade/qualityTier fields (add if missing).
6. Verify: dashboard tsc+eslint+build, root tsc+eslint+E2E; commit+push.

## PHASE 2 PROGRESS (dashboard)
- types.ts: added qualityGrade, qualityReasons to LeadRecord + BusinessDbRecord.
- /api/deliverability/route.ts: DONE. Computes accounts[] (health: healthy|watch|recovering|paused|unknown + sentToday from dailyCounts central time), daily 30 rows, overall. Reads campaign_db.json + settings.json directly (CJS-safe).
- /leadgen/page.tsx: DONE. Full wizard: query rows add/remove, 8 quick presets, start (POST {action:'start',queries}), stop (SIGINT), live poll 5s, session card (RUNNING/STOPPING/IDLE + elapsed timer), stats cards (totalLeads, avgQualityScore from status — NOTE need to add avgQualityScore to scraper GET response), how-it-works panel, last run info, links to /leads /health.
- layout.tsx: Deliverability nav link added with ShieldCheck icon.
- /deliverability/page.tsx: DONE. Summary cards (totalSent, bounceRate, replyRate, opens, clicks, healthy accounts), advice alerts (paused>4%, watch>2%, reply<2%), per-account health cards, 30-day recharts LineChart (sent/bounced/replied/opened).
- REMAINING: (a) add avgQualityScore + lastRun update to /api/scraper GET (read leads_db stats via db.getStats — but db.js has getStats, use simple recompute in route: avg qualityScore across businesses, lastRun from DB metadata). (b) dashboard tsc+eslint+build. (c) root checks. (d) leads page quality pill tooltip w/ reasons (optional). (e) commit+push.

## CURRENT VERIFICATION STATE
- deliverability route.ts had 7 tsc errors on records typing — FIXED by adding explicit type annotations to records/accountState/dailyCounts declarations (JSDoc alone insufficient with `let x = {}`).
- deliverability page.tsx line 239: react/no-unescaped-entities — the `"Austin TX"` placeholder in leadgen page? No — 239 in deliverability/page.tsx likely: 'e.g. "marketing agency" + "Austin TX"' string with double quotes in JSX. FIX: use single quotes or &quot; in the input placeholder strings of leadgen/page.tsx OR deliverability. Check line 239 of deliverability/page.tsx.
- leadgen page: qualityDistribution bars use grades like "A"/"B"/"C"/"D"/"F" — tone mapping covers A,B(success), C(warning), rest(danger). OK.
- Leadgen quality mix card added; avgQualityScore wired from scraper GET.
- NEXT: fix deliverability page unescaped entity (line ~239), rerun tsc+eslint on dashboard (should be 0 errors), npm run build, root tsc+eslint+E2E, commit+push.
