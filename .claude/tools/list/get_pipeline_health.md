---
tool: get_pipeline_health
category: alerts
agents: [system-auditor, unified-agent]
---

# `get_pipeline_health`

**Category:** alerts | **Used by:** System Auditor, Unified Coordinator
**Description:** Returns per-ticker OHLCV row counts, TA readiness (rows >= 8), RSI signal, backfill queue status, and total non-neutral signal count.

## Parameters

None

## Returns

Formatted plain-text report:

```
[Pipeline Health] Generated: 2026-05-05T16:45:00
Aggregator last run: 2026-05-05T16:30:00
Backfill queue pending: 12
  Last requested at: 2026-05-05T14:20:00
  Last completed at: 2026-05-05T14:15:00
Non-neutral TA signals: 87

Ticker Health:
  VCB: rows=42 | TA ready | signal=buy | RSI14=62.5
  FPT: rows=38 | TA ready | signal=sell | RSI14=35.2
  HPG: rows=5 | TA not ready
  TPB: rows=15 | TA ready | RSI14=48.3
```

## Usage

```json
{
  "tool_name": "get_pipeline_health",
  "input": {}
}
```

## Notes

- TA readiness: requires >= 8 rows of OHLCV data
- RSI14: Relative Strength Index (0–100, <30 oversold, >70 overbought)
- Backfill queue: pending requests awaiting historical data fetch
- Non-neutral signals: count of active buy/sell recommendations
- Useful for instant pipeline verification without waiting for evening report
