/**
 * Task 1841b — U-10: Quarterly BCTC Batch Sweep
 *
 * Tests for:
 *   - bctcBatchSweepJob (cron job)
 *   - run_bctc_batch_sweep (MCP tool logic via bctcBatchSweepTool.ts)
 *
 * All VPS and Telegram calls are injected and mocked.
 * No real VPS calls, no real Telegram sends.
 */

import { describe, it, expect, mock } from "bun:test";
import {
  runBctcBatchSweep,
  isEarningsSeason,
  type BctcBatchSweepDeps,
  type BctcBatchSweepResult,
} from "../scheduler/financial-reports/bctcBatchSweepJob.js";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const SAMPLE_TICKERS = ["VCB", "FPT", "VNM", "HPG", "VHM"];

function makeDeps(overrides: Partial<BctcBatchSweepDeps> = {}): BctcBatchSweepDeps {
  return {
    getWatchlistTickers: async () => SAMPLE_TICKERS,
    getBctcFull: async (_ticker: string) => ({
      ticker: _ticker,
      hasData: true,
      latestQuarter: "Q4-2025",
    }),
    sendMarketDigest: async (_msg: string) => { /* no-op */ },
    sendBugAlert: async (_msg: string) => { /* no-op */ },
    recordJobRun: async (_jobName: string, _fn: () => Promise<void>) => _fn(),
    maxConcurrent: 5,
    batchDelayMs: 0, // no delay in tests
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AC-1: Earnings season detection
// ─────────────────────────────────────────────────────────────────────────────

describe("isEarningsSeason", () => {
  it("returns true for month 1 (January)", () => {
    expect(isEarningsSeason(new Date("2026-01-15"))).toBe(true);
  });

  it("returns true for month 4 (April)", () => {
    expect(isEarningsSeason(new Date("2026-04-25"))).toBe(true);
  });

  it("returns true for month 7 (July)", () => {
    expect(isEarningsSeason(new Date("2026-07-01"))).toBe(true);
  });

  it("returns true for month 10 (October)", () => {
    expect(isEarningsSeason(new Date("2026-10-30"))).toBe(true);
  });

  it("returns false for month 2 (February)", () => {
    expect(isEarningsSeason(new Date("2026-02-01"))).toBe(false);
  });

  it("returns false for month 6 (June)", () => {
    expect(isEarningsSeason(new Date("2026-06-15"))).toBe(false);
  });

  it("returns false for month 12 (December)", () => {
    expect(isEarningsSeason(new Date("2026-12-01"))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-1: dryRun returns correct ticker list without calling getBctcFull
// ─────────────────────────────────────────────────────────────────────────────

describe("runBctcBatchSweep — dryRun", () => {
  it("returns all watchlist tickers in dryRun mode", async () => {
    const fetchCalled: string[] = [];
    const deps = makeDeps({
      getBctcFull: async (ticker) => {
        fetchCalled.push(ticker);
        return { ticker, hasData: true, latestQuarter: "Q4-2025" };
      },
    });

    const result = await runBctcBatchSweep({ dryRun: true, deps });

    expect(result.processed).toBe(SAMPLE_TICKERS.length);
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(0);
    expect(fetchCalled).toHaveLength(0); // no real fetch in dry run
    expect(result.digestSent).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-2: Watchlist tickers fetched from deps, not hardcoded
// ─────────────────────────────────────────────────────────────────────────────

describe("runBctcBatchSweep — watchlist source", () => {
  it("calls getWatchlistTickers to obtain tickers", async () => {
    let watchlistCalled = false;
    const deps = makeDeps({
      getWatchlistTickers: async () => {
        watchlistCalled = true;
        return ["VCB", "FPT"];
      },
    });

    const result = await runBctcBatchSweep({ deps });

    expect(watchlistCalled).toBe(true);
    expect(result.processed).toBe(2);
  });

  it("accepts explicit tickers array overriding watchlist", async () => {
    let watchlistCalled = false;
    const deps = makeDeps({
      getWatchlistTickers: async () => {
        watchlistCalled = true;
        return SAMPLE_TICKERS;
      },
    });

    const result = await runBctcBatchSweep({ tickers: ["HPG"], deps });

    expect(watchlistCalled).toBe(false);
    expect(result.processed).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-3: Max concurrent fetches respected
// ─────────────────────────────────────────────────────────────────────────────

describe("runBctcBatchSweep — concurrency", () => {
  it("processes all tickers when maxConcurrent >= ticker count", async () => {
    const tickers = ["A", "B", "C", "D", "E"];
    const processed: string[] = [];

    const deps = makeDeps({
      getWatchlistTickers: async () => tickers,
      getBctcFull: async (ticker) => {
        processed.push(ticker);
        return { ticker, hasData: true, latestQuarter: "Q1-2026" };
      },
      maxConcurrent: 5,
    });

    const result = await runBctcBatchSweep({ deps });

    expect(result.succeeded).toBe(5);
    expect(result.failed).toBe(0);
    expect(processed.sort()).toEqual(tickers.sort());
  });

  it("processes all tickers when maxConcurrent < ticker count (batching)", async () => {
    const tickers = ["A", "B", "C", "D", "E", "F", "G"];
    const processed: string[] = [];

    const deps = makeDeps({
      getWatchlistTickers: async () => tickers,
      getBctcFull: async (ticker) => {
        processed.push(ticker);
        return { ticker, hasData: true, latestQuarter: "Q1-2026" };
      },
      maxConcurrent: 3,
      batchDelayMs: 0,
    });

    const result = await runBctcBatchSweep({ deps });

    expect(result.succeeded).toBe(7);
    expect(result.failed).toBe(0);
    expect(processed.length).toBe(7);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-4: Individual fetch failures don't abort the batch
// ─────────────────────────────────────────────────────────────────────────────

describe("runBctcBatchSweep — failure isolation", () => {
  it("continues batch when one ticker throws", async () => {
    const tickers = ["VCB", "BOOM", "FPT"];

    const deps = makeDeps({
      getWatchlistTickers: async () => tickers,
      getBctcFull: async (ticker) => {
        if (ticker === "BOOM") throw new Error("VPS timeout");
        return { ticker, hasData: true, latestQuarter: "Q4-2025" };
      },
    });

    const result = await runBctcBatchSweep({ deps });

    expect(result.processed).toBe(3);
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]!.ticker).toBe("BOOM");
    expect(result.failures[0]!.reason).toContain("VPS timeout");
  });

  it("reports all failures when multiple tickers fail", async () => {
    const tickers = ["A", "B", "C"];

    const deps = makeDeps({
      getWatchlistTickers: async () => tickers,
      getBctcFull: async (ticker) => {
        if (ticker === "A" || ticker === "C") throw new Error(`fail-${ticker}`);
        return { ticker, hasData: true, latestQuarter: "Q1-2026" };
      },
    });

    const result = await runBctcBatchSweep({ deps });

    expect(result.failed).toBe(2);
    const failedTickers = result.failures.map((f) => f.ticker).sort();
    expect(failedTickers).toEqual(["A", "C"]);
  });

  it("calls sendBugAlert for each failed ticker", async () => {
    const tickers = ["VCB", "FAIL_ME"];
    const bugAlerts: string[] = [];

    const deps = makeDeps({
      getWatchlistTickers: async () => tickers,
      getBctcFull: async (ticker) => {
        if (ticker === "FAIL_ME") throw new Error("network error");
        return { ticker, hasData: true, latestQuarter: "Q4-2025" };
      },
      sendBugAlert: async (msg) => { bugAlerts.push(msg); },
    });

    await runBctcBatchSweep({ deps });

    expect(bugAlerts).toHaveLength(1);
    expect(bugAlerts[0]).toContain("FAIL_ME");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-5: Results logged to job run store (via recordJobRun)
// ─────────────────────────────────────────────────────────────────────────────

describe("runBctcBatchSweep — job run logging", () => {
  it("sends MARKET digest after successful batch", async () => {
    const digests: string[] = [];

    const deps = makeDeps({
      sendMarketDigest: async (msg) => { digests.push(msg); },
    });

    const result = await runBctcBatchSweep({ deps });

    expect(digests).toHaveLength(1);
    expect(digests[0]).toContain("Tổng:");
    expect(result.digestSent).toBe(true);
  });

  it("includes processed/succeeded/failed counts in digest", async () => {
    const tickers = ["VCB", "FPT", "BOOM"];
    const digests: string[] = [];

    const deps = makeDeps({
      getWatchlistTickers: async () => tickers,
      getBctcFull: async (ticker) => {
        if (ticker === "BOOM") throw new Error("fail");
        return { ticker, hasData: true, latestQuarter: "Q4-2025" };
      },
      sendMarketDigest: async (msg) => { digests.push(msg); },
    });

    await runBctcBatchSweep({ deps });

    const digest = digests[0]!;
    expect(digest).toContain("3"); // processed
    expect(digest).toContain("2"); // succeeded
    expect(digest).toContain("1"); // failed
  });

  it("tracks durationMs in result", async () => {
    const deps = makeDeps();
    const result = await runBctcBatchSweep({ deps });
    expect(typeof result.durationMs).toBe("number");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cron expression correctness
// ─────────────────────────────────────────────────────────────────────────────

describe("bctcBatchSweepJob — cron expression", () => {
  it("CRON_BCTC_BATCH_SWEEP is 09:00 UTC on 25th of Jan/Apr/Jul/Oct", async () => {
    const { CRONS } = await import("../scheduler/cronConfig.js");
    expect(CRONS.bctcBatchSweep).toBe("0 9 25 1,4,7,10 *");
  });
});
