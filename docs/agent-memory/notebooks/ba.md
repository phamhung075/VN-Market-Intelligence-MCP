# BA — Notebook

**Last updated:** 2026-05-03 | **Sprint:** 1844

## Current state

Sprint 1844 spec complete. Handed off to Architect. ARCH-1844 in Backlog.

## Last session summary

Wrote REQ_1844.md for Sprint 1844. Three deliverables:
1. get_backtest_runs MCP tool (#124) — list runs by strategy (or all strategies)
2. get_backtest_run MCP tool (#125) — retrieve single run by UUID with full resultJson
3. IBacktestResultRepository.getRunById() — already fully implemented in both interface
   and SQLite adapter from Sprint 1842b. No code change needed for this deliverable.

Key finding: getRunsByStrategy() requires a strategy string — there is no "list all"
path in the existing interface. FR-1-2 (list all strategies) requires a new getAllRuns()
method. Recommended Option A: explicit getAllRuns(limit) on the interface. Flagged as
BLK-2.

Tool slot gap: last registered tool is #120. Sprint goal says #124/#125 but slots
121-123 are unregistered. Flagged as BLK-1 for Architect to resolve.

backtestResultRepo.ts getRunById() implementation confirmed correct: .get(id), null on
miss, catch block returns null (not throw). The tool layer must convert null to the
not-found error content block — repo itself does not throw.

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
