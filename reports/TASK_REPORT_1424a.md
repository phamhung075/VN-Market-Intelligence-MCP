# Task Report: 1424a — BCTC confidence=0 false positive fix
date: 2026-04-29
outcome: APPROVED

## Summary

Fix two root causes that produced `confidence=0` false positives on valid BCTC reports:

1. **VAL-01 unit-scale guard** — OCR sometimes leaves `totalEquity` in raw VND while `totalAssets` is normalised to ty (billions). The ratio equity/assets >= 500 is physically impossible under Vietnamese accounting standards and can only arise from a unit-normalisation failure. Guard added in `financialFiguresValidator.ts`: ratio >= 500 → soft penalty (+0.2) instead of hard fail.

2. **Banking operatingProfit proxy** — 20 Vietnamese credit institutions (VCB, BID, CTG, ...) use a structurally different income statement layout. OCR sets `operatingProfit=0` for these tickers. When `operatingProfit===0 AND netProfit!==0`, `parseBctcReport` uses `netProfit` as the effective value for the operatingMargin validation check only. Stored `operating_profit` column is NOT altered.

## Test Results

- Targeted (1424a + 1345b): 16 pass / 0 fail
- Full suite: 8198 pass / 1 fail (pre-existing 1303h) / 38 skip
- Baseline: 8191 pass — delta: +7 new tests pass
- TypeScript: 0 errors (`bun tsc --noEmit`)

## Test Cases Verified

| TC | Description | Result |
|----|-------------|--------|
| TC-01 | Unit-scale mismatch (ratio=600) → soft penalty, NOT 0.0 | PASS |
| TC-02 | VNM regression guard (ratio=19.7) → hard fail = 0.0 | PASS |
| TC-03 | Ratio exactly at threshold (500x) → soft penalty | PASS |
| TC-04 | Ratio just below threshold (499x) → hard fail = 0.0 | PASS |
| TC-05 | VCB bank proxy — confidenceFinancial > 0.3, stored operating_profit = 0 | PASS |
| TC-06 | HPG non-bank — no proxy, margin=0.0 passes validation | PASS |

## DDD Compliance: PASS

- `financialFiguresValidator.ts` has zero imports (pure domain function)
- `parseBctcReport.ts` (application layer) — banking proxy logic correctly placed here, not in domain
- No domain→infrastructure violations detected in full scan

## Security: PASS

- No `process.env` usage in changed files
- No hardcoded credentials or API keys
- No SQL changes (no parameterized query review required)

## Issues Found

### Blocking
None.

### Non-Blocking
None.

## Merge Status

Merged to `main` via `--no-ff` on 2026-04-29.
Branch `task/1424a-bctc-confidence-fix` deleted.

## Telegram Reports Processed

Reports 2684-2692 + 2695-2697 (BCTC-1345b confidence=0 false positives for VCB and related bank tickers) — marked as processed. These reports were the direct trigger for this fix.
