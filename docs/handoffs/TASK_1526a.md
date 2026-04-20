# TASK_1526a — RED: push-prices market hours guard (failing tests)

sprint: 216
phase: RED
depends_on: none

## Goal

3 failing assertions proving `detectSignals` loop + `storeAlerts` are skipped outside VN market hours. Price-alert thresholds (stop-loss/TP) must NOT be guarded — only signal detection.

## Test file

`src/__tests__/1526-push-prices-market-hours-guard.test.ts`

## Acceptance Criteria

| AC | Scenario | Expected |
|----|----------|----------|
| AC-1 | Weekend (Saturday UTC) | `detectSignals` NOT called; `storeAlerts` NOT called |
| AC-2 | Weekday, off-hours (UTC 01:00 — before market open) | `detectSignals` NOT called; `storeAlerts` NOT called |
| AC-3 | Weekday, inside market hours (UTC 04:00) | `detectSignals` called; `storeAlerts` called if signals present |

## Test stubs (must fail RED before GREEN)

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock isVnMarketHoursUtc — control market hours in tests
vi.mock("../../scheduler/vpsProxyWatchdogJob", () => ({
  isVnMarketHoursUtc: vi.fn(),
}));

// Mock detectSignals + storeAlerts to spy on calls
vi.mock("../../domain/services/signalDetector", () => ({
  detectSignals: vi.fn().mockReturnValue([]),
}));

vi.mock("../../infrastructure/db/alertStore", () => ({
  storeAlerts: vi.fn(),
}));

import { isVnMarketHoursUtc } from "../../scheduler/vpsProxyWatchdogJob";
import { detectSignals } from "../../domain/services/signalDetector";
import { storeAlerts } from "../../infrastructure/db/alertStore";

describe("push-prices: market hours guard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("AC-1: skips detectSignals on weekend", async () => {
    (isVnMarketHoursUtc as ReturnType<typeof vi.fn>).mockReturnValue(false);
    // invoke the relevant handler path (see TASK_1526b for exact invocation)
    // ...trigger push-prices handler with weekend clock...
    expect(detectSignals).not.toHaveBeenCalled();
    expect(storeAlerts).not.toHaveBeenCalled();
  });

  it("AC-2: skips detectSignals on weekday off-hours", async () => {
    (isVnMarketHoursUtc as ReturnType<typeof vi.fn>).mockReturnValue(false);
    expect(detectSignals).not.toHaveBeenCalled();
    expect(storeAlerts).not.toHaveBeenCalled();
  });

  it("AC-3: runs detectSignals inside market hours", async () => {
    (isVnMarketHoursUtc as ReturnType<typeof vi.fn>).mockReturnValue(true);
    // ...trigger push-prices handler...
    // With mocked detectSignals returning [], storeAlerts not called — but detectSignals IS called
    expect(detectSignals).toHaveBeenCalled();
  });
});
```

## Notes

- `isVnMarketHoursUtc` signature: `(now?: Date) => boolean` — exported from `src/scheduler/vpsProxyWatchdogJob.ts` line 59.
- Market hours: Mon-Fri UTC 02:00–08:59.
- Do NOT guard Telegram price-alert sends for stop-loss/TP — those must remain active 24/7.
- Tests fail RED because the guard does not yet exist in `server.ts`.

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1526-push-prices-market-hours-guard.test.ts   # created: 3 RED tests

tests_written:
- src/__tests__/1526-push-prices-market-hours-guard.test.ts   # 3 assertions, all RED (import fails — module not yet created)

tests_skipped: []

tsc_clean: n/a (RED phase — no implementation code to check)
full_suite_pass: n/a (RED phase)
