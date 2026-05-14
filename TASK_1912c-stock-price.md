# TASK_1912c-stock-price — Go Migration Handoff

**Sprint:** 1912c-stock-price (Phase 3 parallel dispatch with 1912b)  
**Branch:** `task/1912c-stock-price`  
**Spec:** `docs/REQ_1912c.md` (14 ACs, 259L)  
**Brief pointers:** `docs/architecture-briefs/2026-05-14-go-migration-3-services.md` §3.2, §4, §5-P3, §6, §8-R4  
**Zone:** `apps/stock-price/` (full Go rewrite, DDD strict)

---

## Summary

Rewrite `apps/stock-price/` from TS/Bun to Go 1.22, eliminating the `bun:sqlite` dynamic-import crash vector (macOS VirtioFS / JSC teardown). Same HTTP API, same JSON envelope, same 3-tier waterfall semantics. **No functional change visible to callers.**

---

## Acceptance Criteria Overview

14 ACs in `docs/REQ_1912c.md`:
- AC-1..AC-5: Dockerfile build + HTTP /health + JSON parity (/price/fetch, /price/history)
- AC-6..AC-8: Tier3 waterfall (cache hit/miss) + readonly DSN enforced + concurrent R/W safety on market.db (R4 high-priority)
- AC-9..AC-14: Go test suite (2 files / 204 LOC ported from TS Vitest) + mcp-server Vitest unchanged + API aggregation health + code uppercasing + path/query param validation

---

## Critical Deviations to Verify BEFORE Implementation

### [VERIFY-CALL-SITE] R-SPEC-1: PriceSnapshot.timestamp Field Name

**Issue:** TS `mcp-server/clients.ts` interface `PriceSnapshot` declares `timestamp: string`, but this service returns `fetchedAt: string` (matching TS `FetchPriceResponse` DTO).

**Action:** 
1. Open `apps/mcp-server/src/infrastructure/microservices/clients.ts`
2. Search for `PriceSnapshot` interface definition
3. Confirm: is the `timestamp` field actually read by callers, or is it mapped/ignored?
4. If ignored → AC-3 passes as-is (Go returns `fetchedAt`)
5. If read → Go must return `timestamp` key instead of `fetchedAt` OR mcp-server mapping layer must adapt

**Result:** Document finding in commit message as "R-SPEC-1 VERIFIED" comment.

### [VERIFY-CALL-SITE] R-SPEC-2: /price/history Route Shape Divergence

**Issue:** TS `handlers.ts` declares `GET /price/history/:code` (path param), but `clients.ts` calls `GET /price/history?code=X&days=N` (query param). Different routes.

**Action:**
1. Open `apps/mcp-server/src/infrastructure/microservices/clients.ts`
2. Search for all calls to `BASE_URLS.stockPrice + '/price/history'`
3. Confirm which URL shape is actually invoked: `:code` path param OR `?code=` query param?
4. Go router must implement the **actual call site**, not the handlers.ts signature

**Result:** Document finding in commit message as "R-SPEC-2 VERIFIED" comment. Both should be supported, OR verify which one is live.

---

## Phase 1 Precedent: api-gateway DDD Layout

Reference: `apps/api-gateway/` (Go, Phase 1 SHIPPED c99-c106)

**Package structure:**
```
apps/api-gateway/
├── cmd/server/main.go           (entry + HTTP server setup)
├── Dockerfile                    (CGO-ready multi-stage, see below)
├── go.mod, go.sum
├── pkg/
│   ├── domain/
│   │   ├── models.go            (plain structs, no I/O deps)
│   │   ├── ports.go             (interfaces only)
│   │   └── services.go          (pure logic, no I/O)
│   ├── infrastructure/
│   │   └── (fetchers, repos, clients)
│   ├── application/
│   │   └── usecases.go
│   └── interface/http/
│       └── router.go            (net/http or chi router)
└── ...
```

**Dockerfile pattern for CGO:**
```dockerfile
FROM golang:1.22-alpine AS builder
RUN apk add --no-cache gcc musl-dev
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=1 go build -o stock-price ./cmd/server/
```

Note: Stock-price differs from api-gateway (no CGO needed) — stock-price NEEDS CGO for mattn/go-sqlite3 (Tier3 SQLite reads). See `docs/REQ_1912c.md` §4 NF-1.

---

## R4 Invariant: Concurrent Write Safety on market.db

**High-priority risk per brief §8 R4:**

