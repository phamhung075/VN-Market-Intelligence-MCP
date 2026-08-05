# Alert Commander — Notebook

**Last updated:** 2026-08-05 02:10 UTC | **Sprint:** FIX-DEPTHTHIN-B-GATEWAY-TA-PATH-REWRITE

**Role:** Event-only alert dispatch (position-danger / watchlist-opportunity / CRITICAL-always) | **Cadence:** `*/15min` market hours (02:00–08:30 UTC) + 4h critical sweep | **Contract:** APPEND class, one `## c<NNN>` section per cycle per `.claude/skills/notebook-write/SKILL.md` AC-6.

> **Structural reset (FIX-ALERT-COMMANDER-NOTEBOOK-SINGLE-BLOB-UNPRUNABLE, 2026-07-29):** prior history archived → `docs/agent-memory/notebooks/archive/alert-commander-archive-20260729.md`. One top-level `## c<NNN> · <ISO-timestamp>` section per cycle now.

## c28 · 2026-08-01T16:09:57Z (slot=alert-commander-critical, tick=16:07)
- Signals: 0 new (`get_agent_signals(status=unread)` clean) | Fired: 0 | Suppressed: 0 | MARKET: 0
- Position-danger: `get_alerts(type=price)` clean (no stopLossHit) — gate fails on condition 1/3.
- Watchlist-opp: live `get_kinhdich_reading` DIG(BÁN 25%), VNM(GIỮ 100%), EIB(GIỮ tiêu cực 25%), HPG(GIỮ 63%), PLX(GIỮ 100%), BSR(GIỮ 100%), VIC(THẬN TRỌNG 50%), FPT(GIỮ 63%), VCB(BÁN 100%), NVL(GIỮ 100%) — none BUY — gate fails.
- CRITICAL-always: legal_risk clean (days=1/hours_back=6), crisis_early_warning clean (no crisis threshold exceeded; 19 tickers <50 reputation, DPM/KDC/PLX DANGER unchanged, BSR=37 deteriorating unchanged from c27), no verified_chain/chain_catalyst/unread urgent_news on bus.
- Regime: NEUTRAL (fallback — macro_snapshot JSON shape, no literal Global-Liquidity line) | Carry: NEUTRAL (1.37%) | vol_regime ELEVATED (rv_20d_pctile=0.789) | Pivot window: false (next Sept 2026)
- Market CLOSED (off-hours critical sweep; VN-Index 1735.78 -8.88pt vs prior, prices as of 2026-07-31 09:00Z close) — no tick-snapshot for 16:07 today — bootstrap/macro/context/alerts/agent_signals/legal_risk/crisis/kinhdich×10/vol/liquidity/foreign_room/macro_calendar/watchlist all called live.

## c29 · 2026-08-05T00:12:22Z (slot=alert-commander-critical, tick=00:08)
- Signals: 3 bus rows (10345 urgent_news/VIC impact10, 10346 urgent_news/PLX impact8, 10347 chain_catalyst market-wide) | Fired: 0 | Suppressed: 3 | MARKET: 0
- ChainCatalyst: 0 fired | 1 suppressed | event: VN-Index~1800 rally recap, foreign net-buy — no named external trade/macro/geopolitical catalyst, no ticker — fails carve-out (2026-07-23 precedent), regime_adj_score=8 cleared NEUTRAL 0.75 threshold otherwise.
- Position-danger: `get_alerts(type=price)` clean (no stopLossHit) — gate fails 1/3.
- Watchlist-opp: live `get_kinhdich_reading` VIC(GIU 37%), PLX(GIU 37%), FPT(GIU 37%), VHM(THAN TRONG 75%), VRE(GIU tieu cuc 66%), DIG(GIU 37%), VCB(GIU tieu cuc 25%), HPG(GIU 37%), NVL(GIU 100%), BSR(GIU 37%), EIB(GIU 100%), VNM(GIU 100%) — none BUY — gate fails.
- CRITICAL-always: legal_risk clean (days=1/hours_back=6), crisis_early_warning clean (23 tickers <50 reputation, DPM/PLX DANGER=20, KDC DANGER=22 — same tier as prior cycles), no verified_chain.
- Regime: NEUTRAL (fallback — macro_snapshot JSON shape, investment-clock score=8/CORE_VN) | Carry: NEUTRAL (1.37%) | vol_regime ELEVATED (rv_20d_pctile=0.793) | Pivot window: false (next Sept 2026)
- Market CLOSED (off-hours sweep, pre-open; VN-Index 1777.23 +0.82%, breadth 165up/139down, EOD 2026-08-04 close) — tick-snapshot hit (cycle-snapshot-00:05.json, 1.5min fresh) — macro from snapshot, remaining tools called live (macro_calendar/context/alerts/vol/liquidity/foreign_room/legal_risk/crisis/agent_signals/kinhdich×11/market_snapshot).

## c30 · 2026-08-05T02:10:39Z (slot=alert-commander-market, tick=02:06)
- Signals: 11 on bus (2h) | Fired: 0 | Suppressed: 1 new (10350) | MARKET: 0
- ChainCatalyst: 0 fired | 1 new suppressed (10350 oil/Iran de-escalation, conf 0.70<0.75 NEUTRAL threshold) | 10347 carryover from c29 (unchanged, not re-processed)
- New unread: 10349 DPM urgent_news (pillars all neutral) — live `get_kinhdich_reading` DPM → GIU(HOLD) tich cuc 100%, not BUY — gate fails. 10345/10346 (VIC/PLX) carryover from c29, GIU 37% unchanged.
- Position-danger: `get_alerts(type=price)` clean (no stopLossHit), no ticker >5% singleDayDrop (max BSR+2.40%/FRT-1.80% per snapshot) — gate fails 1/3.
- CRITICAL-always: legal_risk clean (days=1/hours_back=6 + bus check), crisis_early_warning clean (reputation DANGER DPM/PLX=20, KDC=22 — same tier as c29), no verified_chain.
- Regime: NEUTRAL (fallback — macro_snapshot JSON shape) | Carry: NEUTRAL (1.37%) | vol_regime ELEVATED (rv_20d_pctile=0.789) | Pivot window: false (pivotWindowWarning null, next Sept 2026)
- Market OPEN (VN-Index 1777.23 flat, delta=0) — tick-snapshot hit (cycle-snapshot-02:04.json, ~1min fresh) — macro+context from snapshot; macro_calendar/alerts/vol/liquidity/foreign_room/legal_risk/crisis/agent_signals/kinhdich(DPM) called live. Silent exit — no MARKET/WORK send. `log_agent_work` id=1751.
