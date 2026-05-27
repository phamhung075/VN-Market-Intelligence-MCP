# get_price_history

**Module:** `interface/mcp/tools/market-data/priceHistoryTools.ts`

**Category:** Market Data

## Overview

Queries daily OHLCV (open, high, low, close, volume) data from the `daily_ohlcv` table for a given stock ticker over a specified number of days. Returns a formatted Vietnamese-friendly text table with per-row OHLCV data plus period statistics (min, max, avg, return %).

## Tool Signature

```typescript
get_price_history(code: string, days: number) → string
```

## Input Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `code` | string | yes | — | Stock ticker code (e.g., "VCB", "VNM", "SAB") |
| `days` | number | yes | — | Number of days back to query (1–365) |

## Output Format

Plain text table with:
- Header: stock code, date range
- Per-row: date, open, high, low, close, volume (formatted with Vietnamese-style separators)
- Footer: period statistics (min close, max close, average close, total volume, return %)

## Data Source

- **Table:** `daily_ohlcv`
- **Scope:** Permanent daily candles (persisted, not rolling)
- **Timing:** Data updated daily via price ingestion pipeline

## Key Characteristics

- Prices formatted as integers with comma separators (Vietnamese style)
- Volume formatted with M/K suffixes (e.g., "1.50M shares")
- Covers the full trading history available in the database
- Returns up to N days; if fewer rows exist, returns all available data
- All parameters bound via parameterized queries (no SQL injection risk)

## Usage Examples

```
Agent → get_price_history(code="VCB", days=30)
Returns the last 30 daily candles for VCB with statistics

Agent → get_price_history(code="SAB", days=90)
Returns the last 90 daily candles for SAB
```

## Error Handling

- Empty result if code not found in daily_ohlcv
- Returns error message if database query fails
- Graceful fallback: always returns text response (never throws)

## Integration Notes

- Used by: Market Watcher, Technical Indicator calculations
- Called at session start or when agent needs historical price context
- Complements `get_technical_indicators` (which adds MA/RSI/MACD/BB layers)

## Database Injection

Second argument `_db` accepts a `bun:sqlite` Database instance:
- When omitted: uses production singleton from `infrastructure/db/index.ts`
- When provided: used for testing (isolated in-memory database)

---

**Added:** Task 178 (Price History MCP Tool)
**Status:** STABLE
