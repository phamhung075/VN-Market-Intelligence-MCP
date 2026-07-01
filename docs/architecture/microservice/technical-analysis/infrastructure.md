# technical-analysis — Infrastructure

> **Language:** Go (pilot rewrite; P1-A..B-bucket tasks). TypeScript implementation superseded 2026-05-22.

## TACalculator
- **File:** `apps/technical-analysis/pkg/infrastructure/calculator.go`
- Implements `TAIndicatorCalculator` port
- Pure math, zero I/O

### Primitives (wired in calculator.go)

| Primitive | Package | Status |
|-----------|---------|--------|
| RSI | `pkg/primitive/rsi` | P1-B1g — wired |
| MACD | `pkg/primitive/macd` | P1-B2g — wired |
| Bollinger Bands | `pkg/primitive/bollinger_bands` | P1-B3g — wired |
| Moving Average | `pkg/primitive/moving_average` | P1-B4g — pending |
| Detect Cross | `pkg/primitive/detect_cross` | P1-B5g — pending |

### RSI (pkg/primitive/rsi)
- Wilder's smoothing: `avgGain = (prev*(period-1) + curr) / period`
- Seed: SMA of first `period` gain/loss values
- Edge: `avgLoss==0` → 100, `avgGain==0` → 0

### MACD (pkg/primitive/macd)
- EMA seed = SMA of first `period` closes; multiplier `k = 2/(period+1)`
- MACD line = fastEMA - slowEMA (aligned to slow start)
- Signal = EMA(macdLine, signalPeriod)
- Histogram = alignedMACD - signal

### Bollinger Bands (pkg/primitive/bollinger_bands)
- `middle = SMA(closes[i:i+period])`
- `stdDev = populationStdDev(window, N)` — **divisor N** (not N-1)
  - Formula: `sqrt(sum((v - mean)^2) / N)`
- `upper = middle + multiplier * stdDev`
- `lower = middle - multiplier * stdDev`
- Default: period=20, multiplier=2.0
- Cross-verified: Python `numpy.std(window, ddof=0)` — tolerance 1e-4

### Non-fatal wiring pattern
MACD and Bollinger Bands are wired non-fatally: if insufficient data for these indicators, RSI is still returned. Calculator only returns an error if RSI itself fails.

## SQLitePriceRepository
- **File:** `apps/technical-analysis/pkg/infrastructure/repositories.go`
- Constructor: `NewSQLitePriceRepository()` — no args; reads `DB_PATH` from `os.Getenv()`
- Opens DB readonly via `modernc.org/sqlite` (pure-Go, CGO_ENABLED=0)

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

## SQLiteMultiTickerOHLCVRepository — volume column added

- **File:** `apps/technical-analysis/pkg/infrastructure/multi_ticker_ohlcv_repository.go`
- MONEY-RADAR-P0-T1-OSCILLATORS extended the per-code subquery to also `SELECT volume`
  (defensive `sql.NullFloat64` scan, matching the existing open/high/low pattern —
  legacy rows with `NULL volume` default to `0`, not a scan error):

```sql
SELECT date, open, high, low, close, volume
  FROM (SELECT date, open, high, low, close, volume
          FROM daily_ohlcv
         WHERE code = ?
         ORDER BY date DESC
         LIMIT ?)
 ORDER BY date ASC
```

`SQLiteOHLCVRepository` (single-symbol, `ohlcv_repository.go`) was left unchanged —
money-flow oscillators reuse the multi-ticker repo (same pattern as
`/ta/roc-momentum`, `/ta/relative-strength`, `/ta/52w-proximity`).

## Environment Variables
```
PORT    → 5003
DB_PATH → ./data/market.db (readonly)
```
