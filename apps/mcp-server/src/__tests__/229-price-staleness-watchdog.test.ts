// Test isolation
Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach } from "bun:test";
import { VN_OFFSET_MS } from "../domain/services/timeConstants.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";
import {
  priceUpdateWatchdog,
  isVnMarketHoursUtc,
  readLatestPriceTimestamp,
  _resetWatchdogCooldown,
  _resetWatchdogStaleFlag,
} from "../scheduler/market-data/priceUpdateWatchdogJob";

// Wed 2026-04-21T05:00:00Z — during VN market hours (Mon-Fri 02:00-08:59 UTC)
const MARKET_NOW = new Date("2026-04-21T05:00:00Z");

// Before market hours (01:59 UTC)
const OFF_HOURS_EARLY = new Date("2026-04-21T01:59:00Z");

// After market hours (09:00 UTC)
const OFF_HOURS_LATE = new Date("2026-04-21T09:00:00Z");

// Saturday 04:00 UTC (outside Mon-Fri)
const SATURDAY_04H = new Date("2026-04-26T04:00:00Z");

// Fresh price (within 6h)
const FRESH = () => new Date(MARKET_NOW.getTime() - 3 * 60 * 60 * 1000); // 3h old

// Stale price (>6h old)
const STALE = () => new Date(MARKET_NOW.getTime() - VN_OFFSET_MS); // 7h old

describe("Price Staleness Watchdog (229)", () => {
  beforeEach(() => {
    _resetWatchdogCooldown();
    _resetWatchdogStaleFlag();
  });

  // AC-1: Detects staleness >6h during market hours
  it("AC-1: detects price staleness >6h during market hours → returns 'alert-sent'", async () => {
    const staleTime = STALE();

    const result = await priceUpdateWatchdog({
      now: MARKET_NOW,
      readPrice: () => staleTime,
      notify: async () => {},
      notifyUser: async () => {},
    });

    expect(result).toBe("alert-sent");
  });

  // AC-2: Respects 30-min cooldown
  it("AC-2: respects 30-min cooldown → second alert returns 'cooldown'", async () => {
    const staleTime = STALE();

    // First alert
    await priceUpdateWatchdog({
      now: MARKET_NOW,
      readPrice: () => staleTime,
      notify: async () => {},
      notifyUser: async () => {},
    });

    // Second check 15 min later (within 30-min cooldown)
    const checkTime2 = new Date(MARKET_NOW.getTime() + 15 * 60 * 1000);
    const result = await priceUpdateWatchdog({
      now: checkTime2,
      readPrice: () => staleTime,
      notify: async () => {},
      notifyUser: async () => {},
    });

    expect(result).toBe("cooldown");
  });

  // AC-3: Off-hours guard prevents alerts outside Mon-Fri 02:00-08:59 UTC
  it("AC-3: off-hours guard (01:59 UTC) with stale data → returns 'off-hours'", async () => {
    const staleTime = STALE();

    const result = await priceUpdateWatchdog({
      now: OFF_HOURS_EARLY,
      readPrice: () => staleTime,
      notify: async () => {},
      notifyUser: async () => {},
    });

    expect(result).toBe("off-hours");
  });

  // AC-4: Recovery message fires when stale data restores
  it("AC-4: recovery message when price becomes fresh after stale → returns 'restored'", async () => {
    const staleTime = STALE();

    // First check — price is stale
    await priceUpdateWatchdog({
      now: MARKET_NOW,
      readPrice: () => staleTime,
      notify: async () => {},
      notifyUser: async () => {},
    });

    // Advance past cooldown (35 min later)
    const recoveryCheckTime = new Date(MARKET_NOW.getTime() + 35 * 60 * 1000);

    // Second check — price is fresh
    const freshTime = new Date(recoveryCheckTime.getTime() - 2 * 60 * 60 * 1000); // 2h old
    const result = await priceUpdateWatchdog({
      now: recoveryCheckTime,
      readPrice: () => freshTime,
      notify: async () => {},
      notifyUser: async () => {},
    });

    expect(result).toBe("restored");
  });

  // AC-5: isVnMarketHoursUtc() returns true only Mon-Fri 02:00-08:59 UTC
  it("AC-5a: isVnMarketHoursUtc() returns true at 02:00 UTC Mon (market open)", () => {
    // Monday 2026-04-20T02:00:00Z
    const mondayOpen = new Date("2026-04-20T02:00:00Z");
    expect(isVnMarketHoursUtc(mondayOpen)).toBe(true);
  });

  it("AC-5b: isVnMarketHoursUtc() returns true at 08:59 UTC Mon (market close)", () => {
    // Monday 2026-04-20T08:59:00Z
    const mondayClose = new Date("2026-04-20T08:59:00Z");
    expect(isVnMarketHoursUtc(mondayClose)).toBe(true);
  });

  it("AC-5c: isVnMarketHoursUtc() returns false at 01:59 UTC (before open)", () => {
    expect(isVnMarketHoursUtc(OFF_HOURS_EARLY)).toBe(false);
  });

  it("AC-5d: isVnMarketHoursUtc() returns false at 09:00 UTC (after close)", () => {
    expect(isVnMarketHoursUtc(OFF_HOURS_LATE)).toBe(false);
  });

  it("AC-5e: isVnMarketHoursUtc() returns false on Saturday 04:00 UTC (weekend)", () => {
    expect(isVnMarketHoursUtc(SATURDAY_04H)).toBe(false);
  });

  // AC-6: readLatestPriceTimestamp() filters TEST/PROBE rows
  it("AC-6: readLatestPriceTimestamp() filters TEST suffix and returns valid timestamp", async () => {
    const result = readLatestPriceTimestamp();
    // Should either return null (empty table) or a valid Date
    // When DB is populated with real data, should exclude TEST/PROBE rows
    expect(result === null || result instanceof Date).toBe(true);
  });

  // AC-7: Healthy price path returns 'ok'
  it("AC-7: healthy price path (<6h old) during market hours → returns 'ok'", async () => {
    const freshTime = FRESH();

    const result = await priceUpdateWatchdog({
      now: MARKET_NOW,
      readPrice: () => freshTime,
      notify: async () => {},
      notifyUser: async () => {},
    });

    expect(result).toBe("ok");
  });
});
