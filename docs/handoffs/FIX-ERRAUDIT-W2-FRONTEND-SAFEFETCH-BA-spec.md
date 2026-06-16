<!-- size-justification: Wave-2 frontend safeFetch spec — 3 helper exports + 3 migration clusters (26 dashboard loaders, 29 api-proxy routes, 4 non-fatal client wrappers), full DDD layer map, atomic task breakdown, edge cases, forced-failure DoD. Structural load-bearing for architect+pm+dev-frontend+qa chain. -->

# BA Spec — FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH

**Epic:** ERROR-AUDIT-2026-06-15 · Wave 2
**Zone:** `apps/frontend/`
**Chain:** ba → architect → pm → dev-frontend → qa
**BA task_id:** FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH
**Dependency:** FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE (done_verified — inner fetch hops are bounded first)
**Created:** 2026-06-16T06:00:00Z
**Status:** SPEC COMPLETE — ZERO PO BLOCKERS

---

## Summary

The audit brief (`docs/analysis-briefs/2026-06-15-error-handling-audit.md`, section **frontend-cluster**) catalogued a three-class problem in `apps/frontend`:

1. **frontend-01/02 — Unbounded fetch, no `AbortSignal`:** Not one of ~60 fetch sites in the frontend carries a deadline. The Remix dashboard loaders each call the frontend-origin `/api/*` proxy; those proxies forward to `mcp-server:3000`; the mcp-server tools (now bounded by W2-MCP-FETCH-DEADLINE) call upstream. The outer two hops (loader → proxy, proxy → mcp-server) have no timeout — a hang at any layer still starves the degrade path and eventually causes a blank render or silent hang for the user.

2. **frontend-04 — Duplication / inconsistent-adhoc:** The same ~40-line loader fetch-and-parse block is copy-pasted ~55 times across `apps/frontend/app/routes/dashboard.*.tsx`. When a bug is in the pattern (e.g., missing deadline, missing error log), it exists in every copy at once.

3. **frontend-06 — Zero server-side logging:** No server-side `console.error` fires on a fetch degrade in the live frontend. A loader timeout or upstream 502 is completely silent in the Node process log — impossible to distinguish from a healthy empty response without a client-side breadcrumb.

4. **frontend-07 — Non-fatal bare-catch wrappers:** Four functions in `apps/frontend/app/lib/api/client.ts` catch errors and return `null`/`[]`/`{}` with no log. These are intentionally non-fatal (they enrich optional data in the watchlist tile loop), but they silently swallow network errors and deadline hangs alike — no attribution line, so a persistent hang is invisible.

This Wave-2 fix does THREE things atomically:

1. **Land one new file** — `apps/frontend/app/lib/api/fetchUtils.ts` — exporting three typed helpers: `safeFetch<T>`, `proxyUpstream`, and `safeFetchOrNull<T>`.
2. **Migrate the ~26 dashboard loader fetch sites** to `safeFetch<T>` (one bounded fetch + one structured `console.error` per degrade).
3. **Migrate the ~29 `api.*.tsx` proxy routes** to `proxyUpstream` (one bounded proxy call, 504 on deadline, 502 on network error).
4. **Migrate the 4 non-fatal client wrappers** in `client.ts` to `safeFetchOrNull<T>` (preserves null/[]/`{}` degrade contract, adds attribution log, adds deadline).

The implementation is `dev-frontend` only. No mcp-server, no Python, no other zone.

**Sequence constraint (HARD):** This task sequences AFTER W2-MCP-FETCH-DEADLINE (done_verified). The inner-first rule: mcp-server bounded fetches ship first; the frontend timeout must be larger than the mcp-server's inner deadline so the inner-hop degrade fires before the outer hop's deadline aborts. Concretely: if mcp-server deadlines internal calls at 15–45s, the frontend's `DEADLINE_MS` must be set to 55_000ms (below the gateway 60s ceiling but above the mcp-server's longest inner deadline of 45s for bctcPdfPullJob).

---

## Catalogued Frontend Sites (from audit brief)

The audit brief groups the frontend finding as one `frontend-cluster` entry (the last row in the P2 table). It identifies four sub-findings:

| Audit ID | Site | Lines | Antipattern | Count |
|---|---|---|---|---|
| frontend-01 | `apps/frontend/app/lib/api/client.ts:40` (base `apiGet`) | :40 | unbounded-fetch-hang — no `AbortSignal` | 1 base fn |
| frontend-02 | All `dashboard.*.tsx` loaders + `api.*.tsx` proxy routes | ~60 fetch sites | unbounded-fetch-hang — no `AbortSignal` on each fetch | ~60 sites |
| frontend-04 | `dashboard.*.tsx` loaders | ~55 blocks | inconsistent-adhoc — ~40-line try/fetch/parse block duplicated × 55 | ~55 copies |
| frontend-06 | All frontend server-side fetch paths | entire zone | zero server-side logging | entire zone |
| frontend-07 | `client.ts` non-fatal wrappers | 4 functions | bare-catch-to-null/[]/`{}` | 4 wrappers |

**frontend-05 was dropped** (verdict false — `toAgentSignal` `:0` path is unreachable on the single live endpoint).

### frontend-01 / frontend-02 — The two unbounded hops

`client.ts:40` defines `apiGet<T>` as the base fetch function. It calls `fetch(url, { headers: ... })` — bare, no `AbortSignal`. Every named function in `client.ts` that calls `apiGet` inherits this unbounded fetch. Additionally, the ~29 `api.*.tsx` resource routes each do `fetch(upstream, { method: 'GET', ... })` — also bare.

