# Task Report: 1288 — PollNewsResult shape mismatch (errors counts only thrown exceptions)
date: 2026-04-15
outcome: APPROVED

## Test Results

| Suite | Pass | Fail |
|---|---|---|
| 1288-poll-news-shape (4 cases) | 4 | 0 |
| 102-job-news-poll (regression) | 10 | 0 |
| 1227-source-health-empty-result | 8 | 0 |
| Full suite | 4671 | 21 |

Full suite: 21 failures are all pre-existing on `main` (confirmed by baseline comparison). Zero new regressions introduced by this branch.

TypeScript: 0 errors (`bun tsc --noEmit` clean).

## DDD Compliance: PASS

No new imports from `infrastructure/` or `application/` in `src/domain/`. Changed file is `src/application/usecases/pollNews.ts` (application layer) — correct layer for use-case logic.

## Security: PASS

- No `process.env` usage in changed files.
- No hardcoded credentials.
- No new SQL queries.

## Root Cause

Task 1227 added `globalSourceTracker.recordFailure()` for empty-result fetchers and simultaneously incremented `errors++` in the same branch. This conflated two concerns:
1. Source health tracking (empty result = degraded signal, correct)
2. `PollNewsResult.errors` counter (must only count thrown exceptions, contract in test 102)

## Fix

Single-line removal of `errors++` from the empty-result branch in `pollNews.ts` (commit `70906ca`). `globalSourceTracker.recordFailure()` call retained — health-tracking behaviour from task 1227 is fully preserved.

## Acceptance Criteria

| Criterion | Status |
|---|---|
| `errors = 0` when all fetchers return empty arrays | PASS |
| `errors = 0` when some fetchers return items, others empty | PASS |
| `errors = 1` when exactly one fetcher throws | PASS |
| `errors = N` when N fetchers throw | PASS |
| `globalSourceTracker.recordFailure()` still fires for empty results (1227) | PASS |

## Issues Found

### Blocking
None.

### Non-Blocking
21 pre-existing failures on `main` (unrelated tasks: 137, 1124, 185, 1025, 1139, 062, 296, 1007, 125, 297, 103, 1050). Tracked in backlog.

## Merge Status
MERGED to main via `merge(1288)`. Branch `fix/1288-poll-news-shape` deleted.
