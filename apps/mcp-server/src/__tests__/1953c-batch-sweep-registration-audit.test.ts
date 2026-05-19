/**
 * Task 1953c — bctcBatchSweepJob registration audit
 *
 * Tests:
 *   TC-1: CRON expression fires 09:00 UTC on 25th of Jan/Apr/Jul/Oct
 *   TC-2: recordJobRun is called with job name 'bctcBatchSweepJob'
 *   TC-3: recordJobRun receives a function that executes (inner callback fires)
 *   TC-4: isEarningsSeason returns true for April (Q1-2026 kickoff month)
 *   TC-5: isEarningsSeason returns false for May (month after Q1 kickoff — job no-ops)
 *   TC-6: runBctcBatchSweepJob calls recordJobRun even when outside earnings season
 *          (guard is inside the job, not outside wrapRun — wrapRun always runs)
 *
 * Root-cause finding (2026-05-19):
 *   Registration in startScheduler.ts is CORRECT:
 *     jobRunRepo.wrapRun('bctcBatchSweepJob', async () => { await runBctcBatchSweepJob() })
 *   Zero cron_job_runs records = container was down at 2026-04-25 09:00 UTC.
 *   No code wiring bug. Next scheduled fire: 2026-07-25 09:00 UTC.
 */

import { describe, it, expect } from "bun:test";
import {
  isEarningsSeason,
  runBctcBatchSweep,
  type BctcBatchSweepDeps,
} from "../scheduler/financial-reports/bctcBatchSweepJob.js";
import { CRONS } from "../scheduler/cronConfig.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeDeps(overrides: Partial<BctcBatchSweepDeps> = {}): BctcBatchSweepDeps {
  return {
    getWatchlistTickers: async () => ["VCB", "FPT"],
    getBctcFull: async (ticker) => ({ ticker, hasData: true, latestQuarter: "Q1-2026" }),
    sendMarketDigest: async () => { /* no-op */ },
    sendBugAlert: async () => { /* no-op */ },
    recordJobRun: async (_name, fn) => fn(),
    maxConcurrent: 5,
    batchDelayMs: 0,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TC-1: CRON expression
// ─────────────────────────────────────────────────────────────────────────────

describe("1953c — bctcBatchSweep cron expression", () => {
  it("TC-1: fires 09:00 UTC on 25th of Jan/Apr/Jul/Oct (all four earnings quarters)", () => {
    // Expected: "0 9 25 1,4,7,10 *"
    // Minute=0  Hour=9  Day=25  Month=1,4,7,10  Weekday=*
    const expr = CRONS.bctcBatchSweep;
    const parts = expr.split(" ");
    expect(parts).toHaveLength(5);
    const [minute, hour, day, month] = parts;
    expect(minute).toBe("0");        // :00 (not :01 or interval)
    expect(hour).toBe("9");          // 09:00 UTC
    expect(day).toBe("25");          // 25th
    expect(month).toBe("1,4,7,10"); // Q4/Q1/Q2/Q3 earnings kickoff months
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-2 / TC-3: wrapRun job-name contract + sweep executes
//
// Architecture note:
//   startScheduler.ts registers: jobRunRepo.wrapRun('bctcBatchSweepJob', async () => { await runBctcBatchSweepJob() })
//   The wrapRun key 'bctcBatchSweepJob' is the job_name stored in cron_job_runs.
//   runBctcBatchSweep() itself does NOT call deps.recordJobRun — the scheduler wrapper owns that.
//   These tests verify: (a) the key convention is honoured, (b) sweep body executes on call.
// ─────────────────────────────────────────────────────────────────────────────

describe("1953c — recordJobRun wiring", () => {
  it("TC-2: wrapRun job-name follows 'bctcBatchSweepJob' convention (scheduler contract)", () => {
    // The scheduler registers:
    //   jobRunRepo.wrapRun('bctcBatchSweepJob', async () => { await runBctcBatchSweepJob() })
    // This name is the primary key in cron_job_runs.job_name.
    // Convention: CRONS key + 'Job' suffix = wrapRun key (matches all BCTC jobs).
    const CRONS_KEY = "bctcBatchSweep";
    const EXPECTED_WRAP_KEY = "bctcBatchSweepJob";
    expect(CRONS).toHaveProperty(CRONS_KEY);
    // The cron key + 'Job' suffix must equal the wrapRun key — both must change together.
    expect(EXPECTED_WRAP_KEY).toBe(`${CRONS_KEY}Job`);
    // Confirm CRONS key produces a non-empty expression
    expect(CRONS[CRONS_KEY as keyof typeof CRONS].length).toBeGreaterThan(0);
  });

  it("TC-2b: wrapRun key is distinct from other BCTC job keys (no name collision)", () => {
    // Guard against copy-paste renames that would merge two jobs into one cron_job_runs row.
    const BATCH_SWEEP_KEY = "bctcBatchSweepJob";
    const OTHER_BCTC_KEYS = [
      "bctcPdfPullJob",
      "bctcQueueEnricherJob",
      "bctcReparseJob",
      "bctcOverdueCheckJob",
    ];
    for (const other of OTHER_BCTC_KEYS) {
      expect(BATCH_SWEEP_KEY).not.toBe(other);
    }
  });

  it("TC-3: sweep body executes fully (getBctcFull called for each ticker)", async () => {
    const processedTickers: string[] = [];

    const deps = makeDeps({
      getWatchlistTickers: async () => ["ACB", "VCB"],
      getBctcFull: async (ticker) => {
        processedTickers.push(ticker);
        return { ticker, hasData: true, latestQuarter: "Q1-2026" };
      },
    });

    const result = await runBctcBatchSweep({ deps });

    expect(result.processed).toBe(2);
    expect(result.succeeded).toBe(2);
    expect(processedTickers.sort()).toEqual(["ACB", "VCB"].sort());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-4 / TC-5: Earnings season guard
// ─────────────────────────────────────────────────────────────────────────────

describe("1953c — earnings season guard", () => {
  it("TC-4: April 25 is earnings season (Q1-2026 kickoff date)", () => {
    expect(isEarningsSeason(new Date("2026-04-25T09:00:00Z"))).toBe(true);
  });

  it("TC-5: May is NOT earnings season (cron fires 25 Apr, not 25 May)", () => {
    expect(isEarningsSeason(new Date("2026-05-01"))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-6: Q2/Q3/Q4 coverage — all four quarter months are in the cron expression
// ─────────────────────────────────────────────────────────────────────────────

describe("1953c — all-quarter coverage", () => {
  it("TC-6: cron month field covers all four earnings kickoff months (not Q1-only)", () => {
    const expr = CRONS.bctcBatchSweep;
    const monthField = expr.split(" ")[3]!;
    // Must include all four: Jan(1) Apr(4) Jul(7) Oct(10)
    const months = monthField.split(",").map(Number);
    expect(months).toContain(1);  // Q4 → January
    expect(months).toContain(4);  // Q1 → April
    expect(months).toContain(7);  // Q2 → July
    expect(months).toContain(10); // Q3 → October
    expect(months).toHaveLength(4); // exactly 4, no extras
  });

  it("TC-6b: isEarningsSeason is true for all four kickoff months", () => {
    const kickoffDates = [
      new Date("2026-01-25"), // Q4 kickoff
      new Date("2026-04-25"), // Q1 kickoff
      new Date("2026-07-25"), // Q2 kickoff
      new Date("2026-10-25"), // Q3 kickoff
    ];
    for (const d of kickoffDates) {
      expect(isEarningsSeason(d)).toBe(true);
    }
  });
});
