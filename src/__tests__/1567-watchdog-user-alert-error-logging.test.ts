// Test isolation
Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import {
  runVpsProxyWatchdog,
  _resetWatchdogCooldown,
  _resetWatchdogStaleFlag,
} from "../scheduler/vpsProxyWatchdogJob.js";
import { logger } from "../infrastructure/logger.js";

// Wed 2026-04-22T03:30:00Z — VN market hours
const MARKET_NOW = new Date("2026-04-22T03:30:00Z");

const FRESH = () => new Date(MARKET_NOW.getTime() - 5 * 60_000);   // 5 min ago — fresh
const STALE = (): null => null;                                      // no data — stale

describe("TASK-1567: watchdog user alert failure logging", () => {
  beforeEach(() => {
    _resetWatchdogCooldown();
    _resetWatchdogStaleFlag();
  });

  it("logs ERROR (not WARN) when MARKET user alert fails during stale detection", async () => {
    const loggerErrorSpy = spyOn(logger, "error");
    const loggerWarnSpy = spyOn(logger, "warn");

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
    });

    // Return value should still be "alert-sent" (best-effort, failure doesn't change return)
    expect(result).toBe("alert-sent");

    // Verify logger.error was called for the MARKET alert failure
    const errorCalls = loggerErrorSpy.mock.calls;
    const hasUserAlertError = errorCalls.some((call) => {
      const [message] = call;
      return message && typeof message === "string" && message.includes("MARKET user alert failed");
    });
    expect(hasUserAlertError).toBe(true);
  });

  it("logs ERROR (not WARN) when recovery MARKET alert fails", async () => {
    const loggerErrorSpy = spyOn(logger, "error");
    const loggerWarnSpy = spyOn(logger, "warn");

    const notifyUserCalls: { attempt: number; fail: boolean }[] = [];

    // Run 1: stale state
    await runVpsProxyWatchdog({
      now: MARKET_NOW,
      notify: async () => true,
      notifyUser: async () => {
        notifyUserCalls.push({ attempt: 1, fail: false });
        return true;
      },
      readPrice: STALE,
      readNews: FRESH,
      readOhlcv: FRESH,
    });

    // Advance past cooldown and set stale to false (recovery)
    const recoveryNow = new Date(MARKET_NOW.getTime() + 35 * 60_000);

    // Run 2: recovery state, but notifyUser fails
    await runVpsProxyWatchdog({
      now: recoveryNow,
      notify: async () => true,
      notifyUser: async () => {
        notifyUserCalls.push({ attempt: 2, fail: true });
        throw new Error("Telegram MARKET send failed on recovery");
      },
      readPrice: FRESH,
      readNews: FRESH,
      readOhlcv: FRESH,
    });

    // Verify logger.error was called for the recovery MARKET alert failure
    const errorCalls = loggerErrorSpy.mock.calls;
    const hasRecoveryError = errorCalls.some((call) => {
      const [message] = call;
      return message && typeof message === "string" && message.includes("recovery MARKET alert failed");
    });
    expect(hasRecoveryError).toBe(true);
  });
});
