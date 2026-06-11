<!-- FE-REAUDIT-1 — stale banners on 5 pages — generated 2026-06-11 by PM -->

## Task: FE-REAUDIT-1 — Add stale warning banners to 5 dashboard pages

**Task ID:** REAUDIT-FE-001  
**Title:** NFR-C-1 stale flag: stale banners on conviction-history, corporate-events, shareholders, financials, reputation pages  
**Sprint:** SHIP-WAVE-REAUDIT  
**Zone:** apps/frontend/  
**Owner:** dev-frontend  
**Priority:** HIGH  
**Depends on:** REAUDIT-002 (mcp-server stale flag contract finalized)  
**Est. effort:** 2–2.5 hours  
**Architecture:** docs/handoffs/SHIP-WAVE-REAUDIT-architect-brief.md § 2. NFR-C-1

---

## Problem Statement

**Items A-05, A-11, A-12, A-14:** Five dashboard pages display data age (asOf field) but do not render a visual warning banner when data exceeds its staleness threshold. After DEV-REAUDIT-2, mcp-server will provide `stale: boolean, staleByDays: number` in each response.

**NFR-C-1 ruling:** Frontend pages must consume these fields and render a warning banner when `stale === true`.

---

## Acceptance Criteria

1. **Stale banner UI pattern**
   - Use existing `asOf` display pattern as template (already in `dashboard.financials.tsx` L399-401, `dashboard.shareholders.tsx` L436-438)
   - Pattern: banner row at top of data section, Vietnamese text
   - Text when stale: "Dữ liệu đã cũ {staleByDays} ngày — có thể không cập nhật" (Data is {N} days old — may not be updated)
   - Use existing UI component library (no new component design)
   - Styling: info/warning color scheme (consistent with site theme)

2. **Update 5 pages: add stale banner rendering**

   | Page | File | Response field | Render location |
   |---|---|---|---|
   | conviction-history | `app/routes/dashboard.conviction-history.tsx` | `stale`, `staleByDays` | Above conviction table |
   | corporate-events | `app/routes/dashboard.corporate-events.tsx` | `stale`, `staleByDays` | Above events table |
   | shareholders | `app/routes/dashboard.shareholders.tsx` | `stale`, `staleByDays` | Above shareholders table |
   | financials | `app/routes/dashboard.financials.tsx` | `stale`, `staleByDays` | Above financials table (extend existing asOf display) |
   | reputation | `app/routes/dashboard.reputation.tsx` | `stale`, `staleByDays` | Above reputation leaderboard |

3. **Implementation pattern**
   - Parse response: extract `stale` and `staleByDays`
   - Conditional render:
     ```jsx
     {stale && (
       <Banner variant="warning">
         {`Dữ liệu đã cũ ${staleByDays} ngày — có thể không cập nhật`}
       </Banner>
     )}
     ```
   - Place banner in logical section (above the main data table/view)
   - No changes to data display logic (only add banner)

4. **Type updates**
   - Update response types in `app/routes/api.*.tsx` files if typed
   - Add `stale?: boolean` and `staleByDays?: number` to each response interface
   - Mark as optional if previous responses lack fields (backward compat)

5. **Testing**
   - Stale = false: no banner rendered
   - Stale = true: banner renders with correct staleByDays value
   - Text renders correctly in Vietnamese
   - Banner responsive (mobile, tablet, desktop)
   - No console errors or type errors

---

## Files to Modify

| File | Layer | Change |
|---|---|---|
| `apps/frontend/app/routes/dashboard.conviction-history.tsx` | page | Add stale banner render |
| `apps/frontend/app/routes/dashboard.corporate-events.tsx` | page | Add stale banner render |
| `apps/frontend/app/routes/dashboard.shareholders.tsx` | page | Add stale banner render + extend asOf pattern |
| `apps/frontend/app/routes/dashboard.financials.tsx` | page | Add stale banner render + extend asOf pattern |
| `apps/frontend/app/routes/dashboard.reputation.tsx` | page | Add stale banner render |
| `apps/frontend/app/routes/api.conviction-history.tsx` | api route | Add type fields (if typed) |
| `apps/frontend/app/routes/api.corporate-events.tsx` | api route | Add type fields (if typed) |
| `apps/frontend/app/routes/api.shareholders.tsx` | api route | Add type fields (if typed) |
| `apps/frontend/app/routes/api.financials.tsx` | api route | Add type fields (if typed) |
| `apps/frontend/app/routes/api.reputation.tsx` | api route | Add type fields (if typed) |

---

## Decision Journal

**Why extend existing asOf pattern instead of new component?**  
`dashboard.financials.tsx` L399-401 and `dashboard.shareholders.tsx` L436-438 already display data age. Reusing that visual pattern ensures consistency and reduces duplication. Stale warning is an enhancement to existing "data age" display, not a separate concern.

**Why Vietnamese text?**  
Non-technical user (France-based, GMT+7 monitor). Plain Vietnamese prose, no jargon per project standards.

**Why mark optional in types?**  
Backward compatibility: if response is cached or comes from old build, fields may not be present. Optional gracefully degrades (no banner, page still works).

---

## Dependent Tasks

- This task depends on REAUDIT-002 (mcp-server contract with stale/staleByDays)
- No downstream dependencies

---

## Links

- Architect brief: `docs/handoffs/SHIP-WAVE-REAUDIT-architect-brief.md`
- BA spec: `docs/handoffs/SHIP-WAVE-REAUDIT-BA-spec.md` § A-05, A-11, A-12, A-14
- Zone standard: `docs/policies/dev-standards.md`
- Template reference: `dashboard.financials.tsx` L399-401, `dashboard.shareholders.tsx` L436-438
