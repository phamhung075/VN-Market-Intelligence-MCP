<!-- size-justification: Wave-2 frontend safeFetch architect design — 3 cluster maps (26 loaders / 29 proxies / 4 non-fatal), 4 ARCH-RATIFY verdicts, fetchUtils.ts blueprint with explicit AbortController/setTimeout/ReturnType<typeof setTimeout> type guidance, T-4 exact file list (28 Cluster A files), FE-PAGE-REORG scope absorption ruling. Load-bearing for pm->dev-frontend->qa chain. -->

# [Architect] Brownfield Findings + Design
## FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH

**Epic:** ERROR-AUDIT-2026-06-15 · Wave 2
**Zone:** `apps/frontend/`
**Chain hop:** architect → pm → dev-frontend → qa
**BA spec:** `docs/handoffs/FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH-BA-spec.md`
**Completed:** 2026-06-16T06:30Z
**BUILD-STANDARD:** lean (apps/frontend/ zone exists; extending existing lib/api/ pattern)

---

## Zone

`apps/frontend/` — single zone. `dev-frontend` drives end-to-end; no relay to other zones required.

---

## Brownfield Scan

### lib/api directory

Current state of `apps/frontend/app/lib/api/`:
- `client.ts` (634L) — typed API client; all calls go through `api-gateway:4000`. Uses `apiGet<T>` base (line 40) — bare `fetch`, no signal, no deadline.
- `bctc-eval-client.ts` — BCTC evaluation client; not in scope.
- `fetchUtils.ts` — does NOT exist. Must be created (T-1).

**`client.ts` import direction confirmed:** `client.ts` imports from `~/domain/*` (domain types). Routes import `client.ts`. No circular risk in adding `client.ts` importing from `fetchUtils.ts` — downward lib-to-lib import is clean.

### Cluster A — Exact T-4 file list (EC-8 boundary confirmed by brownfield)

Brownfield read of ALL `dashboard.*.tsx` routes determined two classes:

**Class 1 — Inline direct `await fetch(...)` inside a named helper function → Cluster A (safeFetch migration target):**

28 files confirmed with inline fetch pattern:

