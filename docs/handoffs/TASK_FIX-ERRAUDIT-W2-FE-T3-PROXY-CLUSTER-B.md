---
task_id: FIX-ERRAUDIT-W2-FE-T3-PROXY-CLUSTER-B
type: sprint-task
title: T-3 Migrate Cluster B - 29 api.*.tsx proxy routes
epic: FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH
zone: apps/frontend/
owner: dev-frontend
size: M
created_at: 2026-06-16T07:00:00Z
created_by: pm
depends_on: [FIX-ERRAUDIT-W2-FE-T1-FETCHUTILS-CREATE]
---

## Summary

Migrate all 29 `apps/frontend/app/routes/api.*.tsx` proxy routes from inline `try/fetch/catch` blocks to the bounded `proxyUpstream` helper. Each proxy forwards HTTP calls from the frontend to mcp-server; migration adds a 55s deadline (fires before gateway ceiling) and returns 504 on deadline abort (vs existing 502 on all errors).

## Target Files (29 total)

All files matching `apps/frontend/app/routes/api.*.tsx` pattern:

1. `api.agm-plan-actual.tsx`
2. `api.alerts.tsx` (reference implementation)
3. `api.analysis-brief.$ticker.tsx`
4. `api.analysis-briefs.tsx`
5. `api.bctc-eval.$.tsx` (splat route; binary buffer safe)
6. `api.bctc-inspect.$.tsx` (splat route; HTML relay — **EXCLUDED from this task**, see notes)
7. `api.conviction-history.tsx`
8. `api.corporate-events.tsx`
9. `api.fed-rates.tsx`
10. `api.financials.tsx`
11. `api.foreign-flow.tsx`
12. `api.global-markets.tsx`
13. `api.kinh-dich-signals.tsx`
14. `api.kinh-dich.reading.$code.tsx`
15. `api.macro-regime.tsx`
16. `api.market-digest.tsx`
17. `api.market-summaries.tsx`
18. `api.news-buzz.tsx`
19. `api.news-sentiment.tsx`
20. `api.officers.tsx`
21. `api.orchestration.tsx`
22. `api.prediction-claims.tsx`
23. `api.price-history.$ticker.tsx`
24. `api.quality-checklist.tsx`
25. `api.reputation.tsx`
26. `api.sector-cascade.tsx`
27. `api.sector-rotation.tsx`
28. `api.shareholders.tsx`
29. `api.vps-proxy-health.tsx`

**EXCLUSION:** `api.bctc-inspect.$.tsx` — This proxies raw HTML (not JSON). Its error contract is incompatible with `proxyUpstream` (which returns JSON errors). Do NOT migrate this file in this task. It is marked for separate design if needed.

## Acceptance Criteria

### Pattern Transformation (applies to all 29 files)

**Before (existing pattern):**
```ts
import { LoaderFunctionArgs } from '@remix-run/node';

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const qs = url.searchParams.toString(); // may be empty
  const upstream = `${MCP_SERVER_BASE_URL}/api/xxx${qs ? `?${qs}` : ''}`;
  
  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(upstream, {
      method: 'GET',
      headers: { Accept: 'application/json' }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: `Proxy error: ${message}` }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  const body = await upstreamResponse.arrayBuffer();
  return new Response(body, {
    status: upstreamResponse.status,
    headers: { 'Content-Type': upstreamResponse.headers.get('Content-Type') ?? 'application/json' }
  });
}
```

**After (proxyUpstream pattern):**
```ts
import { LoaderFunctionArgs } from '@remix-run/node';
import { proxyUpstream } from '~/lib/api/fetchUtils';

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const qs = url.searchParams.toString(); // unchanged
  const upstream = `${MCP_SERVER_BASE_URL}/api/xxx${qs ? `?${qs}` : ''}`;
  
  return proxyUpstream(
    upstream,
    { method: 'GET', headers: { Accept: 'application/json' } },
    { label: 'api.xxx' }
  );
}
```

**Key transformation rules:**
- Remove all `try/catch` and `upstreamResponse` variable handling
- Build `upstream` URL as before (no change to query param forwarding — EC-3)
- Import `proxyUpstream` from `~/lib/api/fetchUtils`
- Call `proxyUpstream(upstream, init, { label: 'api.xxx' })` and return directly
- `label` should match the route name (e.g., `'api.alerts'`, `'api.macro-regime'`, etc.)
- `init` parameter passes through the same headers/method as before

### File-by-file Requirements

