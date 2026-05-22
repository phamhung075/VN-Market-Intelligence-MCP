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
