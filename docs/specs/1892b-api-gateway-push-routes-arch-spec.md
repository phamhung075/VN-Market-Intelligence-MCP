# Arch Spec — 1892b: API Gateway Push Routes

**Date:** 2026-05-12
**Sprint:** 1892b
**Status:** APPROVED — for developer implementation
**Effort:** S
**Baseline pass count:** 8804

---

## Problem Statement

`POST https://zenmidi.com/api/push-news` returns 404. The gateway proxy rule at
`apps/api-gateway/src/interface/handlers.ts:50` is `app.all('/:service/*', ...)`, which
requires a registered service name as the first path segment. A bare `/api/*` path has no
registered `:service` named `api` in `StaticServiceRegistry`, so the proxy falls through and
returns `{ error: "Unknown service: api" }` with HTTP 404.

The 1892a ops task confirmed: `localhost:3000/api/push-news` → 200 OK (MCP server handles
it). `zenmidi.com/api/push-news` → 404 (gateway blocks it). News ingestion has been zero
since Vinahost migration (2026-04-13). VPS service deploys and POSTs successfully but every
push is silently discarded at the gateway boundary.

---

## Brownfield Scan

### Gateway routing pattern (handlers.ts:50)

```
app.all('/:service/*', ...)
  → c.req.param('service')  →  registry.getService(name)
  → strips /:service prefix → forwards remainder to svc.baseUrl
```

Path rewrite: `/:service/foo/bar` → `/foo/bar` forwarded to `svc.baseUrl`.
So `/mcp/api/push-news` would forward to `http://mcp-server:3000/api/push-news`. Correct
target, wrong public URL shape.

### Service registry (index.ts:16-25)

Nine entries: `mcp`, `pdf`, `rag`, `ta`, `macro`, `stock`, `kinh-dich`, `alert`. No `api`
entry. Registry is `StaticServiceRegistry` (infrastructure/health_checker.ts:43) backed by
a plain `Record<string, ServiceConfig>`.

### Header pass-through (handlers.ts:64-68)

```typescript
const upstream = await fetch(targetUrl, {
  headers: c.req.raw.headers,   // ← all headers forwarded verbatim
  ...
```

`Authorization` / `x-api-key` pass through unchanged. No stripping, no injection. This is
correct and must be preserved.

### Path rewrite semantics

Current proxy strips the service prefix:
```
c.req.path  = /:service/rest/of/path
path        = /rest/of/path           (slice(2))
targetUrl   = svc.baseUrl + path
```

MCP server expects verbatim `/api/push-news` and `/api/health/vps-news`. Therefore any
solution must forward with the `/api/...` portion intact (not strip it).

### Existing push endpoints on MCP server (from 1892a c44)

- `POST /api/push-news` — auth required (x-api-key)
- `GET  /api/health/vps-news` — no auth required

Both exist in `apps/mcp-server/src/interface/mcp/server.ts` and extracted handlers (1892a).

---

## Decision: Approach 2 — Register `api` as a virtual service in StaticServiceRegistry

### Options evaluated

| Option | Description | Verdict |
|--------|-------------|---------|
| A — Prefix-match `/api/*` as a separate Hono route | New wildcard before the `/:service/*` catch-all. Requires hardcoding MCP URL in the route handler, outside the registry. Breaks the registry as SSOT. | Rejected — DDD violation: infra config leaks into interface layer |
| B — Register `api` as a virtual service pointing to `mcp-server:3000` | One-line addition to `serviceUrls` in `index.ts`. Reuses all existing proxy logic, header pass-through, timeout, error handling. Path rewrite: `/api/push-news` → strips `:service=api` → `/push-news` forwarded. WRONG — MCP expects `/api/push-news`, not `/push-news`. Needs path fix. | Partially correct — needs path rewrite adjustment (see below) |
| C — Explicit per-endpoint route table | Register routes like `app.post('/api/push-news', ...)` manually. No scalability — every new VPS push endpoint requires a gateway edit. | Rejected — unmaintainable, contradicts the registry pattern |
| D — Register `api` as virtual service + fix path rewrite for `api` service | Same as B but `StaticServiceRegistry` includes `api` with `baseUrl=http://mcp-server:3000` and the proxy forwards the full `/api/*` path verbatim. Clean, zero new code patterns. | **SELECTED** |

### Rationale for Option D

