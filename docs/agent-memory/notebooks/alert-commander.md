# Alert Commander — Notebook

**Last updated:** 2026-08-01 00:07 UTC | **Sprint:** idle

**Role:** Event-only alert dispatch (position-danger / watchlist-opportunity / CRITICAL-always) | **Cadence:** `*/15min` market hours (02:00–08:30 UTC) + 4h critical sweep | **Contract:** APPEND class, one `## c<NNN>` section per cycle per `.claude/skills/notebook-write/SKILL.md` AC-6.

> **Structural reset (FIX-ALERT-COMMANDER-NOTEBOOK-SINGLE-BLOB-UNPRUNABLE, 2026-07-29):** prior history archived → `docs/agent-memory/notebooks/archive/alert-commander-archive-20260729.md`. One top-level `## c<NNN> · <ISO-timestamp>` section per cycle now.

## c22 · 2026-07-31T16:11:22Z (slot=alert-commander-critical, tick=16:00)
- Signals: 0 new (`get_agent_signals(status=unread)` clean) | Fired: 0 | Suppressed: 0 | MARKET: 0
- Position-danger: `get_alerts(type=price)` clean (no stopLossHit) — gate fails on condition 1/3 alone.
- Watchlist-opp: fresh `get_kinhdich_reading` FRT(+6.96%, Quẻ Bĩ/GIỮ tiêu cực 63%), VCB(+4.96%, Quẻ Bĩ/BÁN tiêu cực 100%) — neither clears kinhDichSignal=BUY — gate fails.
- CRITICAL-always: legal_risk clean (`days=1/hours_back=6`), crisis_early_warning clean (25 tickers <50 reputation, unchanged from c21, none new/escalated), no verified_chain/chain_catalyst/urgent_news on bus.
- Regime: NEUTRAL (fallback — macro_snapshot JSON shape, no literal Global-Liquidity line) | Carry: NEUTRAL (1.37%) | vol_regime ELEVATED (rv_20d_pctile=0.789) | Pivot window: false (next Sept 2026)
- Market CLOSED (off-hours 4h critical sweep; prices as of 2026-07-31 09:00Z close) — tick-snapshot 16:06 hit (fresh, created 16:07:14Z, skipped get_cycle_bootstrap) — get_alerts/agent_signals/legal_risk/crisis/kinhdich/vol/liquidity/foreign_room/macro_calendar all called live.

## c23 · 2026-07-31T20:14:13Z (slot=alert-commander-critical, tick=20:00)
- Signals: 2 new chain_catalyst (10218 domestic multi-sector earnings recap, 10219 Iran/Hormuz geopolitical oil shock) | Fired: 1 | Suppressed: 1 | MARKET: 1
- ChainCatalyst: 10219 FIRED — market-wide advisory carve-out (bearish, conf=0.90≥0.75 NEUTRAL threshold, no ticker but genuine external catalyst + broad VN export cost-pressure framing, breadth 119up/196down corroborates) → ticker=VNINDEX. 10218 suppressed — no single-ticker anchor (multi-sector recap, no affected_stocks/stock_code).
- Position-danger: `get_alerts(type=price)` clean (no stopLossHit). Watchlist-opp: fresh kinhdich FRT/VCB/HPG/VIC/NVL — none BUY. legal_risk clean, crisis_early_warning clean (no new/escalated DANGER tickers).
- Regime: NEUTRAL (fallback, macro_snapshot JSON shape) | Carry: NEUTRAL (1.37%) | vol ELEVATED (rv20d_pctile=0.789) | Pivot: false. claim-truth-gate PASS, published-marker claimed.

## c24 · 2026-08-01T00:07:50Z (slot=alert-commander-critical, tick=00:06)
- Signals: 0 new (`get_agent_signals(status=unread)` clean) | Fired: 0 | Suppressed: 0 | MARKET: 0
- Position-danger: `get_alerts(type=price)` clean (no stopLossHit) — gate fails on condition 1/3.
- Watchlist-opp: live `get_kinhdich_reading` FRT(GIỮ tiêu cực 62%), VCB(BÁN tiêu cực 100%) — neither BUY — gate fails.
- CRITICAL-always: legal_risk clean (`days=1/hours_back=6`), crisis_early_warning clean (DPM/KDC/PLX DANGER<50 reputation, unchanged/not new/escalated), no verified_chain/chain_catalyst/urgent_news on bus.
- Regime: NEUTRAL (fallback — macro_snapshot JSON shape via tick-snapshot) | Carry: NEUTRAL (1.37%) | vol_regime ELEVATED (rv_20d_pctile=0.789) | Pivot window: false (next Sept 2026)
- Market CLOSED (off-hours critical sweep; prices as of 2026-07-31 09:00Z close) — tick-snapshot 00:06 hit (fresh, created 00:06:41Z, age 69s, skipped get_macro_snapshot) — get_alerts/agent_signals/legal_risk/crisis/kinhdich/vol/liquidity/foreign_room/macro_calendar/watchlist all called live.
