# Current follow-up task: condense accounts page card UI

## User request
"outreach mailbox page looks ugly, try to use a more condensed card ui instead that is still beautiful but doesnt have this white spce or weird mobile format"

## Completed edits on /home/ubuntu/lead-gen/dashboard/src/app/accounts/page.tsx
- Outer wrapper: `p-8 max-w-7xl space-y-8` -> `p-4 md:p-6 max-w-[1400px] space-y-4 md:space-y-5`
- Grid: `md:grid-cols-2 lg:grid-cols-3 gap-6` -> `sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4`
- Cards: `rounded-2xl p-6 min-h-[290px]` -> `rounded-xl p-4` (no min-height)
- Header row: icon badge smaller (p-1.5, Mail size 14), email 13px inline with icon, health badge aligned right
- App password & 2FA boxes: `p-2 rounded-xl` -> `p-1.5 rounded-lg`
- Delete button: `top-4 right-4 p-1.5` -> `top-2 right-2 p-1 size 12`
- DNS panel: `p-3 rounded-xl` -> `p-2 rounded-lg`
- Removed separate 4-col metrics grid; replaced with inline metrics row (Opens/Clicks/Replies/Bounce 10px, in one line)
- Progress: label "Daily Limits Progress" -> "Daily Progress", track height 5px, smaller label
- Add-card tile: smaller circle (w-9 h-9), smaller text
- Banners: `p-5 rounded-2xl gap-4` -> `p-3.5 md:p-4 rounded-xl gap-3`
- Pause/Resume All buttons: padding 6px 10px, font 12px

## Still to do
1. Verify TS/ESLint/build
2. Screenshot accounts page at 390 and 1440 (dev server on :3999, restart after build; audit script: dashboard/scripts/audit_mobile.sh)
3. Root: npm test must pass (96 tests)
4. git add -A, commit, push
5. Report to user

## Notes
- Server log: /tmp/next3999.log; kill port with `fuser -k 3999/tcp` before restart
- Design tokens: --honey-500 #C2872E, bg-base #FAF8F5, honey/linen theme; keep preserved
- Mobile topbar 56px (layout.tsx). Breakpoint 1024px.
- Dev server restart cmd: cd dashboard && nohup npx next start -p 3999 > /tmp/next3999.log 2>&1 &
- Last commit: 04562c3 (mobile round). Repo: /home/ubuntu/lead-gen, push to origin/main.

## Observation after first condensed iteration (accounts_390)
Mobile list view is much denser (one card per row, no wasted space) — good. Issue: metrics row wraps to 2 lines on 390px ("Daily Progress" label + values crowding); progress row + footer rows make card ~110px tall which is fine. The "Details & Credentials" button was REMOVED during rewrite — must add back (edit modal link)! Check card for openEditModal button presence. Also delete button hover invisible on touch (opacity-0 group-hover) — keep as-is (desktop only affordance) but ensure desktop screenshot still has it.
TODO: verify button exists; check desktop 1440/1920 screenshot; add "Details & Credentials" button back if missing.

## Second iteration review (accounts_390)
Cards are tighter now (email row + chevron works). Problem: metrics grid-cols-2 stacks to 4 rows of "Opens 0%" etc. on mobile -> card tall and repetitive. Better: single-row flex wrap with compact chips: "Opens 0% · Clicks 0% · Replies 0.0% · Bounce 0.0%" one line. Also footer rows ("Daily Progress" line, progress bar, "Resets at Midnight CT | Check DNS | Run Spam Check") — keep but compress. On 390px: card ~7 lines which is acceptable, but the metrics 2-col grid doubles height; convert metrics to one flex row with wrapping chips.

## Third iteration review (accounts_390)
Metrics flex-wrap row: gap-x-3 not applying (labels/values render run-together "Opens 0%Clicks 0%Replies 0.0%Bounce 0.0%" all jammed), plus progress footer missing the progress bar in screenshot ("Daily Progress ... 0/80" then Resets row). Actually progress track may be height 5px thin line hard to see; main issue: chip row text jammed -> gap not rendered because spans contain <span> inner... no — problem is the inner spans use whitespace. Fix: use explicit margin-right on each metric chip instead of gap, and slightly larger text (11px) for legibility. Also check footer: progress track renders but thin; acceptable. Consider "Daily Progress" row and footer OK.
Chosen fix: metrics as small pill chips with background bg-[var(--bg-elevated)] rounded-md px-1.5 py-0.5 each, margin 3px, so they never run together.

