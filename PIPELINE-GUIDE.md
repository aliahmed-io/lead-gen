# Store and owner research pipeline, version 3

The pipeline collects evidence and prepares files for your verification provider. It never approves recipients, changes campaigns, sends outreach, or pays an API. SMTP probing is **off by default**. Original lead files, earlier exports and old working databases stay intact.

## Normal run and resume

```powershell
npm run qualify -- run --input=D:/leadgen/MASTER_LEADS_2026-10-26.json --workdir=D:/leadgen/research-working/qualify-v3 --concurrency=12 --no-smtp
```

Repeat the command to resume from its checkpoint. Completed evidence is reused. Source hashes must match, and a read-only source snapshot is kept. Each export uses a fresh directory. A completed pass can still contain unresolved businesses; that means evidence is missing, not that the business is fake.

To copy an older checkpoint into a **new** working directory:

```powershell
npm run qualify -- run --upgrade-from=D:/leadgen/research-working/qualify-full-v2 --workdir=D:/leadgen/research-working/qualify-full-v3 --no-smtp
```

This backs up the old SQLite database using SQLite's backup API, then updates only the copy. Catalogue evidence is refreshed under the corrected rules. `--seed-research=PATH` can also reuse completed public research with the same source hash. The earlier research job folder is `D:/Users/aliha/.cursor/projects/d-leadgen/research-working/furniture-full-2026-10-28`.

## Read the results

- **01-published-owner-contacts-NEED-VERIFICATION.csv:** exact person/email associations observed in public source material. Paid verification and owner/business review are still required.
- **02-inferred-addresses-REVIEW-FIRST.csv:** addresses matched to names, including stored-only contacts. These are not evidence that the person owns that mailbox.
- **03-owner-found-need-finder.csv:** published owner names and domains where more email finding is needed.
- **04-qualified-no-owner.csv:** candidate stores without a published owner name.
- **05-excluded.csv:** positive reasons for exclusion, such as a known enterprise or products outside the target niche.
- **06-unresolved.csv:** blocked websites, missing commerce evidence, uncertain niches and other research gaps. They are retained for another attempt or manual review.
- **07-UPLOAD-TO-PAID-VERIFIER.csv:** deduplicated published owner-email candidates with domain mail-routing records. Upload this file first. A header-only file means none met these requirements.
- **08-generated-patterns-NOT-VERIFIED.csv:** possible email formats, explicitly separate from observed addresses. These are not approved contacts and are not mixed into the primary verification upload.
- **05-research-results.json:** detailed owner evidence in the format accepted by the paid-result importer. `evidence.json` retains the store decisions.

Catalogue entries, sitemap URLs, inventory availability and a working purchase flow are different signals. Three priced products without known availability remain likely ecommerce; stock availability is reported separately. Sitemap counts are URL-count lower bounds, not verified live-product totals. Niche detection uses product context and rejects unrelated jewelry and game consoles. USD prices do not establish US business location.

Owner status, business independence and small/medium size remain review requirements. Published founders may no longer own the business. A paid valid result checks the mailbox, not ownership of the business. No result from this pipeline has `sendApproved: true`.

Names are checked again when a saved checkpoint is exported. Navigation labels, job titles, company names and repeated image/heading text are filtered; mentions explicitly referring to another brand are held in `rejectedOwnerMentions` for review. The finder file labels first-name-only records so they cannot be mistaken for full person names. Generated patterns are deduplicated separately. Summary counts distinguish confirmed catalogue evidence, likely stores, named-owner businesses and future retry cases.

## Paid results

Keep the provider's downloaded file intact:

```powershell
npm run research:verification -- --research="EXACT-EXPORT-FOLDER/05-research-results.json" --report="D:/Downloads/provider-results.csv" --provider=ZeroBounce --verified-at=2026-10-28
```

The importer copies the report to a new folder, matches only researched contacts and holds unknown, catch-all, invalid, conflicting and stale results. Date-only inputs use your Riyadh calendar day. It never enrolls or approves contacts.

## Tests and optional SMTP diagnostics

```powershell
npm run test:pipeline
npm run test:research
```

SMTP diagnostics are optional and require explicit `--smtp --helo=YOUR-PUBLIC-HOSTNAME`. They stop before DATA and do not send a message, but recipient acceptance does not prove mailbox ownership or eventual delivery. Probes use pinned public DNS addresses, bounded resolution/session time and conservative error classification. They are not needed for the planned paid-verification workflow.
