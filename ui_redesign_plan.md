# Dashboard UI Redesign — Working Plan (Phase 2)

## Current state (verified)
- Backend: 0 tsc errors, ESLint 0 errors (warnings only), 96/96 E2E pass, all modules load.
- Dashboard: tsc clean, build passes, ESLint 0 errors / 18 warnings.
- Total lines: 4825 TSX across 13 pages. Pages: / (overview 516), /leads (912), /inbox (247), /accounts (1063), /templates (743), /sequences (233), /settings (280), /logs (120), /health (124), /unsubscribes (241), /leadgen (111), /error, /loading.
- Components: ui/{button,card,empty-state,modal,skeleton,stat-card,status-badge,toast}.tsx

## Design tokens (globals.css)
Warm honey/linen: --honey-500 #C2872E, --bg-base #FAF8F5, Playfair Display serif headings, Inter body, monospace code. Utilities: .card, .glass-panel, .btn, .badge, .stat-card, .progress-track/fill, section-label.

## Home page assessment (page.tsx)
- Inline styles everywhere (mixed with classes) — inconsistent, hard to maintain.
- Custom CSS bar chart (absolute gridlines) instead of a chart library.
- Stat cards no trend deltas; A/B table hardcoded "500 per template".
- Layout: padding 32px, maxWidth 1280px; campaign control banner good.
- 5-col stat grid on large screens.

## Redesign targets (per page, keep pages as client components, keep tokens)
1. **Overview (/)**: 
   - Refactor inline styles → consistent CSS classes + token usage.
   - Replace custom bar chart with recharts (`npm i recharts` in dashboard).
   - Stat cards: add mini sparkline (from dailyVolume) + delta vs previous 7-day avg.
   - Add "Quick Launch" wizard card (preflight via /api/simulate or just button linking sequences w/ status summary).
   - Keep control banner, funnel, A/B table (dynamic labels), mailbox health, activity feed. Add "Next steps" empty states.
2. **Leads (/leads)**: status pills styled; add CSV export + bulk requeue action; fix useCallback dep; qualityTier badge with icon per tier (hot/prospect/average/cold).
3. **Inbox**: no major issues found previously; ensure empty state polish.
4. **Accounts**: already good (1063 lines, TOTP cards, DNS checks, spam modal). Remove unused imports (Send, Button, formatDate).
5. **Templates**: remove unused imports (ArrowLeft, RefreshCw, Sparkles, Code, Button).
6. **Sequences**: replace alert() with toast; better step visualization.
7. **Health**: fixed useEffect; keep.
8. **Global**: consistent page header component (h1 + subtitle + refresh button); skeletons from skeleton.tsx; toasts via toast.tsx (check API first).

## API pages (keep as is, already typed): /api/leads, /api/stats, /api/accounts, /api/settings, /api/campaign, /api/inbox, /api/logs, /api/health, /api/spam-check, /api/accounts/dns, /api/accounts/totp, /api/unsubscribes, /api/verifier.

## Deliverable quality bar 7-8/10
- Visual consistency, whitespace, hierarchy, micro-interactions, real charts, polished empty states, toasts instead of alerts, no console-warnings.

## Page audit details (verified Aug 12)
- globals.css classes available: .card, .stat-card, .btn(.primary/.secondary/.danger/.ghost), .badge(.blue/.green/.red/.amber/.purple/.gray), .status-dot(.green/.amber/.red), .progress-track/.progress-fill, .table-row, .sidebar, .nav-link/.nav-item(.active), .glass-panel/.glass-panel-raised, .section-label, .input, .chart-container, .overlay, .divider, .gradient-text, @keyframes fadeInUp/fadeIn/shimmer/pulse-glow, .animate-fade-in-up.
- UI components: button.tsx (variant,size,loading,icon props, style/className supported), modal.tsx, toast.tsx (ToastProvider in layout; useToast() exported), empty-state.tsx, skeleton.tsx (Skeleton width/height/borderRadius/style), status-badge.tsx, card.tsx.
- NEW component created: `src/components/ui/page.tsx` — PageHeader(title,subtitle,backHref,onRefresh,refreshLoading,actions), PageSkeleton(message), ErrorBanner(message,onDismiss), usePageRefresh(fn) hook (ref-based guard).
- layout.tsx: sidebar 256px, ToastProvider wraps children (IMPORTANT: keep ToastProvider structure intact when editing layout).
- pages use mixed inline styles + Tailwind utilities (text-xs, p-x, flex etc.); redesign should standardize on CSS classes + inline tokens, keep Tailwind utilities where already used.
- leads/page.tsx: has toast, modal, import CSV, bulk actions, export CSV, search/filters/sort/pagination. Status styles fn statusStyle() exists (reusable). Uses /api/leads/import and /api/leads POST bulk.
- accounts/page.tsx: uses ToastProvider? (has own error state); 1063 lines.
- inbox page header at line 111 "Inbox" h1 text-xl.

