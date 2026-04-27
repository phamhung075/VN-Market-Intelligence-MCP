# Task Report: fix/bctc-url-enrichment + fix/docker-python3 + fix/foreign-flow-cb-open
date: 2026-04-27
outcome: APPROVED

## Fixes Reviewed
1. fix/bctc-url-enrichment — SSC iboard VPS proxy + cafef JSON API + MISSING placeholder reset
2. fix/docker-python3 — python3 + pip3 + vnstock in Dockerfile
3. fix/foreign-flow-cb-open — CB log spam guard (logs once per state change)

## Test Results

### Fix test files (isolated run)
- FIX-bctc-url-enrichment.test.ts: 7 pass / 0 fail (4 describe blocks, 7 assertions)
- fix-docker-python3.test.ts: 5 pass / 0 fail
- FIX-foreign-flow-cb-log-spam.test.ts: 4 pass / 0 fail
- Combined: 16 pass / 0 fail / 55 expect() calls

### Full suite
- 7391 pass / 21 skip / 5 fail
- Bun runtime crash (C++ exception) at teardown — does NOT affect test results; all 7391 pass before crash
- 5 pre-existing failures confirmed unrelated to these fixes:
  - `1338-sprint-goal-retrospective.test.ts` (3 fail): stale documentation invariants asserting sprint 1344; project is now at sprint 1345 — pre-existing, tracked separately
  - `248-muasamcong.test.ts` (1 fail): network timeout hitting live endpoint — pre-existing, environment-dependent
  - `249-ssc-insider.test.ts` (1 fail): network timeout hitting live endpoint — pre-existing, environment-dependent

### TypeScript
- `bun tsc --noEmit`: 0 errors

## DDD Compliance: PASS

- `domain/services/bctcDiscovery.ts`: zero imports from infrastructure or application — clean domain service
- `scheduler/financial-reports/bctcQueueEnricherJob.ts`: imports only from infrastructure (db, logger) and domain (bctcDiscovery) — correct scheduler-layer pattern
- `infrastructure/fetchers/foreignFlowFetcher.ts`: infrastructure layer, no domain violations

## Security: PASS

- No `process.env` — all config reads via `Bun.env` (SSC_IBOARD_BASE_URL uses `Bun.env["SSC_IBOARD_BASE_URL"]`)
- No hardcoded credentials or API keys
- SQL queries use parameterized statements (`db.prepare("... WHERE id = ?")`) — no string interpolation in SQL
- No path traversal vectors in changed files
- `opts?: any` on `fetchFn` parameter in foreignFlowFetcher — pre-existing, matches native fetch signature; not introduced by this fix

## Issues Found

### Blocking
None.

### Non-Blocking
1. `foreignFlowFetcher.ts` line 108, 275: `opts?: any` on injectable fetchFn parameter. Pre-existing — present since feat/1288b. Confirmed via `git show 8fc72534`. Not introduced by this fix. Log as tech debt for a future cleanup task.
2. Bun v1.3.11 runtime C++ panic at test teardown (RSS 1.47GB). Not a code issue — known Bun upstream bug. Does not affect correctness of results. File upstream if recurrent.

## Operator Action Required

SSC_IBOARD_BASE_URL env var must be set on the production server to activate geo-block bypass:

```
SSC_IBOARD_BASE_URL=https://<vps-ip>/iboard
```

Without this, the iboard strategy will attempt direct DNS resolution of iboard-query.ssc.vn (NXDOMAIN from France) and fall back to cafef/vietstock. The fix is correctly guarded — the env var is optional; the server will not break without it. The BCTC enrichment will be maximally effective only once this is set.

## Merge Status

All 3 fixes: APPROVED — already merged to main per git status.
Baseline: 7391 pass (up from 7371 prior to these fixes).
