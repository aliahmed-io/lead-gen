# Pipeline results — 28 October 2026

The merged version 3 pipeline is installed. All 2181 source businesses are accounted for. It uses broader store checks and keeps unresolved evidence for review.

- Furniture/decor store candidates: 813 (616 with stronger catalogue evidence; 197 likely). A checkout was not executed.
- Businesses with published owner-name evidence: 67. Current ownership and small/medium independent business status still need review.
- Published owner-email candidates for paid verification: 1.
- Additional observed/inferred email candidates requiring review: 9.
- Owner-name/domain research requests: 86 (80 full-name candidates; 6 partial names). These are requests, not a count of independently verified people.
- Generated address patterns: 477. These are guesses and stay separate from the verification upload.
- Unresolved businesses retained: 1324. Missing evidence does not prove these are fake or offline-only businesses.
- Excluded using recorded evidence: 44.
- Rate-limited websites held for a later run: 2. Their requested delay is preserved in the checkpoint. No later job has been scheduled automatically.

Use this exact export folder; earlier exports are preserved:

[D:/leadgen/research-working/qualify-full-v3/exports-2026-10-28T04-15-37-376Z-624863751163400](D:/leadgen/research-working/qualify-full-v3/exports-2026-10-28T04-15-37-376Z-624863751163400)

1. [Published candidates for paid verification](D:/leadgen/research-working/qualify-full-v3/exports-2026-10-28T04-15-37-376Z-624863751163400/07-UPLOAD-TO-PAID-VERIFIER.csv). Currently one address. Confirm the owner/business evidence before sending.
2. [Additional addresses to review](D:/leadgen/research-working/qualify-full-v3/exports-2026-10-28T04-15-37-376Z-624863751163400/02-inferred-addresses-REVIEW-FIRST.csv). These include name matches and other unproven associations. They are not verified owner mailboxes.
3. [Owner-name/domain finder queue](D:/leadgen/research-working/qualify-full-v3/exports-2026-10-28T04-15-37-376Z-624863751163400/03-owner-found-need-finder.csv). Find missing addresses through independent research or an optional finder. Paid mailbox verification alone cannot discover missing addresses.
4. [Stores needing owner research](D:/leadgen/research-working/qualify-full-v3/exports-2026-10-28T04-15-37-376Z-624863751163400/04-qualified-no-owner.csv). No owner name was established by the pages reached.
5. [Unresolved records](D:/leadgen/research-working/qualify-full-v3/exports-2026-10-28T04-15-37-376Z-624863751163400/06-unresolved.csv). Retained for manual/browser review or a later attempt.

Keep the verification provider download unchanged. The existing paid-result importer works with this export’s 05-research-results.json and only matches known candidates. New finder discoveries need owner evidence review and separate integration before they can be treated as known candidates. Unknown/catch-all/stale/conflicting results remain held. It never approves contacts or starts a campaign.

[Pipeline commands and verification import instructions](D:/leadgen/PIPELINE-GUIDE.md)

Validation: 150 tests passed; lint passed; all 22 original lead files and the master retain their original hashes. New exports are deduplicated and every source business appears once in the decision evidence. No outreach was sent, no paid API was used, and no research contact was approved. SMTP probing is off by default; old checkpoint probe records are labelled historical.

[Validation record](D:/Users/aliha/.cursor/projects/d-leadgen/pipeline-hardening/VALIDATION-1793160999862.json)

This completes the pipeline code and research pass. Outreach still requires reviewed owner/business evidence, current external mailbox verification, working sender mailboxes, a genuine mailing identity and public unsubscribe access.
