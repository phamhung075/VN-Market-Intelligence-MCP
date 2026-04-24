# VEA Q4-2025: Operating Margin Anomaly

**Date**: 2026-04-24 13:00 UTC (20:00 VN)  
**Filed**: 2026-04-23  
**Status**: DATA QUALITY FLAG

## Symptoms
- Operating Profit: 858.5B (330% of revenue) ❌ ANOMALOUS
- Net Profit: 7.188B (2765% of revenue) ❌ ANOMALOUS
- ROE: 35.1% ✓ (credible)
- ROA: 34.7% ✓ (credible)
- D/E: 0.00x ✓ (zero debt, credible)
- Kinh Dich: KHÔN(2)→BUY 100% ✓

## Root Cause
PDF extraction structural error (likely inverted column mapping or unit mismatch).

## Action
Manual PDF review required: `BCTC VEA 31.12.2025 - RIENG - VN.pdf`

## Notes
- Price action: 33.5K +0.30% (mild optimism)
- No insider activity (30d)
- No legal risk
- If ROE/ROA real, remains bullish despite margin error

## Signal Posted
- Signal ID: 1381 (20260423-2300)
- Type: fundamental_validation
- Recipient: alert-commander
- Evidence: bctc_roe_ratio (id=96), kinh_dich_signal (id=97)
