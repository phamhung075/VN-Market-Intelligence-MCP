---
title: "G11 Coupled-Cascade Design — api-gateway"
date: "2026-05-24"
task: "P1-AG-B1"
status: "ACTIVE"
primitive_scope: "overall-status-computer (Trial-1) · route-service-matcher (Trial-2, task B3)"
---

# G11 Coupled-Cascade Design — `api-gateway`

## Why G11 matters for the gateway

The api-gateway has the **widest blast radius** of any service. Every downstream
service (mcp, pdf, rag, ta, macro, stock, and the `/api/*` virtual alias) is
routed through it. A regression in ANY primitive propagates simultaneously to:

1. The `/health` JSON envelope consumed by the MCP server and monitoring.
2. The dashboard HTML badge class consumed by the trust-dashboard user view.
3. (For route-matcher regressions) ALL proxy paths, breaking every API call.

G11 requires that the scenario set for this service **proves cascade propagation**
rather than just isolated unit correctness. A unit test that catches a wrong
`overall-status-computer` output is necessary but NOT sufficient — the G11
canary must also verify that the same wrong output corrupts both downstream
surfaces.

---

## Two-Trial Plan

### Trial-1 — Flip `overall-status-computer` (this task, B1)

**Injection:** Mutate `ComputeOverallStatus` so that input `{ok, ok, down}`
wrongly returns `"ok"` instead of `"degraded"`.

**Prediction:** Two cascade surfaces go RED.

| Surface | Correct output | Corrupted output when bug injected |
|---|---|---|
| `/health` JSON `$.status` field | `"degraded"` | `"ok"` |
| Dashboard `#overall-badge` CSS class | `class="status-degraded"` | `class="status-ok"` |

**Evidence chain:**

```
ComputeOverallStatus({ok, ok, down})
  → returns "ok"                         ← WRONG
  → AggregateHealthService.Aggregate()
      overall = HealthStatus("ok")
      → AggregatedHealth{Status: "ok"}
  → /health handler: JSON marshal        ← Surface 1 corrupted
      {"status": "ok", ...}
  → BuildDashboardHTML(health)
      statusClass(overall) = "status-ok" ← Surface 2 corrupted
      <div class="status-ok" ...>        ← Badge misleadingly green
```

**Verification commands for Trial-1:**

```bash
# Unit — direct primitive
cd apps/api-gateway
go test ./pkg/primitive/overall-status-computer/... -run TestComputeOverallStatus/mixed_ok_and_down_yields_degraded -v
# Must FAIL when bug injected, PASS with correct code.

# Integration — domain layer propagation
go test ./pkg/domain/... -run TestComputeOverallStatus/mixed_ok.down -v
# Must FAIL when bug injected.

# Integration — interface/http propagation (dashboard badge class)
go test ./pkg/interface/http/... -run TestDashboard_Degraded_ShowsBothClasses -v
# Must FAIL when bug injected (asserts "status-degraded" appears).
```

**Scenario files:**
- `pkg/primitive/overall-status-computer/scenarios/golden-degraded.json` — golden PASS
- `pkg/primitive/overall-status-computer/scenarios/failure-reversed-guard.json` — failure fixture
- `pkg/primitive/overall-status-computer/scenarios/g11-canary-cascade.json` — cascade proof

---

### Trial-2 — Flip `route-service-matcher` (task B3, not yet started)

**Injection:** Mutate `ExtractServiceName` so that path `/health/stock` returns
`"health"` instead of `"stock"`.

**Prediction:** Two cascade surfaces go RED.

| Surface | Correct behaviour | Corrupted behaviour when bug injected |
|---|---|---|
| `/health/<name>` response | Returns stock service health | Returns 404 (service "health" not in registry) |
| `/stock/*` proxy routing | Proxies to stock-price service | Wrong service matched or 404 |

**Evidence chain (to be authored in B3):**

```
ExtractServiceName("/health/stock", "/health/")
  → returns "health"                   ← WRONG (should be "stock")
  → HandleServiceHealth: registry.GetService("health")
      → nil                            ← Surface 1: 404
  → HandleProxy: registry.GetService("health")
      → nil                            ← Surface 2: proxy 404
```

**Scenario files:** to be authored in
`pkg/primitive/route-service-matcher/scenarios/g11-canary-cascade.json`

---

## G11 Gate Criterion

A task cycle passes G11 evidence if and only if:

1. At least one failure-injection scenario is authored and documented.
2. The scenario documents WHICH downstream surfaces go RED (minimum 2 surfaces).
3. The verification commands confirm that the existing test suite catches the
   cascade WITHOUT requiring new tests to be written — the coupling already
   exists in the test suite; the scenario just makes it auditable.

Trial-1 (B1) satisfies this criterion:
- Failure scenario: `failure-reversed-guard.json`
- Cascade canary: `g11-canary-cascade.json`
- 3 existing tests already catch the cascade:
  `TestComputeOverallStatus/mixed_ok_and_down_yields_degraded` (primitive),
  `TestComputeOverallStatus/mixed_ok+down` (domain, via AggregateHealthService),
  `TestDashboard_Degraded_ShowsBothClasses` (interface, via BuildDashboardHTML).

Trial-2 (B3) will satisfy for route-service-matcher.