The two-hop chain is:
```
User browser → Remix loader (dashboard.*.tsx) calls /api/* on same origin (:3001)
             → api.*.tsx proxy calls mcp-server:3000 (no timeout)
             → mcp-server calls upstream (NOW bounded by W2-MCP-FETCH-DEADLINE)
```

Bounding the inner hop (mcp-server) without bounding the outer two hops (loader + proxy) only partially fixes the problem: a hang at the proxy→mcp-server TCP layer itself (not the mcp-server internal fetch) can still propagate up to the loader and produce a blank render.

### frontend-04 — The copy-paste pattern

A representative loader block (from `dashboard.alerts.tsx:110-146`) is:
```ts
try {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    error = `Upstream returned ${response.status} ...`;
  } else {
    const raw = await response.json() as unknown;
    // shape check...
  }
} catch (err) {
  error = err instanceof Error ? err.message : 'Không thể kết nối...';
}
```

This same pattern appears in each of the ~26 dashboard loaders' named fetch helpers (e.g., `fetchAlertsData`, `fetchIntelData`, etc.). The structural bugs (no deadline, no `console.error`) exist in every copy simultaneously.

### frontend-07 — Non-fatal client wrappers (4 functions)

Four functions in `client.ts` catch all errors and return a safe default silently:

| Function | Line | Degrade return | Comment in code |
|---|---|---|---|
| `fetchKinhDichReadingNonFatal` | :283 | `null` | "Non-fatal — callers should catch and treat as null" |
| `fetchWatchlistPrices` | :494 | `{}` | Outer catch on batch price fetch |
| `fetchCascadeSignals` | :550 | `[]` | Outer catch |
| `fetchAccuracyDigest` | :578 | `null` | "Non-fatal — callers should catch and treat as null" |

All four have a bare `catch { return null/[]/`{}` }` (no error logged, no deadline). The non-fatal degrade contract (null/[]/`{}` on any failure) is intentional and must be preserved. The bug is: a silent hang starves the degrade path — the timer never fires, the catch never runs, the loader waits indefinitely.

---

## Deliverables

### D-1 — New file: `apps/frontend/app/lib/api/fetchUtils.ts`

Three exports:

```ts
// Deadline constant — single SSOT for the entire frontend fetch budget
export const FETCH_DEADLINE_MS = 55_000; // 55s < 60s gateway ceiling; > 45s inner mcp-server deadline

// 1. For dashboard loaders — bounded fetch + structured parse + degrade log
export async function safeFetch<T>(
  url: string,
  parse: (raw: unknown) => T,
  opts?: { deadlineMs?: number; label?: string }
): Promise<{ data: T; error: string | null }>

// 2. For api.*.tsx proxy routes — bounded proxy call + 504 on deadline + 502 on network error
export async function proxyUpstream(
  upstream: string,
  init?: RequestInit,
  opts?: { deadlineMs?: number; label?: string }
): Promise<Response>

// 3. For non-fatal client.ts wrappers — bounded fetch + degrade to T on any error
export async function safeFetchOrNull<T>(
  url: string,
  parse: (raw: unknown) => T | null,
  opts?: { deadlineMs?: number; label?: string }
): Promise<T | null>
```

`FETCH_DEADLINE_MS` is the single constant — no per-site hardcoded values. All three helpers default to `FETCH_DEADLINE_MS` when `opts.deadlineMs` is not supplied.

### D-2 — Migration of ~26 dashboard loader fetch sites

Each `dashboard.*.tsx` named fetch helper (e.g., `fetchAlertsData`, `fetchIntelData`, the named helper in each loader file) replaces its ~40-line try/fetch/parse block with one call to `safeFetch<T>(url, parseRawShape)`.

### D-3 — Migration of ~29 `api.*.tsx` proxy routes

Each proxy route's `fetch(upstream, ...)` call (and surrounding try/catch returning 502) is replaced with `proxyUpstream(upstream)`. The proxy's existing 502-on-catch behavior is preserved; a deadline abort returns 504 instead.

### D-4 — Migration of 4 non-fatal client wrappers

`fetchKinhDichReadingNonFatal`, `fetchWatchlistPrices`, `fetchCascadeSignals`, and `fetchAccuracyDigest` each replace their bare `catch { return null/[]/`{}` }` with `safeFetchOrNull<T>(url, parse)`.

---

## FR Catalog

### FR-1 — `FETCH_DEADLINE_MS` constant

**What it must be:**
- A single `export const FETCH_DEADLINE_MS = 55_000` in `fetchUtils.ts`.
- 55_000ms: strictly below the 60s gateway ceiling; strictly above the longest mcp-server inner deadline (45s for `bctcPdfPullJob`). This ensures the inner hop degrades before the outer hop times out.
- NO per-site, per-route, per-ticker, or per-hour special-case. One constant, one file, one truth.
- Callers that need a shorter budget (e.g., the non-fatal enrichment loop which is best-effort) may pass `opts.deadlineMs` explicitly, but the default must be `FETCH_DEADLINE_MS`.

### FR-2 — `safeFetch<T>` — dashboard loader helper

