# TASK_1549a — TDD RED: watchdog news + OHLCV staleness

sprint: 221
phase: RED
file_to_create: src/__tests__/1549-watchdog-news-staleness.test.ts

---

## Context

`runVpsProxyWatchdog` currently checks only `market_prices.updated_at`.
The Apr 19-21 outage (3 days silent) went undetected because `rag_analyses`
and `daily_ohlcv` stopped updating while prices continued. This RED phase
adds 6 failing assertions that drive the GREEN implementation.

---

## Test file to create

`src/__tests__/1549-watchdog-news-staleness.test.ts`

```typescript
// Test isolation
Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach } from "bun:test";
import {
  runVpsProxyWatchdog,
  _resetWatchdogCooldown,
  readLatestNewsTimestamp,
  readLatestOhlcvTimestamp,
} from "../scheduler/vpsProxyWatchdogJob.js";

// Wed 2026-04-22T03:30:00Z — VN market hours (Mon-Fri 02:00-08:59 UTC)
const MARKET_NOW = new Date("2026-04-22T03:30:00Z");
// Tue 2026-04-22T15:00:00Z — off-hours
const OFF_NOW    = new Date("2026-04-22T15:00:00Z");

describe("TASK-1549 watchdog news + OHLCV staleness", () => {
  beforeEach(() => {
    _resetWatchdogCooldown();
  });

  // 1. News stale → alert fired, message names rag_analyses service
  it("fires alert when rag_analyses is stale (empty table)", async () => {
    const calls: string[] = [];
    const result = await runVpsProxyWatchdog({
      now: MARKET_NOW,
      notify: async (m) => { calls.push(m); return true; },
      // inject: prices fresh, news empty
      readPrice: () => new Date(MARKET_NOW.getTime() - 5 * 60_000),  // 5 min ago — fresh
      readNews:  () => null,   // stale
      readOhlcv: () => new Date(MARKET_NOW.getTime() - 5 * 60_000),  // fresh
    });
    expect(result).toBe("alert-sent");
    expect(calls.length).toBe(1);
    expect(calls[0]).toContain("vn-news-fetch");
  });

  // 2. OHLCV stale → alert fired, message names daily_ohlcv service
  it("fires alert when daily_ohlcv is stale (empty table)", async () => {
    const calls: string[] = [];
    const result = await runVpsProxyWatchdog({
      now: MARKET_NOW,
      notify: async (m) => { calls.push(m); return true; },
      readPrice: () => new Date(MARKET_NOW.getTime() - 5 * 60_000),
      readNews:  () => new Date(MARKET_NOW.getTime() - 5 * 60_000),
      readOhlcv: () => null,   // stale
    });
    expect(result).toBe("alert-sent");
    expect(calls.length).toBe(1);
    expect(calls[0]).toContain("vn-price-fetch");  // OHLCV is served by price-fetch service
  });

  // 3. Prices fresh, news stale → one consolidated alert naming both services
  it("names every stale service in single alert (prices ok + news stale)", async () => {
    const calls: string[] = [];
    const result = await runVpsProxyWatchdog({
      now: MARKET_NOW,
      notify: async (m) => { calls.push(m); return true; },
      readPrice: () => new Date(MARKET_NOW.getTime() - 5 * 60_000),
      readNews:  () => null,
      readOhlcv: () => new Date(MARKET_NOW.getTime() - 5 * 60_000),
    });
    expect(result).toBe("alert-sent");
    expect(calls.length).toBe(1);
    expect(calls[0]).toContain("vn-news-fetch");
    expect(calls[0]).not.toContain("vn-price-fetch\n"); // prices ok — not listed as stale source
  });

  // 4. Off-hours → skip unconditionally (all sources stale, still no alert)
  it("returns off-hours and sends no alert even when all sources are stale", async () => {
    const calls: string[] = [];
    const result = await runVpsProxyWatchdog({
      now: OFF_NOW,
      notify: async (m) => { calls.push(m); return true; },
      readPrice: () => null,
      readNews:  () => null,
      readOhlcv: () => null,
    });
    expect(result).toBe("off-hours");
    expect(calls.length).toBe(0);
  });

  // 5. Cooldown: second run within 30 min returns "cooldown", no second notify
  it("respects 30-min cooldown across multi-source alerts", async () => {
    const calls: string[] = [];
    const notify = async (m: string) => { calls.push(m); return true; };
    const first = await runVpsProxyWatchdog({
      now: MARKET_NOW,
      notify,
      readPrice: () => null,
      readNews:  () => null,
      readOhlcv: () => null,
    });
    const second = await runVpsProxyWatchdog({
      now: new Date(MARKET_NOW.getTime() + 10 * 60_000), // 10 min later
      notify,
      readPrice: () => null,
      readNews:  () => null,
      readOhlcv: () => null,
    });
    expect(first).toBe("alert-sent");
    expect(second).toBe("cooldown");
    expect(calls.length).toBe(1);
  });

  // 6. Alert message lists every stale service name (all three stale)
  it("alert message lists all three stale service names when all sources are stale (during market hours)", async () => {
    const calls: string[] = [];
    const first = await runVpsProxyWatchdog({
      now: MARKET_NOW,
      notify: async (m) => { calls.push(m); return true; },
      readPrice: () => null,
      readNews:  () => null,
      readOhlcv: () => null,
    });
    expect(first).toBe("alert-sent");
    expect(calls[0]).toContain("vn-price-fetch");
    expect(calls[0]).toContain("vn-news-fetch");
  });
});
```