## Fourth iteration review (accounts_390)
Chips render as "OPENS0% CLICKS0% REPLIES0.0% BOUNCE0.0%" — all jammed inside ONE chip? No, they're separate spans but the label text got uppercase+tracking squeezed with no space between label and value: "OPENS0%" shows label/value fused. The pill bg likely didn't render distinct per item (all run together as one row, no gaps visible). Root cause: the `mx-1` margins may be collapsed... Actually screenshot shows the 4 chips touching with fused "OPENS0%CLICKS0%..." — the mx-1 margin exists but chips render background-less and jammed. Simpler reliable fix: drop chip styling, use a clean single flex row with `gap-2` using real Tailwind v4 (gap works in v4!). Earlier gap failed because gap-x-3 inside flex text... Actually gap should work. Retry with explicit style={{display:'flex', gap:'8px', flexWrap:'wrap'}} inline style + normal font sizes 11px, no uppercase, no chips: "Opens 0% · Clicks 0% · Replies 0.0% · Bounce 0.0%" with · separator.
Also note the progress bar line between "Daily Progress" and "Resets" rows is very thin but present — fine.

## Fifth iteration review
Metrics row now perfect ("Opens 0%  Clicks 0%  Replies 0.0%  Bounce 0.0%" clean, legible). Card density great.
BUT cards render full-width stacked on BOTH 390 and 1440 — the grid shows ONE column! The wrapper grid `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4` should give 4 columns at 1440. But screenshot shows cards full width. Wait — looking at 1440 screenshot: cards ARE full width (each row spans page). Something broke the grid: maybe the wrapper div is nested wrong, or the accounts map no longer inside the grid? Check current file lines 400-425. Also the "Add New Mailbox" tile renders full width — consistent with grid being 1 column.

## Root cause of single-column layout (discovered)
The built Tailwind v4 CSS only emits `grid-cols-1` and `grid-cols-2` utilities and limited responsive variants (md:grid-cols-2 exists; lg: and xl: variants were NOT detected/emitted for these classes). Rather than fight Tailwind, use inline style with CSS grid template using a media-query-free approach... Actually inline style cannot do media queries. Alternative: add a small CSS class in globals.css `.accounts-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:12px; }` — auto-fit handles all widths natively. Add to globals.css and use className on the wrapper.

## Sixth iteration review (accounts_1440)
Grid now 4 columns on desktop — good density, no wasted space. Issues to polish:
1. Header row: icon + email + badge + chevron squeezed; "Run Spam Check" text wraps to 2 lines on cards ("Run Spam / Check"). Footer row should be nowrap or shrink label.
2. Cards look nice overall; metrics row fine.
Fixes: (a) footer action buttons: use icon-only or text with whitespace-nowrap + smaller; (b) footer text row font 10px; (c) keep chevron small.
Also the desktop screenshot shows top of page cut (screenshot starts at y=0 but header slightly clipped at top-left; fine — due to window scroll).

## State after 7th iteration edits (12:08)
Applied: footer whitespace-nowrap buttons ("Spam Check" shorter label), reset text shorter on mobile, Daily Progress row nowrap. Accounts grid now inline-style auto-fill minmax(280px,1fr) — renders 4-col desktop, 1-col mobile correctly.
Next steps: build + restart + screenshot 390/1440, visually confirm polish OK, then run root `npm test` (96 tests), then commit+push. Commit message suggestion: "Condense Outreach Mailboxes into a compact card UI: tighter paddings, single metrics row, auto-fill responsive grid, no wasted whitespace".
Server: kill 3999 with `fuser -k 3999/tcp`, then `cd /home/ubuntu/lead-gen/dashboard && nohup npx next start -p 3999 > /tmp/next3999.log 2>&1 &`, screenshot with chromium --headless --no-sandbox --hide-scrollbars --window-size=W,900 --virtual-time-budget=8000 --screenshot=/tmp/mobile_audit/accounts_W.png http://localhost:3999/accounts (use 15000 budget if page renders blank).
Root dir checks before commit: npx tsc --noEmit (root), npm test (root, expect 96 pass).

## 8th iteration review (accounts_390 + accounts_1440)
Desktop (1440): clean 4-col compact cards, header row (icon + email + GOOD HEALTH + chevron) fits one line, metrics one line, Daily Progress + thin bar, footer "Daily reset: 00:00 CT | Check DNS | Spam Check" one line. No wasted whitespace. Add New Mailbox tile aligned.
Mobile (390): 1-col compact list, everything single-line, no overflow or jamming. Design preserved (honey/linen).
VERDICT: DONE. Remaining: root tsc + npm test + eslint, commit & push.
