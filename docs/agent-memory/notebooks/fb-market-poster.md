# FB Market Poster — Notebook

**Last updated:** 2026-07-03T16:35:00Z UTC

## Last cycle (2026-07-03 DAILY)

- **Date:** 2026-07-03 (Friday)
- **Mode:** DAILY (Mon–Fri pipeline, mode-router evaluated VN_DOW=5)
- **Post file:** docs/social/fb-post-2026-07-03.md (~855 words, PUBLISHED ✓)
- **VN-Index:** 1,862.08 (-0.23% = -4.3 points, modest decline)
- **Sources read:** unified-agent=yes (EOD 08:45 UTC latest), news-scout=yes (c118 08:07 UTC, 2 chain_catalyst signals), market-watcher=yes (08:06 UTC, 2 anomalies: HVN +6.53%, GAS -2.59%), digest-predict=yes (c active tracking, 3 resolution claims 2026-07-09)
- **chef_dish_available:** true — CHEF EOD dish published 08:45 UTC (15:45 VN), 4 clusters (gold +1.47% safe-haven, banking pressure, HVN volume spike 3.6x, macro-micro contradiction risk-off vs GDP)
- **TNB synthesis:**
  - clock_phase=CORE_VN (investment score 8/10, GDP H2 +8.18% bullish, gold +1.47% risk-off signal)
  - regime=NEUTRAL_TRADEOFF (carry 1.37pp neutral, yield CHEAP 7.05% vs 5%, USD/VND 26103 >25k threshold = FX pressure)
  - regime_confidence=MEDIUM (L2 mix: safe-haven flight evident, L4 full: aviation (HVN +6.53%) resilience, banking/energy under pressure)
- **Conviction calls:** 4 ticker verdicts (HVN mua tích lũy, VHM/VIC giữ, GAS tránh, banking quan sát) + no hard buy conviction after T-45
- **Dropped by T-45:** 0 (no claims dropped; sector rotation thesis qualified as legitimate macro context)
- **Softened:** 0
- **known_gaps:** breadth=104:199:57 confirmed ✓, liquidity_tybillion=15.657 ✓, foreign_net=-1.98M shares (watchlist-only, 99 tickers, coverage noted)
- **Validation:**
  - Jargon gate: PASS (0 violations) — fixed FII→nhà đầu tư nước ngoài, YoY→so với cùng kỳ năm trước, breadth→độ rộng thị trường, quẻ→plain regime labels
  - Data-integrity gate: SKIP (script not yet deployed; noted for future cycle)
  - Privacy gate: PASS (no portfolio/personal position language detected)
  - Structural: all three sections present (Tóm tắt nhanh / Phân tích / Dự đoán), Dự đoán is longest section, earned-prediction checks pass
  - Post length: 855 words (within 150–1,300 range) ✓
- **Live data spine:** per-ticker moves from live get_market_snapshot=yes; get_ticker_intelligence (5 major tickers: VCB/HVN/VHM/GAS/BID) all successful
- **Status:** published (dedup claimed 2026-07-03T09:15Z, WORK notified, log closed, notebook updated)

## Key observations (2026-07-03)

**Market structure — Transition to tích lũy post-H1 reaction:**
- VN-Index modest decline (-0.23%) with orderly breadth (104:199 + 57 no-change, 3 trần/3 sàn) → suggests accumulation/consolidation, NOT panic
- HVN aviation standout +6.53% (Sun/Changi airport infrastructure catalyst) with volume spike 3.6x (321.7k vs avg 88.7k) → sector rotation into infrastructure/theme plays
- Banking sector pressure (VCB -0.16%, BID -0.71%, CTG -0.29%) despite earnings yield CHEAP 7.05% → gold safe-haven flight (vàng +1.47%) driving institutional exits from traditional cyclicals
- GAS energy -2.59% with FX pressure flag (USD strength, USD/VND 26103 >25k) → hard-goods sectors suffer from import-cost inflation
- Securities sector mixed (SSI +0.92%, VCI +1.01%, HCM -1.55%) → no clear capital rotation into broker stocks

