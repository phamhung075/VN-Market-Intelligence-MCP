# dev-stock-price — Notebook

Zone: `apps/stock-price/` | Stack: Go 1.22 (CGO — mattn/go-sqlite3) | DB: stock_price.db (write WAL) + market.db (read-only WAL)

## Session 2026-05-24 — P1-B1 price-quote-normalizer + R-CGO Gate DONE

### What shipped (P1-B1)

First primitive extracted: `pkg/primitive/price-quote-normalizer/`.

**All 9 ACs PASS:**
- AC-1: `NormalizeQuote()` exported with exact signature (stdlib+domain only)
- AC-2: 5-row table-driven test (VCB/HOSE, HNX-negative, cache-zero, zero-volume, empty-code)
- AC-3: `go test ./pkg/primitive/price-quote-normalizer/...` exit 0 PASS
- AC-4: sandbox -tier=primitive exit 0 (3/3 scenarios GREEN) PASS
- AC-5 (R-CGO-1): `CGO_ENABLED=0 go build ./cmd/sandbox` exit 0 PASS
- AC-6 (R-CGO-2): grep mattn/cgo/importC in primitive: exit 1 (zero matches) PASS
- AC-7 (R-CGO-3): grep pkg/infrastructure in primitive: exit 1 (zero matches) PASS
- AC-8 (R-CGO-GATE): **CLEAR** — all R-CGO checks passed
- AC-9 (Fence-A): grep application|interface/http|infrastructure in primitive: exit 1 PASS

