# Decision Journal — Sprint MARKET-INDICATOR-DEPTH-P0 · ba

**Sprint goal:** 5 P0 indicator families + Sprint-0 OHLCV backfill + breadth time-series for MARKET-INDICATOR-DEPTH-P0
**Agent:** ba
**Started:** 2026-06-29T20:23:00Z

---

### STEP ba-S2 · ba · 2026-06-30T04:37Z
**task-id:** BA-IND-P1-MOMENTUM-FRONTEND
**what-done:** Wrote FR/NFR spec for 2-zone delivery: Zone A = mcp-server REST aggregator GET /api/momentum-indicators (FR-A1..A8); Zone B = frontend proxy + 4 dashboard cards + TopNav + tests (FR-B1..B6). 4 ARCH-RATIFY items (non-blocking). 0 PO blockers.
**what-considered:**
- (A) Unified spec with no zone split → rejected (ZONE=MULTI directive requires explicit boundary for architect SPLIT)
- (B) Pre-mint coverage-map LIVE rows now → rejected (PO Decision 3 AC-4 explicitly forbids; GAP rows are the AC, LIVE flip at QA gate)
- (C) GaugeCard reuse vs inline → flagged ARCH-RATIFY-M1 (non-blocking); BA recommends shared component Option B
- (D) source_tier for TA/stock-price responses: no field in client types → assigned 3 (compute), flagged ARCH-RATIFY-M3
**why-decision:** Zone-explicit structure mirrors BA-IND-P1-MOMENTUM-RS precedent and PO Decision 3 wording; architect SPLITs into per-zone briefs. All 4 clients.ts functions confirmed (lines 299/352/414/467); no schema change needed.
**why-change:** No change from PO Decision 3 plan — 2 deliverables, clients.ts data layer only, Promise.allSettled, HTTP 200 always, honest-NULL passthrough.

---

### STEP ba-S1 · ba · 2026-06-29T20:23:00Z
**task-id:** BA-INDICATOR-DEPTH-P0
**what-done:** Produced full requirement spec for MARKET-INDICATOR-DEPTH-P0 — 7 deliverables (Sprint-0 backfill + 5 P0 indicators + breadth), 5 PO blockers, gauge-readiness contract, DDD layer mapping. Written to docs/handoffs/BA-MARKET-INDICATOR-DEPTH-P0.md.
**what-considered:**
- OMO DB location: (A) macro-indicators own SQLite (zone-clean) vs (B) shared market.db (cross-zone access) — DEFERRED to PO/architect as ARCH-RATIFY-OMO-1.
- Insider free-float normalization: (A) market_cap_bn proxy (on-hand, simpler) vs (B) actual free-float shares (requires new data field) — CHOSE (A) for P0 with explicit ARCH-RATIFY-INS-1 flag.
- Sprint-0 dispatch mode: (A) inside PM decomposition vs (B) separate parallel task — RECOMMENDED (B) so backfill can run concurrently with P0-2/3/4/5 which have no OHLCV dependency.
- Breadth history_quality labels: considered numeric day count only vs labelled tiers — CHOSE BOTH (accruing_since + sessions_accrued + SUFFICIENT/WARMUP/INSUFFICIENT) for consumer clarity.
**why-decision:** All 6 items derived from REAL on-hand data (daily_ohlcv, vnstock_trading_stats, rag_analyses, insider_transactions, SBV HTML, vnmarket_prices). No fabrication path opened. Gauge-ready scalars named explicitly per P1 contract.
**why-change:** no change from roadmap §5 scope; spec faithfully transposes PO vision + roadmap §3 into FR/NFR/edge-case format with DDD layer assignments.