**What it must do:**
- Create an `AbortController`. Arm `setTimeout(() => controller.abort(), deadlineMs)`. Pass `controller.signal` to the inner `fetch`.
- In a `finally` block: `clearTimeout(timerId)` — always clean up (mirrors `withDeadline` pattern from W2-MCP-FETCH-DEADLINE).
- If the response is non-2xx: set `error = "Upstream ${status}"` + call `console.error` one attribution line: `[safeFetch][${label ?? url}] upstream ${status}`.
- If the fetch throws (including `AbortError`): set `error = err.message` + call `console.error`: `[safeFetch][${label ?? url}] ${err.name}: ${err.message}`.
- On abort specifically: the `console.error` must read `[safeFetch][label] AbortError: fetch aborted after ${deadlineMs}ms` (deadline attribution).
- Call the caller-supplied `parse(raw)` on the response JSON only on 2xx. If `parse` throws, treat as an error: `console.error` + `return { data: emptyValue, error: 'parse error' }`. The empty value comes from the `parse` function's error path — callers supply the empty-T shape.
- Return `{ data: T; error: string | null }` — NEVER throw. The loader always gets a typed result; `error !== null` means degrade.
- MUST NOT fabricate a success result or suppress the error string. `{ data: emptyT, error: 'reason' }` is the honest degrade shape.

**Signature note:** The `parse` parameter means callers do NOT need to replicate the shape-check logic inline. Each loader's existing shape-check (`'items' in raw`, `Array.isArray(raw.rows)`, etc.) moves into a named `parseXxx(raw: unknown): XxxDto` function. The loader becomes: `const { data, error } = await safeFetch<XxxDto>(url, parseXxx, { label: 'dashboard.xxx' })`.

### FR-3 — `proxyUpstream` — api proxy helper

**What it must do:**
- Accept `upstream: string`, optional `init?: RequestInit`, optional `opts`.
- Create `AbortController` + `setTimeout(deadlineMs)`. Pass `controller.signal` merged into `init?.signal ?? controller.signal`.
- In `finally`: `clearTimeout`.
- On deadline (`AbortError`): return `new Response(JSON.stringify({ error: 'upstream timeout' }), { status: 504, headers: { 'Content-Type': 'application/json' } })`. Log: `console.error('[proxyUpstream][${label ?? upstream}] timeout after ${deadlineMs}ms')`.
- On network error (non-abort throw): return `new Response(JSON.stringify({ error: err.message }), { status: 502, headers: ... })`. Log: `console.error('[proxyUpstream][${label ?? upstream}] network error: ${err.message}')`.
- On success: relay the upstream `Response` as-is — same `status`, same `Content-Type`, same body (via `arrayBuffer`). No body transformation.
- This mirrors the existing pattern in `api.alerts.tsx:29-51` exactly but adds the deadline and the 504 path.

**Why 504 vs 502:** A timeout is a gateway-timeout condition (the proxy couldn't get a response in time); 504 is the correct HTTP semantic. A network error (connection refused, DNS failure) is a bad-gateway condition; 502 is correct. This distinction is observable by the frontend page's loader error handling and by QA.

### FR-4 — `safeFetchOrNull<T>` — non-fatal client wrapper helper

**What it must do:**
- Accept `url: string`, `parse: (raw: unknown) => T | null`, optional `opts`.
- Create `AbortController` + `setTimeout(deadlineMs)` in `finally clearTimeout` — same pattern.
- On any error (network, abort, non-2xx, parse failure): log `console.error('[safeFetchOrNull][${label ?? url}] ${err.name ?? 'error'}: ${err.message ?? String(err)}')` + return `null`.
- On success: call `parse(raw)` — if `parse` returns `null`, return `null` (callers interpret null as "not available").
- Return type is `T | null`. NEVER throw.

**Why preserve null return:** The 4 non-fatal wrappers are used in `Promise.allSettled` watchlist-tile enrichment loops and similar optional-data patterns. The callers are coded to treat `null`/`[]`/`{}` as "data unavailable". Changing the return type to a richer degrade envelope would require touching all callers — out of scope for this wave. The contract preserved is exactly: "if anything went wrong, return the safe default; but now log it and respect the deadline".

For `fetchWatchlistPrices` (currently returns `{}`): the function signature returns `Record<string, WatchlistTileData>`, not `null`. `safeFetchOrNull` cannot be used directly here — instead `fetchWatchlistPrices` is migrated to use `safeFetch<Record<string, WatchlistTileData>>(url, parseWatchlistPrices, { label: 'watchlistPrices', deadlineMs: 10_000 })` and returns `result.data` (which will be `{}` on error if `parseWatchlistPrices` returns `{}`). The `console.error` from `safeFetch` provides the missing attribution. Effectively this is a `safeFetch` migration, not `safeFetchOrNull`, but the behavior is identical to the existing degrade contract (`{}` on error).

### FR-5 — Single `console.error` per degrade, no import needed

`console` is a browser/Node global — no import needed. `fetchUtils.ts` must NOT import any logger. This is a DDD invariant (same as NFR-1 in the W2-MCP-FETCH-DEADLINE spec): the utility must remain importable from any Remix route or lib file without creating circular dependencies.

### FR-6 — Degrade renders honest empty state, not blank screen

Each migrated loader must propagate the `error` string from `safeFetch` into the component's empty state. The UI must show a Vietnamese empty-state message (e.g., "Không thể tải dữ liệu — vui lòng thử lại") when `error !== null`, rather than a blank render or an unhandled rejection. This is a UI correctness requirement — the spec does NOT prescribe the exact VN string (that is dev-frontend's domain), but the `error` field from `safeFetch` MUST be passed into the component as a prop and rendered.

---

## Non-Functional Requirements

### NFR-1 — No new import for `console.error`

`console.error` is a Node/browser global. `fetchUtils.ts` must NOT import any logger module. All three helpers use only `console.error` for degrade logging.

### NFR-2 — `FETCH_DEADLINE_MS` is the single timeout SSOT

No per-file, per-route, or per-host timeout literal may be introduced outside `fetchUtils.ts`. If a caller needs a shorter deadline, it passes `opts.deadlineMs` at the call site — the reasoning must be documented inline (e.g., `// 10s: best-effort watchlist enrichment; shorter deadline degrades faster`).

