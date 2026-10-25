# Validation

Use npm test for isolated runtime regression tests. Tests never overwrite root lead lists and assert source hashes remain identical. SMTP is mocked; network and live-provider readiness are outside this suite.

Use npm run build and npm run lint for runtime syntax/selected TypeScript and lint checks. JavaScript runtime modules are not all strictly type checked. Use dashboard lint and npm run build:dashboard for frontend lint, TypeScript and production compilation.

scripts/browser-check.cjs creates a temporary fixture database and launches a local dashboard with headless Microsoft Edge. BROWSER_MODE=production uses a prior production build. Results and screenshots are written to verification. The old destructive integration suites are preserved as text under archive and are not executed; retired entry points explicitly skip or reject destructive helpers.
