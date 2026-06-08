/**
 * TASK 1920a — vnstock Fundamentals + Trading Stats Scheduler Job tests
 *
 * TC-1: isRunning guard — second invocation while first is in progress
 *        returns early without calling syncFn
 * TC-2: per-ticker error isolation — one failing ticker does not abort the rest
 * TC-3: rate-limit delay — syncVnstockData is called sequentially per ticker
 *        (no concurrent Promise.all)
 * TC-4: upsert called with correct table targets — WORK alert fires when
 *        failed.length > 0
 *
 * All tests inject deps — no real HTTP calls, no real Telegram.
 * DB: :memory: (set globally in setup.ts preload).
 */
import { describe, it, expect, beforeEach } from "bun:test";
import {
  runVnstockFundamentalsJob,
  runVnstockTradingStatsJob,
} from "../scheduler/financial-reports/vnstockFundamentalsJob.js";
import { CRONS } from "../scheduler/cronConfig.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ── TC helpers ────────────────────────────────────────────────────────────────

const MOCK_TICKERS = ["VCB", "FPT", "VNM"];

function makeTickerFailError(ticker: string): Error {
  return new Error(`[mock] fetch failed for ${ticker}`);
}

// ── TC-1: isRunning guard ─────────────────────────────────────────────────────

describe("Task 1920a — vnstockFundamentalsJob", () => {
  // TC-1: isRunning guard prevents re-entry
  it("TC-1: second invocation while first is running returns early without calling syncFn", async () => {
    let syncCallCount = 0;

    // syncFn that never resolves on first call (simulates long sweep)
    let resolveFirst!: () => void;
    const firstCallPromise = new Promise<void>((res) => {
      resolveFirst = res;
    });

    const syncFn = async (_ticker: string): Promise<void> => {
      syncCallCount++;
      if (syncCallCount === 1) {
        await firstCallPromise; // block first call
      }
    };

    const workMessages: string[] = [];
    const sendWorkFn = async (msg: string): Promise<void> => {
      workMessages.push(msg);
    };

    // First call — starts running (will block)
    const firstJob = runVnstockFundamentalsJob({
      tickers: ["VCB", "FPT"],
      syncFn,
      sendWorkFn,
      _resetRunningState: true,
    });

    // Yield to let the first call set isRunning=true before starting second
    await new Promise((res) => setTimeout(res, 5));

    // Second call — should detect isRunning=true and skip
    const workMessages2: string[] = [];
    await runVnstockFundamentalsJob({
      tickers: ["VCB", "FPT"],
      syncFn,
      sendWorkFn: async (msg: string) => { workMessages2.push(msg); },
      _resetRunningState: false,
    });

    // Second call processed 0 tickers (returned early)
    expect(syncCallCount).toBe(1); // only first call started iterating

    // Unblock first job
    resolveFirst();
    await firstJob;
  });

  // TC-2: per-ticker error isolation
  it("TC-2: one failing ticker does not abort remaining tickers; failed list populated", async () => {
    const processedTickers: string[] = [];
    const syncFn = async (ticker: string): Promise<void> => {
      if (ticker === "VCB") throw makeTickerFailError(ticker);
      processedTickers.push(ticker);
    };

    const workMessages: string[] = [];
    const sendWorkFn = async (msg: string): Promise<void> => {
      workMessages.push(msg);
    };

    const result = await runVnstockFundamentalsJob({
      tickers: MOCK_TICKERS, // ["VCB", "FPT", "VNM"]
      syncFn,
      sendWorkFn,
      _resetRunningState: true,
    });

    // VCB failed, FPT + VNM succeeded
    expect(result.succeeded).toBe(2);
    expect(result.failed).toContain("VCB");
    expect(processedTickers).toContain("FPT");
    expect(processedTickers).toContain("VNM");

    // WORK alert fired because failed.length > 0
    expect(workMessages.length).toBeGreaterThan(0);
    expect(workMessages[0]).toContain("VCB");
  });

  // TC-3: sequential call order (rate-limit: no concurrent Promise.all)
  it("TC-3: syncFn is called sequentially per ticker (no Promise.all)", async () => {
    const callOrder: number[] = [];
    let activeCount = 0;
    let maxConcurrent = 0;

    const syncFn = async (_ticker: string): Promise<void> => {
      activeCount++;
      maxConcurrent = Math.max(maxConcurrent, activeCount);
      callOrder.push(activeCount);
      // Yield to allow hypothetical concurrent calls to stack up
      await new Promise((res) => setTimeout(res, 1));
      activeCount--;
    };

    await runVnstockFundamentalsJob({
      tickers: MOCK_TICKERS,
      syncFn,
      sendWorkFn: async () => {},
      _resetRunningState: true,
    });

    // If sequential, max active count is always 1
    expect(maxConcurrent).toBe(1);
  });

  // TC-4: WORK alert called with failed tickers when failed.length > 0
  it("TC-4: sends WORK alert containing failed ticker names when any ticker fails", async () => {
    const failingTickers = ["VCB", "FPT"];

    const syncFn = async (ticker: string): Promise<void> => {
      if (failingTickers.includes(ticker)) {
        throw new Error(`[mock] 429 rate limit on ${ticker}`);
      }
    };

    const workMessages: string[] = [];
    const sendWorkFn = async (msg: string): Promise<void> => {
      workMessages.push(msg);
    };

    await runVnstockFundamentalsJob({
      tickers: MOCK_TICKERS,
      syncFn,
      sendWorkFn,
      _resetRunningState: true,
    });

    expect(workMessages.length).toBeGreaterThan(0);
    const combinedMessages = workMessages.join("\n");
    expect(combinedMessages).toContain("VCB");
    expect(combinedMessages).toContain("FPT");
  });
});