### NFR-3 — Timer cleanup on fast path

`clearTimeout(timerId)` must fire in `finally` — never conditionally. A resolved fetch that does NOT abort must still cancel the pending timer.

### NFR-4 — TypeScript strict compliance

`fetchUtils.ts` must compile under `pnpm check` / `bun check` in `apps/frontend/` with zero TypeScript errors. `AbortController`, `setTimeout`, `clearTimeout` are typed by Remix's Node environment. `Response` is the Fetch API `Response`. Generic type parameter `T` must not use `any` without a documented justification.

### NFR-5 — No circular dependency

`fetchUtils.ts` lives in `apps/frontend/app/lib/api/`. It must import nothing from `~/routes/`, `~/components/`, or `~/domain/`. It may import nothing from `client.ts` (that would be circular — `client.ts` imports `fetchUtils`). It may not import `~/lib/api/client.ts`. The dependency direction is: routes/components → `fetchUtils.ts` (not the reverse).

### NFR-6 — Proxy route 504 vs existing 502 — both are acceptable

Existing `api.*.tsx` proxy routes already return 502 on network error (`catch → new Response(..., { status: 502 })`). After migration to `proxyUpstream`: deadline → 504, network error → 502. The dashboard loaders that call these proxy routes treat non-2xx as a degrade already (they populate `error` and render an empty state). The status code difference (504 vs 502) is observable by QA and acceptable — it is MORE accurate than collapsing all failures to 502.

### NFR-7 — `FE-PAGE-REORG` `safeFetch` scope boundary

The `FE-PAGE-REORG` sprint (OPEN) also plans a `safeFetch<T>` in `lib/api/loader-utils.ts` — but its function is pure DRY boilerplate reduction (no deadline, no degrade log). These are DIFFERENT concerns with the same name. Resolution for architect: the `FE-PAGE-REORG` Wave-1 loader-utils `safeFetch` plan must be subsumed into this spec's `fetchUtils.ts`. When `FE-PAGE-REORG` lands later, it REUSES `safeFetch<T>` from `fetchUtils.ts` rather than adding a second one. No duplicate. Architect must note this in the blueprint. PM must ensure the `FE-PAGE-REORG` backlog task for loader-utils is updated to reference `fetchUtils.ts`.

---

## DDD Layer Decision — WHERE `fetchUtils.ts` lives

**Decision: `apps/frontend/app/lib/api/fetchUtils.ts`**

**Rationale:**

The Remix frontend's `lib/api/` directory is the established home for typed fetch utilities (`client.ts` already lives there). `fetchUtils.ts` is a lower-level transport primitive — it does not contain domain types (no ticker symbols, no market rules, no VN-specific logic). It is analogous to `infrastructure/fetchers/fetchDeadline.ts` in the mcp-server zone, just named for the Remix convention.

**Import direction in frontend (Remix layer model):**
- `routes/dashboard.*.tsx` and `routes/api.*.tsx` import from `lib/api/fetchUtils.ts` (route → lib, downward — correct)
- `lib/api/client.ts` imports from `lib/api/fetchUtils.ts` (lib → lib, peer — acceptable, no cycle)
- `fetchUtils.ts` imports nothing from routes or components (no upward import)

This matches the existing `client.ts` import direction (routes import `client.ts`; `client.ts` imports nothing from routes).

---

## Migration Clusters

### Cluster A — Dashboard loaders (~26 sites)

All files matching `apps/frontend/app/routes/dashboard.*.tsx` that contain a named fetch helper function (e.g., `fetchAlertsData`, `fetchIntelData`, `fetchForeignFlowData`, etc.). Each has the same 40-line try/fetch/parse block.

**Migration pattern (before → after):**

Before:
```ts
export async function fetchXxxData(origin: string, ...): Promise<LoaderData> {
  let items = []; let error: string | null = null;
  try {
    const response = await fetch(`${origin}/api/xxx`, { headers: { Accept: 'application/json' } });
    if (!response.ok) { error = `...`; } else { const raw = await response.json() as unknown; /* shape check */ }
  } catch (err) { error = err instanceof Error ? err.message : '...'; }
  return { items, error };
}
```

After:
```ts
import { safeFetch } from '~/lib/api/fetchUtils';

function parseXxxData(raw: unknown): XxxDto {
  // existing shape-check logic extracted here, returns empty-shape on bad input
  if (raw === null || typeof raw !== 'object') return { items: [] };
  // ...
  return dto;
}

export async function fetchXxxData(origin: string, ...): Promise<LoaderData> {
  const { data, error } = await safeFetch<XxxDto>(
    `${origin}/api/xxx`,
    parseXxxData,
    { label: 'dashboard.xxx' }
  );
  return { items: data.items, error };
}
```

The `fetchXxx` function shrinks from ~40 lines to ~4 lines. The shape-check logic moves to a named `parseXxx` function (testable independently of fetch). The `error` field propagates directly. The `console.error` is emitted by `safeFetch`.

### Cluster B — API proxy routes (~29 sites)

All files matching `apps/frontend/app/routes/api.*.tsx`. Each has a similar try/catch block that calls upstream and returns a `Response`.

**Migration pattern (before → after):**

Before:
```ts
export async function loader({ request }: LoaderFunctionArgs) {
  const upstream = `${MCP_SERVER_BASE_URL}/api/xxx${qs}`;
  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(upstream, { method: 'GET', headers: { Accept: 'application/json' } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: `Proxy fetch error: ${message}` }), { status: 502, ... });
  }
  const body = await upstreamResponse.arrayBuffer();
  return new Response(body, { status: upstreamResponse.status, headers: { 'Content-Type': ... } });
}
```

