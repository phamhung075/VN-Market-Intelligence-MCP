# Task Report: VPS-HEALTH — VPS Health Poller Rewrite (data-freshness edition)

date: 2026-04-25
outcome: APPROVED
branch: fix/vps-health-poller (merged to origin/main via 6d80e9d8)

## Summary

Rewrite of `vpsHealthPoller.ts` and `vpsServiceHealthJob.ts` to replace broken
localhost:5001-5005 HTTP polling with data-freshness checks against local SQLite tables.
Two bugs fixed:

**BUG 1:** `DEFAULT_VPS_SERVICES` pointed at Docker microservice ports (localhost:5001-5005).
The VPS at `$VINAHOST_IP` is a push-only service with no HTTP health endpoint — all polls
were silently returning connection errors or hitting the wrong target.

**BUG 2:** `vpsServiceHealthJob` reused `breakers.polymarket` for all 5 VPS health checks.
One polymarket circuit-open event (5 failures, 10-min lockout) would silently block all
5 VPS health reports — a cross-contamination from an unrelated service.

## Changed Files

- `apps/mcp-server/src/domain/services/vpsHealthPoller.ts` — full rewrite
- `apps/mcp-server/src/scheduler/system/vpsServiceHealthJob.ts` — polymarket CB removed
- `apps/mcp-server/src/__tests__/FIX-VPS-HEALTH-FRESHN.test.ts` — 16 new tests
- `apps/mcp-server/src/__tests__/234-vps-health-sla.test.ts` — AC-10 updated to validate fail-open

## Test Results

- Unit tests (FIX-VPS-HEALTH-FRESHN): 16 pass / 0 fail
- Unit tests (234-vps-health-sla):     12 pass / 0 fail
- Full regression:                     6451 pass / 214 fail / 7 skip
- TypeScript: 0 errors

Note: The 214 full-suite failures are pre-existing on main (network-dependent tests,
missing tables in :memory: DB, RSS/HTTP fetchers with no mocked responses). None are
related to the VPS health changes. The only test files importing VPS health functions
(`vpsHealthPoller`, `checkAllVpsServiceFreshness`, `DEFAULT_FRESHNESS_CONFIGS`) are the
two VPS health test files, both of which pass 100%.

## DDD Compliance: PASS

- `domain/services/vpsHealthPoller.ts`: 0 infrastructure imports.
  DB is injected as `Database` parameter — no `getDb()` call inside the domain layer.
- `scheduler/system/vpsServiceHealthJob.ts`: imports domain service only.
  `circuitBreakerRegistry` import removed entirely.
- Layer direction: scheduler → domain (correct). No upward violations.

## Security: PASS

- `process.env`: 0 occurrences in changed files (Bun.env only)
- SQL queries: all `SELECT MAX(col) AS latest_at FROM table` — read-only, no user input,
  no parameterization needed (zero-parameter queries, typed `[]` parameter array)
- No hardcoded credentials, tokens, or API keys

## Code Quality Notes

- `checkServiceFreshness()`: pure function, injectable `nowIso` for deterministic tests
- Legacy compat stubs retained: `FetchFn`, `VpsServiceConfig`, `DEFAULT_VPS_SERVICES`,
  `pollVpsServiceHealth` — all deprecated with JSDoc, delegate to new implementation
- `vn-bctc-fetch` modeled as passive (6h cadence, no realtime push table) — always healthy
- Error path returns `"unreachable"` status, never throws — fail-open by design

## AC-10 Test Update Verification

Old AC-10 checked `content.toContain("breakers.polymarket")` and `content.toContain("breaker.execute")`.
New AC-10 (origin/main) correctly validates the fix: asserts that `vpsServiceHealthJob.ts`
does NOT assign `breakers.polymarket` and does NOT import `circuitBreakerRegistry`. Test passes.

## Merge Status

- fix/vps-health-poller merged to origin/main: commit 6d80e9d8
- Local main synced: merge commit 654f637d
- Branch deleted: local + remote
