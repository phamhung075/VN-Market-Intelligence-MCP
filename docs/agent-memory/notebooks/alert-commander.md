# Alert Commander — Notebook

**Last updated:** 2026-08-01 08:10 UTC | **Sprint:** FIX-BCTC-1345B-ALERT-NAMES-A-RULE-FAMILY-THAT-CANNOT-PRODUCE-ITS-OWN-VALUE

**Role:** Event-only alert dispatch (position-danger / watchlist-opportunity / CRITICAL-always) | **Cadence:** `*/15min` market hours (02:00–08:30 UTC) + 4h critical sweep | **Contract:** APPEND class, one `## c<NNN>` section per cycle per `.claude/skills/notebook-write/SKILL.md` AC-6.

> **Structural reset (FIX-ALERT-COMMANDER-NOTEBOOK-SINGLE-BLOB-UNPRUNABLE, 2026-07-29):** prior history archived → `docs/agent-memory/notebooks/archive/alert-commander-archive-20260729.md`. One top-level `## c<NNN> · <ISO-timestamp>` section per cycle now.

## c24 · 2026-08-01T00:07:50Z (slot=alert-commander-critical, tick=00:06)
- Signals: 0 new (`get_agent_signals(status=unread)` clean) | Fired: 0 | Suppressed: 0 | MARKET: 0
- Position-danger: `get_alerts(type=price)` clean (no stopLossHit) — gate fails on condition 1/3.
- Watchlist-opp: live `get_kinhdich_reading` FRT(GIỮ tiêu cực 62%), VCB(BÁN tiêu cực 100%) — neither BUY — gate fails.
- CRITICAL-always: legal_risk clean (`days=1/hours_back=6`), crisis_early_warning clean (DPM/KDC/PLX DANGER<50 reputation, unchanged/not new/escalated), no verified_chain/chain_catalyst/urgent_news on bus.
- Regime: NEUTRAL (fallback — macro_snapshot JSON shape via tick-snapshot) | Carry: NEUTRAL (1.37%) | vol_regime ELEVATED (rv_20d_pctile=0.789) | Pivot window: false (next Sept 2026)
- Market CLOSED (off-hours critical sweep; prices as of 2026-07-31 09:00Z close) — tick-snapshot 00:06 hit (fresh, created 00:06:41Z, age 69s, skipped get_macro_snapshot) — get_alerts/agent_signals/legal_risk/crisis/kinhdich/vol/liquidity/foreign_room/macro_calendar/watchlist all called live.

## c25 · 2026-08-01T04:09:23Z (slot=alert-commander-critical, tick=04:07)
- Signals: 0 new (`get_agent_signals(status=unread)` clean) | Fired: 0 | Suppressed: 0 | MARKET: 0
- Position-danger: `get_alerts(type=price)` clean (no stopLossHit) — gate fails on condition 1/3.
- Watchlist-opp: live `get_kinhdich_reading` VCB(BÁN 100%), FRT(GIỮ 63%), HPG(GIỮ 63%), VIC(THẬN TRỌNG 50%), NVL(GIỮ 100%) — none BUY — gate fails.
- CRITICAL-always: legal_risk clean (`days=1/hours_back=6`), crisis_early_warning clean (18 tickers <50 reputation, unchanged from c24, none new/escalated), no verified_chain/chain_catalyst on bus — bus carried only 1 already-read `urgent_news` (freshness-sla-monitor SLA-breach noise, id10228).
- Regime: NEUTRAL (fallback — macro_snapshot JSON shape, no literal Global-Liquidity line) | Carry: NEUTRAL (1.37%) | vol_regime ELEVATED (rv_20d_pctile=0.789) | Pivot window: false (next Sept 2026)
- Market CLOSED (off-hours critical sweep; prices as of 2026-07-31 09:00Z close) — no tick-snapshot hit (freshest snapshot 00:06 stale, >7min) — get_cycle_bootstrap/macro_snapshot/alerts/agent_signals/legal_risk/crisis/kinhdich/vol/liquidity/foreign_room/macro_calendar all called live.

## c26 · 2026-08-01T08:10:36Z (slot=alert-commander-critical, tick=08:07)
- Signals: 1 bus row (10232 verified_decision/VNM, alert-engine echo, already read — not a consumed type) | Fired: 0 | Suppressed: 0 | MARKET: 0
- Position-danger: `get_alerts(type=price)` clean (no stopLossHit) — gate fails 1/3. Portfolio: FPT qty5000 avg80.3k cur67.1k P/L-16.4% but daily change +0.15% (no single-day drop) — no live trigger.
- Watchlist-opp: live `get_kinhdich_reading` FRT(GIỮ tiêu cực 63%), VCB(BÁN 100%), HPG(GIỮ tích cực 63%), VIC(THẬN TRỌNG 50%), NVL(GIỮ 100%), FPT(GIỮ tích cực 63%) — none BUY — gate fails.
- CRITICAL-always: legal_risk clean (days=1/hours_back=6), crisis_early_warning clean (18 tickers <50 reputation, DPM/KDC/PLX DANGER=20 unchanged from c25, none new/escalated), no verified_chain/chain_catalyst/urgent_news on bus.
- Regime: NEUTRAL (fallback — macro_snapshot JSON shape) | Carry: NEUTRAL (1.37%) | vol_regime ELEVATED (rv_20d_pctile=0.789) | Pivot window: false (next Sept 2026)
- Market CLOSED (off-hours sweep; prices as of 2026-07-31 09:00Z close) — cycle-snapshot-08:06.json stale (created 2026-07-31, >24h old, not ≤7min) — treated as absent, all tools called live (bootstrap/macro/context/alerts/agent_signals/legal_risk/crisis/kinhdich×6/vol/liquidity/foreign_room/macro_calendar/watchlist/positions).
