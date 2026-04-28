# TASK_1397c — Test file for vnIndexRefreshJob

**Sprint:** 1397
**Type:** test
**Layer:** test
**Estimate:** ~1h
**Baseline:** 7915 pass / 0 fail
**Depends on:** TASK_1397a (runVnIndexRefreshJob must be importable)
**Blocks:** nothing

---

## Goal

Write a complete test file for `runVnIndexRefreshJob` covering all 5 cases
from the architect's spec. Use `mock.module()` to stub `fetchVnIndex` and
`storeMarketPrices` — do not alter the production function signature.

---

## File to Create

**Path:** `apps/mcp-server/src/__tests__/1397-vn-index-refresh.test.ts`

---

## Test Cases

Follow the test file template from dev-standards (`describe` + `it`, Bun test runner):

```typescript
// apps/mcp-server/src/__tests__/1397-vn-index-refresh.test.ts
// Note: DB_PATH is set to :memory: by apps/mcp-server/src/__tests__/setup.ts preload (Bun.env)
import { describe, it, expect, mock, beforeEach } from "bun:test";
```

### Case VIR-1 — Happy path: fetchVnIndex returns a valid MarketPrice

Mock `fetchVnIndex` to return a valid `MarketPrice` object for `"VNINDEX"`.
Mock `storeMarketPrices` as a no-op.

Assert: result = `{ fetched: 1, stored: 1, skipped: 0 }`
Assert: `storeMarketPrices` was called once with an array containing the mock price.

### Case VIR-2 — API returns null

Mock `fetchVnIndex` to return `null`.
Mock `storeMarketPrices` as a no-op.

Assert: result = `{ fetched: 0, stored: 0, skipped: 1 }`
Assert: `storeMarketPrices` was NOT called (prices array is empty).

### Case VIR-3 — fetchVnIndex throws

Mock `fetchVnIndex` to throw `new Error("timeout")`.
Mock `storeMarketPrices` as a no-op.

Assert: `runVnIndexRefreshJob()` resolves (does NOT throw).
Assert: result = `{ fetched: 0, stored: 0, skipped: 1 }`
Assert: `storeMarketPrices` was NOT called.

### Case VIR-4 — storeMarketPrices called with correct payload

Mock `fetchVnIndex` to return a `MarketPrice` with code `"VNINDEX"`, price
`1250.5`, changePct `0.42`.
Capture the argument passed to `storeMarketPrices`.

Assert: the captured array has length 1 and `array[0].code === "VNINDEX"`.

### Case VIR-5 — storeMarketPrices not called when all codes skipped

Mock `fetchVnIndex` to return `null` (simulating full skip).
Assert: `storeMarketPrices` call count = 0.

---

## Implementation Notes

- Use `mock.module('../../infrastructure/fetchers/hose.js', ...)` to stub both
  `fetchVnIndex` and `storeMarketPrices`. Bun's module mock is hoisted — call
  it before importing the SUT.
- Reset mocks in `beforeEach` to prevent cross-test contamination.
- The `MarketPrice` type is importable from `hose.ts` or the domain models —
  confirm the actual export path before importing in tests.
- `storeMarketPrices` receives `MarketPrice[]` — the mock can be a simple
  `mock(() => Promise.resolve())`.
- Do NOT call `getDb()` or touch SQLite in this test file — the job itself
  has no DB interaction (DB access is inside `storeMarketPrices`, which is
  mocked out).

---

## Acceptance Criteria

- [ ] File exists at exact path above
- [ ] All 5 test cases (VIR-1 through VIR-5) present and passing
- [ ] `bun test` passes at >= 7920 (7915 baseline + 5 new tests)
- [ ] No TypeScript errors
- [ ] No real HTTP calls — all external calls mocked
- [ ] No DB writes — `storeMarketPrices` is mocked throughout
