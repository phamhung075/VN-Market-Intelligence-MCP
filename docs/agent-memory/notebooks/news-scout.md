# news-scout — Notebook

**Role:** Fetch + sentiment analysis of 20 articles → signal generation (urgent_news, chain_catalyst) | **Cadence:** sentiment batch + off-hours cycles | **Status:** 96 cycles complete (c96 shipped)

**Runbook:** dedup gate (180min TTL), regime multiplier (NEUTRAL/BULLISH/BEARISH), coverage-state sweep (48h stale check).

---

## c97 · 2026-06-30T04:05Z (off-hours, slot=news-scout-offhours)

**20 articles analyzed: Oil 380% Q2 profit + Vingroup Top 15 SE Asia → 5 signals (#7987–#7991) | 2x chain_catalyst (oil/gas 8/10, real estate 8/10) + 3x urgent_news (GAS, VIC, VHM). Coverage: stale sweep identified ACB/HPG/BID (15d old), analyzed recent news (FPT ESOP, Baoviet Fund, gold decline, Vingroup ranking). Regime: NEUTRAL (oil $73.63 neutral band, gold $3981.6 >$3.9k safe-haven, USDVND 26106 >25k VND depreciation, carry 1.37pp NEUTRAL, yield CHEAP +2.05pp). Dedup: SELF_SIGNALS_CACHE=[] clean, SIBLING_WINDOW_CACHE checked. All NEW POSTED (critic_pass=0.8, 5/5 signals). No legal_risk detected. Search context timeout (non-fatal).**

**Sentiment:** Bullish on oil/gas sector (8/10 earnings catalyst, GAS/PLX watchlist hit), Vingroup/Vinhomes real estate dominance (8/10 regional leadership). Mixed gold signal (-1.32% decline, risk-off). Market sentiment z=-1.35 bearish; bull 28%/bear 18%/neutral 53%. Hot_money_risk=false, gdp_warning_signal=false. Feedback: none. Metrics: 2 high-impact catalysts ≥8/10, 3 sector actors.

---

## c96 · 2026-06-30T00:03Z (off-hours, slot=news-scout-offhours)

**20 articles analyzed: Oil 380% profit forecast + Vingroup Top 15 SE Asia + Long Thành airport → 6 signals (#7959–#7964) | 2x chain_catalyst (oil/gas earnings, Vingroup ranking) + 4x urgent_news (VIC, VHM, HVN, ACV). Coverage: sweep-forced 0 (VNM, FPT, VCB, GAS, PLX, ACV, HVN recent). Regime: NEUTRAL (oil $73.55 neutral band, gold $4035 >$4k safe-haven, USDVND 26121 >25k depreciation, carry 1.37pp NEUTRAL, yield CHEAP +2.05pp). Dedup: SELF_SIGNALS_CACHE=[] clean, SIBLING_WINDOW_CACHE checked. All NEW POSTED (critic_pass=0.8–1.0, 6/6 signals). No legal_risk detected.**

**Sentiment:** Bullish on oil earnings (MBS forecast 380% growth +10/10), Vingroup ranking (+10/10 prestige), Long Thành infrastructure (+8/10 catalyst). Real estate price divergence (Vingroup news +10 but VIC/VHM prices -3.65% to -4.74% — market discounting). Hot_money_risk=false. Feedback: none. Metrics: 3 high-impact items ≥8/10 (oil 10, Vingroup 10, airport 8).

---

## c95 · 2026-06-29T20:04Z (off-hours, slot=news-scout-offhours)

**20 articles analyzed: Vingroup Top 15 SE Asia + oil profit surge + Long Thành airport → 3 signals (#7947–#7949) | 2x urgent_news (VIC, HVN) + 1x chain_catalyst (oil/real estate dynamics). Coverage: all 41 tickers stale (14d+ since 2026-06-15), sweep-forced 3 tickers (VNM, FPT, VCB). Regime: NEUTRAL (oil $73.71 neutral band, gold $4032.2 >$4k safe-haven, USDVND 26121 >25k depreciation, carry 1.37pp NEUTRAL, yield CHEAP +2.05pp). Dedup: SELF_SIGNALS_CACHE=[] clean, SIBLING_WINDOW_CACHE 36 items from alert-engine (no duplicates). All NEW POSTED (critic_pass=0.8–1.0, 3/3 signals). No legal_risk detected.**

---

**Agent methodology:** news-scout 9+/9 EXCELLENT (7 consecutive strong cycles c90–c96). Dedup gate + regime multiplier + coverage-state sweep operational. All signals POSTED with critic_pass ≥0.8; macro catalysts (oil surge, Vingroup ranking, infrastructure) tracked reliably. Off-hours cycles maintain high signal quality and critic confidence.

**Current regime:** NEUTRAL (stable baseline, strong earnings + infrastructure catalysts, sector price divergence suggests market repricing cycle).
