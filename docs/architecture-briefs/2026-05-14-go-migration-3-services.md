# Architecture Brief — Go Migration: 3 Services

**Date:** 2026-05-14
**Author:** architect
**Sprint/Task:** 1912 | c97 user-approved
**Input:** Task 1912-go-migration-program, option 3 post-1910a-stop triage

---

## 1. Crash Evidence

**Pattern:** Bun v1.3.13 post-completion panic (macOS JSC / heap teardown) confirmed across multiple QA cycles. Not a transient — consistent identical crash URL signature.

| Source | Record |
|--------|--------|
| `docs/agent-memory/notebooks/qa.md` lines 458/496 | "Bun C++ crash at end is pre-existing infra issue (same crash URL as all prior cycles)" — cited on 1898a, 1903a gates |
| `docs/agent-memory/archive/qa-archive-2026-05-13.md` line 484 | "Bun v1.3.13 post-completion panic = known macOS heap teardown, not test failure" |
| `docs/agent-memory/notebooks/qa.md` line 1031 | "post-completion macOS heap teardown — pre-existing, not caused by 1878a" |
| `docs/REQ_1903a.md` | "Bun C++ crash at end is pre-existing infra issue" — QA gate note on full suite 9322 pass |
| SQLite corruption record (`project_sqlite_corruption_fix.md`) | 8x corruption root cause = macOS Docker VirtualMachine process tearing SHM on container stop; `bun:sqlite` (native binding) confirmed crash vector |
| `docs/TASKS.md` row 1912 | "1910a dispatch stopped by user mid-flight" due to recurring SIGABRT 134 / SIGSEGV 139 during test teardown |

Docker logs older than container lifetime are not retained. Crash evidence above spans 2026-04-24 → 2026-05-14 (21 days). Pattern is consistent with native-binding teardown: `bun:sqlite` calls into SQLite3 C++ via FFI; macOS VirtualFS VirtioFS tears the SHM handle on container stop, causing the JSC GC to abort.

---

## 2. Per-Service Scoping Table

| Service | Path | Port | Src LOC | Test files | Test LOC | MCP tools exposed | Native bindings |
|---------|------|------|---------|-----------|---------|-------------------|-----------------|
| api-gateway | `apps/api-gateway/` | 4000 | ~1145 | 5 | ~842 | 0 direct (health aggregator only) | **None** — hono + pure fetch |
| stock-price | `apps/stock-price/` | 5000 (ext:5010) | ~467 | 2 | ~204 | 0 direct (called by mcp-server) | `bun:sqlite` (Tier 3 cache fallback — 3 dynamic imports in `fetchers.ts`) |
| alert-engine | `apps/alert-engine/` | 5006 | ~1289 | 3 | ~513 | 0 direct (HTTP POST from mcp-server scheduler) | `bun:sqlite` — **synchronous** Database at process startup (`index.ts:8`, `repositories.ts` — all CRUD ops use `bun:sqlite`) |