- [ ] All 29 routes migrated (excluding `api.bctc-inspect.$.tsx`)
- [ ] Import statement added: `import { proxyUpstream } from '~/lib/api/fetchUtils';`
- [ ] Each loader function body shrinks from ~15–20 lines to ~5 lines
- [ ] Query parameter handling preserved exactly (upstream URL building unchanged)
- [ ] `init` parameter structure matches original (method, headers, etc.)
- [ ] `label` option set to route name (lowercase, dot-separated, e.g., `'api.price-history'`)
- [ ] No functionality change from caller's perspective (return value is `Response` in both cases)

### Special Cases

**Query-parameter-forwarding routes (all 29 forward params — unchanged):**
- The existing pattern in each route builds the `upstream` URL with query params before calling `fetch`
- After migration, this URL building is unchanged — `proxyUpstream` receives a fully-formed `upstream` string
- EC-3 verified: `proxyUpstream` does NOT forward params; caller builds the URL

**Content-Type relay (binary-safe — unchanged):**
- `proxyUpstream` internally uses `arrayBuffer()` to relay the upstream body (binary-safe per EC-4)
- Routes serving JSON (`application/json`), binary buffers, or other Content-Types are all safe
- Example: `api.bctc-eval.$.tsx` serves binary evaluation PDFs — the `arrayBuffer()` relay is safe

**Splat routes (`api.bctc-eval.$.tsx`, `api.price-history.$ticker.tsx`, etc.):**
- These routes include dynamic path parameters (e.g., `:$`)
- Migration is identical in pattern — the `upstream` URL includes the splat param (already done by existing code)
- Dev-frontend confirms the URL building logic is unchanged post-migration

## Behavior Changes (observable by QA)

| Scenario | Before | After |
|---|---|---|
| Upstream responds normally | Relayed 2xx + body | Relayed 2xx + body (unchanged) |
| Upstream times out (TCP hang) | Browser waits until gateway timeout (~60s), 504 or 502 | Returns 504 `{ error: 'upstream timeout' }` within 55s (NEW — more accurate) |
| Upstream connection refused | 502 `{ error: '...' }` (immediately) | 502 `{ error: '...' }` (unchanged) |
| Upstream returns 5xx | Relayed 5xx + body | Relayed 5xx + body (unchanged) |

**Deadline Logic:**
- Frontend loader's `safeFetch` starts a 55s timer when calling the proxy route
- Proxy's `proxyUpstream` starts its own 55s timer when calling mcp-server
- Both timers are independent (not coordinated)
- In worst case: proxy deadline fires at 55s → returns 504 → loader receives 504 at <55s → loader's timeout does not fire
- This is the correct behavior (inner deadline fires first per the deadline strategy in architect design)

## Test Gate (QA Ownership)

- [ ] All 29 routes respond normally with live data when mcp-server is healthy
- [ ] Query params forwarded correctly (e.g., `/api/alerts?ticker=VNM` reaches mcp-server with same params)
- [ ] With mcp-server hung (block port 3000): each route returns 504 `{ error: 'upstream timeout' }` within 55s
- [ ] With mcp-server stopped (connection refused): each route returns 502 `{ error: '...' }` immediately
- [ ] `api.bctc-eval.$.tsx` still serves binary PDF buffers correctly (Content-Type relay works)
- [ ] `pnpm check` passes (zero TypeScript errors)

## Code Review Gate

- [ ] No `try/catch` block remains in any loader function
- [ ] All 29 files have the import statement
- [ ] Query param forwarding logic is preserved (unchanged) in each file
- [ ] All loaders return the result of `proxyUpstream(...)` directly
- [ ] `label` parameter follows naming convention (lowercase, route name)

## Next Step (on completion)

- Code complete + local test → ready for T-5 (validation gate)
- Can run in parallel with T-2 and T-4 (disjoint files)

## Reference

- Architect blueprint: `docs/handoffs/FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH-architect-design.md` § D-3 (lines 428–448)
- BA spec: `docs/handoffs/FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH-BA-spec.md` § Cluster B migration (lines 301–333)
- Reference implementation: `apps/frontend/app/routes/api.alerts.tsx` (canonical pattern)

## Notes

**`api.bctc-inspect.$.tsx` exclusion:**
This file is a resource route that proxies raw HTML (Content-Type: text/html), not JSON. Its error path returns an HTML error page, not JSON. The `proxyUpstream` helper returns JSON errors (504/502), which is incompatible with the existing HTML relay. This route is excluded from T-3 and tracked as a separate design item (follow-on task, outside this sprint). Do NOT touch `api.bctc-inspect.$.tsx` in this task.
