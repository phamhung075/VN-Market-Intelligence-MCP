# Task Report: 1392 — TDD RED: calibrationReportJob MARKET diacritics
date: 2026-04-17
outcome: APPROVED

## Test Results

| Metric | Result |
|--------|--------|
| Task tests (T1–T5) | 0 pass / 5 fail (RED — expected) |
| Full suite | not run (RED phase: pass would be wrong) |
| TypeScript | 0 errors |

### RED verification

All 5 tests fail against unchanged `calibrationReportJob.ts` with correct failure messages:

| Test | Expected (accented) | Received (unaccented) |
|------|--------------------|-----------------------|
| T1 | `BÁO CÁO` | `BAO CAO CALIBRATION TUAN ...` |
| T2 | `Dự đoán đã giải quyết` | `Du doan da giai quyet ...` |
| T3 | `cải thiện` | `cai thien` |
| T4 | `ổn định` | `on dinh` |
| T5 | `xuống cấp` | `xuong cap` |

Each test: (a) inserts seed data triggering MARKET send, (b) asserts accented string present, (c) asserts unaccented string absent. Non-trivial, correct logic.

## TDD Compliance: PASS

- Single commit `707c79f` = test file only, no impl changes
- Commit before any GREEN implementation (confirmed via `git log --oneline ^main`)
- 5 acceptance criteria → 5 tests, 1:1 mapping
- Tests use in-memory DB, inject `TelegramOverrides` — no I/O side effects

## DDD Compliance: PASS

- Test file imports `../infrastructure/db/calibrationSnapshotStore.js` — acceptable (test harness, not domain layer)
- No domain layer violations introduced

## Security: PASS (non-blocking note)

- Line 1: `process.env["DB_PATH"] = ":memory:"` — established test-isolation pattern in 10+ prior approved tests (1332, 1284, 1202, 1370, etc.). Not production code. Non-blocking.

## Issues Found

### Blocking
none

### Non-Blocking
- `src/__tests__/1392-calibration-report-diacritics.test.ts:1` — `process.env` in test harness; consistent with codebase convention, not flagged

## Merge Status

Branch `task/1392-calibration-report-diacritics-tdd` stays open — RED phase only.
Merge after GREEN implementation (task 1393 or equivalent).

---

## [QA] Review Record

verdict: APPROVED
blocking_issues: []
non_blocking:
- "src/__tests__/1392-calibration-report-diacritics.test.ts:1 — process.env in test setup (convention, not violation)"

files_confirmed_clean:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1392-calibration-report-diacritics.test.ts

merge_commit: pending (merge after GREEN)
