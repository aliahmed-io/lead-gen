# E2E Test Infra: LeadGen

## Test Philosophy
- Opaque-box, requirement-driven. No dependency on implementation design.
- Methodology: Category-Partition + BVA + Pairwise + Workload Testing.

## Feature Inventory
| # | Feature | Source (requirement) | Tier 1 | Tier 2 | Tier 3 |
|---|---------|---------------------|:------:|:------:|:------:|
| 1 | Scraper CLI | ORIGINAL_REQUEST R1 | 5      | 5      | ✓      |
| 2 | Email Finder CLI | ORIGINAL_REQUEST R1 | 5      | 5      | ✓      |
| 3 | Email Sender CLI | ORIGINAL_REQUEST R1, R3 | 5      | 5      | ✓      |
| 4 | Followup CLI | ORIGINAL_REQUEST R1, R3 | 5      | 5      | ✓      |
| 5 | Excel Export | ORIGINAL_REQUEST R1 | 5      | 5      | ✓      |
| 6 | Dashboard UI Display | ORIGINAL_REQUEST R2 | 5      | 5      | ✓      |
| 7 | Dashboard Error Handling | ORIGINAL_REQUEST R2 | 5      | 5      | ✓      |

## Test Architecture
- Test runner: `node e2e_tests/runner.js`
- Test case format: standard Node.js test runner using `node:test` and `node:assert`. Test files will be in `e2e_tests/` directory named by tier (`tier1.test.js`, etc.).
- Expected output format: TAP output or standard pass/fail logging. Exit code 0 if all tests pass, exit code 1 if any fail.
- Directory layout:
  - `e2e_tests/`
    - `runner.js`
    - `tier1_feature.test.js`
    - `tier2_boundary.test.js`
    - `tier3_pairwise.test.js`
    - `tier4_workload.test.js`
    - `fixtures/` (mock databases, config files)

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Complete LeadGen Pipeline | F1, F2, F3, F4, F5 | High |
| 2 | Dashboard Inspection of Scraped Data | F1, F6 | Medium |
| 3 | Exporting Data after Sender execution | F3, F5 | Medium |
| 4 | Dashboard recovers from malformed DB | F6, F7 | Medium |
| 5 | Dry-Run Email & Followup Blast | F3, F4 | Medium |

## Coverage Thresholds
- Tier 1: ≥5 per feature (Total: 35)
- Tier 2: ≥5 per feature (Total: 35)
- Tier 3: pairwise coverage of major feature interactions (Total: 7)
- Tier 4: ≥5 realistic application scenarios (Total: 5)
