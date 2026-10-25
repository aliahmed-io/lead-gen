# LeadGen freelance workspace

This dashboard manages researched prospects, outreach drafts, mailboxes, campaigns and replies. The repaired application uses a transactional working database. Original lead lists are never the application's write target.

## First start

Use the included verified Node 22.23.4 runtime for this project. On a fresh Windows checkout, run scripts/setup-node.ps1 first; it downloads the official archive and verifies its SHA-256 checksum. The npm scripts select that private runtime without changing system Node. The scripts enable Node's experimental SQLite support; Node 22 may print an experimental-feature warning.

1. Run `npm run setup` from this folder. This copies source data into `data-working/leadgen.sqlite`, saves source snapshots and creates local administrator access.

2. Local use does not require signing up or signing in. The launch scripts enable device-only access and bind the server to `127.0.0.1`. Saved administrator credentials are retained privately for the optional authenticated mode; they are not required to open the local dashboard.

3. Run `npm run dev` and visit http://localhost:3000. Starting the dashboard also starts account protection monitoring; it does not start a sender.

4. For a production build on this device, run `npm run build:dashboard`, then `npm start`. The local dashboard opens directly without a login screen. Local-only mode rejects external hosts, forwarded public traffic and cross-site browser requests. It must not be exposed through a public tunnel or proxy. A public deployment requires `LEADGEN_LOCAL_ONLY=0`, administrator sign-in and HTTPS; recipient unsubscribe hosting remains a separate launch requirement.

5. Run `npm run worker` in a separate supervised process only when background sending/sync work is intended. For monitoring alone use `npm run monitor`. Windows sign-in monitoring can be installed with `scripts/install-monitor-task.ps1`; the task runs hidden and never sends mail. The computer must be awake and the user signed in. Live email additionally requires ENABLE_LIVE_EMAIL=1 and passing recipient/account checks.

Dependencies are installed independently in the root and dashboard folders (`npm ci` in each). The lockfiles are included. Keep secrets, data-working and exports out of public hosting/source control. This is a single-operator application, not a multi-tenant service.

## Data and lead review

Original JSON, CSV, XLSX and contact-list files remain in place. First migration creates separate snapshots and a hash manifest. No original queue recipient is automatically approved. Generated contacts and contacts without sufficient provenance are quarantined. A previously generated address remains blocked on re-import.

Review each prospect's source and suitability in Leads, record current mailbox-verification evidence, then enroll reviewed contacts. DNS/MX alone returns unknown, not verified. The optional verifier contract is HTTPS POST `{email}` with a Bearer key and response `{status: "valid"|"invalid"|"catch-all"|"unknown", reason?: string}`. A provider adapter may be needed. Review actual business details yourself; software cannot establish the accuracy or permission status of every scraped address.

Settings, templates, campaigns and account edits are written to SQLite, not the original JSON files. Existing enrollments retain their template/sequence snapshot. To apply a new sequence, explicitly review and enroll a new run. The queue starts paused. Outbound mail requires a real sender identity, postal address, public HTTPS unsubscribe URL, recent account diagnostics, source review and verification. Manual replies share quotas, suppression and mailbox protection; they do not require automated-campaign verification or business hours.

## Before a live pilot

- Revoke the obsolete mailbox credential embedded in three preserved legacy helpers: run_fetch_leads.js, run_get_lead_details.js and run_fast_file_log.js. They contain contact lists, so they were preserved unchanged and are not called by the application. Use scripts/inspect-inbox.cjs for the replacement inspection workflow. Remove exposed credentials from remote repository history through your normal repository process after rotation.

- Enter your real sender name, postal address, offer and portfolio. Add fresh mailbox app credentials in Accounts. Confirm SPF, DMARC and your actual DKIM selector with the provider; the application reports DNS presence, not guaranteed authentication or inbox placement.

- Set DASHBOARD_URL to the deployed HTTPS origin and test opt-out there. Keep tracking disabled unless you intend to use it; tracking events are unfiltered observations, not reliable human engagement counts.

- Verify a small, researched segment using an appropriate external verification source. Test received messages with operator-owned recipients, inspect authentication, threading and opt-out, then start a small reviewed pilot. This repair did not send any email or change provider DNS.

## Operations and recovery

`npm run backup` creates a consistent SQLite backup under data-working/backups. Keep the original ENCRYPTION_KEY (or generated data-working/encryption.key) separately and securely; backups without it cannot decrypt mailbox credentials. Backups include personal data and authentication state. Protect access with filesystem permissions and encrypted storage.

Restore into a NEW directory using `node --experimental-sqlite scripts/restore-copy.cjs BACKUP_FILE NEW_DIRECTORY`, then set LEADGEN_DATA_DIR to that directory before starting. Preserve the matching encryption key and inspect the restored copy before enabling work. No restore overwrites an existing directory. Do not copy only a live SQLite file while WAL writes are active; use the backup command.

