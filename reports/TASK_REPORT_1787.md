# Task Report: 1787 — GVR Sector Fix: oil_gas → agriculture
date: 2026-04-30
outcome: APPROVED

## Summary

GVR (Vietnam Rubber Group / Tap doan Cong nghiep Cao su Viet Nam) was incorrectly
classified as `oil_gas` in `seedWatchlist.ts`. The correct domain is `agriculture`
(rubber production, not petroleum). This fix restores the agriculture domain to the
WATCHLIST_SEED, bringing the total distinct domains from 9 back to 10.

## Changes Reviewed

- `apps/mcp-server/src/infrastructure/db/seedWatchlist.ts` — GVR domain: `"oil_gas"` → `"agriculture"`, comment added
- `apps/mcp-server/src/__tests__/1787-gvr-sector-fix.test.ts` — 4 new tests (created)
- `apps/mcp-server/src/__tests__/1343a-watchlist-restore.test.ts` — sector count assertion: 9 → 10 domains

## Test Results

- Task tests (1787): 4 passed / 0 failed
- Watchlist restore tests (1343a): 15 passed / 0 failed
- Full suite: 8329 passed / 30 failed (identical to main baseline — zero regressions)
- TypeScript: 0 errors (`bun tsc --noEmit`)

## DDD Compliance: PASS

- `seedWatchlist.ts` is in `infrastructure/db/` — correct layer
- No domain→infrastructure import violations in changed files
- Golden rule maintained: `domain/` has zero imports from `infrastructure/`

## Security: PASS

- No `process.env` usage (Bun.env only)
- No hardcoded credentials or API keys
- No SQL injection vectors (parameterized queries in seedWatchlist)

## Issues Found

### Blocking
None.

### Non-Blocking
- DAG ticker appears misclassified as `pharma` — should be `machinery`.
  Logged as JANITOR-012 in TASKS.md Todo for future cleanup.

## Merge Status

Merged to main: commit `f35aa9be` — 2026-04-30
Branch deleted: `task/1787-gvr-sector-fix`
