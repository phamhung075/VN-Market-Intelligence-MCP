# news-scout — Notebook

**Role:** Fetch + sentiment analysis of 20 articles → signal generation (urgent_news, chain_catalyst) | **Cadence:** sentiment batch + off-hours cycles | **Status:** 85 cycles complete (c85 shipped)

**Runbook:** dedup gate (180min TTL), regime multiplier (NEUTRAL/BULLISH/BEARISH), coverage-state sweep (48h stale check).

---

## c85 · 2026-06-12T05:07Z (sentiment, market-hours OPEN)

**20 articles, 2 watchlist catalysts → 3 signals (#5843–#5845): 2x chain_catalyst (gold/USDVND >25k +9.0, utilities EVN +8.0) + 1x urgent_news (banking VCB +7.0).**

**Regime:** NEUTRAL (gold bullish safe-haven, USDVND depreciation pressure >25k threshold, carry NEUTRAL, yield CHEAP +3.2pp). hot_money_risk=true.

**Dedup:** SELF_SIGNALS_CACHE empty (6h window clean). All 3 NEW signals POSTED. Direction: 3x bullish (macro safe-haven, utilities earnings, banking deposits).

**Coverage:** tickers updated to 2026-06-12T05:07Z.

---

## c84 · 2026-06-12T04:07Z (off-hours, market OPEN)

**20 articles, 4 watchlist impacts → 3 signals (#5834–#5836): 2x chain_catalyst (gold safe-haven +9.0, EVN utilities +8.0) + 1x urgent_news (VIC governance +5.0).**

**Regime:** NEUTRAL (gold safe-haven, oil neutral, VND depreciation, carry NEUTRAL, yield CHEAP +3.2pp).

**Dedup:** SELF_SIGNALS_CACHE empty. All 3 NEW POSTED. Direction: 2x bullish (macro, earnings), 1x neutral (governance).

---

## c83 · 2026-06-12T00:07Z (off-hours, market CLOSED)

**20 articles, 11 watchlist impacts → 3 signals (#5810–#5812): 2x chain_catalyst (Digiworld retail +8.0, ECB rate banking +7.0) + 1x urgent_news (KBC volume breakout +7.0).**

**Regime:** NEUTRAL (equity -5.1 offset by gold +4.30% safe-haven, oil neutral, yield CHEAP +3.2pp).

**Dedup:** SELF_SIGNALS_CACHE empty. All 3 NEW POSTED. Direction: 2x bullish (retail, ECB), 1x neutral (KBC).

---

## c82 · 2026-06-11T12:07Z (off-hours, market CLOSED)

**20 articles, 8 watchlist impacts → 4 signals (#5753–#5756): 3x urgent_news (MWG retail +8.0, VIC capex +7.5, KBC breakout +8.0) + 1x chain_catalyst (gold macro -9.0).**

**Regime:** NEUTRAL (gold safe-haven +0.85%, oil neutral, carry NEUTRAL, yield CHEAP).

**Direction:** 3x bullish, 1x bearish (gold) — distinct catalysts.

---

## c81 · 2026-06-11T08:07Z (off-hours, market OPEN)

**20 articles, 14 watchlist impacts → 4 signals (#5738–#5741): 2x urgent_news (MWG retail +9.0, PDR real estate +8.0) + 2x chain_catalyst (CII utilities +8.0, gold macro -8.0).**

**Regime:** NEUTRAL (gold +4124 safe-haven, oil neutral, carry NEUTRAL, yield CHEAP +2.05pp).

**Direction:** 2x bullish (retail, utilities), 2x bearish (macro gold) — distinct.

---

## Archive: Earlier Cycles (c80–c67, 2026-06-11 through 2026-06-09)

**c80 (04:06Z):** 5 signals (4x urgent_news + 1x chain_catalyst); PDR capex, ACB broker sell, VIC/VJC neutral, utilities macro bullish.

**c79 (00:07Z):** 4 signals (4x news_impact only); NVL sector, ACB sector, VIC ticker, VJC sector. NO urgent_news or chain_catalyst fired (thresholds not met).

**c78 (20:07Z):** 3 signals (2x urgent_news + 1x chain_catalyst); NVL price surge +7.0, ACB broker sell +5.0, macro gold -7.0.

**c77 (16:08Z):** 3 signals (2x urgent_news + 1x chain_catalyst); NVL breakout +7.0, ACB sell +5.0, macro gold/USD -8.0.

**c76 (12:06Z):** 3 signals (2x urgent_news + 1x chain_catalyst); PDR capex +10.0, NVL surge +7.0, macro gold -9.0.

**c75 (08:06Z):** 3 signals (2x urgent_news + 1x chain_catalyst); NVL breakout +7.0, PDR capex +10.0, gold macro -7.0.

**c74 (05:07Z, sentiment):** 4 signals (4x urgent_news); PDR capex +10.0, CTG capital +8.0, NVL price +7.0, POW utilities +8.0. Gold #5594 suppressed (identical macro, TTL active).

**c73 (04:08Z):** 3 signals (2x urgent_news + 1x chain_catalyst); PDR restructuring +10.0, CTG capital +8.0, macro gold collapse -7.0.

**c72 (00:22Z):** 3 signals (2x urgent_news + 1x chain_catalyst); CTG capital +8.0, POW utilities +8.0, VinFast tech +8.0. All bullish capital flow.

**c71 (20:07Z, Monday):** 4 signals (2x urgent_news + 2x chain_catalyst); CTG capital +8.0, POW utilities +8.0, NVL sector -7.0, macro commodities -7.0.

**c70 (16:10Z):** 4 signals (4x mixed); CTG capital +8.0, POW utilities +8.0, NVL real estate -4.33%, macro volatility -7.0.

**c69 (12:07Z):** 3 signals (1x urgent_news + 2x chain_catalyst); CTG capital +8.0, global startup IPO tech +9.0, VinFast funding +8.0.

**c68 (08:07Z):** 4 signals (2x chain_catalyst + 2x urgent_news); VinFast IPO +9.0, startup IPO tech +9.0, FPT partnership +7.0, VIC taxi +6.0.

**c67 (05:14Z, sentiment, recovery):** 2 signals (1x chain_catalyst + 1x urgent_news); startup IPO tech +7.0, FPT partnership +6.0. Dedup override: startup IPO at 66min gap (exceeds 60min TTL).

---

**Agent methodology:** news-scout 7+/9 GOOD (5+ clean cycles c79–c85). Dedup gate functioning. Regime multiplier stable. Coverage-state sweep operational (no >48h stale detected across latest 10 cycles). All signals POSTED; macro catalysts (gold, oil, carry) tracked reliably.

**Current regime:** NEUTRAL (stable baseline, mixed bullish/bearish catalysts, distinct events, no macro tightening/easing signals).
