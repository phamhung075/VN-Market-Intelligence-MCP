# TASK_1426b — get_yield_spread_signal MCP Tool

**Sprint:** 1426 (Báu Phase 2 — Dinh Gia)
**Tier:** 2 — starts after 1426a is merged
**Owner:** developer
**Estimated size:** ~270 lines net new, 2 file edits

---

## Goal

New MCP tool `get_yield_spread_signal`. Reads `market_earning_yield` from
`tracked_indicators` and `max_deposit_rate_pct` from `sbv_rates`, calls a pure domain
function `computeYieldSpreadSignal()`, and returns a CHEAP / FAIRLY_VALUED / EXPENSIVE
label with reasoning.

---

## Files to CREATE

| File | Lines | Purpose |
|------|-------|---------|
| `apps/mcp-server/src/domain/services/macro/yieldSpreadSignal.ts` | ~70 | Pure domain fn — types + `computeYieldSpreadSignal()` |
| `apps/mcp-server/src/interface/mcp/tools/macro/dinhGiaTools.ts` | ~100 | Registers `get_yield_spread_signal`, DB reads, calls domain fn |
| `apps/mcp-server/src/__tests__/1570b-yield-spread-signal.test.ts` | ~100 | Unit tests with injection params — all label branches + UNKNOWN |

## Files to MODIFY

| File | Change |
|------|--------|
| `apps/mcp-server/src/interface/mcp/tools/macro/index.ts` | Add `export { registerDinhGiaTools }` |
| `apps/mcp-server/src/interface/mcp/tools/registry.ts` | Call `registerDinhGiaTools(server, db)` |

---

## Domain Types (yieldSpreadSignal.ts)

```typescript
export type YieldSpreadLabel = 'CHEAP' | 'FAIRLY_VALUED' | 'EXPENSIVE' | 'UNKNOWN';

export interface YieldSpreadSignal {
  label: YieldSpreadLabel;
  earningYield: number;       // e.g. 7.32 (%)
  depositRate: number;        // e.g. 5.50 (%)
  spread: number;             // earningYield - depositRate, e.g. +1.82
  reasoning: string;
  computedAt: string;         // ISO timestamp
}

export function computeYieldSpreadSignal(
  earningYield: number,
  depositRate: number
): YieldSpreadSignal
```

Label thresholds (Báu methodology):
| Condition | Label |
|-----------|-------|
| `earningYield > depositRate + 2` | CHEAP |
| `earningYield > depositRate` | FAIRLY_VALUED |
| `earningYield <= depositRate` | EXPENSIVE |
| Either input is 0 | UNKNOWN + reasoning = "Data unavailable" |

---

## Tool Handler Pattern (dinhGiaTools.ts)

Follow `carryTools.ts` exactly:
- Private `readEarningYield()`: reads latest `market_earning_yield` from `tracked_indicators`
  WHERE source='bau_phase2' ORDER BY fetched_at DESC LIMIT 1
- Private `readDepositRate()`: reads `sbv_rates.max_deposit_rate_pct` ORDER BY effective_date DESC LIMIT 1
- `_testEarningYield` and `_testDepositRate` injection params for unit-test isolation
- Returns `{ content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] }`

```typescript
export function registerDinhGiaTools(server: McpServer, db: Database): void {
  server.tool("get_yield_spread_signal", ..., async ({ _testEarningYield, _testDepositRate }) => {
    const earningYield = _testEarningYield ?? readEarningYield(db);
    const depositRate  = _testDepositRate  ?? readDepositRate(db);
    const signal = computeYieldSpreadSignal(earningYield, depositRate);
    return { content: [{ type: "text" as const, text: JSON.stringify(signal, null, 2) }] };
  });
}
```

---

## Test File: 1570b-yield-spread-signal.test.ts

Cover:
- CHEAP: earningYield=8.0, depositRate=5.0 → spread=+3.0, label=CHEAP
- FAIRLY_VALUED: earningYield=6.0, depositRate=5.5 → spread=+0.5, label=FAIRLY_VALUED
- EXPENSIVE: earningYield=4.0, depositRate=5.5 → spread=-1.5, label=EXPENSIVE
- UNKNOWN: earningYield=0, depositRate=5.5 → label=UNKNOWN
- UNKNOWN: earningYield=7.0, depositRate=0 → label=UNKNOWN
- Boundary: earningYield exactly = depositRate → EXPENSIVE
- Boundary: earningYield = depositRate + 2 → FAIRLY_VALUED (threshold is strictly >)

---

## Acceptance Criteria

- [ ] `computeYieldSpreadSignal()` pure fn covers all label branches including UNKNOWN
- [ ] `get_yield_spread_signal` tool registered in registry.ts
- [ ] `_testEarningYield` / `_testDepositRate` injection params work in tests
- [ ] 1570b test file passes — all branches covered
- [ ] `macro/index.ts` exports `registerDinhGiaTools`
- [ ] TSC: 0 errors
- [ ] No regression (baseline: 8198 pass)

---

## Dependencies

- 1426a must be merged first (earning_yield must exist in tracked_indicators for production
  DB reads; test uses injection params so tests can run without live DB data)

## Handoff to

1426c depends on both 1426a and 1426b (reuses `YieldSpreadSignal` type from domain).
1426b and 1426c touch different files so they may be developed in parallel if both are
already unblocked.
