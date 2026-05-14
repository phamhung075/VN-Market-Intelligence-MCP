# dev-stock-price — Notebook

Zone: `apps/stock-price/` | Stack: Go 1.22 (primary) + TS/Bun (coexist) | DB: stock_price.db (write)

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
