# BA — Notebook

**Last updated:** 2026-05-03 | **Sprint:** 1846

## Current state

Sprint 1846 spec complete. Handed off to Architect. ARCH-1846 in Backlog.

## Last session summary

Wrote REQ_1846.md for Sprint 1846. Four deliverables:
1. delete_backtest_run MCP tool (#123) — purge a stored run by UUID
2. export_backtest_run_csv MCP tool (#124) — convert trades[] from resultJson to CSV
3. compare_backtest_runs MCP tool (#125) — side-by-side metrics for 2–5 run IDs
4. IBacktestResultRepository.deleteRun(id): boolean — new interface method + SQLite impl

Key finding: equityCurve is computed locally in backtestEngine.ts (number[]) but is NOT
serialised into BacktestReport or resultJson. This blocks includeEquityCurve=true in
export_backtest_run_csv. Flagged as BLK-1 with 3 options for Architect.

BacktestReport.trades confirmed fields: ticker, entryDate, exitDate, entryPrice,
exitPrice, direction, returnPct, confidence, positionWeight.
holdDays is not stored — must be derived from exitDate minus entryDate in ms / 86_400_000.

deleteRun() SQLite pattern: DELETE WHERE id=?, check stmt.run().changes >= 1.
Consistent with existing error-return-null pattern (catch returns false, not throw).

backtestTools.ts currently ~226 lines (tools #120, #121, #122). Sprint 1846 adds 3 more.
File split decision deferred to Architect (BLK-2).

Tool slots confirmed free: #123, #124, #125.

## Known patterns / preferences

- Always read strategyRegistry.ts + backtestEngine.ts together — they are tightly coupled
- TA service (apps/technical-analysis) is real-time only; historical TA must come from
  daily_ohlcv in the mcp-server SQLite DB
- globalSourceTracker is a globalThis singleton — test isolation issues are common in
  news pipeline tests; check for _resetGlobalSourceTracker() calls in beforeEach
- OHLCV date column is TEXT YYYY-MM-DD (string-sortable, no Date parsing needed)
- U-4 injection pattern: getDb() called inside tool handler, not at module scope
- Error format in all MCP tools: { error: '...' } JSON content block, never throw
- benchmarkReturn and sharpeRatio are nullable in BacktestRunRecord — always serialise
  as null not undefined
- backtestResultRepo.ts getRunById() catch block returns null (not throw) — tool layer
  must handle null explicitly
- deleteRun() should follow same pattern: catch returns false (not throw)
- equityCurve is NOT in resultJson — recompute from trades if needed (BLK-1 Option C)
