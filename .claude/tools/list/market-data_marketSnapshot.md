# get_market_snapshot

**Module:** `interface/mcp/tools/market-data/marketTools.ts`

**Category:** Market Data

## Overview

Fetches live prices from all three Vietnamese stock exchanges (HOSE, HNX, UPCOM) in parallel. Returns a formatted text table organized by exchange with stock codes, prices, percentage changes, and trading volumes.

## Tool Signature

```typescript
get_market_snapshot() → string
```

## Input Parameters

None.

## Output Format

Plain text organized by exchange section:

```
[HOSE]
  VCB      88,000.0 VND  +1.15%  Vol: 1,500,000
  VNM      75,250.0 VND  -0.80%  Vol: 2,100,000
  ...

[HNX]
  MWG      85,500.0 VND  +2.34%  Vol: 850,000
  ...

[UPCOM]
  TCH      12,500.0 VND  +0.50%  Vol: 125,000
  ...
```

## Data Sources

| Source | Provider | Latency |
|--------|----------|---------|
| HOSE prices | SSC/HOSE API | ~2–5 min delay |
| HNX prices | HNX API | ~2–5 min delay |
| UPCOM prices | UPCoM API | ~2–5 min delay |
| VN-Index | HOSE API | ~2–5 min delay |

## Key Characteristics

- Fetches all 3 exchanges in parallel via Promise.all()
- Prices formatted to 1 decimal place with comma separators
- Percentage changes include +/- sign
- Volumes formatted with comma separators
- Empty exchanges return no section header
- Graceful degradation: if one exchange fetch fails, others still included

## Usage Examples

```
Agent → get_market_snapshot()
Returns live prices across all 3 exchanges

Market Watcher → checks snapshot every 5 minutes
Alert Commander → validates signal prices against live snapshot (±5% tolerance)
```

## Error Handling

- Per-exchange fetch failures don't block other exchanges
- Failed exchange section excluded from output (no "unavailable" message)
- Returns error text if all exchanges fail
- Rate-limiting handled by globalRateLimiter

## Related Tools

- **`get_price_history`** — historical daily OHLCV
- **`get_technical_indicators`** — adds MA/RSI/MACD/BB analysis
- **`validate_signal_price`** — checks signal price vs live snapshot (±5% tolerance)

## Integration Notes

- Called by: Market Watcher, Alert Commander, Digest & Predict, QA Responder
- Part of `get_market_context` compound tool (Snapshot section)
- Used to validate price alerts and detect anomalies
- Feeds into Alert Commander's "verified chain" synthesis

---

**Added:** Task 084 (Market MCP Tools)
**Status:** STABLE
