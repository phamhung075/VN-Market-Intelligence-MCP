---
sprint: 1912
phase: "1 of 3"
branch: task/1912a-gateway-go-migration
size: M
zone: apps/api-gateway/
depends_on: []
blocks:
  - 1912b-alert-engine
  - 1912c-stock-price
assigned_to: dev-api-gateway
lazy_load_trigger: go_migration
---

# TASK_1912a — API Gateway Go Migration (Phase 1)

**Status:** Ready for dev  
**Acceptance Criteria:** 11 (see REQ_1912a.md § 3)  
**Spec:** `docs/REQ_1912a.md` (commit `6bf503d1`, 166L)  
**Architect Review:** `docs/architecture-briefs/2026-05-14-1912a-spec-review.md` (APPROVE, commit `813053b6`)  
**Brief:** `docs/architecture-briefs/2026-05-14-go-migration-3-services.md` (commit `b5c6a998`)

---

## TLDR

Rewrite `apps/api-gateway/` (Bun/Hono, port 4000) in Go 1.22 as `apps/api-gateway-go/` with full functional parity (health endpoints, proxy routing, dashboard, structured JSON logging). 11 ACs covering DDD layers, tests, JSON parity, rollback, and 24h smoke window. Go competency lazy-load installed in `dev-api-gateway` (trigger: `go_migration`).

---

## PM Planning Context

**Zone:** `apps/api-gateway/` (read) + `apps/api-gateway-go/` (create sibling during Phase 1; Phase 2/3 will migrate other services)

**Endpoints (5 total, all 5 ACs assigned):**
- `GET /health` + `GET /health/:service` — AC-2 (JSON parity)
- `GET /healthz` — AC-11 (k8s liveness alias, Go-only addition; TS gateway no backport)
- `GET /health-dashboard` — AC-4 (HTML self-contained, no CDN)
- `ANY /api/*` + `ANY /:service/*` — AC-3 (proxy routing, error envelopes)

**Registered services (9 probeable + 1 virtual):**
- Probeable: mcp, pdf, rag, ta, macro, stock, kinh-dich, alert, news (L67-72 in REQ_1912a.md)
- Virtual (noProbe=true): api → full path forwarded, excluded from health checks

**Files to read first:**
- `docs/REQ_1912a.md` (spec, 166L, all endpoint inventory + response shapes)
- `docs/architecture-briefs/2026-05-14-1912a-spec-review.md` (architect review, blockers resolved)
- `docs/references/dev-api-gateway-go-competency.md` (Go 1.22 patterns, DDD layout, testing style)
- `docs/architecture-briefs/2026-05-14-go-migration-3-services.md` (3-phase sequence, risk register)
- `apps/api-gateway/src/interface/handlers.ts` (TS endpoint shapes to replicate)
- `apps/api-gateway/src/application/aggregateHealthService.test.ts` + 4 other Vitest files (842 LOC total — coverage target)

**Files to create:**
- `apps/api-gateway-go/` — sibling module (leave `apps/api-gateway/` TS version in place during Phase 1)
  - `pkg/domain/` — models.go (AggregatedHealth, ServiceHealthResult, Service), ports.go (HealthChecker interface), services.go (health logic)
  - `pkg/application/` — aggregate.go (AggregateHealthUseCase, orchestrates domain)
  - `pkg/infrastructure/` — healthchecker.go (net/http client, concurrent probes), registry.go (StaticServiceRegistry)
  - `pkg/interface/http/` — router.go (net/http or chi, all 5 endpoints), handlers.go (per-endpoint logic)
  - `cmd/server/` — main.go (wiring, port from env)
  - `Dockerfile` — multi-stage, golang:1.22-alpine → alpine:3.19
  - `go.mod`, `go.sum`
  - `*_test.go` files — equivalent coverage to 5 Vitest files
  - `README-log-schema.md` (AC-7: log/slog JSON schema + sampled line)

**Files to modify:**
- `docker-compose.yml` — add service: `api-gateway-go` (new image, port 4000), then swap existing `api-gateway` service image tag in a later commit (after smoke test)
- (Post-smoke: mcp-server may need config update if it references api-gateway by hostname, but current `http://api-gateway:4000` should resolve in compose network to new image)

**Dependencies:**
- Upstream: spec + architect review APPROVE (both landed, gates cleared)
- Downstream: 1912b-alert-engine + 1912c-stock-price BLOCKED until AC-10 (24h smoke window passes)
- Parallel-eligible: None (Phase 1 is sequential first step)

**Knowledge needed:**
- Go 1.22 (`net/http`, `log/slog`, `context`, `sync`)
- DDD package structure per brief § 3.1
- Table-driven test patterns in Go (replace `describe/it` blocks)
- `chi` router (optional, but recommended for path params like `/:service`)
- Dockerfile multi-stage best practices (RUN go mod download before COPY .)
- Docker-compose networking (service names as hostnames)

---

## Implementation Checklist

**High-level — developer responsible for detailed design:**

