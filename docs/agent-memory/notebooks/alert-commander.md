# Alert Commander — Notebook

**Last updated:** 2026-08-05 06:41 UTC | **Sprint:** FIX-DEPTHTHIN-B-GATEWAY-TA-PATH-REWRITE

**Role:** Event-only alert dispatch (position-danger / watchlist-opportunity / CRITICAL-always) | **Cadence:** `*/15min` market hours (02:00–08:30 UTC) + 4h critical sweep | **Contract:** APPEND class, one `## c<NNN>` section per cycle per `.claude/skills/notebook-write/SKILL.md` AC-6.

> **Structural reset (FIX-ALERT-COMMANDER-NOTEBOOK-SINGLE-BLOB-UNPRUNABLE, 2026-07-29):** prior history archived → `docs/agent-memory/notebooks/archive/alert-commander-archive-20260729.md`. One top-level `## c<NNN> · <ISO-timestamp>` section per cycle now.

## c31 · 2026-08-05T04:12:23Z (slot=alert-commander-critical, tick=04:00)
- Signals: 5 bus rows (10361 urgent_news/VIC impact10, 10362 urgent_news/DPM impact8, 10363 urgent_news/BID impact6, 10364 chain_catalyst oil/Iran, 10365 chain_catalyst gold-spike) | Fired: 0 | Suppressed: 5 | MARKET: 0
- ChainCatalyst: 0 fired | 2 suppressed | 10364 oil/Iran de-escalation conf 0.70<0.75 NEUTRAL threshold; 10365 gold spike conf 0.80 clears threshold but no ticker + no named external catalyst (self-referential gold-price recap, not war/tariff/trade-policy trigger) — fails carve-out (2026-07-23 precedent)
- Position-danger: `get_alerts(type=price)` clean (no stopLossHit) — gate fails 1/3.
- Watchlist-opp: live `get_kinhdich_reading` VIC(GIU 100%), DPM(GIU 62%), BID(GIU 100%) — none BUY — gate fails.
- CRITICAL-always: legal_risk clean (days=1/hours_back=6), crisis_early_warning clean (reputation DANGER DPM/PLX=20, KDC=22 — same tier as c29/c30), no verified_chain.
- Regime: NEUTRAL (fallback — macro_snapshot JSON shape, investment-clock score=8/CORE_VN) | Carry: NEUTRAL (1.37%) | vol_regime ELEVATED (rv_20d_pctile=0.796) | Pivot window: false (next Sept 2026)
- Market OPEN (VN-Index 1786.78 +0.54%, breadth 157up/129down) — tick-snapshot hit (cycle-snapshot-04:05.json, ~2min fresh) — macro+context from snapshot; macro_calendar/alerts/vol/liquidity/foreign_room/legal_risk/crisis/agent_signals/kinhdich×3/market_snapshot called live. Silent exit — no MARKET/WORK send. `log_agent_work` id=1753.

## c32 · 2026-08-05T06:10:41Z (slot=alert-commander-market, tick=06:04)
- Signals: 7 bus rows (10361-10365 carryover unchanged from c31, 10366/10367 verified_decision informational-only, not a consumed type) | Fired: 0 | Suppressed: 0 new | MARKET: 0
- ChainCatalyst: 0 fired | 2 carryover suppressed unchanged (10364 oil/Iran conf 0.70<0.75 NEUTRAL threshold; 10365 gold-spike conf 0.80 clears but no ticker + self-referential gold-price recap, fails geopolitical carve-out) — not re-processed.
- Position-danger: `get_alerts(type=price)` clean (no stopLossHit), no ticker >5% singleDayDrop — gate fails 1/3.
- Watchlist-opp: live `get_kinhdich_reading` VIC(GIU 100%), DPM(GIU 62%), BID(GIU 100%) — none BUY — gate fails.
- CRITICAL-always: legal_risk clean (days=1/hours_back=6), crisis_early_warning clean (no crisis threshold; reputation DANGER DPM/PLX=20, KDC=22 — same tier as c29-c31), no verified_chain.
- Regime: NEUTRAL (fallback — macro_snapshot JSON shape, investment-clock score=8/CORE_VN) | Carry: NEUTRAL (1.37%) | vol_regime ELEVATED (rv_20d_pctile=0.796) | Pivot window: false (next Sept 2026)
- Market OPEN (VN-Index 1784.05 +0.38%, breadth 142up/154down) — tick-snapshot hit (cycle-snapshot-06:04.json, ~2min fresh) — macro+context from snapshot; macro_calendar/alerts/vol/liquidity/foreign_room/legal_risk/crisis/agent_signals/kinhdich×3/market_snapshot called live. Silent exit — no MARKET/WORK send. `log_agent_work` id=1754.

## c33 · 2026-08-05T06:41:18Z (slot=alert-commander-market, tick=06:40)
- Signals: 2 bus rows (10366/10367 VERIFIED_DECISION VHM/VIC — informational, not a consumed type) | Fired: 0 | Suppressed: 0 | MARKET: 0
- ChainCatalyst: 0 fired | 0 suppressed — no chain_catalyst on bus this cycle (10361-10365 rolled off 2h window since c32).
- Position-danger: `get_alerts(type=price)` clean (no stopLossHit), no ticker >5% singleDayDrop (max BSR-2.40%) — gate fails 1/3.
- Watchlist-opp: no new BUY-qualifying signal on bus this cycle — gate fails, no `get_kinhdich_reading` triggered.
- CRITICAL-always: legal_risk clean (days=1/hours_back=6), crisis_early_warning clean (reputation DANGER DPM/PLX=20, KDC=22 — same tier as prior cycles), no verified_chain.
- Regime: NEUTRAL (fallback — macro_snapshot JSON shape, investment-clock score=8/CORE_VN) | Carry: NEUTRAL (1.37%) | vol_regime ELEVATED (rv_20d_pctile=0.789) | Pivot window: false (next Sept 2026)
- Market OPEN (VN-Index 1781.69 +0.25%, breadth 129up/178down) — tick-snapshot hit (cycle-snapshot-06:38.json, ~1min fresh) — macro+context from snapshot; macro_calendar/alerts/vol/foreign_room/legal_risk/crisis/agent_signals/market_snapshot called live; `get_vn_liquidity_state` SKIP (macro-indicators service unavailable). Silent exit — no MARKET/WORK send. `log_agent_work` id=1755.
