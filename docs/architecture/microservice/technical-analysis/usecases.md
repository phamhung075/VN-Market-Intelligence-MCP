# technical-analysis — Use Cases

## ComputeTAUseCase (Go — deployed, single authoritative contract)
> FACTORY-TECHANALYSIS-reconcile-ta-contract (2026-07-08): this section used
> to describe the dead TypeScript shadow service
> (`apps/technical-analysis/src/application/usecases.ts` — never started by
> Dockerfile/docker-compose.yml, scheduled for deletion by
> `FACTORY-TECHANALYSIS-delete-orphaned-ts-service`). Replaced with the real
> Go use case. No `trend` field — see `api-reference.md` note.

- **File:** `apps/technical-analysis/pkg/application/usecases.go`
- **Input:** `ComputeTARequest { Symbol string, Period int, Closes []float64 }`
- **Output:** `ComputeTAResponse` (all indicator fields are `[]float64` time-series, `omitempty`)
- **Ports:** `TACalculator` (`Calculate(closes []float64, period int)`), `PriceRepo` (`GetCandles(symbol string, limit int)`)

**Flow (`Execute`):**
1. `period <= 0` → default to 14.
2. `len(closes) == 0`? → DB-backed path: `symbol == ""` is a hard error
   (`"closes or symbol required"`); otherwise `priceRepo.GetCandles(symbol, 60)`
   (limit fixed at 60, independent of `period`) and extract `.Close` in order.
   `len(closes) > 0` → pure-compute path, DB is never touched (closes as given).
3. `calculator.Calculate(closes, period)` → `pkg/module.Compute` (RSI window =
   `period`, MACD fixed 12/26/9, BB fixed 20/2σ, SMA/EMA window = `period`,
   MA5/MA20/MA50 always fixed at 5/20/50).
4. Map `domain.TechnicalIndicators` to `ComputeTAResponse`, `Symbol` echoed
   from the request (empty string on the pure-compute-without-symbol path).

Covered by `pkg/application/usecases_test.go` (pure-compute path, DB-backed
path, period-default, empty-both error, repo/calculator error propagation —
see `testing.md`).

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
