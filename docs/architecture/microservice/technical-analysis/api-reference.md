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

## POST /ta/money-flow-oscillators

**File:** `apps/technical-analysis/pkg/interface/http/money_flow_handler.go`

MONEY-RADAR-P0-T1-OSCILLATORS: the 4 Phase-0-shippable money-flow oscillators
(OBV, relative-volume z-score(20), up/down volume ratio, degraded close-only
VWAP) per money-radar brief `docs/architecture-briefs/2026-07-01-money-radar.md`
§2 field-constraint C1 (`daily_ohlcv` close+volume only — no High/Low).
MFI/CMF/A-D line/Chaikin Oscillator are FIELD-GATED and intentionally absent.

**Request (all optional):**
```json
{ "tickers": ["VCB"] }
```
When `tickers` is omitted or empty, computes for the full watchlist
(`docs/data/system-map.json` `.project.watchlist`, resolved via the DB
`watchlist` table at composition-root startup — same pattern as
`/ta/roc-momentum`, `/ta/relative-strength`, `/ta/52w-proximity`).

**Response (200) — live probe, 2026-07-01, post-rebuild (image `14cc6c62f857`):**
```json
{
  "tickers": [
    {
      "code": "VCB",
      "obv": 17926690,
      "rel_vol_z_20": -2.100230853390725,
      "up_down_vol_ratio": 1.39130139275766,
      "degraded_vwap": 61654.54866462252,
      "is_proxy": true,
      "bars_used": 100
    }
  ]
}
```

**Fields:**
| Field | Type | Null condition |
|---|---|---|
| `obv` | number\|null | `<2` bars (`insufficient_history`) |
| `rel_vol_z_20` | number\|null | `<21` bars, or zero volume variance in the 20-bar window |
| `up_down_vol_ratio` | number\|null | `<21` bars, or zero down-volume in the 20-bar window |
| `degraded_vwap` | number\|null | `<21` bars, or zero total volume in the 20-bar window |
| `is_proxy` | boolean | always `true` — HN-5: `degraded_vwap` is never a canonical VWAP (no H/L) |
| `bars_used` | integer | bars actually fetched for the ticker (fetch cap 100) |
| `null_reason` | string, omitted when null | `"insufficient_history"` \| `"insufficient_window"` |

**Honest-NULL example (thin ticker, live probe):**
```json
{ "code": "BDI", "obv": null, "rel_vol_z_20": null, "up_down_vol_ratio": null,
  "degraded_vwap": null, "is_proxy": true, "bars_used": 1, "null_reason": "insufficient_history" }
```

## Data Flow — money-flow oscillators
```
POST /ta/money-flow-oscillators → ComputeMoneyFlowUseCase
  → SQLiteMultiTickerOHLCVRepository.GetMultiTickerCandles (daily_ohlcv, close+volume)
  → MoneyFlowService.ComputeCrossSection (pure calc, per ticker)
  → MoneyFlowResponse
```
