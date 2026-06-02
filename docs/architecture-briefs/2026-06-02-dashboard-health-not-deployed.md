# Architecture Brief — Dashboard Service Health: NOT_DEPLOYED Status

**Date:** 2026-06-02
**Task:** A-01b-1 (Architect design)
**Impl tasks:** A-01b-2 (api-gateway), A-01b-3 (frontend)
**Status:** DESIGN COMPLETE — hand to PM

---

## Problem

`localhost:3001` "Service Health" shows 7 services as red DOWN. Verified raw:
- `docker ps -a` → only 5 containers exist, all healthy (mcp-server, api-gateway, frontend,
  macro-indicators, mcp-gateway). ZERO stopped/exited containers.
- The 7 (pdf, rag, ta, stock, kinh-dich, alert, news) are not deployed by design on this
  16GB host (kernel-panic risk under full fleet). This is documented SSOT:
  `docs/data/system-map.json .project.infrastructure.docker.host_runtime_set`.
- Root cause: `AggregateHealthService.Aggregate` probes all 9 registry services; the 7
  time-out → `StatusDown`; `ComputeOverallStatus` receives `{mcp:ok, macro:ok, pdf:down,
  rag:down, ta:down, stock:down, kinh-dich:down, alert:down, news:down}` → emits `degraded`
  (mixed); frontend renders amber/red DEGRADED badge + 7 red DOWN rows.

---

## SSOT Name-Map (load-bearing — read before coding)

`docs/data/system-map.json .project.infrastructure.docker.host_runtime_set`

Two forms of service identity exist in code:

| Short-key (registry + frontend) | Compose service name      |
|---------------------------------|---------------------------|
| `mcp`                           | `mcp-server`              |
| `pdf`                           | `pdf-extractor`           |
| `rag`                           | `rag-service`             |
| `ta`                            | `technical-analysis`      |
| `macro`                         | `macro-indicators`        |
| `stock`                         | `stock-price`             |
| `kinh-dich`                     | `kinh-dich-service`       |
| `alert`                         | `alert-engine`            |
| `news`                          | `news-fetch`              |

**All filtering and matching MUST use the short-key form.** The `not_deployed_short_keys`
array in `host_runtime_set` is the authoritative set:

```
["pdf", "rag", "ta", "stock", "kinh-dich", "alert", "news"]
```

Deployed on this host (short-key form): `mcp`, `macro`. (frontend/api-gateway/mcp-gateway
are infrastructure and not probed — registry has `NoProbe: false` only for the 9 above.)

---

## Decision 1 — New Status Enum Literal

**Exact literal:** `"not_deployed"`

### Go domain (A-01b-2)

File: `apps/api-gateway/pkg/domain/models.go`

Add one constant alongside the existing three:

```go
const (
    StatusOk          HealthStatus = "ok"
    StatusDegraded    HealthStatus = "degraded"
    StatusDown        HealthStatus = "down"
    StatusNotDeployed HealthStatus = "not_deployed"  // ADD
)
```

No other domain model changes.

### TypeScript frontend (A-01b-3)

File: `apps/frontend/app/domain/health.ts`

Extend the union type:

```typescript
export type ServiceStatus = "ok" | "degraded" | "down" | "not_deployed";
```

`GatewayHealthResponse`, `ServiceHealth`, and `ServiceRow` are already typed as
`ServiceStatus` or `Record<string, ServiceStatus>` — no change needed to those interfaces.

---

## Decision 2 — Where the Classification Happens (api-gateway)

**DDD layer:** domain service (`AggregateHealthService.Aggregate`).

**Rationale:** The not-deployed set is a deployment topology fact; classifying it belongs in
the domain service that aggregates health, not in the HTTP handler. This keeps the HTTP
handler a pure serializer and keeps `ComputeOverallStatus` a pure function.

### Injection point

File: `apps/api-gateway/pkg/domain/services.go`

`AggregateHealthService` gains a new field `notDeployedSet map[string]bool`.

Constructor signature change:

```go
func NewAggregateHealthService(
    checker  HealthCheckerPort,
    registry ServiceRegistryPort,
    notDeployedSet []string,          // ADD — short-keys from SSOT
) *AggregateHealthService
```

