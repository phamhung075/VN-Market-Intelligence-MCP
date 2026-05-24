---
title: "Phase 1 Task Plan — api-gateway SCALE Pilot"
date: "2026-05-24"
author: "architect"
task: "P0-AG-4"
status: "READY-FOR-DISPATCH"
pilot: "api-gateway"
language: "Go"
sprint_kickoff: "2026-05-24"
sprint_deadline: "2026-07-05"
charter_ref: "docs/architecture-briefs/2026-05-22-refactor/scale/api-gateway-charter.md"
canonical_goals_ref: "docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md"
brownfield_ref: "docs/architecture-briefs/2026-05-22-refactor/scale/api-gateway-brownfield.md"
status_ssot: "docs/data/pilot-status-api-gateway.json"
wip_limit: 1
---

# Phase 1 Task Plan — api-gateway SCALE Pilot

**Generated:** 2026-05-24 by architect (P0-AG-4)
**Owner agent:** dev-api-gateway
**Language:** Go (stdlib only, no external deps, CGO_ENABLED=0)
**WIP:** 1 (sequential, no parallelization — gateway is highest blast-radius service)

---

## Context Summary

api-gateway is the **lowest-domain-logic service** in the rollout (routing/proxy, not computation) and the **highest blast-radius service** (single MCP-facing interface routing to all 9 upstream services). These two facts shape every design decision in this plan:

- Fewer primitives (honest 3, not 5–8) — fewer extraction tasks
- G11 regression-canary design is the FIRST sequencing priority, not an afterthought
- Single `gateway` module — one C-bucket task, not a module build sequence
- Dashboard narrative is routing-honest ("routing rule X → upstream Y") not domain-computation

**Confirmed primitive band:** 3 (from brownfield scan P0-AG-1)
1. `overall-status-computer` — `computeOverallStatus(map[string]HealthStatus) HealthStatus`
2. `proxy-path-resolver` — `ProxyPath(reqPath string, svc *ServiceConfig) string`
3. `route-service-matcher` — `ExtractServiceName(path, prefix string) string`

---

## Pre-conditions (must be true before Phase 1 starts)

- [ ] Phase 0 exit gate OPEN (P0-AG-1, P0-AG-2 landed; P0-AG-3 agent-father deliverable landed)
- [ ] `docs/data/pilot-status-api-gateway.json` phase0.status = "CLOSED" and phase1.status = "ACTIVE"
- [ ] `go test ./...` passes in `apps/api-gateway/` (verified in P0-AG-1: 45 tests, 0 failures)
- [ ] No pending fix commits on `apps/api-gateway/` blocking Phase 1

---

## Bucket Layout

This plan uses the **B/C/E bucket pattern** matching the pilot charter:

| Bucket | Responsibility | Tasks |
|--------|----------------|-------|
| **B** | First-primitive task — extract, promote, scenario suite, G11 design | P1-AG-B1, P1-AG-B2, P1-AG-B3 |
| **C** | Gateway module stub — compose 3 primitives via ports, multi-prim scenario | P1-AG-C1 |
| **E** | Dashboard stub — three-level HTML + edit-rerun + G12 DoD gate | P1-AG-E1, P1-AG-E2 |

No A-bucket (composition root already clean at 67 lines, ≤80 — no rewrite needed).
No D-bucket separated (scenarios are authored inline with each B task — simpler for 3 primitives).

---

## Task Ledger

