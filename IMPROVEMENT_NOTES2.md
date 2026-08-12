# Round 4 Working Notes — Enrich Emails + Bulk Actions

## Completed (not yet committed)

### Backend
- `/emailPatternEnricher.js` — NEW. Pattern probing + MX/SMTP verification for leads WITHOUT emails (different method than scraper's emailFinder.js website scrape). Exports `enrichLead(lead)`, `enrichLeads(leads, onFound)`, `buildCandidates(lead, domain)`. Result: `{found, email?, method: 'pattern_smtp'|'role_guess', smtpValid, tried}`. Added to root tsconfig include.
- Pattern priority: personal (owner, founder, ceo, hello, admin, mail, office, ...) then business-name-derived + first-name.
- MX via dns.promises.resolveMx (verifier.js does not export getMxRecords); SMTP handshake (EHLO/MAIL FROM/RCPT TO) no DATA.

### Dashboard API routes
- `dashboard/src/app/api/leads/route.ts`:
  - New exported functions `POST_ENRICH` and `POST_BULK` — **NOT ROUTED YET**: named exports don't create routes in app router! Must create `api/leads/enrich/route.ts` + `api/leads/bulk/route.ts` as separate files (move logic) OR dispatch inside single POST by shape.
  - Enrich: reads leads_db.json (cwd/..), loads emailPatternEnricher.js via createRequire(import.meta.url), rescores via leadQuality.js scoreLead, writes email/emailStatus='pattern_found' + quality fields back (atomic .tmp rename).
- `dashboard/src/app/api/inbox/route.ts` — DONE. Single exported POST dispatches: bulk payloads `{action:'mark_read'|'mark_unread'|'delete', leadEmails[]}` → handleBulk; else → handleReply. PATCH mark-read kept (atomic .tmp rename).
- `dashboard/src/app/api/accounts/route.ts` — DONE. Single exported POST dispatches: `{action:'setPauseAll', paused}` → writes pauseAll/pauseAllAt into campaign_db.json accountState; else add-account flow.

### Dashboard UI
- `dashboard/src/app/leads/page.tsx` — Enrich Emails header button (all missing) + bulk bar buttons: Enrich Selected, Reset to Pending, Unsuppress, Delete. Confirmation modal + results modal (found/probed counts, Verified/Best guess/Not found pills). Handlers: handleLeadsDbBulkAction, runEnrichment.
- `dashboard/src/app/inbox/page.tsx` — per-thread checkbox + bulk toolbar (Mark All Read, Delete, Cancel). Single-thread archive button. Fixed double-`</div>` bug.
- `dashboard/src/app/accounts/page.tsx` — Pause All / Resume All ghost buttons in PageHeader children, bulkTogglePause calls POST /api/accounts with setPauseAll. pausingAll wired as disabled.

## Remaining TODO
1. **Fix /api/leads routing**: create `dashboard/src/app/api/leads/enrich/route.ts` and `dashboard/src/app/api/leads/bulk/route.ts` (extract POST_ENRICH/POST_BULK from leads/route.ts into them). Same shape dispatch as inbox route.
2. Root tests: `node e2e_tests/runner.js` (96 tests), root eslint `npx eslint *.js`, root tsc.
3. Dashboard: `npx eslint src/`, `npm run build`.
4. Commit + push.
5. Functional smoke test of enrichment against local db (optional).

## Key paths
- Root: /home/ubuntu/lead-gen (emailPatternEnricher.js, leadQuality.js, verifier.js, db.js, campaignDb.js, e2e_tests/runner.js)
- Dashboard: /home/ubuntu/lead-gen/dashboard (dev: pnpm dev)
- DBs (cwd/.. of dashboard): leads_db.json, campaign_db.json, inbox_db.json, settings.json

## STATUS UPDATE (latest)
- Dashboard routes done: `api/leads/enrich/route.ts` (execFile → scripts/enrich_emails_cli.js, ROOT = cwd/..), `api/leads/bulk/route.ts` (delete/reset_to_pending/unsuppress, keys-based, atomic .tmp rename). Leads GET now maps Object.entries → returns `key` field. types.ts LeadRecord.key added.
- leads page: selection now keyed by `lead.key` (works for no-email leads). handleBulkAction resolves keys→emails (shows toast if none have emails). All row/checkbox/select-all/export updated. Header "Enrich Emails" + bulk bar Enrich Selected/Reset/Unsuppress/Delete buttons present.
- Inbox: page + route done (single POST dispatch bulk|reply). Accounts: Pause All/Resume All in header, POST dispatch setPauseAll → campaign_db accountState.pauseAll.
- REMAINING: run dashboard tsc/eslint/build; root tsc + eslint + node e2e_tests/runner.js; functional smoke test of enrich CLI (`node scripts/enrich_emails_cli.js all`); then git add -A commit push.

## STATUS (post-dashboard fixes)
Dashboard tsc+eslint clean. Builds pass but Turbopack intermittently fails with `Module not found: Can't resolve '@vercel/turbopack-next/internal/font/google/font'` (flaky Google font fetch at build time — this is the pre-existing env issue, build succeeded 2 of 5 runs).

FIX IN PROGRESS: self-host fonts to make builds deterministic.
- Files downloaded to `/home/ubuntu/lead-gen/dashboard/public/fonts/`:
  - inter-latin.woff2 (OK, 23KB woff2)
  - playfair-regular.ttf, playfair-bold.ttf (24KB subset TTFs, different md5 — real subsets)
  - JetBrains Mono still MISSING — need to download: `https://fonts.gstatic.com/l/font?kit=tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKxjPUGuiZaptT_0V2m2Fla-hGdg3anXXoPvISiRDEpvrN30GV1JYK7Lc4dBLb2z0orf7c5WY5kEuzZijNUZnJTn3No&skey=48ad01c60053c2ae&v=v24` (regular) and same URL with `...RD8L6tj...` (bold). curl -o gives TrueType data (~24KB).
- Next step: edit dashboard/src/app/layout.tsx to use `next/font/local` for all three fonts (preload:false, variable names --font-inter/--font-mono/--font-serif, display:swap).
- Then: `cd dashboard && rm -rf .next && npm run build` (should always pass now).
- Then root checks: `cd /home/ubuntu/lead-gen && npx tsc --noEmit` (expect 0), `npx eslint *.js`, `node e2e_tests/runner.js` (96/96).
- NOTE: root DB file is leads_db.json (was absent; smoke test created one with testcafe.example.com — DELETE it before commit? e2e tests EXPECT leads_db.json to exist? tier1 tests check missing-file handling; a leftover temp DB may break tests — remove leads_db.json + campaign_db.json edits before tests, or run e2e first to check).
- Also added public/fonts to repo (fine).
- git commit after all pass: `git add -A && git commit -m "Add Enrich Emails (pattern probing + MX/SMTP verification) and bulk actions (leads/inbox/accounts)" && git push`
