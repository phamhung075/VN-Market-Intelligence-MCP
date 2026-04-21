# Task Context — 229a: TDD RED test suite for price staleness watchdog

## TLDR (read this first)
change: src/__tests__/229-price-staleness-watchdog.test.ts — NEW test file, 5–7 failing assertions
test: src/__tests__/229-price-staleness-watchdog.test.ts — AC-1 to AC-7
branch: task/229a-price-watchdog-red
depends: none
knowledge_needed: [bundle-developer] — test patterns from sprint-221, watchdog logic from TECH_229.md

---

sprint: 229
branch: task/229a-price-watchdog-red
status: todo
req_ref: REQ-229
tech_ref: TECH-229

---

## [PM] Planning Context

layer: scheduler (test file)
depends_on: none

files_to_read:
- src/scheduler/vpsProxyWatchdogJob.ts  # reference: cooldown + recovery pattern
- docs/TECH_229.md  # acceptance criteria + function signatures
- src/__tests__/1549a-watchdog-news-staleness.test.ts  # test pattern from similar sprint

files_to_create:
- src/__tests__/229-price-staleness-watchdog.test.ts  # CREATE

files_to_modify:
- none

test_file: src/__tests__/229-price-staleness-watchdog.test.ts

acceptance_criteria:
- **Given** a test suite with dependency injection for priceUpdateWatchdog(), isVnMarketHoursUtc(), readLatestPriceTimestamp()
- **When** tests run with mocked DB + injected timestamps
- **Then**
  - AC-1: Detects price staleness >6h during market hours → returns "alert-sent"
  - AC-2: Respects 30-min cooldown (second call within cooldown returns "cooldown")
  - AC-3: Off-hours guard prevents alerts outside Mon-Fri 02:00-08:59 UTC
  - AC-4: Recovery message fires when stale data restores → returns "restored"
  - AC-5: isVnMarketHoursUtc() returns true only Mon-Fri 02:00-08:59 UTC
  - AC-6: readLatestPriceTimestamp() filters TEST/PROBE rows
  - AC-7: All assertions red before implementation, structure ready for GREEN task

---

## Implementation Guidance

### Test Structure (TDD RED)

Create 5–7 test cases covering:

1. **Off-hours guard** — Call at UTC 01:59 (outside 02:00-08:59) with stale data → returns "off-hours"
2. **Healthy price path** — Price fresh (<6h) → returns "ok"
3. **Staleness detection** — Price stale >6h during market hours → returns "alert-sent"
4. **Cooldown enforcement** — Second alert within 30 min → returns "cooldown"
5. **Recovery alert** — Price becomes fresh after prior stale alert → returns "restored"
6. **isVnMarketHoursUtc() edge times** — 01:59, 02:00, 08:59, 09:00 UTC on Mon/Fri/Sat
7. **readLatestPriceTimestamp() filtering** — DB row with TEST suffix filtered out

### Dependency Injection Pattern

```typescript
await priceUpdateWatchdog({
  now: new Date("2026-04-21T05:00:00Z"),
  readPrice: () => new Date("2026-04-20T22:00:00Z"), // 7h old
  notify: async (msg) => { /* track calls */ },
  notifyUser: async (msg) => { /* track calls */ },
});
```

### Test File Template

```typescript
import { describe, it, expect, beforeEach } from "bun:test";
import {
  priceUpdateWatchdog,
  isVnMarketHoursUtc,
  readLatestPriceTimestamp,
  _resetWatchdogCooldown,
  _resetWatchdogStaleFlag,
} from "../scheduler/market-data/priceUpdateWatchdogJob";

describe("Price Staleness Watchdog (229)", () => {
  beforeEach(() => {
    _resetWatchdogCooldown();
    _resetWatchdogStaleFlag();
  });

  it("AC-1: detects staleness >6h during market hours", async () => {
    const staleTime = new Date("2026-04-20T22:00:00Z");
    const checkTime = new Date("2026-04-21T05:00:00Z"); // 7h later

    const result = await priceUpdateWatchdog({
      now: checkTime,
      readPrice: () => staleTime,
      notify: async () => {},
      notifyUser: async () => {},
    });

    expect(result).toBe("alert-sent");
  });

  it("AC-2: respects 30-min cooldown", async () => {
    // First alert
    const staleTime = new Date("2026-04-20T22:00:00Z");
    const checkTime1 = new Date("2026-04-21T05:00:00Z");

    await priceUpdateWatchdog({
      now: checkTime1,
      readPrice: () => staleTime,
      notify: async () => {},
      notifyUser: async () => {},
    });

    // Second check 15 min later (within 30-min cooldown)
    const checkTime2 = new Date("2026-04-21T05:15:00Z");
    const result = await priceUpdateWatchdog({
      now: checkTime2,
      readPrice: () => staleTime,
      notify: async () => {},
      notifyUser: async () => {},
    });

    expect(result).toBe("cooldown");
  });

  // ... AC-3 through AC-7 tests
});
```

### Assertions Checklist

- [ ] All 5–7 test cases compile
- [ ] All assertions RED (function not yet implemented)
- [ ] Test file imports correctly from ../scheduler/market-data/priceUpdateWatchdogJob
- [ ] beforeEach cleanup clears module state
- [ ] bun test runs and reports N failures (RED phase expected)

---

## Done Criteria

1. Test file `src/__tests__/229-price-staleness-watchdog.test.ts` created with 5–7 test cases
2. All assertions RED (failing before implementation)
3. Tests compile and run with `bun test`
4. No existing tests broken
5. Function stubs exported from priceUpdateWatchdogJob.ts (empty implementations that match signatures)
6. `bun tsc --noEmit` accepts test file imports
7. Task marked Done in TASKS.md

---

## Reference

- TECH-229 spec: acceptance criteria AC-1 to AC-7 (lines 318–324)
- Existing watchdog pattern: src/scheduler/vpsProxyWatchdogJob.ts (cooldown + recovery reference)
- Test pattern: src/__tests__/1549a-watchdog-news-staleness.test.ts (similar watchdog sprint)

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/229-price-staleness-watchdog.test.ts   # NEW test file: 11 assertions (6 RED, 5 GREEN from stubs)
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/market-data/priceUpdateWatchdogJob.ts   # NEW stub file with 4 exported functions + 2 test reset functions
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/TASKS.md   # Updated 229_a status: Todo → In Progress

tests_written:
- src/__tests__/229-price-staleness-watchdog.test.ts   # 11 assertions: AC-1 (staleness >6h), AC-2 (cooldown 30min), AC-3 (off-hours guard), AC-4 (recovery), AC-5a-5e (market hours UTC edge times), AC-6 (TEST row filter), AC-7 (healthy path)
  - 6 RED assertions: AC-1, AC-2, AC-3, AC-4, AC-5a, AC-5b
  - 5 GREEN assertions: AC-5c, AC-5d, AC-5e, AC-6, AC-7 (pass with stub implementations)

tests_skipped: []

tsc_clean: true
full_suite_pass: false (6 failing assertions expected in RED phase)
