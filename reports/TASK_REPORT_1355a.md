# Task Report: 1355a — monthlySignalQualityJob Gap Tests (MSQ-1–MSQ-8)
date: 2026-04-28
outcome: APPROVED

## Test Results
- Targeted (1355a): 9 passed / 0 failed (8 task tests + 1 teardown guard)
- Full suite: 7720 pass / 4 fail (pre-existing failures, not introduced by 1355a)
- TypeScript (1355a file): 0 errors (pre-existing errors in 1348a + 1352b are unrelated)

## Pre-existing Failures Confirmed (not introduced by 1355a)
- `1294b-bctc-fallback.test.ts` — extraction_method: expected "ocr_pdf", received "pdf-parse"
- `1190-pipeline-watchdog.test.ts` — expected "alert-sent", received "cooldown"
- `1288-foreign-flow-fallback.test.ts` or `1290a` — source: expected "cache", received "primary"
- `1351b/1353b/etc` — expected "restored", received "ok"

## DDD Compliance: PASS
- Test file imports from `application/services/signalQualityAudit.js` (allowed in tests)
- No domain/ imports from infrastructure/

## Security: PASS
- No process.env usage (Bun.env used correctly)
- No hardcoded credentials

## Production Files Modified: NONE
- Commit 2c8b1bef contains only: `apps/mcp-server/src/__tests__/1355a-monthly-signal-quality-job-gaps.test.ts`

## Coverage
- MSQ-1: January rollover → December 2025 in message
- MSQ-2: Non-January → March 2026 in message
- MSQ-3: Rate below 2% → no alert prefix, threshold-ok footer
- MSQ-4: Rate above 2% → alert prefix + full report embedded
- MSQ-5: sendFn called exactly once
- MSQ-6: queryRejectionStats receives correct monthName + year
- MSQ-7: generateAuditReport return value embedded in alert message
- MSQ-8: Regex fallback (no rate line) → defaults to 0%, no alert, sendFn still called

## Mock Strategy
- Mutable factory pattern at file level (avoids mid-test re-registration race)
- afterAll teardown restores real implementations for worker-sibling isolation
- globalThis.Date patching with restore in finally blocks

## Merge Status
Merged to main via commit 2c8b1bef (part of task/1355b branch chain).
TASKS.md updated in be51a22b (chore(1355b): QA sign-off).
Branch task/1355a-monthly-quality-job-gaps: deleted.
