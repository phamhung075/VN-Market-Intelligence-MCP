# Alert Commander — Notebook

**Last updated:** 2026-08-07 08:26 UTC | **Sprint:** idle

**Role:** Event-only alert dispatch (position-danger / watchlist-opportunity / CRITICAL-always) | **Cadence:** `*/15min` market hours (02:00–08:30 UTC) + 4h critical sweep | **Contract:** APPEND class, one `## c<NNN>` section per cycle per `.claude/skills/notebook-write/SKILL.md` AC-6.

> **Structural reset (FIX-ALERT-COMMANDER-NOTEBOOK-SINGLE-BLOB-UNPRUNABLE, 2026-07-29):** prior history archived → `docs/agent-memory/notebooks/archive/alert-commander-archive-20260729.md`. One top-level `## c<NNN> · <ISO-timestamp>` section per cycle now.

## c81 · 2026-08-07T08:12:04Z (slot=alert-commander-market, tick=08:10)
- Signals: bus 6 total, all VERIFIED_DECISION (non-consumed): 10445 VNM news_mention carryover, 10446 HUT BB-breakdown, 10447 NVL BB-breakout, 10448 VIC news_mention, 10449 PLX price_surge, 10450 VNM price_surge | 0 chain_catalyst/urgent_news/price_anomaly/verified_chain/legal_risk/crisis_velocity — no Step 3/3b/3c input.
- CYCLE_SNAPSHOT hit: `cycle-snapshot-08:08.json` (created 08:09:05Z, 85s fresh) — market_context+macro_snapshot from snapshot; `get_agent_signals` still called direct per live clarification.
- Position-danger: `get_alerts(type=price)` clean, no active alerts, no stopLossHit; max singleDayDrop VHM -5.32% (>5% but stopLossHit=false, gate needs all 3) — gate fails.
- Watchlist-opp: fresh `get_kinhdich_reading` VNM(GIU 38%)/PLX(GIU 38%)/BSR(MUA 38%)/BID(GIU 38%)/VHM(GIU 100%, wrong direction) — none clear kinhDichConfidence≥70 with BUY signal simultaneously — gate fails.
- CRITICAL-always: `get_legal_risk_signals(days=1,hours_back=6)` clean, `get_crisis_early_warning` clean (no crisis indicator; reputation DANGER PLX=20 stable, WARNING x14 incl BID=35.0 deteriorating), no verified_chain in bus.
- Regime: NEUTRAL (fallback, macro_snapshot text has no Global-Liquidity line; carry.regime=UNKNOWN explicit) | Carry: UNKNOWN→treated NEUTRAL (DSI-INV-1) | vol ELEVATED (rv_20d_pctile=0.779, gk_vol_20d_pct=19.5) | Pivot window: false (pivotWindowWarning=null, next Sept 2026). Market OPEN, VN-Index 1768.06 (+0.19%). Silent exit — no MARKET/WORK send. `log_agent_work` id=1822.

## c82 · 2026-08-07T08:14:29Z (slot=alert-commander-critical, tick=08:10, concurrent w/ peer c81 alert-commander-market same tick — independent 4h-sweep dispatch, own tool-call trace)
- Signals: bus 8 total (direct `get_agent_signals`) — 6 VERIFIED_DECISION (non-consumed): 10445 VNM/10446 HUT/10447 NVL/10448 VIC/10449 PLX price_surge/10450 VNM price_surge | 1 urgent_news 10451 VNM (impact 6/10, no conviction field — evaluated direct vs Firing Gate per field-opacity note) | 1 chain_catalyst 10452 "Oil rises — Strait of Hormuz reopening plans" (regime_adj_score=7→conf 0.70 < NEUTRAL threshold 0.75, no stock_code) → suppressed before reaching carve-out sector-specificity test. `record_signal_outcome(10452, suppressed)`.
- ChainCatalyst: 0 fired | 1 suppressed | event_types: [oil/geopolitical-macro, sub-threshold]
- Position-danger: `get_alerts(type=price)` clean, no active alerts, no stopLossHit; max singleDayDrop VHM -5.32% (>5% but stopLossHit=false) — gate fails.
- Watchlist-opp: fresh `get_kinhdich_reading` VNM(GIU 38%)/PLX(GIU 38%) — both fail kinhDichSignal=BUY requirement despite VNM+5.08%/PLX+6.68% intraday — gate fails.
- CRITICAL-always: `get_legal_risk_signals(days=1,hours_back=6)` clean, `get_crisis_early_warning` clean (no crisis indicator; reputation DANGER PLX=20 stable, WARNING x15 incl BID=35.0/VIC=42.3 deteriorating), no verified_chain in bus.
- Regime: NEUTRAL (fallback, macro_snapshot text has no Global-Liquidity line; carry.regime=UNKNOWN explicit) | Carry: UNKNOWN→treated NEUTRAL (DSI-INV-1) | vol ELEVATED (rv_20d_pctile=0.779, gk_vol_20d_pct=19.5) | Pivot window: false (pivotWindowWarning=null, next Sept 2026). Market OPEN, VN-Index 1768.06 (+3.28/+0.19%). Silent exit — no MARKET/WORK send. `log_agent_work` id=1824.

## c83 · 2026-08-07T08:26:00Z (slot=alert-commander-market, tick=08:24)
- Signals: bus 9 total — 6 VERIFIED_DECISION (non-consumed): 10445 VNM/10446 HUT/10447 NVL/10448 VIC/10449 PLX price_surge/10450 VNM price_surge | 1 urgent_news 10451 VNM (impact 6/10, no conviction field) | 2 chain_catalyst both sub-threshold: 10452 Oil/Hormuz (regime_adj_score=7→conf 0.70 < 0.75, no stock_code) + 10453 Banking NPL headwind (regime_adj_score=5→conf 0.50 < 0.75, no stock_code) → both suppressed. `record_signal_outcome(10452, suppressed)` + `record_signal_outcome(10453, suppressed)`.
- ChainCatalyst: 0 fired | 2 suppressed | event_types: [oil/geopolitical-macro sub-threshold, banking-sector-headwind sub-threshold]
- Position-danger: `get_alerts(type=price)` clean, no active alerts, no stopLossHit; max singleDayDrop VHM -5.32% (>5% but stopLossHit=false) — gate fails.
- Watchlist-opp: fresh `get_kinhdich_reading` VNM(GIU 38%)/PLX(GIU 38%)/NVL(GIU 100%, wrong signal)/BSR(MUA 38%, low conf)/VHM(GIU 100%, wrong signal) — none clear kinhDichConfidence≥70 AND BUY simultaneously — gate fails.
- CRITICAL-always: `get_legal_risk_signals(days=1,hours_back=6)` clean, `get_crisis_early_warning` clean (no crisis indicator; DANGER PLX=20 stable, WARNING x15 incl BID=35.0/VIC=42.3/FRT=45.0/HPG=44.0 deteriorating), no verified_chain in bus.
- Regime: NEUTRAL (fallback, macro_snapshot text has no Global-Liquidity line; carry.regime=UNKNOWN explicit) | Carry: UNKNOWN→treated NEUTRAL (DSI-INV-1) | vol ELEVATED (rv_20d_pctile=0.779, gk_vol_20d_pct=19.5) | Pivot window: false (pivotWindowWarning=null, next Sept 2026). Market OPEN, VN-Index 1768.06 (+3.28/+0.19%). Silent exit — no MARKET/WORK send. `log_agent_work` id=1825.
