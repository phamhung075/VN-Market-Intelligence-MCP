---
task_id: FIX-ERRAUDIT-W2-FE-T2-CLIENT-CLUSTER-C
type: sprint-task
title: T-2 Migrate Cluster C - 4 non-fatal client wrappers in client.ts
epic: FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH
zone: apps/frontend/
owner: dev-frontend
size: S
created_at: 2026-06-16T07:00:00Z
created_by: pm
depends_on: [FIX-ERRAUDIT-W2-FE-T1-FETCHUTILS-CREATE]
---

## Summary

Migrate 4 non-fatal error-handling wrapper functions in `apps/frontend/app/lib/api/client.ts` from bare `catch { return null/[]/`{}` }` patterns to deadline-bounded `safeFetch` / `safeFetchOrNull` calls. These are best-effort enrichment functions used in parallel tile loops and optional data cards; migration preserves their original degrade contracts (null/[]/`{}` on any error) while adding attribution logging and a 10s deadline.

## Target Functions (4 total in client.ts)

| Function | Line | Current degrade | Migration | New deadline |
|---|---|---|---|---|
| `fetchKinhDichReadingNonFatal` | :283 | `catch { return null }` | `safeFetchOrNull<KinhDichReading>` | 10_000ms |
| `fetchWatchlistPrices` | :489–536 | `catch { return {} }` | `safeFetch<Record<string, WatchlistTileData>>` with `parseWatchlistPrices` returning `{}` on error | 10_000ms |
| `fetchCascadeSignals` | :550 | `catch { return [] }` (via apiGet catch) | Replace full body with `safeFetchOrNull<AgentSignal[]>` (REMOVE `apiGet` call) | 10_000ms |
| `fetchAccuracyDigest` | :578 | `catch { return null }` (via apiGet catch) | Replace full body with `safeFetchOrNull<AccuracyDigestStats>` (REMOVE `apiGet` call) | 10_000ms |

## Acceptance Criteria

### File Changes

- [ ] Import added at top of `client.ts`: `import { safeFetch, safeFetchOrNull } from './fetchUtils.js';` (ESM `.js` extension per dev-standards)

### `fetchKinhDichReadingNonFatal` (line :283)

- [ ] Full function body replaced with `safeFetchOrNull<KinhDichReading>(url, parseKinhDichReading, { deadlineMs: 10_000, label: 'kdReadingNonFatal' })`
- [ ] Parser handles `raw === null || typeof raw !== 'object'` → returns `null`
- [ ] Otherwise type-casts `raw as KinhDichReading` (or validates shape)
- [ ] Comment on 10s deadline: `// 10s: best-effort watchlist tile enrichment; faster degrade preserves tile render`
- [ ] Return type unchanged: `Promise<KinhDichReading | null>`
- [ ] No bare `catch` block remains in this function

### `fetchWatchlistPrices` (line :489)

- [ ] Extract existing shape-check logic (lines ~:505–535) into named `parseWatchlistPrices(raw: unknown): Record<string, WatchlistTileData>` function
  - This function MUST handle `raw === null` → returns `{}` (empty object)
  - Preserves existing two-shape logic: `{ quotes: {} }` and flat array forms
- [ ] Function body replaced with single `safeFetch<Record<string, WatchlistTileData>>` call: 
  ```ts
  const { data } = await safeFetch<Record<string, WatchlistTileData>>(
    url,
    parseWatchlistPrices,
    { deadlineMs: 10_000, label: 'watchlistPrices' }
  );
  return data;
  ```
- [ ] Comment on 10s deadline rationale
- [ ] Return type unchanged: `Promise<Record<string, WatchlistTileData>>` (never null)
- [ ] Caller contract fully preserved (returns `{}` on error)

### `fetchCascadeSignals` (line :550)

- [ ] **CRITICAL:** REPLACE THE FULL FUNCTION BODY — do NOT wrap the existing `apiGet` call
- [ ] Old `apiGet<AgentSignal[]>(...)` call is REMOVED entirely
- [ ] New body uses direct `safeFetchOrNull<AgentSignal[]>(url, parseCascadeSignals, { deadlineMs: 10_000, label: 'cascadeSignals' })`
- [ ] Parser function `parseCascadeSignals`:
  - Handles `raw === null` → returns `null`
  - Extracts `.signals` array from `raw` (existing pattern: `raw !== null && typeof raw === 'object' && 'signals' in raw`)
  - Maps each signal through `toAgentSignal` parser + filters for non-null results
  - Returns `AgentSignal[]` or empty `[]` as fallback