| ID | Title | Goals Advanced | Blocks | Blocked by | Est |
|----|-------|---------------|--------|------------|-----|
| **P1-AG-B1** | Extract `overall-status-computer` primitive + G11 coupled-scenario design | G1, G7, G11, G12 | P1-AG-B2 | Phase 0 gate | 2h |
| **P1-AG-B2** | Extract `proxy-path-resolver` primitive + 3 scenarios | G1, G7, G12 | P1-AG-B3 | P1-AG-B1 | 1h |
| **P1-AG-B3** | Extract `route-service-matcher` primitive + 3 scenarios + update handler call sites | G1, G7, G12 | P1-AG-C1 | P1-AG-B2 | 1.5h |
| **P1-AG-C1** | `pkg/module/gateway/` stub — compose 3 primitives, multi-primitive routing scenario | G2, G12 | P1-AG-E1 | P1-AG-B3 | 1h |
| **P1-AG-E1** | Three-level dashboard HTML (`apps/api-gateway/dashboard/index.html`) — routing-honest narrative | G6, G8, G9, G12 | P1-AG-E2 | P1-AG-C1 | 2h |
| **P1-AG-E2** | Edit-rerun handler + env audit + G12 DoD gate proof + depguard fence anchor | G4, G7, G8, G12 | — | P1-AG-E1 | 1.5h |

**Total tasks:** 6
**Total estimated effort:** ~9 hours (1 agent, WIP=1, sequential)
**Critical path:** B1 → B2 → B3 → C1 → E1 → E2

---

## Sequencing — Why This Order

```
P1-AG-B1  ← FIRST: overall-status-computer (G11 blast-radius design attached here)
    │
P1-AG-B2  ← proxy-path-resolver (already exported, cleanest extraction)
    │
P1-AG-B3  ← route-service-matcher (requires handler refactor — most invasive B task)
    │
P1-AG-C1  ← gateway module (depends on all 3 primitives being extracted)
    │
P1-AG-E1  ← dashboard HTML (depends on module contract.md for narrative)
    │
P1-AG-E2  ← edit-rerun + G4 fence + G12 DoD proof (final task, depends on E1)
```

**G11 is sequenced FIRST (attached to P1-AG-B1) because:**
The gateway has the widest blast radius of any service. A proxy-path or route-matcher regression breaks all 9 upstream routes. The coupled-scenario proof must be designed before a second primitive is extracted, so the coupling is testable across all three primitives from the start. This is the canonical charter delta for api-gateway.

---

## Per-Task Spec

### P1-AG-B1 — Extract `overall-status-computer` + G11 coupled-scenario design

**Owner:** dev-api-gateway
**Goals advanced:** G1 (primitive ships with scenarios), G7 (edit-rerun + zero creds), G11 (regression canary), G12 (DoD gate)
**Est:** 2h

**What to build:**

1. Create `apps/api-gateway/pkg/primitive/overall-status-computer/compute.go`:
   - Export `ComputeOverallStatus(statuses map[domain.HealthStatus]struct{} OR map[string]domain.HealthStatus) domain.HealthStatus`
   - Logic is identical to current `computeOverallStatus` in `pkg/domain/services.go` — promote, do not rewrite
   - No I/O, no net/http imports. Pure function.

2. Create `apps/api-gateway/pkg/primitive/overall-status-computer/compute_test.go`:
   - Table-driven tests: all-ok, all-down, mixed (→ degraded), empty (→ down), single-ok, single-down, degraded-present
   - Mirrors existing coverage in `services_test.go:174–210` but tests the function directly

3. Create 3 scenario JSON files under `apps/api-gateway/pkg/primitive/overall-status-computer/scenarios/`:
   - `golden-all-ok.json` — `{ok, ok, ok}` → `ok`
   - `golden-degraded.json` — `{ok, ok, down}` → `degraded`
   - `failure-reversed-guard.json` — expected `degraded` but receives `down` if `allDown` check precedes `allOk`; this is the deliberate failure scenario

4. Update `pkg/domain/services.go`: replace inline `computeOverallStatus` call with imported `overall-status-computer.ComputeOverallStatus`

