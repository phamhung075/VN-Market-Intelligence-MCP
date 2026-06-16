---
task_id: FIX-ERRAUDIT-W2-FE-T4-LOADERS-CLUSTER-A
type: sprint-task
title: T-4 Migrate Cluster A - 28 dashboard.*.tsx loaders
epic: FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH
zone: apps/frontend/
owner: dev-frontend
size: L
created_at: 2026-06-16T07:00:00Z
created_by: pm
depends_on: [FIX-ERRAUDIT-W2-FE-T1-FETCHUTILS-CREATE]
---

## Summary

Migrate 28 Remix UI route loaders in `apps/frontend/app/routes/dashboard.*.tsx` from inline ~40-line try/fetch/parse blocks to the bounded `safeFetch<T>` helper. Each migration extracts the existing shape-check logic into a named parser function and replaces the fetch block with a single `safeFetch` call, reducing boilerplate and adding deadline + structured error logging.

## Target Files (28 total)

All dashboard route loaders with inline fetch patterns (verified by architect brownfield):

1. `dashboard._index.tsx` — fetch market-digest
2. `dashboard.agm-plan-actual.tsx`
3. `dashboard.alerts.tsx` (reference implementation; 40L fetch block :101–147)
4. `dashboard.analysis.tsx` — **NOTE: HYBRID** (see special case below)
5. `dashboard.bctc.tsx` — fetch analysis-briefs
6. `dashboard.conviction-history.tsx`
7. `dashboard.corporate-events.tsx`
8. `dashboard.fed-rates.tsx`
9. `dashboard.financials.tsx`
10. `dashboard.foreign-flow.tsx` (reference implementation; 40L block)
11. `dashboard.global-markets.tsx`
12. `dashboard.intel.tsx` (reference implementation; 40L block)
13. `dashboard.kinh-dich-signals.tsx`
14. `dashboard.macro.tsx` — fetch macro-regime
15. `dashboard.market-summaries.tsx` — **2 fetch calls** (see special case below)
16. `dashboard.news-buzz.tsx`
17. `dashboard.news.tsx` — fetch news-sentiment
18. `dashboard.officers.tsx`
19. `dashboard.orchestration.tsx` — fetch orchestration
20. `dashboard.prediction-claims.tsx`
21. `dashboard.quality-audit.tsx` — fetch quality-checklist
22. `dashboard.reputation.tsx`
23. `dashboard.sector-cascade.tsx`
24. `dashboard.sector-rotation.tsx`
25. `dashboard.shareholders.tsx`
26. `dashboard.technical.tsx` — fetch price-history
27. `dashboard.vps.tsx` — **SPECIAL CASE** (direct mcp-server call, not /api/* self-call)

**EXCLUSION:** `dashboard.bctc-inspect.tsx` — This is a resource route that relays raw HTML, not JSON data. Do NOT touch this file. It is marked as out-of-scope.

## Acceptance Criteria

### Pattern Transformation (applies to all 28 files)

**Before (existing ~40-line pattern in each loader):**
```ts
export async function loader({ request }: LoaderFunctionArgs): Promise<LoaderData> {
  let items: AlertItem[] = [];
  let count = 0;
  let fetchedAt: string = new Date().toISOString();
  let error: string | null = null;
  
  try {
    const response = await fetch(`${origin}/api/alerts`, {
      headers: { Accept: 'application/json' }
    });
    
    if (!response.ok) {
      error = `Upstream returned ${response.status}`;
    } else {
      const raw = (await response.json()) as unknown;
      
      // Shape check (varies per file):
      if (raw !== null && typeof raw === 'object' && 'items' in raw) {
        const dto = raw as AlertsDto;
        items = Array.isArray(dto.items) ? dto.items : [];
        count = typeof dto.count === 'number' ? dto.count : 0;
        fetchedAt = typeof dto.fetchedAt === 'string' ? dto.fetchedAt : fetchedAt;
      }
    }
  } catch (err) {
    error = err instanceof Error ? err.message : 'Connection error';
  }
  
  return { items, count, fetchedAt, error };
}
```

**After (simplified pattern using safeFetch):**
```ts
import { safeFetch } from '~/lib/api/fetchUtils';

function parseAlertsData(raw: unknown): AlertsDto {
  // Exact existing shape-check logic extracted here
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

export async function loader({ request }: LoaderFunctionArgs): Promise<LoaderData> {
  const { data, error } = await safeFetch<AlertsDto>(
    `${origin}/api/alerts`,
    parseAlertsData,
    { label: 'dashboard.alerts' }
  );
  
  return {
    items: data.items,
    count: data.count,
    fetchedAt: data.fetchedAt,
    error
  };
}
```

**Key transformation rules:**
- Extract existing inline shape-check logic into a named `parseXxx(raw: unknown): XxxDto` function in the same file
- The `parseXxx` function MUST handle `raw === null` → return empty-shape (e.g., `{ items: [], count: 0, fetchedAt: '' }`)
- Replace the full ~40-line try/fetch/parse block with single `safeFetch<XxxDto>(url, parseXxx, { label: 'dashboard.xxx' })` call
- Import statement: `import { safeFetch } from '~/lib/api/fetchUtils';`
- Propagate `error` field from `safeFetch` result into the loader return shape (already exists in most loaders)
- Ensure the component renders a Vietnamese empty-state when `error !== null` (if currently blank, add one `<p>` element)
- LoaderData return shape UNCHANGED (callers depend on `{ items, count, error, ... }`)

### File-by-file Requirements

#### Standard Files (27 of 28)

For each of the 27 standard dashboard loaders:

- [ ] Named `parseXxx` function extracted (handles `raw === null` → empty-shape)
- [ ] ~40-line try/fetch/parse block replaced with `safeFetch<XxxDto>(url, parseXxx, { label: 'dashboard.xxx' })`
- [ ] `error` field propagated into LoaderData return (add if missing)
- [ ] Component renders Vietnamese empty-state on `error !== null` (visual regression check)
- [ ] LoaderData shape unchanged (all existing fields preserved)

#### Special Case 1: `dashboard.market-summaries.tsx` (2 fetch calls)

This loader calls two different APIs (two data sources). Migration:

- [ ] Create TWO named parse functions: `parseMarketSummariesA(...)` and `parseMarketSummariesB(...)`
- [ ] Create TWO `safeFetch` calls (separate calls, each with own deadline + label)
- [ ] Label each: `'dashboard.market-summaries-A'` and `'dashboard.market-summaries-B'`
- [ ] Combine results into single LoaderData return
- [ ] Component receives combined data from both sources

#### Special Case 2: `dashboard.vps.tsx` (direct mcp-server call)

This loader calls `MCP_SERVER_BASE_URL` directly (not via `/api/*` self-call). Migration:

- [ ] URL remains direct to mcp-server: `${MCP_SERVER_BASE_URL}/api/vps-proxy-health`
- [ ] Use `safeFetch` (same as other loaders)
- [ ] Named parser handles the vps-specific response shape
- [ ] Existing `proxyError` field in LoaderData maps to `error` from `safeFetch`
- [ ] Ensure `error` flows to component's error banner

#### Special Case 3: `dashboard.analysis.tsx` (hybrid — MIXED scope)

This loader is a hybrid:
- One inline `fetch(.../api/analysis-brief/...)` — **IN SCOPE for T-4** (migrate to `safeFetch`)
- Calls to `fetchWatchlistPrices` from `client.ts` — **OUT OF SCOPE for T-4** (those are Cluster C, already migrated in T-2)

Migration:
- [ ] Extract shape-check for the inline fetch into `parseAnalysisBrief(...)`
- [ ] Replace inline fetch with `safeFetch<AnalysisBriefDto>(url, parseAnalysisBrief, { label: 'dashboard.analysis' })`
- [ ] Do NOT change the `client.ts` function calls (those are updated separately in T-2)
- [ ] Ensure outer `try` block (if it wraps both the inline fetch and client.ts calls) is carefully unwound to avoid nesting `safeFetch` inside another try/catch
- [ ] LoaderData return includes both the analysis brief data AND the watchlist data from `client.ts`

**RISK-2 mitigation:** Do NOT accidentally wrap `safeFetch` inside another try/catch. The function call should be clean: `const { data, error } = await safeFetch(...)` without a surrounding catch block.

### LoaderData Shape Preservation

- [ ] `error` field exists in LoaderData for all 28 files (add if missing)
- [ ] All existing fields in LoaderData returned unchanged
- [ ] Callers (component layer) depend on same structure — no breaking change

### Component Rendering Gate

For each migrated loader:

- [ ] Component renders a Vietnamese empty-state when `error !== null`
- [ ] Empty-state is visible and graceful (not a blank screen)
- [ ] If component currently shows a blank render on error, add one `<p>` element:
  ```tsx
  {error && <p>Không thể tải dữ liệu — vui lòng thử lại</p>}
  ```
- [ ] No redesign needed — just ensure error is rendered

## Cluster A File List (confirmed by architect brownfield)

Exact 28 files per architect design (lines 36–68):

1. `dashboard._index.tsx`
2. `dashboard.agm-plan-actual.tsx`
3. `dashboard.alerts.tsx`
4. `dashboard.bctc.tsx`
5. `dashboard.conviction-history.tsx`
6. `dashboard.corporate-events.tsx`
7. `dashboard.fed-rates.tsx`
8. `dashboard.financials.tsx`
9. `dashboard.foreign-flow.tsx`
10. `dashboard.global-markets.tsx`
11. `dashboard.intel.tsx`
12. `dashboard.kinh-dich-signals.tsx`
13. `dashboard.macro.tsx`
14. `dashboard.market-summaries.tsx` (2 fetch calls)
15. `dashboard.news-buzz.tsx`
16. `dashboard.news.tsx`
17. `dashboard.officers.tsx`
18. `dashboard.orchestration.tsx`
19. `dashboard.prediction-claims.tsx`
20. `dashboard.quality-audit.tsx`
21. `dashboard.reputation.tsx`
22. `dashboard.sector-cascade.tsx`
23. `dashboard.sector-rotation.tsx`
24. `dashboard.shareholders.tsx`
25. `dashboard.technical.tsx`
26. `dashboard.vps.tsx`
27. `dashboard.analysis.tsx` (hybrid; inline fetch in scope)
28. **Total: 28 files / 30 fetch call sites** (market-summaries has 2 calls)

**EXCLUSION:** `dashboard.bctc-inspect.tsx` — Do NOT migrate. This is a resource route that relays raw HTML. Out of scope for this wave.

## Code Example (from architect blueprint)

**Full migration example — `dashboard.alerts.tsx`:**

See architect design lines 469–491 for the before/after pattern.

## Test Gate (QA Ownership)

- [ ] All 28 loaders execute successfully with live data when services are healthy
- [ ] LoaderData shapes unchanged (component tests green untouched)
- [ ] With mcp-server hung (block port 3000): each loader returns within 55s with `error` populated (Vietnamese empty-state renders)
- [ ] Server logs show single `console.error` per timeout with label attribution (e.g., `[safeFetch][dashboard.alerts] AbortError: ...`)
- [ ] Dashboard pages render gracefully on error (not blank screens, not unhandled rejections)
- [ ] Vietnamese empty-state messages visible when data unavailable
- [ ] `pnpm check` passes (zero TypeScript errors)

## Code Review Gate

- [ ] All 28 files migrated (excluding `dashboard.bctc-inspect.tsx`)
- [ ] Import statement in each file: `import { safeFetch } from '~/lib/api/fetchUtils';`
- [ ] No inline ~40-line try/fetch/parse block remains (all extracted to `safeFetch` call)
- [ ] All named `parseXxx` functions handle `raw === null` → empty-shape
- [ ] LoaderData return shape unchanged for all files
- [ ] Component rendering gates checked (error → Vietnamese empty-state)
- [ ] Special cases handled: market-summaries (2 calls), vps (direct call), analysis (hybrid)

## Next Step (on completion)

- Code complete + local test → ready for T-5 (validation gate)
- Can run in parallel with T-2 and T-3 (disjoint files)

## Reference

- Architect blueprint: `docs/handoffs/FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH-architect-design.md` § D-4 (lines 450–504)
- BA spec: `docs/handoffs/FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH-BA-spec.md` § Cluster A migration (lines 259–299)
- Reference implementations:
  - `dashboard.alerts.tsx` (architect design lines 469–491)
  - `dashboard.foreign-flow.tsx` (architect mentions; brownfield verified)
  - `dashboard.intel.tsx` (architect mentions; brownfield verified)

## Notes

**RISK-1 (parse(null) contract):** Each `parseXxx` function must handle `raw === null` by returning the empty-shape `T`. If a dev forgets this, `parse(null)` will throw, land in the catch block, and call `parse(null)` again — infinite loop potential. Blueprint explicitly states the null-guard requirement. Ensure every parser has this guard.

**RISK-2 (dashboard.analysis.tsx double AbortController):** This file has both an inline fetch (in scope) and client.ts calls (out of scope). Ensure the `safeFetch` call for the inline fetch is NOT wrapped inside another try/catch block (that would create a double-deadline scenario). Clean call: `const { data, error } = await safeFetch(...)` without surrounding catch.

**RISK-5 (bctc-inspect.tsx misclassification):** This file is NOT a dashboard loader with LoaderData shape — it is a resource route that relays HTML. Do NOT touch it in this task. It is explicitly excluded.

**LoaderData field preservation:** The `error` field already exists in most loaders (confirmed in `dashboard.alerts.tsx:88–93`, `dashboard.foreign-flow.tsx:84–92`, `dashboard.intel.tsx:55–60`). Where missing, add it to the LoaderData return type.
