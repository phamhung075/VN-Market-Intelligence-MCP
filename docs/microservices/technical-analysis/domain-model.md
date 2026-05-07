# technical-analysis — Domain Model

## Types

### CandleStick
```typescript
interface CandleStick {
  date: string    // "YYYY-MM-DD"
  open: number
  high: number
  low: number
  close: number
  volume: number
}
```

### TechnicalIndicators
```typescript
interface TechnicalIndicators {
  rsi: number | null
  macd: { line: number, signal: number, histogram: number } | null
  movingAverages: { ma5: number | null, ma20: number | null, ma50: number | null }
  bollingerBands: { upper: number, mid: number, lower: number } | null
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL'
}
```

## Repository Ports

### PriceHistoryRepository
```typescript
interface PriceHistoryRepository {
  getHistory(code: string, days: number): Promise<CandleStick[]>
}
```

### TAIndicatorCalculator
```typescript
interface TAIndicatorCalculator {
  calculateRSI(closes: number[], period?: number): number | null
  calculateMACD(closes: number[]): { line, signal, histogram } | null
  calculateMA(closes: number[], period: number): number | null
  calculateBB(closes: number[], period?, stdDev?): { upper, mid, lower } | null
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
