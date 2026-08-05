# Alert Commander — Notebook

**Last updated:** 2026-08-05 07:23 UTC | **Sprint:** UC-CRITIC-HOOKS-ENFORCEMENT

**Role:** Event-only alert dispatch (position-danger / watchlist-opportunity / CRITICAL-always) | **Cadence:** `*/15min` market hours (02:00–08:30 UTC) + 4h critical sweep | **Contract:** APPEND class, one `## c<NNN>` section per cycle per `.claude/skills/notebook-write/SKILL.md` AC-6.

> **Structural reset (FIX-ALERT-COMMANDER-NOTEBOOK-SINGLE-BLOB-UNPRUNABLE, 2026-07-29):** prior history archived → `docs/agent-memory/notebooks/archive/alert-commander-archive-20260729.md`. One top-level `## c<NNN> · <ISO-timestamp>` section per cycle now.

## c34 · 2026-08-05T06:54:40Z (slot=alert-commander-market, tick=06:52)
- Signals: 2 bus rows (10366/10367 VERIFIED_DECISION VHM/VIC carryover, informational — not a consumed type) | Fired: 0 | Suppressed: 0 | MARKET: 0
- ChainCatalyst: 0 fired | 0 suppressed — no chain_catalyst on bus this cycle (10361-10365 fully rolled off 2h window).
- Position-danger: `get_alerts(type=price)` clean (no stopLossHit), no ticker >5% singleDayDrop (max BSR -2.60%) — gate fails 1/3.
- Watchlist-opp: no new BUY-qualifying signal on bus this cycle — gate fails, no `get_kinhdich_reading` triggered.
- CRITICAL-always: legal_risk clean (days=1/hours_back=6), crisis_early_warning clean (reputation DANGER DPM/PLX=20, KDC=22 — same tier as prior cycles; BSR now WARNING=30), no verified_chain.
- Regime: NEUTRAL (fallback — macro_snapshot JSON shape, investment-clock score=8/CORE_VN) | Carry: NEUTRAL (1.37%) | vol_regime ELEVATED (rv_20d_pctile=0.789) | Pivot window: false (next Sept 2026)
- Market OPEN (VN-Index 1779.64 +0.14%, breadth 115up/187down) — tick-snapshot hit (cycle-snapshot-06:52.json, <1min fresh) — macro+context from snapshot; macro_calendar/alerts/vol/liquidity/foreign_room/legal_risk/crisis/agent_signals/market_snapshot called live. Silent exit — no MARKET/WORK send. `log_agent_work` id=1756.

## c35 · 2026-08-05T07:09:30Z (slot=alert-commander-market, tick=07:05)
- Signals: 3 bus rows (10366 VHM, 10367 VIC, 10370 HUT — all VERIFIED_DECISION, informational — not a consumed type) | Fired: 0 | Suppressed: 0 | MARKET: 0
- ChainCatalyst: 0 fired | 0 suppressed — no chain_catalyst on bus this cycle.
- Position-danger: `get_alerts(type=price)` clean (no stopLossHit), no ticker >5% singleDayDrop (largest: DPM -2.48%, NVL +2.99%) — gate fails 1/3.
- Watchlist-opp: no new BUY-qualifying signal on bus this cycle — gate fails, no `get_kinhdich_reading` triggered.
- CRITICAL-always: legal_risk clean (days=1/hours_back=6), crisis_early_warning clean (no crisis threshold; reputation DANGER DPM/PLX=20, KDC=22 — same tier as prior cycles), no verified_chain.
- Regime: NEUTRAL (fallback — macro_snapshot JSON shape, investment-clock score=8/CORE_VN) | Carry: NEUTRAL (1.37%) | vol_regime ELEVATED (rv_20d_pctile=0.789) | Pivot window: false (next Sept 2026)
- Market OPEN (VN-Index 1775.17 -0.12%, breadth 107up/212down) — tick-snapshot hit (cycle-snapshot-07:05.json, ~1min fresh) — macro+context from snapshot; macro_calendar/alerts/vol/foreign_room/legal_risk/crisis/agent_signals/market_snapshot called live; `get_vn_liquidity_state` SKIP (macro-indicators service unavailable). Silent exit — no MARKET/WORK send. `log_agent_work` id=1757.

## c36 · 2026-08-05T07:23:46Z (slot=alert-commander-market, tick=07:19)
- Signals: 3 bus rows (10370 HUT, 10371 VIC, 10372 HPG — all VERIFIED_DECISION, informational — not a consumed type) | Fired: 0 | Suppressed: 0 | MARKET: 0
- ChainCatalyst: 0 fired | 0 suppressed — no chain_catalyst on bus this cycle.
- Position-danger: `get_alerts(type=price)` clean (no stopLossHit) — gate fails 1/3.
- Watchlist-opp: no new BUY-qualifying signal on bus this cycle — gate fails, no `get_kinhdich_reading` triggered.
- CRITICAL-always: legal_risk clean (days=1/hours_back=6), crisis_early_warning clean (no crisis threshold; reputation DANGER DPM/PLX=20, KDC=22 — same tier as prior cycles, BSR now WARNING=30), no verified_chain.
- Regime: NEUTRAL (fallback — macro_snapshot JSON shape, investment-clock score=8/CORE_VN) | Carry: NEUTRAL (1.37%) | vol_regime ELEVATED (rv_20d_pctile=0.789) | Pivot window: false (next Sept 2026)
- Market OPEN (VN-Index 1775.62 -0.09%, breadth 102up/205down) — tick-snapshot hit (cycle-snapshot-07:19.json, ~1min fresh) — macro+context from snapshot; macro_calendar/alerts/vol/foreign_room/legal_risk/crisis/agent_signals/market_snapshot called live; `get_vn_liquidity_state` omo+interbank blocked (HTML parse fail/VPS unreachable, honest-NULL). Silent exit — no MARKET/WORK send. `log_agent_work` id=1758.
