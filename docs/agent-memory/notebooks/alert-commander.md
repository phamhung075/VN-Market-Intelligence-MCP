# Alert Commander — Notebook

**Last updated:** 2026-08-07 03:34 UTC | **Sprint:** idle

**Role:** Event-only alert dispatch (position-danger / watchlist-opportunity / CRITICAL-always) | **Cadence:** `*/15min` market hours (02:00–08:30 UTC) + 4h critical sweep | **Contract:** APPEND class, one `## c<NNN>` section per cycle per `.claude/skills/notebook-write/SKILL.md` AC-6.

> **Structural reset (FIX-ALERT-COMMANDER-NOTEBOOK-SINGLE-BLOB-UNPRUNABLE, 2026-07-29):** prior history archived → `docs/agent-memory/notebooks/archive/alert-commander-archive-20260729.md`. One top-level `## c<NNN> · <ISO-timestamp>` section per cycle now.

## c61 · 2026-08-07T02:11:49Z (slot=alert-commander-market, tick=02:10)
- Signals: bus 11 total — 1 urgent_news(FPT,10402,conf=null) | 2 chain_catalyst(10403 accounts-drop conf0.70, 10404 gold-spike conf0.65, both <0.75 NEUTRAL threshold) | 6 verified_decision(BSR/PLX/VCB/HUT/VHM/DGC, non-consumed, informational) | 2 freshness-sla-monitor urgent_news SLA-breach infra noise (routine) → Fired: 0 | Suppressed: 3 (10402,10403,10404) | MARKET: 0
- ChainCatalyst: 0 fired | 2 suppressed (below regime confidence gate; 10403 also reads as domestic price-action recap not an external catalyst) | event_types: accounts-drop, gold-spike
- Position-danger: no ticker singleDayDrop>5% this session (VHM worst -4.02%) — gate fails. Watchlist-opp: DGC +6.92% surge checked via `get_kinhdich_reading` → GIU(HOLD) conf=62%, fails both confidence≥70 and signal=BUY — gate fails.
- CRITICAL-always: legal_risk clean (days=1/hours_back=6), crisis_early_warning clean (no velocity breach; reputation WARNING x14 tickers, DANGER PLX=20 unchanged), no verified_chain in bus.
- Regime: NEUTRAL (fallback, macro_snapshot JSON shape has no literal REGIME field) | Carry: UNKNOWN→treated NEUTRAL (carry inputs unavailable, DSI-INV-1 suppressed) | vol_regime ELEVATED (rv_20d_percentile=0.775) | Pivot window: false (next Sept 2026)
- Market OPEN (02:08 UTC), VN-Index 1764.78 flat, Gold +0.19% (4312.2), USD_VND 26050, Brent 83.28. No fresh tick-snapshot (nearest .tmp files empty/stale) — direct MCP calls used. `get_vn_liquidity_state` omo+interbank blocked (HTML parse fail/VPS unreachable, honest-NULL). foreign_room avg_util=9.74% (10-ticker sample) — not exhausted. Silent exit — no MARKET/WORK send. `log_agent_work` id=1783.

## c62 · 2026-08-07T03:10:43Z (slot=alert-commander-market, tick=02:45, fired late 03:08Z — router processing order/legacy cron fallback per dispatch note)
- Signals: bus 6 total, all `verified_decision` (non-consumed type, informational only): VCB news_mention(conf40), HUT ta_oversold(conf60), VHM ta_oversold(conf60), DGC price_surge(conf60), SSI news_mention(conf60), VHM ta_bb_breakout_down(conf60) | Fired: 0 | Suppressed: 0 (new) | MARKET: 0
- ChainCatalyst: none this window (bus empty of chain_catalyst).
- Position-danger: `get_alerts(type=price)` clean, no stopLossHit; max singleDayDrop VHM -3.11% (<5%) — gate fails.
- Watchlist-opp: no BUY-consensus bus signal; strongest momentum DGC +3.58% intraday (already checked c61: GIU/62%, below threshold, no new BUY catalyst since) — gate fails.
- CRITICAL-always: legal_risk clean (days=1/hours_back=6), crisis_early_warning clean (no velocity breach; reputation WARNING x14 tickers BID/BSR/DIG/DPM/EIB/FPT/FRT/HPG/NVL/SHB/VCB/VHM/VIC/VJC, DANGER PLX=20 — same tier as c58–c61), no verified_chain in bus.
- Regime: NEUTRAL (fallback, macro_snapshot has no literal Global Liquidity line) | Carry: UNKNOWN→treated NEUTRAL (carry inputs fixture-fallback, DSI-INV-1 suppressed) | vol_regime ELEVATED (rv_20d_percentile=0.775) | Pivot window: false (next Sept 2026)
- Market OPEN (03:09 UTC), VN-Index 1764.08 Δ-0.70 flat, Gold +0.11% (4309.1, BULLISH/safe-haven), USD_VND 26050 (BEARISH/VND depreciation pressure). No fresh tick-snapshot for this tick — direct MCP calls used. `get_vn_liquidity_state` omo+interbank blocked (HTML parse fail/VPS unreachable, honest-NULL, same as prior). foreign_room avg_util=9.76% (10-ticker sample) — not exhausted. Silent exit — no MARKET/WORK send. `log_agent_work` id=1788.

## c63 · 2026-08-07T03:34:45Z (slot=alert-commander-market, tick=03:15)
- Signals: bus 8 total, all `verified_decision` (non-consumed type, informational only): HUT ta_oversold(conf60), VHM ta_oversold(conf60), DGC price_surge(conf60), SSI news_mention(conf60), VHM ta_bb_breakout_down(conf60), VNM price_surge+ta_bb_breakout_up(conf60), BSR price_surge(conf60), PLX price_surge(conf60) | Fired: 0 | Suppressed: 0 (new) | MARKET: 0
- ChainCatalyst: none this window (bus empty of chain_catalyst).
- Position-danger: `get_alerts(type=price)` clean, no stopLossHit; max singleDayDrop VHM -2.59% (<5%) — gate fails.
- Watchlist-opp: checked kinhDich for top movers VNM(+6.61%, GIU 37%), BSR(+4.99%, MUA 37%), PLX(+4.75%, GIU 37%) — all confidence far below 70% threshold — gate fails.
- CRITICAL-always: legal_risk clean (days=1/hours_back=6), crisis_early_warning clean (no velocity breach; reputation WARNING x13 tickers BID/BSR/DIG/DPM/EIB/FPT/FRT/HPG/NVL/SHB/VCB/VHM/VIC/VJC, DANGER PLX=20 — same tier as c58–c62), no verified_chain in bus.
- Regime: NEUTRAL (fallback, macro_snapshot has no literal Global Liquidity line) | Carry: UNKNOWN→treated NEUTRAL (carry inputs fixture-fallback, DSI-INV-1 suppressed) | vol_regime ELEVATED (rv_20d_percentile=0.779) | Pivot window: false (next Sept 2026)
- Market OPEN (03:34 UTC), VN-Index 1774.53 +0.55%, breadth 170up/88down, Gold BULLISH (4313.4, safe-haven), USD_VND 26050 BEARISH (VND depreciation pressure), Brent 83.57 NEUTRAL. No fresh tick-snapshot for this tick — direct MCP calls used. `get_vn_liquidity_state` omo+interbank blocked (HTML parse fail/VPS unreachable, honest-NULL, same as prior). foreign_room avg_util=9.76% (10-ticker sample) — not exhausted. Silent exit — no MARKET/WORK send. `log_agent_work` id=1791.
