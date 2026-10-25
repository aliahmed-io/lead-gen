# Remaining-work implementation plan

Owner: local implementation, 23 October 2026. Originals and credential/source lead files remain read only. Changes run in a repair copy, then are installed with code backups and protected-file hash checks. Campaigns remain paused; mailbox access is deferred at the owner's request.

## Implemented work (validation/install recorded below)

1. [x] Add a shared targeting policy: owner evidence tied to the exact selected email; documented independent business size of 1–250 staff; known chain/enterprise exclusion; unknown remains blocked.

2. [x] Add bounded, public-only website research. Preserve page URLs, exact snippets and candidate emails, owner names/roles and structured size facts. Never invent addresses, names, employee counts or claim scraped suggestions are verified.

3. [x] Apply exclusions before enrichment and enrollment. Gate automated sends again at reservation time. Add individual target-review and contact-selection controls, safe secondary-email selection, evidence expiry and qualification filters/export.

4. [x] Backfill targeting status in the working copy only. Preserve history and keep all unsupported contacts unapproved. Add safe batch research for existing leads and skip quarantined/generated records.

5. [x] Replace global queue sleeping with durable per-account pacing and fair selection. Keep 100/account and 600 total caps, recovery limits, business hours and suppression. Validate the six-account schedule with a simulated clock and mocked mail.

6. [x] Improve launch checks: show each missing owner-controlled requirement, account authentication/DNS status, external verification, identity/address/portfolio and real-message pilot evidence. No fabricated authentication or inbox-placement claims.

7. [x] Run regression, concurrency, targeting/extraction, simulated campaign and browser tests; build and install. Verify the running monitor and every protected source hash.

## Work that still requires the owner

Restore provider access, supply provider-issued DKIM configuration, supply real business identity/offer/portfolio, obtain external mailbox verification where necessary, inspect and approve target/source evidence, and run an operator-owned received-message pilot. No credential purchase, DNS mutation, live email or public deployment is part of this local pass.

## Acceptance

An unverified owner, unknown/out-of-range company size, known chain, generated contact, opted-out recipient or unhealthy account cannot enter automated outreach. Suggested evidence is inspectable and remains unapproved until reviewed. With six eligible mailboxes, pacing can schedule up to 100 each within the configured eight-hour window without exceeding quotas or sending a follow-up early. Real inbox placement remains an observed pilot outcome, not a software guarantee.

## Security additions discovered during implementation

Updated the vulnerable framework, mail packages, transitive dependencies and official SheetJS package. Added a checksum-verified private Node 22.23.4 runtime. Both package audits report zero known vulnerabilities after updates. Original dependencies and changed code are backed up during installation; system Node is unchanged.

Final installation, tests, audit results, public-research sample and preservation checks are recorded under verification. Owner actions are in YOUR-ATTENTION.md.

## Final verification

Installed in D:/leadgen. All 74 backend tests and 16 browser checks pass, including the 600-message simulated workday. Root and dashboard dependency audits report zero known vulnerabilities. Production build, lint, source build, backup and restore checks pass. The Windows protection task runs under the private Node 22.23.4 runtime.

The live ten-prospect research sample fetched 27 public pages across eight reachable websites; two sites were unavailable and retain retry handling. It collected five contact candidates and confirmed no owner addresses. None was approved or emailed. Existing contacts still require real owner/size evidence and external mailbox verification. Campaigns remain paused.

No original lead list or credential export was deleted or rewritten. All retained original hashes and installed source/runtime hashes were verified. YOUR-ATTENTION.md contains the remaining factual, hosting and provider actions.
