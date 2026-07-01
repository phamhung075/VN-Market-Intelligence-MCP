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
  RSI             []float64  // Wilder's 14-period RSI; len = N - period
  MACDLine        []float64  // fast EMA - slow EMA (aligned)
  SignalLine       []float64  // EMA of MACDLine
  Histogram       []float64  // MACDLine - SignalLine
  BollingerUpper  []float64  // SMA + 2*populationStdDev
  BollingerMiddle []float64  // SMA(period=20)
  BollingerLower  []float64  // SMA - 2*populationStdDev
  SMA             []float64  // (P1-B4g)
  EMA             []float64  // (P1-B4g)
}
```

## Repository Ports

### PriceHistoryRepository
```go
// pkg/domain/ports.go
type PriceHistoryRepository interface {
  // GetHistory returns daily closes for symbol over last N days.
  GetHistory(symbol string, days int) ([]CandleStick, error)
}
```

### TAIndicatorCalculator
```go
// pkg/domain/ports.go
type TAIndicatorCalculator interface {
  Calculate(closes []float64, period int) (*TechnicalIndicators, error)
}
```

## Domain Service

### CalculateTAService
- **File:** `apps/technical-analysis/src/domain/services.ts`
- Constructor: `(priceRepo: PriceHistoryRepository, calculator: TAIndicatorCalculator)`

**Method: `compute(code: string, days: number): Promise<TechnicalIndicators>`**
1. Fetch price history via `priceRepo.getHistory(code, days)`
2. Extract close prices: `history.map(c => c.close)`
3. Compute all indicators with defaults
4. Determine trend via `determineTrend(rsi, macdHist, closes)`

### Trend Determination Logic
- `rsi > 70 AND macdHist > 0` → **BULLISH**
- `rsi < 30 AND macdHist < 0` → **BEARISH**
- Fallback (if RSI/MACD unavailable):
  - `last close > prev close * 1.01` → **BULLISH**
  - `last close < prev close * 0.99` → **BEARISH**
  - Otherwise → **NEUTRAL**

## Indicator Formulas & Thresholds

| Indicator | Default Period | Formula | Min Data |
|-----------|---------------|---------|----------|
| **RSI** | 14 | `100 - 100/(1 + avgGain/avgLoss)` using Wilder's EMA | 15 prices |
| **MACD** | Fast=12, Slow=26, Signal=9 | Line=FastEMA-SlowEMA, Hist=Line-Signal | 34 prices |
| **MA** | 5, 20, 50 | `sum(last N prices) / N` | N prices |
| **Bollinger** | 20, 2x StdDev | Mid=SMA20, Upper/Lower=Mid +/- 2*populationStdDev | 20 prices |

**RSI Thresholds:** Overbought >70, Oversold <30

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
