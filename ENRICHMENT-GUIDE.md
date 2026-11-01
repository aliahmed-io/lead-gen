# Owner enrichment and the reusable business registry

This system keeps every imported business in a copied working registry. It does not overwrite original lead lists, enroll contacts or send email. Other ecommerce stays available for later campaigns. Missing evidence does not create a permanent non-ecommerce exclusion.

## What the groups mean

- `priority_ar_decor`: furniture/decor ecommerce evidence, ranked by likely AR/3D relevance. Furniture placement ranks above smaller decor. Likely ecommerce carries a lower score. The score is a targeting heuristic, not a promise of sales or technical suitability.
- `later_ecommerce`: ecommerce evidence outside the initial niche, or an uncertain niche. Retained for later offers.
- `ignore_non_ecommerce`: explicit published evidence that this business does not sell online. Recheck after 90 days.
- `research_needed`: no current ecommerce evidence, blocked pages, missing niche evidence, or an unqualified source record. Kept for further automated research.
- `excluded_outreach`: known chain/enterprise evidence. Retained with reasons and a recheck date.
- `excluded_data`: generated/test records. These never suppress discovery of a genuine business at the same domain.

The Maps scraper consults the registry before adding a newly discovered website. Known domains are routed to enrichment instead of being added again. Fresh explicit exclusions are skipped; expired exclusions can be researched again. Existing original lead lists are untouched. Unknown sites already in the registry remain in its research queue, so their missing details can be filled without generating duplicate businesses.

## Initialize or add another source list

```powershell
npm run enrich -- intake --master="D:/leadgen/MASTER_LEADS_2026-10-26.json" --qualification="EXACT-QUALIFICATION-EXPORT/evidence.json"
npm run enrich -- status
```

The qualification argument is optional for new source lists. An existing platform label or business category alone is not treated as proof of ecommerce. Source snapshots and hashes are retained. Repeated intake merges canonical business/domain/location records and preserves source IDs and email unions. Every niche and businesses without stored emails can be included.

To qualify a future whole list across all niches, independently of the old furniture-only qualification workdir:

```powershell
npm run enrich -- qualify --master="D:/leadgen/MASTER_LEADS_2026-10-26.json" --concurrency=6
```

This can take hours for a large list and makes public website requests. It uses a separate checkpoint, respects robots and keeps SMTP off. Repeat to resume. A `--sample=20` trial has its own checkpoint and cannot accidentally replace the full run.

Checkpoints are separated by Riyadh calendar day so future runs do not indefinitely reuse an old completed crawl. To resume a long run across days, pass its exact folder with `--checkpoint=PATH`. Reimporting the same unchanged evidence does not renew its classification date. Exports include `due-for-requalification.csv`.

## Free owner discovery

```powershell
npm run enrich -- discover --limit=40 --concurrency=4
```

This visits public home/about/team pages, keeps person/role/source evidence, and reuses the existing ownership extractor. Known cached websites are skipped before selecting the next batch, so repeating the command advances through the queue. Successful research is cached for 14 days; failed attempts for one day. External search results are discovery hints; a same-business page must be fetched before its text can supply owner evidence. Off-domain snippets are not automatically accepted as ownership proof.

For a future campaign, `discover`, `find` and `export` also accept `--segment=later_ecommerce`. The default remains `priority_ar_decor`; changing campaigns does not require recoding or deleting deferred stores.

## Optional provider access

Put provider keys in the ignored local file `D:/leadgen/.env.enrichment`, or environment variables:

```dotenv
HUNTER_API_KEY=your-own-key
BRAVE_SEARCH_API_KEY=your-own-key
```

No key is included in URLs or logs. Hunter handles full-name/domain lookups first, then executive-domain lookups for unresolved businesses. Ordinary employee results, product-owner job titles, assistant/vice-president roles and unrelated domains are held. Brave can find additional same-domain owner pages. Both integrations default to zero calls and need explicit call budgets:

```powershell
npm run enrich -- find --max-provider-calls=20
npm run enrich -- discover --limit=40 --max-search-calls=10
```

These caps limit requests, not dollar amounts. Check your account's credit and pricing terms before choosing a nonzero cap. One domain-search request may reveal multiple contacts with plan-specific charges. Cached results are reused for 30 days. HTTP rate limits stop provider processing. An uncertain/lost response retains its reservation and is not automatically rebilled; review the request against your provider account before any manual reconciliation. API keys and spending access are not necessary for the free research pass.

## Finder and verification imports

```powershell
npm run enrich -- import-finder --report="D:/Downloads/finder-results.csv" --provider=Hunter
npm run enrich -- import-verification --report="D:/Downloads/verifier-results.csv" --provider=ZeroBounce --verified-at=2026-10-28
npm run enrich -- export
```

Finder CSV requires `owner_name` (or `full_name`), `domain`, and `email`. Optional fields are `status`, `verified_at` and `source_url`. It matches only known owner/domain pairs. This is also the fallback path for a second provider, without locking the data to one vendor. It does not silently invent owners from a returned email.

Verification CSV requires `email` and `status`/`result`. A real verification date is required; unmatched addresses are counted and not imported as new people. Dates without times use the operator's Riyadh calendar day. Freshness is 30 days. Conflicting, invalid, unknown, accept-all and stale results remain held. A valid mailbox result never confirms ownership or sending permission.

Each export creates a fresh folder. The mailbox-check upload contains deduplicated observed/provider-reported candidates needing a current check; it excludes already fresh valid addresses. It is labelled `OWNER-REVIEW-REQUIRED`. Provider-inferred addresses retain their provenance, and generated name patterns are not imported as established contacts. The separate mailbox-valid file still requires owner/business review. No export approves sending.

## Concurrency and preservation

SQLite provides checkpointing, source history, per-domain deduplication, request reservations and a writer lease. Only one enrichment writer may run at a time. Ctrl+C stops after current work and saves completed research. A hard crash may leave a lease for up to four minutes. The scraper's registry reads are read-only and fail open if the registry is unavailable, preserving new leads for later inspection.

`npm run test:enrichment` tests a 10,000-business intake, imports, provider budgets/cache, lost responses, source preservation, classifications, scraper screening and mocked public research. These tests do not establish the live provider success rate or promise any number of owner emails.

Provider references: [Hunter API](https://hunter.io/api-documentation/v2), [Brave Web Search API](https://api-dashboard.search.brave.com/app/documentation/web-search/get-started).
