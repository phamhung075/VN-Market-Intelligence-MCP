# Decision Journal — Sprint MARKET-INDICATOR-DEPTH-P0 · architect

**Sprint goal:** Add 5 P0 indicator families + breadth time-series + Sprint-0 OHLCV backfill. No fake data. Gauge-ready scalar fields for P1 Fear & Greed.
**Agent:** architect
**Started:** 2026-06-29T21:10Z

---

### STEP architect-S1 · architect · 2026-06-29T21:10Z
**task-id:** ARCH-MARKET-INDICATOR-DEPTH-P0
**what-done:** Produced full technical blueprint for 7 P0 deliverables across 4 zones; ratified 3 open design decisions (OMO-1, INS-1, B4 cron); emitted risk flags; assigned DDD layers + file paths.
**what-considered:**
- ARCH-RATIFY-OMO-1: Option A (macro own SQLite) vs Option B (shared market.db). B has precedent (macro_vmt_cache), but each exception erodes single-writer invariant further; A is 4 lines of Go code.
- P0-2 event writer: dev-stock-price (Go, no market.db write) vs mcp-server (already the single writer). Stock-price can't write market.db directly — relocating detection to vnstockFundamentalsJob collapses a cross-service write.
- Separate get_omo_curve tool: no known consumer in P0 needs time-series history directly. Defer to P1; extend get_vn_liquidity_state additively now.
**why-decision:** Option A for OMO (zone-clean, 4-line change, no new write exception to market.db). Event detection in mcp-server (single writer rule). get_omo_curve deferred (YAGNI for P0).
**why-change:** B4 cron assigned 37 8 * * 1-5 (verified free; +7 from :30 pile-up per Lever C pattern).

### STEP architect-S2 · architect · 2026-06-30T02:00Z
**task-id:** BA-IND-P1-MOMENTUM-RS
**what-done:** Brownfield analysis + full technical blueprint for 4 P1 momentum/RS tools across 2 zones; resolved all 5 ARCH-RATIFY items via live code probe; emitted 9 risk flags; assigned DDD file paths; corrected 2 critical BA data-source errors.
**what-considered:**
- ARCH-RATIFY-FAR-1: vnstock_trading_stats vs daily_ohlcv for foreign flow — probed schema-financial-reports.ts; daily_ohlcv is the correct source (vnstock_trading_stats has NO buy/sell vol columns).
- ARCH-RATIFY-RS-1: VNINDEX code confirmed "VNINDEX" via ohlcvHistoryBackfillJob.ts VNINDEX_CODE constant; vn_index_cache is latest-only, daily_ohlcv holds history.
- Factor-return persistence: compute-on-read wins (no new table, no schema churn; P1 perf acceptable).
- RouterConfig struct vs positional params for NewRouter() expansion.
**why-decision:** daily_ohlcv is the single correct source for per-day foreign_buy_vol/foreign_sell_vol (probed live). Compute-on-read for factor-return (YAGNI). RouterConfig struct deferred — flow positional args acceptable for 3 new UCs; can refactor in P2 if needed.
**why-change:** BA spec had 2 source-errors (vnstock_trading_stats for flow; ROOM_LOCKED label for event_type). Both corrected here with live schema evidence. ROOM_FULL/ROOM_REOPEN is the actual enum.
