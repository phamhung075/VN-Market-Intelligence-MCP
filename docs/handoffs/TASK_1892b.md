# TASK 1892b — API Gateway Push Routes

**Assigned to:** dev-api-gateway  
**Branch:** `task/1892b-api-gateway-push-routes`  
**Sprint:** 1892b  
**Effort:** S (~2h single developer, one atomic ship)  
**Spec:** `docs/specs/1892b-api-gateway-push-routes-arch-spec.md`  
**Baseline:** 8804 tests passing  

---

## Problem Summary

`POST https://zenmidi.com/api/push-news` returns 404 at the API Gateway.
Gateway proxy rule at `apps/api-gateway/src/interface/handlers.ts:50` matches `/:service/*` and requires a registered service name. The bare `/api/*` path has no registered `api` service, so requests fall through with "Unknown service: api" 404 error.

**Impact:** News ingestion via VPS has been at zero since Vinahost migration (2026-04-13). MCP server handles the request correctly on localhost:3000, but the public gateway blocks it.

---

## Solution — Option D: Virtual Service + Path Helper

Register `api` as a virtual service pointing to MCP_URL in the StaticServiceRegistry. Extract a `proxyPath()` helper in handlers.ts that:
- Returns `reqPath` verbatim when `serviceName === 'api'` (passthrough mode)
- Returns the normal `'/' + reqPath.split('/').slice(2).join('/')` for all other 9 services (existing behavior)

**Rationale:** The existing `/:service/*` → strip-prefix pattern is correct for named services (e.g., `/mcp/health` → `/health` on mcp-server). But `api` is a virtual namespace; MCP expects the full `/api/push-news` path. Minimum-friction fix: passthrough flag on the `api` service entry.

---

## Files to Modify

| File | Change | LOC |
|------|--------|-----|
| `apps/api-gateway/src/index.ts` | Add `api` entry to `serviceUrls` record, sharing `process.env['MCP_URL'] ?? 'http://mcp-server:3000'` | +2 |
| `apps/api-gateway/src/interface/handlers.ts` | Extract `proxyPath(serviceName, reqPath)` helper (4 lines) + replace inline path calc at line 59 | +8 |
| `apps/api-gateway/src/infrastructure/health_checker.ts` | Add `api` entry to `buildServiceConfigs` (keeps registry uniform) | +2 |
| `apps/api-gateway/src/__tests__/1892b-api-push-routes.test.ts` | New file: 8 integration tests | ~120 |

**Total production change: ~12 LOC across 3 existing files.**

---

## Acceptance Criteria

**AC-1 — Gateway routes `/api/push-news` to MCP server**  
POST /api/push-news through the gateway with a valid x-api-key header returns HTTP 200 and JSON body with `ok: true`. MCP server receives the request at the correct full path.

**AC-2 — Gateway routes `/api/health/vps-news` to MCP server**  
GET /api/health/vps-news through the gateway (no auth header) returns HTTP 200 and correct health JSON. No spurious Authorization header is injected by the gateway.

**AC-3 — Existing `/:service/*` routes unaffected**  
GET /mcp/health, GET /stock/health, GET /ta/health (and all 9 other registered services) continue to return correct responses. Path stripping behavior unchanged for services other than `api`.

**AC-4 — Unauthorized push-news returns 401 passthrough**  
POST /api/push-news with missing/incorrect x-api-key returns HTTP 401. Auth validation occurs in MCP server, gateway passes headers unchanged.

**AC-5 — `api` service registered with MCP URL env override**  
The `api` entry in `serviceUrls` reads `process.env['MCP_URL'] ?? 'http://mcp-server:3000'`. Shares same `MCP_URL` env as `mcp` entry.

---

## Test Plan

**File:** `apps/api-gateway/src/__tests__/1892b-api-push-routes.test.ts`

Use `createRouter()` pattern from 1841a-health-dashboard.test.ts. Stub `fetch` via Bun mock.module to avoid real HTTP calls.

