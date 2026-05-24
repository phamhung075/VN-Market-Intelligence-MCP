---
title: "api-gateway Brownfield Inventory — Phase 0 Spike"
date: "2026-05-24"
author: "architect"
task: "P0-AG-1"
status: "DONE"
timebox: "120m read-only scan"
scope: "apps/api-gateway/ ONLY"
---

# api-gateway — Phase 0 Brownfield Inventory

## 1. File Map

```
apps/api-gateway/
  go.mod                          # module github.com/vn-market-intelligence/api-gateway, go 1.22
  go.sum                          # EMPTY — zero external dependencies (stdlib only)
  Dockerfile                      # CGO_ENABLED=0 GOOS=linux, multi-stage build
  cmd/server/main.go              # 67 lines — composition root
  pkg/
    domain/
      models.go                   # HealthStatus, ServiceHealthResult, AggregatedHealth, ServiceConfig
      ports.go                    # HealthCheckerPort, ServiceRegistryPort (2 interfaces)
      services.go                 # AggregateHealthService + computeOverallStatus (unexported)
      services_test.go            # 7 tests including table-driven computeOverallStatus coverage
    application/
      aggregate.go                # AggregateHealthUseCase + ServiceHealthUseCase
      aggregate_test.go           # 4 tests
    infrastructure/
      healthchecker.go            # HTTPHealthChecker (net/http, context-deadline per svc)
      registry.go                 # StaticServiceRegistry (10 services: 9 probe + 1 virtual)
      registry_test.go            # 6 tests
    interface/http/
      handlers.go                 # GatewayHandlers (4 handler methods + ProxyPath + BuildDashboardHTML)
      handlers_test.go            # 28 tests (dashboard, health, proxy, ProxyPath unit)
      router.go                   # NewRouter — 5+1 routes registered on stdlib ServeMux
```

**Total test count:** 45 tests across 4 packages (cmd/server has no test files; correct — it is wiring only).

---

## 2. Confirmed Primitive Band — HONEST 3

The PO's three candidate primitives are confirmed against the real code. Analysis below. No 4th or 5th genuine candidate surfaced.

### Primitive 1: `overall-status-computer`

- **Current location:** `pkg/domain/services.go:73` — `computeOverallStatus(statuses map[string]HealthStatus) HealthStatus`
- **Signature:** pure function, no I/O, no receiver, deterministic
- **Currently unexported** — embedded inside `AggregateHealthService.Aggregate()`; called at line 62
- **Existing test coverage:** 7 table-driven cases in `services_test.go:174–210` exercise this function indirectly via `AggregateHealthService`. The cases cover: all-ok, all-down, mixed-ok+down, single-ok, single-down, degraded-present — these map directly to the golden + edge + failure scenario set needed by G1
- **Failure scenario:** `{ok, ok, down}` must return `degraded` — if the `allDown` guard is evaluated before `allOk`, an off-by-one or comparison reversal returns `down` instead; this is the canonical G10/G11 injection point
- **Extraction path:** promote to exported function in `pkg/primitive/overall-status-computer/compute.go`; `AggregateHealthService` calls it via import

### Primitive 2: `proxy-path-resolver`

- **Current location:** `pkg/interface/http/handlers.go:224` — `ProxyPath(reqPath string, svc *domain.ServiceConfig) string`
- **Signature:** pure function, no I/O, already exported
- **Logic:** if `svc.NoProbe` (virtual alias like `/api/*`), return `reqPath` verbatim; else `strings.SplitN(reqPath, "/", 3)` and return `"/" + parts[2]`, or `"/"` when path has no second segment
- **Existing test coverage:** 3 unit tests in `handlers_test.go:374–399` (`StripPrefix`, `VirtualAlias_FullPath`, `MultiSegment`); plus 2 integration proxy tests exercise it end-to-end
- **Failure scenario:** path `/stock` (no trailing segment) — `SplitN` yields `len(parts) < 3`, must return `"/"` not panic; also the virtual-alias branch — if `NoProbe` check is omitted, `/api/push-news` has its `/api/` prefix stripped incorrectly
- **Extraction path:** move to `pkg/primitive/proxy-path-resolver/resolve.go`; `HandleProxy` imports via pkg/primitive path

### Primitive 3: `route-service-matcher`

- **Current location:** duplicated across two handler methods
  - `HandleServiceHealth` (`handlers.go:278`): `strings.Split(strings.TrimPrefix(r.URL.Path, "/health/"), "/")` → `parts[0]`
  - `HandleProxy` (`handlers.go:313`): `strings.SplitN(strings.TrimPrefix(r.URL.Path, "/"), "/", 2)` → `parts[0]`
