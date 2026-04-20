# TASK_227a — RED: vpsProxyWatchdog recovery alert tests

sprint: 227
phase: RED (failing tests only — no implementation)
test_file: src/__tests__/1557-watchdog-recovery.test.ts

---

## Stubs needed before tests compile

In `src/scheduler/vpsProxyWatchdogJob.ts`, add export:

```typescript
export function _resetWatchdogStaleFlag(): void { /* stub — body in 227b */ }
```

Do NOT implement logic yet. The 3 assertions below must fail (wrong return value or missing behaviour).

---

## Test file: `src/__tests__/1557-watchdog-recovery.test.ts`

```typescript
// Test isolation
Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach } from "bun:test";
import {
  runVpsProxyWatchdog,
  _resetWatchdogCooldown,
  _resetWatchdogStaleFlag,
} from "../scheduler/vpsProxyWatchdogJob.js";

// Wed 2026-04-22T03:30:00Z — VN market hours
const MARKET_NOW = new Date("2026-04-22T03:30:00Z");

const FRESH = () => new Date(MARKET_NOW.getTime() - 5 * 60_000);   // 5 min ago — fresh
const STALE = (): null => null;                                      // no data — stale

describe("TASK-1557 watchdog recovery MARKET alert", () => {
  beforeEach(() => {
    _resetWatchdogCooldown();
    _resetWatchdogStaleFlag();
  });

  // 1. Recovery fires exactly once after a prior stale run
  it("sends recovery MARKET alert when pipeline recovers after stale", async () => {
    const marketCalls: string[] = [];
    const notifyUser = async (m: string) => { marketCalls.push(m); return true; };

    // Run 1 — stale → sets lastWasStale = true, sends alert, lastAlertAt set
    await runVpsProxyWatchdog({
      now: MARKET_NOW,
      notify: async () => true,
      notifyUser,
      readPrice: STALE,
      readNews:  FRESH,
      readOhlcv: FRESH,
    });

    // Advance past cooldown so "ok" path runs without cooldown interference
    const recoveryNow = new Date(MARKET_NOW.getTime() + 35 * 60_000);

    // Run 2 — all fresh → lastWasStale===true → sends recovery msg, returns "restored"
    const result = await runVpsProxyWatchdog({
      now: recoveryNow,
      notify: async () => true,
      notifyUser,
      readPrice: FRESH,
      readNews:  FRESH,
      readOhlcv: FRESH,
    });

    expect(result).toBe("restored");
    // marketCalls[0] = stale alert, marketCalls[1] = recovery alert
    expect(marketCalls.length).toBe(2);
    expect(marketCalls[1]).toContain("restored");
  });

  // 2. No recovery alert if pipeline was never stale
  it("does NOT send recovery alert if pipeline was never stale", async () => {
    const marketCalls: string[] = [];

    const result = await runVpsProxyWatchdog({
      now: MARKET_NOW,
      notify: async () => true,
      notifyUser: async (m) => { marketCalls.push(m); return true; },
      readPrice: FRESH,
      readNews:  FRESH,
      readOhlcv: FRESH,
    });

    expect(result).toBe("ok");
    expect(marketCalls.length).toBe(0);
  });

  // 3. _resetWatchdogStaleFlag clears lastWasStale → no recovery alert after reset
  it("_resetWatchdogStaleFlag prevents recovery alert", async () => {
    const marketCalls: string[] = [];
    const notifyUser = async (m: string) => { marketCalls.push(m); return true; };

    // Run 1 — stale → sets lastWasStale = true
    await runVpsProxyWatchdog({
      now: MARKET_NOW,
      notify: async () => true,
      notifyUser,
      readPrice: STALE,
      readNews:  FRESH,
      readOhlcv: FRESH,
    });

    // Reset the flag explicitly
    _resetWatchdogStaleFlag();

    const recoveryNow = new Date(MARKET_NOW.getTime() + 35 * 60_000);

    // Run 2 — fresh, but flag was cleared → no recovery alert → "ok"
    const result = await runVpsProxyWatchdog({
      now: recoveryNow,
      notify: async () => true,
      notifyUser,
      readPrice: FRESH,
      readNews:  FRESH,
      readOhlcv: FRESH,
    });

    expect(result).toBe("ok");
    // Only 1 call total (the stale alert). No recovery.
    expect(marketCalls.length).toBe(1);
  });
});
```

---

## Why tests fail at RED

- `_resetWatchdogStaleFlag` is a no-op stub → flag never set/cleared
- "ok" branch returns `"ok"` not `"restored"` — no recovery logic yet
- assertion 1: `result` is `"ok"` not `"restored"`, `marketCalls.length` is 1 not 2
- assertion 3: `result` is `"ok"` (passes), but `marketCalls.length` is 1 — only passes after GREEN

---

## Acceptance (RED done when)

`bun test src/__tests__/1557-watchdog-recovery.test.ts` runs, compiles cleanly, and ≥1 assertion fails.

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/vpsProxyWatchdogJob.ts   # added `_resetWatchdogStaleFlag` no-op stub export (lines 55-60)

files_created:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1557-watchdog-recovery.test.ts   # 3 tests, 2 RED / 1 GREEN (test 2 passes by coincidence with current "ok" return)

tests_written:
- src/__tests__/1557-watchdog-recovery.test.ts   # 4 assertions total: 2 fail (RED), 2 pass

tests_skipped: []

tsc_clean: true
full_suite_pass: false   # intentional RED — 2 assertions fail as designed