Internal: convert slice to `map[string]bool` on construction for O(1) lookup.

### Classify-before-probe logic in `Aggregate`

Before issuing the HTTP health-check fan-out, classify each service:

```
for each svc in registry.GetAllServices():
    if notDeployedSet[svc.Name]:
        statuses[svc.Name] = StatusNotDeployed
        latencies[svc.Name] = -1
        // do NOT fire HTTP health check
    else:
        // existing fan-out probe
```

Probe only non-not_deployed services. This eliminates the 7 timeout-induced false DOWNs
and avoids wasted network calls.

### Constructor call-site (main.go)

File: `apps/api-gateway/cmd/server/main.go`

Read the set from env (12-factor; no file I/O in Go binary):

```go
notDeployedRaw := getenv("NOT_DEPLOYED_SERVICES", "pdf,rag,ta,stock,kinh-dich,alert,news")
notDeployed := splitCSV(notDeployedRaw)  // helper: strings.Split + trim
healthDomainService := domain.NewAggregateHealthService(checker, registry, notDeployed)
```

**Default value hard-coded to the canonical 7 short-keys.** The env override
(`NOT_DEPLOYED_SERVICES`) lets ops adjust without a rebuild when the host_runtime_set
changes. The hard-coded default must exactly match `not_deployed_short_keys` in the SSOT.

No docker-compose.yml change required (default is correct for this host).

---

## Decision 3 — `ComputeOverallStatus` Rule for `not_deployed`

**Package:** `apps/api-gateway/pkg/primitive/overall-status-computer/compute.go`

**Rule:** `not_deployed` is a **neutral/skipped** value. It is excluded from the
OK/DEGRADED/DOWN computation entirely.

**Exact semantics:**

```
filter the input map: keep only entries where value != "not_deployed"
apply existing logic to filtered map:
    empty filtered map → "ok"      (all services are not_deployed → healthy by design)
    all filtered "ok"  → "ok"
    all filtered "down"→ "down"
    any mix            → "degraded"
```

**Critical: empty-after-filter → `"ok"`, NOT `"down"`.**
The existing code returns `"down"` for an empty map (fail-safe default). When ALL services
are not_deployed that would be wrong — it means nothing is deployed yet, not that everything
is down. Override: `len(filtered) == 0 → return StatusOk`.

**Implementation:** Add `StatusNotDeployed = "not_deployed"` constant to the package
(mirrors domain but avoids import cycle — same pattern as existing `StatusOk` etc.).
Filter before the existing `allOk`/`allDown` loop:

```go
const StatusNotDeployed = "not_deployed"

func ComputeOverallStatus(statuses map[string]string) string {
    filtered := make(map[string]string, len(statuses))
    for k, v := range statuses {
        if v != StatusNotDeployed {
            filtered[k] = v
        }
    }
    if len(filtered) == 0 {
        return StatusOk   // all not_deployed or empty → nothing is down
    }
    allOk := true
    allDown := true
    for _, s := range filtered {
        if s != StatusOk   { allOk = false }
        if s != StatusDown { allDown = false }
    }
    if allOk  { return StatusOk }
    if allDown { return StatusDown }
    return StatusDegraded
}
```

**Test additions** (file: `compute_test.go`):
- `not_deployed entries excluded`: `{mcp:ok, macro:ok, pdf:not_deployed, rag:not_deployed, ta:not_deployed, stock:not_deployed, kinh-dich:not_deployed, alert:not_deployed, news:not_deployed}` → `"ok"`
- `all not_deployed → ok`: `{a:not_deployed, b:not_deployed}` → `"ok"`
- `deployed down + not_deployed → degraded`: `{mcp:down, macro:ok, pdf:not_deployed}` → `"degraded"`
- `deployed all down + not_deployed → down`: `{mcp:down, macro:down, pdf:not_deployed}` → `"down"`
- existing cases: unchanged / still pass

---

## Decision 4 — API Response Shape Change

`AggregatedHealth.Services` map will now contain `"not_deployed"` values for the 7.

Example response:

