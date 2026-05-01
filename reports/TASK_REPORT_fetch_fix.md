# Task Report: fix/fetch-source-issues — vnstock concurrency, disabled-source health, TE deploy key
date: 2026-04-30
outcome: APPROVED

## Test Results
- New tests (19): 19 passed / 0 failed
- Regression suite (22): 22 passed / 0 failed
  - 1780-vnstock-backoff.test.ts: pass
  - 1227-source-health-empty-result.test.ts: pass
  - 1332-pollnews-source-display-name.test.ts: pass
- Full suite: 8415 passed / 32 failed (pre-existing) / 38 skipped
- TypeScript: 1 pre-existing error in newsNormalizer.ts (machinery sector missing — from prior commit 9e98934a, not in scope)

## Static Checks

### SourceStatus type union
File: `apps/mcp-server/src/domain/services/sourceHealthTracker.ts:32`
Value: `"ok" | "degraded" | "down" | "disabled"` — PASS

### fetchVnstockSnapshot sequential awaits
File: `apps/mcp-server/src/infrastructure/fetchers/vnstockBridge.ts:929-935`
7 sequential `await` calls present. No `Promise.all` in implementation (comment only). — PASS

### fetch-tradingeconomics.sh guard
File: `vps-scripts/fetch-tradingeconomics.sh:15-17`
Guard exits 0 when `TE_API_KEY` is empty or `__TE_API_KEY__` — PASS

### deploy-vinahost.sh TE substitution
File: `scripts/deploy-vinahost.sh:233`
`sed -e "s|__TE_API_KEY__|${TRADING_ECONOMICS_API_KEY:-}|g"` present — PASS

## DDD Compliance: PASS
No actual import statements from domain/ into infrastructure/. Grep returns comments only.

## Security: PASS
- No hardcoded credentials in changed files
- New `recordDisabled()` method does not touch SQL
- Shell guard uses env variable substitution correctly

## Issues Found
### Blocking
None.

### Non-Blocking
- Pre-existing TSC error: `newsNormalizer.ts` missing `machinery` key in sector map (from Task 9e98934a — separate fix required)
- 32 pre-existing test failures across Tasks 089, 1294b, 1303h, 1316/1317, 1347b, 1349c, 1378, 1382d, bug-2, 1300a — none introduced by this branch

## Merge Status
MERGED to main via no-ff merge. Branch fix/fetch-source-issues deleted.
Merge commit: on main as of 2026-04-30.
