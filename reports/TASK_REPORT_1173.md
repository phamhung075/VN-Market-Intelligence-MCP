# Task Report — Task 1173: TDD Red Phase — Calibration Label Integration

> **Branch**: `task/1173-calibration-label-integration`
> **Date reviewed**: 2026-04-13
> **Final status**: APPROVED
> **DDD layer**: tests

---

## Kanban Movement

| Column | Date | Notes |
|--------|------|-------|
| Backlog → Todo | 2026-04-13 | TECH-070 approved by Architect |
| Todo → In Progress | 2026-04-13 | Developer assigned |
| In Progress → Review | 2026-04-13 | Developer submitted (commit 6741da2) |
| Review → Done | 2026-04-13 | QA approved — TDD red phase confirmed |

---

## Role Activity Log

### PM (Project Manager)
- Defined task scope: write 18 failing tests for AC-1 through AC-9 in `src/__tests__/1173-calibration-label-integration.test.ts`
- Dependencies: TECH-070 (approved design)
- DDD layer: tests
- Context injection: REQ-070.md, TECH-070.md, marketMessageStore.ts, calibrationReportJob.ts

### Developer
- Files created: `src/__tests__/1173-calibration-label-integration.test.ts`
- Files modified: `TASKS.md` (task 1173 moved to Review)
- TDD cycle followed: YES — test file committed before any implementation
- Tests written: 18 tests in 1 file
- Assumptions made: none (all patterns follow TECH-070 test strategy verbatim)

### QA — Review 1
- Date: 2026-04-13
- Outcome: APPROVED
- `bun test src/__tests__/1173-*` result: 0 pass / 18 fail (correct red phase)
- `bun tsc --noEmit` result: PASS (0 errors)
- Issues found: 0 blocking, 0 non-blocking

---

## Test Results

```
bun test src/__tests__/1173-calibration-label-integration.test.ts

  0 pass
  18 fail

Ran 18 tests across 1 file. [340ms]
```

All 18 tests fail with `ReferenceError: getLabelAccuracyReport is not defined` (AC-1 to AC-3),
`ToolNotFoundError` for `get_label_accuracy_report` (AC-4 to AC-5), and assertion failures on
`result.label_accuracy` being `undefined` (AC-6 to AC-9). This is the expected red phase state.
No test panics, no uncaught exceptions outside the expected failure surface.

**Prior calibration test suites** (1128-calibration-report-job.test.ts, 1129-calibration-tools.test.ts):
26 pass, 0 fail — unaffected by the new test file.

**Coverage notes**: All 9 ACs from REQ-070 are covered. AC-1 has 2 tests (grouping + ordering),
AC-3 has 5 tests (empty table, all-null verdicts, default since_days, clamping low, clamping high),
AC-5 has 2 tests (default value + custom value), AC-7 has 2 tests (empty table + all-null verdict),
AC-8 has 3 tests (field exists, empty array, populated array). Total: 18 tests across 9 ACs.

---

## AC-to-Test Coverage Map

| AC | Tests | Lines |
|----|-------|-------|
| AC-1: getLabelAccuracyReport groups by from_agent, excludes NULL | 2 | 227, 270 |
| AC-2: getLabelAccuracyReport respects since_days window | 1 | 305 |
| AC-3: getLabelAccuracyReport returns [] when no reviewed rows | 5 | 355, 361, 371, 378, 385 |
| AC-4: get_label_accuracy_report MCP tool formatted table | 1 | 409 |
| AC-5: get_label_accuracy_report MCP tool empty state | 2 | 501, 514 |
| AC-6: calibrationReportJob WORK post includes label_accuracy block | 1 | 532 |
| AC-7: calibrationReportJob WORK post shows (no label data yet) | 2 | 577, 593 |
| AC-8: CalibrationJobResult has label_accuracy field | 3 | 618, 627, 634 |
| AC-9: getLabelAccuracyReport exception isolated in calibrationReportJob | 1 | 666 |

---

## DDD Compliance: PASS

- `src/__tests__/` is not a DDD layer — test files are exempt from DDD layer constraints.
- The test file imports from `infrastructure/db/schema.js`, `infrastructure/db/marketMessageStore.js`,
  `interface/mcp/tools/calibrationTools.js`, and `scheduler/calibrationReportJob.js`. These cross-layer
  imports are correct and required in test files (integration tests exercise the full stack).
- No new production source files were created in this task. DDD compliance of production layers
  is unchanged.
- Domain layer scan: zero `import ... from ".*infrastructure"` or `import ... from ".*application"`
  in `src/domain/` — PASS.

---

