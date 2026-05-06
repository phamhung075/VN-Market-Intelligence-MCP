# Market Watcher Session — 2026-05-06

**Cycle:** 18:45–18:46 UTC (post-market analysis)  
**Market Status:** CLOSED (08:32 UTC closing snapshot analyzed)

---

## Monitoring Summary

| Metric | Count |
|--------|-------|
| Stocks analyzed | 26 |
| **Price anomalies (>2.0σ)** | **2** |
| Volume spikes (>2.0x) | 2 |
| Chain confirmations | 4 |
| Open alerts | 3 (1 CRITICAL, 2 MEDIUM) |

---

## Anomalies Detected

### 1. **POW** (Utilities) — 4.5σ Move ⚠️
- **Price:** 14,350 VND (+6.69% today, +12.55% 30d)
- **Volume:** 38.45M shares (↑7.7x vs avg 1-5M)
- **Sector:** Utilities +2.46% avg (POW outperforming)
- **Context:** No insider trades, no FII pressure detected
- **Status:** High liquidity, single-day outlier — monitor for sustainability

### 2. **HCM** (Securities) — 5.6σ Move ⚠️
- **Price:** 28,450 VND (+8.38% today, +6.16% 30d)
- **Volume:** 26.25M shares (↑6.2x vs avg 0.4-4M)
- **Sector:** Securities +4.76% avg (HCM outperforming)
- **Chain findings:** news-scout flagged HCM (signal 2401 — urgent_news)
- **Headwind:** Banking sector labor exodus (Sacombank 2,700+ cuts) → peer valuation pressure
- **Status:** Strong outperformance despite sector headwinds — unusual strength

---

## Macro & Regime

- **Regime:** NEUTRAL → σ threshold = 2.0σ (both moves exceed)
- **Carry Regime:** FII_OUTFLOW_RISK (signal 2403, confidence 70%)
  - 4 stocks absorbed >1000B VND foreign selling
  - VND carry spread at -0.33% vs Fed 5.33%
- **Oil (Brent):** -3σ (101.78 vs avg 110.57) — CRITICAL alert

---

## Chain Analysis (15-min window)

**Open chain findings:**
- KDH: VinaCapital divestment (bearish signal)
- HCM: Urgent news (linked to price move)
- **2402:** Banking labor exodus (confidence 75%, bearish)
- **2403:** FII outflow risk (confidence 70%, bearish)

**Supply Chain Status:** BDI 1,400 (stable, no disruptions)

---

## Signal Processing

**Status:** ⚠️ Schema validation error on `post_agent_signal`
- Error: price_anomaly payload missing required field `root`
- **Impact:** POW & HCM anomaly signals not posted to downstream agents
- **Fallback:** Analysis logged; requires manual review or schema fix

---

## Next Steps

1. **POW:** Monitor tomorrow — pattern suggests energy sector response
2. **HCM:** Cross-validate with financial-analyst on banking labor impacts
3. **Banking sector:** Structural headwind (Sacombank cuts) affects peer valuations
4. **Infra:** Fix post_agent_signal schema or update flow

---

[Market Watcher] 18:46 UTC — 26 stocks monitored
  Anomalies: 2 (>2.0σ) | Volume spikes: 2 | Chain confirms: 4
  Regime: NEUTRAL | Carry: FII_OUTFLOW_RISK | Status: BLOCKING_ERROR (signal post)

