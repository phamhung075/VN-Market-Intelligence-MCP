<!-- FE-REAUDIT-2 — foreign-flow stale_fields column badge — generated 2026-06-11 by PM -->

## Task: FE-REAUDIT-2 — Add stale_fields column badge to foreign-flow dashboard page

**Task ID:** REAUDIT-FE-002  
**Title:** NFR-C-5 foreign-flow stale_fields: column header badge on unavailable fields  
**Sprint:** SHIP-WAVE-REAUDIT  
**Zone:** apps/frontend/  
**Owner:** dev-frontend  
**Priority:** HIGH  
**Depends on:** REAUDIT-003 (mcp-server stale_fields contract finalized)  
**Est. effort:** 1–1.5 hours  
**Architecture:** docs/handoffs/SHIP-WAVE-REAUDIT-architect-brief.md § 3. NFR-C-5

---

## Problem Statement

**Item A-02:** After DEV-REAUDIT-3, `foreignFlowHandler` will provide `stale_fields: string[]` in response, listing fields that are unavailable on >50% of items (currently: currentHoldingRatio, maxHoldingRatio, marketCapBn). Frontend shows "—" in every cell, which looks like missing data for today when actually the field is structurally unavailable.

**NFR-C-5 ruling:** Frontend page reads stale_fields array and renders a "Không có dữ liệu" (No data) badge on the column header instead of row-by-row "—".

---

## Acceptance Criteria

1. **Parse `stale_fields` from response**
   - Extract array from API response: `response.stale_fields`
   - Use to gate column rendering logic

2. **Column header badge rendering**
   - When `stale_fields.includes("currentHoldingRatio")`:
     - Show column header with badge/label "Tỷ lệ nắm giữ hiện tại" + "Không có dữ liệu"
     - Optionally dim/disable column content (or show "—" but with visual distinction)
   - Same pattern for `maxHoldingRatio` and `marketCapBn` if in stale_fields
   - Use existing Badge component from UI library (no new component design)

3. **Table rendering**
   - Current behavior: all columns always rendered, cells show "—" if null
   - After fix: 
     - Columns in stale_fields get header badge signaling unavailability
     - Cells can remain "—" OR be visually distinct (grayed out, striped, etc.)
     - Rows with actual data in other columns still render fully

4. **Type updates**
   - Update response type in `app/routes/api.foreign-flow.tsx`:
     ```typescript
     stale_fields?: string[]  // array of field names unavailable at source
     ```

5. **Testing**
   - stale_fields is empty: all columns render normally
   - stale_fields includes "currentHoldingRatio": that column header has badge
   - Badge text is correct Vietnamese: "Không có dữ liệu"
   - No console errors
   - Responsive design: badge fits on mobile column header

---

## Files to Modify

| File | Layer | Change |
|---|---|---|
| `apps/frontend/app/routes/dashboard.foreign-flow.tsx` | page | Add stale_fields parsing + column header badge render |
| `apps/frontend/app/routes/api.foreign-flow.tsx` | api route | Add `stale_fields` type field |

---

## Decision Journal

**Why column-header badge vs. cell-level display?**  
Current design shows "—" in every cell for that column, which scales poorly (103 rows * 1 field = 103 repetitions). A single badge on the column header signals unavailability clearly and efficiently. It's an at-a-glance indicator instead of per-row noise.

**Why not filter out the column entirely?**  
Keeping the column (with header badge) preserves visual layout consistency. Users familiar with the page structure see the column is there but unavailable, not wondering "where did that column go?".

**Why Vietnamese badge text?**  
Consistent with project standards (non-technical user, plain Vietnamese prose).

---

## Dependent Tasks

- This task depends on REAUDIT-003 (mcp-server contract with stale_fields)
- No downstream dependencies

---

## Links

- Architect brief: `docs/handoffs/SHIP-WAVE-REAUDIT-architect-brief.md`
- BA spec: `docs/handoffs/SHIP-WAVE-REAUDIT-BA-spec.md` § A-02
- Zone standard: `docs/policies/dev-standards.md`

---

## [Developer] Implementation Record

- **Service:** frontend
- **Zone:** apps/frontend/
- **Build tier:** 4 (feature route update)
- **Files modified:**
  - `apps/frontend/app/routes/dashboard.foreign-flow.tsx` — ForeignFlowDto.stale_fields?:string[], LoaderData.stale_fields:string[], fetchForeignFlowData stale_fields parse+default-[]; isFieldStale()+staleColumnLabel() helpers exported; column headers "Tỷ lệ sở hữu"+"Vốn hóa" render "Không có dữ liệu" badge when field in stale_fields
- **Tests written:**
  - `apps/frontend/app/__tests__/reaudit-fe-002-foreign-flow-stale-fields.test.ts` — 15 assertions GREEN (stale_fields parse, backward-compat absent→[], 5xx→[], network→[], all 3 live fields, isFieldStale 4 cases, staleColumnLabel 5 cases)
- **Git commits:** 11308f1c feat(frontend/REAUDIT-FE-002): stale_fields column header badge on foreign-flow page
- **Type check:** tsc --noEmit exit 0 (clean)
- **Service tests:** 15 pass / 0 fail (new); 1474/1495 total — 21 pre-existing nav-count failures unrelated to this task (confirmed pre-existing)
- **Playwright gate:** 4/4 render checks PASS
- **Live probe:** curl http://localhost:3001/api/foreign-flow?limit=5 2026-06-12 → stale_fields=["currentHoldingRatio","maxHoldingRatio","marketCapBn"] confirmed; contract used as source of truth per rule.
- **Docs updated:** NONE (no architecture doc impact — Tier 4 feature extension only)
- **Graphify:** skipped (no docs impacted)
