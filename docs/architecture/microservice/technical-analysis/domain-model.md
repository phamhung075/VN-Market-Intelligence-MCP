# technical-analysis — Domain Model

> **Language:** Go (pilot rewrite; P1-A..B-bucket tasks). TypeScript types superseded 2026-05-22.

## Types

### CandleStick
```go
// pkg/domain/models.go
type CandleStick struct {
  Symbol string
  Date   string
  Open   float64
  High   float64
  Low    float64
  Close  float64
  Volume int64
}
```

### TechnicalIndicators
```go
// pkg/domain/models.go
type TechnicalIndicators struct {
  Symbol          string
  RSI             []float64  // Wilder RSI, window = request period (default 14)
  MACDLine        []float64  // fast EMA(12) - slow EMA(26), fixed, aligned
  SignalLine      []float64  // EMA(9) of MACDLine, fixed
  Histogram       []float64  // MACDLine - SignalLine
  BollingerUpper  []float64  // SMA(20) + 2*populationStdDev, fixed
  BollingerMiddle []float64  // SMA(period=20), fixed
  BollingerLower  []float64  // SMA(20) - 2*populationStdDev, fixed
  SMA             []float64  // Simple MA, window = request period (default 14)
  EMA             []float64  // Exponential MA, window = request period (default 14); standard alpha=2/(period+1), NOT Wilder's
  CrossSignals    []CrossSignal // MACD line vs signal line crossovers
  MA5             []float64  // fixed 5-period SMA, independent of request period
  MA20            []float64  // fixed 20-period SMA, independent of request period
  MA50            []float64  // fixed 50-period SMA, independent of request period
}
```

## Repository Ports