```json
{
  "status": "ok",
  "services": {
    "mcp":       "ok",
    "macro":     "ok",
    "pdf":       "not_deployed",
    "rag":       "not_deployed",
    "ta":        "not_deployed",
    "stock":     "not_deployed",
    "kinh-dich": "not_deployed",
    "alert":     "not_deployed",
    "news":      "not_deployed"
  },
  "latencies": {
    "mcp":   12,
    "macro": 45,
    "pdf":   -1,
    ...
  },
  "checkedAt": "2026-06-02T..."
}
```

`latencies[name] = -1` for not_deployed (same as existing error path — no change to
`AggregatedHealth` struct, no new field needed).

---

## Decision 5 — Frontend Render Rule (A-01b-3)

### `apps/frontend/app/routes/dashboard.services.tsx`

**Status badge for `not_deployed`:** grey, label `NOT DEPLOYED`, no latency shown.

**Overall badge:** when `overallStatus === "ok"` and `not_deployed` services exist, render
an info sub-text: `"7 services not deployed on this host (by design)"`.

#### `StatusBadge` component — add `not_deployed` arm:

```typescript
const map = {
  ok:           "bg-green-900 text-green-300 border-green-700",
  degraded:     "bg-yellow-900 text-yellow-300 border-yellow-700",
  down:         "bg-red-900 text-red-300 border-red-700",
  not_deployed: "bg-slate-800 text-slate-400 border-slate-600",  // ADD
} as const;

const label = {
  ok:           "UP",
  degraded:     "DEGRADED",
  down:         "DOWN",
  not_deployed: "NOT DEPLOYED",  // ADD
} as const;
```

`StatusBadge` prop type: the `status` prop is typed `ServiceStatus` — no change needed
once `health.ts` is updated.

#### Row render — latency column:

Show `"—"` (already the null path) when `latencyMs == null`. For `not_deployed` rows,
`latencyMs` will be `-1` from the API. Treat `-1` as null:

```typescript
latencyMs: health.latencies?.[name] != null && health.latencies[name] >= 0
  ? (health.latencies[name] as number)
  : null,
```

This change is in the `loader` function's row-mapping block.

#### `overallStatus` on `LoaderData`:

The union type on `overallStatus` in `LoaderData` is already `"ok" | "degraded" | "down" | null`.
`not_deployed` will never be emitted as `overallStatus` (it is only a per-service value).
No type change needed on `LoaderData.overallStatus`.

#### Info sub-text for overall OK with not-deployed services:

In `ServerDashboard`, after rendering the overall badge:

```tsx
{overallStatus === "ok" && rows.some(r => r.status === "not_deployed") && (
  <p className="mt-1 text-xs text-slate-500">
    {rows.filter(r => r.status === "not_deployed").length} service(s) not deployed on
    this host by design — see system-map.json host_runtime_set.
  </p>
)}
```

---

## DDD Layer Assignment

| Change | Layer | File |
|--------|-------|------|
| `StatusNotDeployed` constant | domain | `pkg/domain/models.go` |
| `notDeployedSet` field + constructor | domain service | `pkg/domain/services.go` |
| `NOT_DEPLOYED_SERVICES` env wiring | infrastructure/wiring | `cmd/server/main.go` |
| `ComputeOverallStatus` filter | primitive (base tier) | `pkg/primitive/overall-status-computer/compute.go` |
| `ServiceStatus` union extension | frontend domain | `apps/frontend/app/domain/health.ts` |
| `StatusBadge` + latency guard + info text | frontend interface | `apps/frontend/app/routes/dashboard.services.tsx` |

---

## Risk Flags

**R-1 (LOAD-BEARING): Hardcoded default vs SSOT drift.**
`main.go` defaults `NOT_DEPLOYED_SERVICES="pdf,rag,ta,stock,kinh-dich,alert,news"`. If
`not_deployed_short_keys` in system-map.json changes, main.go must be updated or the env
var overridden. The brief documents this coupling explicitly. No auto-read of JSON at
runtime (no file I/O in Go binary — intentional 12-factor pattern).

**R-2 (ANTI-REGRESSION): Filter must be exact-match only.**
`notDeployedSet` is keyed by short-key. Any service NOT in the set must continue to be
probed and reported as `ok` or `down`. The QA DoD clause B proves this.

