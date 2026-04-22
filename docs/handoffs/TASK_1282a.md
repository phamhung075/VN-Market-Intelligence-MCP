# TASK 1282a — RED: Data Freshness Monitoring Tool Tests

**Status:** READY FOR DEVELOPMENT (TDD RED phase)
**Sprint:** 1282 (S-size, 2 tasks)
**Layer:** Interface (test-only) + Domain (existing service)
**Branch:** `task/1282a-data-freshness-RED-test`

---

## Acceptance Criteria

When developer completes RED:
- [ ] `src/__tests__/system-data-freshness.test.ts` has 8 failing assertions
- [ ] All assertions use stubs/mocks (no real DB calls)
- [ ] Test imports both `freshnessSlaChecker.ts` (domain) and planned `dataFreshnessTools.ts` (interface)
- [ ] `bun test` runs RED tests, all 8 FAIL as expected
- [ ] No implementation code in `dataFreshnessTools.ts` yet — only empty stubs

---

## Test Contract

**File:** `src/__tests__/system-data-freshness.test.ts`
**Imports:**
```typescript
import { describe, it, expect } from "bun:test";
import {
  checkDataFreshnessSla,
  classifySeverity,
  type SignalType,
  type FreshnessSlaCheckOutput,
} from "../domain/services/freshnessSlaChecker.js";
import {
  detectDataFreshnessBreach,
  formatFreshnessAlert,
} from "../interface/mcp/tools/system/dataFreshnessTools.js";
```

### Test Suite 1: `detectDataFreshnessBreach()`

**Stub function signature (will implement in GREEN):**
```typescript
export async function detectDataFreshnessBreach(
  db: Database,
  config?: SignalSlaConfig[],
): Promise<{
  hasBreach: boolean;
  breaches: SlaCheckResult[];
  recoveries: SlaCheckResult[];
}>;
```

**RED Assertions (4 total):**

| # | Test Case | Expected | Reason |
|---|-----------|----------|--------|
| 1 | "Detects HIGH breach on stale price data" | hasBreach=true, breaches.length≥1, severity="HIGH" | Price 15min old, threshold 10min |
| 2 | "Detects CRITICAL breach when 1.5× threshold exceeded" | hasBreach=true, severity="CRITICAL" | Age > threshold × 1.5 |
| 3 | "Returns empty breaches when all signals fresh" | hasBreach=false, breaches.length=0 | All signals within SLA |
| 4 | "Tracks recovery when previously breached signal now fresh" | recoveries.length≥1, recoveries[0].status="ok" | Signal returns from breach |

### Test Suite 2: `formatFreshnessAlert()`

**Stub function signature:**
```typescript
export function formatFreshnessAlert(
  output: FreshnessSlaCheckOutput,
): string;
```

**RED Assertions (4 total):**

| # | Test Case | Expected | Reason |
|---|-----------|----------|--------|
| 5 | "Formats breach header with signal type + age + severity" | Contains "price", age value, "HIGH" or "CRITICAL" | User-facing message |
| 6 | "Includes recovery message when signal recovers" | Contains "recovered" + signal type | Alerts user of improvement |
| 7 | "Returns empty string when no breaches or recoveries" | output.length=0 | No alert needed |
| 8 | "Renders timestamp + breach count summary" | Contains ISO timestamp, "X breaches" | Context for alert |

---

## Task Dependencies

- **Depends on:** `freshnessSlaChecker.ts` ✓ (already exists, domain layer)
- **Blocks:** 1282b (GREEN phase)

---

## Notes for Developer

1. **No real DB calls** — Use fixtures/mocks for database reads. Fixture example:
   ```typescript
   const mockResult = {
     checkedAt: "2026-04-22T10:00:00Z",
     breaches: [
       { signalType: "price", ageMinutes: 15, thresholdMinutes: 10, status: "breached", severity: "HIGH" }
     ],
     recoveries: [],
   };
   ```

2. **Domain service is SSOT** — `checkDataFreshnessSla()` from `freshnessSlaChecker.ts` is the source of truth for SLA logic. Interface layer calls it, doesn't reimplement.

3. **No MCP registration yet** — GREEN phase adds the tool to `systemTools.ts` barrel. RED is test-only.

4. **Time dependency** — `detectDataFreshnessBreach()` will call `checkDataFreshnessSla()`, which may need a `now` param for testing. Plan for clock control in test fixtures.

5. **Test file location** — Must be `src/__tests__/system-data-freshness.test.ts` (PO pre-confirmed). Do NOT create in other locations.

---

## Reference: Existing Data Freshness Tests

For pattern reference (do NOT copy–paste, create fresh):
- `src/__tests__/185-data-freshness.test.ts` — tests `classifyFreshness()` helper
- `src/__tests__/1293-data-freshness-label.test.ts` — tests `formatAge()` helper

---

## Handoff Checklist

- [ ] `src/__tests__/system-data-freshness.test.ts` created with 8 RED assertions
- [ ] Both stub functions listed above have empty bodies or `throw new Error("stub")`
- [ ] `bun test` runs and shows all 8 assertions FAILING (RED state)
- [ ] TypeScript compiles: `bun tsc --noEmit`
- [ ] Commit message: "test(1282a): Data freshness monitoring tool—8 RED assertions (price/bctc/news SLA breach + recovery detection)"
- [ ] Push to `task/1282a-data-freshness-RED-test`
- [ ] PR opened, awaiting QA review
