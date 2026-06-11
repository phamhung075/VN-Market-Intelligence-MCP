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

---

## [Developer] Implementation Record

- **Service:** frontend
- **Zone:** apps/frontend/
- **Build tier:** 4 (feature routes)
- **Contract probe:** GET /api/shareholders → stale=true, staleByDays=3 (LIVE 2026-06-11). GET /api/financials → stale=true, staleByDays=43. Other 3 endpoints stale=false, staleByDays=0. All 5 top-level keys confirmed before writing code.
- **Files modified:**
  - `apps/frontend/app/routes/dashboard.conviction-history.tsx` — stale/staleByDays in DTO+LoaderData+fetchConvictionData; renamed partition `stale→staleRows` to avoid conflict with loader field; stale banner render
  - `apps/frontend/app/routes/dashboard.corporate-events.tsx` — stale/staleByDays in DTO+LoaderData+fetchCorporateEventsData; stale banner render
  - `apps/frontend/app/routes/dashboard.shareholders.tsx` — stale/staleByDays in DTO+LoaderData+fetchShareholdersData; stale banner render
  - `apps/frontend/app/routes/dashboard.financials.tsx` — stale/staleByDays in DTO+LoaderData+fetchFinancialsData; stale banner render
  - `apps/frontend/app/routes/dashboard.reputation.tsx` — stale/staleByDays in DTO+LoaderData+fetchReputationData; stale banner render
- **Tests written:** `apps/frontend/app/__tests__/reaudit-fe-001-stale-banners.test.ts` — 21 assertions GREEN (16 suites: stale=false/true/missing/502 for each of 5 endpoints)
- **Git commits:** e787187f feat(frontend/REAUDIT-FE-001): NFR-C-1 stale banners on 5 dashboard pages
- **Type check:** tsc --noEmit exit 0 (0 errors)
- **Service tests:** 21 pass / 0 fail (new); 1438 pass / 21 fail full suite (21 failures are pre-existing nav count tests unrelated to this task — verified via git stash)
- **Docs updated:** NONE
- **Graphify:** skipped (no docs impacted)

### Vitest evidence

```
✓ app/__tests__/reaudit-fe-001-stale-banners.test.ts  (21 tests) 36ms
Test Files  1 passed (1)
     Tests  21 passed (21)
```

### Full suite evidence

```
Test Files  6 failed | 53 passed (59)
     Tests  21 failed | 1438 passed (1459)
```
Pre-existing failures: nav count tests (FE-HEADER-SSOT-top-nav, task17-page14/15/16/17/18-nav) — all fail on stale nav count assertions from earlier sessions; confirmed pre-existing via stash test.

---

## [QA] Review Record — 2026-06-11

**Verdict:** APPROVED
**Round:** 1

**Checks run:**
- `bun test app/__tests__/reaudit-fe-001-stale-banners.test.ts` → 21 pass / 0 fail (QA-reproduced)
- `bun tsc --noEmit` → exit 0 (0 errors)
- DDD scan (infrastructure/application imports) → CLEAN on all 5 modified page files
- Security scan (process.env, secrets) → pre-existing FRONTEND_ORIGIN pattern only; zero lines added in commit diff
- mock-guard exit 0

**Full suite baseline:** 1280 pass / 170 fail with REAUDIT changes; identical 1280/170 without (git stash confirmed). Zero regression introduced by REAUDIT-FE-001 commit.

**Live raw verification (5 pages):**

| Page | API stale flag | API staleByDays | Banner rendered |
|---|---|---|---|
| /dashboard/shareholders | true | 3 | YES — SSR HTML contains "Dữ liệu đã cũ" + amber-950 |
| /dashboard/financials | true | 43 | YES — SSR HTML contains "Dữ liệu đã cũ" + amber-950 |
| /dashboard/conviction-history | false | 0 | NO — "Dữ liệu đã cũ" absent from SSR HTML |
| /dashboard/corporate-events | false | 0 | NO — "Dữ liệu đã cũ" absent from SSR HTML |
| /dashboard/reputation | false | 0 | NO — "Dữ liệu đã cũ" absent from SSR HTML |

Note: conviction-history amber CSS present = row-level StaleTag (pre-existing per-row indicator), NOT page-level stale banner. Confirmed distinct by pattern: row tags use `text-[10px]` badge, page banner uses `role="status"` div.

**Report:** reports/TASK_REPORT_REAUDIT-FE-001.md
**DJ:** docs/agent-memory/decisions/sprint-SHIP-WAVE-REAUDIT-qa.md § qa-S3
