# TASK 1880a — Investment Clock Phase Tool

**Dispatch:** 2026-05-12 | **Owner:** dev-mcp-server | **Priority:** HIGH | **Type:** FEATURE | **Est. LOC:** ~90

---

## Brief

Implement `get_investment_clock_phase()` MCP tool — a pure function that classifies the current regime into one of {Recovery, Overheat, Stagflation, Reflation} based on PMI (growth) and CPI (inflation) from the `macro_indicators` table.

**Architecture:** See `docs/architecture-briefs/2026-05-12-sprint-1880-investment-clock-pyramid.md` §4-6.

---

## Files to Create

```
apps/mcp-server/src/domain/services/macro/investmentClock.ts           (~35 LOC)
apps/mcp-server/src/interface/mcp/tools/macro/investmentClockTools.ts  (~55 LOC)
apps/mcp-server/src/__tests__/1880a-investment-clock.test.ts           (~50 LOC)
```

## Files to Modify

```
apps/mcp-server/src/domain/services/macro/index.ts                     (+2 export lines)
apps/mcp-server/src/interface/mcp/tools/macro/index.ts                 (+1 export line)
```

---

## Acceptance Criteria

1. **Domain function signature:**
   ```typescript
   export function classifyInvestmentClockPhase(inputs: {
     pmi: number | null;
     cpi: number | null;
     gdpGrowth?: number | null;
     inflationRate?: number | null;
   }): { 
     phase: InvestmentClockPhase | null; 
     reason?: string; 
     growthSignal: "UP" | "DOWN" | null; 
     inflationSignal: "HIGH" | "LOW" | null;
   }
   ```

2. **Classification rule (2×2 truth table):**
   - PMI > 50 + CPI ≤ 3.0 → Recovery
   - PMI > 50 + CPI > 3.0 → Overheat
   - PMI ≤ 50 + CPI > 3.0 → Stagflation
   - PMI ≤ 50 + CPI ≤ 3.0 → Reflation

3. **Null handling:**
   - Both `pmi` and `cpi` NULL → return `{phase: null, reason: "insufficient_data"}`
   - `cpi` NULL → fallback to `inflationRate` (if provided)
   - Both growth signals NULL → return `{phase: null, reason: "insufficient_data"}`

4. **MCP handler (`get_investment_clock_phase`):**
   - No required params; optional `_testSnapshot` for injection
   - Production: `getDb()` → SELECT from `macro_indicators` WHERE country='Vietnam'
   - Return JSON includes: phase, pmi, cpi, growth_signal, inflation_signal, thresholds, fetched_at
   - MCP format: `{ content: [{ type: "text", text: JSON.stringify(...) }] }`

5. **Unit tests (8 cases):**
   - ✓ Recovery (PMI=52, CPI=2.5)
   - ✓ Overheat (PMI=54, CPI=3.8)
   - ✓ Stagflation (PMI=48, CPI=4.1)
   - ✓ Reflation (PMI=47, CPI=2.1)
   - ✓ Boundary (PMI=50, CPI=3.0 → Reflation)
   - ✓ All NULL → insufficient_data
   - ✓ Fallback to gdpGrowth + CPI
   - ✓ Fallback to PMI + inflationRate

6. **Type definitions:**
   ```typescript
   export type InvestmentClockPhase = "Recovery" | "Overheat" | "Stagflation" | "Reflation";
   ```

7. **No DB side effects** — domain function is pure. Handler does read-only SELECT.

8. **All tests pass** — `bun test 1880a-investment-clock.test.ts` → 8/8 green.

---

## Dependencies

- **Blocks:** 1880b (pyramid tier tool uses same interface handler file)
- **Needs:** Existing `macro_indicators` table with Vietnam row (already in DB)
- **No new external deps** (uses existing `getDb()`, `initDatabase()` patterns)

---

## Reference

- Architecture brief: `docs/architecture-briefs/2026-05-12-sprint-1880-investment-clock-pyramid.md` §1-6
- DDD pattern: `docs/architecture/mcp-server.md` (domain/services → interface/mcp/tools flow)
- Test fixture style: `apps/mcp-server/src/__tests__/carryTradeSignal.test.ts` (similar domain function tests)
- Handler pattern: `apps/mcp-server/src/interface/mcp/tools/macro/carryTools.ts` (similar multi-tool handler)

---

## Rollback

```bash
git revert <merge-commit>
# Removes 1880a files + restores barrels to pre-1880 state
# 1880b still queued in Backlog; no forward dependency broken
```

---

## Dispatch Info

- **Assigned to:** dev-mcp-server
- **Expected start:** immediately (no deps)
- **Expected completion:** ~2h (atomic, one service zone)
- **Next:** 1880b appends pyramid tier tool to same handler file after this task ships