After:
```ts
import { proxyUpstream } from '~/lib/api/fetchUtils';

export async function loader({ request }: LoaderFunctionArgs) {
  const upstream = `${MCP_SERVER_BASE_URL}/api/xxx${qs}`;
  return proxyUpstream(upstream, { method: 'GET', headers: { Accept: 'application/json' } }, { label: 'api.xxx' });
}
```

The loader shrinks from ~18 lines to ~3 lines. The 502 on network error is preserved (same status). Deadline abort returns 504 (new, more accurate).

### Cluster C — Non-fatal client wrappers (4 sites in `client.ts`)

| Function | Current degrade | After migration | Helper |
|---|---|---|---|
| `fetchKinhDichReadingNonFatal` | `catch { return null }` (no log, no deadline) | `safeFetchOrNull<KinhDichReading>(url, parseKinhDichReading, { deadlineMs: 10_000, label: 'kdReadingNonFatal' })` | `safeFetchOrNull` |
| `fetchWatchlistPrices` | `catch { return {} }` (no log, no deadline) | `safeFetch<Record<string, WatchlistTileData>>(url, parseWatchlistPrices, { deadlineMs: 10_000, label: 'watchlistPrices' })` + return `data` | `safeFetch` |
| `fetchCascadeSignals` | `catch { return [] }` (no log, no deadline) | `safeFetchOrNull<AgentSignal[]>(url, parseCascadeSignals, { deadlineMs: 10_000, label: 'cascadeSignals' })` returning `?? []` | `safeFetchOrNull` |
| `fetchAccuracyDigest` | `catch { return null }` (no log, no deadline) | `safeFetchOrNull<AccuracyDigestStats>(url, parseAccuracyDigest, { deadlineMs: 10_000, label: 'accuracyDigest' })` | `safeFetchOrNull` |

**Deadline for Cluster C: 10_000ms.** These are best-effort enrichment calls used in parallel tile loops or optional summary cards. A 10s deadline surfaces a genuine hang much faster than the default 55s and prevents the optional data fetch from blocking the primary page render for half a minute. This is the one site-specific override from `FETCH_DEADLINE_MS`; it must be documented inline with the rationale comment.

**Degrade return contract preserved:** The caller contract for all 4 functions does not change. `fetchKinhDichReadingNonFatal` still returns `KinhDichReading | null`. `fetchWatchlistPrices` still returns `Record<string, WatchlistTileData>`. `fetchCascadeSignals` still returns `AgentSignal[]`. `fetchAccuracyDigest` still returns `AccuracyDigestStats | null`. Only the INTERNAL implementation changes (deadline + attribution log added).

---

## Atomic Task Breakdown

All tasks are within `apps/frontend/` only. Executing agent: `dev-frontend`.

### T-1 — Create `fetchUtils.ts` with `FETCH_DEADLINE_MS` + `safeFetch` + `proxyUpstream` + `safeFetchOrNull`

**Files:** `apps/frontend/app/lib/api/fetchUtils.ts`
**Output:** New file, zero callers yet. `pnpm check` must pass on this file standalone.
**Size:** S
**Depends:** none

### T-2 — Migrate Cluster C (4 non-fatal client wrappers in `client.ts`)

**Files:** `apps/frontend/app/lib/api/client.ts`
**Change:** Replace 4 bare `catch { return null/[]/`{}` }` patterns with `safeFetch` / `safeFetchOrNull` calls per Cluster C table above. Add `import { safeFetch, safeFetchOrNull } from './fetchUtils.js'` at top of file.
**Size:** S
**Depends:** T-1

**Why T-2 before Clusters A/B:** `client.ts` changes are isolated to one file and are smaller. Getting `client.ts` migrated first validates `safeFetch` + `safeFetchOrNull` on real callers before applying to 55 loader/proxy sites.

### T-3 — Migrate Cluster B (29 `api.*.tsx` proxy routes)

**Files:** All `apps/frontend/app/routes/api.*.tsx`
**Change:** Replace each proxy route's try/catch/fetch block with `proxyUpstream(upstream, init, { label: 'api.xxx' })`. Add import.
**Size:** M (29 files in one sweep — similar pattern in each)
**Depends:** T-1

### T-4 — Migrate Cluster A (26 `dashboard.*.tsx` loader helpers)

**Files:** All `apps/frontend/app/routes/dashboard.*.tsx` that contain a named fetch helper
**Change:** Extract existing inline shape-check logic into named `parseXxx` functions. Replace the ~40-line try/fetch/parse block with `safeFetch<XxxDto>(url, parseXxx, { label: 'dashboard.xxx' })`. Propagate `error` field into the loader return. Ensure component renders a Vietnamese empty state when `error !== null`.
**Size:** L (26 files — each is slightly different shape check; batching all at once is faster than one by one)
**Depends:** T-1

**IMPORTANT for T-4:** Do NOT change the LoaderData shape for any loader (callers in the component layer depend on `{ items, error, ... }`). The `error` field already exists in most loaders; where it is missing it must be added. The component UI must render the `error` string — if the component currently shows a blank render on error, add a visible Vietnamese empty state (one `<p>` is sufficient — no redesign).

### T-5 — `pnpm check` full pass + rebuild

**Files:** none (validation task)
**Action:** Run `pnpm check` in `apps/frontend/`. Zero TypeScript errors required before QA. Container rebuild mandatory (Remix SSR rebuilds server bundle; a restart is insufficient).
**Size:** XS
**Depends:** T-2, T-3, T-4

**Sequencing:** T-1 must complete first. T-2, T-3, T-4 can run in parallel after T-1 (they touch disjoint file sets). T-5 is the final validation gate. Critical path: T-1 → (T-2 || T-3 || T-4) → T-5.

