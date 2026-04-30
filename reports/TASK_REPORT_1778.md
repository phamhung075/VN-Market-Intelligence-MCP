# Task Report: 1778 — BCTC vnstock junk response guard
date: 2026-04-30
outcome: APPROVED

## Test Results
- 1343b regression tests (isolated): 4 passed / 0 failed
- 1778 task tests (isolated): 7 passed / 0 failed
- Full suite on task branch: 8265 pass / 18 fail
- Full suite on main baseline: 8265 pass / 18 fail
- Regression delta vs main: 0 (18 failures in 308-tool-registry.test.ts are pre-existing, confirmed identical on both branches)
- TypeScript (bun tsc --noEmit): 0 errors

## DDD Compliance: PASS
- `bctcDiscovery.ts` is in `domain/services/` — correct layer
- Zero imports from `infrastructure/` or `application/`
- `stripAnsiJunk` implemented inline in domain layer by design (comment in source explains; cannot import from infrastructure)
- `Bun.env` used throughout — no `process.env`
- No `any` types
- All import paths end with `.js` (ESM compatible)

## Security: PASS
- No hardcoded credentials or API keys
- No SQL queries — not applicable to this file
- No `process.env` usage
- No unguarded `!` non-null assertions

## Issues Found

### Blocking
None.

### Non-Blocking
None.

## Fix Summary (Fixer Round 2)
The fixer correctly scoped the `stripAnsiJunk` guard to Strategy A (JSON.parse path) only within `extractCafefUrls`. Strategy B (HTML href scraping via `PDF_HREF_RE`) now executes on the raw string unconditionally — the junk guard early-return no longer fires before the HTML loop. This unblocks 28 tickers that were returning box-drawing/ANSI junk from the vnstock VCI endpoint.

## Merge Status
MERGED to main on 2026-04-30.
Branch `task/1778-bctc-vnstock-junk-response` deleted post-merge.
