# Task Report: 1415b — QA Sign-Off: VCB BCTC Bank Page-Pair Parser (Round 2)

date: 2026-04-29
outcome: APPROVED

---

## Test Results

- hotfix-vcb-parser suite: **16 pass / 0 fail** (PASS) — includes B-3a VCB Q4 inline header + B-3b VCB Q1 page-pair
- Task 287 regression suite: **34 pass / 0 fail** (PASS)
- Full suite: **8053 pass / 25 fail / 21 skip** — pre-existing 25 failures unchanged, zero new failures
- TypeScript: 4 pre-existing errors in 1383-macro-alert-dispatch.test.ts + 1397c-vn-index-refresh.test.ts
  - Fixer's diff touches only balanceSheetExtractor.ts + hotfix-vcb-parser.test.ts — zero new TSC errors

## DB Verification (market.db — production Docker container)

| action_code | sort_key | total_assets | total_liabilities | equity_total |
|-------------|----------|-------------|-------------------|--------------|
| VCB | 2025-Q4 | 12,895,433 | **2,214,393,069** | 227,535,876 |
| VCB | 2025-Q1 | 35,202,546 | **1,904,318,782** | 204,941,834 |

- total_liabilities Q4: 2,214,393,069 — PASS (> 1,000,000 threshold met)
- total_liabilities Q1: 1,904,318,782 — PASS (> 1,000,000 threshold met)
- total_assets: anomalously low for VCB scale — **accepted per ADR Section 6 (out of scope for this task)**

## DDD Compliance: PASS

balanceSheetExtractor.ts in domain/services/financial-reports/ — zero imports from infrastructure/ or application/.

## Security: PASS

No process.env, no hardcoded credentials, no secrets in changed files.

## Changes Verified (commits ff5abb0e + 554b0f90)

Files changed:
- apps/mcp-server/src/domain/services/financial-reports/balanceSheetExtractor.ts
- apps/mcp-server/src/__tests__/hotfix-vcb-parser.test.ts

Fixes implemented:
- DATE_PATTERN changed to contains-based (DATE_CONTAINS): matches `31/12/2025` anywhere in line — handles VCB Q4 multi-column OCR header
- UNIT_PATTERN changed to UNIT_CONTAINS: matches `Triệu VND` / `VND` anywhere in line
- Same-line check: if date and unit appear on same line, separatorIdx = that line
- Step 1b fallback: second "Bao cao tinh hinh tai chinh" header line acts as separator for VCB Q1 page-pair format
- extractSplitBlockAll: labels-only page detection (has item codes 100-440, zero monetary values) merges with following page before parsing
- Step 3b banking-label fallback: when no item codes 100-440 found, searches for Vietnamese banking total labels (TONG NO PHAI TRA / TONG VON CHU SO HUU) and finds accounting triple satisfying grandTotal ≈ liab + eq
- Test fixtures: B-3 synthetic replaced with B-3a (VCB Q4 real OCR format) and B-3b (VCB Q1 real OCR page-pair format) per ADR Section 6

## Issues Found

### Blocking
None.

### Non-Blocking
- total_assets values appear anomalously low — out of scope per ADR, separate task recommended
- 4 pre-existing TSC errors in 1383 + 1397c test files — not introduced by this task

---

## Merge Status

APPROVED. Commits ff5abb0e + 554b0f90 already on main. hotfix-vcb-parser-fixer and 1415b moved to Done.
