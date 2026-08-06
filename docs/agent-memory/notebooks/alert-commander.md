# Alert Commander — Notebook

**Last updated:** 2026-08-06 07:07 UTC | **Sprint:** GUARD-COWORK-NOTEBOOK-AGENTS-SELF-EDIT-FLOW-DOC

**Role:** Event-only alert dispatch (position-danger / watchlist-opportunity / CRITICAL-always) | **Cadence:** `*/15min` market hours (02:00–08:30 UTC) + 4h critical sweep | **Contract:** APPEND class, one `## c<NNN>` section per cycle per `.claude/skills/notebook-write/SKILL.md` AC-6.

> **Structural reset (FIX-ALERT-COMMANDER-NOTEBOOK-SINGLE-BLOB-UNPRUNABLE, 2026-07-29):** prior history archived → `docs/agent-memory/notebooks/archive/alert-commander-archive-20260729.md`. One top-level `## c<NNN> · <ISO-timestamp>` section per cycle now.

## c46 · 2026-08-06T06:35:26Z (slot=alert-commander-market, tick=06:33)
- Signals: `get_agent_signals(status=all, hours_back=2)` clean ("Không có tín hiệu mới") | Fired: 0 | Suppressed: 0 | MARKET: 0
- ChainCatalyst: none in window — no action.
- Position-danger: `get_alerts(type=price)` clean, no stopLossHit — gate fails 1/3.
- Watchlist-opp: no BUY-qualifying bus signal, no kinhDich trigger — gate fails.
- CRITICAL-always: legal_risk clean (days=1/hours_back=6), crisis_early_warning clean (no velocity breach; reputation DANGER PLX=22 improving, WARNING BID=39/SHB=37 deteriorating + BSR/DIG/EIB/FPT/FRT/GEX/HPG/NVL/SAB/VCB/VJC/VRE — same tier as prior), no verified_chain.
- Regime: NEUTRAL (fallback — macro_snapshot JSON shape, investment-clock score=8/CORE_VN) | Carry: NEUTRAL (1.37%) | vol_regime ELEVATED (rv_20d_percentile=0.789) | Pivot window: false (next Sept 2026)
- Market OPEN (VN-Index 1776.46 Δ-0.77 flat, USD_VND 26080) — tick-snapshot hit (cycle-snapshot-06:33.json, ~1min fresh) for macro+context; macro_calendar/agent_signals/alerts/vol/liquidity/foreign_room/legal_risk/crisis called live. `get_vn_liquidity_state` omo+interbank blocked (HTML parse fail/VPS unreachable, honest-NULL, same as prior). Silent exit — no MARKET/WORK send. `log_agent_work` id=1775.

## c47 · 2026-08-06T07:01:48Z (slot=alert-commander-market, tick=07:00)
- Signals: `get_agent_signals(status=all, hours_back=2)` — 7 VERIFIED_DECISION (alert-engine output, not a consumed signal_type): DGC price_surge+6.91%, HUT FDI news_mention, HUT/VHM TA breakout_down+oversold, NVL breakout_up | Fired: 0 | Suppressed: 0 | MARKET: 0
- ChainCatalyst: none in window — no action.
- Position-danger: `get_alerts(type=price)` clean, no stopLossHit — gate fails 1/3.
- Watchlist-opp: no BUY-qualifying bus signal, no kinhDich trigger — gate fails.
- CRITICAL-always: legal_risk clean (days=1/hours_back=6), crisis_early_warning clean (no velocity breach; reputation DANGER PLX=22 improving, WARNING BID=39 deteriorating/SHB=37 deteriorating + BSR/DIG/EIB/FPT/FRT/GEX/HPG/NVL/SAB/VCB/VJC/VRE — same tier as prior), no verified_chain.
- Regime: NEUTRAL (fallback — macro_snapshot JSON shape, investment-clock score=8/CORE_VN) | Carry: NEUTRAL (1.37%) | vol_regime ELEVATED (rv_20d_percentile=0.782) | Pivot window: false (next Sept 2026)
- Market OPEN (VN-Index 1771.09 Δ-5.37 down, USD_VND 26070) — no snapshot file for exact tick 07:00, direct MCP calls used for bootstrap/macro/context/vol/liquidity/foreign_room/legal_risk/crisis. `get_vn_liquidity_state` omo+interbank blocked (HTML parse fail/VPS unreachable, honest-NULL, same as prior). Silent exit — no MARKET/WORK send. `log_agent_work` id=1776.

## c48 · 2026-08-06T07:07:21Z (slot=alert-commander-market, tick=07:04)
- Signals: `get_agent_signals(status=all, hours_back=2)` — 7 VERIFIED_DECISION (alert-engine output, not a consumed signal_type): DGC price_surge+6.91%, HUT FDI news_mention, HUT/VHM TA breakout_down+oversold, NVL breakout_up | Fired: 0 | Suppressed: 0 | MARKET: 0
- ChainCatalyst: none in window — no action.
- Position-danger: `get_alerts(type=price)` clean, no stopLossHit — gate fails.
- Watchlist-opp: no BUY-qualifying bus signal, no kinhDich trigger — gate fails.
- CRITICAL-always: legal_risk clean (days=1/hours_back=6), crisis_early_warning clean (no velocity breach; reputation DANGER PLX=22 improving, WARNING BID=39 deteriorating/SHB=37 deteriorating + BSR/DIG/EIB/FPT/FRT/GEX/HPG/NVL/SAB/VCB/VJC/VRE — same tier as c47), no verified_chain.
- Regime: NEUTRAL (fallback — macro_snapshot JSON shape, no literal REGIME field) | Carry: NEUTRAL (1.37%) | vol_regime ELEVATED (rv_20d_percentile=0.782) | Pivot window: false (next Sept 2026)
- Market OPEN (VN-Index 1770.63 Δ-5.83 down, USD_VND 26070) — tick-snapshot hit (cycle-snapshot-07:04.json, ~1.5min fresh) for macro+context; macro_calendar/agent_signals/alerts/vol/liquidity/foreign_room/legal_risk/crisis called live. foreign_room outflow_z_5d=0.82, avg_util=9.7% — not exhausted. `get_vn_liquidity_state` omo+interbank blocked (HTML parse fail/VPS unreachable, honest-NULL, same as prior). Silent exit — no MARKET/WORK send. `log_agent_work` id=1777.
