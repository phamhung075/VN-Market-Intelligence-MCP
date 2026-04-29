# TASK-1423c — Carry Trade Signal Domain Service

**Sprint:** 1423 — Trần Ngọc Báu Macro Framework (Phase 1)
**Created:** 2026-04-29
**Status:** done
**Agent:** developer
**Estimate:** ~2h

---

## Context

The Carry Trade Signal quantifies the attractiveness of VND-denominated assets to
foreign institutional investors relative to USD. It is a core component of the
Thien Thoi methodology (Question 1: Global liquidity regime). This is a pure domain
service — no DB access, no HTTP, no infrastructure imports.

## Scope

### New File

**`apps/mcp-server/src/domain/services/macro/carryTradeSignal.ts`**

```typescript
export interface CarryTradeSignal {
  vndDepositRate: number;      // SBV max_deposit_rate_pct
  fedFundsRate: number;        // from FRED via tracked_indicators
  carrySpread: number;         // vndDepositRate - fedFundsRate (pct points)
  regime: "HOT_MONEY_INFLOW" | "NEUTRAL" | "FII_OUTFLOW_RISK";
  reasoning: string;           // human-readable one-liner in English
  computedAt: string;          // ISO timestamp
}

// Thresholds:
//   spread > 2.5%  → HOT_MONEY_INFLOW
//   0.5% <= spread <= 2.5%  → NEUTRAL
//   spread < 0.5%  → FII_OUTFLOW_RISK

export function computeCarryTradeSignal(
  vndRate: number,
  fedRate: number
): CarryTradeSignal
```

**DDD golden rule:** zero imports from `infrastructure/`. The function receives plain
numbers. The caller (interface/mcp tool handler) is responsible for reading from DB.

**Edge case:** if either input is 0, set `regime` to `"NEUTRAL"` and `reasoning` to
`"Data unavailable — one or both rates are zero"`. Do NOT crash. Do NOT return UNKNOWN
(not in the union type — keep type simple).

**Caching:** No DB table needed. The result is computed on demand. The caller (1423d)
may optionally store `carry_spread_pct` to `tracked_indicators` for history — but
that storage is NOT the responsibility of this domain service.

## Acceptance Criteria

1. `computeCarryTradeSignal(5.5, 4.33)` → spread = 1.17, regime = `"NEUTRAL"`
2. `computeCarryTradeSignal(7.0, 4.33)` → spread = 2.67, regime = `"HOT_MONEY_INFLOW"`
3. `computeCarryTradeSignal(4.0, 5.33)` → spread = -1.33, regime = `"FII_OUTFLOW_RISK"`
4. `computeCarryTradeSignal(0, 5.33)` → regime = `"NEUTRAL"`, reasoning contains "unavailable"
5. Zero imports from `infrastructure/` or `application/` — pure domain file
6. All 3 regime branches covered by unit tests
7. `computedAt` is a valid ISO timestamp string

## Test File

`apps/mcp-server/src/__tests__/1423c-carry-signal.test.ts`

```typescript
describe("Task 1423c — CarryTradeSignal", () => {
  it("HOT_MONEY_INFLOW when spread > 2.5%", ...)
  it("NEUTRAL when spread between 0.5% and 2.5%", ...)
  it("FII_OUTFLOW_RISK when spread < 0.5%", ...)
  it("graceful zero-data handling", ...)
})
```

## Dependencies

None — pure function, no infrastructure. Can start immediately, parallel with 1423a and 1423b.

## Blocks

TASK-1423d (needs `computeCarryTradeSignal` imported for the [Thien Thoi] snapshot section)

---

## RETURN (for developer to fill on completion)

DONE: Implemented `computeCarryTradeSignal` pure domain function in `apps/mcp-server/src/domain/services/macro/carryTradeSignal.ts` — zero infra imports, 3 regime branches (HOT_MONEY_INFLOW/NEUTRAL/FII_OUTFLOW_RISK) with thresholds 2.5%/0.5%, zero-data guard returning NEUTRAL with "unavailable" reasoning, full ISO computedAt timestamp; 17 unit tests all passing (100% line+func coverage); `tsc --noEmit` clean; exported from macro barrel index.
NEXT: qa | verify TASK-1423c acceptance criteria — all 4 ACs pass, no infra imports, tsc clean
HANDOFF: docs/handoffs/TASK_1423c.md
PIPELINE: continue