5. **G11 coupled-scenario design (HIGH PRIORITY):**
   - Create `apps/api-gateway/pkg/primitive/overall-status-computer/scenarios/g11-canary-cascade.json`
   - This scenario proves that a flip in `overall-status-computer` (e.g., `{ok, ok, down}` wrongly returns `ok` instead of `degraded`) cascades to BOTH the `/health` JSON response AND the dashboard `overall-badge` class
   - The canary scenario must reference the proxy scenario from P1-AG-B2 (path: note in JSON comments)
   - Document the two-trial G11 coupling plan in `apps/api-gateway/docs/g11-coupling-design.md`:
     - Trial 1: flip `overall-status-computer` (`{ok,ok,down}→ok` instead of `degraded`); verify proxy scenario AND health-aggregate scenario both go RED
     - Trial 2: flip `route-service-matcher` (wrong service name extracted); verify proxy cascade AND health-route scenario both go RED

**Smoke check:**
```sh
cd apps/api-gateway
go test ./...        # all 45 + new tests pass
go vet ./...         # zero warnings
grep -r "net/http\|httputil" pkg/primitive/ # must return 0 (no I/O in primitive tier)
```

**AC:**
- AC-1: `pkg/primitive/overall-status-computer/compute.go` exists, exported function `ComputeOverallStatus`
- AC-2: 3 scenario JSON files present, including 1 failure scenario
- AC-3: `pkg/domain/services.go` calls imported primitive (no duplicate inline function)
- AC-4: `go test ./...` passes, count ≥ 45 + new unit tests
- AC-5: g11-coupling-design.md authored, two-trial cascade plan documented
- AC-6: G12 DoD: paste `go test ./... PASS` output into handoff before marking done

---

### P1-AG-B2 — Extract `proxy-path-resolver` primitive + 3 scenarios

**Owner:** dev-api-gateway
**Goals advanced:** G1, G7, G12
**Est:** 1h

**What to build:**

1. Create `apps/api-gateway/pkg/primitive/proxy-path-resolver/resolve.go`:
   - Export `ResolveProxyPath(reqPath string, noProbe bool) string`
   - Same logic as current `ProxyPath` in `pkg/interface/http/handlers.go` — move, do not rewrite
   - Signature simplification: `noProbe bool` instead of `*domain.ServiceConfig` (decouples primitive from domain model; handlers pass `svc.NoProbe`)
   - No I/O. Pure function.

2. Create `apps/api-gateway/pkg/primitive/proxy-path-resolver/resolve_test.go`:
   - Table-driven: real-service strip, virtual-alias verbatim, multi-segment, short-path fallback-to-root

3. Create 3 scenario JSON files under `apps/api-gateway/pkg/primitive/proxy-path-resolver/scenarios/`:
   - `golden-real-service.json` — `/stock/health`, noProbe=false → `/health`
   - `golden-virtual-alias.json` — `/api/push-news`, noProbe=true → `/api/push-news`
   - `failure-missing-third-segment.json` — `/stock` (no trailing path), noProbe=false → `/` (not panic, not wrong segment)

4. Update `pkg/interface/http/handlers.go`:
   - Remove `ProxyPath` function
   - `HandleProxy` calls `proxypathresolver.ResolveProxyPath(r.URL.Path, svc.NoProbe)` instead

**Smoke check:**
```sh
cd apps/api-gateway
go test ./...
grep -r "net/http\|httputil" pkg/primitive/ # 0 results
```

**AC:**
- AC-1: `pkg/primitive/proxy-path-resolver/resolve.go` exists, exported `ResolveProxyPath`
- AC-2: 3 scenario JSONs, including 1 failure scenario
- AC-3: `ProxyPath` no longer exists in `pkg/interface/http/handlers.go`
- AC-4: `HandleProxy` calls imported primitive
- AC-5: `go test ./...` passes, existing proxy tests still pass
- AC-6: G12 DoD: paste pass output into handoff

---

### P1-AG-B3 — Extract `route-service-matcher` primitive + handler refactor

**Owner:** dev-api-gateway
**Goals advanced:** G1, G7, G12
**Est:** 1.5h

**What to build:**

