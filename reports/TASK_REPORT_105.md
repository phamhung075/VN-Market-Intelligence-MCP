# Task Report — Task 105: Evening Summary Job (22:00 GMT+7)

> **Branch**: `task/105-job-evening-summary`
> **Date started**: 2026-03-28
> **Date merged**: 2026-03-28
> **Final status**: APPROVED
> **DDD layer**: application (use case) + interface (scheduler)

---

## Kanban Movement

| Column | Date | Notes |
|--------|------|-------|
| Backlog → Review | 2026-03-28 | Single-commit TDD implementation |
| Review → Done | 2026-03-28 | Approved by QA, merged to main |

---

## Role Activity Log

### Developer
- Files created:
  - `src/application/usecases/assembleEveningSummary.ts`
  - `src/scheduler/eveningSummaryJob.ts`
  - `src/__tests__/105-job-evening-summary.test.ts`
- Files modified:
  - `src/scheduler/jobs.ts` — wired `runEveningSummary` at `CRONS.eveningSummary`
  - `src/application/usecases/index.ts` — barrel export for task 105 types
  - `TASKS.md` — moved task 105 to Review
- TDD cycle followed: YES (tests and implementation in single commit; test content is complete and meaningful)
- Tests written: `src/__tests__/105-job-evening-summary.test.ts`, 14 tests
- Assumptions made:
  - `market_prices.exchange` column may not exist (task 027 in-flight); graceful PRAGMA fallback implemented
  - Persistence output path uses `data/YYYY-MM-DD-evening.json` in test (injectable via `reportsDir`); production default is `./reports`
- Time to implement: ~1h

### QA — Review 1
- Date: 2026-03-28
- Outcome: APPROVED
- `bun test src/__tests__/105-*.test.ts` result: PASS (14 tests, 0 failures)
- Full regression `bun test` result: PASS (504 total tests, 0 failures)
- `bun tsc --noEmit` result: PASS (0 errors)
- Issues found: 0 blocking, 1 non-blocking (see below)

---

## Test Results

```
bun test src/__tests__/105-job-evening-summary.test.ts

  Task 105 — Evening Summary Job
  (pass) returns a valid EveningSummary structure on empty DB [16ms]
  (pass) date field matches today in Vietnam timezone
  (pass) topStories populated from rag_analyses since midnight, sorted by impact_score DESC
  (pass) topStories capped at 5 entries
  (pass) topAlerts populated from last 24h, sorted severity DESC (critical > warning > info)
  (pass) topAlerts capped at 5 entries
  (pass) watchlistMovers includes only stocks with |changePct| >= 1.0
  (pass) watchlistMovers sorted by |changePct| DESC
  (pass) persists summary to reports/YYYY-MM-DD-evening.json
  (pass) CRONS.eveningSummary is registered at weekday 22:00 pattern
  (pass) concurrency guard skips second invocation if first is still running [63ms]
  (pass) topStory items have required fields
  (pass) topAlert items have required fields
  (pass) watchlistMover items have required fields

14 pass / 0 fail
46 expect() calls
```

Full regression: 504 pass / 0 fail across 36 test files.

**Coverage notes**: `assembleEveningSummary.ts` at 93% lines — the uncovered lines (155-156, 159, 189-190, 290-292) are the lazy `getDb()` import path (production-only) and the `logger.warn` file-write-failure branch. Both are correct to leave untested in unit context. `eveningSummaryJob.ts` at 69% — the `scheduleEveningSummaryJob()` stub (lines 78-81) and the default dynamic import path (lines 48-51) are production-only, not exercised in unit tests.

---

## Issues Discovered During Review

### Blocking Issues

None.

### Non-Blocking Issues

#### Issue 105-01
- **Type**: TDD process
- **Description**: Test file and implementation were committed together in a single commit (`9ccfb47`). TDD best practice requires a separate "Red" commit for the failing test before the "Green" implementation commit. No functional impact — tests are complete and meaningful.
- **Fix applied**: Deferred — not worth amending history on an approved implementation. Future tasks should follow two-commit TDD pattern.

---

## Security Report

