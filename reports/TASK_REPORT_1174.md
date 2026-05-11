# Task Report — Task 1174: Add getLabelAccuracyReport + LabelAccuracyRow to marketMessageStore.ts

> **Branch**: `task/1173-calibration-label-integration`
> **Date**: 2026-04-13
> **Final status**: CHANGES REQUESTED
> **DDD layer**: infrastructure

---

## Kanban Movement

| Column | Date | Notes |
|--------|------|-------|
| Backlog → Todo | 2026-04-13 | Dependencies cleared (1173 done) |
| Todo → In Progress | 2026-04-13 | Assigned to Developer |
| In Progress → Review | 2026-04-13 | Developer submitted |
| Review → In Progress | 2026-04-13 | Blocking bug in test file (AC-4) |

---

## Role Activity Log

### Developer
- Files created: `src/__tests__/1173-calibration-label-integration.test.ts` (task 1173)
- Files modified: `src/infrastructure/db/marketMessageStore.ts` (task 1174)
- TDD cycle followed: YES — test commit `6741da2` before implementation commit `9249035`
- Tests written: 18 tests across 9 AC groups

### QA — Review 1
- Date: 2026-04-13
- Outcome: CHANGES REQUESTED
- `bun test src/__tests__/1173-calibration-label-integration.test.ts`: 8 pass / 10 fail
- `bun tsc --noEmit`: PASS (0 errors)
- Issues found: 1 blocking (test authoring bug in AC-4), 10 expected-green failures are correctly deferred to tasks 1175/1176

---

## Test Results

```
bun test src/__tests__/1173-calibration-label-integration.test.ts

Task 1173 — AC-1: getLabelAccuracyReport groups by from_agent
  PASS  returns 2 rows for 2 agents; excludes row with verdict IS NULL
  PASS  rows are ordered by signal_rate DESC

Task 1173 — AC-2: getLabelAccuracyReport respects since_days window
  PASS  excludes rows reviewed 95 days ago; includes rows reviewed 5 days ago

Task 1173 — AC-3: getLabelAccuracyReport returns [] when no reviewed rows
  PASS  returns empty array for empty table
  PASS  returns empty array when all rows have verdict IS NULL
  PASS  uses default since_days=90 when parameter is omitted
  PASS  clamps since_days below 1 to 1
  PASS  clamps since_days above 365 to 365

Task 1173 — AC-4: get_label_accuracy_report MCP tool returns formatted table
  FAIL  tool output contains header with since_days value
        error: SQLite query expected 4 values, received 3 (dead-code loop, see blocking issue)

Task 1173 — AC-5: get_label_accuracy_report MCP tool empty state
  FAIL  returns Vietnamese empty-state message (tool not yet registered — task 1175)
  FAIL  empty-state message reflects the actual since_days value passed (tool not yet registered)

Task 1173 — AC-6: calibrationReportJob WORK post includes label_accuracy block
  FAIL  WORK message contains label_accuracy section header and agent lines (task 1176)

Task 1173 — AC-7: calibrationReportJob WORK post shows (no label data yet)
  FAIL  WORK message contains (no label data yet) when market_messages is empty (task 1176)
  FAIL  WORK message contains (no label data yet) when all market_messages have verdict NULL

Task 1173 — AC-8: CalibrationJobResult has label_accuracy field
  FAIL  runCalibrationReport returns object with label_accuracy field (task 1176)
  FAIL  label_accuracy is empty array when no market_messages rows are reviewed
  FAIL  label_accuracy contains LabelAccuracyRow entries when reviewed rows exist

Task 1173 — AC-9: getLabelAccuracyReport exception isolated in calibrationReportJob
  FAIL  job does not throw when db.prepare throws for verdict IS NOT NULL query (task 1176)

Tests: 8 passed, 10 failed
```

**Expected failures (10)**: AC-4 through AC-9 tests for MCP tool and scheduler are correctly gated on tasks 1175/1176.

