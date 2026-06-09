# Project: LeadGen

## Architecture
- **Backend**: Node.js scripts for scraping Google Maps, finding emails, and sending emails/followups (`scraper.js`, `emailFinder.js`, `sender.js`, `followup.js`). Uses persistent JSON database (`leads_db.json`) and Excel exporter.
- **Frontend**: Next.js dashboard (`dashboard/`) providing a UI for the LeadGen tool.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Backend Audit & Fixes | Audit and debug Node.js scripts. Fix unhandled promises, add robust error validation for CLI/API inputs, resolve type/linting errors. Implement `--dry-run`/mocking for `sender.js`/`followup.js`. | none | IN_PROGRESS |
| 2 | Dashboard UI/UX Polish | Inspect Next.js frontend. Ensure flawless error boundaries, loading states, robust input validation, and handle edge cases (missing files, malformed JSON, etc.). Fix build and linting errors. | none | IN_PROGRESS |
| 3 | Final E2E Verification | Generate comprehensive edge-case tests, run E2E, compile the final report. | M1, M2 | PLANNED |

## Interface Contracts
### Backend ↔ Frontend
- Backend operates via Node CLI and files.
- Frontend reads/writes to `leads_db.json` and possibly interacts with scripts or APIs (TBD based on Next.js setup).

## Code Layout
- `index.js`, `scraper.js`, `emailFinder.js`, `sender.js`, `followup.js`: Node.js Backend Scripts.
- `dashboard/`: Next.js frontend app.
