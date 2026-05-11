# Task Report: 1332+1333 — pollNews SOURCE_DISPLAY_NAMES map
date: 2026-04-17
outcome: APPROVED

## Test Results

| Suite | Pass | Fail |
|-------|------|------|
| `1332-pollnews-source-display-name.test.ts` | 4 | 0 |
| `1227-source-health-empty-result.test.ts` | 8 | 0 |
| Full suite (4927 tests, 369 files) | 4905 | 2 |

Full suite failures: tests 296 (OCR e2e 8-minute timeout) and 297 (UNIQUE constraint in computeForeignFlowScore) — both pre-existing, unrelated to this sprint. Pre-existing failure count reduced from 4 to 2 as expected.

TypeScript: 0 errors (`bun tsc --noEmit`)

## DDD Compliance: PASS

No imports from `infrastructure/` or `application/` in `src/domain/`. Changes confined to `src/application/usecases/pollNews.ts` (application layer) — correct layer placement.

## Security: PASS

No `process.env` in production src. No hardcoded credentials. SQL uses parameterized bindings throughout.

## Changes Reviewed

### `src/application/usecases/pollNews.ts`
- Added `SOURCE_DISPLAY_NAMES` constant (5 entries) mapping raw fetcher keys to display names:
  - `reuters` → `"Reuters RSS"`
  - `cafef` → `"CafeF RSS"`
  - `vnexpress` → `"VnExpress RSS"`
  - `vneconomy` → `"VnEconomy RSS"`
  - `tradingeconomics` → `"Trading Economics"` (no RSS suffix — matches `seedKnownSources` line 54)
- All 3 `globalSourceTracker` call sites (`recordSuccess`, `recordFailure` × 2) now use `displayName` instead of bare `name`.
- `displayName` falls back to raw `name` via `??` operator for unknown keys.

### `src/__tests__/1332-pollnews-source-display-name.test.ts` (new, 225 lines)
- Line 1: `process.env["DB_PATH"] = ":memory:";` — correct isolation.
- 4 tests covering: known key mapping, tradingeconomics no-RSS-suffix, unknown key passthrough, all 5 canonical display names.

## Issues Found

### Blocking
None.

### Non-Blocking
None.

## Merge Status

Merged `task/1332-1333-source-display-names` → `main` via `merge(1332): fix pollNews SOURCE_DISPLAY_NAMES — eliminates 2 test-1227 failures`.
Branch deleted local + remote.
Server restarted via `launchctl kickstart -k gui/$(id -u)/com.vn-market.mcp` — health check OK (98 tools, uptime ~5s).
Sprint 108 marked Complete. `totalTasksDone` updated to 288.
