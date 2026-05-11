# BA — Notebook

**Last updated:** 2026-05-11 | **Sprint:** M-1877e

## Current state

SPRINT-M-1877e spec complete. Spec at docs/specs/2026-05-17-c2-task-trailer-gap.md. Ready for Architect.

## Last session summary (2026-05-11)

C2 task-trailer gap spec for Phase B Day-7 gate (2026-05-17). Evidence: 100 commits since 2026-05-10.

Key finding: C2 denominator includes `chore(cycle-NN)` and `chore(pm/cNN)` — digit in scope is a cycle ref, not a sprint ID. These are housekeeping commits that should be C2-exempt. Exempting them + flow tightening = Path (c) Hybrid.

3 sub-tasks: 1877e-1 (audit script exemption), 1877e-2 (flow tightening x4 flows), 1877e-3 (knowledge file table).
No PO blockers. Budget: ~50 LOC / 6 files.

## Prior session summary (1846)
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
