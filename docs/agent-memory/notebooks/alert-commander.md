# Alert Commander — Notebook

**Last updated:** 2026-08-25 16:08 UTC | **Sprint:** FIX-PDFX-TESSERACT-CONFIDENCE-MEAN-OVER-NONEMPTY-MASKS-TOTAL-PAGE-MISS

**Role:** Event-only alert dispatch (position-danger / watchlist-opportunity / CRITICAL-always) | **Cadence:** `*/15min` market hours (02:00–08:30 UTC) + 4h critical sweep | **Contract:** APPEND class, one `## c<NNN>` section per cycle per `.claude/skills/notebook-write/SKILL.md` AC-6.

> **Structural reset (FIX-ALERT-COMMANDER-NOTEBOOK-SINGLE-BLOB-UNPRUNABLE, 2026-07-29):** prior history archived → `docs/agent-memory/notebooks/archive/alert-commander-archive-20260729.md`. One top-level `## c<NNN> · <ISO-timestamp>` section per cycle now.

## c255 · 2026-08-25T08:11:39Z (slot=alert-commander-critical, tick=08:05)
- Signals: tick-snapshot hit 08:05 (fresh) → `$CYCLE_SNAPSHOT.macro_snapshot`; 6 explicit signal_type queries found urgent_news×2 (VIC id11338, VPB id11339 — both posted ~08:08 by news-scout, AFTER peer c254's earlier bus read) + chain_catalyst×2 (gold-surge id11340, Iran-sanctions/trade_war id11341). Fired: 1 | Suppressed: 3 | MARKET: 1 (market-wide advisory).
- ChainCatalyst: 1 fired | 1 suppressed | id11341 [geopolitical:trade_war] Iran sanctions, no ticker, regime_adj_score=9.0→0.90≥0.75 NEUTRAL threshold, breadth 88↑/222↓ corroborates bearish framing → MARKET carve-out ticker=VNINDEX. id11340 gold-surge: no ticker, no tagged external catalyst, ambiguous direction → suppressed.
- Watchlist-opp: VIC urgent_news kinhDich=GIU(100%) not BUY → suppressed. VPB urgent_news not in watchlist, no kinhDich reading → suppressed. Gate fails both, no fire.
- Position-danger: `get_alerts(type=price)` clean; no stopLossHit/singleDayDrop>5% candidate.
- CRITICAL-always: legal_risk/verified_chain/crisis_velocity all clean (bus + dedicated tools).
- Regime: NEUTRAL(fallback, no Global-Liquidity line) | carry NEUTRAL 1.37pp | vol NORMAL | Pivot window TRUE. VN-Index 1791.41(+0.15%), breadth 88↑/222↓/58= (HOSE). MARKET sent 08:11:39Z: "[VN thị trường] Mỹ siết trừng phạt Iran…". Verdict id=10316095-b540-47a1-ab6b-140cd7c039d9 pending. Marker `published:alert-commander-market:2026-08-25T08:00Z` claimed (TTL 900s). `log_agent_work` id=2137.

## c256 · 2026-08-25T12:08:48Z (slot=alert-commander-critical, tick=12:00)
- Signals: no fresh tick-snapshot (no cycle-snapshot-12:07.json exact-tick match; 12:05.json ignored per exact-match rule) → direct `get_cycle_bootstrap` + `get_macro_snapshot` (JSON shape, text field present) + `get_macro_calendar` + `get_market_context`(6h) + `get_agent_signals`(agent,2h) + chain_catalyst/price_anomaly explicit filters. Only bus hit: freshness-sla-monitor `urgent_news` id11394 (infra SLA-breach noise, not real market news) → suppressed per standing rule. No candidate ticker. Fired: 0 | Suppressed: 1 | MARKET: none. Gateway healthy (Step 0-GW probe OK, single attempt).
- ChainCatalyst: 0 fired | 0 suppressed | no chain_catalyst signal in window.
- Watchlist-opp: 0 candidates (no ticker-named signal this cycle) → gate fails, no fire.
- Position-danger: `get_alerts(type=price)` clean ("Không có cảnh báo nào đang hoạt động"); no stopLossHit/singleDayDrop>5% candidate.
- CRITICAL-always: `get_legal_risk_signals(days=1,hours_back=6)` clean; bus carries no `legal_risk`/`verified_chain`/`crisis_velocity`. `get_crisis_early_warning` primary indicator clean; corp-reputation sub-50: BSR24.0(danger)/PLX34.0(warning)/VCB46.5(warning) deteriorating, not itself CRITICAL.
- Regime: NEUTRAL (fallback — macro_snapshot JSON shape has no Global-Liquidity line; carry.regime=NEUTRAL, carrySpread=1.37pp, source_tier=2) | vol NORMAL (rv_20d_pctile=0.4036, gk_vol_20d_pct=16.01, drawdown_252d=16.38%) | `get_vn_liquidity_state` errored (macro-indicators service unavailable, honest-SKIP) | `get_foreign_room` market_saturation_pct=24.25% (top-10 tickers; VCB room_utilization=66.93% highest, outflow_z_5d=-1.48) | Pivot window: TRUE (pivotWindowWarning: "Entering pivot window September 2026 in 7 days"). VN-Index 1791.41(+2.63), VN market CLOSED (outside 02:00-08:59 UTC). Silent exit — no MARKET/WORK send. `log_agent_work` id=2140.

## c257 · 2026-08-25T16:08:08Z (slot=alert-commander-critical, tick=16:00)
- Signals: no fresh tick-snapshot (no cycle-snapshot-16:06.json exact-tick match; 16:04.json ignored per exact-match rule) → direct `get_cycle_bootstrap` + `get_macro_snapshot` (JSON shape, text field present) + `get_macro_calendar` + `get_market_context`(6h) + `get_alerts`(price) + `get_agent_signals`(agent,2h,status=all) → "Không có tín hiệu mới" (aggregate empty, all 6 consumed types zero). No candidate ticker. Fired: 0 | Suppressed: 0 | MARKET: none. Gateway healthy (Step 0-GW probe OK, single attempt).
- ChainCatalyst: 0 fired | 0 suppressed | no chain_catalyst signal in window.
- Watchlist-opp: 0 candidates (no ticker-named signal this cycle) → gate fails, no fire.
- Position-danger: `get_alerts(type=price)` clean ("Không có cảnh báo nào đang hoạt động"); no stopLossHit/singleDayDrop>5% candidate.
- CRITICAL-always: `get_legal_risk_signals(days=1,hours_back=6)` clean; bus carries no `legal_risk`/`verified_chain`/`crisis_velocity`. `get_crisis_early_warning` primary indicator clean ("Không có tín hiệu khủng hoảng nào"); corp-reputation sub-50: BSR24.0(danger)/PLX34.0(warning)/VCB46.5(warning) deteriorating, unchanged from c256, not itself CRITICAL.
- Regime: NEUTRAL (fallback — macro_snapshot JSON shape has no Global-Liquidity line; carry.regime=NEUTRAL, carrySpread=1.37pp, source_tier=2) | vol NORMAL (rv_20d_pctile=0.4036, gk_vol_20d_pct=16.01, drawdown_252d=16.38%) | `get_vn_liquidity_state` OMO+interbank blocked (honest-NULL, source unreachable) | `get_foreign_room` market_saturation_pct=24.25% (top-10 tickers; VCB room_utilization=66.93% highest, outflow_z_5d=-1.48) | Pivot window: TRUE (pivotWindowWarning: "Entering pivot window September 2026 in 7 days"). VN-Index 1791.41(+2.63), VN market CLOSED (outside 02:00-08:59 UTC). Silent exit — no MARKET/WORK send. `log_agent_work` id=2142.
