# Owner-contact research

This tool reads a master lead list and writes a separate working copy, a resumable SQLite checkpoint, and new timestamped exports. It does not log into mailboxes, call paid services, update campaigns, approve contacts, or send email.

## Run or resume

From the installed `D:\leadgen` folder:

```powershell
npm run research:master -- --input=D:/leadgen/MASTER_LEADS_2026-10-26.json --output=D:/leadgen/research-working/furniture-2026-10-28 --limit=2181 --concurrency=12 --pages=8
```

Use exactly the same input and output folder to resume. The tool checks the source hash and preserves the first input snapshot. It reuses finished site research. Every export goes into a new directory, so an earlier exported lead list is never overwritten.

Use `--retry-transient` to retry timeouts and temporary server/DNS failures, or `--retry-failed` to revisit all inaccessible sites. Access-denied pages and crawl-delay restrictions are not bypassed. `--export-only` rebuilds classifications and exports from the saved site evidence, without crawling websites again. Free DNS checks can still run during export. `--limit` limits business records, not individual email addresses.

## What it checks

- The 2,181 furniture/decor records with an existing email are the starting pool. Generated fixtures are excluded.
- Each unique public website is researched once per run. Known chains are excluded. The crawler follows useful About, team, contact, story and product links, up to the page limit.
- It follows robots rules, limits requests per site, and stops on access restrictions or excessive crawl delays. It does not bypass CAPTCHAs or scrape authenticated profiles.
- It records current HTML evidence of ecommerce purchasing, furniture/decor products, business identity, owner/founder names, exact published addresses and any published employee counts it finds.
- An old Shopify label does not prove a current ecommerce business. MX records do not verify a mailbox. A founder name does not prove current ownership. An email matching a person's name is an inference, not proof.
- Current owner status, independence and business size remain review requirements. Missing evidence is reported as unknown rather than invented.
- First-name matches and stored-only emails stay in the weaker review queue. Testimonials, department inboxes, historical owners and unrelated business domains do not qualify as strong owner-email evidence.

## Files for your paid verification

Each completed export directory contains:

1. `01-owner-candidates-for-paid-verification.csv` — one deduplicated email per row, restricted to the strongest published owner-email candidates with ecommerce/niche/identity evidence and working domain mail routing. These are candidates, not send-approved owners.
2. `02-owner-candidate-evidence.csv` — source URLs and the evidence for that upload.
3. `03-owner-candidates-needing-review.csv` — weaker or ambiguous owner matches. Review these before spending credits.
4. `04-business-research.csv` — one record per processed business, with findings and missing information.
5. `05-research-results.json` — detailed results and provenance.
6. `06-owner-email-finder-requests.csv` — published owner names and domains where an exact email is still missing. This can be used with an optional finder; finding and verifying an address are separate steps.
7. `07-missing-owner-research-queue.csv` — businesses where owner identity still needs research, including prepared public-search links.
8. `SUMMARY.json` and `READ-ME.txt` — counts, source hashes and next steps.

If file 01 contains only its header, there are no strong candidates from this pass; do not upload an empty file or substitute general contact addresses blindly. File 03 and the business-research file explain the remaining gaps. JavaScript-only, blocked, redirected or inaccessible websites need another source or manual research. This tool cannot guarantee a publicly discoverable owner email for every business.

## Bring paid results back

Keep the provider's original downloaded CSV intact. Supply the actual verification date and provider name:

```powershell
npm run research:verification -- --research="D:/leadgen/research-working/furniture-2026-10-28/exports-EXACT-FOLDER/05-research-results.json" --report="D:/Downloads/provider-results.csv" --provider=ZeroBounce --verified-at=2026-10-28
```

The CSV needs an email column and a status/result column. Common valid/deliverable, invalid, catch-all and unknown labels are supported. Unrecognized or conflicting results remain held. Reports older than 30 days and dates in the future are not accepted as fresh evidence.

The importer creates a new directory with a copy of the report, reconciled JSON and a CSV of candidates that passed paid verification. It matches only previously researched addresses, reports unmatched rows, and never marks a contact send-approved. It does not upload data to a verifier or update the application's active campaign database.

## Validation

```powershell
npm run test:research
```

Tests cover wrong-person matches, generic addresses, historical founders, chains, identity mismatches, mail-routing semantics, robots rules, safe CSV exports, paid-result matching, conflicting statuses, dates and no automatic approval.