---

## Edge Cases

**EC-1 — Timer leak on fast path**
If the upstream responds BEFORE the deadline fires, `clearTimeout(timerId)` in `finally` must cancel the pending timer. Without this, a stale `controller.abort()` fires after the successful response is already processed — a benign but unnecessary abort that could confuse log readers.

**EC-2 — AbortError discrimination**
Both `AbortController.abort()` (timeout) and a request cancellation (user navigating away from the Remix page mid-load) throw `AbortError`. `safeFetch` must distinguish deadline-abort (controller is the one created inside the function) from a caller-supplied abort (if `opts.signal` is ever added in a future extension). For now, any `AbortError` from the internal controller is a deadline — log it as such. If a future extension adds `opts.signal`, the architect must revisit this.

**EC-3 — Proxy route query-parameter forwarding**
`proxyUpstream` does NOT forward query params — it receives a fully-built `upstream` URL from the caller. The existing `api.*.tsx` routes build the upstream URL with their query params before calling `fetch`. After migration to `proxyUpstream(upstream, init, opts)`, this is unchanged — the caller still builds the URL.

**EC-4 — `Content-Type` relay in proxy routes**
`proxyUpstream` must relay the upstream `Content-Type` header as-is. Some routes serve JSON (`application/json`), some serve binary buffers. The relay must be binary-safe (use `arrayBuffer()`, not `.text()`). This matches the existing `api.alerts.tsx:42-50` pattern.

**EC-5 — `fetchWatchlistPrices` return type is `Record<string, WatchlistTileData>`, not `T | null`**
`safeFetchOrNull` returns `T | null`. `fetchWatchlistPrices` returns `Record<string, WatchlistTileData>` (never null — returns `{}` on error). Architect must confirm whether to use `safeFetch` with an empty-object parse fallback (preserves `{}` degrade), or to allow `fetchWatchlistPrices` to return `Record<string, WatchlistTileData> | null` (caller change). BA recommends `safeFetch` with `parseWatchlistPrices` returning `{}` on bad input — no caller change, preserved contract. Architect decides.

**EC-6 — `apiGet<T>` base function in `client.ts`**
`client.ts:40` `apiGet<T>` is the raw base function. It is NOT migrated to `safeFetch` in this wave — it is used by several named functions that already have their own try/catch and error handling. Migrating `apiGet` would change the throw-vs-return contract for all its callers. The migration targets are the 4 non-fatal wrappers only. Other `apiGet` callers (e.g., `fetchReutersHeadlines`, `fetchBloombergHeadlines`, `fetchGatewayHealth`) are out of scope — their error handling is in the loader that calls them, and those loaders are migrated in Cluster A. Note: `apiGet` still has no deadline — but after Cluster A migration, every loader that calls `apiGet` indirectly will have a deadline at the `safeFetch` level. **Architect must confirm**: is this sufficient (deadline at the outer safeFetch layer covers apiGet indirectly), or should `apiGet` itself also be bounded? BA assessment: the outer deadline covers the full fetch chain including apiGet; bounding apiGet directly would create duplicate abort controllers and is unnecessary.

**EC-7 — Remix loader streaming vs standard JSON response**
Some loaders use `json()` from `@remix-run/node`. The `safeFetch` call is server-side (inside the loader function); it completes before `json()` is called. The `AbortController` inside `safeFetch` is NOT the Remix request's `AbortSignal` — it is an independent deadline controller. If the user navigates away before the loader's `safeFetch` completes, the mcp-server fetch will be aborted by the deadline but NOT by Remix's built-in request cancellation. This is acceptable for this wave — cancelling the inner fetch on user navigation is a separate concern (EC-2 future extension).

