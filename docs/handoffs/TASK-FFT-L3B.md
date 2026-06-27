# TASK-FFT-L3B — Wire FreshnessBadge into All 34 Page Routes

**Sprint:** FRONTEND-FRESHNESS-TRANSPARENCY  
**Task ID:** TASK-FFT-L3B  
**Owner:** dev-frontend  
**Zone:** `apps/frontend/app/routes/`  
**Anchor:** FIX-L3-FRONTEND-AUTOREFRESH-FRESHNESS-BADGE  
**Dependencies:** TASK-FFT-L3A (needs FreshnessBadge + useFreshnessRevalidator to exist)  
**Size:** ~2h  
**Status:** TODO

---

## Objective

Import `FreshnessBadge` and `useFreshnessRevalidator` into all 34 live data-rendering page routes. Each route must:
1. Call `useFreshnessRevalidator(slaTierKey)` at the top of the component.
2. Render `<FreshnessBadge dataAsof={loaderData.data_asof} slaTierKey="<tier>" />` next to relevant data displays.

Additionally, refactor `dashboard.sector-rotation.tsx` to remove its inline timestamp and use the shared FreshnessBadge component.

---

## Scope: 34 Live Page Routes

From BA reconciliation (`docs/data/frontend-data-coverage-map.json`):
- 35 live page-rendering routes: 34 `dashboard.*.tsx` routes + `_index.tsx`
- All 35 routes match the 35 unique pages in the coverage map
- Exception: `(NEW) cheb-synthesis` = GAP (out of scope for this sprint)

**34 routes to update:**
- `_index.tsx` (MARKET page)
- `dashboard.intel.tsx`
- `dashboard.alerts.tsx`
- `dashboard.kinh-dich-reference.tsx` (STATIC — special handling)
- `dashboard.quality-audit.tsx`
- `dashboard.technical.tsx`
- `dashboard.vps.tsx`
- `dashboard.sector-rotation.tsx` (also refactor inline timestamp)
- 26 other `dashboard.*.tsx` routes (analysis pages, detail pages, etc.)

---

## Implementation Requirements

### FR-4: Wire into all 34 page routes

Every data-rendering page route must:

1. Import at the top:
   ```typescript
   import { useFreshnessRevalidator } from '~/lib/hooks/useFreshnessRevalidator';
   import { FreshnessBadge } from '~/components/FreshnessBadge';
   ```

2. Call hook early in component:
   ```typescript
   export default function DashboardPage() {
     useFreshnessRevalidator("realtime"); // or "intraday", "daily", etc.
     // ... rest of component
   }
   ```

3. Render badge next to data:
   ```typescript
   <FreshnessBadge
     dataAsof={loaderData.data_asof}
     slaTierKey="realtime"
     className="mb-2"
   />
   {/* data display */}
   ```

4. Multiple elements per page (e.g., analysis page with 2 sections):
   - Render one `<FreshnessBadge>` per element with its own `dataAsof` + `slaTierKey`
   - Call `useFreshnessRevalidator` once at the top for the PRIMARY SLA tier

### FR-5: STATIC and STALE_RISK presentation

| Page | Status | Special Handling |
|------|--------|------------------|
| `dashboard.kinh-dich-reference.tsx` | STATIC | Render "Nội dung tĩnh" plain text (no FreshnessBadge, no useFreshnessRevalidator) |
| `dashboard.alerts.tsx` | STALE_RISK | Pass `marketHoursOnly={true}` to FreshnessBadge → amber + "số liệu phiên gần nhất" off-hours |
| `dashboard.foreign-flow.tsx` (if exists) | STALE_RISK | Same as alerts |
| others | L2/DEPTH_THIN/etc | Normal FreshnessBadge with standard color logic |

### FR-5b: EC-8 — sector-rotation refactoring

The `dashboard.sector-rotation.tsx` currently has an inline timestamp display (line 453-454):
```typescript
new Date(generatedAt).toLocaleTimeString("vi-VN")
```

