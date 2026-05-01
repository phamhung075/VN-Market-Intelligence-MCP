# Task Report: 1405b — BCTC Placeholder URL Guard + VPS Push-Log Fix + VN-News Health Probe
date: 2026-04-28
outcome: APPROVED (with QA fix)

## Test Results
- Unit tests (1405b): 12 passed / 0 failed
- Neighboring tasks (1404 x2 + 1405b): 22 passed / 0 failed
- Full suite: Bun process panic on full run (known Bun 1.3.11 OOM issue on large suites); task-scoped runs pass cleanly
- TypeScript: 0 errors in production code after QA fix (pre-existing errors in 1383/1397c/1406a test files are baseline, unrelated to this task)

## DDD Compliance: PASS
- bctcQueueEnricherJob.ts: interface/scheduler layer, no domain importing infrastructure
- vpsHealthPoller.ts: domain/services — SQL string is config data only, no DB import added
- server.ts /api/push-news: interface layer importing infrastructure (logVpsPush) — allowed

## Security: PASS
- All SQL uses parameterized queries (? placeholders)
- Bun.env.VPS_PUSH_API_KEY used for auth (no process.env)
- No hardcoded secrets or credentials

## Issues Found

### Blocking (fixed by QA)
- `server.ts` TS2304/TS2632: The 1405b developer commit moved `VN_OFFSET_MS`, `_staleTickers_lastNotifiedDate`, and `isVnTradingWindowUtc` out of `server.ts` into `server-startup.ts` and `timeConstants.ts`, but left dead-code references at lines 421, 579, 597, 608 without adding the corresponding imports. TypeScript still type-checks dead code inside `if (false as boolean ...)` blocks. Fixed by:
  - Adding `VN_OFFSET_MS` import from `../../domain/services/timeConstants.js`
  - Adding `_staleTickers_lastNotifiedDate`, `_setStaleTickers_lastNotifiedDate`, `isVnTradingWindowUtc` to the existing `server-startup.js` import
  - Replacing the illegal ESM live-binding assignment `_staleTickers_lastNotifiedDate = todayUtc` with the setter call `_setStaleTickers_lastNotifiedDate(todayUtc)`

### Non-Blocking
- None

## Fixes Validated
1. bctcQueueEnricherJob WHERE clause now matches `https://congbothongtin.ssc.gov.vn/test%` placeholder URLs — test FIX-1 (3 cases) PASS
2. /api/push-news logVpsPush wrapped in try/catch; missing call added on rejection path — test FIX-2 (3 cases) PASS
3. vpsHealthPoller vn-news-fetch now queries rag_analyses.created_at, threshold 30 min — test FIX-3 (5 cases) PASS

## Merge Status
MERGED to main. Branch fix/1405b-bctc-vps-fixes deleted.