**Note on 8/18 passing**: AC-1, AC-2, AC-3 (8 tests) pass because `getLabelAccuracyReport` + `LabelAccuracyRow` are now correctly implemented in task 1174. This is the correct GREEN state for task 1174 scope.

---

## Implementation Verification — marketMessageStore.ts

### SQL Parameterization
SQL query uses single `?` binding for `clampedDays` — no string interpolation. PASS.

### since_days clamping
```typescript
const clampedDays = Math.min(365, Math.max(1, since_days ?? 90));
```
Matches spec exactly. Default 90, clamped [1, 365]. PASS.

### LabelAccuracyRow export
Interface exported at line 275. All 6 fields present and typed per spec:
- `from_agent: string`
- `total_reviewed: number`
- `signal_count: number`
- `noise_count: number`
- `signal_rate: number | null`
- `last_reviewed_at: string | null`
PASS.

### BigInt safety
`RawLabelAccuracyRow` type declares `total_reviewed`, `signal_count`, `noise_count` as `number | bigint`. Post-query `.map()` coerces all three via `Number()`. Protects against SQLite returning bigint for COUNT/SUM on large datasets. PASS.

### SQL ORDER clause
`ORDER BY signal_rate DESC, total_reviewed DESC` — matches spec. PASS.

### JSDoc
`getLabelAccuracyReport` has complete JSDoc with `@param` and `@returns`. `LabelAccuracyRow` has interface-level JSDoc and inline comment on `signal_rate`. PASS.

---

## Issues Discovered During Review

### BLOCKING Issues

#### Issue 1174-01 — Dead-code loop in AC-4 test crashes before clean reset

- **Type**: Test authoring bug
- **File**: `src/__tests__/1173-calibration-label-integration.test.ts:392-398`
- **Description**: The first loop at lines 392–398 calls `db.run()` with a SQL containing 4 `?` placeholders (`from_agent`, `message_type`, `content`, `verdict`) but passes only 3 binding values (missing `verdict`). This throws `SQLite query expected 4 values, received 3` immediately, before the `DELETE FROM market_messages` reset at line 405.
- **Impact**: The test crashes unconditionally, regardless of whether the MCP tool is registered (task 1175). Even after task 1175 ships, AC-4 will remain broken until this dead-code loop is removed.
- **Fix required**: Delete lines 392–402 (the initial dead-code loop and its comment). The correct re-seed block starting at line 407 already handles the same inserts correctly.
- **Status**: Open — must fix before task 1175 review

### NON-BLOCKING Issues

#### Issue 1174-02 — `process.env` in test file

- **Type**: Convention deviation (test-file only, acceptable)
- **File**: `src/__tests__/1173-calibration-label-integration.test.ts:21`
- **Description**: `process.env["DB_PATH"] = ":memory:"` at line 21 is the standard test isolation boilerplate and appears in all Sprint 068/069 test files. The `Bun.env` rule applies to `src/` production code; `process.env` assignment in test files for DB isolation is an established project pattern.
- **Status**: No action required.

#### Issue 1174-03 — `as any` casts in AC-9 Proxy

- **Type**: TypeScript permissiveness (acceptable in test file)
- **File**: `src/__tests__/1173-calibration-label-integration.test.ts:658,662`
- **Description**: Two `(target as any)` casts are used in the Proxy handler. These are accompanied by eslint-disable comments and are isolated to the test file's AC-9 exception-simulation block. No `any` in production files.
- **Status**: Acceptable in test context.

---

## DDD Compliance

| Check | Result |
|-------|--------|
| `src/domain/` imports from `infrastructure/` | Pre-existing type-only imports in domain services (not introduced by this task) — pre-existing state, unrelated to task 1174 |
| `marketMessageStore.ts` imports only `bun:sqlite` | PASS — only import is `import type { Database } from "bun:sqlite"` |
| No business logic in infrastructure layer | PASS — `getLabelAccuracyReport` is a pure read-only DB query with no domain logic |
| Repository pattern respected | PASS — explicit `db` parameter, no global singleton |

---

## Security Report

