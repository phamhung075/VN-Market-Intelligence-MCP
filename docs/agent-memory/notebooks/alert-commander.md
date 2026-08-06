# Alert Commander — Notebook

**Last updated:** 2026-08-06 08:09 UTC | **Sprint:** CCATO-MCP-T4-SIGNAL-WRITER

**Role:** Event-only alert dispatch (position-danger / watchlist-opportunity / CRITICAL-always) | **Cadence:** `*/15min` market hours (02:00–08:30 UTC) + 4h critical sweep | **Contract:** APPEND class, one `## c<NNN>` section per cycle per `.claude/skills/notebook-write/SKILL.md` AC-6.

> **Structural reset (FIX-ALERT-COMMANDER-NOTEBOOK-SINGLE-BLOB-UNPRUNABLE, 2026-07-29):** prior history archived → `docs/agent-memory/notebooks/archive/alert-commander-archive-20260729.md`. One top-level `## c<NNN> · <ISO-timestamp>` section per cycle now.

## c50 · 2026-08-06T07:38:38Z (slot=alert-commander-market, tick=07:36)
- Signals: `get_agent_signals(status=all, hours_back=2)` — 7 VERIFIED_DECISION (alert-engine output, not a consumed signal_type): DGC price_surge+6.91%, HUT FDI news_mention, HUT/VHM TA breakout_down+oversold, NVL breakout_up | Fired: 0 | Suppressed: 0 | MARKET: 0
- ChainCatalyst: none in window — no action.
- Position-danger: `get_alerts(type=price)` clean, no stopLossHit — gate fails.
- Watchlist-opp: no BUY-qualifying bus signal, no kinhDich trigger — gate fails.
- CRITICAL-always: legal_risk clean (days=1/hours_back=6), crisis_early_warning clean (no velocity breach; reputation DANGER PLX=22 improving, WARNING BID=39/SHB=37 deteriorating + BSR/DIG/EIB/FPT/FRT/GEX/HPG/NVL/SAB/VCB/VJC/VRE — same tier as c49), no verified_chain.
- Regime: NEUTRAL (fallback — macro_snapshot JSON shape, no literal REGIME field) | Carry: NEUTRAL (1.37%) | vol_regime ELEVATED (rv_20d_percentile=0.782) | Pivot window: false (next Sept 2026)
- Market OPEN (VN-Index 1765.84 Δ-10.62 down, USD_VND 26040) — no snapshot file for exact tick 07:36, direct MCP calls used for bootstrap/macro/context/vol/liquidity/foreign_room/legal_risk/crisis. foreign_room outflow_z_5d=0.98, avg_util=9.7% — not exhausted. `get_vn_liquidity_state` omo+interbank blocked (HTML parse fail/VPS unreachable, honest-NULL, same as prior). Silent exit — no MARKET/WORK send. `log_agent_work` id=1779.

## c51 · 2026-08-06T07:52:18Z (slot=alert-commander-market, tick=07:51)
- Signals: `get_agent_signals(status=all, hours_back=2)` — 7 VERIFIED_DECISION (alert-engine output, not a consumed signal_type): DGC price_surge+6.91%, HUT FDI news_mention, HUT/VHM TA breakout_down+oversold, NVL breakout_up | Fired: 0 | Suppressed: 0 | MARKET: 0
- ChainCatalyst: none in window — no action.
- Position-danger: `get_alerts(type=price)` clean, no stopLossHit — gate fails.
- Watchlist-opp: no BUY-qualifying bus signal, no kinhDich trigger — gate fails.
- CRITICAL-always: legal_risk clean (days=1/hours_back=6), crisis_early_warning clean (no velocity breach; reputation DANGER PLX=22 improving, WARNING BID=39/SHB=37 deteriorating + BSR/DIG/EIB/FPT/FRT/GEX/HPG/NVL/SAB/VCB/VJC/VRE — same tier as c50), no verified_chain.
- Regime: NEUTRAL (fallback — macro_snapshot JSON shape, no literal REGIME field) | Carry: NEUTRAL (1.37%) | vol_regime ELEVATED (rv_20d_percentile=0.786) | Pivot window: false (next Sept 2026)
- Market OPEN (VN-Index 1764.78 Δ-11.68 down, USD_VND 26040) — no snapshot file for exact tick 07:51, direct MCP calls used for bootstrap/macro/context/vol/liquidity/foreign_room/legal_risk/crisis. foreign_room outflow_z_5d=1.01, avg_util=9.7% — not exhausted. `get_vn_liquidity_state` omo+interbank blocked (HTML parse fail/VPS unreachable, honest-NULL, same as prior). Silent exit — no MARKET/WORK send. `log_agent_work` id=1780.

## c52 · 2026-08-06T08:09:12Z (slot=alert-commander-market, tick=08:06)
- Signals: `get_agent_signals(status=all, hours_back=2)` — 8 VERIFIED_DECISION (alert-engine output, not a consumed signal_type): DGC price_surge+6.91% ×2, HUT FDI news_mention, HUT/VHM TA breakout_down+oversold, NVL breakout_up | Fired: 0 | Suppressed: 0 | MARKET: 0
- ChainCatalyst: none in window — no action.
- Position-danger: `get_alerts(type=price)` clean, no stopLossHit — gate fails.
- Watchlist-opp: no BUY-qualifying bus signal, no kinhDich trigger — gate fails.
- CRITICAL-always: legal_risk clean (days=1/hours_back=6), crisis_early_warning clean (no velocity breach; reputation DANGER PLX=22 improving, WARNING BID=39/SHB=37 deteriorating + BSR/DIG/EIB/FPT/FRT/GEX/HPG/NVL/SAB/VCB/VJC/VRE — same tier as c51), no verified_chain.
- Regime: NEUTRAL (fallback — macro_snapshot JSON shape, no literal REGIME field) | Carry: NEUTRAL (1.37%) | vol_regime ELEVATED (rv_20d_percentile=0.786) | Pivot window: false (next Sept 2026)
- Market OPEN (VN-Index 1764.78 Δ-11.68 down, USD_VND 26040) — tick-snapshot hit (cycle-snapshot-08:06.json, ~45s fresh) for macro+context; macro_calendar/agent_signals/alerts/vol/liquidity/foreign_room/legal_risk/crisis called live. foreign_room outflow_z_5d=1.01, avg_util=9.7% — not exhausted. `get_vn_liquidity_state` omo+interbank blocked (HTML parse fail/VPS unreachable, honest-NULL, same as prior). Silent exit — no MARKET/WORK send. `log_agent_work` id=1781.
