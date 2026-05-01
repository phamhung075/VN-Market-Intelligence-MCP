# Task Report: 1327b — Fix TA Mock (RSI null check)
date: 2026-04-24
outcome: APPROVED

## Change
changed: [apps/mcp-server/src/scheduler/market-data/taAlertScanJob.ts:151]
`if (rsi === null)` → `if (rsi == null)`
Rationale: loose equality catches both `null` and `undefined`, matching the TA microservice contract when insufficient candles are present.

## Test Results
- 1307 suite (task): 9 pass / 0 fail
- Full suite: 6803 pass / 8 fail / 21 skip
- TypeScript: pre-existing errors only (1309-bb-alert-scan-job.test.ts × 3, 1323-pdf-extractor-client.test.ts × 4, alertScanParallelJob.ts × 2) — none introduced by this fix

## Pre-existing Failures (not introduced by 1327b)
- 8 test failures: network/HTTP tests (249-ssc-insider, 248-muasamcong, real-network calls)
- TSC errors: 1309-bb-alert-scan-job.test.ts `rsi: undefined` vs `exactOptionalPropertyTypes`, 1323-pdf-extractor-client.test.ts fetch mock type gaps, alertScanParallelJob.ts `.reason` access on union — all pre-date this fix commit (50876938)

## DDD Compliance: PASS
Only modified file is `scheduler/` layer. No domain→infrastructure imports.

## Security: PASS
No new env access, no SQL, no HTTP.

## Branch Status
Fix was committed directly to main (50876938). Task branch `task/1327b-fix-ta-mock` was stale (3d752a04, predated fix) — deleted.

## Merge Status
MERGED — commit 50876938 on main. Branch deleted.
