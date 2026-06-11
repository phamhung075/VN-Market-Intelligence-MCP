<!-- DEV-REAUDIT-4 — NFR-C-4 stockPerformance direction field — generated 2026-06-11 by PM -->

## Task: DEV-REAUDIT-4 — Add direction field to stockPerformance items

**Task ID:** REAUDIT-004  
**Title:** NFR-C-4 stockPerformance direction field: mcp-server implementation  
**Sprint:** SHIP-WAVE-REAUDIT  
**Zone:** apps/mcp-server/  
**Owner:** dev-mcp-server  
**Priority:** MEDIUM  
**Depends on:** none  
**Paired with:** FE-REAUDIT-3 (frontend arrow rendering)  
**Est. effort:** 1 hour  
**Architecture:** docs/handoffs/SHIP-WAVE-REAUDIT-architect-brief.md § 4. NFR-C-4

---

## Problem Statement

**Item A-10:** `market_summaries.stock_performance_json` items currently contain `{symbol, firstPrice, lastPrice, changePct, alertCount}`. No directional field. Frontend computes color from `changePct` sign (correct) but cannot render a directional arrow without a field in the contract.

**NFR-C-4 ruling:** Add derived `direction: "up" | "down" | "flat"` field to each stock performance item. Compute at read time (no DB schema change).

---

## Acceptance Criteria

1. **Add `direction` field to `StockPerfItem` type**
   - Type: `"up" | "down" | "flat"`
   - Part of item contract (each item has its own direction)
   - Derived from `changePct` at read time

2. **Implement direction derivation in `marketSummaryHandler.ts`**
   - In `mapStockPerformance()` or equivalent shaping function
   - Logic:
     ```typescript
     direction: changePct > 0 ? "up" : changePct < 0 ? "down" : "flat"
     ```
   - Handle edge cases: null/undefined changePct → "flat"
   - Ensure all items in response array have direction populated

3. **Response contract**
   - Existing fields unchanged
   - New field appears in every stockPerformance item
   - Example:
     ```typescript
     {
       symbol: "VCB",
       firstPrice: 90.5,
       lastPrice: 92.0,
       changePct: 1.66,
       alertCount: 2,
       direction: "up"  // NEW
     }
     ```

4. **Unit tests**
   - changePct > 0: direction = "up"
   - changePct < 0: direction = "down"
   - changePct === 0: direction = "flat"
   - changePct is null: direction = "flat"
   - Empty items array: returns empty array (no errors)

---

## Files to Modify

| File | Layer | Change |
|---|---|---|
| `apps/mcp-server/src/interface/mcp/routes/marketSummaryHandler.ts` | interface | Add direction field derivation in mapStockPerformance |
| `apps/mcp-server/src/interface/mcp/types/StockPerfItem.ts` (or inline) | types | Add `direction: "up" \| "down" \| "flat"` to type |
| `apps/mcp-server/src/interface/mcp/routes/*.test.ts` | test | Unit tests for direction field |

---

## Decision Journal

**Why derived field vs. stored in DB?**  
Direction is a pure sign derivation from changePct. No business logic, no domain computation. Deriving at read time keeps the layer clean: interface layer shapes data for consumer display, no new DB schema.

**Why three states (up/down/flat) vs. two?**  
"Flat" (zero change) is a distinct state from "no data" (null). Flatness indicates stable price, which is visually and semantically different from missing data. Three-state avoids conflating them.

---

## Dependent Tasks

- **FE-REAUDIT-3:** Frontend renders arrow based on direction field. Start after this task merged.

---

## Links

- Architect brief: `docs/handoffs/SHIP-WAVE-REAUDIT-architect-brief.md`
- BA spec: `docs/handoffs/SHIP-WAVE-REAUDIT-BA-spec.md` § A-10
- Zone standard: `docs/policies/dev-standards.md`