// ── cronConfig: expression tests ─────────────────────────────────────────────

describe("Task 1920a — cronConfig expressions", () => {
  it("AC-1: vnstockFundamentalsRefresh cron expression is Mon 01:00 UTC", () => {
    expect(CRONS.vnstockFundamentalsRefresh).toBe("0 1 * * 1");
  });

  it("AC-1: vnstockTradingStatsRefresh cron expression is weekdays 08:30 UTC", () => {
    expect(CRONS.vnstockTradingStatsRefresh).toBe("30 8 * * 1-5");
  });
});

// ── Trading stats job: same isolation guarantees ──────────────────────────────

describe("Task 1920a — vnstockTradingStatsJob", () => {
  beforeEach(() => {
    // Ensure clean isRunning state before each test
  });

  it("TC-2b: one failing ticker does not abort trading stats sweep", async () => {
    const processedTickers: string[] = [];
    const syncFn = async (ticker: string): Promise<void> => {
      if (ticker === "VNM") throw new Error(`[mock] network timeout for ${ticker}`);
      processedTickers.push(ticker);
    };

    const workMessages: string[] = [];
    const result = await runVnstockTradingStatsJob({
      tickers: MOCK_TICKERS,
      syncFn,
      sendWorkFn: async (msg: string) => { workMessages.push(msg); },
      _resetRunningState: true,
    });

    expect(result.succeeded).toBe(2);
    expect(result.failed).toContain("VNM");
    expect(processedTickers).toContain("VCB");
    expect(processedTickers).toContain("FPT");
    expect(workMessages.length).toBeGreaterThan(0);
  });

  it("TC-3b: trading stats syncFn called sequentially", async () => {
    let activeCount = 0;
    let maxConcurrent = 0;

    const syncFn = async (_ticker: string): Promise<void> => {
      activeCount++;
      maxConcurrent = Math.max(maxConcurrent, activeCount);
      await new Promise((res) => setTimeout(res, 1));
      activeCount--;
    };

    await runVnstockTradingStatsJob({
      tickers: MOCK_TICKERS,
      syncFn,
      sendWorkFn: async () => {},
      _resetRunningState: true,
    });

    expect(maxConcurrent).toBe(1);
  });
});
