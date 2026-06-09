# Original User Request

## 2026-06-09T08:01:10Z

Thoroughly audit, debug, and fix all bugs, logic issues, error validation gaps, and UI issues across the entire LeadGen codebase (Node.js backend scripts and Next.js frontend dashboard) until it is 100% stable and production-ready.

Working directory: D:\leadgen

## Requirements

### R1. Comprehensive Code Audit & Fixes
The team must inspect every file in the project. You must fix any unhandled promises, add robust error validation for all inputs (CLI and API), resolve any type or linting errors, and ensure the logic exactly matches the intended outreach workflow.

### R2. Dashboard UI/UX Polish
Ensure the Next.js dashboard has flawless error boundaries, loading states, and robust input validation. It must perfectly handle edge cases like missing files, malformed JSON, or failed API requests.

### R3. Safe Execution (No Live Emails)
When testing the email sender or followup scripts, the team must strictly use `--dry-run` or mock the SMTP responses to prevent accidentally blasting emails to real leads during the testing phase.

## Acceptance Criteria

### Verification & Stability
- [ ] Running `npm run build` in the dashboard directory yields zero warnings and zero errors.
- [ ] Running a full linting sweep across the project yields zero warnings.
- [ ] The team provides a final report detailing all edge cases tested (e.g., corrupted JSON databases, missing `.env` files, network timeouts) and proves they are gracefully handled without crashing the Node process.
