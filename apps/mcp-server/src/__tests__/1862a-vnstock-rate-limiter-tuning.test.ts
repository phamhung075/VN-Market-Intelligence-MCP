/**
 * Task 1862a — vnstock rate limiter tuning
 *
 * Problem: 10+ tickers RATE_LIMITED across 6 consecutive cycles.
 * Root cause: GLOBAL_RATE_LIMIT_RPM=50 too tight for 30 tickers × 6 endpoints = 180 calls/cycle.
 *             DELAY_MS=1500ms allows burst that exhausts the 50-slot window before all tickers complete.
 *
 * Fix:
 *   - GLOBAL_RATE_LIMIT_RPM: 50 → 80 (VCI actual limit is higher; 80 gives headroom for 30×6 scans)
 *   - SYNC_DELAY_MS: 1500ms → 2500ms (spreads calls to ~24/min, well within 80 RPM ceiling)
 *
 * Tests:
 * 1. GLOBAL_RATE_LIMIT_RPM is 80 (not 50)
 * 2. SYNC_DELAY_MS is 2500 (not 1500)
 * 3. VnstockRateLimiter with new 80 RPM allows 80 calls within a 60s window without blocking
 * 4. VnstockRateLimiter blocks the 81st call (budget exhausted)
 * 5. With 30 tickers × 6 endpoints at 2500ms delay, theoretical max rate is ≤ 80 RPM
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect } from "bun:test";
import {
  GLOBAL_RATE_LIMIT_RPM,
  VnstockRateLimiter,
} from "../infrastructure/fetchers/vnstockBridge.js";
import { SYNC_DELAY_MS } from "../application/usecases/syncVnstockData.js";

describe("Task 1862a — rate limiter constants", () => {
  it("1. GLOBAL_RATE_LIMIT_RPM is 80 (increased from 50 to handle 30 tickers × 6 endpoints)", () => {
    expect(GLOBAL_RATE_LIMIT_RPM).toBe(80);
  });

  it("2. SYNC_DELAY_MS is 2500ms (increased from 1500ms to spread calls to ≤24/min)", () => {
    expect(SYNC_DELAY_MS).toBe(2500);
  });
});

describe("Task 1862a — VnstockRateLimiter at 80 RPM", () => {
  it("3. allows 80 calls within window without blocking", async () => {
    const limiter = new VnstockRateLimiter(80, 60_000);
    const start = Date.now();
    // Acquire 80 slots — all should resolve immediately (within budget)
    const acquires = Array.from({ length: 80 }, () => limiter.acquire());
    await Promise.all(acquires);
    const elapsed = Date.now() - start;
    // All 80 should fit without waiting (< 500ms is generous)
    expect(elapsed).toBeLessThan(500);
  });

  it("4. 81st call is blocked when 80-slot budget is exhausted", async () => {
    const windowMs = 300; // short window for fast test
    const limiter = new VnstockRateLimiter(80, windowMs);

    // Fill the 80 slots
    const fills = Array.from({ length: 80 }, () => limiter.acquire());
    await Promise.all(fills);

    // 81st must wait until window slides
    const start = Date.now();
    await limiter.acquire();
    const waited = Date.now() - start;
    // Must have waited at least windowMs - small buffer (the window needs to slide)
    expect(waited).toBeGreaterThanOrEqual(windowMs - 50);
  });
});

describe("Task 1862a — throughput math: 30 tickers × 6 endpoints ≤ 80 RPM", () => {
  it("5. max call rate with SYNC_DELAY_MS=2500 and sequential execution is well below 80 RPM", () => {
    const delayMs = SYNC_DELAY_MS;
    const endpointsPerTicker = 6;

    // Sequential: one call every SYNC_DELAY_MS within a ticker
    // Max calls per minute from one sequential stream:
    const callsPerMinutePerStream = (60_000 / delayMs);

    // With 30 tickers processed sequentially (not in parallel), the single
    // sequential stream never exceeds callsPerMinutePerStream calls/min.
    // This must be well below GLOBAL_RATE_LIMIT_RPM.
    expect(callsPerMinutePerStream).toBeLessThanOrEqual(GLOBAL_RATE_LIMIT_RPM);

    // Sanity: 30 tickers × 6 stale endpoints each would require
    // 180 calls total. At 2500ms spacing, that takes 450s = 7.5 min.
    // Average rate = 180 / 7.5 = 24 calls/min — well within 80 RPM.
    const totalCalls = 30 * endpointsPerTicker;
    const totalTimeMin = (totalCalls * delayMs) / 60_000;
    const avgRpm = totalCalls / totalTimeMin;
    expect(avgRpm).toBeLessThan(GLOBAL_RATE_LIMIT_RPM);
  });
});