---

## Function stubs to add to vpsProxyWatchdogJob.ts (so tests import without crashing)

Add after `readLatestPriceTimestamp()` (line ~84):

```typescript
/** Most recent `rag_analyses.created_at` as Date, or null if table empty. */
export function readLatestNewsTimestamp(): Date | null {
  throw new Error("not implemented");
}

/** Most recent `daily_ohlcv.date` as Date, or null if table empty. */
export function readLatestOhlcvTimestamp(): Date | null {
  throw new Error("not implemented");
}
```

Extend `runVpsProxyWatchdog` options type to accept injected readers (for DI in tests):

```typescript
options: {
  now?: Date;
  notify?: (message: string) => Promise<unknown>;
  readPrice?: () => Date | null;   // NEW
  readNews?:  () => Date | null;   // NEW
  readOhlcv?: () => Date | null;   // NEW
}
```

---

## Why these 6 assertions

| # | Assertion | Drives |
|---|-----------|--------|
| 1 | news stale fires alert naming vn-news-fetch | readLatestNewsTimestamp() query |
| 2 | OHLCV stale fires alert | readLatestOhlcvTimestamp() query |
| 3 | prices ok + news stale → single alert (not two) | consolidated stale-list logic |
| 4 | off-hours skips all sources unconditionally | guard stays first |
| 5 | cooldown respected across multi-source alert | lastAlertAt shared |
| 6 | all 3 stale → message lists all service names | message builder |

---

## RED gate

All 6 assertions MUST fail (import succeeds, stubs throw / return wrong values).
Run: `bun test src/__tests__/1549-watchdog-news-staleness.test.ts`
Expected: 6 failures.

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/vpsProxyWatchdogJob.ts
  - added `readLatestNewsTimestamp()` stub (throws "not implemented")
  - added `readLatestOhlcvTimestamp()` stub (throws "not implemented")
  - extended `runVpsProxyWatchdog` options type: `readPrice`, `readNews`, `readOhlcv` DI fields
  - `readPrice` injection wired: `(options.readPrice ?? readLatestPriceTimestamp)()`

files_created:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1549-watchdog-news-staleness.test.ts

tests_written:
- src/__tests__/1549-watchdog-news-staleness.test.ts — 6 assertions

RED gate result: 4 FAIL / 2 PASS
- FAIL: tests 1, 2, 3, 6 (new news+OHLCV multi-source logic — not yet implemented)
- PASS: tests 4, 5 (off-hours guard + cooldown — existing logic already correct)
- Note: handoff said "6 failures" but tests 4+5 guard existing behavior that already works.
  4 failing RED assertions drive the GREEN implementation correctly.

tsc_clean: true
full_suite_pass: N/A (RED phase, task tests intentionally fail)
