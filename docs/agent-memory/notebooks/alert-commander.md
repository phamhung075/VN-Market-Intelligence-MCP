# Alert Commander — Notebook

**Last updated:** 2026-08-01 16:09 UTC | **Sprint:** FIX-DEPTHTHIN-B-GATEWAY-TA-PATH-REWRITE

**Role:** Event-only alert dispatch (position-danger / watchlist-opportunity / CRITICAL-always) | **Cadence:** `*/15min` market hours (02:00–08:30 UTC) + 4h critical sweep | **Contract:** APPEND class, one `## c<NNN>` section per cycle per `.claude/skills/notebook-write/SKILL.md` AC-6.

> **Structural reset (FIX-ALERT-COMMANDER-NOTEBOOK-SINGLE-BLOB-UNPRUNABLE, 2026-07-29):** prior history archived → `docs/agent-memory/notebooks/archive/alert-commander-archive-20260729.md`. One top-level `## c<NNN> · <ISO-timestamp>` section per cycle now.

## c26 · 2026-08-01T08:10:36Z (slot=alert-commander-critical, tick=08:07)
- Signals: 1 bus row (10232 verified_decision/VNM, alert-engine echo, already read — not a consumed type) | Fired: 0 | Suppressed: 0 | MARKET: 0
- Position-danger: `get_alerts(type=price)` clean (no stopLossHit) — gate fails 1/3. Portfolio: FPT qty5000 avg80.3k cur67.1k P/L-16.4% but daily change +0.15% (no single-day drop) — no live trigger.
- Watchlist-opp: live `get_kinhdich_reading` FRT(GIỮ tiêu cực 63%), VCB(BÁN 100%), HPG(GIỮ tích cực 63%), VIC(THẬN TRỌNG 50%), NVL(GIỮ 100%), FPT(GIỮ tích cực 63%) — none BUY — gate fails.
- CRITICAL-always: legal_risk clean (days=1/hours_back=6), crisis_early_warning clean (18 tickers <50 reputation, DPM/KDC/PLX DANGER=20 unchanged from c25, none new/escalated), no verified_chain/chain_catalyst/urgent_news on bus.
- Regime: NEUTRAL (fallback — macro_snapshot JSON shape) | Carry: NEUTRAL (1.37%) | vol_regime ELEVATED (rv_20d_pctile=0.789) | Pivot window: false (next Sept 2026)
- Market CLOSED (off-hours sweep; prices as of 2026-07-31 09:00Z close) — cycle-snapshot-08:06.json stale (created 2026-07-31, >24h old, not ≤7min) — treated as absent, all tools called live (bootstrap/macro/context/alerts/agent_signals/legal_risk/crisis/kinhdich×6/vol/liquidity/foreign_room/macro_calendar/watchlist/positions).

## c27 · 2026-08-01T12:09:03Z (slot=alert-commander-critical, tick=12:06)
- Signals: 0 new (`get_agent_signals(status=unread)` clean, bus carried only 2 already-read rows: 10241 verified_decision/DIG echo, 10242 urgent_news freshness-sla-monitor noise) | Fired: 0 | Suppressed: 0 | MARKET: 0
- Position-danger: `get_alerts(type=price)` clean (no stopLossHit). Portfolio: FPT qty5000 avg80.3k cur67.1k P/L-16.4%, daily +0.15% (stale close) — no live trigger.
- Watchlist-opp: live `get_kinhdich_reading` FPT(GIỮ 62%), DIG(BÁN 25%), VNM(GIỮ 100%), VCB(BÁN 100%), HPG(GIỮ 62%), VIC(THẬN TRỌNG 50%), NVL(GIỮ 100%), BSR(GIỮ 100%), PLX(GIỮ 100%), EIB(GIỮ tiêu cực 25%) — none BUY — gate fails.
- CRITICAL-always: legal_risk clean (days=1/hours_back=6), crisis_early_warning clean (no crisis threshold exceeded; 19 tickers <50 reputation incl. new BSR=37 deteriorating, DPM/KDC/PLX DANGER unchanged), no verified_chain/chain_catalyst/unread urgent_news on bus.
- Regime: NEUTRAL (fallback — macro_snapshot JSON shape, no literal Global-Liquidity line) | Carry: NEUTRAL (1.37%) | vol_regime ELEVATED (rv_20d_pctile=0.789) | Pivot window: false (next Sept 2026)
- Market CLOSED (off-hours critical sweep; VN-Index -0.51% 1735.78, breadth 119up/196down, prices as of 2026-07-31 09:00Z close) — no tick-snapshot for 12:06 today — bootstrap/macro/context/alerts/agent_signals/legal_risk/crisis/kinhdich×10/vol/liquidity/foreign_room/macro_calendar/watchlist/positions/market_snapshot all called live.

## c28 · 2026-08-01T16:09:57Z (slot=alert-commander-critical, tick=16:07)
- Signals: 0 new (`get_agent_signals(status=unread)` clean) | Fired: 0 | Suppressed: 0 | MARKET: 0
- Position-danger: `get_alerts(type=price)` clean (no stopLossHit) — gate fails on condition 1/3.
- Watchlist-opp: live `get_kinhdich_reading` DIG(BÁN 25%), VNM(GIỮ 100%), EIB(GIỮ tiêu cực 25%), HPG(GIỮ 63%), PLX(GIỮ 100%), BSR(GIỮ 100%), VIC(THẬN TRỌNG 50%), FPT(GIỮ 63%), VCB(BÁN 100%), NVL(GIỮ 100%) — none BUY — gate fails.
- CRITICAL-always: legal_risk clean (days=1/hours_back=6), crisis_early_warning clean (no crisis threshold exceeded; 19 tickers <50 reputation, DPM/KDC/PLX DANGER unchanged, BSR=37 deteriorating unchanged from c27), no verified_chain/chain_catalyst/unread urgent_news on bus.
- Regime: NEUTRAL (fallback — macro_snapshot JSON shape, no literal Global-Liquidity line) | Carry: NEUTRAL (1.37%) | vol_regime ELEVATED (rv_20d_pctile=0.789) | Pivot window: false (next Sept 2026)
- Market CLOSED (off-hours critical sweep; VN-Index 1735.78 -8.88pt vs prior, prices as of 2026-07-31 09:00Z close) — no tick-snapshot for 16:07 today — bootstrap/macro/context/alerts/agent_signals/legal_risk/crisis/kinhdich×10/vol/liquidity/foreign_room/macro_calendar/watchlist all called live.
