# Alert Commander — Notebook

**Last updated:** 2026-08-12 07:53 UTC | **Sprint:** FIX-BCTC-REFINE-WINDOWTRUNCATION-COLUMNLAYOUT-CROSSWINDOW

**Role:** Event-only alert dispatch (position-danger / watchlist-opportunity / CRITICAL-always) | **Cadence:** `*/15min` market hours (02:00–08:30 UTC) + 4h critical sweep | **Contract:** APPEND class, one `## c<NNN>` section per cycle per `.claude/skills/notebook-write/SKILL.md` AC-6.

> **Structural reset (FIX-ALERT-COMMANDER-NOTEBOOK-SINGLE-BLOB-UNPRUNABLE, 2026-07-29):** prior history archived → `docs/agent-memory/notebooks/archive/alert-commander-archive-20260729.md`. One top-level `## c<NNN> · <ISO-timestamp>` section per cycle now.

## c123 · 2026-08-12T07:25:30Z (slot=alert-commander-market, tick=07:25)
- Signals: bus 1 total (hours_back=2) — 1 verified_decision (VNM id10734, dup ack tied to already-fired c114 story, unchanged since c122); 0 new urgent_news/price_anomaly/verified_chain/chain_catalyst/legal_risk/crisis_velocity | Fired: 0 | Suppressed: 0 new | MARKET: none. No fresh `CYCLE_SNAPSHOT` (latest tick 06:45 stale) — direct MCP calls (`get_cycle_bootstrap` sighted, gateway healthy).
- Watchlist-opp: VNM already fired c114 (2026-08-12T05:05Z); id10734 dup ack of same story — no re-fire. No other new candidate.
- ChainCatalyst: 0 in bus — no re-`record_signal_outcome`.
- Position-danger: `get_alerts(type=price)` clean (no active alerts), no stopLossHit — gate fails.
- CRITICAL-always: `get_legal_risk_signals(days=1,hours_back=6)` clean, `get_crisis_early_warning` clean (WARNING x10 corp-reputation unchanged: BID/BSR/DPM/FPT/FRT/HUT/PLX/SSI/VHM/VNM, no DANGER-tier), no verified_chain in bus.
- Regime: NEUTRAL (fallback — macro_snapshot text has no Global-Liquidity line; carry.regime=NEUTRAL, carrySpread=1.37pp) | vol NORMAL (rv_20d_pctile=0.74, gk_vol_20d_pct=18.64) | foreign_room market_saturation=5.94% (outflow_z_5d=0.79) | `get_vn_liquidity_state` OMO/interbank blocked (unchanged) — logged [SKIP], standard thresholds used | Pivot window: false (pivotWindowWarning=null, next Sept 2026). Market OPEN, VN-Index 1791.03 +17.62 up. Silent exit — no MARKET/WORK send. `log_agent_work` id=1910.

## c124 · 2026-08-12T07:39:40Z (slot=alert-commander-market, tick=07:40)
- Signals: bus 2 total (hours_back=2) — 2 verified_decision, neither a consumed type: VNM id10734 (dup ack, unchanged since c122/c123) + FRT id10736 (price_surge +5.80%, new this cycle) | Fired: 0 | Suppressed: 1 new (FRT) | MARKET: none. No fresh `CYCLE_SNAPSHOT` (latest tick 06:45 stale) — direct MCP calls.
- Watchlist-opp: FRT crossed watchlist +5% up-threshold (154.000, +5.12%/+5.80% intraday) — checked directly via `get_kinhdich_reading(code=FRT)`: signal=GIU (HOLD), not BUY, 100% confidence — condition 2/4 fails regardless of confidence/news → suppressed, no re-fire needed. VNM already fired c114 (2026-08-12T05:05Z); id10734 dup ack of same story — no re-fire.
- ChainCatalyst: 0 in bus — no re-`record_signal_outcome`.
- Position-danger: `get_alerts(type=price)` clean (no active alerts), no stopLossHit — gate fails.
- CRITICAL-always: `get_legal_risk_signals(days=1,hours_back=6)` clean, `get_crisis_early_warning` clean (WARNING x10 corp-reputation unchanged: BID/BSR/DPM/FPT/FRT/HUT/PLX/SSI/VHM/VNM, no DANGER-tier), no verified_chain in bus.
- Regime: NEUTRAL (fallback — macro_snapshot text has no Global-Liquidity line; carry.regime=NEUTRAL, carrySpread=1.37pp) | vol NORMAL (rv_20d_pctile=0.72, gk_vol_20d_pct=18.69) | foreign_room market_saturation=5.94% (outflow_z_5d=0.81) | `get_vn_liquidity_state` OMO/interbank blocked (unchanged) — logged [SKIP], standard thresholds used | Pivot window: false (pivotWindowWarning=null, next Sept 2026). Market OPEN, VN-Index 1787.29 +0.78% up, breadth 152/150. Silent exit — no MARKET/WORK send. `log_agent_work` id=1911.

## c125 · 2026-08-12T07:53:15Z (slot=alert-commander-market, tick=07:55)
- Signals: bus 2 total (hours_back=2) — 2 verified_decision, neither new: VNM id10734 (dup ack, unchanged since c122) + FRT id10736 (price_surge +5.80%, already evaluated+suppressed at c124) | Fired: 0 | Suppressed: 0 new | MARKET: none. No fresh `CYCLE_SNAPSHOT` (latest tick 06:45 stale) — direct MCP calls.
- Watchlist-opp: FRT already suppressed c124 (kinhDich GIU, not BUY) — no re-check needed. VNM already fired c114; id10734 dup ack — no re-fire. No other new candidate.
- ChainCatalyst: 0 in bus — no re-`record_signal_outcome`.
- Position-danger: `get_alerts(type=price)` clean (no active alerts), no stopLossHit — gate fails.
- CRITICAL-always: `get_legal_risk_signals(days=1,hours_back=6)` clean, `get_crisis_early_warning` clean (WARNING x10 corp-reputation unchanged: BID/BSR/DPM/FPT/FRT/HUT/PLX/SSI/VHM/VNM, no DANGER-tier), no verified_chain in bus.
- Regime: NEUTRAL (fallback — macro_snapshot text has no Global-Liquidity line; carry.regime=NEUTRAL, carrySpread=1.37pp) | vol NORMAL (rv_20d_pctile=0.75, gk_vol_20d_pct=18.61) | foreign_room market_saturation=5.94% (outflow_z_5d=0.81) | `get_vn_liquidity_state` OMO/interbank blocked (unchanged) — logged [SKIP], standard thresholds used | Pivot window: false (pivotWindowWarning=null, next Sept 2026). Market OPEN, VN-Index 1793.18 +19.77 up. Silent exit — no MARKET/WORK send. `log_agent_work` id=1912.
