# technical-analysis — Infrastructure

## TACalculatorImpl
- **File:** `apps/technical-analysis/src/infrastructure/calculator.ts`
- Implements `TAIndicatorCalculator`
- Pure math, zero I/O

### Internal Helpers

**`ema(prices, period)`** — Standard EMA
- Multiplier: `k = 2 / (period + 1)`
- Formula: `result[i] = prices[i] * k + result[i-1] * (1 - k)`

**`wilderEma(values, period)`** — Wilder's EMA (for RSI)
- Initial: `seedSum / period`
- Multiplier: `k = 1 / period`
- Formula: `result[i] = values[i] * k + result[i-1] * (1 - k)`

**`populationStdDev(values)`** — Population std dev (not sample)
- Formula: `sqrt(sum((v - mean)^2) / count)`

### RSI Calculation
1. Compute deltas: `prices[i] - prices[i-1]`
2. Separate gains (positive) and losses (|negative|)
3. Wilder's EMA on gains and losses separately
4. Edge: `avgLoss===0` → 100, `avgGain===0` → 0
5. Formula: `100 - 100 / (1 + avgGain / avgLoss)`

### MACD Calculation
1. Fast EMA (12) and Slow EMA (26) of close prices
2. MACD line = fastEma - slowEma
3. Signal line = standard EMA(9) of MACD line
4. Histogram = line - signal

### Bollinger Bands Calculation
1. Window = last `period` prices (default 20)
2. Mid = SMA of window
3. Sigma = populationStdDev(window)
4. Upper = mid + stdDev * sigma (default 2)
5. Lower = mid - stdDev * sigma

## SQLitePriceRepository
- **File:** `apps/technical-analysis/src/infrastructure/repositories.ts`
- Opens DB readonly: `new Database(DB_PATH, { readonly: true, create: false })`

```sql
SELECT
  date(fetched_at) AS day,
  MIN(price) AS low, MAX(price) AS high,
  AVG(price) AS close, AVG(price) AS open,
  SUM(volume) AS volume
FROM market_prices
WHERE code = ? AND fetched_at >= date('now', ? || ' days')
GROUP BY date(fetched_at) ORDER BY day ASC
```

## Environment Variables
```
PORT    → 5003
DB_PATH → ./data/market.db (readonly)
```
