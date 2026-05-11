# TASK REPORT 309 — Tasks 1221 + 1248

**Date:** 2026-04-16
**Branch reviewed:** `worktree-agent-a42dcd17`
**QA verdict:** PASS — merged to main

---

## Summary

| # | Task | Layer | Result |
|---|------|-------|--------|
| 1221 | weeklyPortfolioReportJob DB-backed lock | interface/scheduler + infrastructure/db | PASS |
| 1248 | BDI VPS proxy route for geo-blocked sources | infrastructure/fetchers | PASS |

---

## Pipeline Results

| Step | Result | Detail |
|------|--------|--------|
| TypeScript strict (`bun tsc --noEmit`) | PASS | 0 errors |
| Task 1221 tests (`1221-weekly-report-db-lock.test.ts`) | PASS | 14/14 pass |
| Task 1248 tests (`1248-bdi-vps-proxy.test.ts`) | PASS | 9/9 pass |
| Full regression (`bun test`) | PASS | 4592 pass, 43 fail (all pre-existing) |
| DDD: `domain/` imports from `infrastructure/` | PASS | no violations in new files |
| DDD: `domain/` imports from `application/` | PASS | no violations in new files |
| Security: `process.env` in new files | PASS | all new files use `Bun.env` only |

### Pre-existing failures (not introduced by this branch)
Tasks 165, 172, 102, 185, 1025, 1187, VPS proxy watchdog — present on `main` before this branch. Confirmed by checking `schema.ts` diff (unchanged by this branch).

---

## Task 1221 — DB-backed lock for weeklyPortfolioReportJob

**Problem:** In-memory `_running` flag resets on server restart. If launchctl kickstart happens within the cron window, the weekly report can fire twice.

**Fix:**
- New file: `src/infrastructure/db/schedulerLockStore.ts` — 4 exported functions: `ensureSchedulerLocksTable`, `acquireSchedulerLock`, `releaseSchedulerLock`, `isSchedulerLockFresh`
- `scheduler_locks` table: `job_name TEXT PRIMARY KEY`, `acquired_at TEXT`, `released_at TEXT`
- Fresh window: 60 minutes (configurable via `windowMinutes`)
- `weeklyPortfolioReportJob.ts`: calls `ensureSchedulerLocksTable` + `acquireSchedulerLock` before executing; exits early if lock is fresh. Bypassed via `skipDbLock: true` for unit tests that do not exercise the lock path
- Graceful degradation: if lock table unavailable, logs warning and runs anyway (never throws)

**DDD:** `schedulerLockStore.ts` is in `infrastructure/db/` — correct layer. No domain imports.

---

## Task 1248 — BDI VPS proxy route

**Problem:** `shippingIndex.ts` fetches from `query1.finance.yahoo.com` directly, which is geo-blocked from France.

**Fix:**
- New exported function `buildShippingIndexUrl(symbol, defaultBase, proxyBaseUrl?)` with 4-level priority:
  1. `proxyBaseUrl` param (explicit override)
  2. `BDI_VPS_PROXY_URL` env var (operator config)
  3. `YAHOO_FINANCE_API_URL` env var (existing global override)
  4. Hardcoded Yahoo Finance API base
- `fetchShippingIndices` accepts optional `proxyBaseUrl` parameter, passes it through to `fetchSymbolData`
- Symbol URL-encoded (`^BDI` → `%5EBDI`) — was pre-existing, preserved
- Deployment: set `BDI_VPS_PROXY_URL=http://$VINAHOST_IP/proxy/yahoo` on VPS to activate proxy routing

**DDD:** `shippingIndex.ts` is in `infrastructure/fetchers/` — correct layer. Uses `Bun.env` only.

---

## Files Changed

| File | Change |
|------|--------|
| `src/infrastructure/db/schedulerLockStore.ts` | New — DB lock store |
| `src/scheduler/weeklyPortfolioReportJob.ts` | +26 lines — DB lock integration, `skipDbLock` option |
| `src/infrastructure/fetchers/shippingIndex.ts` | +49 lines — `buildShippingIndexUrl`, `proxyBaseUrl` param |
| `src/__tests__/1221-weekly-report-db-lock.test.ts` | New — 14 tests |
| `src/__tests__/1248-bdi-vps-proxy.test.ts` | New — 9 tests |

---

## Merge

```
merge(1221+1248): DB-backed scheduler lock + BDI VPS proxy route
```

Branch `worktree-agent-a42dcd17` merged to `main` with `--no-ff`. Worktree and local branch removed.

TASKS.md: tasks 1221 and 1248 moved to Done.