The existing pattern `/:service/*` → strip service prefix → forward remainder is correct for
all named services because, e.g., `/mcp/health` → `/health` on `mcp-server:3000`. However,
`api` is a virtual namespace, not a service prefix the MCP server recognizes. MCP server
expects the full `/api/push-news` path. The gateway must NOT strip the `/api` segment.

The cleanest solution: add `api` to the registry with a path-rewrite flag, OR register `api`
as a virtual service and change the proxy to forward the full path when `service === 'api'`.

Simpler still: extract a `proxyPath(service, reqPath)` helper that returns:
- `reqPath` verbatim when `service === 'api'` (passthrough mode)
- `'/' + reqPath.split('/').slice(2).join('/')` for all other services (current behaviour)

This is a 4-line change in `handlers.ts` and a 1-line addition in `index.ts`. Zero new
abstractions. Fully consistent with existing patterns.

**Precedent**: All 9 existing services follow the strip-prefix pattern. `api` is the first
virtual namespace that maps to `mcp-server` at a sub-path. The passthrough flag is the
minimum-friction extension.

---

## Acceptance Criteria

**AC-1 — Gateway routes `/api/push-news` to MCP server**
`POST /api/push-news` through the gateway with a valid `x-api-key` header returns HTTP 200
and a JSON body with `ok: true`. MCP server receives the request at the correct path.

**AC-2 — Gateway routes `/api/health/vps-news` to MCP server**
`GET /api/health/vps-news` through the gateway (no auth header) returns HTTP 200 and a JSON
body with `{ service: 'news', healthy: boolean, ... }`. No auth header is injected by the
gateway.

**AC-3 — Existing `/:service/*` routes are unaffected**
`GET /mcp/health`, `GET /stock/health`, `GET /ta/health` (and all other 9 registered
services) continue to return their correct responses. Path stripping behaviour is unchanged
for all services other than `api`.

**AC-4 — Unauthorized push-news returns 401 through the gateway**
`POST /api/push-news` with a missing or incorrect `x-api-key` returns HTTP 401. Auth
validation occurs in the MCP server (not the gateway). Gateway passes the header unchanged.

**AC-5 — `api` service registered with MCP URL env override**
The `api` entry in `serviceUrls` reads `process.env['MCP_URL'] ?? 'http://mcp-server:3000'`.
No new env var needed — shares the same `MCP_URL` env that `mcp` already uses.

---

## Test Plan

**File:** `apps/api-gateway/src/__tests__/1892b-api-push-routes.test.ts`

All tests use the `createRouter()` pattern established in `1841a-health-dashboard.test.ts`:
construct the Hono app via `createRouter()` with mock use-cases and a real or stub registry.
For proxy tests, stub `fetch` using Bun's `mock.module` to avoid real HTTP calls.

| Test name | What it asserts | AC |
|-----------|-----------------|-----|
| `routes POST /api/push-news to mcp-server with full path` | Stubbed fetch called with URL `http://mcp-server:3000/api/push-news`, method POST, x-api-key forwarded | AC-1 |
| `returns 200 for valid push-news payload` | Gateway response status === 200 when stub returns 200 | AC-1 |
| `routes GET /api/health/vps-news to mcp-server verbatim` | Stub fetch called with `http://mcp-server:3000/api/health/vps-news`, no added headers | AC-2 |
| `returns 401 passthrough for invalid api key` | Stub returns 401; gateway response status === 401 | AC-4 |
| `existing /mcp/* route still strips service prefix` | Stub fetch called with `http://mcp-server:3000/health` (not `/mcp/health`) for GET /mcp/health | AC-3 |
| `existing /stock/* route unaffected` | Stub fetch called with `http://stock-price:5000/health` for GET /stock/health | AC-3 |
| `unknown service still returns 404` | GET /unknown/foo returns `{ error: "Unknown service: unknown" }` with status 404 | AC-3 |
| `GET /api/health/vps-news does not inject Authorization header` | Stub captures request headers; no Authorization header present when not sent by caller | AC-2 |

---

## File Change List

| Action | File | Est. LOC delta |
|--------|------|----------------|
| MODIFY | `apps/api-gateway/src/index.ts` | +2 (add `api` entry to `serviceUrls`, sharing `MCP_URL`) |
| MODIFY | `apps/api-gateway/src/interface/handlers.ts` | +8 (extract `proxyPath()` helper, replace inline path calc, add passthrough for `api` service) |
| MODIFY | `apps/api-gateway/src/infrastructure/health_checker.ts` | +2 (add `api` to `buildServiceConfigs`, same timeout, no healthPath needed — optional: can omit from health check loop, see Risk R2) |
| CREATE | `apps/api-gateway/src/__tests__/1892b-api-push-routes.test.ts` | ~120 |

