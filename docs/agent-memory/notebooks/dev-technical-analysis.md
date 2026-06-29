# dev-technical-analysis — Notebook

Zone: `apps/technical-analysis/` | Stack: **Go** (pilot active, 2026-05-22) | DB: market.db (read-only)

## Working Memory

[3 most recent cycles retained below. Archive in git history.]

### 2026-06-15 — FIX-TA-GOSVC-MA5-PRECISION — MA5 N/A regression + RSI drift fix

**Task:** FIX-TA-GOSVC-MA5-PRECISION (commit d32f0a17)

**Status:** DONE — commit d32f0a17. REBUILD_REQUIRED: YES.

**Root causes (recon-confirmed):**

(a) MA5 N/A at 38 candles while MA20 computed: Go `module.Compute` computed ONE `SMA(MAPeriod)` — default 14. `clients.ts` mapped `last(raw.sma)` to `mapped.ma20` only. MA5 and MA50 were never requested or returned from Go. The MA5=N/A was a protocol gap, not a length-guard bug.

(b) Go RSI ~1pt drift vs TS report path: candle-window divergence. TS report path `defaultComputeTa` uses `ORDER BY date ASC LIMIT 60`; TS fallback in `technicalIndicatorTools.ts` uses `date >= date('now', '-N days')`. When candle counts differ (production with >60 rows), Wilder smoothing diverges. Fix: pre-fetch closes on TS side and pass to Go, forcing identical candle set.

**Fix:**
- `pkg/module/technical_analysis.go`: added `MA5/MA20/MA50` fields; fixed-period SMA(5/20/50) compute blocks.
- `pkg/domain/models.go`, `pkg/application/dtos.go`, `pkg/application/usecases.go`, `pkg/infrastructure/calculator.go`: MA5/MA20/MA50 propagated end-to-end.
- `pkg/module/technical_analysis_test.go`: 38-candle regression + TestComputeMA5FixedPeriodIndependentOfMAPeriod.
- `clients.ts` + `technicalIndicatorTools.ts` (mcp-server): named MA fields; pre-fetch closes for RSI/MA alignment.

**Test results:** `go test ./...` 11 packages GREEN. `go vet` clean. `go build ./cmd/...` OK. `pnpm check` clean. REBUILD_REQUIRED: YES.

---

### 2026-06-15 — FIX-TA-GOSVC-NA-DESPITE-DEPTH — Go service DB-backed path implemented

**Task:** FIX-TA-GOSVC-NA-DESPITE-DEPTH (commit 33e7a094)

**Status:** DONE — REBUILD_REQUIRED: YES.

**Root cause:** `SQLitePriceRepository.GetCandles` was a stub → `ComputeTAUseCase.Execute()` returned empty response → RSI/MA20/BB N/A despite 38 rows in market.db.

**Fix:**
- `pkg/infrastructure/repositories.go`: `GetCandles` implemented via `database/sql` + `modernc.org/sqlite`; mirrors TS query exactly.
- `pkg/application/usecases.go`: added `PriceRepo` port; DB-backed path fetches candles → closes → calculator.
- `cmd/server/main.go`: pass `priceRepo` to use-case.
- `cmd/sandbox/main.go`: `noopPriceRepo` (panics if DB path exercised — sandbox credential-free contract).
- `pkg/infrastructure/repositories_test.go` (new): 5 tests.

**Results:** `go test ./...` 9 packages GREEN. All sandbox 30 scenarios GREEN. REBUILD_REQUIRED: YES.

---

### 2026-06-29 — P0-1-VOLATILITY-INDICATORS — RV + ATR% + regime band + drawdown

**Task:** P0-1-VOLATILITY-INDICATORS (sprint MARKET-INDICATOR-DEPTH-P0)

**Status:** REVIEW — REBUILD_REQUIRED: YES.

**Scope:** New `POST /ta/volatility-indicators`. Computes VN-Index RV 10/20/60d (close-to-close + Garman-Klass), per-stock ATR%(14), volatility regime band, 252d drawdown, `rv_20d_percentile` gauge scalar for Fear & Greed P1.

**Architecture (DDD three-tier):**
- Domain: `OHLCVBar`, `VolatilityRegime` const, `VolatilityService` (7 pure methods), `OHLCVRepository` port.
- Application: `ComputeVolatilityUseCase` — sandbox injection via `VNIndexBars`/`TickerBars`; DB via `SQLiteOHLCVRepository`.
- Infrastructure: `GetOHLCV` — `daily_ohlcv WHERE code=? ORDER BY date ASC LIMIT 300`.
- Interface: `handleVolatilityIndicators`, nil-guarded route in `NewRouter`.

**Partial release:** rv_60d_pct + drawdown_252d_pct return honest NULL until OHLCV-BACKFILL-P0 delivers ≥61/252 bars. RV10/20d, GK, ATR%, regime ship now.

**Watchlist:** WATCHLIST_TICKERS env var (comma-separated). Docker build context excludes docs/. Ops must set from system-map.json .project.watchlist in docker-compose environment.

**Zone health:** 35+ unit tests PASS. Sandbox 35 scenarios GREEN (incl. volatility-null-propagation + volatility-partial-compute). go vet + golangci-lint clean. go build OK.

**Blocker for QA:** MCP tool `get_volatility_indicators` registration in apps/mcp-server OUT OF SCOPE (concurrent dev). QA must coordinate.

---

## Archive

[Archived to git history; retained: 3 most recent cycles. Full history in git log.]

### 2026-05-24 — Multiple TA dashboard improvements

Archived entries (dashboard/dash-check.mjs, category relabel, service tier, render gate, bake-verdicts). See git log for full details.
