# TASK 1327b — Fix TA Alert Scan Mock Signature: RED → GREEN

**Sprint:** 1327
**Task ID:** 1327-fix-ta
**Owner:** Developer
**DDD Layer:** test (scheduler domain — alert scan logic)
**Estimated:** 1h
**Branch:** `task/1327b-fix-ta-mock`
**Depends on:** none (runs in parallel with 1327a)
**Blocks:** 1327c (merge gate)

---

## Problem

6 tests in `apps/mcp-server/src/__tests__/1307-ta-alert-scan-job.test.ts` fail because the `computeFn` mock signature is wrong for the current production interface.

**Failing tests (AC-1, AC-2, AC-5, AC-6, AC-7, AC-9):**
- Line 108: `AC-1: fires ta_overbought alert when RSI > 70`
- Line 137: `AC-2: fires ta_oversold alert when RSI < 30`
- Line 188: `AC-5: cooldown suppresses second alert within 4 hours`
- Line 215: `AC-6: cooldown does not suppress alert after 4 hours`
- Line 256: `AC-7: multi-ticker scan: 3 tickers, 2 overbought, 1 neutral`
- Line 294: `AC-9: error on one ticker is caught; others still processed`

**Root cause:** Phase 3c (Sprint commit `8c33f0da`) refactored `taAlertScanJob.ts` so `computeFn` now has the signature:

```typescript
computeFn?: (code: string) => Promise<ComputeTAResponse>
// (from apps/mcp-server/src/scheduler/market-data/taAlertScanJob.ts:45)
```

The test's `makeComputeFn` still returns the old synchronous candles-based signature:

```typescript
// OLD (current in test — wrong):
function makeComputeFn(rsi: number | null): (_candles: DailyCandle[]) => TechnicalIndicatorResult {
  return (_candles: DailyCandle[]) => ({
    ma5: null, ma20: null, ma50: null,
    rsi14: rsi, macd: null, bb20: null,
  });
}
```

Because the signature is wrong, the production code calls the real `computeTAIndicators` (default) instead of the test mock, so assertions on alert counts fail.

---

## Reference: Correct Pattern

`1309-bb-alert-scan-job.test.ts` (already fixed) uses this pattern — mirror it exactly:

```typescript
// File: apps/mcp-server/src/__tests__/1309-bb-alert-scan-job.test.ts:54–67
import type { ComputeTAResponse } from "../infrastructure/microservices/clients.js";

function makeComputeFn(
  bb20: { upper: number; mid: number; lower: number } | null
): (code: string) => Promise<ComputeTAResponse> {
  return async (code: string) => ({
    code,
    trend: "TREN_DUNG" as const,
    bb: bb20 ?? undefined,
    rsi: undefined,
    // ...
  });
}
```

---

## Exact Files to Modify

### File 1: `apps/mcp-server/src/__tests__/1307-ta-alert-scan-job.test.ts`

**Change 1 — Update import (lines 6–7):**

Remove:
```typescript
import type { DailyCandle, TechnicalIndicatorResult } from "../domain/services/technicalIndicators.js";
```

Add:
```typescript
import type { ComputeTAResponse } from "../infrastructure/microservices/clients.js";
```

**Change 2 — Replace `makeComputeFn` (lines 50–59):**

Remove the old synchronous factory:
```typescript
function makeComputeFn(rsi: number | null): (_candles: DailyCandle[]) => TechnicalIndicatorResult {
  return (_candles: DailyCandle[]) => ({
    ma5: null,
    ma20: null,
    ma50: null,
    rsi14: rsi,
    macd: null,
    bb20: null,
  });
}
```

Replace with the async code-based factory (mirrors the BB pattern):
```typescript
function makeComputeFn(rsi: number | null): (code: string) => Promise<ComputeTAResponse> {
  return async (code: string) => ({
    code,
    trend: "TREN_DUNG" as const,
    rsi: rsi !== null ? { rsi14: rsi } : undefined,
    bb: undefined,
    macd: undefined,
    ma5: undefined,
    ma20: undefined,
    ma50: undefined,
  });
}
```

**Change 3 — Replace `makeThrowingComputeFn` (lines 62–74):**

The throwing factory also needs to match the new signature:
```typescript
function makeThrowingComputeFn(): (code: string) => Promise<ComputeTAResponse> {
  return async (_code: string) => {
    throw new Error("Mock TA error for test");
  };
}
```

**Change 4 — Update AC-9 test invocation (line ~300):**

The AC-9 test currently passes `computeFn: makeThrowingComputeFn(throwForCode, rsiForOthers)`. Since the new throwing factory takes no arguments, update the call site:

Find in test file:
```typescript
computeFn: makeThrowingComputeFn(/* any args */),
```
Replace with:
```typescript
computeFn: makeThrowingComputeFn(),
```

---

## Verify the Production `ComputeTAResponse` Shape

Before writing the mock, confirm the exact shape at:
`apps/mcp-server/src/infrastructure/microservices/clients.ts`

Look for `export interface ComputeTAResponse` or `export type ComputeTAResponse`. The mock return value must satisfy that type. Key fields needed for RSI tests:
- `code: string`
- `trend: string` (use `"TREN_DUNG"` as safe default)
- `rsi?: { rsi14: number | null }` — check exact field name

---

## Acceptance Criteria

- [ ] All 6 previously failing tests now GREEN: AC-1, AC-2, AC-5, AC-6, AC-7, AC-9
- [ ] No regression on currently passing tests in this file (AC-3, AC-4, AC-8 if they exist)
- [ ] `bun tsc --noEmit` from `apps/mcp-server/` exits 0 (TypeScript clean)
- [ ] `bun test src/__tests__/1307-ta-alert-scan-job.test.ts` → 0 failures

---

## Verification Command

```bash
cd apps/mcp-server && bun test src/__tests__/1307-ta-alert-scan-job.test.ts 2>&1 | grep -E "(pass|fail|AC-)"
```

Expected: all 6 AC names in pass output, `(fail)` count = 0 for this file.

Also run the parallel job test to confirm no regression:
```bash
cd apps/mcp-server && bun test src/__tests__/1309c-alert-scan-parallel-job.test.ts 2>&1 | grep -E "(pass|fail)"
```

---

## Risk Notes

- Do not change any production file (`taAlertScanJob.ts`, `alertScanParallelJob.ts`). This is a test-only fix.
- The `ComputeTAResponse.rsi` field shape must be verified against the actual type before writing the mock — the exact nested shape (`{ rsi14: number }` vs `rsi14` at top level) matters for the production code path to read RSI correctly from the mock.
- AC-9 uses a throwing computeFn — after the signature change the test must still verify that a single-ticker error does not abort the full scan (other tickers still processed). Check the test body at line 294 to ensure the assertion logic is preserved, only the `makeThrowingComputeFn` call site changes.