**EC-8 — Dashboard loaders that use `apiGet` via `client.ts` imports**
Some dashboard loaders call typed functions from `client.ts` (e.g., `fetchGatewayHealth()`, `fetchReutersHeadlines()`) inside their loader body rather than calling `fetch` directly. These are NOT in the Cluster A migration target (they don't have the ~40-line inline try/fetch/parse block). They are out of scope for this spec. The outer loader's `safeFetch` would only apply to direct `fetch()` calls in the loader body, not to `client.ts` helper calls. Architect must confirm the scope boundary for these loaders.

**EC-9 — `FE-PAGE-REORG` safeFetch name collision (see NFR-7)**
The `FE-PAGE-REORG` sprint's Wave-1 plans a `lib/api/loader-utils.ts` `safeFetch<T>` for pure DRY. Since this spec ships `fetchUtils.ts` with a `safeFetch<T>` that includes deadlines + logs, `FE-PAGE-REORG` must reuse `fetchUtils.ts` instead. The name `safeFetch` in `FE-PAGE-REORG` refers to the same concept (a typed fetch wrapper with error handling) — the difference is that the error-handling audit version ALSO adds the deadline. There is no functional conflict — the audit version is strictly richer. `FE-PAGE-REORG` dev must import from `fetchUtils.ts`, not create a second file.

---

## DDD Layer Map

| Task | File | DDD Layer (Remix) | Justification |
|---|---|---|---|
| T-1 (new utility) | `lib/api/fetchUtils.ts` | Lib (shared, no domain logic) | Owns AbortController + setTimeout lifecycle; no domain types (no ticker, no market logic); analogous to mcp-server's `infrastructure/fetchers/fetchDeadline.ts` |
| T-2 | `lib/api/client.ts` | Lib (typed API client) | Peer of fetchUtils.ts; client.ts imports fetchUtils downward |
| T-3 | `routes/api.*.tsx` (29 files) | Interface (Remix resource routes) | Proxy routes import fetchUtils.ts downward |
| T-4 | `routes/dashboard.*.tsx` (26 files) | Interface (Remix UI routes + loaders) | Dashboard loaders import fetchUtils.ts downward |
| T-5 | validation | — | Build gate |

Import direction: `routes/` → `lib/api/fetchUtils.ts`. All imports flow downward toward `lib/`. No upward imports from `fetchUtils.ts`. Zero circular dependencies.

---

## Acceptance Criteria (Forced-Failure DoD)

Container must be REBUILT (not restarted) after code change. `pnpm check` must pass first.

**AC-1 — Deadline fires before gateway timeout on loader hang**
Simulate a hang at mcp-server:3000 (e.g., block port 3000 on the host, or use a test HTTP server that never responds). Navigate to any dashboard page. The loader must time out within 55 seconds (FETCH_DEADLINE_MS). The frontend server log must show the `[safeFetch][dashboard.xxx] AbortError: fetch aborted after 55000ms` attribution line. The page must render a Vietnamese empty state, NOT a blank screen or an unhandled rejection.

**AC-2 — Proxy route returns 504 on upstream timeout**
Simulate a hang at the upstream (block the mcp-server proxy port). Call any `api.*.tsx` route (e.g., `GET /api/alerts`). The response must be `504` with `{ "error": "upstream timeout" }` body within 55 seconds. NOT a 200 with empty body. NOT a hang until the browser times out.

**AC-3 — Proxy route returns 502 on network error (connection refused)**
Stop mcp-server container entirely (`docker stop mcp-server`). Call any `api.*.tsx` route. Response must be `502` with `{ "error": "..." }` body. Must arrive quickly (connection refused is instant).

**AC-4 — Non-fatal wrapper attribution logs on failure**
Stop the api-gateway or disconnect the network. Call the watchlist overview page (which calls `fetchWatchlistPrices`). The frontend server log must show `[safeFetch][watchlistPrices] ...` attribution. The watchlist page must still render (with empty tile data), NOT crash.

**AC-5 — Non-fatal wrappers respect 10s deadline**
Simulate a slow upstream (throttle port to near-zero bandwidth). `fetchKinhDichReadingNonFatal` / `fetchCascadeSignals` / `fetchAccuracyDigest` must abort within 10 seconds. Log must show attribution. Callers receive `null`/`[]` within 10 seconds.

**AC-6 — Happy path unchanged**
With all services running and healthy: ALL dashboard pages load correctly with live data. No regression in rendered data. `pnpm check` clean.

**AC-7 — Vietnamese empty state on error**
With mcp-server down: every migrated dashboard page renders a Vietnamese empty-state message (not a blank screen, not a generic English error). QA navigates to 5 representative pages (alerts, foreign-flow, kinh-dich-signals, macro, analysis) and confirms each shows a graceful degrade.

**AC-8 — `pnpm check` passes with zero TypeScript errors**
Run `pnpm check` in `apps/frontend/`. Must be clean.

**AC-9 — Single `console.error` per degrade**
QA verifies (via log inspection on a simulated failure) that exactly ONE `console.error` fires per failed fetch — not zero (silent swallow), not two (double-log).

**AC-10 — No timer leak on fast path**
Code review confirms `clearTimeout(timerId)` is in the `finally` block in `fetchUtils.ts` for all three helpers.

---

## Blockers

ZERO PO blockers.

Architect ratification items (not PO blockers — dev may draft pending architect sign-off):

**ARCH-RATIFY-FE-1:** Confirm `EC-6` — whether `apiGet<T>` in `client.ts` needs its own internal deadline (bounded at the source) or whether bounding at the outer `safeFetch` layer in each loader is sufficient. BA recommends the outer-deadline-is-sufficient approach (no change to `apiGet`) but architect confirms.

**ARCH-RATIFY-FE-2:** Confirm `EC-5` — `fetchWatchlistPrices` migration path. BA recommends `safeFetch` with `parseWatchlistPrices` returning `{}` (preserved contract). Architect confirms whether this is cleaner than allowing `null` return (which would require caller change).

**ARCH-RATIFY-FE-3:** Confirm `EC-8` — scope boundary for dashboard loaders that call `client.ts` typed functions (e.g., `fetchGatewayHealth`) rather than calling `fetch` directly. These are NOT in the Cluster A ~26-file sweep. Architect confirms whether these are out of scope for this wave or need separate handling.

**ARCH-RATIFY-FE-4:** Confirm `EC-9` / NFR-7 — the `FE-PAGE-REORG` `loader-utils.ts safeFetch` plan must be redirected to use `fetchUtils.ts`. Architect confirms this scope absorption is reflected in the blueprint and that the PM updates the FE-PAGE-REORG backlog task accordingly.

---

## Hard Constraints (propagate to architect → pm → dev-frontend → qa)

1. ONE SHARED HELPER FILE — `fetchUtils.ts` is the single deadline primitive for ALL frontend fetch sites. No per-route, per-page, per-host re-invention.
2. FAIL-LOUD / HONEST DEGRADE — a timeout is a real error. `safeFetch` must log and return `{ data: emptyT, error: 'reason' }`. Never suppress to empty without a log.
3. `FETCH_DEADLINE_MS = 55_000` is the single SSOT timeout. Cluster C callers may pass `10_000` with inline comment. No other overrides without documented rationale.
4. NO NEW IMPORT FOR `console.error` — global. DDD invariant (same as mcp-server W2 spec).
5. NO per-host / per-ticker / per-date branch inside `fetchUtils.ts`. Zero domain logic in the helpers.
6. `apiGet<T>` is NOT bounded in this wave — its callers (dashboard loaders) are bounded at the outer `safeFetch` layer. Negative scope.
7. Container MUST be rebuilt (not restarted) before QA runs.
8. `FE-PAGE-REORG` Wave-1 `loader-utils.ts safeFetch` plan is ABSORBED — dev-frontend must NOT create a second `safeFetch` helper.

---

## Files Modified (scope for architect/dev)

**New:**
- `apps/frontend/app/lib/api/fetchUtils.ts`

**Modified:**
- `apps/frontend/app/lib/api/client.ts` (T-2 — 4 non-fatal wrappers)
- `apps/frontend/app/routes/api.agm-plan-actual.tsx` (T-3)
- `apps/frontend/app/routes/api.alerts.tsx` (T-3)
- `apps/frontend/app/routes/api.analysis-brief.$ticker.tsx` (T-3)
- `apps/frontend/app/routes/api.analysis-briefs.tsx` (T-3)
- `apps/frontend/app/routes/api.bctc-eval.$.tsx` (T-3)
- `apps/frontend/app/routes/api.bctc-inspect.$.tsx` (T-3)
- `apps/frontend/app/routes/api.conviction-history.tsx` (T-3)
- `apps/frontend/app/routes/api.corporate-events.tsx` (T-3)
- `apps/frontend/app/routes/api.fed-rates.tsx` (T-3)
- `apps/frontend/app/routes/api.financials.tsx` (T-3)
- `apps/frontend/app/routes/api.foreign-flow.tsx` (T-3)
- `apps/frontend/app/routes/api.global-markets.tsx` (T-3)
- `apps/frontend/app/routes/api.kinh-dich-signals.tsx` (T-3)
- `apps/frontend/app/routes/api.kinh-dich.reading.$code.tsx` (T-3)
- `apps/frontend/app/routes/api.macro-regime.tsx` (T-3)
- `apps/frontend/app/routes/api.market-digest.tsx` (T-3)
- `apps/frontend/app/routes/api.market-summaries.tsx` (T-3)
- `apps/frontend/app/routes/api.news-buzz.tsx` (T-3)
- `apps/frontend/app/routes/api.news-sentiment.tsx` (T-3)
- `apps/frontend/app/routes/api.officers.tsx` (T-3)
- `apps/frontend/app/routes/api.orchestration.tsx` (T-3)
- `apps/frontend/app/routes/api.prediction-claims.tsx` (T-3)
- `apps/frontend/app/routes/api.price-history.$ticker.tsx` (T-3)
- `apps/frontend/app/routes/api.quality-checklist.tsx` (T-3)
- `apps/frontend/app/routes/api.reputation.tsx` (T-3)
- `apps/frontend/app/routes/api.sector-cascade.tsx` (T-3)
- `apps/frontend/app/routes/api.sector-rotation.tsx` (T-3)
- `apps/frontend/app/routes/api.shareholders.tsx` (T-3)
- `apps/frontend/app/routes/api.vps-proxy-health.tsx` (T-3)
- `apps/frontend/app/routes/dashboard._index.tsx` (T-4 — if it contains a direct fetch)
- `apps/frontend/app/routes/dashboard.agm-plan-actual.tsx` (T-4)
- `apps/frontend/app/routes/dashboard.alerts.tsx` (T-4)
- `apps/frontend/app/routes/dashboard.analysis.tsx` (T-4)
- `apps/frontend/app/routes/dashboard.conviction-history.tsx` (T-4)
- `apps/frontend/app/routes/dashboard.corporate-events.tsx` (T-4)
- `apps/frontend/app/routes/dashboard.fed-rates.tsx` (T-4)
- `apps/frontend/app/routes/dashboard.financials.tsx` (T-4)
- `apps/frontend/app/routes/dashboard.foreign-flow.tsx` (T-4)
- `apps/frontend/app/routes/dashboard.global-markets.tsx` (T-4)
- `apps/frontend/app/routes/dashboard.kinh-dich-signals.tsx` (T-4)
- `apps/frontend/app/routes/dashboard.macro.tsx` (T-4)
- `apps/frontend/app/routes/dashboard.market-summaries.tsx` (T-4, if exists)
- `apps/frontend/app/routes/dashboard.news-buzz.tsx` (T-4, if exists)
- `apps/frontend/app/routes/dashboard.officers.tsx` (T-4)
- `apps/frontend/app/routes/dashboard.prediction-claims.tsx` (T-4)
- `apps/frontend/app/routes/dashboard.reputation.tsx` (T-4)
- `apps/frontend/app/routes/dashboard.sector-cascade.tsx` (T-4)
- `apps/frontend/app/routes/dashboard.sector-rotation.tsx` (T-4)
- `apps/frontend/app/routes/dashboard.shareholders.tsx` (T-4)

Zero mcp-server files. Zero Python files. Zero docs/data files. Implementing specialist: `dev-frontend` only.

**Note on T-4 file count:** The exact list of dashboard loaders that contain an inline ~40-line fetch block (vs those that call `client.ts` typed functions) must be confirmed by architect's brownfield read. Not all 34 dashboard routes necessarily have the inline pattern — some may call `client.ts` helpers exclusively (EC-8 boundary). Architect confirms the exact T-4 target list in the blueprint.

---

## Handoff to Architect

ZONE: `apps/frontend/`
SPEC: this file
NEXT: architect — produce technical design, confirm ARCH-RATIFY-FE-1 through FE-4, blueprint `fetchUtils.ts` implementation, confirm T-4 exact file list (EC-8 scope boundary), confirm FE-PAGE-REORG scope absorption (NFR-7/EC-9).