**R-3: `ComputeOverallStatus` import-cycle constraint remains.**
The primitive package has zero imports. The new `StatusNotDeployed` constant is declared
locally in the primitive (not imported from domain). This mirrors the existing pattern.

**R-4: `-1` latency sentinel.**
Frontend must guard `latencyMs >= 0` before rendering (clause added in loader). Failing
to guard renders `"-1 ms"` for not-deployed rows — a cosmetic but visible regression.

---

## QA DoD Contract — Anti-False-Green

Both clauses must pass before DONE is declared. QA must NOT accept green on clause A alone.

### Clause A — Not-Deployed Renders Correctly

Setup: running system (mcp-server + macro-indicators healthy, 7 others not deployed).

Expected observable:
1. Overall top badge: green `OK` (or equivalent `ok` status in JSON).
2. `mcp` row: green `UP` badge with latency.
3. `macro` row: green `UP` badge with latency.
4. `pdf`, `rag`, `ta`, `stock`, `kinh-dich`, `alert`, `news` rows: **grey** `NOT DEPLOYED`
   badge, latency column shows `—`.
5. Zero red DOWN rows. Zero red overall badge. Zero amber DEGRADED badge.
6. Info sub-text present: "7 service(s) not deployed on this host by design".

Verification method:
- `curl -s localhost:4000/health | jq .status` → `"ok"`
- `curl -s localhost:4000/health | jq '.services | to_entries | map(select(.value=="down"))'` → `[]`
- `curl -s localhost:4000/health | jq '.services | to_entries | map(select(.value=="not_deployed")) | length'` → `7`
- Browser: `localhost:3001/dashboard/services` → visual match above.

### Clause B — Real Outage Still Fires RED

Setup: `docker stop mcp-server` (a DEPLOYED service).

Expected observable:
1. `mcp` row: **red** `DOWN` badge.
2. Overall top badge: `DEGRADED` (mcp=down, macro=ok → mixed).
3. The 7 not-deployed rows remain grey `NOT DEPLOYED` — they must NOT flip to DOWN.

Verification method:
- `curl -s localhost:4000/health | jq .status` → `"degraded"`
- `curl -s localhost:4000/health | jq '.services.mcp'` → `"down"`
- `curl -s localhost:4000/health | jq '.services.pdf'` → `"not_deployed"` (unchanged)

After clause B: `docker start mcp-server` + confirm clause A still passes.

---

## BUILD-STANDARD

```
BUILD-STANDARD: lean
BUILD-STANDARD-REF: docs/standards/microservice-build-standard.md
NOTE: Two existing zones modified; no new service, no new HTTP port.
```

---

## ZONE Assignments

```
ZONE A-01b-2: apps/api-gateway/
  Files:
    - pkg/domain/models.go                                   (add StatusNotDeployed)
    - pkg/domain/services.go                                 (notDeployedSet field + classify-before-probe)
    - pkg/primitive/overall-status-computer/compute.go       (filter not_deployed)
    - pkg/primitive/overall-status-computer/compute_test.go  (4 new test cases)
    - cmd/server/main.go                                     (NOT_DEPLOYED_SERVICES env + splitCSV helper)

ZONE A-01b-3: apps/frontend/
  Files:
    - app/domain/health.ts                 (ServiceStatus union + not_deployed)
    - app/routes/dashboard.services.tsx    (StatusBadge arm + latency guard + info sub-text)
```

Sequential dispatch required (both zones touch the `ServiceStatus` contract boundary;
implement A-01b-2 first so the API emits `not_deployed` before the frontend consumes it).

---

## RETURN

```
DONE: Technical design complete — brief at docs/architecture-briefs/2026-06-02-dashboard-health-not-deployed.md
ZONE: apps/api-gateway/ + apps/frontend/ (multi-zone, sequential)
NEXT: pm | break A-01b-2 and A-01b-3 into atomic dev tasks, sequential order
HANDOFF: docs/architecture-briefs/2026-06-02-dashboard-health-not-deployed.md
PIPELINE: continue
```
