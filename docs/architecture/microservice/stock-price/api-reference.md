# stock-price — API Reference

**File:** `apps/stock-price/pkg/interface/http/router.go`

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

## GET /price/history
Historical daily OHLCV candles (query-param form — used by mcp-server clients.ts).

**Query params:**
- `code` (required, stock symbol — uppercased internally)
- `days` (optional, default: 30, must be positive integer)

**URL example:** `GET /price/history?code=VCB&days=30`

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

## GET /price/history/:code
Backward-compatible path-param route (also accepts `?days=N`).

**URL example:** `GET /price/history/VCB?days=30`

**Response:** same shape as query-param route above.