- [ ] Create `apps/api-gateway-go/` folder structure with 4 package layers
- [ ] `pkg/domain/models.go` — define AggregatedHealth, ServiceHealthResult, Service value objects
- [ ] `pkg/domain/ports.go` — HealthChecker interface (Probe(ctx, service) → ServiceHealthResult)
- [ ] `pkg/domain/services.go` — AggregateHealthService (pure domain logic, no I/O)
- [ ] `pkg/infrastructure/healthchecker.go` — http.Client with concurrent goroutines per service; 2s timeout per probe
- [ ] `pkg/infrastructure/registry.go` — StaticServiceRegistry (9 services + 1 virtual alias loaded from env)
- [ ] `pkg/application/aggregate.go` — AggregateHealthUseCase (orchestrates domain + infra, timeout = 5 * svc.timeoutMs)
- [ ] `pkg/interface/http/router.go` — net/http or chi mux; routes: /health, /healthz (alias), /health/:service, /health-dashboard, /api/*, /:service/*
- [ ] `pkg/interface/http/handlers.go` — GET /health, GET /health/:service, GET /health-dashboard, ANY /api/*, ANY /:service/*
- [ ] `cmd/server/main.go` — HTTP server wiring, PORT env (default 4000), service URLs from env (MCP_URL, PDF_URL, …)
- [ ] `go.mod`, `go.sum` — Go 1.22, no external router framework (if using chi, add as dependency)
- [ ] `*_test.go` files covering all 5 Vitest scenarios (aggregate health, registry, use-case, dashboard, proxy)
- [ ] `Dockerfile` — multi-stage golang:1.22-alpine builder + alpine:3.19 runtime (no CGO)
- [ ] `README-log-schema.md` — AC-7: document log/slog JSON schema with example line
- [ ] json.Marshal all responses byte-for-byte matching TS shapes (AC-2)
- [ ] Proxy error envelopes: `{"error":"Unknown service: <name>"}` (AC-3)
- [ ] Dashboard HTML: self-contained (no CDN), meta refresh 60s, 9 service names, status-up/-down CSS classes (AC-4)

**Testing validation (pre-merge):**
- [ ] `go test ./...` passes (all table-driven tests GREEN)
- [ ] Run existing mcp-server Vitest suite 8804/8804 against Go gateway running in docker-compose (AC-6)
- [ ] Rollback test: docker-compose down api-gateway-go, revert docker-compose.yml service image tag, `docker-compose up -d api-gateway`, `/health` 200 (AC-8)

---

## Risk Flags (from REQ_1912a.md § 6)

| ID | Risk | Mitigation |
|----|------|-----------|
| R-G1 | HTML template output diverges (CSS, whitespace) | Semantic Go tests (contains checks), not byte-exact HTML |
| R-G2 | context.WithTimeout semantics differ from JS AbortSignal.timeout | Use identical timeout values (2000ms probe, 10000ms proxy) |
| R-G3 | Docker layer cache for go.mod download | Standard pattern: `COPY go.mod go.sum` + `RUN go mod download` before `COPY .` |
| R-G4 | mcp-server 8804 Vitest breaks if endpoint missing | AC-6 is the gate — must pass before Phase 1 shipped |
| R-G5 | `/healthz` ambiguity (resolved) | Go adds `/healthz` alias to `/health` (k8s liveness); TS no backport |

---

## Sequencing & Blockers

**Phase 1 → Phase 2/3 Gate (AC-10):**
After Go gateway deployed to production Docker fleet, observe 24h monitoring window:
- `GET /health` returns HTTP 200
- All 9 services enumerated in response (no drop-offs)
- If 503 sustained >5min during window → abort P2 dispatch, revert to TS image

Fail-early trigger (development note): any 503 from `/health` sustained >5min during smoke window → do NOT proceed to Phase 2.

**Branch creation:**
Developer creates `task/1912a-gateway-go-migration` from main (PM commits sprintify index-only, developer creates branch).

**Deploy sequence:**
1. Merge to main → Docker image build (Go)
2. docker-compose.yml add new service with new image tag
3. Run mcp-server Vitest suite (AC-6 gate)
4. Observe 24h smoke window
5. After 24h clean, Phase 2 (`1912b-alert-engine`) unblocked

---

## AC Reference (from REQ_1912a.md § 3)

| AC | Summary |
|----|---------|
| AC-1 | `golang:1.22-alpine` multi-stage Dockerfile, no CGO required |
| AC-2 | `GET /health` + `GET /health/:service` byte-for-byte JSON parity + HTTP codes |
| AC-3 | `/api/*` full path verbatim, `/:service/*` strip prefix, error envelopes 404/502 match TS |
| AC-4 | `/health-dashboard` HTTP 200, content-type text/html, 9 services, CSS classes, meta refresh 60s, no CDN |
| AC-5 | `go test ./...` coverage of 5 Vitest files (~842 LOC), table-driven, no real network |
| AC-6 | mcp-server Vitest 8804/8804 unchanged after compose gateway swap — zero consumer-side regression |
| AC-7 | `log/slog` JSON per-request: time, level, msg, method, path, status, latency_ms |
| AC-8 | Rollback: image-tag revert + `docker-compose up -d api-gateway`, stateless (no volume) |
| AC-9 | DDD package layout: domain/application/infrastructure/interface per brief § 3.1 |
| AC-10 | 24h smoke window: `GET /health` 200 + 9 services at end; fail-early if 503 >5min |
| AC-11 | `/healthz` k8s liveness alias to `/health` (Go addition, TS no backport needed) |

---

## Notes for Developer

- Go competency lazy-load is installed in `dev-api-gateway.md` (trigger: `go_migration`). Read that knowledge file first.
- No framework (chi optional but recommended for `:service` path param extraction).
- Structured logging via `log/slog` — JSON output to stdout (ops observability roadmap).
- SDD-1 invariant: gateway is proxy-only; it does NOT register `source_tier`. Upstream services own their semantics.
- Bun native-binding teardown risk (motivating this refactor) is eliminated by design: Go gateway has zero native deps, no CGO.
- Phase 1 is gated by 24h smoke window before Phase 2 can dispatch. Do NOT merge Phase 2 until AC-10 passes.
