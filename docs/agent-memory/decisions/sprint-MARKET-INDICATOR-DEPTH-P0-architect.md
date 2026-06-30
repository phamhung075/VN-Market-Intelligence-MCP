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

### STEP architect-S3 · architect · 2026-06-30T05:30Z
**task-id:** BA-IND-P1-MOMENTUM-FRONTEND
**what-done:** Brownfield analysis for 2-zone P1 momentum frontend surface; ratified M1/M2/M3/M4; full DDD file map; risk flags emitted; PM split recommendation.
**what-considered:**
- M1 GaugeCard: Option A (export from route) → route cross-import violates Remix isolation; Option C (inline duplicate) → 50L dead copy, maintenance debt; Option B (extract to components/) → architecturally correct placement.
- M2 formatRSComposite: Option B (shared util) → premature for 1 consumer; Option A (co-located in dashboard.momentum.tsx) → mirrors P0 pattern exactly.
- M3 source_tier: none of 4 response types carry source_tier; compute-on-read from SQLite → tier 3 endpoint-assigned, consistent with buildVolatilitySection pattern.
- M4 low_sample_warning: suppress vs badge vs detail row — detail row is lowest coupling, honest transparency, no visual clutter of second badge.
**why-decision:** Option B for GaugeCard (correct DDD placement; no route cross-coupling). Option A for formatRSComposite (YAGNI — only 1 consumer now). source_tier=3 endpoint-assigned (no source field in any of 4 client responses). low_sample_warning as detail row (transparent, low-coupling).
**why-change:** KEY divergence from P0: P1 handler takes no `db` param (all sources are remote HTTP). BA spec confirms this; risk flag emitted for dev to read.

### STEP architect-S4 · architect · 2026-06-30T08:30Z
**task-id:** FIX-OHLCV-DEPTH-PERSIST-DAILY-OHLCV-2YR
**what-done:** RAW-confirmed 0 pre-2026-04-23 bars across 1431 tickers in live named volume; identified dual-path silent failure in VPS backfill pipeline; emitted brief with 5 sub-tasks.
**what-considered:**
- H1 startup purge (purgeStrandedSeedRows) — only deletes vol=0 AND O=H=L=C; real bars survive; ruled out as primary
- H2 scheduled retention DELETE — no such code in any scheduler; ruled out
- H3 VPS done=1 masking (ohlcv-backfill-poll.sh marks done regardless of exit code) + taOhlcvBackfillJob TA_MIN_ROWS=35 skips all 49-bar tickers
**why-decision:** 457 done=1 queue entries + 0 historical bars is definitive proof of silent VPS failure; file:line confirmed: ohlcv-backfill-poll.sh:70-79 and taOhlcvBackfillJob.ts:46.
**why-change:** durable fix requires VPS script hardening + server-side depth verification + observability layer; not just a threshold tweak.
