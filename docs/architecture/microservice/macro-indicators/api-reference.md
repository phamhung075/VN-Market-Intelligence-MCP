# macro-indicators — API Reference

**File:** `apps/macro-indicators/src/interface/handlers.ts`

## GET /health
```json
{ "status": "ok", "service": "macro-indicators", "port": 5004 }
```

## POST /macro/snapshot
Fetch current macroeconomic indicators with directional signals.

**Request:** `{}` (empty body, future extensibility for filters)

**Response (200):**
```json
{
  "vnIndex": 1200.5,
  "oilUsd": 85.0,
  "goldUsd": 2100.0,
  "usdVnd": 24500.0,
  "signals": [
    { "indicator": "oil_usd", "value": 85.0, "unit": "USD/barrel", "direction": "NEUTRAL", "impact": "HIGH" },
    { "indicator": "gold_usd", "value": 2100.0, "unit": "USD/oz", "direction": "NEUTRAL", "impact": "MEDIUM" },
    { "indicator": "usd_vnd", "value": 24500.0, "unit": "VND/USD", "direction": "NEUTRAL", "impact": "HIGH" }
  ],
  "fetchedAt": "2026-05-06T10:30:00.000Z"
}
```

**Note:** Any value can be `null` if source unavailable. Signals array only includes non-null indicators.

**500:** `{ "error": "error message" }`
