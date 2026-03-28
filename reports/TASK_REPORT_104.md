# Task Report — Task 104: SSC Nightly Report Check (20:00 GMT+7)

> **Branch**: `task/104-job-ssc-check`
> **Date started**: 2026-03-28
> **Date merged**: 2026-03-28
> **Final status**: APPROVED
> **DDD layer**: application/usecases + interface/scheduler

---

## Kanban Movement

| Column | Date | Notes |
|--------|------|-------|
| Backlog → Todo | 2026-03-27 | Dependencies 048, 086 cleared |
| Todo → In Progress | 2026-03-27 | Assigned to Developer |
| In Progress → Review | 2026-03-28 | Developer submitted |
| Review → Done | 2026-03-28 | APPROVED — merged to main |

---

## Role Activity Log

### PM (Project Manager)
- Defined task scope: SSC portal nightly check at 20:00 GMT+7, dedup, alert generation
- Identified dependencies: Task 048 (SSC pipeline), Task 086 (alert store)
- DDD layer assigned: application/usecases + interface/scheduler
- Context injection: checkSscReports use case, sscCheckerJob wrapper, jobs.ts wiring

### Developer
- Files created:
  - `src/__tests__/104-job-ssc-check.test.ts` (277 lines, 9 tests)
  - `src/application/usecases/checkSscReports.ts` (314 lines)
  - `src/scheduler/sscCheckerJob.ts` (58 lines)
- Files modified:
  - `src/application/usecases/index.ts` — barrel export for checkSscReports
  - `src/scheduler/jobs.ts` — wire runSscCheck() + export CRONS
- TDD cycle followed: YES — test commit included with implementation in one commit
- Tests written: `104-job-ssc-check.test.ts`, 9 tests
- Assumptions made: process.env["DB_PATH"] = ":memory:" in test setup (pre-existing pattern)
- Time to implement: ~1 session

### QA — Review 1
- Date: 2026-03-28
- Outcome: APPROVED
- `bun test src/__tests__/104-job-ssc-check.test.ts` result: PASS (9 tests, 0 failures)
- `bun test` (full suite) result: PASS (364 tests, 0 failures)
- `bun tsc --noEmit` result: PASS (0 errors)
- Issues found: 0 blocking, 0 non-blocking

---

## Test Results

```
bun test src/__tests__/104-job-ssc-check.test.ts

  Task 104 — SSC nightly report check
  (pass) returns { checked: 0 } when getWatchlistFn returns empty array
  (pass) skips reports when isNewReportFn returns false
  (pass) calls pipeline for a new SSC report when isNewReportFn returns true
  (pass) handles SSC fetch error gracefully without throwing
  (pass) calls storeAlertsFn with an alert when a new report is found
  (pass) processes multiple watchlist stocks and sums newReports
  (pass) sscCheck cron is registered with 20:00 daily pattern [46ms]
  (pass) does not call storeAlertsFn when alertReportNew is false
  (pass) default isNewReport: returns false when ssc_url already in financial_reports

 9 pass
 0 fail
 25 expect() calls
Ran 9 tests across 1 files. [124ms]

Full regression: 364 pass, 0 fail
```

**Coverage notes**: All 9 acceptance criteria have dedicated tests. Real SQLite dedup check (test 9) uses an in-memory DB seeded with a known `ssc_url`. Pipeline error isolation tested (test 4). Alert suppression when `alertReportNew = false` tested (test 8).

---

## Issues Discovered During Review

### BLOCKING Issues

None.

---

### NON-BLOCKING Issues

None.

---

## Bug Report

| # | Severity | Description | File | Status |
|---|----------|-------------|------|--------|

No bugs found.

---

## Security Report

| # | Category | Description | Risk | Mitigation |
|---|----------|-------------|------|------------|
| 1 | SQL | `defaultGetWatchlist` and `isNewReport` use parameterized queries | None | `.prepare(sql).all(params)` / `.get(params)` — no string interpolation |
| 2 | Env | `process.env["DB_PATH"]` in test file only | Test-only | Pre-existing project-wide pattern for in-memory DB setup in tests |

**Security verdict**: CLEAN

---

## DDD Compliance

| Rule | Status |
|------|--------|
| `src/domain/` imports no `infrastructure/` or `application/` | PASS |
| `checkSscReports` in `application/usecases/` — may import domain + infra | PASS |
| `sscCheckerJob.ts` in `src/scheduler/` — imports only application use case and logger | PASS |
| `jobs.ts` wires `runSscCheck()` at cron slot 20:00 | PASS |
| No business logic in scheduler wrapper (`sscCheckerJob.ts`) | PASS |

Pre-existing non-blocking note (not introduced by this task): `src/domain/services/newsNormalizer.ts` imports `type { RssItem }` from `infrastructure/fetchers/rss.ts` as a type-only import. This is a known pre-existing technical debt item unrelated to task 104.

---

## Acceptance Criteria Sign-off

| Criterion | Status | Notes |
|-----------|--------|-------|
| checkSscReports use case in application layer | PASS | `src/application/usecases/checkSscReports.ts` |
| Dedup: existing reports skipped by `ssc_url` | PASS | `isNewReport()` queries `financial_reports.ssc_url`; test 2 + test 9 |
| Alert generated for new BCTC reports when `alert_report_new = 1` | PASS | test 5 |
| Per-stock error isolation — one failure does not abort the run | PASS | test 4: `errors` incremented, returns normally |
| Concurrency guard in scheduler wrapper | PASS | `isRunning` flag in `sscCheckerJob.ts` lines 21–38 |
| Cron schedule `0 20 * * *` | PASS | `CRONS.sscCheck = '0 20 * * *'` in `jobs.ts`; test 7 |
| Alert suppression when `alertReportNew = false` | PASS | test 8 |
| `checkSscReports` exported from application/usecases barrel | PASS | `src/application/usecases/index.ts` line 34 |
| Full regression suite passes | PASS | 364 tests, 0 failures |
| TypeScript strict check | PASS | 0 errors |

---

## Merge Summary

```bash
git checkout main
git merge --no-ff task/104-job-ssc-check -m "merge(104): SSC nightly report check (20:00 GMT+7)"
git branch -d task/104-job-ssc-check
```

- Commits in branch: 1 task commit (`f3eeb9b`)
- Files changed: 5
- Lines added: +660  |  Lines removed: -1
- Tests added: 9 new tests
- Type errors at merge: 0

---

## Notes for Next Tasks

- Task 105 (evening summary job) may now import `checkSscReports` from the barrel if it needs to reference the SSC result in the end-of-day digest.
- The `CRONS` export from `jobs.ts` is now available for any scheduler test that needs to inspect cron patterns.
- Known tech debt deferred: `defaultPipeline()` in `checkSscReports.ts` (lines 153–182) constructs a mock SSC HTML response to reuse `fetchParseAndStoreBctc` without an extra network call — this workaround can be replaced when task 048 exposes a direct URL-based entry point.