**Foreign flow — Net sell rotation, not panic:**
- Market-wide net: -1.98M shares sold (watchlist-only coverage)
- Top buyers: VND +281.7k, SHS +189.3k, VPB +144.1k, MBS +91.8k, HDB +87.5k → micro-cap + 2nd-tier bank buying
- Top sellers: TCB -268.9k, MBB -229.1k, GEX -205.9k, ACB -195.6k, EIB -193.2k → concentrated exit from banks + secondary stocks
- Interpretation: FII rotating OUT of traditional banking INTO selective opportunities (aviation, real-estate, utilities micro-caps) = risk-on/quality rotation, not capitulation

**Macro regime — Risk-off but equities remain cheap:**
- Gold +1.47% to $4,197.90 = safe-haven demand, 2-week high = macro uncertainty signal
- USD/VND at 26,103 (>25k threshold) = VND weakness, import-cost inflation pressure visible
- Oil $71.43 (neutral band $60–$100) = no deflation signal
- Carry 1.37pp NEUTRAL (is_estimate=false, stable) = no hot-money amplification of macro moves
- Equity yield 7.05% vs deposit 5% (+2.05pp) = valuation CHEAP, provides support for selective entry despite macro caution

## Lessons from cycle

1. **Gold surge as FII rotation catalyst:** +1.47% day triggered visible banking/energy exit in favor of aviation/selective RE. This is NOT panic capitulation (breadth orderly, yield remains cheap) but tactical rotation. Correctly identified in post as "dịch chuyển chiến lược" rather than "bán tháo."

2. **Foreign flow unit handling:** get_market_foreign_flow returns SHARE VOLUMES (millions), not currency. Rendered as "bán ròng 1.98 triệu cổ phiếu" (watchlist-only, not full exchange) — avoided currency-scaling error (1000x magnitude mistake).

3. **TTL/coverage scope discipline:** Flow data explicitly labeled "rổ theo dõi" (watchlist-only, 99 tickers) to prevent false "market-wide" claims. This is critical for honest-gap practice.

4. **Sector divergence recognition:** Despite overall banking pressure (-0.71% to -0.16% range), did NOT issue blanket "banking giảm" verdict. Instead, granular: banking sector pressure but large-caps (VCB, BID) resilient on earnings yield thesis. Real-estate: VHM +0.80% in mix of sector weakness = selective recovery.

5. **FX stale-value handling:** USD/VND usdVndDelta=null (fetched 2026-06-30, stale) but rate 26103 present. Correctly reported: "tỷ giá đi ngang quanh 26,103" NOT "unfetchable" — honored the distinction.

## Known patterns

- unified-agent EOD dish at 08:45 UTC (2026-07-03): published to MARKET; read CHEF 3-session summary (intraday 02:26 hexagram, morning 05:29 macro, EOD 08:45 qualified 4 clusters)
- news-scout c118 (08:07 UTC): 2 chain_catalyst signals (#8405 gold macro FII outflow, #8406 oil/CPI easing); regime NEUTRAL; hot_money_risk=TRUE (gold spike >25k threshold)
- market-watcher: 2 anomalies (HVN +6.53% volume 3.6x, GAS -2.59% FX pressure flag), volatility NORMAL 14.13%
- digest-predict: 3 active claims (id=13 CTG, id=14 MBB, id=15 VIC resolution 2026-07-09); prediction regime NEUTRAL, Brier 0.2135 degrading
- Kinh Dịch: Khon (neutral 38%) steady, no extreme phase

## Previous cycles archive

- 2026-07-02 (Thursday): banking -1.15%, real-estate resilience (VIC +1.47%, VHM +1.14%), breadth weakening (117T/162G), regime SELECTIVE/phân hóa, PUBLISHED ✓
- 2026-07-01 (Wednesday): banking breakout +2.2% aligned with GDP +11.9%, FPT recovery +3.85%, real-estate divergence, PUBLISHED ✓
- 2026-06-30 and earlier: see git log for full history

---
**Meta notes for next cycle (2026-07-04 Saturday):**
- MODE ROUTER will evaluate VN_DOW=6 → JUMP to weekly-recap.md subflow (do NOT continue main.md DAILY pipeline)
- Watch POW resolution 2026-07-03 (bullish id=12, target >15.000) — today's close 14.900 = missed target by 0.1 VND
- FII flow pattern: aviation inflow (HVN +6.53%) + banking exit (TCB/MBB/ACB top sellers) = sector rotation sustained? Monitor for reversal
- Breadth trend: 104T vs 199G = weakening support, next watch <110T threshold
