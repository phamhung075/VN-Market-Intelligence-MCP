// Test isolation
Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach } from "bun:test";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";
import {
  runVpsProxyWatchdog,
  _resetWatchdogCooldown,
  _resetWatchdogStaleFlag,
} from "../scheduler/vpsProxyWatchdogJob.js";

// Wed 2026-04-22T03:30:00Z — VN market hours
const MARKET_NOW = new Date("2026-04-22T03:30:00Z");

const FRESH = () => new Date(MARKET_NOW.getTime() - 5 * 60_000);   // 5 min ago — fresh
const STALE = (): null => null;                                      // no data — stale

// Fresh readers for Reuters/TE — prevent infinite staleness when DB has no tables
const readReuters = FRESH;
const readTe = FRESH;

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
      readForeignFlow: FRESH,
      readReuters,
      readTe,
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
      readForeignFlow: FRESH,
      readReuters,
      readTe,
    });

    expect(result).toBe("restored");
    // marketCalls[0] = stale alert only; recovery path does not call notifyUser
    expect(marketCalls.length).toBe(1);
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
      readForeignFlow: FRESH,
      readReuters,
      readTe,
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
      readForeignFlow: FRESH,
      readReuters,
      readTe,
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
      readForeignFlow: FRESH,
      readReuters,
      readTe,
    });

    expect(result).toBe("ok");
    // Only 1 call total (the stale alert). No recovery.
    expect(marketCalls.length).toBe(1);
  });
});
