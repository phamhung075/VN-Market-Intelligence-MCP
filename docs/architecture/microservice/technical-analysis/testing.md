# technical-analysis — Testing

## Unit Tests — Calculator
**File:** `apps/technical-analysis/src/__tests__/unit/ta-calculator.test.ts`

| Test | Assertion |
|------|-----------|
| MA insufficient data | Returns null |
| MA([10,20,30,40,50], 3) | = 40.0 |
| MA([10,20,30,40,50], 5) | = 30.0 |
| RSI insufficient data | Returns null |
| RSI pure ascending | = 100 |
| RSI pure descending | = 0 |
| RSI mixed prices | 0 < RSI < 100 |
| MACD insufficient data | Returns null |
| MACD structure | Has line, signal, histogram |
| MACD histogram | = line - signal |
| BB insufficient data | Returns null |
| BB varied prices | upper > mid > lower |
| BB equal prices | upper = mid = lower (zero std dev) |

## Unit Tests — Service
**File:** `apps/technical-analysis/src/__tests__/unit/calculate-ta-service.test.ts`

- Mock `PriceHistoryRepository.getHistory()` and `TAIndicatorCalculator` (all 4 methods)
- Verifies correct args passed to repository
- Trend: RSI>70 + macdHist>0 → BULLISH
- Trend: RSI<30 + macdHist<0 → BEARISH
- Trend: RSI mid-range → NEUTRAL
- Handles null indicators gracefully

## Integration Tests
**File:** `apps/technical-analysis/src/__tests__/integration/compute-ta-usecase.test.ts`

- Uses real `TACalculatorImpl`, mocked repository
- Response includes `code` and ISO `computedAt`
- Null indicators for insufficient data (3 candles)
- Valid indicators for 60+ candles (RSI 0-100, MACD not null)
- Flat prices → NEUTRAL trend

## Run Commands
```bash
cd apps/technical-analysis && bun test
cd apps/technical-analysis && bun tsc --noEmit
```
