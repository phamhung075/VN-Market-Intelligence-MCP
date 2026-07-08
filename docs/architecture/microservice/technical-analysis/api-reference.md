# technical-analysis — API Reference

**File:** `apps/technical-analysis/pkg/interface/http/router.go` (deployed — Go)

> **Single authoritative contract:** `apps/technical-analysis/api/openapi.yaml`
> (FACTORY-TECHANALYSIS-reconcile-ta-contract, 2026-07-08). A previous version
> of this doc described the dead TypeScript shadow service's contract
> (`apps/technical-analysis/src/interface/handlers.ts` — `{code,days}` ->
> scalar values + `trend`). That service is never started by
> Dockerfile/docker-compose.yml and is scheduled for deletion
> (`FACTORY-TECHANALYSIS-delete-orphaned-ts-service`); it was NEVER what's
> below this line. See
> `docs/agent-memory/decisions/sprint-SYSTEMIC-REMAKE-P1-dev-technical-analysis.md`
> STEP dev-technical-analysis-S2 for the investigation that confirmed no live
> caller depends on the TS shape's `trend` semantics.

## GET /health
```json
{ "status": "ok", "service": "technical-analysis", "port": 5003 }
```

## POST /ta/indicators
Compute technical indicators for a stock. Request/response arrays are
time-series (oldest → newest); the last element is the most-recent value.
No `trend` field — see the note above.

**Request — two paths, `closes` wins if both are sent:**
```json
{ "symbol": "VNM", "period": 60 }
```
```json
{ "closes": [44.34, 44.09, 44.15, 43.61, 44.33] }
```

| Field | Required | Notes |
|---|---|---|
| `symbol` | one of `symbol`/`closes` | DB-backed path — reads the most recent **60** candles from `market.db` (fixed, independent of `period`) |
| `closes` | one of `symbol`/`closes` | pure-compute path — `market.db` never consulted; takes precedence when both are sent |
| `period` | optional | drives ONLY the `rsi` window and the `sma`/`ema` window; `<=0` or omitted defaults to **14**. Does NOT change the DB candle limit (always 60) and does NOT affect MACD (fixed 12/26/9), Bollinger Bands (fixed 20, 2σ), or `ma5`/`ma20`/`ma50` (always fixed at 5/20/50) |

**400** on invalid JSON or when neither `symbol` nor `closes` is provided (`{"error":"closes or symbol required"}`).

**Response (200) — live probe, 2026-07-08 (60 closes, `period=60`), arrays truncated with `…` for readability:**
```json
{
  "symbol": "VCB",
  "rsi": [62.50, 59.09, 62.74, "…", 60.68],
  "macdLine": [1.031, 1.058, "…", 1.036],
  "signalLine": [1.041, 1.045, "…", 1.047],
  "histogram": [-0.010, 0.014, "…", -0.012],
  "bollingerUpper": [47.21, 47.45, "…", 53.21],
  "bollingerMiddle": [45.43, 45.58, "…", 51.43],
  "bollingerLower": [43.64, 43.70, "…", 49.64],
  "sma": [44.98, 45.13, "…", 51.88],
  "ema": [44.98, 45.17, "…", 51.85],
  "ma5": [44.36, 44.39, "…", 52.49],
  "ma20": [45.43, 45.58, "…", 51.43],
  "ma50": [47.68, 47.83, "…", 49.18]
}
```
Each array is omitted (not `null`) when there is insufficient history for that
indicator's window (e.g. `ma50` needs ≥ 50 candles, `signalLine`/`histogram`
need ≥ 26+9 = 35 candles).

**500:** `{ "error": "internal error" }` — e.g. `market.db` read failure on
the DB-backed path.

## Data Flow
```
POST /ta/indicators → pkg/interface/http.handleIndicators
  → pkg/application.ComputeTAUseCase.Execute
      closes non-empty?  -> pure-compute (skip DB)
      symbol set only?   -> pkg/infrastructure PriceRepo.GetCandles(symbol, 60) (market.db readonly)
  → pkg/infrastructure.TACalculator.Calculate(closes, period)
      -> pkg/module.Compute — composes 5 pure primitives:
         rsi (Wilder, window=period) · macd (fixed 12/26/9) · bollinger_bands (fixed 20, 2σ)
         · moving_average (SMA+EMA, window=period) · fixed MA5/MA20/MA50 (always 5/20/50)
  → application.ComputeTAResponse (JSON)
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