## Security: PASS

| # | Category | Finding | Verdict |
|---|----------|---------|---------|
| 1 | process.env | `process.env["DB_PATH"] = ":memory:"` on line 21 | ACCEPTABLE — test isolation sentinel, prescribed by TECH-070 §Test Strategy, consistent with prior test files (002-db-schema.test.ts, etc.) |
| 2 | SQL injection | All `db.run()` calls with user-like data use parameterized bindings (array as second arg) | CLEAN |
| 3 | Hardcoded credentials | None | CLEAN |
| 4 | any types | Two uses of `any` cast in the AC-9 Proxy mock (lines 679, 681), both annotated with `eslint-disable` | ACCEPTABLE — Proxy pattern requires any-cast; isolated to mock object in test |

**Security verdict**: CLEAN

---

## Issues Discovered During Review

### Blocking Issues

None.

### Non-Blocking Issues

#### Issue 1173-01
- **Type**: Minor readability
- **File**: `src/__tests__/1173-calibration-label-integration.test.ts:413–423`
- **Description**: The AC-4 test seeds data in a loop, then immediately runs a dead loop (`for (let i = 0; i < 31; i++) {}` with a comment "Already inserted above, skip"), then calls `db.run("DELETE FROM market_messages")` before re-seeding correctly. This creates a confusing dead-code block.
- **Impact**: Zero functional impact — the DELETE clears the dead inserts and the correct seed follows. Tests pass correctly once implemented.
- **Fix applied**: Deferred to Task 1174 or left as-is — the test is a TDD file and the logic is correct. The developer may clean up the dead loop in a follow-up commit if desired.

---

## Acceptance Criteria Sign-off

| Criterion | Status | Notes |
|-----------|--------|-------|
| Test file exists: `src/__tests__/1173-calibration-label-integration.test.ts` | PASS | Created in commit 6741da2 |
| All 9 ACs (AC-1 through AC-9) have at least 1 test each | PASS | 18 tests covering all 9 ACs |
| `bun tsc --noEmit` passes in red phase | PASS | 0 errors |
| `bun test src/__tests__/1173-*` fails in red phase | PASS | 18 fail / 0 pass |
| Tests fail for correct reason (not implemented yet, not syntax error) | PASS | ReferenceError/assertion on missing exports |
| Tests are meaningful (not trivially `expect(true).toBe(true)`) | PASS | All tests assert specific data values |
| Edge cases tested: empty input, NULL verdicts, window clamping | PASS | 5 tests in AC-3 block |
| Parameterized SQL in seed helpers — no string interpolation | PASS | All db.run() calls use `?` binding |
| makeDb() creates market_messages table + 4 indices | PASS | Lines 138–154 |
| Prior calibration tests (1128, 1129) still green | PASS | 26 pass / 0 fail |
| TDD commit order: test file committed before implementation | PASS | Commit 6741da2 is the first commit on this branch |

---

## Merge Summary

This is a TDD red-phase task. The branch is NOT merged to main at this stage.
Merge will occur after tasks 1174–1176 are complete and all 18 tests turn green.

- Commits in branch: 1 (`6741da2`)
- Files changed: 2 (`TASKS.md`, `src/__tests__/1173-calibration-label-integration.test.ts`)
- Lines added: +709 (test file) + TASKS.md update
- Tests added: 18 new failing tests
- Type errors at this stage: 0

---

## Notes for Next Tasks

- Task 1174 is now unblocked. It must export `getLabelAccuracyReport` and `LabelAccuracyRow` from
  `src/infrastructure/db/marketMessageStore.ts`. Once done, AC-1, AC-2, AC-3 tests will turn green.
- Task 1174 developer should note the dead-code loop in AC-4 test (lines 413–423) — it is harmless
  but could be cleaned up.
- Task 1175 must register `get_label_accuracy_report` in `registerCalibrationTools`. The test at
  line 196 calls `registerCalibrationTools(server, db)` — the second `db` argument must be accepted
  by the function signature. Verify the existing signature in `calibrationTools.ts` supports injection.
- Task 1176 must extend `CalibrationJobResult` with `label_accuracy: LabelAccuracyRow[]` and update
  `runCalibrationReport` Step 3.5. It must also extend `makeDb()` in
  `src/__tests__/1128-calibration-report-job.test.ts` to create the `market_messages` table — this
  is the HIDDEN DEPENDENCY noted in TECH-070 §Backward Compatibility Notes.
- The `process.env["DB_PATH"]` pattern in the test file is correct and intentional. Do not replace
  with `Bun.env` — the module-level side effect must run before any imports resolve.
