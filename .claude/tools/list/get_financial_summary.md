# get_financial_summary

**Module:** `interface/mcp/tools/financial-reports/reports.ts`

**Category:** Financial Reports

## Overview

Returns a formatted financial summary for a single stock from the local SQLite database. Covers key income-statement, balance-sheet, and ratio metrics for the most recent available period (or a specific year/quarter if supplied).

Data source: `financial_reports` table populated by the BCTC extraction pipeline (`fetchParseAndStoreBctc`).

## Tool Signature

```typescript
get_financial_summary(actionCode: string, year?: number, quarter?: "Q1"|"Q2"|"Q3"|"Q4") → string
```

## Input Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `actionCode` | string (2–10 chars, uppercased) | Yes | — | Stock ticker code, e.g. `VCB` |
| `year` | integer (2010–2030) | No | latest | Fiscal year filter |
| `quarter` | `Q1` \| `Q2` \| `Q3` \| `Q4` | No | latest | Quarter filter |

## Output Format

Plain-text formatted summary, e.g.:

```
=== HPG — 2025-Q4 (audited) ===
Company         : Hoa Phat Group

--- Income Statement ---
Net Revenue     : 35,200 B VND
Gross Profit    : 7,840 B VND  (22.3%)
Operating Profit: 4,100 B VND  (11.6%)
EBITDA          : 5,200 B VND
Net Profit      : 2,800 B VND  (7.9%)
EPS             : 1,450 VND

--- Balance Sheet ---
Total Assets    : 98,500 B VND
Equity          : 52,300 B VND
Total Liab.     : 46,200 B VND
Cash            : 8,700 B VND

--- Ratios ---
ROE             : 5.4%
ROA             : 2.8%
Current Ratio   : 1.42x
D/E Ratio       : 0.88x
Net Debt/EBITDA : 4.10x
P/E             : 9.3x
P/B             : 1.8x

Confidence      : 88%
Published       : 2026-01-15
```

## Error / No-Data Conditions

| Condition | Response |
|-----------|----------|
| No row found for ticker + filters | "No financial data found for {code}. Run fetch_ssc_reports to load data from the SSC portal." |
| Database error | "Error retrieving summary for {code}: {message}" |

## Usage Examples

```
Market Analyst → get_financial_summary(actionCode="HPG")
Returns latest available period for HPG

Market Analyst → get_financial_summary(actionCode="VCB", year=2025, quarter="Q3")
Returns Q3 2025 data for VCB
```

## Integration Notes

- Called by: Market Analyst (concise KPI check before deeper `get_bctc_full` query)
- Read-only: queries `financial_reports` table; never writes
- If data is absent: run `fetch_ssc_reports` or trigger `bctcReparseJob` cron to populate
- Source tier: 1 (local SQLite — BCTC extraction from SSC/VPS pipeline)

## Related Tools

| Tool | Relationship |
|------|-------------|
| `get_bctc_full` | Broader: full quarterly time-series (income + balance + cash flow); use when trend analysis is needed |
| `compare_financials` | Cross-stock: YoY/QoQ comparison across 2+ tickers |
| `fetch_ssc_reports` | Write path: triggers BCTC pipeline to populate `financial_reports` table |

---

**Added:** Task 085 (SSC Report MCP Tools)
**Stub created:** Sprint 1951b (QA BLOCK-2 resolution — tool confirmed live in reports.ts)
**Status:** STABLE
