# Alert Commander — Notebook

**Last updated:** 2026-08-12 06:51 UTC | **Sprint:** FACTORY-APP-split-pollNews

**Role:** Event-only alert dispatch (position-danger / watchlist-opportunity / CRITICAL-always) | **Cadence:** `*/15min` market hours (02:00–08:30 UTC) + 4h critical sweep | **Contract:** APPEND class, one `## c<NNN>` section per cycle per `.claude/skills/notebook-write/SKILL.md` AC-6.

> **Structural reset (FIX-ALERT-COMMANDER-NOTEBOOK-SINGLE-BLOB-UNPRUNABLE, 2026-07-29):** prior history archived → `docs/agent-memory/notebooks/archive/alert-commander-archive-20260729.md`. One top-level `## c<NNN> · <ISO-timestamp>` section per cycle now.

## c119 · 2026-08-12T06:19:00Z (slot=alert-commander-market, tick=06:15)
- Signals: bus 4 total (hours_back=2) — 4 verified_decision (VCB id10726 + FPT id10728 + SAB id10729 + VNM id10730, all unchanged since c114-c118); 0 chain_catalyst (10722-10724 still off rolling 2h bus TTL, last seen c117) | Fired: 0 | Suppressed: 0 new | MARKET: none.
- Watchlist-opp: VNM (10730) already fired c114 (2026-08-12T05:05Z), unchanged, no re-fire (cooldown=0 fires once per genuine trigger). FPT/SAB/VCB unchanged-failed kinhDich (c115/c114/c112: GIỮ 100%/GIU 0%/GIU 38%) — no re-query, unchanged carried state.
- ChainCatalyst: 0 in window — no re-`record_signal_outcome`.
- Position-danger: `get_alerts(type=price)` clean (no active alerts), no stopLossHit — gate fails.
- CRITICAL-always: `get_legal_risk_signals(days=1,hours_back=6)` clean, `get_crisis_early_warning` clean (WARNING x10 corp-reputation unchanged: BID/BSR/DPM/FPT/FRT/HUT/PLX/SSI/VHM/VNM, no DANGER-tier), no verified_chain in bus.
- Regime: NEUTRAL (fallback — macro_snapshot text has no Global-Liquidity line; carry.regime=NEUTRAL, carrySpread=1.37pp) | vol NORMAL (rv_20d_pctile=0.72, gk_vol_20d_pct=18.69) | foreign_room market_saturation=5.94% (outflow_z_5d=0.73) | `get_vn_liquidity_state` error unchanged: `{"error":"macro-indicators service unavailable"}` — logged [SKIP], standard thresholds used | Pivot window: false (pivotWindowWarning=null, next Sept 2026). Market OPEN, VN-Index 1788.13 +14.72 up (source_tier1 live). Silent exit — no MARKET/WORK send. `log_agent_work` id=1906.

## c120 · 2026-08-12T06:33:32Z (slot=alert-commander-market, tick=06:30)
- Signals: bus 3 total (hours_back=2) — 3 verified_decision (FPT id10728 + SAB id10729 + VNM id10730, all unchanged since c114-c119); VCB id10726 rolled off 2h bus TTL (created 04:23, now >2h back), last seen c119; 0 chain_catalyst (10722-10724 still off rolling 2h bus TTL, last seen c117) | Fired: 0 | Suppressed: 0 new | MARKET: none. `CYCLE_SNAPSHOT` hit (tick 06:30, <5min fresh).
- Watchlist-opp: VNM (10730) already fired c114 (2026-08-12T05:05Z), unchanged, no re-fire (cooldown=0 fires once per genuine trigger). FPT/SAB unchanged-failed kinhDich (carried state, no re-query since signal content unchanged) — no new candidate.
- ChainCatalyst: 0 in window — no re-`record_signal_outcome`.
- Position-danger: `get_alerts(type=price)` clean (no active alerts), no stopLossHit — gate fails.
- CRITICAL-always: `get_legal_risk_signals(days=1,hours_back=6)` clean, `get_crisis_early_warning` clean (WARNING x10 corp-reputation unchanged: BID/BSR/DPM/FPT/FRT/HUT/PLX/SSI/VHM/VNM, no DANGER-tier), no verified_chain in bus.
- Regime: NEUTRAL (fallback — macro_snapshot text has no Global-Liquidity line; carry.regime=NEUTRAL, carrySpread=1.37pp) | vol NORMAL (rv_20d_pctile=0.74, gk_vol_20d_pct=18.63) | foreign_room market_saturation=5.94% (outflow_z_5d=0.75) | `get_vn_liquidity_state` error unchanged: `{"error":"macro-indicators service unavailable"}` — logged [SKIP], standard thresholds used | Pivot window: false (pivotWindowWarning=null, next Sept 2026). Market OPEN, VN-Index 1792.26 +18.85 up (source_tier1 live). Silent exit — no MARKET/WORK send. `log_agent_work` id=1907.

## c121 · 2026-08-12T06:51:12Z (slot=alert-commander-market, tick=06:45)
- Signals: bus 3 total (hours_back=2) — 3 verified_decision (FPT id10728 + SAB id10729 + VNM id10730, all unchanged since c118-c120, same detected_at 04:55:48Z) | Fired: 0 | Suppressed: 0 new | MARKET: none. `CYCLE_SNAPSHOT` hit (tick 06:45, <5min fresh).
- Watchlist-opp: VNM (10730) already fired c114 (2026-08-12T05:05Z), unchanged, no re-fire (cooldown=0 fires once per genuine trigger). FPT/SAB unchanged-failed kinhDich (carried state, no re-query since signal content unchanged) — no new candidate.
- ChainCatalyst: 0 in bus this cycle — no re-`record_signal_outcome`.
- Position-danger: `get_alerts(type=price)` clean (no active alerts), no stopLossHit — gate fails.
- CRITICAL-always: `get_legal_risk_signals(days=1,hours_back=6)` clean, `get_crisis_early_warning` clean (WARNING x10 corp-reputation unchanged: BID/BSR/DPM/FPT/FRT/HUT/PLX/SSI/VHM/VNM, no DANGER-tier), no verified_chain in bus.
- Regime: NEUTRAL (fallback — macro_snapshot text has no Global-Liquidity line; carry.regime=NEUTRAL, carrySpread=1.37pp) | `get_volatility_indicators` 500 error (TA service internal error) — logged [SKIP] | `get_vn_liquidity_state` error unchanged: `{"error":"macro-indicators service unavailable"}` — logged [SKIP], standard thresholds used | foreign_room market_saturation=5.94% (outflow_z_5d=0.76) | Pivot window: false (pivotWindowWarning=null, next Sept 2026). Market OPEN. Silent exit — no MARKET/WORK send. `log_agent_work` id=1908.
