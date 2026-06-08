/**
 * sbvRatesJob — dedicated SBV rates refresh job tests
 *
 * TC-1: fetchFn called; storeFn called with snapshot on success → rowsWritten=1
 * TC-2: fetchFn returns null → storeFn NOT called; rowsWritten=0; success=false
 * TC-3: fetchFn throws → sendWorkFn called with job name and error; rowsWritten=0
 * TC-4: storeFn throws → sendWorkFn called with job name and error; rowsWritten=0
 * TC-5: CRONS.sbvRatesRefresh defaults to '0 *\/4 * * *'
 *
 * All tests inject deps — no real HTTP, no real Telegram, no real DB writes.
 * DB: :memory: (set globally in setup.ts preload).
 */
import { describe, it, expect, beforeEach } from "bun:test";
import {
  runSbvRatesRefreshJob,
  type SbvRatesRefreshOptions,
} from "../scheduler/macro/sbvRatesJob.js";
import { CRONS } from "../scheduler/cronConfig.js";
import { initDatabase, closeDb } from "../infrastructure/db/index.js";
import type { SbvMacroSnapshot } from "../infrastructure/fetchers/sbv.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_SNAPSHOT: SbvMacroSnapshot = {
  overnightRatePct: 3.0,
  refinancingRatePct: 4.5,
  usdVndOfficial: 25800,
  discountRatePct: 1.5,
  maxDepositRatePct: 5.0,
  maxLendingRatePct: 12.0,
  interbankOvernightPct: 4.0,
  fetchedAt: "2026-05-16T08:00:00.000Z",
};

function makeOpts(overrides: Partial<SbvRatesRefreshOptions> = {}): SbvRatesRefreshOptions {
  return {
    fetchFn: async () => MOCK_SNAPSHOT,
    storeFn: () => {},
    sendWorkFn: async (_msg: string) => {},
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("sbvRatesJob — runSbvRatesRefreshJob", () => {
  beforeEach(async () => {
    closeDb();
    await initDatabase();
  });

  // TC-1: fetchFn called; storeFn called with snapshot on success
  it("TC-1: calls fetchFn and storeFn; returns rowsWritten=1 and success=true", async () => {
    let fetchCalled = false;
    let storedSnapshot: SbvMacroSnapshot | undefined;

    const result = await runSbvRatesRefreshJob(makeOpts({
      fetchFn: async () => {
        fetchCalled = true;
        return MOCK_SNAPSHOT;
      },
      storeFn: (snap) => { storedSnapshot = snap; },
    }));

    expect(fetchCalled).toBe(true);
    expect(storedSnapshot).toBeDefined();
    expect(storedSnapshot?.usdVndOfficial).toBe(25800);
    expect(result.success).toBe(true);
    expect(result.rowsWritten).toBe(1);
    expect(result.error).toBeUndefined();
  });

  // TC-2: fetchFn returns null → storeFn NOT called
  it("TC-2: when fetchFn returns null, storeFn is not called and rowsWritten=0", async () => {
    let storeCalled = false;

    const result = await runSbvRatesRefreshJob(makeOpts({
      fetchFn: async () => null,
      storeFn: () => { storeCalled = true; },
    }));

    expect(storeCalled).toBe(false);
    expect(result.success).toBe(false);
    expect(result.rowsWritten).toBe(0);
    expect(result.error).toBeUndefined();
  });

  // TC-3: fetchFn throws → job re-throws (fail-loud) + WORK alert sent before throw
  // FIX-SBV-REFRESH-SILENT-SWALLOW: job now re-throws so wrapRun records status='error'
  it("TC-3: when fetchFn throws, job re-throws (fail-loud) and sends WORK alert", async () => {
    const workMessages: string[] = [];

    await expect(
      runSbvRatesRefreshJob(makeOpts({
        fetchFn: async () => { throw new Error("VCB portal timeout"); },
        sendWorkFn: async (msg: string) => { workMessages.push(msg); },
      })),
    ).rejects.toThrow("VCB portal timeout");

    expect(workMessages.length).toBe(1);
    expect(workMessages[0]).toContain("sbvRatesRefresh");
    expect(workMessages[0]).toContain("VCB portal timeout");
  });

  // TC-4: storeFn throws → job re-throws (fail-loud) + WORK alert sent before throw
  // FIX-SBV-REFRESH-SILENT-SWALLOW: job now re-throws so wrapRun records status='error'
  it("TC-4: when storeFn throws, job re-throws (fail-loud) and sends WORK alert", async () => {
    const workMessages: string[] = [];

    await expect(
      runSbvRatesRefreshJob(makeOpts({
        fetchFn: async () => MOCK_SNAPSHOT,
        storeFn: () => { throw new Error("SQLite write locked"); },
        sendWorkFn: async (msg: string) => { workMessages.push(msg); },
      })),
    ).rejects.toThrow("SQLite write locked");

    expect(workMessages.length).toBe(1);
    expect(workMessages[0]).toContain("sbvRatesRefresh");
    expect(workMessages[0]).toContain("SQLite write locked");
  });

  // TC-5: cron expression check
  it("TC-5: CRONS.sbvRatesRefresh defaults to '0 */4 * * *'", () => {
    expect(CRONS.sbvRatesRefresh).toBe("0 */4 * * *");
  });
});
