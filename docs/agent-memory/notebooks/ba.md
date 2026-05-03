# BA — Notebook

**Last updated:** 2026-05-03 | **Sprint:** 1843

## Current state

Sprint 1843 spec complete. Handed off to Architect.

## Last session summary

Wrote REQ_1843.md for Sprint 1843. Three deliverables:
1. combined-high-confidence real strategy — EMA/RSI + Kinh Dich agreement gate
2. Fix 4 pre-existing test failures (265 x3, 1332 x1)
3. benchmarkReturnPct DRY cleanup in backtestEngine.ts

Key finding: strategyRegistry.ts signalFilter is synchronous single-row; EMA/RSI needs
N candles per ticker. This is RISK-1 — the Architect must pick one of three design
options (closure factory / enrichSignals hook / taDirection field on signal row) before
coding starts. Identified this by reading backtestSignalRepo.ts and technical-analysis
domain models.

Task 1332 failure is likely test isolation (globalSourceTracker singleton); pollNews.ts
already has SOURCE_DISPLAY_NAMES wiring in place.

Task 265 failures — exact cause unknown without live bun test output. Noted potential
missing overload for getReputation(db, code) with no date arg (test line 151).

## Known patterns / preferences

- Always read strategyRegistry.ts + backtestEngine.ts together — they are tightly coupled
- TA service (apps/technical-analysis) is real-time only; historical TA must come from
  daily_ohlcv in the mcp-server SQLite DB
- globalSourceTracker is a globalThis singleton — test isolation issues are common in
  news pipeline tests; check for _resetGlobalSourceTracker() calls in beforeEach
- OHLCV date column is TEXT YYYY-MM-DD (string-sortable, no Date parsing needed)
