# F-3: frontend — honest source panels + age display

**Sprint:** FETCH-OPS-PAGE-TRUTH  
**Owner:** dev-frontend  
**Size:** M  
**Created:** 2026-06-06T21:35:00Z  
**Depends:** F-1 (new `/api/fetch-status` endpoint must be available)  
**Blocks:** F-3 unblocks QA gate

---

## Summary

Replace the hardcoded Reuters/Bloomberg panels on dashboard.fetch page with:

1. **Source freshness table** — real sources from `GET /api/fetch-status` with per-source age ("N min ago"), direction indicator (green/amber/red), and 24h count.
2. **VPS proxy status panel** — news/prices/bctc/sbv/foreign-flow last push time and staleness indicator.
3. **BCTC pipeline summary** — pending/done/failed counts.
4. **Remove fake latency rendering** — macro snapshot no longer shows `totalLatencyMs` (removed in F-2).

All source names must come from the API response, never hardcoded in the component.

---

## Files to Modify

- `apps/frontend/app/routes/dashboard.fetch.tsx` — replace Reuters/Bloomberg loader + panels
- `apps/frontend/app/lib/api/client.ts` — add `fetchFetchStatus()` function
- `apps/frontend/app/domain/market.ts` — add type definitions for `FetchStatus`, `FetchSourceStatus`, `VpsProxyStatus`, `BctcPipelineStatus`

---

## Acceptance Criteria

1. **AC-1:** `GET :3001/dashboard/fetch` returns 200 — no Reuters or Bloomberg panel rendered.
2. **AC-2:** Source freshness table shows only sources present in DB (populated from `GET /api/fetch-status`), no phantom sources.
3. **AC-3:** Each source row displays: source name, age string (e.g., "14 min ago"), direction indicator (green dot if <2h, amber if 2–12h, red if >12h), and 24h article count.
4. **AC-4:** VPS proxy status section shows: news/prices/bctc/sbv/foreign-flow with last push time and stale status (boolean).
5. **AC-5:** BCTC pipeline section displays: pending count, done count, failed count.
6. **AC-6:** Macro panel does NOT render the latency span (because `totalLatencyMs` is now absent from response).
7. **AC-7:** Raw code verify: no hardcoded source names in the TSX component — all source names come from the API response.
8. **AC-8:** frontend container REBUILT (dev-team ops).

---

## Design Details

### New Types (apps/frontend/app/domain/market.ts)

```typescript
export interface FetchSourceStatus {
  id: string; // source slug (cafef, vnexpress, etc.)
  lastArticleAt: string; // ISO timestamp
  ageMs: number;
  count24h: number;
  status: "fresh" | "stale" | "no-data";
}

export interface VpsProxyServiceStatus {
  last_push: string; // ISO timestamp
  stale: boolean;
  pushes_24h: number;
  errors_24h: number;
}

export interface VpsProxyStatus {
  news: VpsProxyServiceStatus;
  bctc: VpsProxyServiceStatus;
  prices: VpsProxyServiceStatus;
  sbv: VpsProxyServiceStatus;
  "foreign-flow": VpsProxyServiceStatus;
}

export interface BctcPipelineStatus {
  pending: number;
  done: number;
  failed: number;
}

export interface FetchStatus {
  sources: FetchSourceStatus[];
  vpsProxy: VpsProxyStatus;
  bctcPipeline: BctcPipelineStatus;
}
```

### New Client Function (apps/frontend/app/lib/api/client.ts)

```typescript
export async function fetchFetchStatus(): Promise<FetchStatus> {
  const response = await fetch('/api/fetch-status');
  if (!response.ok) {
    throw new Error(`Failed to fetch fetch status: ${response.statusText}`);
  }
  return response.json();
}
```

---

### Dashboard Loader Update (apps/frontend/app/routes/dashboard.fetch.tsx)

**Remove:**
- `fetchReutersHeadlines()` call
- `fetchBloombergHeadlines()` call
- All Reuters/Bloomberg panel rendering code

**Add:**
```typescript
export const loader = async () => {
  const fetchStatus = await fetchFetchStatus();
  const macroSummary = await fetchMacroSummary(); // existing call
  
  return {
    sources: fetchStatus.sources,
    vpsProxy: fetchStatus.vpsProxy,
    bctcPipeline: fetchStatus.bctcPipeline,
    macroSummary
  };
};
```

---

### Dashboard Component Structure

Replace the Reuters/Bloomberg two-column layout with:

1. **Source Freshness Table**
   - Columns: Source Name | Age | Status (green/amber/red dot) | 24h Count
   - Rows: populated from `sources` array
   - Age calculation: `ageMs / 1000 / 60` = minutes, format as "N min ago" or "N h ago"
   - Status indicator CSS class by status enum

2. **VPS Proxy Status Panel**
   - Subheading: "Upstream Data Feeds"
   - Rows: news, prices, bctc, sbv, foreign-flow
   - Columns: Service | Last Push | Status
   - Status icon: green if not stale, red if stale

3. **BCTC Pipeline Summary**
   - Subheading: "PDF Extraction Queue"
   - Inline display: "pending: 5 | done: 120 | failed: 2"

4. **Macro Snapshot Panel** (existing, unchanged except latency removal)
   - Remove the conditional render of `totalLatencyMs` span (it's now gone from server response anyway)

---

## Implementation Notes

- **Client call path:** `fetch('/api/fetch-status')` reaches the gateway's `"api"` virtual alias (NoProbe=true, full path preserved) → `mcp-server:3000/api/fetch-status`.
- **No gateway duality bug:** F-3 uses the new `/api/fetch-status` endpoint (plain `/api/` prefix), not `/mcp/api/`, so F-4 scope changes do not affect this task.
- **Error handling:** If fetch-status call fails, fall back gracefully (empty sources list, show error message).
- **Typing:** Use the new types from domain/market.ts to ensure type safety in loader and component.

---

## Risk Flags

- **R-1 (no hardcoded sources):** Verify JSX component imports source list from loader, not from a hardcoded constant.
- **R-6 (macro latency removal):** The span that renders latency is now dead code (field absent). Either remove it or guard with conditional. Prefer conditional to handle backward compat if needed.

---

## Handoff Acceptance

This task is complete when:
- [ ] New types added to domain/market.ts
- [ ] fetchFetchStatus() function added to client.ts
- [ ] dashboard.fetch.tsx loader calls fetchFetchStatus()
- [ ] Reuters/Bloomberg panels removed from component
- [ ] New source freshness table rendering implemented (age, direction, count)
- [ ] VPS proxy status panel implemented
- [ ] BCTC pipeline summary panel implemented
- [ ] Macro panel latency span conditionally rendered or removed
- [ ] AC-1 through AC-8 verified on running frontend at :3001
- [ ] Code inspection: zero hardcoded source names in TSX
- [ ] frontend container REBUILT (dev-team ops)
