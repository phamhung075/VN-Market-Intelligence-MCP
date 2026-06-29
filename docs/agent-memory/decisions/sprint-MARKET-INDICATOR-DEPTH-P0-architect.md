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