- [ ] Function returns `result ?? []` (converts null → empty array)
- [ ] Return type unchanged: `Promise<AgentSignal[]>`
- [ ] Comment on 10s deadline rationale
- [ ] RISK-4 MITIGATION: This is a full-body replacement, not a wrapper — verify no `apiGet` remains

### `fetchAccuracyDigest` (line :578)

- [ ] **CRITICAL:** REPLACE THE FULL FUNCTION BODY — do NOT wrap the existing `apiGet` call
- [ ] Old `apiGet<AccuracyDigestStats>(...)` call is REMOVED entirely
- [ ] New body uses direct `safeFetchOrNull<AccuracyDigestStats>(url, parseAccuracyDigest, { deadlineMs: 10_000, label: 'accuracyDigest' })`
- [ ] Parser function `parseAccuracyDigest`:
  - Handles `raw === null || typeof raw !== 'object'` → returns `null`
  - Otherwise type-casts `raw as AccuracyDigestStats` (or validates shape)
  - Returns parsed value or null
- [ ] Function returns result directly (type `AccuracyDigestStats | null`)
- [ ] Return type unchanged: `Promise<AccuracyDigestStats | null>`
- [ ] Comment on 10s deadline rationale
- [ ] RISK-4 MITIGATION: This is a full-body replacement, not a wrapper — verify no `apiGet` remains

## Technical Notes

**Deadline Rationale (10_000ms vs 55_000ms default):**
- These 4 functions are best-effort enrichment calls in parallel tile loops (watchlist, dashboard cards)
- A single stale tile must not block the primary page render for 55s
- 10s is generous enough for VPS-proxied data under normal conditions
- Shorter deadline degrades faster and preserves user experience
- Inline comment required per NFR-2

**Parser Function Pattern (RISK-1 mitigation):**
- Each named parser (`parseXxx`) must be callable with `null` and return the safe default (null or empty shape)
- Do not wrap the null check inside the main function — extract it into the parser
- Example: `parseWatchlistPrices(null)` must return `{}`, not throw

**`apiGet` Removal (RISK-4 mitigation):**
- `fetchCascadeSignals` and `fetchAccuracyDigest` currently call `apiGet` inside a `try` that catches and returns null
- Migration REPLACES this pattern entirely with direct `fetch` via `safeFetchOrNull`
- The old `apiGet(url).catch(...)` becomes `await safeFetchOrNull(url, parse)`
- Do NOT create a double-deadline scenario by leaving `apiGet` in place

## Code Example (from architect blueprint)

**`fetchCascadeSignals` migration:**
```ts
function parseCascadeSignals(raw: unknown): AgentSignal[] {
  const items: unknown[] =
    raw !== null && typeof raw === 'object' && Array.isArray((raw as Record<string, unknown>)['signals'])
      ? ((raw as Record<string, unknown>)['signals'] as unknown[])
      : [];
  return items.map(toAgentSignal).filter((s): s is AgentSignal => s !== null);
}

export async function fetchCascadeSignals(code: string, limit = 5): Promise<AgentSignal[]> {
  const url = `${API_GATEWAY_URL}/mcp/api/signals/stock/${encodeURIComponent(code)}?limit=${limit}&type=chain_catalyst`;
  const result = await safeFetchOrNull<AgentSignal[]>(
    url,
    parseCascadeSignals,
    { deadlineMs: 10_000, label: 'cascadeSignals' }
  );
  return result ?? [];
}
```

## Test Gate (QA Ownership)

- [ ] All 4 functions execute with live data and return expected types (no TypeScript errors)
- [ ] With mcp-server healthy: each function returns valid data (non-null, non-empty)
- [ ] With network error simulated: each function returns safe default (null or []/`{}`) within 10s
- [ ] Server logs show single `console.error` per failed call with label attribution
- [ ] Watchlist page renders (with missing enrichment data) when these calls fail — no crash

## Next Step (on completion)

- Code complete + local test → ready for T-5 (validation gate)
- Can run in parallel with T-3 and T-4 (disjoint files)

## Reference

- Architect blueprint: `docs/handoffs/FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH-architect-design.md` § D-2 (lines 345–424)
- BA spec: `docs/handoffs/FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH-BA-spec.md` § Cluster C migration (lines 335–343)
