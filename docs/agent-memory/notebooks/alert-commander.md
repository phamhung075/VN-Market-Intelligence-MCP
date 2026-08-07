# Alert Commander — Notebook

**Last updated:** 2026-08-07 03:58 UTC | **Sprint:** idle

**Role:** Event-only alert dispatch (position-danger / watchlist-opportunity / CRITICAL-always) | **Cadence:** `*/15min` market hours (02:00–08:30 UTC) + 4h critical sweep | **Contract:** APPEND class, one `## c<NNN>` section per cycle per `.claude/skills/notebook-write/SKILL.md` AC-6.

> **Structural reset (FIX-ALERT-COMMANDER-NOTEBOOK-SINGLE-BLOB-UNPRUNABLE, 2026-07-29):** prior history archived → `docs/agent-memory/notebooks/archive/alert-commander-archive-20260729.md`. One top-level `## c<NNN> · <ISO-timestamp>` section per cycle now.

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

## c64 · 2026-08-07T03:58:57Z (slot=alert-commander-market, tick=03:55)
- Signals: bus 10 total, all `verified_decision` (non-consumed, informational): HUT ta_oversold(RSI8.5), VHM ta_oversold(RSI21.8), DGC price_surge+6.92%, SSI news_mention, VHM ta_bb_breakout_down, VNM price_surge+6.10%, VNM ta_bb_breakout_up, BSR price_surge+5.39%, PLX price_surge+5.04%, VNM news_mention(SOE inflow) | Fired: 0 | Suppressed: 0 (new) | MARKET: 0
- ChainCatalyst: none this window (bus empty of chain_catalyst).
- Position-danger: `get_alerts(type=price)` clean, no stopLossHit; max singleDayDrop VHM -3.24% (<5%) — gate fails.
- Watchlist-opp: live kinhDich check on top movers PLX(+6.97%, GIU 38%), BSR(+5.79%, MUA 38%), VNM(+5.76%, GIU 38%) — all conf ~37-38%, far below 70% threshold — gate fails.
- CRITICAL-always: legal_risk clean (days=1/hours_back=6), crisis_early_warning clean (no velocity breach; reputation WARNING x14 tickers, DANGER PLX=20 unchanged), no verified_chain in bus.
- Regime: NEUTRAL (fallback, macro_snapshot has no literal Global Liquidity line) | Carry: UNKNOWN→treated NEUTRAL (carry inputs fixture-fallback, DSI-INV-1 suppressed) | vol_regime ELEVATED (rv_20d_percentile=0.779) | Pivot window: false (next Sept 2026)
- Market OPEN (03:57 UTC), VN-Index 1772.57 +0.44%, Gold BULLISH (4316.9, safe-haven), USD_VND 26050 BEARISH (VND depreciation pressure), Brent 83.49 NEUTRAL. Fresh tick-snapshot hit (tick 03:54, age~1min) — used for market_context+macro_snapshot; direct MCP calls for indicators/legal/crisis/bus (snapshot carries no agent_signals field). `get_vn_liquidity_state` omo+interbank blocked (HTML parse fail/VPS unreachable, honest-NULL, same as prior). foreign_room avg_util=9.76% (10-ticker sample) — not exhausted. Silent exit — no MARKET/WORK send. `log_agent_work` id=1794.
