# Launch preparation — 26 October 2026

## Prepared and tested
- Twelve planned mailboxes across the six existing domains: six Alex, three Sarah, three Emma. The six old Mailpool accounts remain intact in configuration while recovery is investigated. No replacement accounts were provisioned.
- Limits: ten outbound messages per mailbox per day; 120 total. Initials, follow-ups and manual outbound through LeadGen share those limits. External warm-up is not counted or paused automatically by LeadGen.
- Three initial copy variants and four follow-ups updated with the $2,000 case-study offer and two months' maintenance. Removed the unsubstantiated $8,000 comparison, invented product compliments, conversion promises and the assumption that every AI/AR feature is included. Scope is agreed before starting.
- All nine Alex/Sarah/Emma initial variant combinations rendered successfully.
- Full regression suite: 87 passed, including 120 mocked campaign sends with correct sender identities, quotas and multipart formatting; public signed unsubscribe GET/POST and blocked admin routes.
- An isolated unsubscribe service is installed on 127.0.0.1:3001. Dashboard startup launches it alongside protection monitoring. The private dashboard remains on 127.0.0.1:3000.
- `npm run launch:check` reports real launch blockers and probes the configured public URL using a signed read-only canary. It sends no email and submits no unsubscribe.
- Further research saved for ten furniture/decor candidates. No fully qualified owner contacts emerged; no automatic approval or outreach.
- Nine original lead/contact/credential source files checked by SHA-256 and unchanged. Backups created before changing working templates/settings.

## Still needed before outreach
1. Mailpool's final recovery decision, then either accepted credentials for recovered inboxes or approved provider provisioning. Do not cancel or recreate the originals during recovery.
2. A genuine physical business mailing address. An email address does not fill this field; no address was invented.
3. Public HTTPS routing to the isolated unsubscribe service. The currently configured endpoint is unreachable. Follow D:/leadgen/PUBLIC-UNSUBSCRIBE-SETUP.md. A local tunnel requires the PC and service to stay online; always-on hosting is needed if that cannot be maintained.
4. Review current owner/contact/business-size evidence and externally verify the first pilot addresses. The application currently has zero eligible contacts; having scraped candidates is not the same as a send-ready batch.
5. With working mailboxes, inspect received-message authentication, inbox placement, replies and unsubscribe suppression using inboxes you own. Record pilot evidence per sender.
6. Configure the provider's warm-up and its total traffic budget. Confirm how it will stop when LeadGen pauses an account; there is no tested Zapwarm integration yet.
7. Only after these checks pass, enable live sending and start a small reviewed pilot. Neither the 120 daily ceiling nor warm-up guarantees account health or inbox placement.

## Targeting direction
Start with independent furniture and home-decor ecommerce businesses; watches are secondary. Existing stored leads are primarily US-oriented. Exact campaign geography is not yet selected. Prioritize stores whose products and assets suit a demonstrable 3D/AR or AI use case, without promising those capabilities before scoping the work.

## Commands
- `npm start`: local dashboard, protection monitor and isolated unsubscribe listener; does not start campaign delivery.
- `npm run launch:check`: readiness report; a nonzero exit means action is still required.
- `npm test`: isolated regression tests, no live email.
- `npm run optout`: standalone unsubscribe listener if not already started by the dashboard.

No campaigns were started, no live emails were sent, no DNS or provider subscription was changed.
