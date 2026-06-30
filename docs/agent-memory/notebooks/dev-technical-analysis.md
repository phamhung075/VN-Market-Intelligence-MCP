# dev-technical-analysis — Notebook

Zone: `apps/technical-analysis/` | Stack: **Go** (pilot active, 2026-05-22) | DB: market.db (read-only)

## Working Memory

[3 most recent cycles retained below. Archive in git history.]

### 2026-06-30 — FIX-TA-SVC-STALE-SPLIT-DATA-SOURCE — stale data + global-limit + Tết gap

**Task:** FIX-TA-SVC-STALE-SPLIT-DATA-SOURCE (commit b6055728). REBUILD_REQUIRED: YES.

**Root causes (3 compounding bugs in infrastructure + domain):**

(a) **GetCandles / GetOHLCV — ORDER BY date ASC LIMIT N returned OLDEST bars.**
`ORDER BY date ASC LIMIT 60` fetched the 60 oldest rows (2023 stale data, VCB at 88k-92k range) instead of the most recent 60. Fix: inner subquery `ORDER BY date DESC LIMIT ?` + outer `ORDER BY date ASC` to always return latest N bars.

(b) **GetMultiTickerCandles — global LIMIT starvation cut off later-alphabet codes.**
Single IN-clause `LIMIT len(codes)*limit` applied after `ORDER BY code, date ASC`: FPT+HPG+MBB consumed the first 2200+ rows of a 2400 budget, leaving VCB/VHM/MSN/MWG with 0 bars → `insufficient_history` for 5/8 watchlist tickers. Fix: per-code subqueries (one `SELECT ... ORDER BY date DESC LIMIT ?` per ticker), eliminating the global budget entirely.

(c) **maxCalendarGap=5 rejected Vietnamese Tết holiday (10-day closure).**
VN market closes ~10 calendar days for Tết (e.g. 2026-02-13→2026-02-23). Gap check flagged this as `data_gap_too_large` for ALL tickers. Fix: raise constant from 5 to 14 (covers Tết + weekend margin, still catches multi-week true outages).

**Files changed:** `pkg/infrastructure/repositories.go`, `pkg/infrastructure/ohlcv_repository.go`, `pkg/infrastructure/multi_ticker_ohlcv_repository.go`, `pkg/domain/momentum_service.go` + 3 test files (4 new tests RED→GREEN).

**Results (before → after, probed post-rebuild):**
- VCB MA5: 88,120 → 61,480 (reflects actual ~62,200 VCB close) ✓
- VCB ROC: null → 0.088 (8.77% annual) ✓
- VCB 52w: null → high=76k / low=56.7k ✓
- 8/8 tickers: all return ROC + 52w data (was 0/8) ✓

**Pre-existing DB contamination (not fixed here):**
FPT/VHM daily_ohlcv stores prices in thousands format for Aug 2025 – Feb 2026 (e.g. close=100.3 instead of 100,300 VND). Requires a separate DB migration script (distinct from CONTAM-6/CONTAM-9 which target different contamination class). FPT ROC = 606x (artifact of thousands-vs-VND mismatch across 252-bar window). Out of scope for this task.

**Zone health:** 12 packages GREEN. go vet clean. go build OK. Service healthy post-rebuild.

---

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

---

### 2026-06-30 — IND-P1-TECHNICAL-ANALYSIS-SUITE — 3 P1 momentum tools

**Task:** IND-P1-TECHNICAL-ANALYSIS-SUITE (sprint MARKET-INDICATOR-DEPTH-P0, commit 4842fd6f)

**Status:** REVIEW — REBUILD_REQUIRED: YES.

**Scope:** 3 new tools in Go pkg/:
- `POST /ta/roc-momentum` — 12-1 Jegadeesh-Titman ROC, cross-sectional z-score/decile, factor-return per decile, feed-forward scalar `momentum_factor_z`.
- `POST /ta/relative-strength` — Mansfield RS vs VNINDEX (daily_ohlcv.code='VNINDEX', 48 rows confirmed), 63/126/252d horizons, cross-sectional percentile, feed-forward scalar `market_rs_composite`.
- `POST /ta/52w-proximity` — 52w high/low, MA50/MA200 inline SMA, AT_HIGH/NEAR_HIGH/MID_RANGE/NEAR_LOW/AT_LOW labels, `net_new_highs` aggregate, `denominator_ma200` field.

**Honest-NULL:** With ~48 bars in live DB, all tickers return null + null_reason ("insufficient_history") — designed PASS state per contract.

**Architecture:** RouterConfig struct (replaces variadic NewRouter). SQLiteMultiTickerOHLCVRepository single IN-clause batch fetch. Domain services pure functions. 25 files, all go test + go vet GREEN.

**Board:** IND-P1-ROC-MOMENTUM, IND-P1-RELATIVE-STRENGTH, IND-P1-52W-HIGH-PROXIMITY → review lane, next_agent=qa.

---

## Archive

[Archived to git history; retained: 3 most recent cycles. Full history in git log.]

### 2026-05-24 — Multiple TA dashboard improvements

Archived entries (dashboard/dash-check.mjs, category relabel, service tier, render gate, bake-verdicts). See git log for full details.
