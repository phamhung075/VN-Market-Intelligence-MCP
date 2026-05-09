# Task Report: 1858a — FIX: pollNews all-dark cooldown 4h→24h
date: 2026-05-08
outcome: APPROVED

## Test Results
- Task-specific tests (1398 + 1793): 7 pass / 0 fail
- Full suite: 9142 pass / 12 fail / 38 skip
- TypeScript: 0 errors
- 12 suite failures: pre-existing on main (Task 178, 1031, 1100, 1331a, 1549, Sprint 145) — not regressions from this task

## DDD Compliance: PASS
- Changed file: `apps/mcp-server/src/application/usecases/pollNews.ts` (application layer)
- Imports from infrastructure/ are permitted at application layer
- No domain→infrastructure violations

## Security: PASS
- No hardcoded secrets
- No process.env usage
- Constant-only change — no SQL, no HTTP

## Issues Found
### Blocking
None.
### Non-Blocking
None.

## Merge Status
- Merged task/1858a-pollnews-cooldown → main (no-ff)
- Branch deleted
- docs/TASKS.md updated — 1858a added to Done 2026-05-08
