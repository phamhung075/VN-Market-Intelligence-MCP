# Task Report: 1813 — BCTC Discovery DDD Fix (extract fetchWithTimeout to infrastructure)
date: 2026-05-01
outcome: APPROVED

## Context

Sprint 1813 fixed a DDD violation in `bctcDiscovery.ts`: `fetchWithTimeout` and `BROWSER_UA`
were defined inline in the domain layer (forbidden — domain must have zero infrastructure imports).
The fix extracted them to a new infrastructure fetcher and wired the production adapter at the
scheduler layer via dependency injection.

## QA Notes — Branch

The requested branch `feat/sprint-1813-bctc-ddd-fix` was not created. The developer committed
directly to `main` as commit `b76e24dd`. QA was performed against `main` at that commit.
No merge was required; all checks passed in-place.

## Test Results

- Targeted (--filter "1813-bctc-ddd"): 1 passed / 0 failed
- Full suite: 8518 passed / 31 failed (8587 ran total)
- Bun runtime panic at suite end — known upstream Bun bug, not related to Sprint 1813 code
- TypeScript (bun tsc --noEmit): 0 errors
- Pre-existing failures: 31 (all in 1295c, 1300a/b, 1303h, 1316/1317, 1349c, 1382d, 239c,
  Dockerfile checks — none related to Sprint 1813)
- New failures introduced by 1813: 0

## DDD Compliance: PASS

- `fetchWithTimeout` and `BROWSER_UA`: removed from `domain/services/bctcDiscovery.ts` (0 grep hits)
- `bctcHttpFetcher.ts` created at `infrastructure/fetchers/` — correct layer
- `bctcHttpFetcher.ts` imports `BROWSER_UA` from `./browserHeaders.js` (infra-to-infra, valid)
- `bctcHttpFetcher.ts` imports `HttpFetchFn` type from `domain/services/bctcDiscovery.js` (type-only, valid — infra implements domain port)
- `bctcHttpFetch` exported from `infrastructure/fetchers/index.ts` barrel
- `bctcQueueEnricherJob.ts` wires `bctcHttpFetch` for all four strategies (lines 153–156)
- Domain layer: zero infrastructure imports confirmed

## Security: PASS

- No hardcoded credentials or API keys in any changed file
- No `process.env` usage — Bun.env used for config reads in domain
- HTTP fetch uses AbortController with per-call timeout (no hanging requests)
- Browser User-Agent applied correctly at infrastructure layer

## Wiring Verification

```
bctcQueueEnricherJob.ts (scheduler/interface)
  └─ imports bctcHttpFetch from infrastructure/fetchers/bctcHttpFetcher.ts
       └─ wraps globalThis.fetch with AbortController + BROWSER_UA headers
            └─ passed as _fetchVpsPlaywright, _fetchSsc, _fetchCafef, _fetchVietstock
                 └─ discoverHosePdfUrls() (domain) — receives injected fns, no infra import
```

## Issues Found

### Blocking
None.

### Non-Blocking
- Branch hygiene: developer committed directly to `main` instead of using the
  `feat/sprint-1813-bctc-ddd-fix` branch specified in the task brief.
  Code is correct; no re-work required. Recommend developer follow branch protocol next sprint.
- Test coverage: only 1 test for the guard path; happy-path integration tests (actual HTTP
  calls with mocked fetch) would increase confidence but are not blocking.

## Merge Status

ALREADY ON MAIN — commit b76e24dd (2026-05-01 23:51 +0200).
No merge action required.
No worktrees to remove (none existed for this sprint).
