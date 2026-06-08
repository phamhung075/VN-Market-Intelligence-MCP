// Test isolation
Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach } from "bun:test";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";
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
