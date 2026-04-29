# TASK_1426c — Surface [Dinh Gia — Asset Valuation] Section in get_macro_snapshot

**Sprint:** 1426 (Báu Phase 2 — Dinh Gia)
**Tier:** 3 — starts after both 1426a and 1426b are merged
**Owner:** developer
**Estimated size:** ~130 lines net new, 1 major file modified

---

## Goal

Extend `get_macro_snapshot` to include a `[Dinh Gia — Asset Valuation]` section
positioned after `[Thien Thoi]` and before `[Commodity Prices]`. Section is optional
— shows "unavailable" when data is missing.

---

## Files to CREATE

| File | Lines | Purpose |
|------|-------|---------|
| `apps/mcp-server/src/__tests__/1570c-dinh-gia-snapshot.test.ts` | ~80 | Snapshot format tests — all valuation paths + unavailable |

## Files to MODIFY

| File | Change |
|------|--------|
| `apps/mcp-server/src/interface/mcp/tools/macro/macroTools.ts` | Add `DinhGiaInputs`, `formatDinhGia()`, extend `formatMacroSnapshot()` signature, add DB reads |

---

## Changes to macroTools.ts

### 1. Add DinhGiaInputs interface

```typescript
export interface DinhGiaInputs {
  earningYield: number;   // % e.g. 7.32
  medianPE: number;       // e.g. 13.65
  depositRate: number;    // % e.g. 5.50
  coverageCount: number;  // e.g. 28
  totalWatchlist: number; // e.g. 30
  dataAsOf: string;       // "YYYY-QQ"
}
```

### 2. Add formatDinhGia() helper

```typescript
function formatDinhGia(inputs: DinhGiaInputs): string[] {
  const spread = inputs.earningYield - inputs.depositRate;
  const signal = computeYieldSpreadSignal(inputs.earningYield, inputs.depositRate);
  const sign   = spread >= 0 ? '+' : '';
  return [
    '[Dinh Gia — Asset Valuation]',
    `  Market Earning Yield:  ${inputs.earningYield.toFixed(2)}% (median P/E: ${inputs.medianPE.toFixed(2)}, coverage: ${inputs.coverageCount}/${inputs.totalWatchlist})`,
    `  Max Deposit Rate:      ${inputs.depositRate.toFixed(2)}%`,
    `  Yield Spread:          ${sign}${spread.toFixed(2)}% — ${signal.label}`,
  ];
}
```

Import `computeYieldSpreadSignal` from `domain/services/macro/yieldSpreadSignal.js`
(NOT from dinhGiaTools — keep domain import at domain level).

### 3. Extend formatMacroSnapshot() signature

Add `dinhGia?: DinhGiaInputs` alongside existing `thienThoi?: ThienThoiInputs`:

```typescript
export function formatMacroSnapshot(
  snapshot: MacroSnapshot,
  thienThoi?: ThienThoiInputs,
  dinhGia?: DinhGiaInputs
): string[]
```

Insertion point: after `formatThienThoi()` block, before `[Commodity Prices]`.

When `dinhGia` is undefined or either yield/rate is 0:
```
[Dinh Gia — Asset Valuation]
  unavailable
```

### 4. DB reads in get_macro_snapshot tool handler

Inside the existing `try { initDatabase(); const db = getDb() ... }` block, add:

```typescript
// Dinh Gia inputs
const eyRow = db.prepare(
  "SELECT value FROM tracked_indicators WHERE indicator='market_earning_yield' AND source='bau_phase2' ORDER BY fetched_at DESC LIMIT 1"
).get() as { value: number } | undefined;

const peRow = db.prepare(
  "SELECT value FROM tracked_indicators WHERE indicator='market_median_pe' AND source='bau_phase2' ORDER BY fetched_at DESC LIMIT 1"
).get() as { value: number } | undefined;

const sbvRow = db.prepare(
  "SELECT max_deposit_rate_pct FROM sbv_rates ORDER BY effective_date DESC LIMIT 1"
).get() as { max_deposit_rate_pct: number } | undefined;

const dinhGiaInputs: DinhGiaInputs | undefined =
  eyRow && peRow && sbvRow
    ? { earningYield: eyRow.value, medianPE: peRow.value,
        depositRate: sbvRow.max_deposit_rate_pct,
        coverageCount: 0, totalWatchlist: 30, dataAsOf: '' }
    : undefined;
```

Note: coverageCount and dataAsOf not stored in tracked_indicators — use 0/'' as placeholder,
or store them as additional indicator rows if the developer sees fit. Keep it simple.

---

## Test File: 1570c-dinh-gia-snapshot.test.ts

Test using `_testDinhGiaInputs` injection param (same pattern as `_testThienThoiInputs`):

Cover:
- CHEAP path: earningYield=8.0, depositRate=5.0 → section present, label=CHEAP, spread=+3.00%
- FAIRLY_VALUED path: earningYield=6.2, depositRate=5.5 → label=FAIRLY_VALUED
- EXPENSIVE path: earningYield=4.0, depositRate=5.5 → label=EXPENSIVE
- Unavailable path: no dinhGia input → section shows "unavailable"
- Section order: [Dinh Gia] appears after [Thien Thoi], before [Commodity Prices]

---

## Acceptance Criteria

- [ ] `DinhGiaInputs` interface added to macroTools.ts
- [ ] `formatDinhGia()` produces correct 4-line output for all label branches
- [ ] `formatMacroSnapshot()` accepts optional `dinhGia?` param
- [ ] Section inserted at correct position (after Thien Thoi, before Commodity Prices)
- [ ] "unavailable" shown when data absent — no crash
- [ ] `_testDinhGiaInputs` injection param wired in tool handler
- [ ] 1570c test file passes — all paths covered
- [ ] TSC: 0 errors
- [ ] No regression (baseline: 8198 pass)

---

## Dependencies

- 1426a must be merged (earningYield + medianPE exist in tracked_indicators)
- 1426b must be merged (`YieldSpreadSignal` type and `computeYieldSpreadSignal` from domain)
- Same-file risk: macroTools.ts is the only shared file in this sprint — no other 1426 task
  touches it, so no conflict once 1426a and 1426b are merged.

## Handoff to

QA — this is the final task in sprint 1426. All three tasks must pass QA before sprint closes.
