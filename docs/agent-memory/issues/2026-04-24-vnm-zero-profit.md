# VNM Q4-2025: Zero Operating + Net Profit

**Date**: 2026-04-24 13:00 UTC (20:00 VN)  
**Filed**: 2026-04-23  
**Status**: DATA ERROR or ACCOUNTING RESTATEMENT required

## Symptoms
- Operating Profit: 0 VND
- Net Profit: 0 VND
- ROE: 0.0%
- ROA: 0.0%
- Revenue: 63.645B (healthy)
- Gross Margin: 41.2% (healthy)

## Root Cause
**Hypothesis 1**: Data extraction error (PDF→JSON misalignment)
**Hypothesis 2**: BCTC structural issue (missing/zero operational segments)
**Hypothesis 3**: Accounting restatement (legitimate zero profit quarter)

## Action
Requires manual PDF verification: `BCTC VNM 31.12.2025 - HOP NHAT - VN.pdf`

## Signal Posted
- Signal ID: 1380 (20260423-2300)
- Type: fundamental_validation
- Recipient: alert-commander
- Evidence: bctc_net_profit (id=94), news_sentiment_stock (id=95)
