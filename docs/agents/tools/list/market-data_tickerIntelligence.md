# get_ticker_intelligence

**Module:** `interface/mcp/tools/market-data/tickerIntelligenceTools.ts`

**Category:** Market Data

## Overview

Pure read-and-format aggregator that collapses 6 separate data sources into one Vietnamese-language intelligence brief for a single stock ticker. Best-effort per section: each of the 6 sections is wrapped in its own try/catch. A failure in any section never crashes the whole tool.

## Tool Signature

```typescript
get_ticker_intelligence(code: string, days?: number) → string
```

## Input Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `code` | string | yes | — | Stock ticker code (e.g., "VCB", "VNM", "SAB") |
| `days` | number | no | 30 | Number of days to look back for evidence and predictions (1–365) |

## Output Sections (6 Parts)

### 1. Recent Price Action
- Latest close price, change (%), volume, 5-day and 20-day moving averages
- Formatted from `market_prices_history` (last row)

### 2. Evidence Summary
- Bullish, neutral, and bearish evidence fragments from the evidence accumulator
- Latest evidence score from `evidence_scores` table
- Shows confidence level and dominant signal direction

### 3. Insider Transactions
- Recent insider buying/selling activity from SSC disclosures
- Counts accumulated buys vs. sells over the lookback period
- Shows position names and total executed volumes
- Formatted from `insider_transactions` table

### 4. Prediction Claims
- Active and resolved prediction claims for this stock
- Shows probability, resolution date, and current status
- Resolved claims shown with actual outcome vs. predicted
- From `prediction_claims` table

### 5. Technical Analysis
- Current technical setup: overbought/oversold, trend direction, momentum
- Key levels (RSI, MACD, Bollinger Bands status)
- Derived inline (not a separate tool call)

### 6. Valuation & Fundamental
- P/E ratio, earnings yield, debt-to-equity
- Latest BCTC metrics if available
- Growth rate estimate from evidence fragments

## Data Sources

| Section | Tables |
|---------|--------|
| Price Action | `market_prices_history`, `daily_ohlcv` |
| Evidence | `evidence_scores`, `evidence_fragments` |
| Insider | `insider_transactions` |
| Predictions | `prediction_claims`, `prediction_claim_signals` |
| Technical | Computed inline from price history |
| Fundamental | `bctc_quarterly` (if available), `rag_analyses` |

## Output Format

Plain text brief with:
- Header: stock code, timestamp, date range analyzed
- 6 labeled sections with "=" separators (35 chars)
- Footer with update timestamp
- Vietnamese formatting for numbers and labels

## Key Characteristics

- **Best-effort approach:** Each section wrapped in try/catch; failure doesn't crash entire brief
- **Aggregator only:** No external API calls; reads from local DB only
- **No duplication:** Each section reads different tables (no overlapping queries)
- **Vietnamese formatting:** Numbers with locale, currency signs, date formats
- **Handles sparse data:** Shows "no data available" gracefully if section empty

## Usage Examples

```
Financial Analyst → get_ticker_intelligence(code="VCB", days=30)
Returns 6-part brief for VCB (30-day lookback)

Market Watcher → get_ticker_intelligence(code="SAB")
Returns 6-part brief for SAB (default 30 days)

Alert Commander → get_ticker_intelligence(code="BID", days=60)
Returns 6-part brief for BID (60-day lookback for longer trend)
```

## Error Handling

- Per-section failures logged but don't crash the tool
- Failed section shows "unavailable" or "insufficient data" message
- Returns full brief even if some sections fail
- Database errors caught and formatted as "error loading" messages

## Integration Notes

- Called by: Market Watcher, Financial Analyst, Alert Commander, Digest & Predict
- Aggregates data from price history, evidence engine, insider tracking, prediction claims
- Often used before creating price alerts or making major decisions
- Replaces need for 6 separate tool calls

## DDD Layer

- **Layer:** interface/mcp/tools
- **Imports:** infrastructure store functions + inline SQL
- **No domain service imports** — pure read-and-format aggregator

---

**Added:** Task 1179 (get_ticker_intelligence MCP tool)
**Status:** STABLE