1. Create `apps/api-gateway/pkg/primitive/route-service-matcher/match.go`:
   - Export `ExtractServiceName(path, prefixToStrip string) string`
   - Logic: `strings.TrimPrefix(path, prefixToStrip)` → `strings.SplitN(result, "/", 2)[0]`
   - Handles empty result (trailing slash after prefix strip) → returns `""`
   - No I/O. Pure function. No domain model dependency.

2. Create `apps/api-gateway/pkg/primitive/route-service-matcher/match_test.go`:
   - Table-driven: `/health/mcp` with prefix `/health/` → `mcp`, `/stock/health` with prefix `/` → `stock`, `/health/` (empty service) → `""`, root path `/` → `""`

3. Create 3 scenario JSON files under `apps/api-gateway/pkg/primitive/route-service-matcher/scenarios/`:
   - `golden-health-route.json` — `/health/macro`, prefix `/health/` → `macro`
   - `golden-proxy-route.json` — `/stock/indicators`, prefix `/` → `stock`
   - `failure-empty-service.json` — `/health/` (trailing slash), prefix `/health/` → `""` (triggers 404 via registry miss, not a crash)

4. Update `pkg/interface/http/handlers.go`:
   - `HandleServiceHealth`: replace inline `strings.Split(strings.TrimPrefix(...))` with `matcher.ExtractServiceName(r.URL.Path, "/health/")`
   - `HandleProxy`: replace inline `strings.SplitN(strings.TrimPrefix(...))` with `matcher.ExtractServiceName(r.URL.Path, "/")`

**Smoke check:**
```sh
cd apps/api-gateway
go test ./...
grep -r "net/http\|httputil" pkg/primitive/ # 0 results (still)
# Verify import boundary: primitives import only stdlib + domain models
grep -r "application\|infrastructure\|interface" pkg/primitive/ # 0 results
```

**AC:**
- AC-1: `pkg/primitive/route-service-matcher/match.go` exists, exported `ExtractServiceName`
- AC-2: 3 scenario JSONs, including 1 failure scenario
- AC-3: `HandleServiceHealth` and `HandleProxy` both call imported primitive
- AC-4: No inline service-name extraction remains in `handlers.go`
- AC-5: `go test ./...` passes, all existing handler tests still pass
- AC-6: Import boundary: no application/infrastructure/interface imports in any `pkg/primitive/` file
- AC-7: G12 DoD: paste pass output into handoff

---

### P1-AG-C1 — Gateway module stub + multi-primitive routing scenario

**Owner:** dev-api-gateway
**Goals advanced:** G2 (module composes primitives via ports), G12
**Est:** 1h

**What to build:**

1. Create `apps/api-gateway/pkg/module/gateway/`:
   ```
   gateway.go      — GatewayModule struct: injected HealthCheckerPort + ServiceRegistryPort
   contract.md     — documents module boundary: what it composes, what ports it consumes
   scenarios/
     routing-story.json  — multi-primitive scenario exercising all 3 primitives in sequence
   ```

2. `gateway.go` must:
   - Import `overall-status-computer`, `proxy-path-resolver`, `route-service-matcher` primitives
   - Accept `HealthCheckerPort` + `ServiceRegistryPort` via constructor (reuse ports from `pkg/domain/ports.go` — do NOT duplicate)
   - Expose a `RouteRequest(path string) (upstream string, downstreamPath string, err error)` method or equivalent that exercises all 3 primitives in a single call chain
   - Zero net/http direct import (I/O only via injected ports)

3. `contract.md` must document:
   - Module boundary: what primitives it composes
   - What ports it consumes (HealthCheckerPort, ServiceRegistryPort)
   - The routing story narrative for G6 dashboard: "path → service-name → downstream-path → overall-status"

4. `scenarios/routing-story.json`:
   - Input: path `/macro/snapshot`, known services
   - Step 1: `route-service-matcher.ExtractServiceName("/macro/snapshot", "/")` → `"macro"`
   - Step 2: `proxy-path-resolver.ResolveProxyPath("/macro/snapshot", false)` → `"/snapshot"`
   - Step 3: `overall-status-computer.ComputeOverallStatus({macro: ok, mcp: ok, stock: down})` → `degraded`
   - Expected output: `{upstream: "macro", downstreamPath: "/snapshot", overallStatus: "degraded"}`
   - This is the multi-primitive scenario required by G2

