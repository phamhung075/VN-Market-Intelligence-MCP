# Alert Commander — Notebook

**Last updated:** 2026-08-12 08:10 UTC | **Sprint:** FIX-BCTC-SSC-DOC-SELECTION-QUARTER-BLIND-ALWAYS-LATEST

**Role:** Event-only alert dispatch (position-danger / watchlist-opportunity / CRITICAL-always) | **Cadence:** `*/15min` market hours (02:00–08:30 UTC) + 4h critical sweep | **Contract:** APPEND class, one `## c<NNN>` section per cycle per `.claude/skills/notebook-write/SKILL.md` AC-6.

> **Structural reset (FIX-ALERT-COMMANDER-NOTEBOOK-SINGLE-BLOB-UNPRUNABLE, 2026-07-29):** prior history archived → `docs/agent-memory/notebooks/archive/alert-commander-archive-20260729.md`. One top-level `## c<NNN> · <ISO-timestamp>` section per cycle now.

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

## c126 · 2026-08-12T08:10:12Z (slot=alert-commander-critical, tick=08:10)
- Signals: bus 3 total (hours_back=2) — 3 verified_decision, 1 new: VIC id10738 (Vingroup market-cap +54.000ty/logo-change news_mention) | VNM id10734 dup unchanged since c122; FRT id10736 already-suppressed c124 | Fired: 0 | Suppressed: 1 new (VIC) | MARKET: none. No fresh `CYCLE_SNAPSHOT` (tick-specific 08:xx.json absent/tmp-only) — direct MCP calls (`get_cycle_bootstrap` sighted, gateway healthy).
- Watchlist-opp: VIC checked directly via `get_kinhdich_reading(code=VIC)`: signal=GIU (HOLD), not BUY, 38% confidence — condition 2/4 fails regardless of newsSentiment (RECENT ANALYSIS score:10.0 up) → suppressed. VNM already fired c114, FRT already suppressed c124 — no re-check needed.
- ChainCatalyst: 0 in bus — no re-`record_signal_outcome`.
- Position-danger: `get_alerts(type=price)` clean (no active alerts), no stopLossHit — gate fails.
- CRITICAL-always: `get_legal_risk_signals(days=1,hours_back=6)` clean, `get_crisis_early_warning` clean (WARNING x10 corp-reputation unchanged: BID/BSR/DPM/FPT/FRT/HUT/PLX/SSI/VHM/VNM, no DANGER-tier), no verified_chain in bus.
- Regime: NEUTRAL (fallback — macro_snapshot text has no Global-Liquidity line; carry.regime=NEUTRAL, carrySpread=1.37pp) | vol NORMAL (rv_20d_pctile=0.75, gk_vol_20d_pct=18.61) | foreign_room market_saturation=5.94% (outflow_z_5d=0.81) | `get_vn_liquidity_state` error (macro-indicators service unavailable) — logged [SKIP], standard thresholds used | Pivot window: false (pivotWindowWarning=null). Market OPEN, VN-Index 1793.18 +19.77 up. Silent exit — no MARKET/WORK send. `log_agent_work` id=1913.

## c126 · 2026-08-12T08:10:24Z (slot=alert-commander-market, tick=08:10)
- Signals: bus 3 total (hours_back=2) — 3 verified_decision, 1 new: VIC id10738 (news_mention, "Vốn hóa Vingroup tăng thêm 54.000 tỷ đồng sau khi đổi logo", NEW this cycle) + VNM id10734 (dup ack, unchanged since c114 fire/c122-125) + FRT id10736 (unchanged, already suppressed c124) | Fired: 0 | Suppressed: 1 new (VIC) | MARKET: none. No fresh `CYCLE_SNAPSHOT` (latest tick 06:45 stale, >1h old) — direct MCP calls (`get_cycle_bootstrap` sighted, gateway healthy).
- Watchlist-opp: VIC checked directly via `get_kinhdich_reading(code=VIC)`: signal=GIU (HOLD), not BUY, 37-38% confidence — conditions 1+2/4 fail (needs ≥70 BUY) despite bullish news (RECENT ANALYSIS score:10.0 up, matching driving story) and 1/1 bullish bus signal → suppressed, no re-fire needed. VNM already fired c114; FRT already suppressed c124 — neither re-checked.
- ChainCatalyst: 0 in bus — no re-`record_signal_outcome`.
- Position-danger: `get_alerts(type=price)` clean (no active alerts), no stopLossHit — gate fails.
- CRITICAL-always: `get_legal_risk_signals(days=1,hours_back=6)` clean, `get_crisis_early_warning` clean (WARNING x10 corp-reputation unchanged: BID/BSR/DPM/FPT/FRT/HUT/PLX/SSI/VHM/VNM, no DANGER-tier), no verified_chain in bus.
- Regime: NEUTRAL (fallback — macro_snapshot JSON shape has no REGIME field; carry.regime=NEUTRAL, carrySpread=1.37pp) | vol NORMAL (rv_20d_pctile=0.746, gk_vol_20d_pct=18.61) | foreign_room market_saturation=5.94% (outflow_z_5d=0.81) | `get_vn_liquidity_state` error ("macro-indicators service unavailable") — logged [SKIP], standard thresholds used | Pivot window: false (pivotWindowWarning=null, next Sept 2026). Market OPEN, VN-Index 1793.18 +19.77 up. Silent exit — no MARKET/WORK send. `log_agent_work` id=1914.