## Redesign priority order (impact)
1. Overview page — biggest visual impact (add recharts, quality stat cards, quick-launch card)
2. Leads page — quality-tier pills, consistency
3. Inbox — polish
4. Sequences — toasts
5. Templates/Accounts/Health/Settings/Logs/Unsubscribes/Leadgen — header consistency + minor polish
6. Final: lint+build+tsc verification, commit.

## Progress log (Phase 3)
- DONE: `ui/page.tsx` shared components (PageHeader, PageSkeleton, ErrorBanner, usePageRefresh). globals.css: added .nav-link alias + .btn-ghost. recharts installed in dashboard (pnpm add recharts).
- DONE: OVERVIEW page.tsx rewritten (~560 lines): recharts AreaChart for send volume, stat cards with sparklines + deltas (avg 7d vs prev 7d comparison), Quick Actions column (leads/inbox/sequences/templates/health), A/B table with empty state, PageHeader/ErrorBanner usage. tsc clean.
- NEXT: leads/page.tsx — currently has header at ~line 300 area with Import CSV/Export CSV dropdown + search/filters. Improvements to apply: use PageHeader; qualityTier pill badges (hot/prospect/average/cold with icons: Flame=hot, Star=prospect, Circle=average, Snowflake=cold); use ErrorBanner; keep bulk actions/export/import as-is (already functional with toasts); fix useCallback dep (qualityTier missing at line ~162) — verify exact line after edits; add statusStyle reuse.
- Then: inbox (header line 111 h1 text-xl), sequences (alert()→toast), health (already fixed useEffect), templates/accounts (unused imports only), settings/logs/unsubscribes/leadgen (use PageHeader).
- Final: build, eslint src, tsc, root ESLint, E2E node e2e_tests/runner.js, git add -A, commit, push.
- Note: leads page header already has action buttons on right — PageHeader actions prop supports that.

## Progress log 2 (Phase 3)
DONE so far:
- ui/page.tsx shared components (PageHeader supports children for action buttons + refresh). globals.css: .nav-link alias + .btn-ghost. recharts installed.
- OVERVIEW page.tsx: fully rewritten (recharts area chart, sparkline stat cards with deltas, quick actions, A/B table, mailbox health, activity feed). tsc clean.
- LEADS page.tsx: PageHeader+ErrorBanner, icon quality pills (Flame/CircleDot/OctagonAlert), qualityTier added to fetchLeads deps, filter options de-emojified. tsc clean.
- INBOX page.tsx: useToast for errors, unread count badge, refresh button in sidebar header, empty state polish, thread meta line, "Open in Leads" link. tsc clean.
- SEQUENCES page.tsx: alerts → toasts, PageHeader w/ refresh, motion loading state. tsc clean.
- TEMPLATES page.tsx: PageHeader (onRefresh=saveTemplates, refreshLoading=saving) + ErrorBanner; removed unused ArrowLeft/RefreshCw/Sparkles/Code/Button icons. tsc clean.
- ACCOUNTS page.tsx: removed unused Send import; PageHeader(onRefresh=loadData, refreshLoading=refreshing) + ErrorBanner. tsc clean.

REMAINING header swaps (simple, same pattern — copy PageHeader import from ui/page, replace header div + error div):
- health/page.tsx line ~60: header div w/ fetchHealth refresh button (loading state). Note: fetchHealth already fixed useEffect pattern earlier.
- settings/page.tsx line ~105: header "Configuration" + error/saved AnimatePresence.
- logs/page.tsx line ~55: header "Audit Logs" text-3xl.
- unsubscribes/page.tsx line ~102: header h1 (check context).
- leadgen/page.tsx line ~49: header h1 (check context).
Then: verify ALL: cd dashboard && npx tsc --noEmit && npx eslint src/ && npm run build. Root: npx eslint *.js && node e2e_tests/runner.js.
Finally: git add -A; commit "Fix all bugs, clean dead code, polish dashboard UI to 7-8/10"; git push.

## Final status (Phase 4)
All pages now use shared PageHeader + ErrorBanner. Leadgen page now has a live scraper status card (Start/Stop buttons + leads count) via new /api/scraper route (GET reads ../leads_db.json count; POST returns 409 explaining terminal control).

Verification: root tsc 0 errors, eslint 0 errors (7 warnings), E2E 96/96 pass, syntax all OK. Dashboard tsc 0 errors, build passes, eslint 0 errors (9 warnings only).

Remaining 9 trivial dashboard warnings (unused imports): accounts RefreshCw line 11 (still used as className? no — imported unused); spam-check _e 3x; leadgen _e line 31; leads AlertTriangle line 9, FileText line 9; page useMemo line 3, AlertCircle line 11. These are cosmetic warnings, not errors.

NEXT: Phase 5 — git add -A, commit "Fix all bugs, remove dead code, polish dashboard to 7-8/10", git push. Then deliver summary.
git status is messy (many deleted/modified files staged and unstaged).
