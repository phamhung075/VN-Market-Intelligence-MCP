// Test isolation
Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach } from "bun:test";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";
import {
  runVpsProxyWatchdog,
  _resetWatchdogCooldown,
  readLatestForeignFlowTimestamp,
} from "../scheduler/vpsProxyWatchdogJob.js";

// Wed 2026-04-23T03:30:00Z — VN market hours (Mon-Fri 02:00-08:59 UTC)
const MARKET_NOW = new Date("2026-04-23T03:30:00Z");
// Wed 2026-04-23T15:00:00Z — off-hours
const OFF_NOW    = new Date("2026-04-23T15:00:00Z");

/** Helpers: inject fresh reader for all other sources */
const freshReaders = (now: Date) => ({
  readPrice:   () => new Date(now.getTime() - 5 * 60_000),  // 5 min ago
  readNews:    () => new Date(now.getTime() - 5 * 60_000),
  readOhlcv:   () => new Date(now.getTime() - 5 * 60_000),
  readReuters: () => new Date(now.getTime() - 5 * 60_000),  // prevent infinite staleness
  readTe:      () => new Date(now.getTime() - 5 * 60_000),  // prevent infinite staleness
});

describe("TASK-1319 watchdog foreign_flow staleness", () => {
  beforeEach(() => {
    _resetWatchdogCooldown();
  });

  // 1. Empty table (null reader) → alert fired naming vn-foreign-flow
  it("fires alert when foreign_flow has never been written (null reader)", async () => {
    const calls: string[] = [];
    const result = await runVpsProxyWatchdog({
      now: MARKET_NOW,
      notify: async (m) => { calls.push(m); return true; },
      ...freshReaders(MARKET_NOW),
      readForeignFlow: () => null,
    });
    expect(result).toBe("alert-sent");
    expect(calls.length).toBe(1);
    expect(calls[0]).toContain("vn-foreign-flow");
  });

  // 2. Data older than 90 min → stale → alert
  it("fires alert when foreign_flow data is 91 minutes old", async () => {
    const calls: string[] = [];
    const result = await runVpsProxyWatchdog({
      now: MARKET_NOW,
      notify: async (m) => { calls.push(m); return true; },
      ...freshReaders(MARKET_NOW),
      readForeignFlow: () => new Date(MARKET_NOW.getTime() - 91 * 60_000),
    });
    expect(result).toBe("alert-sent");
    expect(calls.length).toBe(1);
    expect(calls[0]).toContain("vn-foreign-flow");
    expect(calls[0]).toContain("91 min");
  });

  // 3. Data exactly 90 min old → stale (>= boundary)
  it("fires alert when foreign_flow data is exactly 90 minutes old (boundary)", async () => {
    const calls: string[] = [];
    const result = await runVpsProxyWatchdog({
      now: MARKET_NOW,
      notify: async (m) => { calls.push(m); return true; },
      ...freshReaders(MARKET_NOW),
      readForeignFlow: () => new Date(MARKET_NOW.getTime() - 90 * 60_000),
    });
    expect(result).toBe("alert-sent");
    expect(calls[0]).toContain("vn-foreign-flow");
  });

  // 4. Data 89 min old → fresh → no alert
  it("returns ok when foreign_flow data is 89 minutes old (below threshold)", async () => {
    const calls: string[] = [];
    const result = await runVpsProxyWatchdog({
      now: MARKET_NOW,
      notify: async (m) => { calls.push(m); return true; },
      ...freshReaders(MARKET_NOW),
      readForeignFlow: () => new Date(MARKET_NOW.getTime() - 89 * 60_000),
    });
    expect(result).toBe("ok");
    expect(calls.length).toBe(0);
  });

  // 5. Off-hours → no alert even when foreign_flow is stale
  it("returns off-hours and sends no alert even when foreign_flow is stale", async () => {
    const calls: string[] = [];
    const result = await runVpsProxyWatchdog({
      now: OFF_NOW,
      notify: async (m) => { calls.push(m); return true; },
      ...freshReaders(OFF_NOW),
      readForeignFlow: () => null,
    });
    expect(result).toBe("off-hours");
    expect(calls.length).toBe(0);
  });

  // 6. Consolidated alert: all sources stale → single message names all services
  it("names vn-foreign-flow in consolidated alert when all sources are stale", async () => {
    const calls: string[] = [];
    const result = await runVpsProxyWatchdog({
      now: MARKET_NOW,
      notify: async (m) => { calls.push(m); return true; },
      readPrice:       () => null,
      readNews:        () => null,
      readOhlcv:       () => null,
      readForeignFlow: () => null,
    });
    expect(result).toBe("alert-sent");
    expect(calls.length).toBe(1);
    expect(calls[0]).toContain("vn-foreign-flow");
    expect(calls[0]).toContain("vn-price-fetch");
    expect(calls[0]).toContain("vn-news-fetch");
  });

  // 7. readLatestForeignFlowTimestamp returns null on empty in-memory DB
  it("readLatestForeignFlowTimestamp returns null when daily_ohlcv has no foreign_buy_vol rows", () => {
    const result = readLatestForeignFlowTimestamp();
    expect(result).toBeNull();
  });
});
