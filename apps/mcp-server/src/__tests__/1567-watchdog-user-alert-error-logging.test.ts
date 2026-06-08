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

// Fresh readers for Reuters/TE — prevent infinite staleness when DB has no tables
const readReuters = FRESH;
const readTe = FRESH;

describe("TASK-1567: watchdog user alert failure logging", () => {
  beforeEach(() => {
    _resetWatchdogCooldown();
    _resetWatchdogStaleFlag();
  });

  it("still returns alert-sent when MARKET user alert fails during stale detection (best-effort)", async () => {
    // Stub notify (work alert) to succeed, but notifyUser (MARKET alert) to fail
    const notify = async () => true;
    const notifyUser = async () => {
      throw new Error("Telegram MARKET send failed");
    };

    const result = await runVpsProxyWatchdog({
      now: MARKET_NOW,
      notify,
      notifyUser,
      readPrice: STALE,
      readNews: FRESH,
      readOhlcv: FRESH,
      readForeignFlow: FRESH,
      readReuters,
      readTe,
    });

    // Return value should still be "alert-sent" (notifyUser failure is best-effort, silently ignored)
    expect(result).toBe("alert-sent");
  });

  it("returns restored when pipeline recovers (recovery path does not call notifyUser)", async () => {
    const notifyUserCalls: number[] = [];

    // Run 1: stale state — notifyUser called once
    await runVpsProxyWatchdog({
      now: MARKET_NOW,
      notify: async () => true,
      notifyUser: async () => {
        notifyUserCalls.push(1);
        return true;
      },
      readPrice: STALE,
      readNews: FRESH,
      readOhlcv: FRESH,
      readForeignFlow: FRESH,
      readReuters,
      readTe,
    });

    // Advance past cooldown and set stale to false (recovery)
    const recoveryNow = new Date(MARKET_NOW.getTime() + 35 * 60_000);

    // Run 2: recovery state — notifyUser is NOT called by recovery path
    const result = await runVpsProxyWatchdog({
      now: recoveryNow,
      notify: async () => true,
      notifyUser: async () => {
        notifyUserCalls.push(2);
        return true;
      },
      readPrice: FRESH,
      readNews: FRESH,
      readOhlcv: FRESH,
      readForeignFlow: FRESH,
      readReuters,
      readTe,
    });

    expect(result).toBe("restored");
    // Only the stale run called notifyUser; recovery path skips it
    expect(notifyUserCalls).toEqual([1]);
  });
});
