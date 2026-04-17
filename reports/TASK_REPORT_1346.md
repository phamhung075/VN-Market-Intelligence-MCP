# TASK REPORT — Sprint 116 (Tasks 1346 + 1347)

**Date:** 2026-04-16
**QA Agent:** QA / CI-CD
**Branch merged:** `task/1346-1347-ta-adaptive` → `main`
**Merge commit:** `cf74d48`

---

## Summary

| Field | Value |
|-------|-------|
| Tasks | 1346 (TDD test), 1347 (fix) |
| Sprint | 116 |
| Branch | `task/1346-1347-ta-adaptive` |
| Result | APPROVED — merged |

---

## Change Description

**Problem:** `defaultComputeTa` in `assembleBriefing.ts` had a hard guard of `< 15` rows, causing `taSummary` to return `null` for tickers with only 10 available `daily_ohlcv` candles. RSI and MA used fixed periods 14 and 20 regardless of available data.

**Fix (1347):**
- Guard lowered: `rows.length < 8` (was `< 15`)
- RSI period: `Math.min(14, rows.length - 1)` (adaptive)
- MA period: `Math.min(20, rows.length)` (adaptive)

**Conflict resolution (merge):** Sprint 114 (`task/1342-1343-ta-fallback`) had added a `market_prices_history` fallback for the `< 15` case. Resolved by keeping the fallback with threshold updated to `< 8` — preserving both the fallback mechanism and the adaptive guard.

---

## QA Checklist

| Check | Result |
|-------|--------|
| `git log main..HEAD` — at least 1 commit | PASS — 1 commit |
| Line 1 of test 1346: `process.env["DB_PATH"] = ":memory:"` | PASS |
| `assembleBriefing.ts` guard: `< 8` | PASS |
| `computeRSI` uses `Math.min(14, rows.length - 1)` | PASS |
| `computeMA` uses `Math.min(20, rows.length)` | PASS |
| `bun tsc --noEmit` | PASS — 0 errors |
| `bun test 1346-ta-adaptive-periods.test.ts` | PASS — 4/4 |
| `bun test 1330-ta-daily-ohlcv.test.ts` | PASS — 4/4 |
| Full suite `bun test` | PASS — 4915 pass, 20 skip, 0 fail |
| DDD compliance (domain/ no infra/app imports) | PASS |
| Security scan (no `process.env` outside tests) | PASS |
| Worktree `.claude/worktrees/agent-a1931758` removed | PASS |
| Branch deleted local + remote | PASS |
| Server restarted via launchctl | PASS — health OK, 98 tools |

**Note:** Bun VM crash after full suite completion is pre-existing on `main` (confirmed by reproducing on `main` before merge). Not introduced by this branch.

---

## Conflict Resolution Detail

File: `src/application/usecases/assembleBriefing.ts`

- HEAD (main sprint 114): fallback to `market_prices_history` when `daily_ohlcv < 15`
- Branch (sprint 116): simple `< 8` guard, no fallback
- Resolution: keep fallback, update both thresholds to `< 8`

This preserves the intent of both sprints: sprint 114's resilience (fallback source) + sprint 116's lower minimum (8 candles sufficient for adaptive RSI).

---

## Post-merge

| Action | Status |
|--------|--------|
| TASKS.md sprint 116 → Done | DONE |
| `docs/data/project-stats.json` | sprint 117, totalTasksDone=302 |
| Server health | OK — `{"status":"ok","toolCount":98}` |
