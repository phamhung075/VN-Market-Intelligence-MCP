# Alert Commander — Notebook

**Last updated:** 2026-08-06 08:23 UTC | **Sprint:** CCATO-MCP-T4-SIGNAL-WRITER

**Role:** Event-only alert dispatch (position-danger / watchlist-opportunity / CRITICAL-always) | **Cadence:** `*/15min` market hours (02:00–08:30 UTC) + 4h critical sweep | **Contract:** APPEND class, one `## c<NNN>` section per cycle per `.claude/skills/notebook-write/SKILL.md` AC-6.

> **Structural reset (FIX-ALERT-COMMANDER-NOTEBOOK-SINGLE-BLOB-UNPRUNABLE, 2026-07-29):** prior history archived → `docs/agent-memory/notebooks/archive/alert-commander-archive-20260729.md`. One top-level `## c<NNN> · <ISO-timestamp>` section per cycle now.

## c52 · 2026-08-06T08:09:12Z (slot=alert-commander-market, tick=08:06)
- Signals: `get_agent_signals(status=all, hours_back=2)` — 8 VERIFIED_DECISION (alert-engine output, not a consumed signal_type): DGC price_surge+6.91% ×2, HUT FDI news_mention, HUT/VHM TA breakout_down+oversold, NVL breakout_up | Fired: 0 | Suppressed: 0 | MARKET: 0
- ChainCatalyst: none in window — no action.
- Position-danger: `get_alerts(type=price)` clean, no stopLossHit — gate fails.
- Watchlist-opp: no BUY-qualifying bus signal, no kinhDich trigger — gate fails.
- CRITICAL-always: legal_risk clean (days=1/hours_back=6), crisis_early_warning clean (no velocity breach; reputation DANGER PLX=22 improving, WARNING BID=39/SHB=37 deteriorating + BSR/DIG/EIB/FPT/FRT/GEX/HPG/NVL/SAB/VCB/VJC/VRE — same tier as c51), no verified_chain.
- Regime: NEUTRAL (fallback — macro_snapshot JSON shape, no literal REGIME field) | Carry: NEUTRAL (1.37%) | vol_regime ELEVATED (rv_20d_percentile=0.786) | Pivot window: false (next Sept 2026)
- Market OPEN (VN-Index 1764.78 Δ-11.68 down, USD_VND 26040) — tick-snapshot hit (cycle-snapshot-08:06.json, ~45s fresh) for macro+context; macro_calendar/agent_signals/alerts/vol/liquidity/foreign_room/legal_risk/crisis called live. foreign_room outflow_z_5d=1.01, avg_util=9.7% — not exhausted. `get_vn_liquidity_state` omo+interbank blocked (HTML parse fail/VPS unreachable, honest-NULL, same as prior). Silent exit — no MARKET/WORK send. `log_agent_work` id=1781.

## c53 · 2026-08-06T08:10:08Z (slot=alert-commander-critical, tick=08:07)
- Signals: `get_agent_signals(status=all, hours_back=2)` — 8 VERIFIED_DECISION (alert-engine output, not a consumed signal_type): DGC price_surge+6.91% ×2, HUT FDI news_mention, HUT/VHM TA breakout_down+oversold, NVL breakout_up | Fired: 0 | Suppressed: 0 | MARKET: 0
- ChainCatalyst: none in window — no action.
- Position-danger: `get_alerts(type=price)` clean, no stopLossHit — gate fails.
- Watchlist-opp: no BUY-qualifying bus signal, no kinhDich trigger — gate fails.
- CRITICAL-always (this slot's scope): `get_legal_risk_signals(days=1,hours_back=6)` clean, `get_crisis_early_warning()` no velocity breach (reputation DANGER PLX=22 improving, WARNING BID=39/SHB=37 deteriorating + BSR/DIG/EIB/FPT/FRT/GEX/HPG/NVL/SAB/VCB/VJC/VRE — same tier as c52), no verified_chain, no chain_catalyst.
- Regime: NEUTRAL (fallback — macro_snapshot JSON shape, no literal REGIME field) | Carry: NEUTRAL (1.37%) | vol_regime ELEVATED (rv_20d_percentile=0.786) | Pivot window: false (next Sept 2026)
- Market OPEN (VN-Index 1764.78 Δ-11.68 down, USD_VND 26040) — no fresh tick-snapshot file for 08:07/08:10, direct MCP calls used for macro_calendar/alerts/vol/liquidity/foreign_room/legal_risk/crisis/agent_signals. Peer alert-commander-market cycle (c52, same file, log_agent_work id=1781) landed ~1min prior with matching clean CRITICAL-always result — this cycle is the independent alert-commander-critical (4h sweep) slot invocation, evaluates same data window, concurrence expected (parallel_group=alerts). foreign_room outflow_z_5d=1.01, avg_util=9.7% — not exhausted. `get_vn_liquidity_state` omo+interbank blocked (HTML parse fail/VPS unreachable, honest-NULL, same as prior). Silent exit — no MARKET/WORK send. `log_agent_work` id=1782.

## c54 · 2026-08-06T08:23:40Z (slot=alert-commander-market, tick=08:20)
- Signals: `get_agent_signals(status=all, hours_back=2)` — 7 VERIFIED_DECISION (DGC price_surge+6.91% ×2, HUT FDI news_mention, HUT/VHM TA breakout_down+oversold, NVL breakout_up) + 1 chain_catalyst (gold, id10459) + 1 urgent_news (DGC, id10460, confidence_score=null) | Fired: 0 | Suppressed: 1 | MARKET: 0
- ChainCatalyst: gold safe-haven (id10459, conf 0.8 ≥ 0.75 NEUTRAL threshold, no stock_code) — mixed pillars (COC:headwind vs EPS:tailwind), direction not explicitly bearish, "banking margins" framing partly sector-specific not market-wide, no named external catalyst (war/tariff/sanctions) — fails market-wide-advisory carve-out → `record_signal_outcome(10459, suppressed)`.
- urgent_news DGC (id10460): confidence_score=null — cannot clear 0.60 threshold; 3b price_anomaly override checked (`get_agent_signals` price_anomaly hours_back=2) — no DGC hits, no override applied.
- Position-danger: `get_alerts(type=price)` clean, no stopLossHit — gate fails.
- Watchlist-opp: no BUY-qualifying bus signal, no kinhDich trigger — gate fails.
- CRITICAL-always: legal_risk clean (days=1/hours_back=6), crisis_early_warning clean (no velocity breach; reputation DANGER PLX=22 improving, WARNING BID=39/SHB=37 deteriorating + 11 others same tier as c53), no verified_chain.
- Regime: NEUTRAL (fallback — macro_snapshot JSON shape, no literal REGIME field) | Carry: NEUTRAL (1.37%) | vol_regime ELEVATED (rv_20d_percentile=0.786) | Pivot window: false (next Sept 2026)
- Market OPEN (VN-Index 1764.78 Δ-0.66% down, breadth 104up/209down, turnover -25.9%, USD_VND 26040) — no fresh tick-snapshot file for 08:20, direct MCP calls used for bootstrap/macro/calendar/alerts/vol/liquidity/foreign_room/legal_risk/crisis/agent_signals/market_snapshot. foreign_room outflow_z_5d=1.01, avg_util=9.7% — not exhausted. `get_vn_liquidity_state` omo+interbank blocked (HTML parse fail/VPS unreachable, honest-NULL, same as prior). Silent exit — no MARKET/WORK send. `log_agent_work` id=1784.
