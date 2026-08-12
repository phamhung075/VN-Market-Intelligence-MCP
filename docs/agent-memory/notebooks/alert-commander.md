# Alert Commander — Notebook

**Last updated:** 2026-08-12 07:25 UTC | **Sprint:** FIX-BCTC-REFINE-WINDOWTRUNCATION-COLUMNLAYOUT-CROSSWINDOW

**Role:** Event-only alert dispatch (position-danger / watchlist-opportunity / CRITICAL-always) | **Cadence:** `*/15min` market hours (02:00–08:30 UTC) + 4h critical sweep | **Contract:** APPEND class, one `## c<NNN>` section per cycle per `.claude/skills/notebook-write/SKILL.md` AC-6.

> **Structural reset (FIX-ALERT-COMMANDER-NOTEBOOK-SINGLE-BLOB-UNPRUNABLE, 2026-07-29):** prior history archived → `docs/agent-memory/notebooks/archive/alert-commander-archive-20260729.md`. One top-level `## c<NNN> · <ISO-timestamp>` section per cycle now.

## c121 · 2026-08-12T06:51:12Z (slot=alert-commander-market, tick=06:45)
- Signals: bus 3 total (hours_back=2) — 3 verified_decision (FPT id10728 + SAB id10729 + VNM id10730, all unchanged since c118-c120, same detected_at 04:55:48Z) | Fired: 0 | Suppressed: 0 new | MARKET: none. `CYCLE_SNAPSHOT` hit (tick 06:45, <5min fresh).
- Watchlist-opp: VNM (10730) already fired c114 (2026-08-12T05:05Z), unchanged, no re-fire (cooldown=0 fires once per genuine trigger). FPT/SAB unchanged-failed kinhDich (carried state, no re-query since signal content unchanged) — no new candidate.
- ChainCatalyst: 0 in bus this cycle — no re-`record_signal_outcome`.
- Position-danger: `get_alerts(type=price)` clean (no active alerts), no stopLossHit — gate fails.
- CRITICAL-always: `get_legal_risk_signals(days=1,hours_back=6)` clean, `get_crisis_early_warning` clean (WARNING x10 corp-reputation unchanged: BID/BSR/DPM/FPT/FRT/HUT/PLX/SSI/VHM/VNM, no DANGER-tier), no verified_chain in bus.
- Regime: NEUTRAL (fallback — macro_snapshot text has no Global-Liquidity line; carry.regime=NEUTRAL, carrySpread=1.37pp) | `get_volatility_indicators` 500 error (TA service internal error) — logged [SKIP] | `get_vn_liquidity_state` error unchanged: `{"error":"macro-indicators service unavailable"}` — logged [SKIP], standard thresholds used | foreign_room market_saturation=5.94% (outflow_z_5d=0.76) | Pivot window: false (pivotWindowWarning=null, next Sept 2026). Market OPEN. Silent exit — no MARKET/WORK send. `log_agent_work` id=1908.

## c122 · 2026-08-12T07:10:10Z (slot=alert-commander-market, tick=07:10)
- Signals: bus 1 total (hours_back=2) — 1 verified_decision (VNM id10734, dup ack tied to already-fired c114 story, not a new consumable signal); 0 new urgent_news/price_anomaly/verified_chain/chain_catalyst/legal_risk/crisis_velocity | Fired: 0 | Suppressed: 0 new | MARKET: none. No fresh `CYCLE_SNAPSHOT` (latest tick 06:45 >7min stale) — direct MCP calls.
- Watchlist-opp: VNM already fired c114 (2026-08-12T05:05Z); 06:48 recap headline ("DN Nhà nước tăng vốn 163%...") is same underlying "NN tăng vốn 50.000 tỷ" story — no re-fire (cooldown=0 fires once per genuine trigger). No other new candidate.
- ChainCatalyst: 0 in bus — no re-`record_signal_outcome`.
- Position-danger: `get_alerts(type=price)` clean (no active alerts), no stopLossHit — gate fails.
- CRITICAL-always: `get_legal_risk_signals(days=1,hours_back=6)` clean, `get_crisis_early_warning` clean (no crisis; WARNING x10 corp-reputation unchanged: BID/BSR/DPM/FPT/FRT/HUT/PLX/SSI/VHM/VNM, no DANGER-tier), no verified_chain in bus.
- Regime: NEUTRAL (fallback — macro_snapshot text has no Global-Liquidity line) | carry.regime=UNKNOWN this cycle (spread unavailable, fixture-suppressed per DSI-INV-1, diverges from prior 1.37pp reads) | vol NORMAL (rv_20d_pctile=0.73, gk_vol_20d_pct=18.67) | foreign_room market_saturation=5.94% (outflow_z_5d=0.77) | `get_vn_liquidity_state` OMO/interbank blocked (unchanged) — logged [SKIP], standard thresholds used | Pivot window: false (pivotWindowWarning=null, next Sept 2026). Market OPEN, VN-Index 1789.59 +0.91% up, breadth 133/171. Silent exit — no MARKET/WORK send. `log_agent_work` id=1909.

## c123 · 2026-08-12T07:25:30Z (slot=alert-commander-market, tick=07:25)
- Signals: bus 1 total (hours_back=2) — 1 verified_decision (VNM id10734, dup ack tied to already-fired c114 story, unchanged since c122); 0 new urgent_news/price_anomaly/verified_chain/chain_catalyst/legal_risk/crisis_velocity | Fired: 0 | Suppressed: 0 new | MARKET: none. No fresh `CYCLE_SNAPSHOT` (latest tick 06:45 stale) — direct MCP calls (`get_cycle_bootstrap` sighted, gateway healthy).
- Watchlist-opp: VNM already fired c114 (2026-08-12T05:05Z); id10734 dup ack of same story — no re-fire. No other new candidate.
- ChainCatalyst: 0 in bus — no re-`record_signal_outcome`.
- Position-danger: `get_alerts(type=price)` clean (no active alerts), no stopLossHit — gate fails.
- CRITICAL-always: `get_legal_risk_signals(days=1,hours_back=6)` clean, `get_crisis_early_warning` clean (WARNING x10 corp-reputation unchanged: BID/BSR/DPM/FPT/FRT/HUT/PLX/SSI/VHM/VNM, no DANGER-tier), no verified_chain in bus.
- Regime: NEUTRAL (fallback — macro_snapshot text has no Global-Liquidity line; carry.regime=NEUTRAL, carrySpread=1.37pp) | vol NORMAL (rv_20d_pctile=0.74, gk_vol_20d_pct=18.64) | foreign_room market_saturation=5.94% (outflow_z_5d=0.79) | `get_vn_liquidity_state` OMO/interbank blocked (unchanged) — logged [SKIP], standard thresholds used | Pivot window: false (pivotWindowWarning=null, next Sept 2026). Market OPEN, VN-Index 1791.03 +17.62 up. Silent exit — no MARKET/WORK send. `log_agent_work` id=1910.
