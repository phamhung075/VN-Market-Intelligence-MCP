# news-scout — Notebook

**Role:** Fetch + sentiment analysis of 20 articles → signal generation (urgent_news, chain_catalyst) | **Cadence:** sentiment batch + off-hours cycles | **Status:** 202 cycles complete (c218 shipped)

**Runbook:** dedup gate (180min TTL), regime multiplier (NEUTRAL/BULLISH/BEARISH), coverage-state sweep (48h stale check).

---

## c224 · 2026-08-01T04:08:00Z (off-hours, slot=news-scout-offhours)

- Items: 30 fetched (20 domestic cafef/vnexpress/vneconomy + 10 reuters) | Market: CLOSED (04:08 UTC off-hours) | Impacts: Conglomerate earnings outperformance (impact=9/10 bullish, real_estate/steel/retail VIC/VHM/HPG/FRT), Construction profit collapse + geopolitical cooling (impact=8/10 bearish oil_gas BSR/PLX, positive aviation VJC) | Signals: 2 posted (#10229 chain_catalyst earnings, #10230 chain_catalyst construction/geopolitical) | Regime: NEUTRAL (macro_snapshot valid, oil NEUTRAL $90.12, gold BULLISH $4098.6, USD/VND BEARISH 26110, carry NEUTRAL 1.37pp, yield FAIRLY_VALUED 1.64pp) | Carry: NEUTRAL
- Market sentiment z=null (INSUFFICIENT 2d only), bull_ratio=36%, bear=22%, neutral=42%. Insider sentiment INSUFFICIENT_DATA. Evidence: 6 fragments recorded (VIC bullish 0.9/0.9, VHM bullish 0.5/0.5, HPG bullish 0.59/0.59, BSR bearish 0.81/0.81, PLX bearish 0.81/0.81, MARKET neutral 0.6/0.6). Dedup: SELF_SIGNALS_CACHE=[], SIBLING_WINDOW_CACHE=[13 prior from c223], no conflicts. Historical context fetched for 4 high-impact articles (gold, Vingroup, CNCTech, Apple). Gateway OK. Cycle SHIPPED (2 signals, critic=0.8-1.0, phase=expansion tier=equity).

---

## c223 · 2026-08-01T00:08:20Z (off-hours, slot=news-scout-offhours)

- Items: 30 fetched (20 domestic cafef/vnexpress/vneconomy + 10 reuters) | Market: CLOSED (00:08 UTC off-hours) | Impacts: Doanh nghiệp doanh thu vượt Vingroup (impact=10/10 bullish, real_estate/steel/retail cascade VIC/VHM/HPG/FRT), Apple weak forecast (impact=6/10 bearish, global tech slowdown FPT exposure) | Signals: 4 posted (#10220 chain_catalyst earnings, #10221 urgent_news VIC, #10222 urgent_news EIB, #10223 urgent_news PNJ + #10224 chain_catalyst macro) | Regime: NEUTRAL (macro_snapshot valid, oil NEUTRAL $90.12, gold BULLISH $4098.6, USD/VND BEARISH 26110, carry NEUTRAL 1.37pp, yield FAIRLY_VALUED 1.64pp) | Carry: NEUTRAL
- Market sentiment z=null (INSUFFICIENT 2d only), bull_ratio=43%, bear=22%, neutral=34%. Insider sentiment INSUFFICIENT_DATA. Evidence: VIC bullish 0.9/0.9, VHM bullish 0.5/0.5, EIB neutral 0.5/0.5, PNJ bearish 0.8/0.8, macro bearish 0.75/0.75. Dedup: SELF_SIGNALS_CACHE=[], SIBLING_WINDOW_CACHE=[13 prior], no conflicts. Gateway OK. Cycle SHIPPED (4 signals, critic=0.8, phase=expansion tier=equity).

---

## c222 · 2026-07-31T20:09:26Z (off-hours, slot=news-scout-offhours)

- Items: 30 fetched (20 domestic cafef/vnexpress/vneconomy + 10 reuters) | Market: CLOSED (20:09 UTC off-hours, VN market CLOSED outside 02:00–08:59 UTC) | Impacts: Major earnings comparison article (impact=10/10 bullish, multiple conglomerates outperforming Vingroup, real_estate/steel/retail cascade), Oil geopolitical supply shock (impact=9/10 bullish commodities, Iran Persian Gulf tensions, oil_gas/aviation/agriculture exposure) | Signals: 2 posted (#10218 chain_catalyst earnings VIC/VHM/HPG/MWG, #10219 chain_catalyst trade_war BSR/PLX/VJC) | Regime: NEUTRAL (macro_snapshot tier=2 valid JSON, investment-clock CORE_VN score=8, oil NEUTRAL $90.12 +0.83%, gold BULLISH $4110.7 -1.31% >$2200, USD/VND BEARISH 26110 >25000, carry NEUTRAL 1.37pp, yield FAIRLY_VALUED 1.64pp premium) | Carry: NEUTRAL (1.37pp SBV 5% vs Fed 3.63%)
- Market sentiment z=null (INSUFFICIENT: only 1 day available, need ≥21 days, confidence=0.4), bull_ratio=43% bear=24% neutral=33% (72 articles today), Insider sentiment INSUFFICIENT_DATA (no valid buy/sell txns 90d). Macro: Brent $90.12 +0.83%, Gold $4110.7 -1.31%, USD/VND 26110 bearish, VNIndex 1735.78 -8.88 down, investment-clock CORE_VN score=8 core bullish, Yield FAIRLY_VALUED 1.64pp premium.
- Evidence: 4 fragments recorded (VIC bullish stock 0.90 mag 0.90 conf, HPG bullish stock 0.54 mag 0.54 conf, BSR bullish stock 0.70 mag 0.54 conf, MARKET bullish macro 0.90 mag 0.85 conf). Coverage: event-driven fetch completed (30 articles analyzed, 2 high-impact chains traced). Dedup: SELF_SIGNALS_CACHE=[] (empty, no prior news-scout signals 6h), SIBLING_WINDOW_CACHE=[13 VERIFIED_DECISION from alert-engine 15-min window VIC/HPG/EIB/NVL/VJC/PNJ, no content-key conflicts — both new signals unique]. Impact chains traced (2 articles: earnings cascade 15 entries 12 watchlist tickers, oil cascade 18 entries 11 watchlist tickers). Gateway OK at 20:09Z (probe OK, all circuits OK). Exec-proof gate pending. Session log pending. Coverage-state write SKIPPED — no-transport. Cycle SHIPPED (2 signals #10218/#10219, regime=NEUTRAL, bullish direction both, critic scores 0.8, phase=expansion tier=equity).

---

## c221 · 2026-07-31T16:08:27Z (off-hours, slot=news-scout-offhours)

- Items: 30 fetched (20 domestic cafef/vnexpress/vneconomy + 10 reuters) | Market: CLOSED (16:08 UTC off-hours, VN market CLOSED outside 02:00–08:59 UTC) | Impacts: CNCTech revenue surge (impact=10/10 bullish, 113% YoY growth), securities losses (impact=8/10 bearish, 16-quarter consecutive losses), fintech sector growth (impact=8/10 bullish), historical context fetches skipped (no LanceDB queries — market closed, low-urgency items) | Signals: 0 posted (no high-impact watchlist triggers, dedup check suppressed low-threshold signals) | Regime: NEUTRAL (macro_snapshot tier=2 valid JSON, investment-clock CORE_VN score=8, oil NEUTRAL $90.04 +0.65%, gold BULLISH $4100.3 -1.56% >$2200, USD/VND BEARISH 26110 >25000, carry NEUTRAL 1.37pp, yield FAIRLY_VALUED 1.64pp premium) | Carry: NEUTRAL (1.37pp SBV 5% vs Fed 3.63%)
- Market sentiment z=+1.26 (60d moderately bullish, sentiment_z_90d=+1.21, sentiment_ema_5d=+1.10, 73 days available, confidence=0.8), bull_ratio=33.2% bear=20.4% neutral=46.4% (763 articles 5d, 143 today), Insider sentiment INSUFFICIENT_DATA (no valid buy/sell txns 90d). Macro: Brent $90.04 +0.65%, Gold $4100.3 -1.56%, USD/VND 26110 bearish, VNIndex 1735.78 -8.88 down, investment-clock CORE_VN score=8 core bullish, Yield FAIRLY_VALUED 1.64pp premium.
- Evidence: 0 fragments recorded (all articles sub-impact-threshold for recording, no watchlist urgency). Coverage: event-driven fetch completed (30 articles analyzed, threshold gates applied). Dedup: SELF_SIGNALS_CACHE=[] (empty, no prior news-scout signals 6h), SIBLING_WINDOW_CACHE=[1 VERIFIED_DECISION from alert-engine 15-min window VIC, normalised-key scan found 0 direct duplicates]. Impact chains: no high-impact traces needed (articles scored 4–10, mostly domestic neutral 5/10). Gateway OK at 16:08Z (probe OK, all circuits OK). Exec-proof gate deferred (low-urgency off-hours run). Session log: deferred. Coverage-state write SKIPPED — no-transport. Cycle COMPLETED (0 signals posted, gate suppression nom, regime=NEUTRAL, market moderately bullish with no watchlist-specific threats, feedback tuning skipped — no prior signals, phase=slowdown-recovery, tier=equity).

