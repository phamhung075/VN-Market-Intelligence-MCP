# stock-price — API Reference

**File:** `apps/stock-price/src/interface/handlers.ts`

## GET /health
```json
{ "status": "ok", "service": "stock-price", "port": 5000 }
```

## POST /price/fetch
Fetch live price with 3-tier concurrent fallback.

**Request:**
```json
{ "code": "VCB" }
```

**Validation:** code must be non-empty string (400 if missing/empty)

**Response (200):**
```json
{
  "code": "VCB",
  "price": 88000,
  "volume": 2000000,
  "change": -1000,
  "changePercent": -1.12,
  "source": "hose",
  "latencyMs": 245,
  "fetchedAt": "2026-05-06T10:30:00.000Z"
}
```

**404:** `{ "error": "Price not available for VCB" }` (all tiers failed)

**500:** `{ "error": "[error message]" }`

## GET /price/history/:code
Historical daily OHLCV candles.

**Path param:** `code` (stock symbol, uppercased internally)

**Query param:** `days` (default: 30, must be positive integer)

**Response (200):**
```json
{
  "code": "VCB",
  "history": [
    { "date": "2026-04-06", "open": 87500, "high": 88500, "low": 87000, "close": 88000, "volume": 1500000 }
  ]
}
```

**400:** Missing code, invalid days parameter
