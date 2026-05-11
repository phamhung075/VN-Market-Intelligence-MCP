# Task Report: JANITOR-011 — Extract ANSI+box-drawing regex to domain/utils/ansiUtils.ts
date: 2026-04-30
outcome: APPROVED

## Test Results
- Unit tests (1778*): 7 passed / 0 failed
- Unit tests (1780*): 10 passed / 0 failed
- ansiUtils.ts coverage: 100% functions / 100% lines
- Full suite: 8284 passed / 24 failed
- Baseline (main before merge): 8284 passed / 24 failed
- Regressions: 0
- TypeScript: 0 errors (bun tsc --noEmit)

## DDD Compliance: PASS
- ansiUtils.ts located at `apps/mcp-server/src/domain/utils/ansiUtils.ts` — correct domain layer
- Zero imports from `infrastructure/` or `application/` in ansiUtils.ts
- vnstockBridge.ts (infrastructure) imports from domain/utils — correct direction
- bctcDiscovery.ts (domain/services) imports from domain/utils — correct direction

## Security: PASS
- No hardcoded credentials or API keys
- No `process.env` usage (Bun.env standard maintained)
- Pure utility module — no HTTP, no DB, no side effects

## Grep Checks
- vnstockBridge.ts: no remaining inline `[\u2500-\u257F]` or ANSI regex literals — confirmed
- bctcDiscovery.ts: no remaining inline regex — re-exports only from ansiUtils.js

## Files Changed
- `apps/mcp-server/src/domain/utils/ansiUtils.ts` — created (exports: ANSI_JUNK_RE, ANSI_ESCAPE_RE, BOX_DRAWING_RE, JunkCheckResult, stripAnsiJunk)
- `apps/mcp-server/src/infrastructure/fetchers/vnstockBridge.ts` — removed 3 inline regex literals, imports from ansiUtils.js
- `apps/mcp-server/src/domain/services/bctcDiscovery.ts` — removed inline body, re-exports from ansiUtils.js (import path for tests unchanged)

## Issues Found
### Blocking
None.

### Non-Blocking
None.

## Merge Status
Merged `task/janitor-011-ansi-utils` → `main` via no-ff merge.
Branch deleted. TASKS.md updated to Done (2026-04-30).