- `market.db` is **written by mcp-server** (scheduler cron jobs)
- stock-price Go service **reads it readonly** via Tier3 fetcher
- SQLite WAL mode permits concurrent readers + one writer
- **Risk:** SQLITE_BUSY if WAL checkpoint contends with reads
- **Mitigation:** Enforce `?mode=ro` DSN + `_busy_timeout=5000`

**Test (AC-8):** 100-iteration integration test:
```go
// Goroutine 1: writer
writer_conn.Exec("INSERT INTO market_prices ...")

// Goroutine 2 (concurrent): reader with ?mode=ro
reader_conn.QueryRow("SELECT * FROM market_prices WHERE code=?", "VCB")

// Expect: zero SQLITE_BUSY errors
```

**DSN spec:** `file:/path/to/market.db?mode=ro&_journal_mode=WAL&_busy_timeout=5000`

---

## TDD Invariants (Tier Waterfall)

### Test-First: Vitest Fixtures → Go Tests

1. Read `apps/stock-price/src/__tests__/resolve-price-service.test.ts` (7 unit cases)
2. Read `apps/stock-price/src/__tests__/fetch-price-usecase.test.ts` (6 integration cases)
3. Extract fixture values verbatim (VCB price:88000, change:-1000, changePercent:-1.12, etc.)
4. Author Go tests (table-driven) BEFORE writing implementation
5. Implement domain logic to pass tests
6. Verify: diff-by-inspection shows identical fixture values (allows confidence in byte-identical behavior)

### Tier3 Cache Hit/Miss Paths

**Cache hit (fixture: market_prices table has VCB at 88000):**
```
Tier1 nil → Tier2 nil → Tier3 hits cached row → return with source:"cache"
```

**Cache miss (fixture: market_prices table empty for VCB):**
```
Tier1 nil → Tier2 nil → Tier3 returns nil → 404 (assuming T1+T2 also nil)
```

**saveQuote behavior:** After any successful fetch (T1 or T2), fire-and-forget `saveQuote` writes to `stock_price.db` table `market_prices_cache`. Write failure does NOT fail the request.

---

## Commit Rule

**Index-only commits** (per `docs/policies/commit-convention.md`):
```bash
git add file1.go file2.go ...  # Explicit file list
git commit -m "..."            # Never -am or -a
```

**Do NOT use:** `-a`, `-am`, or `--all` flags.

---

## Zone Doc Maintenance

**Create/Update:** `docs/architecture/microservice/stock-price/` folder

- `README.md` (or SSOT .md per zone convention)
- Package structure diagram
- Test-suite overview
- Any Go-specific deviations from TS (e.g., goroutines, WaitGroup patterns, etc.)

Check `docs/architecture/microservice/api-gateway/` for template.

---

## Handoff Destination (impl_done)

When implementation is complete + tests pass + Docker image builds:

1. Update `docs/TASKS.md` row 1912c-stock-price: In Progress → Review
2. Send caveman-style ping to QA: "1912c-stock-price impl ready for smoke gate (14/14 AC review)"
3. QA runs: `go test ./...` + mcp-server Vitest + `/health` aggregation check
4. QA moves task to Done or escalates blockers

**Follow dev-api-gateway pattern** (`docs/TASKS.md` row 1912a → 1912d flow, merged to single service entry).

---

## Key References

- **Spec (SSOT):** `docs/REQ_1912c.md` (14 ACs, full acceptance criteria)
- **Brief (architecture):** `docs/architecture-briefs/2026-05-14-go-migration-3-services.md`
  - §3.2: DDD layer Go map (models/services/ports/fetchers/usecases/handlers)
  - §5-P3: Rollback rationale (stock_price.db Tier3 cache write-only, safe stop mid-cycle)
  - §6: Effort estimate (6h best / 12h likely / 18h worst)
  - §8-R4: Concurrent write safety risk + mitigation
- **Phase 1 precedent:** `apps/api-gateway/` DDD layout + Dockerfile pattern + test suite
- **Concurrent R/W test fixture:** SQLite WAL + readonly DSN + 100-iteration load

---

## WIP Status

After peer PM moves 1912b to In Progress: total WIP = 2/2 (at limit, user-authorized per directive c107). This dispatch makes Phase 2 + Phase 3 both runnable in parallel (separate codebases, separate Go modules).

**Cutover sequencing (post-implementation):** Proof 1912b in prod before 1912c cutover per brief §5 dependency chain. Development can proceed in parallel.