| # | Category | Description | Risk | Mitigation |
|---|----------|-------------|------|------------|
| 1 | process.env | No `process.env` in task 105 files | None | Uses `Bun.env` via `CRON_EVENING_SUMMARY` env key |
| 2 | SQL injection | All DB queries use parameterized `?` placeholders | None | Verified in assembleEveningSummary.ts |
| 3 | Path traversal | `reportsDir` + date string (YYYY-MM-DD format only) | None | Date string is generated internally, not from user input |

**Security verdict**: CLEAN

---

## DDD Compliance

| Check | Result | Notes |
|-------|--------|-------|
| `src/domain/` imports from `infrastructure/` | PRE-EXISTING | `newsNormalizer.ts` imports `RssItem` type from infra (documented exception per FR-061-7) — not introduced by task 105 |
| `src/domain/` imports from `application/` | PASS | No violations |
| Task 105 `application/` layer imports | PASS | `assembleEveningSummary.ts` imports only `bun:sqlite`, `node:fs`, `node:path`, `infrastructure/logger`, and sibling use case types |
| Task 105 `scheduler/` (interface) layer imports | PASS | `eveningSummaryJob.ts` imports only from `application/usecases/` |
| No business logic in scheduler layer | PASS | `eveningSummaryJob.ts` is a thin wrapper with only concurrency guard |

**DDD verdict**: PASS (pre-existing violations in domain/services are out of scope for task 105)

---

## Acceptance Criteria Sign-off

| Criterion | Status | Notes |
|-----------|--------|-------|
| `assembleEveningSummary` use case exists in application layer | PASS | `src/application/usecases/assembleEveningSummary.ts` |
| `EveningSummary` structure: `date`, `topAlerts`, `topStories`, `watchlistMovers`, `generatedAt` | PASS | All fields present and typed |
| `topStories`: top 5 from `rag_analyses` since midnight GMT+7, `impact_score DESC` | PASS | Test 3 verifies filter + sort + cap |
| `topAlerts`: last 24h from `alerts`, severity DESC, capped at 5 | PASS | Tests 5 and 6 verify |
| `watchlistMovers`: `|changePct| >= 1.0`, sorted `|changePct| DESC` | PASS | Tests 7 and 8 verify |
| Persistence to `YYYY-MM-DD-evening.json` | PASS | Test 9 verifies file exists and parses correctly |
| Cron registered at `0 22 * * 1-5` in `CRONS` object | PASS | `CRONS.eveningSummary = '0 22 * * 1-5'` |
| Timezone: `Asia/Ho_Chi_Minh` | PASS | Passed to `node-cron` in `jobs.ts` |
| Concurrency guard prevents overlapping invocations | PASS | Test 11 confirms second invocation is skipped |
| Graceful fallback if `market_prices.exchange` column absent | PASS | PRAGMA table_info check + COALESCE fallback |
| Barrel export in `application/usecases/index.ts` | PASS | Task 105 exports present |
| `bun tsc --noEmit` 0 errors | PASS | Verified |
| 0 `any` types in task 105 files | PASS | grep confirms clean |
| No `process.env` usage in task 105 files | PASS | Uses `Bun.env` |

---

## Merge Summary

```bash
git checkout main
git merge --no-ff task/105-job-evening-summary -m "merge(105): Evening summary job (22:00 GMT+7 weekdays)"
git branch -d task/105-job-evening-summary
```

- Commits in branch: 1
- Files changed: 6
- New files: `assembleEveningSummary.ts`, `eveningSummaryJob.ts`, `105-job-evening-summary.test.ts`
- Modified files: `jobs.ts`, `usecases/index.ts`, `TASKS.md`
- Tests added: 14 new tests
- Type errors at merge: 0
- Merge conflicts: None (clean fast-forward compatible)

---

## Notes for Next Tasks

- Task 125 (E2E test — daily briefing flow) can now start: it depends on tasks 101-105, all of which are now merged
- `assembleEveningSummary` accepts an injectable `db` and `reportsDir` — consistent with the pattern established by `assembleBriefing` (task 101); follow the same pattern for future scheduler use cases
- The `WatchlistMover` type is exported from both `assembleEveningSummary.ts` and the barrel `index.ts` — available for MCP tools if a "today's movers" tool is added later
- Known tech debt: `scheduleEveningSummaryJob()` stub in `eveningSummaryJob.ts` is unused — its scheduling is handled directly in `jobs.ts`. Can be removed in a future cleanup task.
