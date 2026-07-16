# news-scout — Notebook

**Role:** Fetch + sentiment analysis of 20 articles → signal generation (urgent_news, chain_catalyst) | **Cadence:** sentiment batch + off-hours cycles | **Status:** 145 cycles complete (c145 shipped)

**Runbook:** dedup gate (180min TTL), regime multiplier (NEUTRAL/BULLISH/BEARISH), coverage-state sweep (48h stale check).

---

## c142 · 2026-07-15T20:09Z (off-hours, slot=news-scout-offhours)

**20 articles fetched & analyzed: Foreign investor heavy selling FPT/PNJ tech (6/10 neutral bearish) + VN-Index drop below 1800 support (9/10 bearish, market crisis) + Artex securities capital raise 1000B VND (8/10 bullish) + Argentina stock outperform (9/10 bullish). Signals: 4 posted — urgent_news FPT foreign selloff (#8116, impact=7, hot_money_risk=true, ttl=120m) + urgent_news PNJ (#8117, impact=6, ttl=120m) + chain_catalyst market macro downturn (#8119, impact=9, critic=0.8, bearish, affected=58_watchlist, ttl=120m) + urgent_news VCI bullish (#8118, impact=8, ttl=120m). Market sentiment z=+0.376 EMA=0.869 (bullish). Regime: NEUTRAL. Carry: UNKNOWN. Yield: CHEAP (+3.2pp). Coverage: 58 tickers. Cycle status: SHIPPED (4 signals).**

---

## c143 · 2026-07-16T00:08Z (off-hours, slot=news-scout-offhours)

**20 articles fetched & analyzed: VN-Index thủng 1800 (9/10 bearish macro) + FPT/PNJ foreign tech selling (6/10 bearish) + bullish corporates (Dragon Capital, Artex, BVBank, Argentina). Signals: 2 posted — chain_catalyst market macro #8135 (impact=9, crisis, 58 watchlist) + urgent_news FPT #8136 (impact=7, hot_money_risk=true). Market sentiment z=+0.153 EMA=0.814 slightly bullish. Regime: NEUTRAL. Carry: UNKNOWN. Yield: CHEAP. Coverage: 58 tickers current. Cycle status: SHIPPED (2 signals).**

---

## c145 · 2026-07-16T05:07Z (market-hours, slot=news-scout-sentiment)

**20 articles fetched & analyzed: VN-Index 1800 breach cascading (9/10 bearish crisis, 58 watchlist) + Q2 earnings surge bullish (8/10 bullish earnings, tech/logistics multifold) + Gold world fund liquidation portfolio rebalancing (7/10 bullish gold, PNJ impact neutral) + Argentina equity surge risk appetite rotation (9/10 bullish EM volatility). Signals: 3 posted — chain_catalyst VN-Index crisis #8212 (impact=9, crisis, bearish, 10 watchlist core, hot_money_risk=true) + chain_catalyst Q2 earnings #8211 (impact=8, earnings, bullish recovery, 4 watchlist) + chain_catalyst Argentina macro #8213 (impact=9, macro, bearish, FII reversal risk). Market sentiment z=+0.138 EMA=0.758 bull_ratio=28.3% bear=21.9% neutral=49.7%. Regime: NEUTRAL (Brent $84.5 neutral, Gold $4039.8 bullish safe-haven, USD/VND 26070 bearish import pressure). Yield: CHEAP (+3.2pp EY 8.2% vs deposit 5%). Coverage: 58 tickers. Cycle status: SHIPPED (3 signals).**

---

## c146 · 2026-07-16T08:08Z (off-hours, slot=news-scout-offhours)

- Items: 20 fetched | Impacts: FPT +9 bullish (Q2 earnings), Exchange rate +7 bearish (macro VND depreciation), Gold world fund +4 neutral | Signals: 2 posted (urgent_news FPT #8237, chain_catalyst VND-depreciation #8238) | Regime: NEUTRAL | Carry: NEUTRAL
- Market sentiment z=+0.507 EMA=0.849 bull_ratio=27.7% bear=20.4% neutral=51.9% (77 articles 5d, confidence=0.8, SUFFICIENT)
- Evidence: 3 fragments recorded (FPT bullish 0.9/0.9, VND neutral 0.3/0.5, MARKET bullish 0.5/0.6)
- Coverage: 58 tickers all current (<3h prior). Dedup: SELF_SIGNALS_CACHE=0 conflicts, SIBLING=0 conflicts. Exec-proof PASS. Cycle SHIPPED (2 signals).

---

## c147 · 2026-07-16T12:09Z (off-hours, slot=news-scout-offhours)

- Items: 20 fetched & analyzed | Impacts: PVcomBank UPCoM (10/10 bullish banking), Foreign capital buying (9/10 bullish), NVL recovery (8/10 bullish real_estate), FPT earnings (7/10 bearish tech) | Signals: 3 files written to docs/signals/ (news_impact_pvcombank_upcom.json, news_impact_foreign_inflow.json, news_impact_novaland_recovery.json) | Regime: NEUTRAL | Carry: UNKNOWN
- Market sentiment z=+1.359 EMA=+1.066 (BULLISH, 60d strong) bull_ratio=30.3% bear=18.9% neutral=50.8%. Macro snapshot VALID: Brent $84.64 neutral, Gold $4034.2 bullish, USDVND 26070 bearish depreciation. Yield: FAIRLY_VALUED.
- Coverage: 58 tickers all current from c146. Dedup: SELF_SIGNALS_CACHE empty, SIBLING_WINDOW_CACHE=0 legal/urgent conflicts. Cycle status: SIGNALS WRITTEN (off-hours flow, signal_files written, post pending).

---

## c148 · 2026-07-16T16:09Z (off-hours, slot=news-scout-offhours)

- Items: 20 fetched | Impacts: PVcomBank UPCoM (10/10 bullish banking), NVL recovery (8/10 bullish real_estate), VIC Vingroup (8/10 bullish), FPT contracts (7/10 neutral tech) | Signals: 3 posted — urgent_news NVL #8290, urgent_news VIC #8291, chain_catalyst banking #8292 | Regime: NEUTRAL | Carry: NEUTRAL
- Market sentiment z=+1.20 EMA=+1.024 (BULLISH, 70d strong) bull_ratio=29.7% bear=18.8% neutral=51.5%. Macro: Brent $84.81 neutral, Gold $4008 bullish safe-haven, USDVND 26070 bearish depreciation. Yield: FAIRLY_VALUED (spread +1.64pp).
- Evidence: 4 fragments recorded (MARKET bullish, FPT neutral, VIC bullish, NVL bullish). Coverage: 58 tickers current. Dedup: SELF_SIGNALS_CACHE empty, SIBLING_WINDOW=0 conflicts. Cycle SHIPPED (3 signals).
