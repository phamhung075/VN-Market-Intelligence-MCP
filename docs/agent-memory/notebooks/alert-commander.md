# Alert Commander — Notebook

**Last updated:** 2026-07-31 16:11 UTC | **Sprint:** FIX-ALERT-CASCADE-OUTCOME-DEAD

**Role:** Event-only alert dispatch (position-danger / watchlist-opportunity / CRITICAL-always) | **Cadence:** `*/15min` market hours (02:00–08:30 UTC) + 4h critical sweep | **Contract:** APPEND class, one `## c<NNN>` section per cycle per `.claude/skills/notebook-write/SKILL.md` AC-6.

> **Structural reset (FIX-ALERT-COMMANDER-NOTEBOOK-SINGLE-BLOB-UNPRUNABLE, 2026-07-29):** prior history archived → `docs/agent-memory/notebooks/archive/alert-commander-archive-20260729.md`. One top-level `## c<NNN> · <ISO-timestamp>` section per cycle now.

## c20 · 2026-07-31T08:12:19Z (slot=alert-commander-critical, tick=08:00)
- Signals: 0 new (`get_agent_signals(status=unread)` clean; bootstrap echoed 16 alert-engine verified_decision recaps VNH/HUT/HVN/CTG/VIC/VNM/VCB/VJC price+BCTC-day news, all out-of-scope) | Fired: 0 | Suppressed: 0 | MARKET: 0
- Position-danger: `get_alerts(type=price)` clean (no stopLossHit) — gate fails on condition 1/3 alone.
- Watchlist-opp: checked FRT(+6.96%, Quẻ Bĩ/GIỮ tiêu cực 63%), VCB(+4.96%, Quẻ Bĩ/BÁN tiêu cực 100%), BID(+2.01%, Quẻ Độn/GIỮ tích cực 38%), VIC(-2.68%, Quẻ Dự/THẬN TRỌNG tích cực 50%) — none clears kinhDichSignal=BUY — gate fails.
- CRITICAL-always: legal_risk clean (`days=1/hours_back=6`), crisis_early_warning clean (no crisis signal; 25 tickers <50 reputation incl. BDI/DLC/DPM/GAS/GVR/KDC/PLX/VNH=20 DANGER), no verified_chain/chain_catalyst on bus.
- Regime: NEUTRAL (fallback — macro_snapshot JSON shape, no literal Global-Liquidity line) | Carry: NEUTRAL (1.37%) | vol_regime ELEVATED (rv_20d_pctile=0.789) | Pivot window: false (next Sept 2026)
- No tick-snapshot file matched current UTC minute (checked 08:09) — fell through to direct `get_cycle_bootstrap`/`get_macro_snapshot` per Step 0b fallback.

## c21 · 2026-07-31T12:12:35Z (slot=alert-commander-critical, tick=12:00)
- Signals: 0 new (`get_agent_signals(status=unread)` clean; bootstrap echoed 3 read: alert-engine verified_decision HPG id10198/SHB id10199 news_mention conf60, freshness-sla-monitor urgent_news SLA-breach (35min>30min) conf70 — all out-of-scope) | Fired: 0 | Suppressed: 0 | MARKET: 0
- Position-danger: `get_alerts(type=price)` clean (no stopLossHit) — gate fails on condition 1/3 alone.
- Watchlist-opp: fresh `get_kinhdich_reading` on today's active tickers FRT(+6.96%, Quẻ Bĩ/GIỮ tiêu cực 63%), VCB(+4.96%, Quẻ Bĩ/BÁN tiêu cực 100%), HPG(Quẻ Hàm/GIỮ tích cực 63%), SHB(Quẻ Tỷ/GIỮ tích cực 100%) — none clears kinhDichSignal=BUY — gate fails.
- CRITICAL-always: legal_risk clean (`days=1/hours_back=6`), crisis_early_warning clean (no crisis signal; 25 tickers <50 reputation incl. BDI/DLC/DPM/GAS/GVR/KDC/PLX/VNH=20 DANGER, none new/escalated), no verified_chain/chain_catalyst on bus.
- Regime: NEUTRAL (fallback — macro_snapshot JSON shape, no literal Global-Liquidity line) | Carry: NEUTRAL (1.37%) | vol_regime ELEVATED (rv_20d_pctile=0.789) | Pivot window: false (next Sept 2026)
- Market CLOSED (off-hours 4h critical sweep; prices as of 2026-07-31 09:00Z close) — no tick-snapshot matched current UTC minute (checked 12:09-12:12) — fell through to direct `get_cycle_bootstrap`/`get_macro_snapshot` per Step 0b fallback.

## c22 · 2026-07-31T16:11:22Z (slot=alert-commander-critical, tick=16:00)
- Signals: 0 new (`get_agent_signals(status=unread)` clean) | Fired: 0 | Suppressed: 0 | MARKET: 0
- Position-danger: `get_alerts(type=price)` clean (no stopLossHit) — gate fails on condition 1/3 alone.
- Watchlist-opp: fresh `get_kinhdich_reading` FRT(+6.96%, Quẻ Bĩ/GIỮ tiêu cực 63%), VCB(+4.96%, Quẻ Bĩ/BÁN tiêu cực 100%) — neither clears kinhDichSignal=BUY — gate fails.
- CRITICAL-always: legal_risk clean (`days=1/hours_back=6`), crisis_early_warning clean (25 tickers <50 reputation, unchanged from c21, none new/escalated), no verified_chain/chain_catalyst/urgent_news on bus.
- Regime: NEUTRAL (fallback — macro_snapshot JSON shape, no literal Global-Liquidity line) | Carry: NEUTRAL (1.37%) | vol_regime ELEVATED (rv_20d_pctile=0.789) | Pivot window: false (next Sept 2026)
- Market CLOSED (off-hours 4h critical sweep; prices as of 2026-07-31 09:00Z close) — tick-snapshot 16:06 hit (fresh, created 16:07:14Z, skipped get_cycle_bootstrap) — get_alerts/agent_signals/legal_risk/crisis/kinhdich/vol/liquidity/foreign_room/macro_calendar all called live.
