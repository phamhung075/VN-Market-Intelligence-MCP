<!-- DEV-REAUDIT-5 — NFR-C-6 financials yoyDirection — generated 2026-06-11 by PM -->

## Task: DEV-REAUDIT-5 — Add yoyDirection fields to financials handler

**Task ID:** REAUDIT-005  
**Title:** NFR-C-6 financials yoyDirection: mcp-server implementation  
**Sprint:** SHIP-WAVE-REAUDIT  
**Zone:** apps/mcp-server/  
**Owner:** dev-mcp-server  
**Priority:** LOW (improvement lane)  
**Depends on:** none  
**Est. effort:** 1 hour  
**Architecture:** docs/handoffs/SHIP-WAVE-REAUDIT-architect-brief.md § 6. NFR-C-6

---

## Problem Statement

**Item A-14:** `revenueYoy` and `netProfitYoy` exist as signed floats in financials response. Frontend can color-code by sign, but has no directional field for filter UI or accessibility.

**NFR-C-6 ruling (improvement lane):** Add derived `revenueYoyDirection: "up" | "down" | "flat"` and `netProfitYoyDirection: "up" | "down" | "flat"` fields. Compute from sign of yoy values.

---

## Acceptance Criteria

1. **Add direction fields to financials row type**
   - Type: `"up" | "down" | "flat"`
   - Part of screener row (each row has its own directions)
   - Fields:
     - `revenueYoyDirection`
     - `netProfitYoyDirection`

2. **Implement direction derivation in `financialsHandler.ts`**
   - In the row-mapping function (where yoy values are already shaped)
   - Logic:
     ```typescript
     revenueYoyDirection: revenueYoy > 0 ? "up" : revenueYoy < 0 ? "down" : "flat",
     netProfitYoyDirection: netProfitYoy > 0 ? "up" : netProfitYoy < 0 ? "down" : "flat"
     ```
   - Handle edge cases: null/undefined yoy → "flat"

3. **Response contract**
   - Existing fields unchanged
   - New fields appear in every row
   - Example:
     ```typescript
     {
       code: "VCB",
       revenueYoy: 12.5,
       revenueYoyDirection: "up",  // NEW
       netProfitYoy: -5.2,
       netProfitYoyDirection: "down",  // NEW
       // ... other fields
     }
     ```

4. **Unit tests**
   - revenueYoy > 0: revenueYoyDirection = "up"
   - revenueYoy < 0: revenueYoyDirection = "down"
   - revenueYoy === 0: revenueYoyDirection = "flat"
   - revenueYoy is null: revenueYoyDirection = "flat"
   - Same for netProfitYoy
   - All combinations tested (up/down, down/flat, flat/up, etc.)

---

## Files to Modify

| File | Layer | Change |
|---|---|---|
| `apps/mcp-server/src/interface/mcp/routes/financialsHandler.ts` | interface | Add yoyDirection derivation in row mapping |
| `apps/mcp-server/src/interface/mcp/types/ScreenerRow.ts` (or inline) | types | Add `revenueYoyDirection` and `netProfitYoyDirection` to type |
| `apps/mcp-server/src/interface/mcp/routes/*.test.ts` | test | Unit tests for yoyDirection fields |

---

## Decision Journal

**Why is this LOW priority?**  
Frontend already colors by sign of yoy values (visual feedback works). Direction field is an accessibility/filter enhancement, not a core data-quality fix. Improvement lane means "nice to have after critical items".

**Why two separate direction fields vs. a combined object?**  
Each metric (revenue, net profit) has its own trend story. Separate fields allow independent filtering and display logic without nested objects.

---

## Notes

- This task is **sequenced LAST** in the sprint (after stale flags complete)
- Can be deferred to next sprint if mcp-server WIP fills up
- Frontend does NOT require this field (already works without it)
- No downstream dependencies

---

## Links

- Architect brief: `docs/handoffs/SHIP-WAVE-REAUDIT-architect-brief.md`
- BA spec: `docs/handoffs/SHIP-WAVE-REAUDIT-BA-spec.md` § A-14 improvement lane
- Zone standard: `docs/policies/dev-standards.md`

---

## [Developer] Implementation Record

- **Service:** mcp-server
- **Zone:** apps/mcp-server/
- **Files modified:**
  - `apps/mcp-server/src/interface/mcp/routes/financialsHandler.ts` — Added `YoyDirection` type alias; added `revenueYoyDirection` and `netProfitYoyDirection` fields to `ScreenerRow` interface; exported `deriveYoyDirection(value)` pure helper (null/undefined/NaN → "flat", >0 → "up", <0 → "down"); updated `mapRow()` to compute both direction fields
  - `apps/mcp-server/src/__tests__/TASK17-PAGE16-financials-endpoint.test.ts` — Updated `makeRow()` and `makeScreenerRow()` fixture helpers to include new direction fields; updated AC-2 field-presence check and AC-5 requiredFields array
- **Tests written:**
  - `apps/mcp-server/src/__tests__/REAUDIT-005-financials-yoy-direction.test.ts` — 31 assertions, GREEN (deriveYoyDirection + mapRow direction fields + handleGetFinancials integration)
- **Git commits:** see below
- **Type check:** clean (bun tsc --noEmit, 0 errors)
- **bun test (targeted):** 143 pass / 0 fail (REAUDIT-002..005 + TASK17-PAGE16 combined)
- **Tool count:** 157 tools — matches pre-task baseline
- **Scheduler count:** 79 cron.schedule entries — matches CONTAM-5 baseline
- **Docs updated:** NONE (interface-only change, no architecture doc touch)
- **Graphify:** skipped (no docs impacted)

### G12 Gate Evidence

| Gate | Result |
|------|--------|
| bun test (REAUDIT-005 + TASK17-PAGE16) | 95 pass / 0 fail |
| bun test (REAUDIT sprint batch 002..005) | 143 pass / 0 fail |
| bun tsc --noEmit | exit 0, 0 errors |
| toolCount | 157 (unchanged) |
| schedulerCount | 79 (unchanged) |

Zone health: tsc clean, 157 tools intact, 79 cron.schedule, 31 new tests GREEN, REAUDIT sprint 143 pass total | HEALTHY

---

## [QA] Review Record · 2026-06-12T09:45:00Z

**Verdict:** APPROVED
**Report:** reports/TASK_REPORT_REAUDIT-005.md
**DJ entry:** sprint-SHIP-WAVE-REAUDIT-qa.md § qa-S7

**Evidence:**
- bun test REAUDIT-005: 31 pass / 0 fail (QA-reproduced)
- tsc --noEmit: exit 0 (QA-reproduced)
- DDD: PASS (interface layer, pre-existing infra import unchanged)
- Security: PASS (mock-guard EXIT 0)
- Live probe GET /api/financials?limit=3: revenueYoy=18.95→revenueYoyDirection="up"; netProfitYoy=-38.74→netProfitYoyDirection="down" — both correct
- toolCount=157, schedulerCount=79 — unchanged

**Status:** REAUDIT-005 → DONE
