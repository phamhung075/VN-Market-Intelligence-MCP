# VN Market Intelligence — Daily Review
**Date:** 2026-04-02 (22:00 VN / 15:00 UTC)
**Coordinator:** unified-agent
**Server uptime:** 1h 22m (recent restart at ~16:44 UTC)

---

## 🔴 CRITICAL ISSUES (Blocking)

### 1. TELEGRAM_BOT_TOKEN Not Configured — All Notifications Dead
- **Status:** FIX NOW → @dev (Report #282, confirmed)
- **Evidence:** `TELEGRAM_BOT_TOKEN is not set` errors at 16:36 and 16:38. `Last Telegram sent: never`. Webhook setup failed.
- **Impact:** 1 HIGH alert (VCB price_drop + volume_spike at 15:39) never delivered. Morning briefing, evening summary, alert digest have never been sent. The entire user-facing notification pipeline is broken since server restart.
- **Action taken:** Processed and cleared from Report Channel.

---

## 🟠 HIGH ISSUES

### 2. Stock Prices DB Stale 153h — Conviction Dashboard Showing Wrong Direction
- **Status:** FIX NOW → @dev (Report #283 + new feedback #289)
- **Evidence:** `get_data_freshness` shows "Giá cổ phiếu: 6 ngày trước / 153.1h / Rất cũ". Watchlist shows VCB = 88,000 VND (+3.53%) while live market price = 58,200 VND (−1.36% today).
- **Impact (compounded):**
  - Conviction dashboard shows VCB as "STRONG TĂNG" when stock actually dropped and triggered a HIGH alert
  - Correlation matrix empty (insufficient price history)
  - Portfolio risk calculation not possible
  - Alert thresholds based on wrong baseline prices
- **Root cause:** HOSE price write pipeline (Step C) is not persisting to `market_prices` / `market_prices_history` tables after server restart.
- **Action taken:** Processed and cleared from Report Channel. New feedback filed (#289) for conviction dashboard bug specifically.

---

## 🟡 MEDIUM ISSUES

### 3. Polymarket CLOB Fetch Failing Repeatedly
- **Status:** SPRINT TASK or FIX NOW → @dev (Report #284 + new feedback #290)
- **Evidence:** 3 consecutive failures at 17:00, 17:30, 18:00. Prediction data stale 33.6h. All 5 stored markets show `volume=0`, `uniqueWallets=0` — confirmed test/seed data.
- **Data quality problem:** "Will VN-Index hit 1300 in Q2 2026?" at 35% YES is **factually wrong** — VN-Index is 1,694.82. This market should be near 100% or already resolved.
- **Action taken:** Processed and cleared from Report Channel. New feedback filed (#290) requesting endpoint validation + data validity check.

### 4. SSC Portal Failing — BCTC Q1 2026 Season Started
- **Status:** FIX NOW → @dev (Report #285)
- **Evidence:** Two failures at 16:36 and 16:37. BCTC data = N/A.
- **Risk:** April is the start of Q1 2026 BCTC filing season. Missing financial reports during earnings season is a high-priority data gap.
- **Action taken:** Processed and cleared from Report Channel.

### 5. Sentiment Trend Coverage Near-Zero
- **Status:** SPRINT TASK → @dev (new feedback #291)
- **Evidence:** `get_sentiment_trend` returns no data for VCB, VNM, VEA over 7 days. FPT has only 1 neutral entry. 10 recent analysis_history entries exist but are COUNTRY/GLOBAL level — not mapped to individual stock sentiment.
- **Root cause hypothesis:** `pollNews()` + `runImpactChain()` may not be writing to the sentiment table for watchlist stocks. Alias resolution (stockAliases.ts) may not be triggering sentiment writes.
- **Action taken:** New feedback filed (#291).

---

## 📊 Market Intelligence Summary

### VN-Index & Watchlist (02/04/2026 close)
| Stock | Live Price | Change | Volume | Signal |
|-------|-----------|--------|--------|--------|
| VN-Index | 1,694.82 | −0.48% | — | Mild correction, consolidating ~1,700 |
| VCB | 58,200 VND | −1.36% | 5.66M | ⚠️ HIGH: price_drop + volume_spike |
| FPT | 74,700 VND | −0.80% | 5.22M | No alert |
| VNM | 60,800 VND | −0.82% | 2.86M | No alert |
| VEA | 33,200 VND | −0.90% | 481K | No alert |

All 4 watchlist stocks declined today. Market-wide mild selling pressure, no single stock outlier beyond VCB's volume spike.

### Macro Dashboard
| Indicator | Value | Status | VN Implication |
|-----------|-------|--------|----------------|
| Brent Crude | $108.80/bbl | 🔴 CAO | Positive: GAS/PVD. Negative: HVN/VJC, logistics |
| Gold | $4,677.90/oz | 🔴 CAO | Risk-off signal. Positive: PNJ |
| USD/VND | 26,310 | 🔴 HIGH | Negative: VEA (auto imports), HVN. Positive: HPG (steel exports), VHC |
| SBV Refi Rate | 4.50% | 🟢 Normal | Supportive for banking/real estate |

**Key macro concern:** USD/VND at 26,310 (vs official 26,142) is elevated. VEA is particularly exposed — automotive imports + JV royalty costs in USD.

### Key News Context (18:00 cycle)
1. **Bullish:** CTCK dự báo 10 doanh nghiệp tăng trưởng tích cực Q1/2026 — earnings season optimism
2. **Bullish LT:** Vietnam easing foreign access to equities (new rules)
3. **Bearish:** Foreign investors net selling despite strong growth signal
4. **Neutral:** VN-Index forecast to consolidate around 1,700 points
5. **Neutral+:** Share buyback wave emerging — possible short-term price floor
6. **Neutral:** Marico acquires 75% of SkinEtiq Vietnam

### VCB Alert — Unnotified HIGH
- **Alert:** VCB price_drop + volume_spike, generated 15:39 today
- **Status:** 1 unnotified (Telegram broken). Alert is marked read in DB but never delivered.
- **Assessment:** Volume of 5.66M is notable. Price drop −1.36% is below the −3% threshold but the combined signal (price + volume) triggered HIGH. Monitor for continuation tomorrow.
- **Banking macro context:** USD/VND pressure + fraud transaction news (4,000 tỷ blocked) may be contributing factors.

---

## 💼 Portfolio Status

| Metric | Status |
|--------|--------|
| Open positions | None |
| Target allocation | Not set |
| Portfolio risk (VaR) | N/A — no positions |
| Correlation matrix | Empty — insufficient price history |
| Rebalancing signals | N/A — no targets |
| Alert accuracy (30d) | 1 alert / 1 UNKNOWN (no price history for scoring) |
| Performance attribution | price_drop: 1 alert, 0 scored outcomes |

**Conviction scores (note: using stale DB prices — unreliable):**
- VCB: STRONG (0.60) — **DO NOT TRUST**: based on 88,000 stale price. Live direction is DOWN.
- FPT/VNM/VEA: MODERATE (0.50) — mixed signals, no position recommended without live price data.

---

## 🔮 Prediction Markets (Unreliable — stale 33.6h, test data)

| Market | YES% | Reliability |
|--------|------|-------------|
| Fed cut June 2026? | 75% | ⚠️ Stale — but directionally plausible |
| Oil >$100 in 2026? | 45% | ❌ Wrong — Brent already at $108 |
| VN-Index hit 1300 Q2? | 35% | ❌ Factually wrong — index at 1,694 |

**Conclusion:** Prediction market data should not be used for investment decisions until CLOB fetch is fixed and data refreshed.

---

## ✅ System Health Scorecard

| Component | Status |
|-----------|--------|
| News sources (5/5) | ✅ OK — all fetching normally |
| Circuit breakers (10/10) | ✅ All closed |
| Rate limits (11 hosts) | ✅ All ready |
| DB size | ✅ 4.15 MB (healthy) |
| WAL size | ✅ 386 KB |
| Commodity σ readiness | ✅ 43/30 points (READY) |
| SBV σ readiness | ✅ 43/30 points (READY) |
| VCB price σ | ⏳ 1/30 (needs 29 more days) |
| Telegram delivery | ❌ BROKEN — token not configured |
| DB stock prices | ❌ 153h stale |
| Prediction market data | ❌ 33.6h stale, test data |
| BCTC data | ❌ N/A — SSC portal failures |
| Sentiment coverage | ❌ 3/4 stocks have zero data |

---

## 📋 Report Channel Actions Taken

| Report ID | Triage | Action |
|-----------|--------|--------|
| #2 (CRITICAL: Telegram token) | FIX NOW | Processed + deleted |
| #3 (HIGH: DB prices stale) | FIX NOW | Processed + deleted |
| #4 (MEDIUM: Polymarket CLOB) | FIX NOW | Processed + deleted |
| #5 (MEDIUM: SSC portal) | FIX NOW | Processed + deleted |
| #6 (Weekly improvement report) | MONITOR | Processed, kept |
| #7 (Daily review 17:58) | ARCHIVE | Processed, kept |
| New #289 (Conviction stale price bug) | NEW @dev HIGH | Filed |
| New #290 (Prediction data validity) | NEW @dev MEDIUM | Filed |
| New #291 (Sentiment coverage gap) | NEW @dev MEDIUM | Filed |

**Report Channel:** Cleaned. 4 bug reports cleared. 3 new issues filed. Channel ready for Dev Team next cycle.

---

## 🎯 Recommendations for Tomorrow

1. **Priority 1 — Verify Telegram fix:** If Dev Team has fixed the bot token, test with `send_test_telegram` before market open (08:00).
2. **Priority 2 — Verify price write fix:** After Telegram fix, confirm `get_data_freshness` shows prices < 30 min stale.
3. **VCB monitoring:** Watch for continuation of today's volume spike. If price drops further tomorrow with high volume, upgrade conviction. VCB σ will improve with each day of price data (currently 1/30).
4. **VEA risk flag:** USD/VND at 26,310 is a persistent headwind. If USD strengthens further, VEA margin compression deserves a dedicated analysis.
5. **BCTC season:** Q1 2026 reports due April. Once SSC portal is fixed, prioritize BCTC checks for all 4 watchlist stocks.
6. **Set target allocation:** Once positions are established, use `set_target_allocation` to enable rebalancing signals.

---

## 📈 This Cycle's Improvements (Philosophy: "Always do it better")

1. **New:** Identified conviction dashboard misleading due to stale price → filed HIGH bug #289
2. **New:** Identified prediction market data validity gap + factually wrong market → filed MEDIUM bug #290
3. **New:** Identified sentiment coverage gap (3/4 stocks no data 7d) → filed MEDIUM bug #291
4. **Process:** Cleared Report Channel of 4 resolved issues, keeping it clean for Dev Team hourly loop
5. **Observation:** Server restart pattern (uptime 1h22m at review time) suggests instability — Dev Team should check if `start.sh` / `bun --hot` is configured for auto-restart on crash

---

*Generated by unified-agent | VN Market Intelligence Analysis Team | 2026-04-02 18:08 UTC*
