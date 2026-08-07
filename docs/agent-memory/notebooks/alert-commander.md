# Alert Commander — Notebook

**Last updated:** 2026-08-07 12:13 UTC | **Sprint:** idle

**Role:** Event-only alert dispatch (position-danger / watchlist-opportunity / CRITICAL-always) | **Cadence:** `*/15min` market hours (02:00–08:30 UTC) + 4h critical sweep | **Contract:** APPEND class, one `## c<NNN>` section per cycle per `.claude/skills/notebook-write/SKILL.md` AC-6.

> **Structural reset (FIX-ALERT-COMMANDER-NOTEBOOK-SINGLE-BLOB-UNPRUNABLE, 2026-07-29):** prior history archived → `docs/agent-memory/notebooks/archive/alert-commander-archive-20260729.md`. One top-level `## c<NNN> · <ISO-timestamp>` section per cycle now.

## c84 · 2026-08-07T08:40:00Z (slot=alert-commander-market, tick=08:37)
- Signals: bus 22 total — 19 VERIFIED_DECISION (non-consumed, +13 new since c83: BID/EIB/SHB banking price_drop TB-0.76%; DIG/NVL/VRE/VHM/VIC/KBC/DXG/KDH/PDR real-estate HIGH price_drop TB-2.68% avg) | 1 urgent_news 10451 VNM (impact 6/10, no conviction field) | 2 chain_catalyst both still sub-threshold: 10452 Oil/Hormuz (conf 0.70<0.75) + 10453 Banking NPL (conf 0.50<0.75) → both suppressed again. `record_signal_outcome(10452, suppressed)` + `record_signal_outcome(10453, suppressed)`.
- ChainCatalyst: 0 fired | 2 suppressed | event_types: [oil/geopolitical-macro sub-threshold, banking-sector-headwind sub-threshold]
- Position-danger: `get_alerts(type=price)` clean, no active alerts, no stopLossHit; max singleDayDrop VHM -5.32% (>5% but stopLossHit=false) — gate fails despite 13 new real-estate/banking price_drop bus signals (none imply portfolio stopLossHit).
- Watchlist-opp: fresh `get_kinhdich_reading` VNM(GIU 38%)/PLX(GIU 38%)/NVL(GIU 100%, wrong signal)/BSR(MUA 38%, low conf)/VHM(GIU 100%, wrong signal) — none clear kinhDichConfidence≥70 AND BUY simultaneously — gate fails.
- CRITICAL-always: `get_legal_risk_signals(days=1,hours_back=6)` clean, `get_crisis_early_warning` clean (no crisis indicator; DANGER PLX=20 stable, WARNING x15 incl BID=35.0/VIC=42.3/FRT=45.0/HPG=44.0 deteriorating), no verified_chain in bus.
- Regime: NEUTRAL (fallback, macro_snapshot JSON-shape has no Global-Liquidity text line; carry.regime=UNKNOWN explicit) | Carry: UNKNOWN→treated NEUTRAL | vol ELEVATED (rv_20d_pctile=0.779, gk_vol_20d_pct=19.53) | Pivot window: false. Market OPEN, VN-Index 1768.06 (+3.28/+0.19%). Silent exit — no MARKET/WORK send. `log_agent_work` id=1826.

## c85 · 2026-08-07T08:55:50Z (slot=alert-commander-market, tick=08:54)
- Signals: bus 22 total — 19 VERIFIED_DECISION (non-consumed, unchanged since c84 — rolling 2h TTL window, no new arrivals) | 1 urgent_news 10451 VNM (impact 6/10, no conviction field) | 2 chain_catalyst both still sub-threshold: 10452 Oil/Hormuz (regime_adj_score=7→conf 0.70<0.75) + 10453 Banking NPL (regime_adj_score=5→conf 0.50<0.75), both no stock_code → suppressed again. `record_signal_outcome(10452, suppressed)` + `record_signal_outcome(10453, suppressed)`.
- ChainCatalyst: 0 fired | 2 suppressed | event_types: [oil/geopolitical-macro sub-threshold, banking-sector-headwind sub-threshold]
- Position-danger: `get_alerts(type=price)` clean, no active alerts, no stopLossHit; max singleDayDrop VHM -5.32% (>5% but stopLossHit=false) — gate fails.
- Watchlist-opp: fresh `get_kinhdich_reading` VNM(GIU 38%)/PLX(GIU 38%) — neither clears kinhDichConfidence≥70 AND BUY simultaneously — gate fails.
- CRITICAL-always: `get_legal_risk_signals(days=1,hours_back=6)` clean, `get_crisis_early_warning` clean (no crisis indicator; DANGER PLX=20 stable, WARNING x15 incl BID=35.0/EIB=38.0/VIC=42.3 deteriorating), no verified_chain in bus.
- Regime: NEUTRAL (fallback, macro_snapshot text has no Global-Liquidity line; carry.regime=UNKNOWN explicit) | Carry: UNKNOWN→treated NEUTRAL (DSI-INV-1) | vol ELEVATED (rv_20d_pctile=0.779, gk_vol_20d_pct=19.53) | Pivot window: false (pivotWindowWarning=null, next Sept 2026). Market OPEN, VN-Index 1768.06 (+3.28/+0.19%). Silent exit — no MARKET/WORK send. `log_agent_work` id=1827.

## c86 · 2026-08-07T12:13:39Z (slot=alert-commander-critical, tick=12:11)
- Signals: bus 1 total (hours_back=2) — 1 VERIFIED_DECISION HPG (non-consumed echo, not actionable). No urgent_news/chain_catalyst/price_anomaly this cycle (rolling 2h window — prior cycle's 2 chain_catalyst sub-threshold signals aged out).
- ChainCatalyst: 0 fired | 0 suppressed | event_types: [none this cycle]
- Position-danger: `get_alerts(type=price)` clean, no active alerts, no stopLossHit; VHM EOD -5.32% (>5% but stopLossHit=false) — gate fails.
- Watchlist-opp: no bullish urgent_news/chain_catalyst candidate ticker this cycle — gate fails (nothing to test).
- CRITICAL-always: `get_legal_risk_signals(days=1,hours_back=6)` clean, `get_crisis_early_warning` clean (no crisis indicator; DANGER PLX=20 stable, WARNING x14 incl BID=35.0/EIB=38.0/VIC=42.3 deteriorating), no verified_chain in bus.
- Regime: NEUTRAL (fallback, macro_snapshot text has no Global-Liquidity line; carry.regime=UNKNOWN explicit) | Carry: UNKNOWN→treated NEUTRAL (DSI-INV-1) | vol ELEVATED (rv_20d_pctile=0.779, gk_vol_20d_pct=19.53) | Pivot window: false (pivotWindowWarning=null, next Sept 2026). Market CLOSED (post 08:59 UTC). Silent exit — no MARKET/WORK send. `log_agent_work` id=1829.
