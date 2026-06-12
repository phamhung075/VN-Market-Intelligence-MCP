<!-- FE-REAUDIT-3 — market-summaries direction arrow — generated 2026-06-11 by PM -->

## Task: FE-REAUDIT-3 — Add direction arrow to stock performance in market-summaries page

**Task ID:** REAUDIT-FE-003  
**Title:** NFR-C-4 stockPerformance direction: arrow rendering in market-summaries  
**Sprint:** SHIP-WAVE-REAUDIT  
**Zone:** apps/frontend/  
**Owner:** dev-frontend  
**Priority:** MEDIUM  
**Depends on:** REAUDIT-004 (mcp-server direction field finalized)  
**Est. effort:** 1 hour  
**Architecture:** docs/handoffs/SHIP-WAVE-REAUDIT-architect-brief.md § 4. NFR-C-4

---

## Problem Statement

**Item A-10:** After DEV-REAUDIT-4, `marketSummaryHandler` will provide `direction: "up" | "down" | "flat"` in each stockPerformance item. Frontend currently renders only the colored number (changePct), with color driven by sign. Missing: directional arrow next to the number.

**NFR-C-4 ruling:** Frontend page reads direction field and renders an arrow (↑/↓/—) next to the price-change number.

---

## Acceptance Criteria

1. **Parse `direction` field from stock performance items**
   - Extract from API response item: `item.direction`
   - Use for arrow rendering logic

2. **Arrow rendering**
   - direction = "up": render ↑ (up arrow) in green
   - direction = "down": render ↓ (down arrow) in red
   - direction = "flat": render — (dash) in gray or neutral color
   - Arrow placed immediately before or after the changePct number (consistent layout)
   - Example output: "↑ +1.66%" or "+1.66% ↑" (choose one consistently)

3. **Visual styling**
   - Arrow color matches text color (green for up, red for down, gray for flat)
   - Font size matches surrounding number (no oversized arrow)
   - Spacing consistent with existing design
   - Responsive (readable on mobile, tablet, desktop)

4. **Type updates**
   - Update `StockPerf` interface in `dashboard.market-summaries.tsx` (around L109):
     ```typescript
     direction?: "up" | "down" | "flat"
     ```
   - Update response type in `app/routes/api.market-summaries.tsx` if typed

5. **Testing**
   - direction = "up": arrow renders, color correct
   - direction = "down": arrow renders, color correct
   - direction = "flat": arrow/dash renders, color correct
   - direction is missing (backward compat): gracefully omits arrow (no crash)
   - No console errors or type errors
   - Arrow is accessible (screen reader compatible if needed)

---

## Files to Modify

| File | Layer | Change |
|---|---|---|
| `apps/frontend/app/routes/dashboard.market-summaries.tsx` | page | Add direction arrow render logic near L890 (price-change display) |
| `apps/frontend/app/routes/api.market-summaries.tsx` | api route | Add `direction` type field to StockPerf interface if typed |

---

## Decision Journal

**Why arrow as simple Unicode vs. icon library?**  
Simple, readable, no dependency overhead. ↑/↓/— are standard, universally understood directional symbols. Matches project's minimalist UI approach.

**Why not integrate into changePct color only?**  
Visual redundancy aids quick scanning. Color alone requires users to interpret hue correctly (color-blind accessibility). Arrow + color + number = triple-redundant signaling = better UX.

**Why direction field instead of deriving on frontend?**  
Frontend receives direction pre-computed from backend. Keeps separation of concerns: backend owns data shape/derivation, frontend owns display. Also ensures consistency if multiple pages consume the field.

---

## Dependent Tasks

- This task depends on REAUDIT-004 (mcp-server contract with direction field)
- No downstream dependencies

---

## Links

- Architect brief: `docs/handoffs/SHIP-WAVE-REAUDIT-architect-brief.md`
- BA spec: `docs/handoffs/SHIP-WAVE-REAUDIT-BA-spec.md` § A-10
- Zone standard: `docs/policies/dev-standards.md`

---

## [Developer] Implementation Record

- **Service:** frontend
- **Zone:** apps/frontend/
- **Build tier:** 4 (feature component — Tier 3 API layer GREEN, gate met)
- **Files modified:**
  - `apps/frontend/app/routes/dashboard.market-summaries.tsx` — StockPerf.direction? field, directionArrow() + directionArrowColorClass() helpers, arrow render in changePct cell
  - `apps/frontend/app/__tests__/reaudit-fe-003-stock-direction-arrow.test.ts` — 21 tests NEW
  - `docs/data/orch/orch-state.json` — task status → REVIEW
- **Tests written:** `app/__tests__/reaudit-fe-003-stock-direction-arrow.test.ts` — 21 assertions, GREEN
- **Git commits:** `9bda7325 feat(frontend/SHIP-WAVE-REAUDIT): REAUDIT-FE-003 direction arrow in stock performance table`
- **Type check:** clean (tsc --noEmit, 0 errors)
- **Service tests:**
  - Vitest: `21 new pass / 0 fail` (reaudit-fe-003 suite); `83 pass / 0 fail` (market-summaries combined)
  - Full suite: 1474+ pass, 21 pre-existing nav-count failures (unrelated, pre-existed before this task)
  - Playwright G12: `4/4 PASS` (render-check.spec.ts 3/3 + smoke.spec.ts 1/1)
- **Docs updated:** NONE (no new API shape or config change in frontend docs scope)
- **Graphify:** skipped (no docs impacted)

### Live probe evidence (2026-06-12, pre-implementation)

```
GET http://localhost:3000/api/market-summaries?id=daily-2026-06-11
stockPerformance[0]: {"symbol":"VCB","firstPrice":61600,"lastPrice":61600,"changePct":-0.16,"alertCount":1,"direction":"down"}
stockPerformance[1]: {"symbol":"BID","firstPrice":41400,"lastPrice":41400,"changePct":-0.6,"alertCount":0,"direction":"down"}
```
direction field LIVE on payload — REAUDIT-004 dependency confirmed satisfied.

### Vitest summary line
```
Tests  83 passed (83)
```
### Playwright summary line
```
4 passed (3.5s)
```
