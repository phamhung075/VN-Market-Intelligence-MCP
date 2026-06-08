// Test isolation
Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach } from "bun:test";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";
import {
  runVpsProxyWatchdog,
  _resetWatchdogCooldown,
} from "../scheduler/vpsProxyWatchdogJob.js";

// Wed 2026-04-22T03:30:00Z — VN market hours
const MARKET_NOW = new Date("2026-04-22T03:30:00Z");

describe("TASK-1550 watchdog MARKET channel alert", () => {
  beforeEach(() => {
    _resetWatchdogCooldown();
  });

  // 1. MARKET alert fires when stale — human-friendly, names stale services, no SSH commands
  it("sends MARKET alert when data is stale", async () => {
    const workCalls: string[] = [];
    const marketCalls: string[] = [];

    const result = await runVpsProxyWatchdog({
      now: MARKET_NOW,
      notify: async (m) => { workCalls.push(m); return true; },
      notifyUser: async (m) => { marketCalls.push(m); return true; },
      readPrice: () => null,
      readNews:  () => new Date(MARKET_NOW.getTime() - 5 * 60_000),
      readOhlcv: () => new Date(MARKET_NOW.getTime() - 5 * 60_000),
    });

    expect(result).toBe("alert-sent");
    // WORK alert still fires
    expect(workCalls.length).toBe(1);
    // MARKET alert fires
    expect(marketCalls.length).toBe(1);
    // user message: human-friendly, names stale service, no SSH
    expect(marketCalls[0]).toContain("vn-price-fetch");
    expect(marketCalls[0]).not.toContain("ssh");
    expect(marketCalls[0]).not.toContain("systemctl");
  });

  // 2. MARKET alert skipped during cooldown (WORK also skipped)
  it("skips MARKET alert during cooldown", async () => {
    const marketCalls: string[] = [];
    const notifyUser = async (m: string) => { marketCalls.push(m); return true; };

    // First run — alert sent
    await runVpsProxyWatchdog({
      now: MARKET_NOW,
      notify: async () => true,
      notifyUser,
      readPrice: () => null,
      readNews:  () => null,
      readOhlcv: () => null,
    });

    // Second run within cooldown window (10 min later)
    const result = await runVpsProxyWatchdog({
      now: new Date(MARKET_NOW.getTime() + 10 * 60_000),
      notify: async () => true,
      notifyUser,
      readPrice: () => null,
      readNews:  () => null,
      readOhlcv: () => null,
    });

    expect(result).toBe("cooldown");
    // Only 1 MARKET alert total (first run only)
    expect(marketCalls.length).toBe(1);
  });

  // 3. WORK alert still fires (existing behaviour preserved)
  it("WORK alert still fires independently of MARKET alert", async () => {
    const workCalls: string[] = [];

    const result = await runVpsProxyWatchdog({
      now: MARKET_NOW,
      notify: async (m) => { workCalls.push(m); return true; },
      notifyUser: async () => true,
      readPrice: () => new Date(MARKET_NOW.getTime() - 5 * 60_000),
      readNews:  () => null,
      readOhlcv: () => new Date(MARKET_NOW.getTime() - 5 * 60_000),
    });

    expect(result).toBe("alert-sent");
    expect(workCalls.length).toBe(1);
    expect(workCalls[0]).toContain("vn-news-fetch");
  });
});
