# get_technical_indicators

**Module:** `interface/mcp/tools/market-data/technicalIndicatorTools.ts`

**Category:** Market Data

## Overview

Queries daily closing prices for a stock, computes technical indicators (Moving Averages, RSI, MACD, Bollinger Bands), and returns a Vietnamese-friendly text report with a bullish/bearish conclusion block.

## Tool Signature

```typescript
get_technical_indicators(code: string, days?: number) → string
```

## Input Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `code` | string | yes | — | Stock ticker code (e.g., "VCB", "VNM") |
| `days` | number | no | 60 | Number of days of history to analyze (10–365) |

## Computed Indicators

### Moving Averages (MA)

- **MA(5):** 5-day simple moving average
- **MA(20):** 20-day simple moving average
- **MA(50):** 50-day simple moving average
- Status: Bullish if Close > MA(20) > MA(50); Bearish if Close < MA(20) < MA(50)

### Relative Strength Index (RSI)

- **Period:** 14 days
- **Interpretation:**
  - RSI > 70 = Overbought (potential bearish reversal)
  - RSI < 30 = Oversold (potential bullish reversal)
  - 30–70 = Neutral zone

### MACD (Moving Average Convergence Divergence)

- **Fast EMA:** 12-day exponential moving average
- **Slow EMA:** 26-day exponential moving average
- **Signal Line:** 9-day EMA of MACD
- **Histogram:** MACD - Signal (positive = bullish momentum)

### Bollinger Bands (BB)

- **Period:** 20 days
- **Standard Deviation:** 2σ
- **Bands:**
  - Upper Band = MA(20) + 2 × StdDev
  - Lower Band = MA(20) - 2 × StdDev
  - Price outside bands suggests overbought (above upper) or oversold (below lower)

## Output Format

Plain text report with 6 sections:

1. **Header** — stock code, analysis date, days analyzed
2. **Moving Averages** — current MA(5/20/50) values and trend summary
3. **RSI(14)** — current RSI value and overbought/oversold status
4. **MACD** — MACD, Signal, Histogram and momentum direction
5. **Bollinger Bands** — upper/middle/lower band values and bandwidth status
6. **Technical Conclusion** — bullish/bearish/neutral summary with reasoning

## Data Source

- **Table:** `market_prices_history`
- **Query:** AVG(price) GROUP BY date (daily close proxy)
- **Parameters:** Bound via parameterized queries (SQL-safe)

## Key Characteristics

- Daily close computed as AVG(price) per REQ-090
- All parameters bound via parameterized queries (no SQL injection risk)
- Prices formatted as integers with commas (Vietnamese style)
- Returns text report (never JSON)
- Handles missing data gracefully (returns fewer indicators if history insufficient)

## Usage Examples

```
Market Watcher → get_technical_indicators(code="VCB", days=60)
Returns 60-day technical analysis for VCB

Alert Commander → get_technical_indicators(code="SAB", days=30)
Returns 30-day technical analysis for SAB (quick momentum check)
```

## Error Handling

- Empty result if code not found in market_prices_history
- Returns error message if database query fails
- Graceful fallback: always returns text response
- Missing indicator sections show "insufficient data" message

## Integration Notes

- Called by: Market Watcher, Alert Commander, Digest & Predict
- Complements `get_price_history` (raw OHLCV data)
- Used to validate momentum before firing price alerts
- Feeds into `get_ticker_intelligence` (6-part stock brief)

## Database Injection

Second argument `_db` accepts a `bun:sqlite` Database instance:
- When omitted: uses production singleton
- When provided: used for testing (isolated in-memory database)

---

**Added:** Task 1303 (Technical Indicator MCP Tool)
**Status:** STABLE