**Sandbox output (G12 streak #1):**
```
price-quote-normalizer-golden.json: PASS
price-quote-normalizer-edge.json: PASS
price-quote-normalizer-failure.json: PASS
total=3 pass=3 fail=0 status=OK exit 0
```

**go test ./pkg/... -count=1:** 5/5 packages PASS, 0 regressions

**Commits:**
- `69afa2ab` — `feat(stock-price/P1-B1): extract price-quote-normalizer primitive + R-CGO gate CLEAR`
- `9c9252f3` — `docs(stock-price/P1-B1): RETURN block + completion signal — R-CGO CLEAR, G12 #1 GREEN`

**Signal:** `docs/signals/dev-stock-price-p1-b1-done-20260524T005300Z.json`
**Pre-revert tag:** `stock-price-pre-p1b1`

**State for P1-B2:**
- R-CGO gate CLEAR — P1-B2 unblocked
- sandbox dispatcher ready: add `case "tier_fallback_selector"` to executePrimitive
- P1-B2 adds `pkg/primitive/tier-fallback-selector/` and 3 scenario JSONs
- All pkg/ tests passing baseline: 5/5

## Session 2026-05-24 — P1-A Sandbox Runner DONE

### What shipped (P1-A)

Sandbox harness CLI (`cmd/sandbox/main.go`) — full flag/discovery/dispatch framework for Phase 1.

**All 5 ACs PASS:**
- AC-1: Flag parser: -tier (primitive|module|all), -module (stock-price), -scenario (all|filepath)
- AC-2: Scenario JSON loading from docs/scenarios/stock-price/{primitives,module}/; zero HTTP, zero DB
- AC-3: Exit 0 on all-pass/no-scenarios, exit non-zero on any failure; per-scenario PASS/FAIL slog output
- AC-4: grep credential count = 0 PASS
- AC-5 (R-CGO pre-check): `CGO_ENABLED=0 go build -o ./bin/sp-sandbox ./cmd/sandbox/` exit 0 PASS

**Sandbox dry-run (all modes):** total=0 pass=0 fail=0 status=OK exit 0 (no scenarios yet — P1-B1+ populates)

**Fence checks:**
- Fence-A (no infra imports in sandbox): PASS — exit 1 (zero matches)
- Fence-C (no CGO in sandbox): PASS — stdlib-only imports, CGO_ENABLED=0 build authoritative

**go test ./pkg/... -count=1:** 4/4 packages PASS, 0 regressions

**Commit:** `afe3468b` — `feat(stock-price/P1-A): sandbox runner — CGO_ENABLED=0, flag parser, scenario discovery`

**Signal:** `docs/signals/dev-stock-price-p1-a-done-20260524T004600Z.json`

**Scenario dirs created:**
- `docs/scenarios/stock-price/primitives/` (empty — P1-B1 will populate with 3 JSONs per primitive)
- `docs/scenarios/stock-price/module/` (empty — P1-C will populate)

**State for P1-B1:**
- Sandbox framework complete: executePrimitive/executeModule dispatchers ready for case blocks
- P1-B1 adds `case "price_quote_normalizer"` to executePrimitive dispatcher
- P1-B1 adds scenario JSON files to docs/scenarios/stock-price/primitives/
- R-CGO pre-check PASS unblocks P1-B1 dispatch

## Session 2026-05-23 — P0-SP-5 R-CGO Confirmation CLEAR

### What shipped (P0-SP-5 binding gate)

R-CGO confirmation complete. Verdict: **CLEAR**. Phase 1 can proceed.

**Evidence collected:**
- AC-2: `CGO_ENABLED=0 go build -o ./cmd/sandbox/sandbox ./cmd/sandbox` — exit 0 PASS
- AC-3: `grep -rn '"github.com/mattn/go-sqlite3"' pkg/domain/ pkg/application/ pkg/interface/` — 0 matches PASS
- AC-4: `cmd/sandbox/main.go` did not exist — created minimal stub (flag+fmt, zero CGO). `grep -rn '"github.com/mattn/go-sqlite3"' cmd/sandbox/` — 0 matches PASS
- AC-6: `CGO_ENABLED=0 go run ./cmd/sandbox -help` — exit 0, correct output PASS
- Full test suite: `go test ./pkg/... -count=1` — 4/4 packages PASS, 0 regressions

**CGO boundary confirmed:**
- mattn/go-sqlite3 imported ONLY at `pkg/infrastructure/fetchers.go:15` and `fetchers_test.go:13` (Fence-C correct)
- Zero mattn imports in domain, application, interface, or sandbox layers
- Fence-A/B (primitive/module) N/A yet — they don't exist. Will be verified in P1-A1.

**Commit:** `e9da9a7c` — `feat(stock-price/P0-SP-5): R-CGO confirmation CLEAR — sandbox stub + gate signal`

**Signal:** `docs/signals/dev-stock-price-p0-sp5-r-cgo-confirmation-20260523T222111Z.json`

**State for Phase 1:**
- Phase 1 gate template ACs ready for P1-A1 (first primitive task)
- `cmd/sandbox/main.go` stub created — Phase 1 will expand with `-tier=primitive -module=stock-price -scenario=all` flag support
- No pkg/primitive/ or pkg/module/ exists yet (correct — Phase 0 boundary)
- All 4 pkg/ test packages passing

## Session 2026-05-22 — 1971-STOCKPRICE-SCAN-ORDER-MISMATCH SHIPPED

### What shipped (SEV-1 hotfix)

Fixed SQLitePriceHistoryRepository.GetHistory — SQL column transposition bug that made `close` return DB.low (=0 on light-volume days), causing -100% delta on frontend dashboard for FPT and all other tickers.

**Root cause:** `rows.Scan(&c.Date, &c.Low, &c.High, &c.Close, &c.Open, &c.Volume)` — Low/Close/Open were transposed vs SELECT order `(date, open, high, low, close, volume)`.

**Fix:** Reordered Scan to `(&c.Date, &c.Open, &c.High, &c.Low, &c.Close, &c.Volume)` — 1 line change at fetchers.go:239.

**Regression test added:** `TestSQLiteRepo_GetHistory_OHLCFieldParity` — seeds 1 row with asymmetric OHLC (open=10, high=40, low=5, close=20, vol=1000), asserts all 6 fields individually. Masks zero-value bug for future.

**Commit:** `bc515ab2` — `fix(1971): correct SQLite Scan order in GetHistory — close=0 bug`

**Test results:** 8 infra tests PASS (was 7 + 1 new), all packages PASS. Zero regressions.

**Deploy verified:**
- Container rebuilt: `docker compose build stock-price` — success
- Container healthy: port 5010:5000 — healthy
- AC-1: `curl http://localhost:4000/stock/price/history?code=FPT&days=7` — close=77000 (2026-05-22), close=76500 (2026-05-21), all matching DB truth
- AC-2: open/high/low correctly mapped; residual low=0 on 4/6 dates = 1972 (VNDirect parser, out of scope)

**Done signal:** `docs/signals/dev-stock-price-1971-done.json`

### Blast radius notes (for PO/QA)
- `verdictResolutionJob.ts:123` was scoring P/L against transposed close for ~9d since 1912c (2026-05-13). Now fixed — post-1945-verdict-resolution-scored-pct should recover from 36%.
- 1070 rows in daily_ohlcv with low=0 (VNDirect null coercion on light-volume days) remain — tracked as 1972-VNDIRECT-OHLCV-NULL-COERCION, dev-mcp-server, queued next cycle.

## Session 2026-05-14 — 1912c-cutover COMPLETE

### What shipped (cutover sprint c108)

Full production cutover of stock-price service from Bun/TS to Go 1.22 (CGO).

**Commits:**
- `b87382b7` — docker-compose.yml: stock-price dockerfile: Dockerfile.go (item a)
- `54ff83ed` — BLK-3 close: Dockerfile.go→Dockerfile, 10 TS src files deleted (items b+c)
- `dc56d508` — agent-md-factory refresh: dev-stock-price.md TS→Go (item d)
- `18e7339e` — doc-sweep 8 files TS→Go + README-log-schema.md authored (items e+f)

**Signal:** `docs/signals/20260514T181854Z-1912c-cutover-complete.json` (deploy_ready=true)

**Verification:**
- `go test ./pkg/... -count=1` → 31/31 PASS
- `go test ./... -count=1` → CLEAN (BLK-3 closed — Dockerfile.go parse error gone)
- tree-map.md orphan check → 0 stale TS refs
- graphify → skipped (PEP-668 system restriction, graph.json exists from prior run)

**State:** TS fully retired. Go is sole runtime. ops to `docker-compose up --build stock-price`.

## Session 2026-05-14 — 1912c Phase 3 Go Migration SHIPPED

### What shipped

All 4 DDD layers implemented + tested. 31/31 go test PASS.

**Files created this session:**
- `apps/stock-price/pkg/infrastructure/fetchers_test.go` — 7 tests: Tier3 cache hit/miss/DBMissing, repo GetHistory, SaveQuote, AC-8 concurrent R/W 100-iter
- `apps/stock-price/pkg/interface/http/router.go` — Handler with GET /health, POST /price/fetch, GET /price/history (query+path param)
- `apps/stock-price/pkg/interface/http/router_test.go` — 11 tests: health, fetch success/validation/404, history query/path params
- `apps/stock-price/cmd/server/main.go` — DDD wiring entry point
- `apps/stock-price/Dockerfile.go` — Multi-stage CGO build (golang:1.22-alpine + apk gcc musl-dev + alpine:3.19 runtime)

**go mod tidy ran:** go.sum now has mattn/go-sqlite3 v1.14.22 entries.

### Verification decisions (VERIFY-CALL-SITE)

**R-SPEC-1 VERIFIED — PASS AS-IS:**
`PriceSnapshot.timestamp` in clients.ts declared but never read by callers. `verdictResolutionJob.ts` only reads `snap.price`. Go returns `fetchedAt` — AC-3 passes.

**R-SPEC-2 VERIFIED — QUERY PARAMS:**
`clients.ts` line 175 calls `GET /price/history?code=X&days=N`. Router implements both:
- Primary: `GET /price/history?code=X&days=N` (for clients.ts call site)
- Compat: `GET /price/history/:code?days=N` (for TS handlers.ts surface)

### Test counts by layer
- domain: 7 tests PASS
- application: 6 tests PASS
- infrastructure: 7 tests PASS (includes AC-8 concurrent WAL test)
- interface/http: 11 tests PASS
- Total: 31/31

### AC coverage self-check
- AC-1: Dockerfile.go multi-stage CGO ✓
- AC-2: /health 200 + JSON {status,service,port} ✓
- AC-3: JSON envelope fetchedAt (timestamp unused by callers — R-SPEC-1 verified) ✓
- AC-4: /price/fetch POST ✓
- AC-5: /price/history GET (query + path param) ✓
- AC-6: fire-and-forget SaveQuote on success ✓
- AC-7: Tier3 readonly DSN `?mode=ro&_journal_mode=WAL&_busy_timeout=5000` ✓
- AC-8: 100-iter concurrent R/W zero errors ✓
- AC-9..AC-11: domain + application + infra test suites ✓
- AC-12: validation (missing code → 400, invalid days → 400) ✓
- AC-13: uppercase code in handlers ✓
- AC-14: both path and query param routes ✓

### State for next session
- TS src still alive in `src/` (coexist fine — cutover is next sprint 1912c-cutover)
- 1912c-stock-price moved to Review in TASKS.md
- QA notified (caveman ping)
- Dockerfile.go named `.go` to coexist with TS Dockerfile; docker-compose swap is cutover sprint
- No blockers

### Known risks
- Dockerfile.go not yet wired into docker-compose.yml (intentional — cutover sprint)
- market.db path at runtime depends on docker-compose volume mount; default `./data/market.db` works for local dev