All three services use only `hono` + `bun-types` + `typescript` as declared dependencies. No `better-sqlite3`, no `LanceDB`, no `node-llama-cpp`. The crash vector is `bun:sqlite` (Bun's built-in SQLite FFI binding), which is equally crashy at teardown as `better-sqlite3` because both invoke the same SQLite3 C++ destructor path via Bun's JSC FFI layer.

---

## 3. DDD Layer Go Mapping

### 3.1 api-gateway

| TS layer | Go equivalent |
|----------|--------------|
| `domain/models.ts` — ServiceStatus, HealthAggregation | `pkg/domain/models.go` — plain structs, no deps |
| `domain/services.ts` — AggregateHealthService | `pkg/domain/services.go` — pure logic, no I/O |
| `domain/repositories.ts` — HealthCheckerPort interface | `pkg/domain/ports.go` — Go interface |
| `infrastructure/health_checker.ts` — HTTP health poller | `pkg/infrastructure/healthchecker.go` — `net/http` client, goroutines per service |
| `application/usecases.ts` — AggregateHealthUseCase | `pkg/application/aggregate.go` — orchestrates domain via port |
| `interface/handlers.ts` — Hono routes `/health`, `/health/:service`, `/health-dashboard`, `/api/*`, `/:service/*` | `pkg/interface/http/router.go` — `net/http` or `chi` router; adds `/healthz` alias → same handler as `/health` (k8s liveness probe, Go-only addition per 1912a spec review) |

**MCP bridge:** api-gateway exposes no MCP tools. It is consumed by the user's browser and by mcp-server's `clients.ts` via HTTP. Go replaces only the HTTP server. Interface layer stays pure HTTP. No stdio/gRPC needed.

### 3.2 stock-price

| TS layer | Go equivalent |
|----------|--------------|
| `domain/models.ts` — PriceQuote, DailyOHLCV | `pkg/domain/models.go` |
| `domain/services.ts` — ResolvePriceService (tier waterfall) | `pkg/domain/services.go` — tier selector logic |
| `domain/repositories.ts` — PriceFetcherPort, PriceHistoryPort | `pkg/domain/ports.go` — interfaces |
| `infrastructure/fetchers.ts` — Tier1/Tier2 HTTP + Tier3 SQLite | `pkg/infrastructure/fetchers.go` — `net/http` + `database/sql` + `mattn/go-sqlite3` |
| `application/usecases.ts` + `dtos.ts` | `pkg/application/usecases.go` |
| `interface/handlers.ts` — Hono `/price/:code`, `/ohlcv/:code`, `/health` | `pkg/interface/http/router.go` |

**MCP bridge:** stock-price exposes no MCP tools directly. mcp-server calls it via `infrastructure/microservices/clients.ts`. Go service responds with identical JSON shape. No protocol change needed — same HTTP JSON API.

**Tier 3 SQLite:** Go uses `database/sql` + `mattn/go-sqlite3` (CGO, stable, production-grade). Replaces `bun:sqlite` dynamic import in fetchers.ts. CGO teardown is deterministic; no JSC GC involvement.

### 3.3 alert-engine

| TS layer | Go equivalent |
|----------|--------------|
| `domain/models.ts` — StoredAlert, AlertRequest, MuteState | `pkg/domain/models.go` |
| `domain/errors.ts` — AlertError types | `pkg/domain/errors.go` — sentinel errors |
| `domain/services.ts` — AlertEvaluatorService | `pkg/domain/services.go` |
| `domain/repositories.ts` — AlertRepositoryPort, MutePort | `pkg/domain/ports.go` |
| `infrastructure/repositories.ts` — SQLiteAlertRepository + SQLiteMuteRepository | `pkg/infrastructure/sqlite.go` — `database/sql` + WAL mode |
| `infrastructure/telegram.ts` — TelegramClient | `pkg/infrastructure/telegram.go` — `net/http` POST |
| `infrastructure/config.ts` — loadConfig | `pkg/infrastructure/config.go` — `os.Getenv` |
| `application/usecases.ts` — EvaluateAlertUseCase | `pkg/application/evaluate.go` |
| `interface/handlers.ts` — POST `/evaluate`, GET `/health` | `pkg/interface/http/router.go` |

**MCP bridge:** alert-engine receives `POST /evaluate` from mcp-server scheduler jobs (`taAlertScanJob`, `bbAlertScanJob`). No MCP stdio. Go service exposes identical HTTP API. mcp-server callers unchanged.

**Recommendation:** HTTP throughout (no stdio, no gRPC). All three services are already HTTP microservices. Go replaces the Bun HTTP server — the interface contract (JSON over HTTP) is unchanged. gRPC would require proto changes in mcp-server callers; stdio is only for MCP protocol (irrelevant here).

---

## 4. Invariant SDD-1

**Same MCP tool surface, same JSON envelope, same `source_tier: 1|2|3` semantics. No functional regression.**

- None of the 3 target services registers MCP tools directly. All MCP tools remain in `apps/mcp-server/` (TS/Bun, untouched).
- mcp-server calls these services via `infrastructure/microservices/clients.ts`. URL, method, and JSON shape must be byte-for-byte identical.
- `source_tier` is populated in mcp-server, not in the downstream services. SDD-1 is automatically preserved.
- Financial agents (financial_analyst, news_scout, etc.) call mcp-server tools only. They will never observe the downstream language change.

---

## 5. Phased Sequence + Rollback

**Recommended order:** gateway → alert-engine → stock-price

| Phase | Service | Rationale | Rollback |
|-------|---------|-----------|---------|
| **P1** | api-gateway | Zero native deps. Lowest risk. Proves Go Docker build + CI pipeline. Independent of all other services. | `docker-compose.yml` service `api-gateway` reverts to old image tag. Zero data state. |
| **P2** | alert-engine | Highest crash-avoidance ROI (synchronous `bun:sqlite` at startup = highest teardown risk). `alert_engine.db` is fully isolated (no shared writer). Go `database/sql` + `mattn/go-sqlite3` replaces the crash vector cleanly. | Revert `api-gateway` image tag in compose. `alert_engine.db` schema is forward-compatible (CREATE TABLE IF NOT EXISTS). |
| **P3** | stock-price | Most complex (3-tier fallback logic, SQLite cache reads two DBs: `market.db` + `stock_price.db`). Defer until P1+P2 prove the Go Docker workflow. | Revert image tag. `stock_price.db` Tier 3 cache is write-only from this service; safe to stop mid-cycle. |

**Dependency chain:** P1 has no dependencies. P2 depends on P1 proving the Docker Go image pipeline. P3 depends on P2 proving `database/sql` + WAL mode works correctly under the named-volume mount.

**Each phase ships with:**
1. Green test gate (`go test ./...` ≥ target coverage + mcp-server Vitest suite 8804/8804)
2. Docker image rebuilt and pushed
3. Smoke test: `GET /health` returns 200, mcp-server health aggregation shows service healthy
4. 24h monitoring window before next phase starts

---

## 6. Effort Estimate

| Service | Best | Likely | Worst | Notes |
|---------|------|--------|-------|-------|
| api-gateway | 4h | 8h | 12h | Smallest codebase (~1145 LOC). Pure HTTP fan-out. No SQLite. Go test suite from scratch (5 test files → Go testing.T). Docker multi-stage build. |
| alert-engine | 8h | 14h | 20h | SQLite CRUD in Go (mattn/go-sqlite3, WAL mode). 3 test files → Go testing.T. Telegram HTTP client. Config loader. High test surface (dedup + cooldown + mute logic). |
| stock-price | 6h | 12h | 18h | 3-tier fetcher logic. SQLite reads two DBs. 2 test files → Go testing.T. Moderate domain complexity. |
| **Total** | **18h** | **34h** | **50h** | Excludes infra: Go toolchain in Docker base image, CI integration (~2h one-time setup for P1). |

**Test re-authoring note:** Vitest → Go `testing.T`. All test assertions are value-equality or HTTP response checks — direct translation. Table-driven tests in Go replace `describe/it` blocks. No mocking framework needed (Go interfaces + struct injection pattern matches existing DDD ports).

---

## 7. What We Do NOT Migrate

| Service | Reason |
|---------|--------|
| `mcp-server` (TS/Bun) | Domain-rich (132 tools, 10 modules, 62 scheduler files). MCP SDK is TS-native (`@modelcontextprotocol/sdk`). No Go MCP SDK at production maturity. Crash risk is post-completion teardown only — does not block tool execution. |
| `kinh-dich-service` (TS/Bun) | No native deps. Low crash risk. Domain is TS-native (64 hexagram static data, Markov logic). |
| `pdf-extractor` (Python/FastAPI) | Python — pdfplumber + Tesseract. Untouched. |
| `rag-service` (Python/FastAPI) | Python — sentence-transformers + LanceDB. Untouched. |
| `news-fetch` (TS/Bun) | Browser-driver-dependent (Playwright/Chromium via flaresolverr). Go has no equivalent headless browser integration. |
| `macro-indicators` (TS/Bun) | Trading Economics scraper. No native deps. Low crash risk. |
| `technical-analysis` (TS/Bun) | No native deps. Pure TA math. Low crash risk. |
| `report-analyzer` (TS/Bun) | Not deployed yet. |

---

## 8. Risk Register

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|-----------|--------|-----------|
| R1 | `mattn/go-sqlite3` requires CGO — Docker image needs `gcc` / build tools | HIGH (certain) | LOW | Use `golang:1.22-alpine` + `apk add gcc musl-dev` in Dockerfile. Standard pattern. |
| R2 | Go MCP SDK immaturity | N/A | N/A | Not needed — none of the 3 services use MCP stdio. All are HTTP. Risk eliminated. |
| R3 | Polyglot complexity for ops (`docker-compose up --build` now builds Go images) | MEDIUM | LOW | All services remain Docker-first. Build difference is only in Dockerfile. Ops workflow unchanged. |
| R4 | `stock_price.db` WAL mode conflict — stock-price Go service reads `market.db` (WRITE: mcp-server) in readonly mode | MEDIUM | MEDIUM | Enforce `?mode=ro` in DSN. Same invariant as current TS service. Test with concurrent writes from mcp-server. |
| R5 | alert-engine Go service diverges from TS dedup/cooldown semantics during migration | MEDIUM | HIGH | Author Go unit tests from TS test suite BEFORE writing implementation. Tests must pass with identical input fixtures. |

---

## 9. Open Questions for PO/User

1. **Go version pin:** Which Go version? Recommended 1.22 (stdlib `net/http` improvements, `slices` package). Needs user/PO confirmation for base image consistency.
2. **CGO policy:** `mattn/go-sqlite3` requires CGO. If user prefers pure-Go SQLite (e.g., `modernc.org/sqlite`), performance tradeoff acceptable? Pure-Go avoids gcc dependency in Docker but is ~2x slower on heavy query loads.
3. **Log format alignment:** Current TS services use `console.log` (unstructured). Should Go services use structured JSON logging (`log/slog`) to align with future observability plans? Or plain text to match current ops expectations?

---

## Phase 1 Close-out

**Status:** DONE

**Cutover date:** 2026-05-14 (user directive c105 — override 24h smoke gate)
**Cutover SHA:** see `docs/signals/*-1912d-complete.json`
**Audit brief:** `docs/architecture-briefs/2026-05-14-1912d-cutover-audit.md`

**Final state:** Go gateway (`github.com/vn-market-intelligence/api-gateway`) is now `apps/api-gateway/`. TS gateway retired. Port 4000 served by Go. All 9 services healthy at cutover (smoke: 9.5ms avg latency).

**Phase 2 (1912b-alert-engine):** UNLOCKED
**Phase 3 (1912c-stock-price):** UNLOCKED
