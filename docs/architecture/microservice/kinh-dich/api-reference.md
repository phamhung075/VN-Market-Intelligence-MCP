# kinh-dich-service — API Reference

**File:** `apps/kinh-dich-service/src/interface/handlers.ts`

## GET /health
```json
{ "status": "ok", "service": "kinh-dich-service", "port": 5005 }
```

## GET /reading/:code
Cast hexagram reading for a stock.

**Path param:** `code` (uppercased internally)

**Query param:** `days` (default 30, must be positive integer)

**Response (200):**
```json
{
  "stock": "VCB",
  "hexagram": 11,
  "name": "Thai",
  "trend": "THUAN LOI",
  "signal": "MUA (tich cuc)",
  "confidence": 0.72,
  "actionNote": "Thoi diem thuan loi de mua vao",
  "overallReading": "Que Thai chi su hanh thong...",
  "timestamp": "2026-05-06T10:30:00.000Z"
}
```

**400:** Invalid days parameter
**404:** HexagramNotFoundError (no data for this stock)
**500:** Generic error

## GET /market
Market-wide hexagram reading (VNINDEX).

**Response (200):**
```json
{
  "hexagram": 1,
  "name": "Can",
  "trend": "THUAN LOI",
  "signal": "MUA",
  "confidence": 0.65,
  "timestamp": "2026-05-06T10:30:00.000Z"
}
```

**422:** InsufficientDataError (no market data)
**500:** Generic error

## Error Mapping
- `HexagramNotFoundError` → 404
- `InsufficientDataError` → 422
- Others → 500