Health shows the independent protection-monitor heartbeat, worker heartbeat, effective account caps and actual diagnostic timestamps. A stopped or stale monitor blocks live dispatch. Full diagnostics run every 15 minutes and expire after 30 minutes. Rejected credentials back off exponentially from 1 hour to 24 hours; editing a credential invalidates old diagnostics and schedules a new check. An offline worker is not healthy. Review uncertain deliveries in Delivery review against the provider's Sent folder before permitting a retry; an SMTP acknowledgement cannot be made atomic with a local database commit. A stale in-progress attempt becomes ambiguous for review, never automatically resendable. Worker leases and durable attempt IDs protect concurrent execution. Shut down workers gracefully and supervise them for restarts.

## Checks

`npm test` runs isolated fixture tests with mock SMTP and verifies protected source hashes. `npm run lint`, `npm run build`, dashboard `npm run lint` and `npm run build:dashboard` validate source and production compilation. `npm run test:browser` uses isolated fake contacts and a locally installed Edge browser; BROWSER_MODE=production checks an existing production build. It never uses real SMTP. See REPAIR-STATUS.md for the scope and remaining launch checks.

## Personal sending policy and automatic account protection

Hard ceilings are 100 outbound messages per mailbox and 600 overall per Central Time day. These include automated first messages, follow-ups and manual replies. Smaller configured limits, warmup/recovery caps, scheduling and pacing still apply; the ceiling is not a promise of volume or safety. Current settings are set to those ceilings during installation without enabling sending. Pacing is now independent per mailbox. The installed default range is 4–5 minutes per mailbox, also shared with manual replies; the queue no longer sleeps globally after each message. Real throughput still depends on account readiness, scheduler timing, replies, follow-up delays and network overhead.

Authentication rejection, provider throttling, missing connection/DNS checks and repeated temporary failures pause the affected account. Rolling 24-hour hard-bounce signals use an early warning threshold (2 distinct hard-bounced recipients, or a rate at/above the lower of your configured threshold and 2% after 10 observed sends). Repeated temporary errors use a one-hour window. Received abuse-feedback reports are deduplicated, suppress the correlated recipient and require review. Providers do not necessarily send all complaints to the inbox: this does not measure unseen spam-folder placement, every complaint or domain reputation.

Temporary recovery requires a completed cooldown and two successful SMTP, IMAP and required DNS diagnostics at least 15 minutes apart. A new failure resets recovery. A recovered account starts at up to 10 messages/day, then 20, 40, 80, and at most 100 after clean elapsed days; additional failures pause it again. Complaint, policy and hard-bounce warnings require operator review after current warning windows/cooldown clear; an operator pause never resumes automatically. No timer alone proves reputation recovery.

The six supplied app passwords were compared privately against accounts/mailboxes (1).csv and exactly match the working settings. Existing provider hosts are consistent with Google Workspace. Provider authentication was nevertheless rejected (535); do not substitute the ordinary login/admin password or expose TOTP secrets. Confirm the mail service is active and obtain working app credentials in the provider before sending. The source CSV and original settings remain untouched.

## Owner-first qualification and launch checks

Use Leads → Review owner (or Owner review in navigation). Research gathers public email/name/role snippets and structured team-size facts from up to six public pages. Scraper enrichment can also inspect up to three rendered pages when static evidence is insufficient; it uses an installed supported browser and retains sandboxing. Shared departmental addresses remain in the research evidence but cannot qualify as direct owner contacts. Names and addresses are never guessed from a pattern. A nearby founder mention is a candidate, not proof of current ownership.

Confirm the exact direct email and current owner, then document independent ownership and a 1–250-person count or a published size-range upper bound. This is your personal targeting rule, not a legal definition of SME. Known chain domains and published sizes above the ceiling remain excluded. Unknown facts stay blocked. Evidence expires after 90 days. Changing an uncontacted primary email resets verification; a contacted address keeps its conversation history. Archive duplicate working rows individually before resolving a shared contact. Original sources are preserved.

Mailbox verification is a separate check from ownership. Record an external verification result for that exact selected email before enrollment. Both enrollment and automatic send reservation enforce targeting, suppression, verification, account health, pilot evidence and capacity. CSV import cannot grant approval or inject verified owner status.

Launch checks shows identity/address configuration, public HTTPS origin, monitor state and per-mailbox received-message pilot evidence. Paste recipient-side raw headers only after testing with mailboxes you own. The parser checks SPF/DKIM/DMARC results and sender alignment, while you attest to inbox observation, threading and opt-out behavior. It is not an independent inbox-placement certification. Pilot evidence expires after 30 days or changes to the relevant mailbox connection settings. Do not enable campaigns before completing these checks.

For a bounded batch of existing prospects, run `npm run research:owners -- --limit=10`. It researches active, non-quarantined candidates without emailing or approving anyone. If Google Maps presents a verification challenge, the scraper stops, records a blocked reason and retains pending queries instead of repeatedly restarting or marking a failed query completed.

## Dependency maintenance

This repair updates Next.js, mail handling and transitive dependencies, and installs the official supported SheetJS tarball rather than the old npm-registry release. See [SheetJS installation](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/) and [official Node releases](https://nodejs.org/dist/). Both root and dashboard lockfiles are retained. Keep the private runtime and packages patched over time; an audit result is a point-in-time check, not a security guarantee.

