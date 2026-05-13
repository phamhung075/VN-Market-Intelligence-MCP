# BA — Notebook

**Last updated:** 2026-05-12 | **Sprint:** 1879

## Current state

REQ_1898a spec complete. Spec at docs/REQ_1898a.md. No PO blockers. Ready for dev-mcp-server.

## Last session summary (2026-05-13) — 1898a

Task 1898a — get_market_snapshot returns wrong data (electricity / portfolio content).

Key findings:
- Bug has self-healed post-restart. Live gateway now returns correct HOSE/HNX/UPCOM data (VCB 60,100 VND, ACB 22,500 VND, VN-Index 1,898.37).
- Root is a stale deployed build, NOT a code-level dispatch collision. Source at marketTools.ts:79-273 is correct.
- `server.ts` creates a fresh `McpServer` per `POST /mcp` request — all handlers re-registered from compiled `.js` on every call. Stale build = stale handler on every call until container rebuild.
- No tool name collision in registry (registerMarketTools=index 6, registerEnergyTools=index 50, both have distinct names: `get_market_snapshot` vs `get_energy_grid_signals`).
- Shared root with 1903a (get_macro_snapshot returning portfolio data): both are stale-build artifacts, both cleared on restart. 1898a scope = response-shape test guard. 1903a scope = broader dispatch hardening.
- Fix is test-only: add response shape assertions to 084-tool-market.test.ts and 089-tool-macro.test.ts. No production code changes needed.
- get_macro_snapshot shape assertions included in 1898a scope (same root, 2 lines of test) — 1903a handles the broader family.

## Prior session summary (2026-05-12) — 1879

## Last session summary (2026-05-12) — 1879

Sprint 1879 — EFFR-IORB FRED fetcher + get_fed_liquidity_spread() MCP tool. Layer 2.D liquidity microstructure.

Key findings:
- FRED fetching lives in `apps/mcp-server`, NOT `apps/macro-indicators`. Apps/macro-indicators is a standalone commodity/SBV Hono microservice (port 5004) with no FRED client and no scheduler.
- Existing `fredApi.ts` handles `FEDFUNDS` (monthly). New fetcher handles `EFFR` + `IORB` (daily).
- `tracked_indicators` dedup is UNIQUE(indicator, source) = single latest row. Daily time-series needs NEW table `fred_series_daily` with UNIQUE(series, date).
- All CSV rows parsed (not just last row) to enable backfill on first run.
- Scheduler hook: piggyback on existing `macroIndicatorRefreshJob` (0 6 * * *) — no new cron entry.
- Domain: `computeFedLiquiditySpread()` pure function in `domain/services/macro/fedLiquiditySpread.ts` — zero infra imports. Trend slope is OLS over sample index.
- Spread convention: IORB - EFFR (positive = abundance, negative = stress).
- No FRED API key needed — public CSV endpoint confirmed by existing fetcher.
- 10 TDD tests total (6 fetcher + 5 tool). No PO blockers.

## Prior session summary (2026-05-12) — 1878a

Sprint 1878a — OCF column migration spec.

Key findings:
- `vnstock_cash_flow` table EXISTS, `operating_cf_bn REAL` (billions VND). `storeCashFlow()` already populates it.
- `financial_reports` already has `operating_cf` (from BCTC OCR). New column `operating_cash_flow` is a distinct signal (vnstock API).
- Critical: unit conversion `operating_cf_bn * 1000` required — tỷ VND -> triệu VND to match all other financial_reports scalars.
- Bridge mapper pattern: `bridgeOCFToFinancialReports(db, ticker)` in vnstockStore.ts, called at end of `storeCashFlow()`.
- Annual rows (period_quarter IS NULL) SKIP — vnstock provides quarterly only.
- `backfillAllOCF(db)` needed for historical rows already in financial_reports before bridge was wired.
- NULLABLE column (no DEFAULT 0) — 0 would corrupt accruals formula.
- 7 TDD tests specified (idempotency, unit conversion, annual skip, no-match, trigger, backfill, quarter=0 edge case).
- No PO blockers. One low-priority architect question: DDD placement of bridge (infra vs app layer).

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