- **These are NOT identical** — they use different prefix stripping (`/health/` vs `/`), but both extract a service-name string from a URL path segment. The underlying pure operation is: given a URL path and a known prefix to strip, return the first path segment as the service name
- **Honest assessment:** this is a genuine pure-function unit with a clear failure scenario, and it IS duplicated. However, note that the two call sites have slightly different prefix conventions. The primitive should be designed as `ExtractServiceName(path, prefixToStrip string) string` so both call sites converge on the same pure function
- **Failure scenario:** path `/health/` (trailing slash, empty service name) — must return `""` which the handler then looks up in the registry (returning nil → 404); if the trimming logic is wrong, `parts[0]` could be `"health"` instead of `""`, routing to a nonexistent service
- **Extraction path:** `pkg/primitive/route-service-matcher/match.go`; both `HandleServiceHealth` and `HandleProxy` refactored to call it

### Rejected Candidates

| Candidate | Reason for rejection |
|---|---|
| `auth-header-validator` | api-gateway performs ZERO authentication today. `TestProxy_AuthHeaderForwarded` tests that headers are forwarded verbatim — the gateway is a transparent proxy for auth headers, not a validator. Manufacturing this primitive would be artificial per charter anti-creep clause. |
| `statusClass` / `statusLabel` | HTML rendering helpers in `handlers.go:61–83`. I/O-coupled (used exclusively in `BuildDashboardHTML`), not pure-function units in the DDD sense; they are view-layer formatting, not domain computation. |
| `BuildDashboardHTML` | HTML template function; uses `fmt.Sprintf` with large string literals. Not a pure-function unit in the three-tier sense — it is interface-layer presentation, not a primitive. Dashboard itself (G6) is a Trust layer deliverable. |
| `writeJSON` | I/O helper (writes to `http.ResponseWriter`). Not extractable as a pure function. |

---

## 3. Single Gateway Module Boundary

**One module: `pkg/module/gateway/`**

The single `gateway` module composes all three primitives:

```
pkg/module/gateway/
  gateway.go        — GatewayModule struct: injected HealthCheckerPort + ServiceRegistryPort
  contract.md       — documents routing story: match-service → resolve-path → compute-overall-status
  scenarios/        — multi-primitive scenario: routing story exercises all 3 primitives in sequence
```

**Composition story (multi-primitive scenario):**
1. `route-service-matcher.ExtractServiceName("/macro/indicators", "/")` → `"macro"`
2. `proxy-path-resolver.ProxyPath("/macro/indicators", svc)` → `"/indicators"`
3. `overall-status-computer.ComputeOverallStatus(statuses)` → `ok | degraded | down`

**G2 calibration note:** The existing `AggregateHealthService` + two use cases already constitute most of the module composition. Architect assessment: a thin `pkg/module/gateway/` wrapper is needed for three-tier completeness and for the multi-primitive sandbox scenario, but the existing application layer is the implementation. The module wraps it declaratively and provides the narrated scenario surface for G6 dashboard.

**Existing ports reuse:** `HealthCheckerPort` and `ServiceRegistryPort` in `pkg/domain/ports.go` are exactly the ports needed. Do NOT duplicate. The module injects these directly.

---

## 4. DDD Layer Audit — Clean vs Needs Rewiring

