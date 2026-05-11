# Task Report: 1845d — DRY: extract computeBenchmarkReturn helper
date: 2026-05-03
outcome: APPROVED

## Summary

Task goal (extract `computeBenchmarkReturn` private helper in backtestEngine.ts, replacing 2 inline duplicate blocks) was already partially achieved by task 1843b which extracted the helper on its branch. However, a merge conflict during 1843b introduced a duplicate function definition on main (lines 81 and 104), causing `tsc` error TS2393. The 1845d worktree commit (6d474e06) correctly replicated the intended state but could not cherry-pick cleanly due to this pre-existing duplication.

QA action: removed the duplicate definition directly on main, restoring 1 definition + 2 call sites — exactly the state 1845d targeted.

## Test Results
- Targeted backtesting suite (1842d + 1842e + 1843-combined): 46 pass / 0 fail
- TypeScript: 0 errors (post duplicate-removal)

## DDD Compliance: PASS
- `backtestEngine.ts` is in `domain/backtesting/` — pure computation, no infrastructure imports

## Security: PASS
- No process.env, no hardcoded secrets, no SQL

## Issues Found

### Blocking
- None at merge time (duplicate was resolved as part of this QA cycle)

### Non-Blocking
- Pre-existing issue: 1843b merge introduced duplicate `computeBenchmarkReturn` definition. Root cause: two parallel worktrees (1843b and 1845d) each added the same helper independently; the 1843b merge did not detect the conflict cleanly. Fixed here.

## Change Applied
File: `apps/mcp-server/src/domain/backtesting/backtestEngine.ts`
- Removed duplicate `computeBenchmarkReturn` function (lines 99-109 post-1843b merge)
- Retained: 1 definition (line 81) + 2 call sites (runBacktestEngine + buildEmptyReport)
- grep -c result: 3 (1 definition + 2 calls) — matches developer spec

## Merge Status
MERGED to main via direct fix commit (cherry-pick not applicable due to pre-existing duplicate).
Worktree worktrees/agent-af84fbe3 retained; branch worktree-agent-af84fbe3 local only.
