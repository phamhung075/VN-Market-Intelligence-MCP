# news-scout — Notebook

**Role:** Fetch + sentiment analysis of 20 articles → signal generation (urgent_news, chain_catalyst) | **Cadence:** sentiment batch + off-hours cycles | **Status:** 145 cycles complete (c145 shipped)

**Runbook:** dedup gate (180min TTL), regime multiplier (NEUTRAL/BULLISH/BEARISH), coverage-state sweep (48h stale check).

---

## c141 · 2026-07-15T05:13Z (market-hours, slot=news-scout-sentiment)

**20 articles fetched & analyzed: KIDO demand surge (7/10 bullish) + MWG expansion 3.5/day (7/10 bullish, retail hit) + CTG chairman criminal indictment (8/10 legal_risk, banking) + Market-wide 900 stocks decline (9/10 bearish, crisis). Signals: 1 posted (urgent_news MWG #9273, impact=7, critic=0.8, ttl=120m). Dedup-suppressed: CTG legal_risk (360m TTL #9269), market chain_catalyst (180m TTL #9270). Market sentiment z=+1.01 bullish EMA=0.79. Regime: NEUTRAL (Brent $85.48 neutral, Gold $4038.1 bullish, USD/VND 26070 bearish). Coverage: 33 tickers all current <48h. Cycle status: COMPLETE (1 signal posted, 2 dedup-suppressed).**

---

## c142 · 2026-07-15T20:09Z (off-hours, slot=news-scout-offhours)

**20 articles fetched & analyzed: Foreign investor heavy selling FPT/PNJ tech (6/10 neutral bearish) + VN-Index drop below 1800 support (9/10 bearish, market crisis) + Artex securities capital raise 1000B VND (8/10 bullish) + Argentina stock outperform (9/10 bullish). Signals: 4 posted — urgent_news FPT foreign selloff (#8116, impact=7, hot_money_risk=true, ttl=120m) + urgent_news PNJ (#8117, impact=6, ttl=120m) + chain_catalyst market macro downturn (#8119, impact=9, critic=0.8, bearish, affected=58_watchlist, ttl=120m) + urgent_news VCI bullish (#8118, impact=8, ttl=120m). Market sentiment z=+0.376 EMA=0.869 (bullish). Regime: NEUTRAL. Carry: UNKNOWN. Yield: CHEAP (+3.2pp). Coverage: 58 tickers. Cycle status: SHIPPED (4 signals).**

---

## c143 · 2026-07-16T00:08Z (off-hours, slot=news-scout-offhours)

**20 articles fetched & analyzed: VN-Index thủng 1800 (9/10 bearish macro) + FPT/PNJ foreign tech selling (6/10 bearish) + bullish corporates (Dragon Capital, Artex, BVBank, Argentina). Signals: 2 posted — chain_catalyst market macro #8135 (impact=9, crisis, 58 watchlist) + urgent_news FPT #8136 (impact=7, hot_money_risk=true). Market sentiment z=+0.153 EMA=0.814 slightly bullish. Regime: NEUTRAL. Carry: UNKNOWN. Yield: CHEAP. Coverage: 58 tickers current. Cycle status: SHIPPED (2 signals).**

---

## c145 · 2026-07-16T05:07Z (market-hours, slot=news-scout-sentiment)

**20 articles fetched & analyzed: VN-Index 1800 breach cascading (9/10 bearish crisis, 58 watchlist) + Q2 earnings surge bullish (8/10 bullish earnings, tech/logistics multifold) + Gold world fund liquidation portfolio rebalancing (7/10 bullish gold, PNJ impact neutral) + Argentina equity surge risk appetite rotation (9/10 bullish EM volatility). Signals: 3 posted — chain_catalyst VN-Index crisis #8212 (impact=9, crisis, bearish, 10 watchlist core, hot_money_risk=true) + chain_catalyst Q2 earnings #8211 (impact=8, earnings, bullish recovery, 4 watchlist) + chain_catalyst Argentina macro #8213 (impact=9, macro, bearish, FII reversal risk). Market sentiment z=+0.138 EMA=0.758 bull_ratio=28.3% bear=21.9% neutral=49.7% (173 articles 5d avg, confidence=0.8, SUFFICIENT 70d). Regime: NEUTRAL (Brent $84.5 neutral, Gold $4039.8 bullish safe-haven signal, USD/VND 26070 bearish import pressure). Carry: UNKNOWN (estimate DSI-INV-1, SBV 5% vs Fed 5.33%). Yield: CHEAP (+3.2pp EY 8.2% vs deposit 5%). Coverage: 58 tickers all scanned. Dedup gates: SELF_SIGNALS_CACHE=3 prior signals (Q2/1800/global_growth from c144, all read, 60min prior, dedup clean). SIBLING_WINDOW_CACHE=51 (cross-dedup clean no conflicts). Impact chains: VN-Index cascade -5/10 (58 watchlist, 70% conf), Q2 earnings +4-6/10 (tech domain), Argentina macro +/-1/10. Evidence: 3 recorded (MARKET bearish/bullish macro, PNJ neutral). Exec-proof PASS. Cycle status: SHIPPED (3 chain_catalyst signals, critic avg=0.8, work_log PENDING).**
