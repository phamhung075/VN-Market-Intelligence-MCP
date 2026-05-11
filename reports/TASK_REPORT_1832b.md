# Task Report: 1832b — pollNews zero-check excludes CB-open/disabled sources
date: 2026-05-02
outcome: APPROVED

## Problem
`pollNews` was triggering a "all sources dark" Telegram BUG alert even when all
sources were either circuit-breaker-open (5+ consecutive failures) or explicitly
disabled (no API key configured). Dead sources (reuters chronic, Trading Economics
chromium chronic, newsapi disabled) were counted in the denominator of the
zero-items check, producing two false-alarm alerts: BUG 2727 and BUG 2728.

## Fix
- `pollNews.ts`: added `activeSourceCount` pre-guard that filters out any source
  whose display name is CB-open (`globalSourceTracker.isDown()`) or explicitly
  disabled (`STUB_CAPABLE_KEYS` + `isNewsapiConfigured()` check).
- All-dark condition changed from `allItems.length === 0` to
  `allItems.length === 0 && activeSourceCount > 0`.
- Alert message now includes `(active: N/M)` suffix for diagnostics.
- `sourceHealthTracker.ts`: added `isDown()` helper to expose CB-open status
  from the domain service.
- `sourceHealthTools.ts`: exported `_resetGlobalSourceTracker()` for test
  isolation (test-only, not exposed as MCP tool).

## Test Results
- Unit tests (1832b): 5 pass / 0 fail (AC-1 through AC-5)
- Related suite (1398-pollnews-all-dark-cooldown): 2 pass / 0 fail
- Combined targeted run: 7 pass / 0 fail
- Full suite (developer report): 8608 pass / 1 fail (pre-existing: 1331a TEST-3)
- TypeScript: 0 errors (confirmed by pre-push hook)

## Pre-existing Failure Confirmed
`1331a-single-writer-guard.test.ts TEST-3` fails on main before the worktree
changes. Root cause: `STOCK_PRICE_DB_PATH` env var not set in test environment.
This is not introduced by 1832b.

## DDD Compliance: PASS
- `sourceHealthTracker.ts` (domain): zero infrastructure imports
- `pollNews.ts` (application): imports from domain + infrastructure only
- `sourceHealthTools.ts` (interface): singleton + MCP tool only
- No business logic added to interface layer

## Security: PASS
- No hardcoded credentials or API keys
- No `process.env` usage (Bun.env throughout)
- No SQL changes in this task
- No `any` types introduced

## Root Cause Resolved
BUG 2727 + BUG 2728 pattern eliminated. The false-alarm condition
(zero items with all active sources actually dead/disabled) no longer triggers
the BUG channel. Real outages (at least one active source returns 0) still fire.

## Merge Status
Merged to main via no-ff merge commit cf7add23 on 2026-05-02.
Branch `task/1832b-pollnews-active-source-filter` deleted.
Worktree `.claude/worktrees/agent-a455ee05` removed.