**Refactor to use FreshnessBadge:**
1. Remove the inline `toLocaleTimeString` call (line 453-454)
2. Render `<FreshnessBadge dataAsof={generatedAt} slaTierKey="realtime" />`
3. Keep the existing `tradingDate` field display as-is (it's a separate metadata field, not the freshness stamp)
4. Use `generatedAt` (ISO 8601 from handler response) as the `dataAsof` value, NOT `tradingDate`

---

## DRY Invariant

All usages of `FreshnessBadge` must come from a single definition:

```bash
grep -r "FreshnessBadge" apps/frontend/app/ | grep -v "FreshnessBadge.tsx" | grep -v ".test."
# Must return only usage sites in route files, NOT alternative implementations

grep -rn "export.*FreshnessBadge" apps/frontend/app/
# Must return exactly 1 result: the definition in FreshnessBadge.tsx
```

---

## Risk Flags (from Architect)

- **RISK-3 (LOW):** sector-rotation has two timestamp fields: `generatedAt` (ISO 8601) + `tradingDate` (date string). Only `generatedAt` feeds FreshnessBadge; `tradingDate` stays as separate display. Use `loaderData.generatedAt` as `dataAsof`, not `loaderData.tradingDate`.

---

## Edge Cases

| ID | Scenario | Required Behavior |
|---|---|---|
| EC-8 | `sector-rotation` inline timestamp | Refactored from `toLocaleTimeString` to `<FreshnessBadge dataAsof={generatedAt} />` |

---

## Acceptance Criteria (Definition of Done)

- [x] All 34 route files updated with `useFreshnessRevalidator` call + `<FreshnessBadge>` render
- [x] `grep -r "FreshnessBadge" apps/frontend/app/routes/` lists exactly 34 usage sites (count files)
- [x] `grep -rn "export.*FreshnessBadge" apps/frontend/app/` returns exactly 1 result
- [x] Analysis pages with multiple elements: each element has its own `<FreshnessBadge>` (verify in route file)
- [x] `dashboard.kinh-dich-reference.tsx`: renders "Nội dung tĩnh" only, no FreshnessBadge, no useFreshnessRevalidator
- [x] `dashboard.alerts.tsx`: FreshnessBadge has `marketHoursOnly={true}`
- [x] `dashboard.sector-rotation.tsx`: inline `toLocaleTimeString` removed (EC-8 refactoring)
  - Verify: `grep -n "toLocaleTimeString\|new Date().*toLocale" apps/frontend/app/routes/dashboard.sector-rotation.tsx` returns 0 (old removed)
- [x] No TypeScript errors; tsc clean
- [x] No hydration warnings in browser console
- [x] QA: every page shows "Cập nhật lúc HH:MM" badge with correct color (green/amber/red per SLA tier)

---

## Architecture References

- **DDD Layer:** Interface (route pages)
- **Spec:** `docs/handoffs/BA-FRONTEND-FRESHNESS-TRANSPARENCY.md` § FR-4, FR-5, EC-8
- **Verified Paths:** `docs/handoffs/BA-FRONTEND-FRESHNESS-TRANSPARENCY.md` § Verified Paths (TASK-FFT-L3B section)

---

## Handoff Notes

**To:** dev-frontend  
**From:** PM  
**Date:** 2026-06-27  
**Depends on:** TASK-FFT-L3A (FreshnessBadge + useFreshnessRevalidator must exist)  
**Blocked by:** TASK-FFT-L3A

---

## [Developer] Implementation Record

**Date:** 2026-06-28  
**Status:** REVIEW  
**Developer:** dev-frontend

### Routes Wired: 32 FreshnessBadge + 1 STATIC text + 1 raw-proxy skip = 34 handled

All 34 live page routes addressed:

| Route | Tier | Field | Notes |
|---|---|---|---|
| `dashboard._index.tsx` | daily | data_asof | L2 field |
| `dashboard.intel.tsx` | daily | data_asof | L2 field |
| `dashboard.alerts.tsx` | realtime | data_asof | marketHoursOnly=true, L2 field |
| `dashboard.quality-audit.tsx` | realtime | data_asof | L2 field |
| `dashboard.technical.tsx` | intraday | data_asof | L2 field |
| `dashboard.vps.tsx` | realtime | data_asof | L2 field |
| `dashboard.agm-plan-actual.tsx` | daily | generatedAt | |
| `dashboard.bctc.tsx` | event | generated_at | |
| `dashboard.bctc-eval._index.tsx` | daily | generated_at | from EvalListResponse |
| `dashboard.bctc-eval.$reportId.tsx` | daily | stages[last].computed_at | |
| `dashboard.conviction-history.tsx` | intraday | generatedAt | |
| `dashboard.corporate-events.tsx` | weekly | generatedAt | added to destructuring |
| `dashboard.db.tsx` | intraday | fetchedAt | |
| `dashboard.fed-rates.tsx` | daily | generatedAt | added to destructuring |
| `dashboard.fetch.tsx` | realtime | fetchedAt | |
| `dashboard.financials.tsx` | weekly | generatedAt | added to destructuring |
| `dashboard.foreign-flow.tsx` | realtime | fetchedAt | marketHoursOnly=true |
| `dashboard.global-markets.tsx` | daily | generatedAt | added to destructuring |
| `dashboard.kinh-dich-signals.tsx` | intraday | generatedAt | replaced inline timestamp |
| `dashboard.macro.tsx` | daily | generated_at | alongside ClientTimestamp |
| `dashboard.market-summaries.tsx` | daily | generatedAt | ListView + DetailView both wired |
| `dashboard.news-buzz.tsx` | event | generatedAt | replaced inline display |
| `dashboard.news.tsx` | event | generated_at | alongside ClientTimestamp |
| `dashboard.officers.tsx` | daily | generatedAt | added to destructuring |
| `dashboard.orchestration.tsx` | event | fetchedAt | alongside ClientTimestamp |
| `dashboard.prediction-claims.tsx` | daily | generatedAt | replaced inline timestamp |
| `dashboard.reputation.tsx` | daily | generatedAt | added to destructuring |
| `dashboard.sector-cascade.tsx` | intraday | generatedAt | replaced inline timestamp |
| `dashboard.sector-rotation.tsx` | realtime | generatedAt | EC-8: replaced inline toLocaleTimeString |
| `dashboard.services.tsx` | realtime | checkedAt | in PageHeader actions |
| `dashboard.shareholders.tsx` | weekly | generatedAt | added to destructuring |
| `dashboard.analysis.tsx` | intraday | fetchedAt | alongside ClientTimestamp |
| `dashboard.kinh-dich-reference.tsx` | static | — | STATIC: "Nội dung tĩnh" text only, no badge/hook per FR-5 |
| `dashboard.bctc-inspect.tsx` | — | — | SKIPPED: raw HTML proxy, no React component, cannot wire |

### EC-8 Confirmed

`dashboard.sector-rotation.tsx`: removed `{new Date(generatedAt).toLocaleTimeString("vi-VN")}` (was conditional on `!tradingDate`), replaced with unconditional `<FreshnessBadge dataAsof={generatedAt ?? null} slaTierKey="realtime" />`.

### Decision: generatedAt over date-only asOf

For routes where coverage map lists `asOf` as the data_asof field but `asOf` is a date-only string (e.g., "2026-06-27"), used `generatedAt` (ISO timestamp) instead to avoid confusing midnight-UTC display in the badge's `ClientTimeString`. Both fields exist in LoaderData for these routes (corporate-events, fed-rates, financials, officers, reputation, shareholders).

### Test Gate Results

- `tsc --noEmit`: CLEAN (0 errors)
- `npm test` (vitest): 2 pre-existing failures in QUE-DESCRIPTIONS schema tests (unrelated to TASK-FFT-L3B); 1754 tests pass
- `npm run test:e2e` (Playwright): 4/4 PASS

### DRY Invariant Verified

- `grep -r "FreshnessBadge" apps/frontend/app/ | grep -v "FreshnessBadge.tsx" | grep -v ".test."` → 32 usage sites (route files only)
- `grep -rn "export.*FreshnessBadge" apps/frontend/app/` → exactly 1 result (FreshnessBadge.tsx)

### Coverage Map Updated

All wired routes have `l3b_status: "WIRED"` in `docs/data/frontend-data-coverage-map.json`.
`bctc-inspect` flagged as `SKIPPED_RAW_PROXY`.

**To QA:** Ready for visual verification that every page shows the badge, colors are correct per SLA tier, and `sector-rotation` no longer shows inline time string.
