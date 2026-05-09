# Financial Analyst Cycle — 2026-05-09 01:00 UTC

**Cycle Duration:** 01:00–01:15 UTC  
**Stocks Analyzed:** 2 (VCB, FPT) | Data Available: 2/31 (BCTC data gap: 29 stocks OVERDUE)  
**Signals Posted:** 2 fundamental_validation  
**Status:** ✓ COMPLETE

---

## Macro Regime

- **Global Liquidity:** NEUTRAL
- **Max Deposit Rate:** 5.00%
- **Rate-Sensitive Risk:** None (NEUTRAL regime)
- **G-Bond Pressure:** N/A (10Y yield data unavailable)

---

## BCTC Status — CRITICAL

| Stock | Q/Year | Deadline | Status | Days Overdue |
|-------|--------|----------|--------|---|
| VCB | Q4-2025 | 2026-04-15 | ✓ SUBMITTED 2026-05-08 | 23 days late |
| ACB–VPB (11 stocks) | Q4-2025 | 2026-04-15 | ⚠️ OVERDUE | 24 days |
| ACV–VCI (18 stocks) | Q1-2026 | 2026-04-30 | ⚠️ OVERDUE | 8 days |

**Finding:** 30/31 stocks missing latest BCTC. Only VCB reported (Q4-2025, unaudited, 23 days late).  
**Impact:** Sector analysis degraded; 29 stocks cannot be evaluated on latest fundamentals.

---

## Stock Analysis

### VCB — Vietcombank

**Fundamentals:**
- EY_SPREAD: 2.09% → **FAIR** valuation (1% ≤ 2.09% ≤ 3%)
- P/E: 14.1 (PREMIUM vs banking median 9.0, +57%)
- ROE: 16.7% (below banking median 17.6%)
- Revenue growth Q1→Q4: +18.1%
- Net margin: 53.4% (but down -10.2pp QoQ)

**Risk Flags:**
- PE premium without ROE premium → valuation stretched
- Negative sentiment trend (−0.21 slope, 5 bullish vs 4 bearish in 30d)
- Net margin compression QoQ (−10.2pp) — profitability pressure
- Banking sector sensitive to deposit rates (currently stable at NEUTRAL regime)

**Verdict:** FAIR valuation, but deteriorating trends limit upside. Hold pending Q1-2026 BCTC.

**Signal Posted:**
```json
{
  "ticker": "VCB",
  "type": "fundamental_validation",
  "validation_result": {
    "finding_data": {
      "ey_spread": 0.0209,
      "valuation_verdict": "FAIR",
      "regime": "NEUTRAL",
      "rate_sensitive_headwind": false,
      "gbond_regime_signal": false
    }
  }
}
```

### FPT — FPT Corporation

**Fundamentals:**
- EY_SPREAD: 2.25% → **FAIR** valuation
- P/E: 13.8 (DISCOUNT vs tech median 17.3, −20%)
- PB: 3.6 (PREMIUM vs tech median 1.5, +136%) ⚠️
- ROE: 28.3% (above tech median 10.6%) ✓
- Net margin: Data corrupted (suspected parsing error)

**Risk Flags:**
- **High book value premium (PB +136%)** — equity pricing disconnected from ROA
- Kinhdich negative (Bác hexagram: deterioration risk, confidence 48%)
- Negative sentiment trend (−0.28 slope, 12 bullish vs 16 bearish in 30d)
- High PB despite strong ROE suggests market may be re-pricing downward

**Verdict:** PE cheapness offset by PB richness + negative kinhdich. DO NOT post bullish signal.

**Signal Posted:**
```json
{
  "ticker": "FPT",
  "type": "fundamental_validation",
  "validation_result": {
    "finding_data": {
      "ey_spread": 0.0225,
      "valuation_verdict": "FAIR",
      "regime": "NEUTRAL",
      "rate_sensitive_headwind": false,
      "gbond_regime_signal": false
    }
  }
}
```

---

## Critical Findings

1. **BCTC Deadline Crisis:** 30/31 stocks OVERDUE (8–24 days). Only VCB has submitted Q4-2025 (unaudited, 23 days late).
   - Blocks fundamental analysis for watchlist
   - Recommend: Flag to @po for SEC filing/audit delay investigation

2. **Data Quality Issues:**
   - FPT BCTC: Net margin corrupted (70M% reported — parsing error)
   - BID, GAS, VHM, VIC, HSG, NKG: No BCTC data (PDF parsing pending)
   
3. **Negative Sentiment Across Board:** Both analyzed stocks show −0.2 to −0.28 slope (weakening 30d trend).

---

## Output Summary

✓ Regime extracted  
✓ BCTC status: 30/31 OVERDUE  
✓ 2 stocks analyzed (VCB, FPT)  
✓ 2 fundamental_validation signals posted  
✓ 0 insider alerts (data requirements not met)  
✓ 0 legal risks detected  
✓ 0 chain validations found  

**Next Cycle (13:00 UTC):** Repeat. Expected to gain 5–10 additional BCTC reports if filing deadline enforcement improves.
