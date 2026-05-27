# get_foreign_flow

**Module:** `interface/mcp/tools/market-data/foreignFlowTools.ts`

**Category:** Market Data

## Overview

Reads daily foreign investor flow history for a stock and returns an analyzed signal with direction, severity, and consecutive-day streak metrics. Includes zero-detection guard: if all foreignVolume values are 0, returns a no-data message without calling analyzer.

## Tool Signature

```typescript
get_foreign_flow(code: string, days?: number) → string
```

## Input Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `code` | string | yes | — | Stock ticker code (e.g., "VCB", "FPT") |
| `days` | number | no | 30 | Number of days of flow history to analyze (1–365) |

## Output Format

Plain text analysis with sections:

```
Foreign Flow Analysis — [CODE]

Signal
  Direction: BUY|SELL|NEUTRAL
  Severity: low|medium|high|critical
  Consecutive days: N
  Net volume 3d: ±X.XXM shares
  Net volume 5d: ±X.XXM shares
  Holding ratio change (5d): ±X.XXX%

Top Buy Days (last N days):
  YYYY-MM-DD  +X.XXM shares
  ...

Top Sell Days (last N days):
  YYYY-MM-DD  -X.XXM shares
  ...

Holding Ratio History:
  YYYY-MM-DD  X.XX%
  ...
```

## Data Source

- **Table:** `foreign_flow_daily` (or equivalent from vnstockStore)
- **Fields:** code, date, buyVolume, sellVolume, holdingRatio
- **Timing:** Updated daily after market close via VPS pipeline

## Analysis Logic

### Signal Determination

- **Direction:** Derived from net flow (buyVolume - sellVolume) over 5 days
  - Positive = BUY signal
  - Negative = SELL signal
  - Near-zero = NEUTRAL

- **Severity:** Based on consecutive days and magnitude
  - low: 1–2 consecutive days, small magnitude
  - medium: 3–4 consecutive days, moderate magnitude
  - high: 5+ consecutive days, large magnitude
  - critical: 7+ consecutive days, >1M shares/day or >2% holding change

- **Consecutive Days:** Count of consecutive days with same net flow direction

- **Net Volumes:** Aggregated 3-day and 5-day net (buy - sell) volumes

- **Holding Ratio Change:** % change in foreign holding ratio (5d)

### Zero-Detection Guard

- If all dailyForeignFlow[].foreignVolume === 0, returns: "No foreign flow data available"
- Prevents false "no net flow" signals

## Formatting Helpers

All volumes formatted as human-readable strings:
- M suffix for millions: 1,500,000 → "1.50M"
- K suffix for thousands: 500,000 → "500.0K"
- Plain number for < 1,000

Ratios formatted as percentages: 0.30 → "30.00%"

## Usage Examples

```
Market Watcher → get_foreign_flow(code="VCB", days=20)
Returns 20-day foreign flow analysis for VCB

Alert Commander → get_foreign_flow(code="FPT", days=60)
Returns 60-day analysis to detect sustained outflow patterns

Financial Analyst → get_foreign_flow(code="VNM")
Returns 30-day (default) analysis for VNM
```

## Error Handling

- Returns "No data found for [CODE]" if code not in database
- Returns "No foreign flow data available" if all volumes are zero
- Returns error message if DB query fails
- Always returns text response (never throws)

## Related Diagnostic Tools

### get_foreign_flow_circuit_breaker_status

Queries circuit breaker state (stalled, tripped, nominal, etc.)

### reset_foreign_flow_circuit_breaker

Resets circuit breaker when foreign flow poller gets stuck

See Task 1283a for circuit breaker implementation.

## Integration Notes

- Called by: Market Watcher, Alert Commander, Digest & Predict
- Complements `get_insider_transactions` (executive buys/sells)
- Used to detect unusual foreign investor activity (institutional buying/selling)
- Often triggers alerts when severity >= high with >3 consecutive days
- Input to "verified chain" synthesis (Alert Commander)

## DDD Layer

- **Layer:** interface/mcp/tools
- **Imports:** domain foreignFlowAnalyzer + infrastructure DB functions
- **No schema/vendor dependencies** — pure business logic

---

**Added:** Task 1134 (get_foreign_flow MCP Tool)
**Updated:** Task 1283a (circuit breaker diagnostics)
**Status:** STABLE
