# Task Report — Task 1176: Extend CalibrationJobResult + runCalibrationReport + sendCalibrationDigest; fix makeDb() in 1128 test

> **Branch**: `task/1173-calibration-label-integration`
> **Date reviewed**: 2026-04-13
> **Final status**: APPROVED
> **DDD layer**: scheduler

---

## Kanban Movement

| Column | Date | Notes |
|--------|------|-------|
| Backlog → Todo | 2026-04-13 | Dependency 1174 cleared |
| Todo → In Progress | 2026-04-13 | Assigned to Developer |
| In Progress → Review | 2026-04-13 | Developer submitted |
| Review → Done | 2026-04-13 | Approved by QA |

---

## Role Activity Log

### PM (Project Manager)
- Defined task scope: extend CalibrationJobResult with label_accuracy field; add Step 3.5 in runCalibrationReport; extend workLines block; fix makeDb() in 1128 test
- Hidden dependency noted: makeDb() in 1128 test must include market_messages table and indices
- Acceptance criteria: AC-6, AC-7, AC-8, AC-9

### Developer
- Files modified:
  - `src/scheduler/calibrationReportJob.ts` — added import of `getLabelAccuracyReport, type LabelAccuracyRow`; extended `CalibrationJobResult` with `label_accuracy: LabelAccuracyRow[]`; added Step 3.5 try/catch block; extended `sendCalibrationDigest` workLines with label accuracy block
  - `src/__tests__/1128-calibration-report-job.test.ts` — extended `makeDb()` to create market_messages table and four indices (idx_mm_sent_at, idx_mm_from_agent, idx_mm_verdict, idx_mm_ticker)
- TDD cycle: YES — tests in 1173-calibration-label-integration.test.ts preceded implementation (AC-6, AC-7, AC-8, AC-9)
- Tests covering this task: AC-6, AC-7, AC-8 (3 sub-tests), AC-9 — 7 test cases

### QA — Review 1
- Date: 2026-04-13
- Outcome: APPROVED
- `bun test` result: PASS (18/18 in 1173 suite; 21/21 in 1128 regression suite; 36/36 in 1163 suite; 31/31 in 1168 suite)
- `bun tsc --noEmit` result: PASS (0 errors)
- Issues found: 0 blocking, 0 non-blocking

---

## Test Results

```
bun test ./src/__tests__/1173-calibration-label-integration.test.ts

  Task 1173 — AC-6: calibrationReportJob WORK post includes label_accuracy block
    WORK message contains label_accuracy section header and agent lines (PASS)

  Task 1173 — AC-7: calibrationReportJob WORK post shows (no label data yet)
    WORK message contains (no label data yet) when market_messages is empty (PASS)
    WORK message contains (no label data yet) when all market_messages have verdict NULL (PASS)

  Task 1173 — AC-8: CalibrationJobResult has label_accuracy field
    runCalibrationReport returns object with label_accuracy field of type array (PASS)
    label_accuracy is empty array when no market_messages rows are reviewed (PASS)
    label_accuracy contains LabelAccuracyRow entries when reviewed rows exist (PASS)

  Task 1173 — AC-9: getLabelAccuracyReport exception isolated in calibrationReportJob
    job does not throw when db.prepare throws for verdict IS NOT NULL query (PASS)

Tests: 18 passed, 0 failed (all 1173 suite)

bun test ./src/__tests__/1128-calibration-report-job.test.ts

Tests: 21 passed, 0 failed (regression — no regressions introduced)
```

---

## Issues Discovered During Review

### BLOCKING Issues

None.

### NON-BLOCKING Issues

None.

---

## CalibrationJobResult Extension Verification

- `label_accuracy: LabelAccuracyRow[]` field added at line 57 in `calibrationReportJob.ts`
- Field is additive — existing consumers (`insertCalibrationSnapshot`) do not read it
- `insertCalibrationSnapshot` call unchanged — NFR "snapshot store does NOT persist label_accuracy" respected

## Step 3.5 Isolation Verification

- Step 3.5 is wrapped in try/catch at `calibrationReportJob.ts:466-473`
- On exception: `logger.warn` called, `labelAccuracy` remains `[]`, job continues
- AC-9 test confirms: Proxy that throws on `verdict IS NOT NULL` SQL → job completes, `label_accuracy=[]`, WORK message shows "(no label data yet)"

## WORK Message Verification

- Section header: `"\nLabel Accuracy (90 ngay, human labels):"` appended after "Per-agent Brier:" block
- Empty path: `"  (no label data yet)"` when `result.label_accuracy.length === 0`
- Non-empty path: per-agent lines in format `"  {from_agent}: {signal}/{total} signal ({pct}%)"`
- MARKET channel NOT extended — label accuracy is WORK-only (internal metric), per spec

## makeDb() Fix in 1128 Test

- `market_messages` table DDL added at `1128-calibration-report-job.test.ts:97-114`
- All four indices created: `idx_mm_sent_at`, `idx_mm_from_agent`, `idx_mm_verdict`, `idx_mm_ticker`
- Schema matches `src/infrastructure/db/schema.ts` production DDL
- 21/21 existing 1128 tests continue to pass — no regressions

---

## Security Report

| # | Category | Description | Risk | Mitigation |
|---|----------|-------------|------|------------|
| 1 | SQL Injection | getLabelAccuracyReport (called in Step 3.5) uses parameterized binding | None | Verified in marketMessageStore.ts:325 |
| 2 | process.env | `process.env["DB_PATH"] = ":memory:"` in test file only | None | Acceptable test isolation pattern; no process.env in production files |
| 3 | any types | `eslint-disable @typescript-eslint/no-explicit-any` in AC-9 Proxy test only | None | Test-only; production files have zero `any` |

**Security verdict**: CLEAN

---

## DDD Compliance

- `calibrationReportJob.ts` (scheduler layer) imports from `infrastructure/db/marketMessageStore.js` — correct (scheduler may import infrastructure)
- No domain imports added
- No business logic moved to wrong layer — getLabelAccuracyReport computation lives in infrastructure, scheduling wrapper in scheduler
- PASS

---

## Regression Suite Results

| Suite | Tests | Result |
|-------|-------|--------|
| 1173-calibration-label-integration | 18 | PASS |
| 1128-calibration-report-job | 21 | PASS |
| 1163-market-message-review | 36 | PASS |
| 1168-market-message-digest | 31 | PASS |

---

## Acceptance Criteria Sign-off

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-6: WORK message contains "Label Accuracy (90 ngay, human labels):" and per-agent lines | PASS | alert-commander 3/3 (100.0%), morning-briefing 1/2 (50.0%) |
| AC-7: WORK message shows "(no label data yet)" when market_messages empty or all NULL verdicts | PASS | Both sub-cases verified |
| AC-8: CalibrationJobResult has `label_accuracy` field of array type at runtime | PASS | Property existence and type verified |
| AC-9: getLabelAccuracyReport exception isolated — job completes, label_accuracy=[], WORK fallback line | PASS | Proxy throw pattern verified |
| makeDb() in 1128 extended with market_messages table + 4 indices | PASS | 21/21 1128 tests pass |
| `bun tsc --noEmit` reports 0 errors | PASS | |

---

## Merge Status

Ready to merge with Task 1175 on the same branch. Both tasks approved.
Branch: `task/1173-calibration-label-integration` → `main`

---

## Notes for Next Tasks

- Task 1177 (sprint close) can now start: 1175 and 1176 both approved
- `docs/data/project-stats.json` needs: `currentSprint=70`, `toolCount=96` (tool-registry.json already updated)
- No technical debt introduced. No deferred issues.
