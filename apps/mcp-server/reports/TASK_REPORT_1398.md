# Task Report: 1398 — pollNews all-sources-dark DB-backed cooldown
date: 2026-04-28
outcome: APPROVED

## Test Results
- Task 1398 tests: 2 passed / 0 failed
- pollNews-related suite (5 files): 34 passed / 0 failed
  - 1398-pollnews-all-dark-cooldown.test.ts: 2 pass
  - 1345a-reuters-fallback.test.ts: 14 pass (test-7 confirmed passing)
  - 102-job-news-poll.test.ts: 10 pass
  - 1187-pollnews-dead-path.test.ts: 4 pass
  - 1288-poll-news-shape.test.ts: 4 pass
- Full suite (worktree): 7540 pass / 120 fail — failures are pre-existing (same baseline as main; main OOMs before finishing the full run, same failures confirmed pre-existing on worktree base before the 1398 commit)

## TypeScript
- TSC errors in worktree (1348a-cascade-brokerage-competitive.test.ts): pre-existing on worktree base, not introduced by 1398 commit. Main branch has different pre-existing TSC errors (1383-macro-alert-dispatch.test.ts, 1397c-vn-index-refresh.test.ts). Neither set is caused by this task's changes.

## DDD Compliance: PASS
- Changed file: `apps/mcp-server/src/application/usecases/pollNews.ts` (application layer)
- No domain→infrastructure imports introduced

## Security: PASS
- No process.env usage
- SQL uses parameterized-style inline literals for static strings only; no user input in queries
- No hardcoded credentials

## Issues Found
### Blocking
None.

### Non-Blocking
- Pre-existing TSC errors in 1348a-cascade-brokerage-competitive.test.ts (worktree base divergence)
- Pre-existing full-suite flakiness at scale (120 fail same as baseline)

## Change Summary
- `apps/mcp-server/src/application/usecases/pollNews.ts`: added `nowMs` clock override option + DB-backed cooldown guard querying `cron_job_runs` table; persists last-sent timestamp via INSERT on each alert send
- `apps/mcp-server/src/__tests__/1398-pollnews-all-dark-cooldown.test.ts`: 2 new tests covering within-cooldown suppression (simulated restart) and post-cooldown re-fire

## Merge Status
Merged to main via: `merge(1398): pollNews all-sources-dark DB-backed cooldown guard`
Worktree removed. Branch deleted.
TASKS.md: Sprint 1398 marked done.