> **Discovered signal (FACTORY-TECHANALYSIS-reconcile-ta-contract, 2026-07-08,
> out of this task's file-scope — not fixed here):** `pkg/domain/ports.go`'s
> `PriceHistoryRepository`/`TAIndicatorCalculator` below are consumed ONLY by
> `pkg/domain/services.go`'s `CalculateTAService` — a domain-layer stub whose
> `Compute()` is hardcoded to return a zero-value `TechnicalIndicators{Symbol:
> symbol}` always (`// Stub: body will be filled in P1-B bucket tasks` — P1-B
> has long since landed via `pkg/application`/`pkg/infrastructure` instead).
> `cmd/server/main.go:71` constructs it and immediately discards the result
> (`_ = domain.NewCalculateTAService(priceRepo, calculator) // domain service
> wired (unused HTTP path)`) — it is never reachable from any HTTP route. The
> REAL wired path behind `/ta/indicators` uses the separate, differently-named
> `pkg/application.PriceRepo`/`TACalculator` ports — see `usecases.md`. This
> is a second, Go-native (not TypeScript) dead-code path discovered during the
> contract-reconciliation investigation; flagged for a follow-up cleanup task
> rather than fixed here (this task's file scope is `router.go`/`dtos.go`/
> `api/openapi.yaml`).

### PriceHistoryRepository (orphaned — see note above)
```go
// pkg/domain/ports.go
type PriceHistoryRepository interface {
  GetCandles(symbol string, period int) ([]CandleStick, error)
}
```

### TAIndicatorCalculator (orphaned — see note above)
```go
// pkg/domain/ports.go
type TAIndicatorCalculator interface {
  Calculate(closes []float64, period int) (*TechnicalIndicators, error)
}
```

## Application/Infrastructure — Go (deployed, single authoritative flow)

See `usecases.md` § ComputeTAUseCase for the full `Execute` flow
(`pkg/application/usecases.go` → `pkg/infrastructure/calculator.go` →
`pkg/module.Compute`). No domain-layer `CalculateTAService`/trend-determination
step exists in the deployed Go service — see "Trend field — dropped" below.

### Trend field — dropped (not ported)

> FACTORY-TECHANALYSIS-reconcile-ta-contract (2026-07-08). This section used
> to document a `determineTrend()` heuristic that only ever existed in the
> dead TypeScript shadow service (`apps/technical-analysis/src/domain/services.ts`
> — never started by Dockerfile/docker-compose.yml; scheduled for deletion by
> `FACTORY-TECHANALYSIS-delete-orphaned-ts-service`):
> - `rsi > 70 AND macdHist > 0` → `BULLISH`
> - `rsi < 30 AND macdHist < 0` → `BEARISH`
> - Fallback (RSI/MACD unavailable): `last close > prev close * 1.01` →
>   `BULLISH`; `last close < prev close * 0.99` → `BEARISH`; else `NEUTRAL`
>
> A repo-wide investigation (mcp-server, frontend, alert-engine,
> `packages/shared-types`) found no live caller depending on this heuristic's
> 70/30-threshold semantics — the TS route never receives traffic, its
> TypeScript-shaped twin type has zero importers, and the frontend's only
> caller of a scalar+trend response already 404s today for an unrelated
> gateway path-construction bug (`/ta/ta/indicators` double-segment — logged
> as a discovered signal, out of `apps/technical-analysis/` zone, not fixed
> here). Per DoD, the feature is DROPPED rather than ported into the Go
> module tier. Full reasoning:
> `docs/agent-memory/decisions/sprint-SYSTEMIC-REMAKE-P1-dev-technical-analysis.md`
> STEP dev-technical-analysis-S2. The deployed `ComputeTAResponse` has no
> `trend` field — see `api-reference.md`.

## Indicator Formulas & Thresholds

| Indicator | Period | Formula | Min Data |
|-----------|---------------|---------|----------|
| **RSI** | request `period`, default 14 (Wilder-smoothed internally — configurable, NOT hardcoded) | `100 - 100/(1 + avgGain/avgLoss)` using Wilder's smoothing | period+1 prices |
| **MACD** | fixed Fast=12, Slow=26, Signal=9 (independent of request `period`) | Line=FastEMA-SlowEMA, Hist=Line-Signal | 35 prices |
| **SMA / EMA** | request `period`, default 14 | `sum(last N prices) / N` (SMA); standard `alpha=2/(N+1)` seeded by SMA (EMA — NOT Wilder's 1/N) | period prices |
| **MA5 / MA20 / MA50** | always fixed at 5 / 20 / 50 (independent of request `period`) | `sum(last N prices) / N` | 5 / 20 / 50 prices |
| **Bollinger** | fixed 20, 2x StdDev (independent of request `period`) | Mid=SMA20, Upper/Lower=Mid +/- 2*populationStdDev | 20 prices |

**RSI Thresholds (internal to Wilder RSI, not exposed as a response field):** Overbought >70, Oversold <30. Not used to compute a `trend` field — see "Trend field — dropped" above.

## MONEY-RADAR-P0-T1-OSCILLATORS — Money-Flow Oscillators

> Spec: `docs/architecture-briefs/2026-07-01-money-radar.md` §2 (C1), §11.1.
> FIELD-CONSTRAINT C1 (non-negotiable): `daily_ohlcv` close+volume only for this
> feature. MFI(14)/CMF(20)/A-D line/Chaikin Oscillator are FIELD-GATED (need
> High/Low) — OUT OF SCOPE, not implemented.

### OHLCVBar (extended)
```go
// pkg/domain/volatility_models.go
type OHLCVBar struct {
  Date   string
  Open   float64
  High   float64
  Low    float64
  Close  float64
  Volume float64  // added for money-flow oscillators; zero-value safe for other callers
}
```

### MoneyFlowResult
```go
// pkg/domain/money_flow_models.go
type MoneyFlowResult struct {
  Code           string
  OBV            *float64 // nil when <2 bars
  RelVolZ20      *float64 // nil when <21 bars or zero volume variance
  UpDownVolRatio *float64 // nil when <21 bars or zero down-volume in window
  DegradedVWAP   *float64 // nil when <21 bars or zero total volume in window
  IsProxy        bool     // always true (HN-5)
  BarsUsed       int
  NullReason     *string  // "insufficient_history" | "insufficient_window"
}
```

### MoneyFlowService — `pkg/domain/money_flow_service.go`
Pure calculation, zero I/O. `NewMoneyFlowService()` → `ComputeCrossSection(allBars map[string][]OHLCVBar, tickers []string) MoneyFlowCrossSection`.

| Oscillator | Formula | Window | Min bars |
|---|---|---|---|
| **OBV** | cumulative `sign(close_t-close_{t-1}) * volume_t` over ALL supplied bars | none (depth-independent) | 2 |
| **Relative-volume z-score(20)** | `(vol_t - mean_20) / std_20` (sample stddev, n-1) | trailing 20 bars, including t | 21 |
| **Up/Down volume ratio** | `sum(vol on up days) / sum(vol on down days)` | trailing 20 bars (21 with direction anchor) | 21 |
| **Degraded VWAP** | `sum(close*vol) / sum(vol)` — close-only proxy, `is_proxy=true` always | trailing 20 bars | 21 |

Edge cases (honest-NULL, never a fabricated zero):
- `<2` bars → all 4 fields nil, `NullReason="insufficient_history"`.
- `>=2` but `<21` bars → `OBV` real, the 3 windowed fields nil, `NullReason="insufficient_window"`.
- Zero volume variance in the 20-bar window → `RelVolZ20` nil (avoids div/0).
- Zero down-volume in the window → `UpDownVolRatio` nil (avoids `+Inf`).
- Zero total volume in the window → `DegradedVWAP` nil (avoids div/0).