**Smoke check:**
```sh
cd apps/api-gateway
go test ./...
grep -r "from.*pkg/module/" pkg/module/ # 0 cross-module imports
grep "net/http\b" pkg/module/gateway/gateway.go # must return 0
```

**AC:**
- AC-1: `pkg/module/gateway/gateway.go` exists, composes 3 primitives
- AC-2: `contract.md` documents boundary + ports + routing narrative
- AC-3: 1 multi-primitive scenario JSON present, exercises all 3 primitives
- AC-4: No cross-module imports (`grep from.*pkg/module/ in pkg/module/` = 0)
- AC-5: No direct net/http in module (I/O via injected ports only)
- AC-6: `go test ./...` passes
- AC-7: G12 DoD: paste pass output into handoff

---

### P1-AG-E1 — Three-level dashboard HTML (`apps/api-gateway/dashboard/index.html`)

**Owner:** dev-api-gateway
**Goals advanced:** G6 (three-level renders), G8 (red/green honest), G9 (trust contract), G12
**Est:** 2h

**CRITICAL DISTINCTION:** This is NOT the existing runtime health dashboard served by `HandleDashboard` / `BuildDashboardHTML`. That is a live ops page. This is the **trust dashboard** — standalone HTML, file:// URL, renders from scenario TRACE JSON, zero network calls.

**What to build:**

1. Create `apps/api-gateway/dashboard/index.html`:
   - Three panels visible: **Primitives** (3 cards), **Module** (1 card: `gateway`), **Microservice** (1 card: api-gateway port 4000)
   - Reads trace JSON from `../pkg/primitive/*/scenarios/*.json` and `../pkg/module/gateway/scenarios/*.json` relative paths
   - Renders red/green status per scenario: green = expected matches actual, red = mismatch
   - Cold open (no prior run): displays "NOT-RUN" status honestly — do NOT fabricate green
   - ZERO external CDN/fetch/img. Standalone. Works on `file://` URL.
   - Routing-honest narrative: cards describe routing operations ("route-service-matcher: /macro/snapshot → macro"), not domain computation

