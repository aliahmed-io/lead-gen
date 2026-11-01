# Automated enrichment — 28 October 2026

The enrichment system is installed. It works from a copied, persistent registry and is intended to run in batches at 10k+ scale. Individual searches by the assistant are not the operating method, and none of the one-off search results in chat were imported.

Implemented: ecommerce/AR relevance groups; preservation of deferred ecommerce and excluded businesses; duplicate screening in the Maps scraper; all-niche qualification checkpoints; cached public owner discovery; optional Brave Search; Hunter name-based finding and executive-domain fallback; generic finder CSV imports; dated verification imports; provider call caps, rate-limit cooldowns, opt-out suppression, crash-safe reservations and source history. Sending remains disabled by this system.

Current registry: 15425 nongenerated business records, 11995 distinct nongenerated website domains. 814 records across 809 domains are current furniture/decor priorities; 43 are deferred ecommerce; 14567 need further qualification. The 10250 previously flagged generated records are retained separately. These are records and candidates, not a claim that all businesses have been verified.

A free coded pilot attempted 40 priority domains: 33 researched, one partial, six unavailable. It recorded two owner-name observations and no additional email addresses. The registry retains ten earlier observed/inferred email candidates; none is currently externally verified in this registry or approved for outreach. The provider integrations have been tested with fixtures; they have not been tested against a live account.

## One-time inputs for automated provider lookup

1. Hunter API access: put HUNTER_API_KEY in D:/leadgen/.env.enrichment.
2. Optional search coverage: put BRAVE_SEARCH_API_KEY in the same file.
3. Choose the explicit request cap for each run. Both paid-capable stages default to zero calls. A request cap is not a dollar cap; provider credit pricing must be checked in the actual account.

BrowserAct failed twice to start with error 230305, so no Hunter key was retrieved. No configured provider key was found in the existing local environment files, and the connected inbox search found no Hunter setup email. No paid lookup or outreach was performed.

Once access is available, the code can perform lookups and imports in bulk. Uncertain identity, stale verification, catch-all responses and conflicting results stay held. There is no need to research each lead manually as the normal workflow.

[Commands and provider configuration](D:/leadgen/ENRICHMENT-GUIDE.md)
[Current exports](D:/leadgen/enrichment-working/exports-1793165772893-f3035c/SUMMARY.json)
[Validation record](D:/Users/aliha/.cursor/projects/d-leadgen/enrichment-build/VALIDATION.json)

Validation: 176 tests passed, type checking passed and lint reported zero errors (one pre-existing unused-import warning). All 22 original lead files and the master retain their original hashes. All 25,675 original source IDs are accounted for. No original lead list was deleted or edited.
