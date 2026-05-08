# Financial Analyst — Analysis Cycle 2026-05-08

**Cycle Run:** 2026-05-08 00:30 UTC (08:30 VN)  
**Agent:** financial-analyst (BCTC Collector)  
**Schedule:** Daily 01:00 UTC + 13:00 UTC  

---

## Cycle Summary

### Analysis Cycle (00:30–00:45 UTC)
- **Stocks analyzed:** 4 (VCB, FPT, GAS, + sector overview)
- **Critical findings:** 2 major
- **Chain validations:** 0 (empty in 30min window)
- **Signals posted:** 3 fundamental_validation
- **Legal risks:** 0 detected

### Regime & Macro
- **Regime:** NEUTRAL (Global Liquidity: NEUTRAL)
- **Max Deposit Rate:** 5.00%
- **Macro context:** Brent $102.53/bbl (stable), Gold $4694.50 (high), USD/VND 26,260 (HIGH pressure on importers, tailwind for exporters)
- **Energy sector:** CAO $103/bbl — tích cực dầu khí, áp lực hàng không
- **Currency pressure:** HIGH — affects aviation (HVN/VJC), imports (VEA); benefits steel exports (HPG)

### BCTC Deadline Crisis ⚠️
- **30/31 stocks QUÁ HẠN (OVERDUE)**
  - Q4-2025 due 15/04/2026: All overdue except VCB (submitted 05-07)
  - Q1-2026 due 30/04/2026: All overdue (deadline passed)
- **VCB:** ✅ ĐÃ NỘP Q4-2025 (2026-05-07)
- **Action:** Monitor for critical filings next week; data gaps persist for 30 stocks

### Stock Analysis

#### VCB (Vietcombank) — HOLD
- **BCTC Q4-2025:** Revenue +18.1% QoQ, but Net Profit flat (-0.8%)
- **Valuation:**
  - P/E: 14.1 vs sector median 9.0 → **+57% PREMIUM**
  - Earning Yield: 7.09%
  - **EY_SPREAD = 7.09% - 5.00% = 2.09%** → **FAIR** (1–3% range)
  - P/B: 2.2 vs 1.5 → **+45% premium**
- **Fundamentals:** ROE declined -0.5pp QoQ to 3.8% (low); D/E 0, healthy
- **Sentiment:** NEGATIVE (-0.31 slope, 5/12 bullish, 4 bearish)
- **Kinhdich:** Que Bác (23) — UNFAVORABLE, GIU signal (wait), 48% confidence
- **Peers:** BID (PE 9.5), CTG (PE 7.8), MBB (PE 8.0) all cheaper
- **Signal ID:** 2576
- **Verdict:** FAIR valuation but trading at premium, declining momentum. Recommend **HOLD** pending better entry or ROE recovery.

#### FPT (FPT Software) — HOLD
- **BCTC Q4-2025:** Data quality issue
  - Net Revenue: 0T reported (parsing error or timing issue)
  - Net Profit: 14.3T (impossible ratio if revenue = 0)
  - ROE: 32.7%, ROA: 16.3% (suspiciously high)
  - Confidence: 75% (flagged as lower confidence)
- **Sentiment:** NEGATIVE (-0.27 slope, 12/36 bullish, 14 bearish)
- **Market Flows:** Conflicting signals
  - Insiders buying ~1000B (confidence)
  - Foreign investors selling ~13000B (distribution)
  - News mentions: Personal net buy nearly 1000B, gom nhiều nhất FPT
- **Kinhdich:** Que Bác (23) — UNFAVORABLE, GIU signal (wait), 48% confidence
- **Signal ID:** 2577
- **Verdict:** **HOLD** — Data quality prevents valuation verdict. Conflicting flows (insiders accumulate, foreigners sell) require caution. Await corrected BCTC filing.

#### GAS (PetroVietnam Gas) — BUY
- **Sector Comparison:**
  - P/E: 17.3 vs median 18.4 → **at median** (fair)
  - P/B: 2.9 vs 1.6 → **+77% premium**
  - ROE: 18.0% vs median 9.6% → **above median** (strong)
- **Price Action:** -4.0% (vs sector avg -3.3%) — **oversold**
- **Macro Context:** Brent crude stable $102.53/bbl (supportive), USD/VND 26,260 (tailwind for oil exporters)
- **Kinhdich:** Que Bác (23) → Cấn (52) — **MUA (buy)** signal with **Hào 3 dynamic** (transformation), 74% confidence
  - Translation: "Bác — erosion → Cấn — halt/recovery" — suggests bounce forming, oversold condition reversing
  - Markov: 100% probability of Bác stabilizing into Cấn recovery
- **Signal ID:** 2578
- **Verdict:** **BUY** — Oversold with kinhdich recovery signal (high confidence 74%), high ROE, fair PE. Transformation dynamic (Hào 3 change) suggests bounce opportunity.

### Valuation Flags
| Ticker | Verdict | EY_Spread | Regime_Impact | Rate_Sensitive | G-Bond Check |
|--------|---------|-----------|---------------|-----------------|--------------|
| VCB    | FAIR    | 2.09%     | None (NEUTRAL)| Yes (banking)   | N/A          |
| FPT    | UNABLE  | —         | —             | No              | N/A          |
| GAS    | FAIR    | —         | None (NEUTRAL)| No              | N/A          |

### Data Gaps
- **Missing G-Bond 10Y yield** for Pillar 5.2 check (unavailable in macro snapshot)
- **30/31 stocks overdue** on BCTC filings — PDFs available: 12 files (VCB, FPT, HPG, BSR, DIG, DGC, SHB, VNM, VEA)
- **Insider signals tool:** Requires per-stock code + outstandingShares parameters (not aggregated)

### Open Alerts (24h Context)
- 20 open alerts, mostly MEDIUM/LOW on news mentions
- **HIGH alerts:** Macro deviation (gold +2.02σ), GAS sector (-4%), VHM surge (+6.95%)
- **Recent bearish:** Solar company loss, auto sector inventory pressure
- **Recent bullish:** VN-Index ATH momentum, Vingroup alliance signal

### Next Steps
1. Monitor BCTC deadline: critical filings expected next week
2. FPT: Re-check BCTC parsing when Q1-2026 (due 30/04 OVERDUE) arrives
3. VCB: Watch for ROE stabilization; re-assess premium valuation at next quarter
4. GAS: Monitor kinhdich recovery (expected Cấn phase); set entry target on -5% drop

---

## Session Metrics

| Metric | Value |
|--------|-------|
| Stocks analyzed | 4 |
| Signals posted | 3 (fundamental_validation) |
| Signal IDs | 2576, 2577, 2578 |
| Cycle ID | 20260507-2300 |
| Signal TTL | 120 min |
| Legal risks | 0 |
| Chain findings | 0 |
| BCTC PDFs available | 12 |
| Confidence (avg) | 0.72 |

## Error Log
- **log_agent_work:** Skipped (requires prior 'running' session ID)
- **get_insider_signals:** Requires per-stock parameters (code, outstandingShares)
- **G-Bond 10Y:** Data unavailable in macro snapshot