1. `dashboard._index.tsx` — `fetch(.../api/market-digest)`
2. `dashboard.agm-plan-actual.tsx` — `fetch(url)`
3. `dashboard.alerts.tsx` — `fetchAlertsData` → `fetch(url)` (reference implementation; 40L block)
4. `dashboard.bctc.tsx` — `fetchAnalysisBriefs` → `fetch(.../api/analysis-briefs)`
5. `dashboard.conviction-history.tsx` — `fetch(url)`
6. `dashboard.corporate-events.tsx` — `fetch(url)`
7. `dashboard.fed-rates.tsx` — `fetch(url)`
8. `dashboard.financials.tsx` — `fetch(url)`
9. `dashboard.foreign-flow.tsx` — `fetchForeignFlowData` → `fetch(url)` (reference; 40L block)
10. `dashboard.global-markets.tsx` — `fetch(url)`
11. `dashboard.intel.tsx` — `fetchIntelData` → `fetch(.../api/market-digest)` (reference; 40L block)
12. `dashboard.kinh-dich-signals.tsx` — `fetch(url)`
13. `dashboard.macro.tsx` — `fetch(.../api/macro-regime)`
14. `dashboard.market-summaries.tsx` — TWO `fetch(url)` calls (two data sources); both migrate to `safeFetch`
15. `dashboard.news-buzz.tsx` — `fetch(url)`
16. `dashboard.news.tsx` — `fetch(.../api/news-sentiment)`
17. `dashboard.officers.tsx` — `fetch(url)`
18. `dashboard.orchestration.tsx` — `fetch(.../api/orchestration)`
19. `dashboard.prediction-claims.tsx` — `fetch(url)`
20. `dashboard.quality-audit.tsx` — `fetch(.../api/quality-checklist)`
21. `dashboard.reputation.tsx` — `fetch(url)`
22. `dashboard.sector-cascade.tsx` — `fetch(url)`
23. `dashboard.sector-rotation.tsx` — `fetch(url)`
24. `dashboard.shareholders.tsx` — `fetch(url)`
25. `dashboard.technical.tsx` — `fetch(.../api/price-history/...)`
26. `dashboard.vps.tsx` — `fetch(upstream)` direct to `MCP_SERVER_BASE_URL` (NOT via /api/* self-call — calls mcp-server directly without the proxy hop; see Special Case A below)
27. `dashboard.bctc-inspect.tsx` — raw HTML relay loader; see Special Case B below
28. `dashboard.analysis.tsx` — MIXED: uses `fetchWatchlistPrices` from `client.ts` (out of scope per EC-8) PLUS one additional inline `fetch(.../api/analysis-brief/...)` (in scope)

**Count: 28 files / 30 fetch call sites** (market-summaries has 2 calls; analysis has 1 inline + client.ts imports out of scope).

**Class 2 — Loaders that ONLY call `client.ts` typed functions → OUT OF SCOPE for T-4 (EC-8 confirmed):**

4 files:
- `dashboard.db.tsx` — calls `fetchPriceHistory()` + `fetchReutersHeadlines()` from `client.ts`
- `dashboard.fetch.tsx` — no direct fetch (inspected; uses client.ts helpers or static data)
- `dashboard.services.tsx` — calls `fetchGatewayHealth()` from `client.ts`
- `dashboard.analysis.tsx` — partially out-of-scope for its `client.ts` calls (only the 1 inline `fetch` is in scope)

These 4 loaders call `apiGet<T>` indirectly via `client.ts`. Their outer deadline coverage is provided by `safeFetch` once T-4 adds a deadline to the inline call; the `client.ts` path within these loaders remains unbounded at the `apiGet` level — see ARCH-RATIFY-FE-1 below.

**Additional special-case routes found in Cluster A:**

**Special Case A — `dashboard.vps.tsx`**: Does a direct `fetch(MCP_SERVER_BASE_URL + '/api/vps-proxy-health')`, bypassing the `/api/*` self-call pattern. This is a loader (not a proxy route), and its `try/catch` populates `proxyError` instead of returning a Response. The migration is `safeFetch` (not `proxyUpstream`) — it follows the Cluster A pattern despite the direct-mcp-server call. The `safeFetch` deadline of 55s applies. PM must annotate: dev-frontend should use `safeFetch` here, not `proxyUpstream`.

**Special Case B — `dashboard.bctc-inspect.tsx`**: This is a resource route that proxies raw HTML (Content-Type: text/html). Its degrade path returns an HTML error page, not JSON. It does NOT follow either the Cluster A or Cluster B pattern. Migration to `proxyUpstream` is partially applicable: `proxyUpstream` relays body via `arrayBuffer` (binary-safe) and returns a `Response`. However the error body (`{ error: '...' }` JSON with 502/504) does not match the existing HTML error response. **Architect decision: `dashboard.bctc-inspect.tsx` is OUT OF SCOPE for this wave.** Its proxy pattern is unique (HTML relay, not JSON relay); the error path degrade is acceptable as-is. PM must NOT include it in T-4 (it is not a dashboard loader with a LoaderData shape) and must verify it is absent from T-3 (it is not an `api.*.tsx` file). Track as follow-on if needed.

### Cluster B — Proxy routes (Verified)

All 29 `api.*.tsx` files confirmed as direct-to-mcp-server proxy routes following the pattern in `api.alerts.tsx:22-52`. The pattern is consistent across all 29:
- `fetch(upstream, { method: 'GET', headers: { Accept: 'application/json' } })` inside `try/catch`
- `catch` returns `new Response(JSON.stringify({ error: '...' }), { status: 502, ... })`
- On success: relay `arrayBuffer()` + `Content-Type` header

The existing pattern in `api.alerts.tsx` is the canonical reference. `proxyUpstream` encapsulates this pattern exactly, adding the `AbortController` timeout lane.

### Cluster C — Non-fatal client wrappers (Verified against `client.ts`)

Four functions confirmed at lines:

| Function | Line | Current error path |
|---|---|---|
| `fetchKinhDichReadingNonFatal` | :283 | `catch { return null }` — bare, no log, no deadline |
| `fetchWatchlistPrices` | :489–536 | `catch { return {} }` — bare, no log, no deadline |
| `fetchCascadeSignals` | :550 | `catch { return [] }` — via `apiGet` catch, bare, no log, no deadline |
| `fetchAccuracyDigest` | :578 | `catch { return null }` — via `apiGet` catch, bare, no log, no deadline |

Critical observation on `fetchCascadeSignals` and `fetchAccuracyDigest`: these call `apiGet<T>` (which throws on non-2xx), then catch the thrown `ApiError` at their own level. After migration to `safeFetch` / `safeFetchOrNull`, the `apiGet` call is REPLACED — not wrapped. Dev-frontend must not leave the old `apiGet` call inside the function (that would create a double-hop). See ARCH-RATIFY-FE-1 and Implementation Notes below.

### TypeScript environment confirmed

`tsconfig.json` targets ES2022 with `lib: ["DOM", "DOM.Iterable", "ES2022"]` and `types: ["@remix-run/node", "vitest/globals"]`. This means:
- `AbortController` is typed via the DOM lib
- `fetch` is typed via `@remix-run/node` (which re-exports Remix's Fetch API types)
- `setTimeout` returns `ReturnType<typeof setTimeout>` — use this type annotation for the timer variable to avoid the Node vs browser `NodeJS.Timeout` vs `number` ambiguity. Specifically: `let timerId: ReturnType<typeof setTimeout>`.
- `Response` is the Fetch API `Response` from DOM lib

**No additional imports needed for these primitives.**

---

## ARCH-RATIFY Verdicts

### ARCH-RATIFY-FE-1 — `apiGet<T>` internal deadline (EC-6)

**Verdict: OUTER DEADLINE IS SUFFICIENT. `apiGet<T>` is NOT bounded internally in this wave.**

Rationale confirmed by brownfield read:

1. `apiGet` is used by 3 categories of callers:
   - `fetchGatewayHealth`, `fetchReutersHeadlines`, `fetchBloombergHeadlines`, `fetchPriceHistory`, `fetchMacroExternal`, `fetchKinhDichMarket`, `fetchKinhDichReading`, `fetchStockSignals` — these are called from dashboard loaders (`dashboard.db.tsx`, `dashboard.services.tsx`, `dashboard.analysis.tsx`). Those loaders are OUT OF SCOPE for T-4 (EC-8 confirmed). They have no `safeFetch` deadline wrapping them. **This is the one accepted gap in this wave.**
   - `fetchCascadeSignals`, `fetchAccuracyDigest` — Cluster C targets. Migration REPLACES `apiGet` with direct `fetch` inside `safeFetch`/`safeFetchOrNull`. After migration, `apiGet` is not called from these functions.
   - `fetchTASnapshot`, `fetchMacroSnapshot` — use raw `fetch` directly with POST; these are out of scope and remain unbounded.

2. Adding a deadline inside `apiGet` would require adding `AbortController` + `setTimeout` inside the base function, which would CONFLICT with any caller-supplied `AbortController` (no `signal` merging logic exists). Creating duplicate abort controllers is the exact footgun the BA spec warns against.

3. **Accepted gap:** `dashboard.db.tsx` / `dashboard.services.tsx` / `dashboard.analysis.tsx` loaders that call `client.ts` typed functions remain unbounded for this wave. PM must open a follow-on task to bound these loaders (either migrate their `client.ts` calls to `safeFetch`, or bound `apiGet` in a future Wave-3 with signal-merge logic).

**Dev-frontend must NOT attempt to bound `apiGet` in this wave.**

### ARCH-RATIFY-FE-2 — `fetchWatchlistPrices` migration path (EC-5)

**Verdict: USE `safeFetch` WITH EMPTY-OBJECT PARSE FALLBACK. No change to caller contract.**

`fetchWatchlistPrices` returns `Record<string, WatchlistTileData>` (never null). `safeFetchOrNull<T>` returns `T | null` — incompatible without a caller change.

Confirmed migration: use `safeFetch<Record<string, WatchlistTileData>>(url, parseWatchlistPrices, { deadlineMs: 10_000, label: 'watchlistPrices' })` where `parseWatchlistPrices(raw)` returns `{}` (empty object) on bad input. `safeFetch` returns `{ data: Record<string, WatchlistTileData>; error: string | null }` — the function returns `result.data` (which is `{}` on error/deadline). The `console.error` in `safeFetch` provides the attribution. The caller signature `Promise<Record<string, WatchlistTileData>>` is fully preserved.

The existing shape-normalization logic in `fetchWatchlistPrices` (lines :505-535 — two shapes: `{ quotes: {} }` and flat array) moves to a named `parseWatchlistPrices(raw: unknown): Record<string, WatchlistTileData>` function.

### ARCH-RATIFY-FE-3 — Scope boundary for loaders that call `client.ts` typed functions (EC-8)

**Verdict: CONFIRMED OUT OF SCOPE FOR THIS WAVE.**

4 files (`dashboard.db.tsx`, `dashboard.services.tsx`, `dashboard.fetch.tsx`, plus the `client.ts` call sites in `dashboard.analysis.tsx`) are out of scope. They call `fetchGatewayHealth()`, `fetchReutersHeadlines()`, `fetchPriceHistory()` which internally call `apiGet` — unbounded at source.

The Cluster A migration covers 28 files with INLINE fetch patterns. These 4 files remain as ACCEPTED GAP for follow-on. PM must create a follow-on task: "Wave-3: bound dashboard loaders that call client.ts typed functions."

**`dashboard.analysis.tsx`** is a hybrid: its ONE inline `fetch(.../api/analysis-brief/...)` IS in Cluster A scope and must be migrated. Its `fetchWatchlistPrices` call from `client.ts` is NOT (it is a Cluster C migration in `client.ts`, not in the loader). Dev-frontend must treat these two calls separately.

### ARCH-RATIFY-FE-4 — FE-PAGE-REORG `loader-utils.ts safeFetch` absorption (EC-9 / NFR-7)

**Verdict: ABSORPTION CONFIRMED. `FE-PAGE-REORG` Wave-1 FR-4 must use `fetchUtils.ts`, NOT create `loader-utils.ts`.**

The `FE-PAGE-REORG` sprint scope (`docs/data/orch/orch-state.json` sprint entry, scope_in field) explicitly lists: `lib/api/loader-utils.ts safeFetch<T>(url, parser) — kills loader boilerplate across all 33 loaders`. This plan is SUPERSEDED by this spec.

Reason: `fetchUtils.ts` `safeFetch<T>` is strictly richer than `FE-PAGE-REORG`'s planned `loader-utils.ts safeFetch` — it adds deadline + log (which is the root fix for frontend-01/02/06). FE-PAGE-REORG's DRY goal is fully achieved by `fetchUtils.ts`. Creating `loader-utils.ts` would be a duplicate primitive with the same name and overlapping concerns — NFR-5 (no circular dependency) and the codebase single-SSOT rule forbid it.

**PM action required:** Update `FE-PAGE-REORG` backlog task `BA-FE-PAGE-REORG` (task board entry ID `BA-FE-PAGE-REORG`) to note that FR-4 (`loader-utils.ts safeFetch`) is REPLACED by `fetchUtils.ts` from this spec. The `FE-PAGE-REORG` BA spec must reference `fetchUtils.ts` when it is produced. **Dev-frontend must NOT create `lib/api/loader-utils.ts`.**

---

## Technical Design

### D-1 — `apps/frontend/app/lib/api/fetchUtils.ts` (New file, T-1)

**DDD layer:** Lib — shared infrastructure primitive. No domain types. No imports from routes or components. Peer of `client.ts` in the same `lib/api/` directory.

**Dependency direction:** `routes/` → `lib/api/fetchUtils.ts` (downward). `lib/api/client.ts` → `lib/api/fetchUtils.ts` (peer, downward within lib). `fetchUtils.ts` → nothing (terminal node, imports only Node/DOM globals).

**Timer type:** `let timerId: ReturnType<typeof setTimeout>` — resolves the Node vs DOM `Timeout` vs `number` ambiguity under the `@remix-run/node` + ES2022 lib combination.

**Complete implementation contract for dev-frontend:**

```ts
// apps/frontend/app/lib/api/fetchUtils.ts

/**
 * Frontend fetch deadline constants and helpers.
 *
 * FETCH_DEADLINE_MS = 55s:
 *   - Below 60s gateway ceiling (ensures frontend abort fires before gateway)
 *   - Above 45s mcp-server bctcPdfPullJob inner deadline (ensures inner hop degrades first)
 *   - Single SSOT — no per-route, per-host, or per-ticker overrides except documented ones
 *
 * Mirrors the mcp-server withDeadline pattern from FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE.
 */

export const FETCH_DEADLINE_MS = 55_000;

// ── safeFetch<T> ── dashboard loaders ────────────────────────────────────────

export async function safeFetch<T>(
  url: string,
  parse: (raw: unknown) => T,
  opts?: { deadlineMs?: number; label?: string }
): Promise<{ data: T; error: string | null }> {
  const deadlineMs = opts?.deadlineMs ?? FETCH_DEADLINE_MS;
  const label = opts?.label ?? url;
  const controller = new AbortController();
  let timerId: ReturnType<typeof setTimeout> | undefined;

  try {
    timerId = setTimeout(() => controller.abort(), deadlineMs);
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!response.ok) {
      const msg = `upstream ${response.status}`;
      console.error(`[safeFetch][${label}] ${msg}`);
      // parse must return the empty-T shape for error cases
      // Caller supplies parse; on error we need an empty T.
      // We call parse(null) and expect it to return an empty shape.
      // If parse throws on null, catch below handles it.
      const emptyData = parse(null);
      return { data: emptyData, error: msg };
    }

    const raw = (await response.json()) as unknown;
    try {
      const data = parse(raw);
      return { data, error: null };
    } catch (parseErr) {
      const msg = parseErr instanceof Error ? parseErr.message : 'parse error';
      console.error(`[safeFetch][${label}] parse error: ${msg}`);
      const emptyData = parse(null);
      return { data: emptyData, error: `parse error: ${msg}` };
    }
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError';
    const msg = isAbort
      ? `AbortError: fetch aborted after ${deadlineMs}ms`
      : err instanceof Error ? err.message : String(err);
    console.error(`[safeFetch][${label}] ${msg}`);
    const emptyData = parse(null);
    return { data: emptyData, error: msg };
  } finally {
    if (timerId !== undefined) clearTimeout(timerId);
  }
}