**Total production change: ~12 LOC across 3 existing files.**

---

## Implementation Notes for Developer

### handlers.ts — path rewrite change

Replace the inline path computation at line 59:

```typescript
// BEFORE (line 59):
const path = '/' + c.req.path.split('/').slice(2).join('/');

// AFTER — extract helper:
function proxyPath(serviceName: string, reqPath: string): string {
  if (serviceName === 'api') return reqPath;          // passthrough — keep /api/...
  return '/' + reqPath.split('/').slice(2).join('/'); // strip /:service prefix
}
// usage:
const path = proxyPath(serviceName, c.req.path);
```

### index.ts — service URL addition

```typescript
const serviceUrls: Record<string, string> = {
  api:        process.env['MCP_URL']        ?? 'http://mcp-server:3000',  // ← add
  mcp:        process.env['MCP_URL']        ?? 'http://mcp-server:3000',
  // ... rest unchanged
};
```

### health_checker.ts — registry addition

Add `api` entry to `buildServiceConfigs`. No health check is strictly needed for the virtual
`api` service (it shares health with `mcp`), but omitting it means `registry.getService('api')`
would return undefined if only `getAllServices()` is used. Options:

- Include `api` with `healthPath: '/health'` and `timeoutMs: timeout` (it will appear as a
  second `mcp` entry in the health aggregate — see Risk R2 below).
- Or: skip adding to `buildServiceConfigs` and add a bare `ServiceConfig`-compatible object
  directly in `StaticServiceRegistry.services` without the health path. Developer chooses
  the simpler path.

**Recommended:** include in `buildServiceConfigs` with `healthPath: '/health'` to keep the
registry implementation uniform. The health dashboard lists services from `DASHBOARD_SERVICES`
constant (handlers.ts:87-89) which is a separate hardcoded array — `api` does NOT need to
be added there to avoid a duplicate MCP card on the dashboard.

---

## Risk Callouts

| Risk | Severity | Mitigation |
|------|----------|------------|
| R1 — Regression on 9 existing service routes | HIGH | `proxyPath()` only changes behaviour when `serviceName === 'api'`; all other services use existing `slice(2)` path. Test suite (AC-3 tests) must cover at least `/mcp/*` and `/stock/*` patterns. |
| R2 — Duplicate `mcp` health entry if `api` is added to health checker | LOW | `DASHBOARD_SERVICES` in handlers.ts:87 is a separate hardcoded array. `api` entry in registry does not appear in dashboard unless explicitly added there. Health aggregate calls `getAllServices()` — if `api` is included it will make a second health call to `mcp-server:3000/health`. Acceptable (idempotent). If undesirable, exclude `api` from `getAllServices()` by making `buildServiceConfigs` return it as a proxy-only entry. |
| R3 — Auth injection concern on `/api/health/vps-news` | LOW | Gateway uses `c.req.raw.headers` verbatim — no header injection occurs. Confirmed by code read. Test AC-2 / test 8 explicitly asserts no spurious Authorization header. |
| R4 — Future push endpoints require no gateway change | POSITIVE | Any new `POST /api/push-*` endpoint added to MCP server is automatically routed once the `api` service is registered. This is the scalability win of Option D over Option C. |
| R5 — `api` service entry shares `MCP_URL` env var | LOW | `mcp` and `api` both resolve to the same container. A `MCP_URL` change affects both identically. Acceptable — they are the same downstream target. |

---

## DDD Layer Compliance

- `index.ts` is the composition root (infrastructure wiring) — adding a URL entry here is correct.
- `handlers.ts` is the interface layer — `proxyPath()` helper is pure routing logic, belongs here.
- `health_checker.ts` is infrastructure — adding a service config entry is correct.
- No domain logic is touched. No new abstractions required.

---

## Out of Scope

- Load balancing or circuit-breaking on the `api` virtual service.
- Authentication at the gateway layer (auth stays in MCP server per existing pattern).
- Removing the inline `/api/push-news` block from `server.ts` (that is 1892a AC-6, separate task).
- VPS script changes (1892a AC-7).

---

## Baseline

- **baseline_pass:** 8804 (confirmed by PO)
- All 1892b tests must pass without regressing this count.
- New tests in `1892b-api-push-routes.test.ts` will bring the total above 8804.