| Layer | Current state | Assessment |
|---|---|---|
| **domain/** | `models.go` (pure value objects), `ports.go` (2 interfaces), `services.go` (pure domain service + unexported `computeOverallStatus`) | CLEAN. No I/O, no net/http imports. The only action needed: export `computeOverallStatus` as `ComputeOverallStatus` and move to `pkg/primitive/` during Phase 1. |
| **application/** | `AggregateHealthUseCase` + `ServiceHealthUseCase` — both orchestrate domain calls via injected ports, no direct I/O | CLEAN. Conforms to DDD application layer: orchestration only, no domain logic. No rewiring needed. |
| **infrastructure/** | `HTTPHealthChecker` (net/http) + `StaticServiceRegistry` (in-memory, env-driven) | CLEAN. Correctly isolated I/O behind ports. No domain logic leaks. `StaticServiceRegistry` has hardcoded Docker service URLs as defaults — these are infrastructure configuration, not domain constants. Correct placement. |
| **interface/http/** | `GatewayHandlers` (4 handler methods) + `ProxyPath` (exported pure function, misplaced here) + `BuildDashboardHTML` (presentation) + `loggingMiddleware` + `router.go` | PARTIALLY MISPLACED. `ProxyPath` is a pure domain function currently sitting in the interface layer because it was added alongside `HandleProxy`. It must migrate to `pkg/primitive/proxy-path-resolver/` in Phase 1. `route-service-matcher` logic is inline in handler methods — same issue. Everything else (handlers, middleware, router) correctly belongs here. |

**Rewiring needed in Phase 1:**
- `ProxyPath` exits `pkg/interface/http/handlers.go` → moves to `pkg/primitive/proxy-path-resolver/`
- `computeOverallStatus` exits `pkg/domain/services.go` → moves to `pkg/primitive/overall-status-computer/`
- Inline service-name extraction in `HandleServiceHealth` + `HandleProxy` → extracted to `pkg/primitive/route-service-matcher/`

---

## 5. G5 — Legacy TS Gateway Check

**Result: CONFIRMED CLEAN. No legacy TS gateway exists.**

```
find apps/mcp-server/src -path '*gateway*' -name '*.ts' → 0 results
```

Git log confirms: commit `75d134a7` (feat(1912d): cutover Go gateway to primary, retire TS gateway) retired the TS version. The Go gateway (`apps/api-gateway/`) is the sole implementation. G5 for api-gateway grades trivially-YES: no deletion work, no HTTP rewire needed (MCP server already routes via Go gateway). Only verification steps remain (upstream port check + TODO grep).

The `apps/mcp-server/src` files that mention "gateway" (e.g., `macroSnapshotGuard.ts`, `parallelServiceDispatcherJob.ts`, `clients.ts`) reference the Go gateway's HTTP address, not implement a TS gateway.

---

## 6. Port 4000 + NO-CGO Confirmation

| Property | Finding |
|---|---|
| **Port** | `cmd/server/main.go:23` — `port = "4000"` default, `os.Getenv("PORT")` override. Dockerfile exposes nothing (internal port). Port 4000 confirmed. |
| **CGO_ENABLED** | `Dockerfile:RUN CGO_ENABLED=0 GOOS=linux go build -o gateway ./cmd/server/` — explicitly disabled. `go.sum` is empty — zero external dependencies; stdlib only. No sqlite, no C library. NO-CGO confirmed. |
| **External Go deps** | None. `go.sum` is empty. All packages are stdlib (`net/http`, `net/http/httputil`, `log/slog`, `sync`, `time`, `strings`, etc.) |

---

## 7. Existing Test Run — PASS

```
go test ./...
?   github.com/vn-market-intelligence/api-gateway/cmd/server    [no test files]
ok  github.com/vn-market-intelligence/api-gateway/pkg/application    1.284s
ok  github.com/vn-market-intelligence/api-gateway/pkg/domain         0.729s
ok  github.com/vn-market-intelligence/api-gateway/pkg/infrastructure 1.857s
ok  github.com/vn-market-intelligence/api-gateway/pkg/interface/http 2.515s
```

All 45 tests pass. Zero failures. `cmd/server` has no test files (correct — composition root; wiring only).

---

## 8. Risk Surface

| Risk | Severity | Layer | Note |
|---|---|---|---|
| **R-1: Blast radius** | HIGH | interface | api-gateway routes to all 9 services. A proxy-path or route-matcher regression breaks ALL upstream routing. G11 coupled-scenario design must pair a proxy scenario with a health-route scenario to catch cascade. |
| **R-2: ProxyPath in wrong layer** | MEDIUM | interface→domain | `ProxyPath` exported from interface layer; callers importing it from `pkg/interface/http` will fail import boundary check. Must be moved to primitive before G4 depguard is wired. |
| **R-3: `computeOverallStatus` unexported** | LOW | domain | Cannot be unit-tested directly; only tested via `AggregateHealthService`. Promotion to exported primitive unblocks direct scenario testing. |
| **R-4: `StaticServiceRegistry` has dual responsibility** | LOW | infrastructure | It both holds config AND filters probed vs virtual services. During Phase 1 this is fine; flag for Phase 2 if service-count grows. |
| **R-5: `HandleProxy` timeout logic** | LOW | interface | Context timeout is applied inside `HandleProxy` using `svc.ProxyTimeoutMs` with `svc.TimeoutMs*5` fallback. This logic is not covered by a scenario and is a footgun if `TimeoutMs=0`. Not a primitive extraction risk, but note for integration test design. |
| **R-6: No `pkg/primitive/` or `pkg/module/` directories exist** | INFORMATIONAL | — | By design (Phase 0). Phase 1 creates them. |

---

## 9. Summary for dev-api-gateway

- **CONFIRMED primitive band: 3** (overall-status-computer, proxy-path-resolver, route-service-matcher)
- **Single module:** `gateway`
- **Domain layer:** already clean
- **Application layer:** already clean
- **Infrastructure layer:** already clean
- **Interface layer:** needs `ProxyPath` and service-name extraction migrated out to primitives
- **G5:** trivially-YES, no legacy TS gateway
- **Port:** 4000 confirmed
- **CGO:** disabled, zero external deps, stdlib only
- **Tests:** 45 passing, no failures
