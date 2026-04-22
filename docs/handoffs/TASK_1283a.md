# TASK 1283a — RED: Foreign Flow Circuit Breaker Diagnostics Tests

**Status:** READY FOR DEVELOPMENT (TDD RED phase)
**Sprint:** 1283 (S-size, 2 tasks)
**Layer:** Interface (test-only) + Infrastructure (existing circuit breaker)
**Branch:** `task/1283a-foreign-flow-diagnostics-RED-test`
**Incident:** VN foreign flow service stalled (5108 consecutive errors since 2026-04-22 07:36:55)

---

## Acceptance Criteria

When developer completes RED:
- [ ] `src/__tests__/1283-foreign-flow-diagnostics.test.ts` has 8 failing assertions
- [ ] All assertions use stubs/mocks (no real network calls)
- [ ] Test imports `breakers` from `circuitBreakerRegistry.ts` and planned `foreignFlowTools.ts`
- [ ] `bun test` runs RED tests, all 8 FAIL as expected
- [ ] No implementation code in `foreignFlowTools.ts` yet — only empty stubs
- [ ] Test fixture includes foreignFlow breaker state transitions (closed → open → half-open)

---

## Test Contract

**File:** `src/__tests__/1283-foreign-flow-diagnostics.test.ts`
**Imports:**
```typescript
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { breakers } from "../infrastructure/circuitBreakerRegistry.js";
import {
  diagnose_foreign_flow_circuit_breaker,
  reset_foreign_flow_circuit_breaker,
} from "../interface/mcp/tools/market-data/foreignFlowTools.js";
import type { CircuitBreakerStats } from "../infrastructure/circuitBreaker.js";
```

### Test Suite 1: `diagnose_foreign_flow_circuit_breaker()`

**Stub function signature (will implement in GREEN):**
```typescript
export async function diagnose_foreign_flow_circuit_breaker(): Promise<{
  content: Array<{ type: "text"; text: string }>;
}>;
```

**RED Assertions (4 total):**

| # | Test Case | Expected | Reason |
|---|-----------|----------|--------|
| 1 | "Returns circuit state = 'closed' when healthy" | content[0].text contains "state: closed", failures: 0 | Normal operation after reset |
| 2 | "Returns circuit state = 'open' when tripped" | content[0].text contains "state: open", failures ≥ 5 | After failureThreshold breaches |
| 3 | "Includes lastFailure timestamp in diagnostics" | content[0].text contains ISO timestamp OR "never failed" | Operator visibility into breach time |
| 4 | "Returns formatted diagnostic text block with all stats" | Includes: state, failures, successes, lastFailure, resetTimeoutMs | Complete CB snapshot for debugging |

### Test Suite 2: `reset_foreign_flow_circuit_breaker()`

**Stub function signature:**
```typescript
export async function reset_foreign_flow_circuit_breaker(): Promise<{
  content: Array<{ type: "text"; text: string }>;
}>;
```

**RED Assertions (4 total):**

| # | Test Case | Expected | Reason |
|---|-----------|----------|--------|
| 5 | "Resets circuit from open → closed" | state becomes 'closed', failures reset to 0 | Manual recovery unblock |
| 6 | "Returns confirmation message after reset" | content[0].text contains "reset" + "closed" | User confirmation |
| 7 | "Idempotent: second reset on already-closed CB is no-op" | state='closed', content[0].text contains "already closed" | Safe repeated calls |
| 8 | "Resets successes counter to 0 on reset" | stats.successes = 0 after reset | Clean slate for tracking |

---

## Fixture Data

**Setup before each test:**
```typescript
beforeEach(() => {
  // Reset the foreignFlow breaker to clean state
  breakers.foreignFlow.reset();
});

afterEach(() => {
  // Clean up after tests
  breakers.foreignFlow.reset();
});
```

**Simulate open circuit (for assertions 2, 5, etc.):**
```typescript
// Trigger failures until circuit opens (failureThreshold = 5)
const cb = breakers.foreignFlow;
for (let i = 0; i < 5; i++) {
  try {
    await cb.execute(() => Promise.reject(new Error("simulated failure")));
  } catch {
    // Expected to fail
  }
}
// Circuit is now OPEN
expect(cb.stats.state).toBe("open");
```

---

## Notes for Developer

1. **Circuit breaker is in-memory** — No database calls needed. `breakers.foreignFlow` is a singleton imported from `circuitBreakerRegistry.ts`.

2. **Stats interface** (`CircuitBreakerStats` from `circuitBreaker.ts`):
   ```typescript
   interface CircuitBreakerStats {
     failures: number;
     successes: number;
     state: "closed" | "open" | "half-open";
     lastFailure: string | null; // ISO timestamp or null
   }
   ```

3. **Tool output format** — Both tools return MCP-compatible response:
   ```typescript
   {
     content: [
       {
         type: "text",
         text: "formatted diagnostic/reset message"
       }
     ]
   }
   ```

4. **Formatting helpers** — Format stats for human readability (see reference section below).

5. **No real HTTP calls** — Do NOT attempt to query the VPS endpoint. Tools only read in-memory circuit breaker state.

6. **Dry-run friendly** — Tests should work in isolated environment with no external dependencies.

---

## Reference: CircuitBreaker Interface

From `src/infrastructure/circuitBreaker.ts`:
```typescript
export class CircuitBreaker {
  get state(): CircuitState;
  async execute<T>(fn: () => Promise<T>): Promise<T>;
  reset(): void;
  get stats(): CircuitBreakerStats;
}

export type CircuitState = "closed" | "open" | "half-open";
```

---

## Handoff Checklist

- [ ] `src/__tests__/1283-foreign-flow-diagnostics.test.ts` created with 8 RED assertions
- [ ] Both stub functions exist in `src/interface/mcp/tools/market-data/foreignFlowTools.ts` with empty bodies or `throw new Error("stub")`
- [ ] `bun test -- 1283-foreign-flow-diagnostics` runs and shows all 8 assertions FAILING (RED state)
- [ ] TypeScript compiles: `bun tsc --noEmit`
- [ ] Commit message: "test(1283a): Foreign flow circuit breaker diagnostics—8 RED assertions (state query, error counts, reset logic, idempotency)"
- [ ] Push to `task/1283a-foreign-flow-diagnostics-RED-test`
- [ ] PR opened, awaiting QA review
