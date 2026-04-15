# Task Report: 1290 — feat(scheduler): implement franceSummaryJob
date: 2026-04-15
outcome: APPROVED

## Test Results

| Suite | Pass | Fail | Notes |
|-------|------|------|-------|
| `1290-france-summary-job.test.ts` | 5 | 0 | All 5 cases pass |
| `1139-utility-observability.test.ts` | 8 | 0 | Regression target — all pass |
| Full regression (`bun test`) | 4674 | 23 | 23 failures are pre-existing, none in 1290 files |
| TypeScript (`bun tsc --noEmit`) | — | 0 | Zero errors |

Pre-existing failures (23) cover: test-137 timeout (vnstock API calls), test-296 OCR e2e smoke, test-1124 prediction claim schema, test-1007 tickerJitter, test-297 UNIQUE constraint, test-103, test-1050, test-185, test-1025 SSC fallback, test-125 briefing roundtrip. None relate to task 1290.

## DDD Compliance: PASS

- `src/scheduler/franceSummaryJob.ts` imports only from `infrastructure/` (logger, db, telegram) — no domain layer imports.
- Scheduler layer does not import domain directly.
- Pre-existing `import type` from infra in domain files (7 files) — not introduced by this task.

## Security: PASS

- No `process.env` usage — file uses injectable `opts.db` / `opts.sendFn` only.
- No hardcoded credentials or API keys.
- SQL query uses parameterized binding (`db.prepare<SignalRow, [string]>(...).all(cutoff)`).

## Acceptance Criteria

| AC | Description | Status |
|----|-------------|--------|
| AC-1 | `src/scheduler/franceSummaryJob.ts` exists, exports `runFranceSummary()` | PASS |
| AC-2 | `CRONS.franceSummary = '0 7 * * 1-5'` in jobs.ts | PASS |
| AC-3 | Registered with `recordJobRun(getDb(), "franceSummaryJob", ...)` | PASS |
| AC-4 | `src/__tests__/1139-utility-observability.test.ts` passes | PASS (8/8) |
| AC-5 | `src/__tests__/1290-france-summary-job.test.ts` all 5 cases pass | PASS (5/5) |
| AC-6 | DDD — scheduler does not import domain directly | PASS |
| AC-7 | Result shape `{ sent: boolean, signalCount: number }` | PASS |
| AC-8 | Empty DB → `{ sent: false, signalCount: 0 }` (silent) | PASS |

## Issues Found

### Blocking
None.

### Non-Blocking
- `franceSummaryJob.ts` coverage at 84.38% lines. Uncovered lines 112-113, 148-149, 157-158, 166-169 are the dynamic import fallback branches (when no `opts.db` / `opts.sendFn` supplied). Acceptable — production path, not testable without integration environment.

## Merge Status
MERGED to main via `git merge --no-ff feat/1290-france-summary-job`.
Branch deleted (local + remote).