// ── proxyUpstream ── api.*.tsx proxy routes ───────────────────────────────────

export async function proxyUpstream(
  upstream: string,
  init?: RequestInit,
  opts?: { deadlineMs?: number; label?: string }
): Promise<Response> {
  const deadlineMs = opts?.deadlineMs ?? FETCH_DEADLINE_MS;
  const label = opts?.label ?? upstream;
  const controller = new AbortController();
  let timerId: ReturnType<typeof setTimeout> | undefined;

  try {
    timerId = setTimeout(() => controller.abort(), deadlineMs);
    const upstreamResponse = await fetch(upstream, {
      ...init,
      signal: controller.signal,
    });

    // Relay upstream response as-is (binary-safe via arrayBuffer)
    const upstreamContentType =
      upstreamResponse.headers.get('Content-Type') ?? 'application/json';
    const body = await upstreamResponse.arrayBuffer();

    return new Response(body, {
      status: upstreamResponse.status,
      headers: { 'Content-Type': upstreamContentType },
    });
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError';
    if (isAbort) {
      console.error(`[proxyUpstream][${label}] timeout after ${deadlineMs}ms`);
      return new Response(
        JSON.stringify({ error: 'upstream timeout' }),
        { status: 504, headers: { 'Content-Type': 'application/json' } }
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[proxyUpstream][${label}] network error: ${msg}`);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  } finally {
    if (timerId !== undefined) clearTimeout(timerId);
  }
}

// ── safeFetchOrNull<T> ── non-fatal client wrappers ──────────────────────────

export async function safeFetchOrNull<T>(
  url: string,
  parse: (raw: unknown) => T | null,
  opts?: { deadlineMs?: number; label?: string }
): Promise<T | null> {
  const deadlineMs = opts?.deadlineMs ?? FETCH_DEADLINE_MS;
  const label = opts?.label ?? url;
  const controller = new AbortController();
  let timerId: ReturnType<typeof setTimeout> | undefined;

  try {
    timerId = setTimeout(() => controller.abort(), deadlineMs);
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!response.ok) {
      const msg = `upstream ${response.status}`;
      console.error(`[safeFetchOrNull][${label}] ${msg}`);
      return null;
    }

    const raw = (await response.json()) as unknown;
    return parse(raw);
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError';
    const name = isAbort ? 'AbortError' : (err instanceof Error ? err.name : 'Error');
    const msg = isAbort
      ? `fetch aborted after ${deadlineMs}ms`
      : err instanceof Error ? err.message : String(err);
    console.error(`[safeFetchOrNull][${label}] ${name}: ${msg}`);
    return null;
  } finally {
    if (timerId !== undefined) clearTimeout(timerId);
  }
}
```

**Implementation note on `parse(null)` empty-T contract:** `safeFetch` calls `parse(null)` to obtain the empty-T shape when the fetch fails. Each caller's `parseXxx(raw: unknown): XxxDto` function must handle `raw === null` by returning the empty-shape struct (e.g., `{ items: [], count: 0, fetchedAt: '' }`). This is already the pattern in the existing shape-check logic (e.g., `if (raw !== null && typeof raw === 'object' && 'items' in raw) { ... } else { /* empty */ }`). Dev-frontend extracts this existing shape-check into the named `parseXxx` function and adds the null guard.

**Why `parse(null)` instead of a separate `emptyT` parameter:** Adding an `emptyT` parameter would require all 26+ callers to supply it separately from the `parse` function. Making `parse(null)` return the empty shape puts the empty-shape knowledge in one place (the parse function), matching the BA spec contract. This is the same pattern as the mcp-server `withDeadline` helper returning the degrade value from the error path.

### D-2 — T-2: `client.ts` Cluster C migrations

**File:** `apps/frontend/app/lib/api/client.ts`
**Import to add at top:** `import { safeFetch, safeFetchOrNull } from './fetchUtils.js';` (ESM `.js` extension per dev-standards coding rule).

**4 migration blueprints:**

**`fetchKinhDichReadingNonFatal` (line :283):**
Replace the entire function body with:
```ts
export async function fetchKinhDichReadingNonFatal(
  code: string,
): Promise<KinhDichReading | null> {
  const url = `${API_GATEWAY_URL}/kinh-dich/reading/${encodeURIComponent(code)}`;
  return safeFetchOrNull<KinhDichReading>(
    url,
    (raw) => {
      if (raw === null || typeof raw !== 'object') return null;
      return raw as KinhDichReading;
    },
    { deadlineMs: 10_000, label: 'kdReadingNonFatal' }
    // 10s: best-effort watchlist tile enrichment; faster degrade preserves tile render
  );
}
```

**`fetchWatchlistPrices` (line :489):**
Extract existing shape-check into named `parseWatchlistPrices(raw: unknown): Record<string, WatchlistTileData>` (returning `{}` on bad input — existing lines :505-535 become this function). Then replace function body:
```ts
export async function fetchWatchlistPrices(
  tickers: string[],
): Promise<Record<string, WatchlistTileData>> {
  if (tickers.length === 0) return {};
  const url = `${API_GATEWAY_URL}/stock/price/batch?tickers=${encodeURIComponent(tickers.join(','))}`;
  const { data } = await safeFetch<Record<string, WatchlistTileData>>(
    url,
    parseWatchlistPrices,
    { deadlineMs: 10_000, label: 'watchlistPrices' }
    // 10s: best-effort enrichment; shorter deadline degrades faster without blocking primary page render
  );
  return data;
}
```

**`fetchCascadeSignals` (line :550):**
Replace the entire function body. The existing `apiGet` call is REMOVED — replaced by direct `safeFetchOrNull`:
```ts
export async function fetchCascadeSignals(code: string, limit = 5): Promise<AgentSignal[]> {
  const url = `${API_GATEWAY_URL}/mcp/api/signals/stock/${encodeURIComponent(code)}?limit=${limit}&type=chain_catalyst`;
  const result = await safeFetchOrNull<AgentSignal[]>(
    url,
    (raw) => {
      const items: unknown[] =
        raw !== null && typeof raw === 'object' && Array.isArray((raw as Record<string, unknown>)['signals'])
          ? ((raw as Record<string, unknown>)['signals'] as unknown[])
          : [];
      return items.map(toAgentSignal).filter((s): s is AgentSignal => s !== null);
    },
    { deadlineMs: 10_000, label: 'cascadeSignals' }
  );
  return result ?? [];
}
```

**`fetchAccuracyDigest` (line :578):**
Replace the entire function body. The existing `apiGet` call is REMOVED:
```ts
export async function fetchAccuracyDigest(days = 30): Promise<AccuracyDigestStats | null> {
  const url = `${API_GATEWAY_URL}/mcp/api/accuracy/digest?days=${days}`;
  return safeFetchOrNull<AccuracyDigestStats>(
    url,
    (raw) => {
      if (raw === null || typeof raw !== 'object') return null;
      return raw as AccuracyDigestStats;
    },
    { deadlineMs: 10_000, label: 'accuracyDigest' }
  );
}
```

**CRITICAL:** Dev-frontend must NOT leave the old `apiGet` calls inside `fetchCascadeSignals` or `fetchAccuracyDigest`. The migration replaces the full body including the `apiGet` call. Leaving `apiGet` would create a double-deadline problem (two AbortControllers in flight, neither aware of the other).

### D-3 — T-3: Cluster B proxy route migrations (29 files)

**Pattern (identical for all 29):**
```ts
import { proxyUpstream } from '~/lib/api/fetchUtils';

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const qs = url.searchParams.toString();
  const upstream = `${MCP_SERVER_BASE_URL}/api/<route>${qs ? `?${qs}` : ''}`;
  return proxyUpstream(upstream, { method: 'GET', headers: { Accept: 'application/json' } }, { label: 'api.<route>' });
}
```

The 3-argument form (`upstream`, `init`, `opts`) replaces the full try/catch block. The label should match the route name (e.g., `'api.alerts'`, `'api.foreign-flow'`, etc.).

**Routes that forward query parameters** (already confirmed in brownfield — `api.alerts.tsx` uses `url.searchParams`): all 29 routes build their `upstream` URL before the `proxyUpstream` call — this is unchanged (EC-3 confirmed: `proxyUpstream` does not forward params; caller builds the URL).

**Content-Type relay confirmed binary-safe:** `proxyUpstream` uses `arrayBuffer()` internally (EC-4 confirmed). Routes serving binary buffers (e.g., `api.bctc-eval.$.tsx`, `api.bctc-inspect.$.tsx`) are safe.

**Note on `api.bctc-inspect.$.tsx` and `api.bctc-eval.$.tsx`** (splat routes): these proxy to dynamic paths. Migration is identical in pattern — the upstream URL includes the splat param. Dev-frontend confirms the URL building logic is unchanged.

### D-4 — T-4: Cluster A loader migrations (28 files)

**Pattern (identical for all 28, using `dashboard.alerts.tsx` as reference):**

Before (40L block):
```ts
export async function fetchAlertsData(origin: string, params?): Promise<LoaderData> {
  let items: AlertItem[] = [];
  // ... multi-line let declarations ...
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) { error = `...`; } else { /* shape check ... */ }
  } catch (err) { error = ...; }
  return { items, count, fetchedAt, error };
}
```

After (4L body):
```ts
import { safeFetch } from '~/lib/api/fetchUtils';

function parseAlertsData(raw: unknown): AlertsDto {
  // EXACT existing shape-check logic extracted here
  // returns empty-shape { items: [], count: 0, fetchedAt: '' } when raw === null or shape mismatch
  if (raw === null || typeof raw !== 'object' || !('items' in raw)) {
    return { items: [], count: 0, fetchedAt: new Date().toISOString() };
  }
  const dto = raw as AlertsDto;
  return {
    items: Array.isArray(dto.items) ? dto.items : [],
    count: typeof dto.count === 'number' ? dto.count : 0,
    fetchedAt: typeof dto.fetchedAt === 'string' ? dto.fetchedAt : new Date().toISOString(),
  };
}

export async function fetchAlertsData(origin: string, params?): Promise<LoaderData> {
  const qs = ...; // existing QS-building logic unchanged
  const url = `${origin}/api/alerts${qs ? `?${qs}` : ''}`;
  const { data, error } = await safeFetch<AlertsDto>(url, parseAlertsData, { label: 'dashboard.alerts' });
  return { items: data.items, count: data.count, fetchedAt: data.fetchedAt, error };
}
```

**Rules for all 28 T-4 files:**
1. Extract the existing shape-check into a named `parseXxx(raw: unknown): XxxDto` function — keep it in the same file.
2. Named `parseXxx` must handle `raw === null` → return empty-shape (see parse-null contract above).
3. The `LoaderData` shape is UNCHANGED. `error: string | null` field already exists in most loaders (confirmed in `dashboard.alerts.tsx:88-93`, `dashboard.foreign-flow.tsx:84-92`, `dashboard.intel.tsx:55-60`). Where it is absent, add it to `LoaderData`.
4. The component already renders `error` in most loaders (confirmed: `dashboard.alerts.tsx` shows error banner at line :569; `dashboard.foreign-flow.tsx` at line :519). Where the component renders a blank render on error, add a `<p>` Vietnamese empty-state. No redesign required.
5. `safeFetch` import: `import { safeFetch } from '~/lib/api/fetchUtils';`

**`dashboard.market-summaries.tsx` special case (2 fetch calls):** Dev-frontend must migrate both fetch calls to `safeFetch`. Each call gets its own `parseXxx` function and its own `{ label: 'dashboard.market-summaries-<A|B>' }`. The combined results flow into the existing `LoaderData` shape.

**`dashboard.vps.tsx` special case:** This loader calls `MCP_SERVER_BASE_URL` directly (not via `/api/*` self-call). Migration uses `safeFetch` — the URL is the full upstream URL. The existing `proxyError` field in `LoaderData` maps to `error` from `safeFetch`. Dev-frontend must ensure `error` flows through to the component's error banner.

**`dashboard.bctc-inspect.tsx`:** EXCLUDED from T-4 (see Brownfield Scan note). Dev-frontend must NOT touch this file.

### D-5 — T-5: Validation gate

`pnpm check` in `apps/frontend/` — zero TypeScript errors required. Container rebuild mandatory (Remix SSR rebuilds server bundle; `docker restart` is insufficient per AC standing rule).

---

## FETCH_DEADLINE_MS Placement and Deadline Strategy

```
USER BROWSER
  │
  ▼ (Remix SSR loader)
dashboard.*.tsx loader  ← safeFetch() AbortController: 55s deadline starts HERE
  │  (HTTP self-call on same container :3001)
  ▼
api.*.tsx proxy route   ← proxyUpstream() AbortController: 55s deadline starts HERE
  │  (HTTP call to mcp-server :3000)
  ▼
mcp-server              ← withDeadline() AbortController: 15–45s inner deadline (W2-MCP-FETCH-DEADLINE)
  │  (HTTP call to upstream VPS / API sources)
  ▼
UPSTREAM SOURCE
```

**Why 55s specifically:**
- The innermost deadline (mcp-server `bctcPdfPullJob`) is 45s.
- The frontend deadline must be > 45s to guarantee the inner hop degrades first (fires its `AbortError` + structured log) BEFORE the outer hop's deadline aborts the proxy TCP connection.
- The gateway ceiling is 60s. 55s leaves a 5s window: inner mcp-server abort fires at 45s → mcp-server returns its error response → the proxy `proxyUpstream` relays the 5xx → the loader `safeFetch` receives the non-2xx response and logs it. All within the 55s window.
- The loader `safeFetch` starts its 55s timer when the LOADER fires the HTTP call to the proxy route (:3001). The proxy `proxyUpstream` starts its own 55s timer when the PROXY fires the HTTP call to mcp-server (:3000). These are independent timers, not coordinated. In the worst case, the total outer chain is 55s + proxy overhead ≈ 55s (the proxy timer fires first and returns 504 to the loader before the loader's own 55s expires on the :3001 self-call). This is correct: both timers fire in the right order.

**Cluster C: 10s override:**
`fetchKinhDichReadingNonFatal`, `fetchCascadeSignals`, `fetchAccuracyDigest`, and `fetchKinhDichReadingNonFatal` pass `{ deadlineMs: 10_000 }`. These are best-effort enrichment calls in parallel tile loops. A 10s deadline: (a) prevents a single stale tile from blocking the watchlist page for 55s, (b) is still generous enough for VPS-proxied data under normal conditions, (c) is documented inline with rationale comment as required by NFR-2.

---

## DDD Layer Map

| Task | File(s) | Remix DDD Layer | Import direction |
|---|---|---|---|
| T-1 | `lib/api/fetchUtils.ts` | Lib — transport primitive (no domain types) | Terminal; imports nothing from project |
| T-2 | `lib/api/client.ts` | Lib — typed API client | `client.ts` → `fetchUtils.ts` (peer downward) |
| T-3 | `routes/api.*.tsx` (29) | Interface — Remix resource routes (proxy) | `routes/` → `fetchUtils.ts` |
| T-4 | `routes/dashboard.*.tsx` (28) | Interface — Remix UI routes + SSR loaders | `routes/` → `fetchUtils.ts` |
| T-5 | validation | — | — |

**No DDD violations detected.** `fetchUtils.ts` imports nothing from `~/routes/`, `~/components/`, `~/domain/`, or `~/lib/api/client.ts`. The import graph is a DAG terminating at `fetchUtils.ts`.

---

## Risk Flags

**RISK-1 (LOW) — `parse(null)` contract coupling:** Every caller's `parseXxx(raw: unknown): XxxDto` must handle `raw === null` to return the empty-shape. If a dev forgets this, `parse(null)` will throw, land in the `catch` block, and call `parse(null)` AGAIN — infinite loop potential. **Mitigation:** Blueprint explicitly states the null-guard requirement. PM must include this in the dev-frontend task description. QA must verify that simulating a 502 (not a timeout) still returns a valid LoaderData (not a crash).

**RISK-2 (LOW) — Double `AbortController` in `dashboard.analysis.tsx`:** This file currently wraps its inline `fetch` in a `try/catch` with no outer `safeFetch` for that call (the `briefResponse` fetch at line :217). The migration adds `safeFetch`. The existing outer `try` block (which wraps the `fetchWatchlistPrices` call from `client.ts`) must NOT be replaced — only the inline fetch becomes `safeFetch`. Dev-frontend must not inadvertently nest `safeFetch` inside another `try/catch` wrapper in this file.

**RISK-3 (LOW) — Timer type variance:** Under the `@remix-run/node` tsconfig, `setTimeout` return type may resolve to `NodeJS.Timeout` or `number` depending on which type definitions win. Using `ReturnType<typeof setTimeout>` is the robust pattern — it works regardless of the ambient type. Dev-frontend must use this pattern exactly as shown in the blueprint above.

**RISK-4 (MEDIUM) — `fetchCascadeSignals` / `fetchAccuracyDigest` double-migration trap:** These two functions currently call `apiGet` (which calls `fetch` internally without a signal). If dev-frontend migrates only by adding `safeFetch` AS A WRAPPER around the existing `apiGet` call — rather than replacing the function body — two `fetch` calls will fire on each invocation (one via `safeFetch`'s `fetch` and one via `apiGet`'s `fetch`). **Mitigation:** Blueprint shows the correct migration pattern (full body replacement). PM task spec must explicitly state "REPLACE the function body, do NOT wrap `apiGet`."

**RISK-5 (LOW) — `dashboard.bctc-inspect.tsx` misclassification:** This file is a resource route in `routes/` that proxies HTML (not JSON). If a dev includes it in either T-3 or T-4 sweep by accident, the migration will fail (T-3 would wrap it in `proxyUpstream` which returns 504/502 JSON — breaking the HTML proxy; T-4 would try to call `safeFetch` on a raw Response relay). **Mitigation:** Explicit exclusion in this design doc. PM task spec must list `dashboard.bctc-inspect.tsx` as excluded by name.

**RISK-6 (LOW) — `FE-PAGE-REORG` task reactivation creates `loader-utils.ts`:** If `FE-PAGE-REORG` spawns without the FR-4 redirect being applied to the BA spec, a second `safeFetch` is created. **Mitigation:** ARCH-RATIFY-FE-4 verdict — PM must update the FE-PAGE-REORG backlog task before spawning `BA-FE-PAGE-REORG`.

---

## Verified Paths

- `apps/frontend/app/lib/api/client.ts` — confirmed at 634L; 4 Cluster C targets identified at lines :283, :489, :550, :578
- `apps/frontend/app/lib/api/fetchUtils.ts` — does NOT exist; T-1 creates it
- `apps/frontend/app/routes/api.alerts.tsx` — reference proxy implementation; 52L; canonical pattern for T-3
- `apps/frontend/app/routes/dashboard.alerts.tsx` — reference loader implementation; 651L; canonical 40L fetch block at :101-147
- `apps/frontend/app/routes/dashboard.foreign-flow.tsx` — 622L; second reference implementation
- `apps/frontend/app/routes/dashboard.intel.tsx` — 226L; third reference (simpler shape)
- `apps/frontend/tsconfig.json` — `lib: ["DOM", "DOM.Iterable", "ES2022"]`; `types: ["@remix-run/node", "vitest/globals"]`; confirms `ReturnType<typeof setTimeout>` pattern required

---

## Test Strategy

**Unit (Vitest — existing test runner):**
- `apps/frontend/app/__tests__/NNN-fetchUtils-safeFetch.test.ts` — test `safeFetch` with a mock fetch: (a) success path returns `{ data, error: null }`, (b) non-2xx returns `{ data: emptyT, error: 'upstream 502' }`, (c) abort (simulate via `controller.abort()`) returns `{ data: emptyT, error: 'AbortError: ...' }`, (d) parse throw returns `{ data: emptyT, error: 'parse error: ...' }`.
- `apps/frontend/app/__tests__/NNN-fetchUtils-proxyUpstream.test.ts` — test `proxyUpstream`: (a) success relays body + status + Content-Type, (b) abort → 504, (c) network error → 502.
- `apps/frontend/app/__tests__/NNN-fetchUtils-safeFetchOrNull.test.ts` — test `safeFetchOrNull`: (a) success returns parsed value, (b) any failure returns `null`, (c) abort returns `null`.
- `apps/frontend/app/__tests__/NNN-parseXxx-cluster-a.test.ts` — per-loader parse functions: confirm empty-shape on `null` input, correct shape on valid input, safe on malformed input.

**Forced-failure integration (per AC-1 through AC-7 — QA-owned):**
- Simulate mcp-server hang: block port 3000. Loader must degrade to Vietnamese empty-state within 55s.
- Simulate proxy 504: call any `/api/*` route with mcp-server blocked. Expect `504 { error: 'upstream timeout' }` within 55s.
- Simulate network error: `docker stop mcp-server`. Proxy must return `502` immediately.
- Simulate non-fatal deadline: slow upstream. `fetchKinhDichReadingNonFatal` must abort within 10s, `null` returned, attribution log visible.

**Regression (AC-6):** All dashboard pages load with live data after migration. `pnpm check` clean.

---

## Reuse Patterns

- **AbortController + setTimeout + finally clearTimeout:** Exact pattern from `FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE` mcp-server `withDeadline`. The three helpers in `fetchUtils.ts` are the frontend equivalent.
- **`err.name === 'AbortError'`:** Confirmed Bun-compatible per ARCH-RATIFY-W2-2 in `FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE` brownfield. Two live callers in `foreignFlowFetcher` and `clients.ts` already use this pattern.
- **Named parse functions + shape-check extraction:** Pattern already used in `client.ts` (`parseHeadlines`, `toHeadline`, `toPricePoint`, `toAgentSignal`). Cluster A migration continues this pattern for the 28 loader files.

---

## Scan Clean

Scan clean: true — no pre-existing `fetchUtils.ts`, no circular import risk, no DDD violations introduced by the design. `dashboard.bctc-inspect.tsx` excluded cleanly. FE-PAGE-REORG absorption confirmed.

---

## Sequencing

Critical path: **T-1 → (T-2 || T-3 || T-4 in parallel — disjoint file sets) → T-5**

T-2, T-3, T-4 touch disjoint files:
- T-2: `lib/api/client.ts` only
- T-3: `routes/api.*.tsx` (29 files)
- T-4: `routes/dashboard.*.tsx` (28 files, excluding `dashboard.bctc-inspect.tsx`)

Per dev-standards parallel dispatch rule: disjoint file sets qualify for `isolation: "worktree"`. However, since T-5 (pnpm check + rebuild) is the shared gate, PM may choose to run T-2/T-3/T-4 as a single dev-frontend task with sequential sub-steps — the file sets are disjoint within a single agent context. PM decides the dispatch model.

---

## Follow-On Tasks (not in this sprint)

PM must mint these as backlog items:

1. **Wave-3: bound dashboard loaders calling `client.ts` typed functions** — `dashboard.db.tsx`, `dashboard.services.tsx`, `dashboard.fetch.tsx`, and `dashboard.analysis.tsx`'s `client.ts` calls. Covers the 4 EC-8 out-of-scope files.
2. **Update FE-PAGE-REORG BA spec FR-4** — redirect `loader-utils.ts safeFetch` → reuse `fetchUtils.ts` (ARCH-RATIFY-FE-4 action).
3. **`dashboard.bctc-inspect.tsx` HTML proxy degrade** — if a hang-safe degrade for the raw HTML relay is needed, design separately (different error contract).

---

## RETURN

```
DONE: Technical design complete, 3/3 clusters mapped, 4 ARCH-RATIFY verdicts issued
ZONE: apps/frontend/
HANDOFF: docs/handoffs/FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH-architect-design.md
NEXT: pm — break into atomic tasks per T-1 through T-5; propagate exclusions (bctc-inspect, apiGet); update FE-PAGE-REORG FR-4 redirect
PIPELINE: continue
```
