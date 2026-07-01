# technical-analysis — Use Cases

## ComputeTAUseCase
- **File:** `apps/technical-analysis/src/application/usecases.ts`
- **Input:** `ComputeTARequest { code: string, days: number }`
- **Output:** `ComputeTAResponse`

```typescript
interface ComputeTAResponse {
  code: string
  rsi: number | null
  macd: { line: number, signal: number, histogram: number } | null
  movingAverages: { ma5: number | null, ma20: number | null, ma50: number | null }
  bollingerBands: { upper: number, mid: number, lower: number } | null
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL'
  computedAt: string  // ISO 8601 timestamp added by use case
}
```

**Flow:**
1. Calls `CalculateTAService.compute(code, days)`
2. Maps domain `TechnicalIndicators` to response DTO
3. Adds `computedAt: new Date().toISOString()`

## ComputeMoneyFlowUseCase (Go)
- **File:** `apps/technical-analysis/pkg/application/money_flow_usecase.go`
- **Input:** `MoneyFlowRequest { Tickers []string }` (optional — defaults to watchlist)
- **Output:** `MoneyFlowResponse { Tickers []MoneyFlowPerTickerDTO }`
- **Ports:** `MultiTickerRepo` (reused from `momentum_usecase.go`), `MoneyFlowSvc`

**Flow:**
1. Resolve `tickers` — `req.Tickers` override, else `uc.watchlist` (loaded at
   composition root from `WATCHLIST_TICKERS` env or the DB `watchlist` table —
   `docs/data/system-map.json` `.project.watchlist` is the ultimate SSOT).
2. `repo.GetMultiTickerCandles(tickers, moneyFlowBarLimit=100)` — per-code
   subqueries against `daily_ohlcv`, close+volume (C1), oldest→newest.
3. `MoneyFlowSvc.ComputeCrossSection(allBars, tickers)` — pure domain calc.
4. Map domain result to `MoneyFlowResponse` DTO.

No side effects — readonly DB access only.