2. Port 4000 sourced from relative path / hardcoded in dashboard (system-map.json is not accessible file://; api-gateway is a pure proxy service with no DB to query)

3. G8 proof design (QA will execute, but dev must design the failure path):
   - Describe in `dashboard/README.md` how to trigger red: edit a golden scenario's expected output to a wrong value → dashboard card turns red
   - Dashboard must detect mismatch at render time, not require a rebuild

**Smoke check (headless — Playwright or chromium-headless-shell):**
```sh
# Matching G9 Path B default (PO Playwright headless)
node -e "..." # or chromium-headless-shell against file://
# Verify: ZERO console errors, ZERO pageerrors, all 3 panels visible, NOT-RUN honest
```

**AC:**
- AC-1: `apps/api-gateway/dashboard/index.html` exists
- AC-2: Three panels visible (Primitives 3-card, Module 1-card, Microservice 1-card)
- AC-3: Cold open shows NOT-RUN (not fabricated green)
- AC-4: No CDN/fetch/img in HTML (self-contained)
- AC-5: Routing-honest narrative (path → service → upstream, not RSI/MACD language)
- AC-6: `dashboard/README.md` documents red-trigger procedure
- AC-7: Headless render: ZERO console errors, all 3 panels present
- AC-8: G12 DoD: paste headless render pass into handoff

---

### P1-AG-E2 — Edit-rerun handler + env audit + G12 DoD proof + depguard fence anchor

**Owner:** dev-api-gateway
**Goals advanced:** G4 (architecture fence), G7 (edit-rerun + zero creds), G8, G12
**Est:** 1.5h

**What to build:**

1. **Sandbox runner** (`apps/api-gateway/cmd/sandbox/main.go`):
   - `CGO_ENABLED=0 go run ./cmd/sandbox -tier=primitive -scenario=<path>` reads a scenario JSON, executes the named primitive, compares output to expected, writes a trace JSON
   - Supports all 3 primitives via `--primitive` flag
   - Zero credentials: sandbox must have no DB, no API keys, no Telegram in env. This is trivially clean for api-gateway (no creds by design) but must be verified via env audit.

2. **Edit-rerun proof:**
   - Edit `pkg/primitive/overall-status-computer/scenarios/golden-degraded.json` expected output from `degraded` to `ok`
   - Run sandbox → observe mismatch → dashboard card turns red
   - Revert → run sandbox → dashboard card turns green
   - Paste before/after in handoff as evidence

3. **Env audit:**
   ```sh
   env | grep -iE 'DB_|API_KEY|SECRET|TOKEN|PASSWORD'
   ```
   Must return empty in sandbox process. Paste output (empty = pass) in handoff.

4. **G4 depguard fence (`apps/api-gateway/.golangci.yml`):**
   - Fence-A: `pkg/primitive/**` must NOT import `application`, `infrastructure`, `interface`, `net/http`, `net/http/httputil`
   - Fence-B: `pkg/module/**` must NOT import `infrastructure` or dial `net/http` directly (I/O only via injected ports)
   - Fence-C: `infrastructure` importable ONLY from `cmd/server/main.go` (exclusions: `!cmd/server/main.go`, `!*_test.go`)
   - Use depguard via golangci-lint (same mechanism as TA + macro + stock-price + alert-engine)
   - Offline proof: run `golangci-lint run ./...` in `apps/api-gateway/` → exit 0
   - Deliberate violation: add `import "net/http"` to a primitive file → confirm non-zero exit citing Fence-A → revert → never commit
   - Freeze anchor: record `.golangci.yml` commit SHA in `pilot-status-api-gateway.json` G4 calibration evidence field (done by QA, not dev)

5. **G12 DoD gate final confirmation:**
   - Record that the 3-task streak (B1 + C1 + E1) each had sandbox-green evidence pasted before marking done
   - Paste streak evidence into handoff

**Smoke check:**
```sh
cd apps/api-gateway
CGO_ENABLED=0 go build ./cmd/sandbox/    # compiles
CGO_ENABLED=0 go run ./cmd/sandbox -tier=primitive -scenario=pkg/primitive/overall-status-computer/scenarios/golden-all-ok.json
# exit 0 + trace JSON written
env | grep -iE 'DB_|API_KEY|SECRET|TOKEN|PASSWORD'  # empty = pass
golangci-lint run ./...  # exit 0
```

**AC:**
- AC-1: `apps/api-gateway/cmd/sandbox/main.go` exists, CGO_ENABLED=0 compiles
- AC-2: Edit-rerun cycle: before (red) + after (green) trace JSONs in handoff
- AC-3: Env audit output pasted (empty = pass)
- AC-4: `.golangci.yml` exists with Fence-A/B/C rules
- AC-5: `golangci-lint run ./...` exits 0
- AC-6: Deliberate Fence-A violation confirmed non-zero exit (never committed) — pasted in handoff
- AC-7: G12 streak: 3-task evidence (B1 + C1 + E1 sandbox-green before DONE) pasted in handoff
- AC-8: G12 DoD: `go test ./... PASS` + sandbox green + all ACs pasted in handoff

---

## G11 Coupling Design (Expanded)

G11 is the highest priority for api-gateway. The blast-radius risk requires two distinct coupling trials.

### Trial 1: `overall-status-computer` cascade (designed in P1-AG-B1)

**Setup:** modify `overall-status-computer` so `{ok, ok, down}` → returns `ok` instead of `degraded`

**Coupled scenarios that must all go RED:**
1. `overall-status-computer/scenarios/golden-degraded.json` — directly tests the corrupted function
2. `overall-status-computer/scenarios/g11-canary-cascade.json` — tests that the `/health` JSON response shape also reflects the wrong status
3. `module/gateway/scenarios/routing-story.json` — tests that the module-level multi-primitive scenario is also affected

**Fix:** revert the corruption. All 3 scenarios must return GREEN in a single rerun.

### Trial 2: `route-service-matcher` cascade (designed in P1-AG-B3)

**Setup:** modify `route-service-matcher` so it returns the WRONG prefix segment (e.g., for `/macro/snapshot` with prefix `/`, returns `"macro/snapshot"` instead of `"macro"`)

**Coupled scenarios that must all go RED:**
1. `route-service-matcher/scenarios/golden-proxy-route.json` — directly tests the corrupted function
2. `route-service-matcher/scenarios/golden-health-route.json` — a different route pattern, both must go RED
3. `module/gateway/scenarios/routing-story.json` — module scenario that depends on correct service name

**Fix:** revert. All 3 go GREEN.

**Evidence requirement:** for G11 YES, QA must observe at least one trial where a primitive mutation causes a module-level scenario to go RED without any additional code change.

---

## Goal Mapping

| Task | G1 | G2 | G3 | G4 | G5 | G6 | G7 | G8 | G9 | G10 | G11 | G12 |
|------|----|----|----|----|----|----|----|----|----|----|-----|-----|
| P1-AG-B1 | ✓ | | | | | | ✓ | | | | ✓ | ✓ |
| P1-AG-B2 | ✓ | | | | | | ✓ | | | | | ✓ |
| P1-AG-B3 | ✓ | | | | | | ✓ | | | | | ✓ |
| P1-AG-C1 | | ✓ | | | | | | | | | | ✓ |
| P1-AG-E1 | | | | | | ✓ | | ✓ | ✓ | | | ✓ |
| P1-AG-E2 | | | | ✓ | | | ✓ | ✓ | | | | ✓ |

**Goals NOT addressed in Phase 1 (addressed in Phase 2+):**
- G3: composition root already clean (67L ≤80, no rewrite needed). Verify-only in Phase 2.
- G5: trivially-YES (no legacy TS gateway). Verify-only grep in Phase 2.
- G9: PO Playwright headless proof — happens after E1 dashboard is live (Phase 2 or end of Phase 1)
- G10: QA injects bug after G1 + G12 are in place

---

## Go Smoke-Check Standard (all tasks)

All tasks must pass before commit:
```sh
cd apps/api-gateway
go test ./...          # all tests pass, count must not decrease from Phase 0 baseline (45)
go vet ./...           # zero warnings
go build ./cmd/...     # all binaries compile
```

For tasks touching scenario JSON:
```sh
find apps/api-gateway/pkg -name '*.json' -exec jq . {} \; > /dev/null  # all valid JSON
```

For tasks after P1-AG-B3 (fence wired):
```sh
golangci-lint run ./...  # exit 0
```

---

## G12 DoD Gate (baked Day 0)

Per pilot charter G12, `dev-api-gateway` must NOT mark any task DONE until:
1. `go test ./...` output (PASS) is pasted in the task handoff
2. Dashboard scenario green (for tasks touching primitives/module)
3. Sandbox trace JSON present and matching expected

The G12 3-task streak counts: P1-AG-B1 (first primitive) + P1-AG-C1 (module stub) + P1-AG-E1 (dashboard stub).

---

## Constraints

- WIP=1: only 1 task active at a time. dev-api-gateway works sequentially.
- All work on `main`. No branches.
- Explicit per-file staging: `git add <path>` per file. Never `-A` or `.`.
- No --force, no --no-verify.
- Anti-scope-creep: `apps/api-gateway/` ONLY. No other service touched.
- Pre-delete tag `api-gateway-pre-delete` required before any `git mv/rm` in G5 (Phase 2 if needed).
- ZERO credentials in sandbox process at all times (charter security clause).
