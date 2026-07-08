# dev-technical-analysis — Notebook

Zone: `apps/technical-analysis/` | Stack: **Go** (pilot active, 2026-05-22) | DB: market.db (read-only)

## Working Memory

[3 most recent cycles retained below. Archive in git history.]

### 2026-07-08 — FACTORY-TECHANALYSIS-go-livepath-tests — Go tests for the live request path

**Task:** FACTORY-TECHANALYSIS-go-livepath-tests (epic FACTORY-MAINTAINABILITY-2026-06). Backstops deletion of the dead `src/` TS shadow service (FACTORY-TECHANALYSIS-delete-orphaned-ts-service, blocked on this task).

**Added (purely additive — no production code changed):**
- `pkg/application/usecases_test.go` — table tests for `ComputeTAUseCase.Execute`: pure-compute path (closes given, DB never consulted), DB-backed path (fake `PriceRepo`, asserts `GetCandles(symbol,60)` args + closes-in-order forwarding), `period<=0` defaults to 14 (zero + negative), empty-closes+empty-symbol → `"closes or symbol required"` (no I/O), `PriceRepo`/calculator error propagation.
- `pkg/interface/http/router_test.go` — `httptest.NewServer(NewRouter(...))` per the established pattern in `cmd/sandbox/main.go` and `apps/stock-price`: `GET /health`, `POST /ta/indicators` happy path, invalid-JSON 400, missing closes+symbol 400, useCase-error 500 (calculator- and repo-triggered).

**Coverage before:** `pkg/application` + `pkg/interface/http` had 0 `*_test.go` files. Now covered.

**Gates:** `go test ./...` 12 packages GREEN. `go vet` clean. `golangci-lint run` 0 issues. Sandbox 35/35 scenarios GREEN (`dashboard/build.sh`). No bugs found in the deployed path while writing tests.

---

### 2026-06-30 — TASK-VNINDEX-RS-C (FR-C1) — watchlist DB fallback at startup

**Task:** TASK-VNINDEX-RS-C / FIX-TA-VNINDEX-BENCHMARK-ABSENT-RS § Zone C. Commits: 5c1ab331, 341d2879.

**Root cause:** `WATCHLIST_TICKERS` env absent from docker-compose.yml technical-analysis block; `cmd/server/main.go:46` defaulted to `""` → `parseWatchlist` → empty slice → all use cases wired with `watchlist=[]` → no-arg `/ta/roc-momentum` returned empty.

**Fix (FR-C1):**
- `cmd/server/main.go`: added `readWatchlistFromDB(dbPath)` helper (`database/sql` + `_ "modernc.org/sqlite"` explicit import). After `parseWatchlist` returns empty, reads `SELECT code FROM watchlist ORDER BY code` from the SQLite DB at `DB_PATH`. No hardcoded tickers.
- `cmd/server/main_test.go` (new): 3 unit tests — WithRows (3-ticker seed, order verified), EmptyTable (no rows → no error), NoWatchlistTable (missing table → error, no panic).

**RAW probes:**
- Live `watchlist` table: 41 rows (ACB…VRE, no VNINDEX — correct).
- Startup log post-rebuild: `"WATCHLIST_TICKERS not set — resolved from DB watchlist table" count=41`
- `POST /ta/roc-momentum {}` → 41 tickers, 35 non-null ROC (was 0 before).

**Gates:** `go build ./...` OK · `go vet ./...` OK · `go test ./...` all 10 packages GREEN · golangci-lint 0 issues · sandbox primitive+module scenarios GREEN.

**No docker-compose.yml change** — no hardcode. Watchlist SSOT = SQLite `watchlist` table.

---

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

## Archive

[Archived to git history; retained: 3 most recent cycles. Full history in git log.]

### 2026-07-08 — pruned to AC-2b (3-cycle cap)

Moved out of Working Memory (full detail in git log, `git log -- docs/agent-memory/notebooks/dev-technical-analysis.md`):
- 2026-06-15 FIX-TA-GOSVC-MA5-PRECISION (commit d32f0a17) — MA5 N/A regression + RSI drift fix (MA5/MA20/MA50 propagated end-to-end).
- 2026-06-15 FIX-TA-GOSVC-NA-DESPITE-DEPTH (commit 33e7a094) — Go DB-backed `GetCandles` implemented (was a stub).
- 2026-06-29 P0-1-VOLATILITY-INDICATORS (commit 1cd4a7722) — `POST /ta/volatility-indicators`: RV/GK/ATR%/regime/drawdown, REVIEW status.
- 2026-06-30 IND-P1-TECHNICAL-ANALYSIS-SUITE (commit a61496548 / 4842fd6f) — ROC momentum + relative-strength + 52w-proximity tools, REVIEW status.

### 2026-05-24 — Multiple TA dashboard improvements

Archived entries (dashboard/dash-check.mjs, category relabel, service tier, render gate, bake-verdicts). See git log for full details.
