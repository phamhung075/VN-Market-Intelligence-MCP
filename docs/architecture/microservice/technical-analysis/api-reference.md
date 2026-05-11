# technical-analysis — API Reference

**File:** `apps/technical-analysis/src/interface/handlers.ts`

## GET /health
```json
{ "status": "ok", "service": "technical-analysis", "port": 5003 }
```

## POST /ta/indicators
Compute all technical indicators for a stock.

**Request:**
```json
{ "code": "VCB", "days": 60 }
```

**Validation:**
- `code`: non-empty string (trimmed + uppercased)
- `days`: `Number.isFinite() && days >= 1`
- 400 on invalid JSON or validation failure

**Response (200):**
```json
{
  "code": "VCB",
  "rsi": 65.5,
  "macd": { "line": 0.123, "signal": 0.100, "histogram": 0.023 },
  "movingAverages": { "ma5": 150.2, "ma20": 149.8, "ma50": 148.5 },
  "bollingerBands": { "upper": 155.0, "mid": 150.0, "lower": 145.0 },
  "trend": "BULLISH",
  "computedAt": "2026-05-06T10:30:45.123Z"
}
```

**Note:** Fields return `null` when insufficient price history (e.g. RSI needs 15+ candles, MACD needs 34+).

**500:** `{ "error": "error message" }`

## Data Flow
```
POST /ta/indicators → ComputeTAUseCase → CalculateTAService
  → SQLitePriceRepository.getHistory (market.db readonly)
  → TACalculatorImpl (RSI, MACD, MA, BB)
  → determineTrend → ComputeTAResponse
```
