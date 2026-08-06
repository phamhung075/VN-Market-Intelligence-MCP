# Alert Commander — Notebook

**Last updated:** 2026-08-06 06:35 UTC | **Sprint:** GUARD-COWORK-NOTEBOOK-AGENTS-SELF-EDIT-FLOW-DOC

**Role:** Event-only alert dispatch (position-danger / watchlist-opportunity / CRITICAL-always) | **Cadence:** `*/15min` market hours (02:00–08:30 UTC) + 4h critical sweep | **Contract:** APPEND class, one `## c<NNN>` section per cycle per `.claude/skills/notebook-write/SKILL.md` AC-6.

> **Structural reset (FIX-ALERT-COMMANDER-NOTEBOOK-SINGLE-BLOB-UNPRUNABLE, 2026-07-29):** prior history archived → `docs/agent-memory/notebooks/archive/alert-commander-archive-20260729.md`. One top-level `## c<NNN> · <ISO-timestamp>` section per cycle now.

## c44 · 2026-08-05T12:10:11Z (slot=alert-commander-critical, tick=12:03)
- Signals: `get_agent_signals(status=all, hours_back=2)` clean ("Không có tín hiệu mới" — 08:xx carryover rows now >3h old, outside window) | Fired: 0 | Suppressed: 0 | MARKET: 0
- ChainCatalyst: none in window — no action.
- Position-danger: `get_alerts(type=price)` clean, no stopLossHit — gate fails 1/3 (market closed since 08:59Z, no new price action).
- Watchlist-opp: no BUY-qualifying bus signal, no kinhDich trigger — gate fails.
- CRITICAL-always: legal_risk clean (days=1/hours_back=6), crisis_early_warning clean (no velocity breach; reputation DANGER PLX=22, WARNING BID=39 deteriorating/SHB=37 deteriorating + BSR/DIG/EIB/FPT/FRT/GEX/HPG/NVL/SAB/VCB/VJC/VRE — same tier as prior), no verified_chain.
- Regime: NEUTRAL (fallback — macro_snapshot JSON shape, investment-clock score=8/CORE_VN) | Carry: NEUTRAL (1.37%) | vol_regime ELEVATED (rv_20d_pctile=0.789) | Pivot window: false (next Sept 2026, GSO CPI today not flagged pivot)
- Market CLOSED (outside 02:00-08:59 UTC weekday window, VN-Index 1776.46 flat at last close) — tick-snapshot hit (cycle-snapshot-12:03.json, ~5min fresh) for macro+context; macro_calendar/agent_signals/alerts/vol/liquidity/foreign_room/legal_risk/crisis called live. `get_vn_liquidity_state` omo+interbank blocked (HTML parse fail/VPS unreachable, honest-NULL, same as prior). Silent exit — no MARKET/WORK send. `log_agent_work` id=1768.

## c45 · 2026-08-05T16:05:37Z (slot=alert-commander-critical, tick=16:03)
- Signals: `get_agent_signals(status=all, hours_back=2)` clean ("Không có tín hiệu mới") | Fired: 0 | Suppressed: 0 | MARKET: 0
- ChainCatalyst: none in window — no action.
- Position-danger: `get_alerts(type=price)` clean, no stopLossHit — gate fails 1/3 (market closed since 08:59Z).
- Watchlist-opp: no BUY-qualifying bus signal, no kinhDich trigger — gate fails.
- CRITICAL-always: legal_risk clean (days=1/hours_back=6), crisis_early_warning clean (no velocity breach; reputation DANGER PLX=22, WARNING BID/BSR/DIG/EIB/FPT/FRT/GEX/HPG/NVL/SAB/SHB/VCB/VJC/VRE — same tier as prior), no verified_chain.
- Regime: NEUTRAL (fallback — macro_snapshot JSON shape, investment-clock score=8/CORE_VN) | Carry: NEUTRAL (1.37%) | vol_regime ELEVATED (rv_20d_pctile=0.789) | Pivot window: false (next Sept 2026)
- Market CLOSED (VN-Index 1776.46 flat at last close) — tick-snapshot hit (cycle-snapshot-16:03.json, ~1min fresh) for macro+context; macro_calendar/agent_signals/alerts/vol/liquidity/foreign_room/legal_risk/crisis called live. `get_vn_liquidity_state` omo+interbank blocked (HTML parse fail/VPS unreachable, honest-NULL, same as prior). Silent exit — no MARKET/WORK send. `log_agent_work` id=1770.

## c46 · 2026-08-06T06:35:26Z (slot=alert-commander-market, tick=06:33)
- Signals: `get_agent_signals(status=all, hours_back=2)` clean ("Không có tín hiệu mới") | Fired: 0 | Suppressed: 0 | MARKET: 0
- ChainCatalyst: none in window — no action.
- Position-danger: `get_alerts(type=price)` clean, no stopLossHit — gate fails 1/3.
- Watchlist-opp: no BUY-qualifying bus signal, no kinhDich trigger — gate fails.
- CRITICAL-always: legal_risk clean (days=1/hours_back=6), crisis_early_warning clean (no velocity breach; reputation DANGER PLX=22 improving, WARNING BID=39/SHB=37 deteriorating + BSR/DIG/EIB/FPT/FRT/GEX/HPG/NVL/SAB/VCB/VJC/VRE — same tier as prior), no verified_chain.
- Regime: NEUTRAL (fallback — macro_snapshot JSON shape, investment-clock score=8/CORE_VN) | Carry: NEUTRAL (1.37%) | vol_regime ELEVATED (rv_20d_percentile=0.789) | Pivot window: false (next Sept 2026)
- Market OPEN (VN-Index 1776.46 Δ-0.77 flat, USD_VND 26080) — tick-snapshot hit (cycle-snapshot-06:33.json, ~1min fresh) for macro+context; macro_calendar/agent_signals/alerts/vol/liquidity/foreign_room/legal_risk/crisis called live. `get_vn_liquidity_state` omo+interbank blocked (HTML parse fail/VPS unreachable, honest-NULL, same as prior). Silent exit — no MARKET/WORK send. `log_agent_work` id=1775.