| Test | AC |
|------|-----|
| routes POST /api/push-news to mcp-server with full path | AC-1 |
| returns 200 for valid push-news payload | AC-1 |
| routes GET /api/health/vps-news to mcp-server verbatim | AC-2 |
| returns 401 passthrough for invalid api key | AC-4 |
| existing /mcp/* route still strips service prefix | AC-3 |
| existing /stock/* route unaffected | AC-3 |
| unknown service still returns 404 | AC-3 |
| GET /api/health/vps-news does not inject Authorization header | AC-2 |

---

## Implementation Notes

### handlers.ts — path rewrite

Replace inline path computation at line 59:

```typescript
// BEFORE:
const path = '/' + c.req.path.split('/').slice(2).join('/');

// AFTER:
function proxyPath(serviceName: string, reqPath: string): string {
  if (serviceName === 'api') return reqPath;          // passthrough
  return '/' + reqPath.split('/').slice(2).join('/'); // strip /:service
}
const path = proxyPath(serviceName, c.req.path);
```

### index.ts — service URL

```typescript
const serviceUrls: Record<string, string> = {
  api:        process.env['MCP_URL']        ?? 'http://mcp-server:3000',  // ← add
  mcp:        process.env['MCP_URL']        ?? 'http://mcp-server:3000',
  // ... rest unchanged
};
```

### health_checker.ts — registry

Add `api` entry to `buildServiceConfigs` with `healthPath: '/health'` and standard timeout. (Optional: `api` does not need to appear in `DASHBOARD_SERVICES` constant — health dashboard will deduplicate, no UI issue.)

---

## Risk Callouts

| Risk | Severity | Mitigation |
|------|----------|------------|
| R1 — Regression on 9 existing routes | HIGH | `proxyPath()` only changes behavior when `serviceName === 'api'`. All other services unchanged. AC-3 tests cover `/mcp/*` and `/stock/*` patterns. |
| R2 — Duplicate MCP health entry | LOW | `DASHBOARD_SERVICES` is separate hardcoded array. `api` in registry does not auto-add to dashboard. |
| R3 — Auth injection on /api/health/vps-news | LOW | Gateway passes `c.req.raw.headers` verbatim — no injection. Test AC-2 / test 8 explicitly asserts no spurious Authorization header. |
| R4 — Future push endpoints | POSITIVE | Any new `POST /api/push-*` added to MCP server is automatically routed once `api` service is registered. Scalability win. |
| R5 — MCP_URL env collision | LOW | Both `mcp` and `api` resolve to same container — identical target. `MCP_URL` change affects both correctly. |

---

## DDD Layer Compliance

- **index.ts** (composition root / infrastructure wiring) — URL entry is correct here
- **handlers.ts** (interface layer) — `proxyPath()` is pure routing logic, belongs here
- **health_checker.ts** (infrastructure) — service config entry is correct
- **No domain logic touched** — zero new abstractions

---

## Dependencies

- **Unblocks:** 1892a-ops AC-3 + AC-4 final pass (news ingestion pipeline)
- **Independent of:** 1888a (different zones: api-gateway code vs. agent docs)
- **Parallel dispatch:** Yes — with 1888a via `isolation: "worktree"` per docs/policies/dev-standards.md

---

## Out of Scope

- Load balancing or circuit-breaking on `api` virtual service
- Authentication at gateway layer (stays in MCP server per existing pattern)
- Removing inline `/api/push-news` block from `server.ts` (1892a AC-6, separate task)
- VPS script changes (1892a AC-7)

---

## Ship Checklist

- [ ] All 8 tests pass in `1892b-api-push-routes.test.ts`
- [ ] Baseline 8804 tests still passing
- [ ] TSC 0 errors
- [ ] AC-1 through AC-5 verified in test assertions
- [ ] Regression tests for AC-3 (existing routes unchanged) green
- [ ] Commit: `feat(1892b/api-gateway): add /api/push-* passthrough routes`
- [ ] Branch: `task/1892b-api-gateway-push-routes`
