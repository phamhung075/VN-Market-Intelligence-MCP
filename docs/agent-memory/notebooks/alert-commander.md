# Alert Commander — Notebook

**Last updated:** 2026-07-31 06:11 UTC | **Sprint:** FIX-CI-SIZELINT-MCPSERVER-ENERGYTOOLS-NEW-OFFENDER

**Role:** Event-only alert dispatch (position-danger / watchlist-opportunity / CRITICAL-always) | **Cadence:** `*/15min` market hours (02:00–08:30 UTC) + 4h critical sweep | **Contract:** APPEND class, one `## c<NNN>` section per cycle per `.claude/skills/notebook-write/SKILL.md` AC-6.

> **Structural reset (FIX-ALERT-COMMANDER-NOTEBOOK-SINGLE-BLOB-UNPRUNABLE, 2026-07-29):** prior history archived → `docs/agent-memory/notebooks/archive/alert-commander-archive-20260729.md`. One top-level `## c<NNN> · <ISO-timestamp>` section per cycle now.

## c15 · 2026-07-31T02:07:43Z (slot=alert-commander-market, tick=02:06)
- Signals: 15 total (chain_catalyst 10090 no-ticker "khối ngoại gom cổ phiếu" rally recap → suppressed, domestic-flow recap not external catalyst, fails carve-out; urgent_news VIC/BSR earnings-beat checked via kinhDich; 2x freshness-sla-monitor noise; 8x alert-engine verified_decision echo out-of-scope) | Fired: 0 | Suppressed: 1 (10090) | MARKET: 0
- Position-danger: `get_alerts(type=price)` clean; scanned WATCHLIST&PRICES — no ticker >5% single-day drop (biggest moves +6.96% FRT/VHM surges, all positive) — gate fails.
- Watchlist-opp: VIC kinhDich=CHO(tieu cuc)/75%conf (fails kinhDichSignal=BUY); BSR kinhDich=BAN(tich cuc)/25%conf (fails ≥70% threshold) — both fail.
- CRITICAL-always: legal_risk clean (`days=1/hours_back=6`), crisis_early_warning clean (reputation-score deterioration only, 26 tickers <50 score, no crisis signal), no verified_chain on bus.
- Regime: NEUTRAL (fallback, macro_snapshot JSON shape has no literal REGIME field) | Carry: NEUTRAL (1.37%) | vol_regime ELEVATED (rv_20d_pctile=0.78) | Pivot window: false (pivotWindowWarning=null, next Sept 2026)
- Used tick-snapshot `cycle-snapshot-02:06.json` (fresh, created_at 02:06:50Z, 53s old) — skipped `get_cycle_bootstrap`/`get_macro_snapshot`.

## c16 · 2026-07-31T04:08:30Z (slot=alert-commander-critical, tick=04:05)
- Signals: 13 total (chain_catalyst 10117 no-ticker "VN-Index bật tăng ~80đ/3 phiên, tạo đáy" recap → suppressed, domestic index recap not external catalyst, fails carve-out; urgent_news VJC/VIC earnings/infra checked via kinhDich; 10x alert-engine verified_decision echo out-of-scope) | Fired: 0 | Suppressed: 1 (10117) | MARKET: 0
- Position-danger: `get_alerts(type=price)` clean; VNH -11.11% price_drop (02:53Z, HIGH) already read/stale — price reverted to 900 (+0.00%) by 04:06 — no active stopLossHit+drop combo — gate fails.
- Watchlist-opp: VJC kinhDich=GIU(tich cuc)/63%conf (fails BUY signal + <70% threshold); VIC kinhDich=THAN TRONG(tich cuc)/50%conf (fails BUY signal + <70% threshold) — both fail.
- CRITICAL-always: legal_risk clean (`days=1/hours_back=6`), crisis_early_warning clean (reputation-score deterioration only, 25 tickers <50 incl. VNH/GAS/PLX/GVR/DPM/KDC/DLC/BDI=20 DANGER tier, no crisis signal), no verified_chain on bus.
- Regime: NEUTRAL (fallback — tick-snapshot macro object has no literal REGIME field) | Carry: NEUTRAL (macro.carry_regime) | vol_regime ELEVATED (rv_20d_pctile=0.789) | Pivot window: false (pivotWindowWarning=null, next Sept 2026)
- Used tick-snapshot `cycle-snapshot-04:05.json` (fresh, created_at 04:06:07Z, 53s old) — skipped `get_cycle_bootstrap`/`get_macro_snapshot`.

## c17 · 2026-07-31T06:11:41Z (slot=alert-commander-market, tick=06:06)
- Signals: 0 total (`get_agent_signals` unread clean — no urgent_news/price_anomaly/chain_catalyst/legal_risk/crisis_velocity/verified_chain this cycle) | Fired: 0 | Suppressed: 0 | MARKET: 0
- ChainCatalyst: 0 fired | 0 suppressed | event_types: none (no chain_catalyst signal on bus)
- Position-danger: `get_alerts(type=price)` clean; VNH -11.11% (02:53Z HIGH) stayed reverted (900, +0.00%); no ticker >5% single-day drop among live movers (FRT+6.96%/VCB+5.31%/BID surge, all positive) — gate fails.
- Watchlist-opp: no qualifying ticker candidate this cycle (clean signal bus, no kinhDich BUY+confidence≥70 pairing available) — gate fails.
- CRITICAL-always: legal_risk clean (`days=1/hours_back=6`), crisis_early_warning clean (reputation-score deterioration only, 26 tickers <50 incl. BDI/DLC/DPM/GAS/GVR/KDC/PLX/VNH=20 DANGER tier — no crisis signal), no verified_chain on bus.
- Regime: NEUTRAL (fallback — macro_snapshot JSON shape has no literal REGIME field) | Carry: NEUTRAL (1.37%) | vol_regime ELEVATED (rv_20d_pctile=0.782) | Pivot window: false (pivotWindowWarning=null, next Sept 2026)
- Used tick-snapshot `cycle-snapshot-06:06.json` (fresh, created_at 06:08:30Z, ~49s old) — skipped `get_cycle_bootstrap`/`get_macro_snapshot`; live-called `get_market_context`/`get_alerts`/`get_volatility_indicators`/`get_vn_liquidity_state`/`get_foreign_room`/`get_legal_risk_signals`/`get_crisis_early_warning`/`get_agent_signals`/`get_macro_calendar` directly.
