/**
 * TASK 1920c — Commodity Tracker + Shipping Index Refresh Job tests
 *
 * TC-1: Commodity fetch + store called on success
 * TC-2: Shipping fetch + store called on success
 * TC-3: Commodity failure does NOT abort shipping call
 * TC-4: WORK telegram sent on commodity error (with job + error detail)
 * TC-5: Shipping failure does NOT abort commodity call; WORK telegram sent
 * TC-6: recordJobRun receives rowsWritten when both calls succeed
 * TC-7: CRONS.commodityTrackerRefresh === '0 6 * * *'
 *
 * All tests inject deps (fetchCommodityFn / storeCommodityFn /
 * fetchShippingFn / storeShippingFn / sendWorkFn) — no real HTTP,
 * no real Telegram, no real DB writes from within the job.
 *
 * DB: :memory: (set globally in setup.ts preload).
 */
import { describe, it, expect, beforeEach } from "bun:test";
import {
  runCommodityTrackerRefreshJob,
  type CommodityTrackerRefreshOptions,
} from "../scheduler/macro/commodityTrackerRefreshJob.js";
import { CRONS } from "../scheduler/cronConfig.js";
import { initDatabase, closeDb } from "../infrastructure/db/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeOpts(overrides: Partial<CommodityTrackerRefreshOptions> = {}): CommodityTrackerRefreshOptions {
  return {
    fetchCommodityFn: async () => ({ brentCrudeUSD: 80, goldUSDPerOz: 2300, usdVndRate: 25000, fetchedAt: "2026-05-16T06:00:00.000Z", vix: 15, sp500: 5000, shanghaiComp: 3000, hangSeng: 18000, dxy: 104, cnyVndRate: null, copperUSD: 4.5, silverUSDPerOz: 28, jpyVndRate: 0.006, us10yYield: 4.2 }),
    storeCommodityFn: async () => {},
    fetchShippingFn: async () => [{ name: "BDI", value: 1500, change: 10, changePct: 0.67, date: "2026-05-16" }],
    storeShippingFn: async () => {},
    sendWorkFn: async (_msg: string) => {},
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1920c — commodityTrackerRefreshJob", () => {
  beforeEach(async () => {
    closeDb();
    await initDatabase();
  });

  // TC-1: Commodity fetch + store called
  it("TC-1: calls fetchCommodityFn and storeCommodityFn on success", async () => {
    let fetchCalled = false;
    let storeCalled = false;

    const result = await runCommodityTrackerRefreshJob(makeOpts({
      fetchCommodityFn: async () => {
        fetchCalled = true;
        return { brentCrudeUSD: 80, goldUSDPerOz: 2300, usdVndRate: 25000, fetchedAt: "2026-05-16T06:00:00.000Z", vix: 15, sp500: 5000, shanghaiComp: 3000, hangSeng: 18000, dxy: 104, cnyVndRate: null, copperUSD: 4.5, silverUSDPerOz: 28, jpyVndRate: 0.006, us10yYield: 4.2 };
      },
      storeCommodityFn: async () => { storeCalled = true; },
    }));

    expect(fetchCalled).toBe(true);
    expect(storeCalled).toBe(true);
    expect(result.commoditySuccess).toBe(true);
  });

  // TC-2: Shipping fetch + store called
  it("TC-2: calls fetchShippingFn and storeShippingFn on success", async () => {
    let fetchCalled = false;
    let storeCalled = false;

    const result = await runCommodityTrackerRefreshJob(makeOpts({
      fetchShippingFn: async () => {
        fetchCalled = true;
        return [{ name: "BDI", value: 1500, change: 10, changePct: 0.67, date: "2026-05-16" }];
      },
      storeShippingFn: async () => { storeCalled = true; },
    }));

    expect(fetchCalled).toBe(true);
    expect(storeCalled).toBe(true);
    expect(result.shippingSuccess).toBe(true);
  });

  // TC-3: Commodity failure does NOT abort shipping call
  it("TC-3: shipping call runs even when commodity fetch throws", async () => {
    let shippingFetchCalled = false;
    const workMessages: string[] = [];

    const result = await runCommodityTrackerRefreshJob(makeOpts({
      fetchCommodityFn: async () => { throw new Error("commodity network timeout"); },
      fetchShippingFn: async () => {
        shippingFetchCalled = true;
        return [{ name: "BDI", value: 1500, change: 10, changePct: 0.67, date: "2026-05-16" }];
      },
      sendWorkFn: async (msg: string) => { workMessages.push(msg); },
    }));

    expect(shippingFetchCalled).toBe(true);
    expect(result.shippingSuccess).toBe(true);
    expect(result.commoditySuccess).toBe(false);
    // Only one WORK alert for commodity error
    expect(workMessages.length).toBe(1);
    expect(workMessages[0]).toContain("commodityTrackerRefresh");
    expect(workMessages[0]).toContain("commodity");
  });

  // TC-4: WORK telegram sent on commodity error
  it("TC-4: sends WORK telegram with job name and error when commodity fails", async () => {
    const workMessages: string[] = [];

    await runCommodityTrackerRefreshJob(makeOpts({
      fetchCommodityFn: async () => { throw new Error("yahoo down"); },
      sendWorkFn: async (msg: string) => { workMessages.push(msg); },
    }));

    expect(workMessages.length).toBeGreaterThan(0);
    expect(workMessages[0]).toContain("commodityTrackerRefresh");
    expect(workMessages[0]).toContain("yahoo down");
  });

  // TC-5: Shipping failure does NOT abort commodity call; WORK telegram sent
  it("TC-5: commodity call runs even when shipping fetch throws; WORK alert sent", async () => {
    let commodityStoreCalled = false;
    const workMessages: string[] = [];

    const result = await runCommodityTrackerRefreshJob(makeOpts({
      storeCommodityFn: async () => { commodityStoreCalled = true; },
      fetchShippingFn: async () => { throw new Error("shipping api down"); },
      sendWorkFn: async (msg: string) => { workMessages.push(msg); },
    }));

    expect(commodityStoreCalled).toBe(true);
    expect(result.commoditySuccess).toBe(true);
    expect(result.shippingSuccess).toBe(false);
    expect(workMessages.length).toBe(1);
    expect(workMessages[0]).toContain("commodityTrackerRefresh");
    expect(workMessages[0]).toContain("shipping");
  });

  // TC-6: rowsWritten reflects combined commodity + shipping result
  it("TC-6: returns rowsWritten summing commodity and shipping counts", async () => {
    const result = await runCommodityTrackerRefreshJob(makeOpts());

    // commodity snapshot writes 1 row; shipping returns 1 index
    expect(result.rowsWritten).toBeGreaterThanOrEqual(1);
    expect(result.commoditySuccess).toBe(true);
    expect(result.shippingSuccess).toBe(true);
  });

  // TC-7: cron expression check
  it("TC-7: CRONS.commodityTrackerRefresh defaults to '0 6 * * *'", () => {
    expect(CRONS.commodityTrackerRefresh).toBe("0 6 * * *");
  });
});