| # | Category | Description | Risk | Result |
|---|----------|-------------|------|--------|
| 1 | SQL Injection | `since_days` bound via `?` parameter, not string-interpolated | High | CLEAN |
| 2 | SQL Injection | `clampedDays` is a plain integer from `Math.min/max` | High | CLEAN |
| 3 | Secrets | No `process.env` in production source | Medium | CLEAN |
| 4 | `any` types | Zero in `marketMessageStore.ts` | Low | CLEAN |

**Security verdict**: CLEAN

---

## Acceptance Criteria Sign-off (Task 1174 scope)

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: groups by from_agent, NULL excluded, order correct | PASS | 2 tests green |
| AC-2: since_days window filtering | PASS | 1 test green |
| AC-3: empty table returns [], NULL verdicts excluded, clamping | PASS | 5 tests green |
| LabelAccuracyRow exported with correct shape | PASS | tsc clean |
| SQL parameterized, since_days clamped 1-365 | PASS | verified |
| JSDoc complete | PASS | verified |
| BigInt coercion guard | PASS | Number() cast in .map() |

Task 1174 acceptance criteria: ALL PASS.

---

## Blocking Fix Required Before Next Review

The dead-code loop at `src/__tests__/1173-calibration-label-integration.test.ts` lines 392–402 must be removed. Exact fix:

Remove lines 392–402:
```typescript
    for (let i = 0; i < 31; i++) {
      db.run(
        `INSERT INTO market_messages (from_agent, message_type, content, verdict, reviewed_at)
         VALUES (?, ?, ?, ?, datetime('now', '-1 days'))`,
        ["alert-commander", "alert", `signal-msg-${i}`],
      );
    }
    // Missing 4th argument binding — use proper 4-param form
    for (let i = 0; i < 31; i++) {
      // Already inserted above, skip — re-do correctly below
    }
```

After removal, the test body starts directly with `db.run("DELETE FROM market_messages");` at line 405.

This fix must be applied by the Developer before task 1175 is reviewed, because AC-4 tests the MCP tool output (task 1175 scope) and will remain broken regardless of task 1175 progress.

---

## Notes for Next Tasks

- Task 1174 infrastructure work is solid: `getLabelAccuracyReport` and `LabelAccuracyRow` are correct, parameterized, and fully tested for AC-1/2/3.
- Tasks 1175 and 1176 are unblocked by the infrastructure implementation.
- **Before task 1175 review**: Developer must fix the dead-code loop in the test file (issue 1174-01). This is a test-file-only change, not a production code change.
- Task 1176 developer must verify `makeDb()` in `src/__tests__/1128-calibration-report-job.test.ts` includes `market_messages` table DDL (per TECH-070 backward compatibility notes). The 1173 test file's `makeDb()` already includes the correct DDL as a reference.
- Sprint 068/069 regression: 67 tests pass, 0 fail — no regressions introduced.

---

## Merge Status

NOT MERGED — changes requested. Branch remains open for task 1175/1176 development after test fix is applied.

---

### Fix — 2026-04-13
- **Issue**: Issue 1174-01 — Dead-code loop in AC-4 test crashes before clean reset
- **Root cause**: Lines 392–398 inserted rows with a 4-placeholder SQL (`from_agent, message_type, content, verdict`) but supplied only 3 binding values (missing `verdict`), causing SQLite to throw `expected 4 values, received 3` immediately — before the `DELETE FROM market_messages` reset at line 405. Lines 400–402 were an empty loop left as a placeholder comment, adding no value.
- **Fix**: Removed lines 392–402 (the broken insert loop and the empty no-op loop with its comment) from `src/__tests__/1173-calibration-label-integration.test.ts`. The correct re-seed block starting at the `DELETE FROM market_messages` line was already present and is now the first statement in the test body.
- **Tests added**: None — existing 8 green tests remain green; 10 deferred failures remain deferred (expected for tasks 1175/1176).
- **Verified**: `bun test src/__tests__/1173-calibration-label-integration.test.ts` → 8 pass / 10 fail (same as before, crash eliminated) | `bun tsc --noEmit` PASS
