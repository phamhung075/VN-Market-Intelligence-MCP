/**
 * Task 1857a — WAL checkpoint between stock iterations in vnstock-sync
 *
 * AC-1: syncVnstockData calls walCheckpointFn after each stock that made API calls
 * AC-2: walCheckpointFn is NOT called when a stock has 0 calls (all fresh)
 * AC-3: walCheckpointFn is injectable (testable without real DB)
 * AC-4: Existing syncVnstockData behaviour unchanged (returns totalCalls)
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, mock, beforeEach } from "bun:test";

// We test the injectable checkpoint dep via the new `syncVnstockData` overload.
// Import the function under test — if the export doesn't exist yet this file
// will fail to compile → RED phase confirmed.
import {
  syncVnstockData,
  type SyncVnstockDeps,
} from "../application/usecases/syncVnstockData.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDeps(overrides: Partial<SyncVnstockDeps> = {}): SyncVnstockDeps {
  return {
    syncStockFn: async (_code: string) => 1, // 1 API call per stock
    walCheckpointFn: async () => {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// AC-1: checkpoint called after each stock that made API calls
// ---------------------------------------------------------------------------

describe("Task 1857a — WAL checkpoint after vnstock stock iterations (AC-1)", () => {
  it("calls walCheckpointFn once per stock that made API calls", async () => {
    const checkpointCalls: string[] = [];
    const syncedCodes: string[] = [];

    const deps = makeDeps({
      syncStockFn: async (code: string) => {
        syncedCodes.push(code);
        return 2; // non-zero → checkpoint should fire
      },
      walCheckpointFn: async () => {
        checkpointCalls.push("checkpoint");
      },
    });

    const codes = ["VCB", "FPT", "HPG"];
    const total = await syncVnstockData(codes, deps);

    expect(total).toBe(6); // 3 stocks × 2 calls
    expect(syncedCodes).toEqual(["VCB", "FPT", "HPG"]);
    expect(checkpointCalls.length).toBe(3); // one per stock with calls > 0
  });

  it("calls walCheckpointFn exactly once for a single stock", async () => {
    let checkpointCount = 0;

    const deps = makeDeps({
      syncStockFn: async () => 5,
      walCheckpointFn: async () => { checkpointCount++; },
    });

    await syncVnstockData(["VHM"], deps);
    expect(checkpointCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// AC-2: checkpoint NOT called when 0 API calls (all data fresh)
// ---------------------------------------------------------------------------

describe("Task 1857a — WAL checkpoint skipped when stock has 0 calls (AC-2)", () => {
  it("does not call walCheckpointFn when all stocks return 0 calls", async () => {
    let checkpointCount = 0;

    const deps = makeDeps({
      syncStockFn: async () => 0, // all fresh
      walCheckpointFn: async () => { checkpointCount++; },
    });

    await syncVnstockData(["VCB", "FPT"], deps);
    expect(checkpointCount).toBe(0);
  });

  it("only checkpoints for stocks that actually made calls", async () => {
    let checkpointCount = 0;
    let callNum = 0;

    const deps = makeDeps({
      syncStockFn: async () => {
        // alternating: 0, 3, 0, 3
        callNum++;
        return callNum % 2 === 0 ? 3 : 0;
      },
      walCheckpointFn: async () => { checkpointCount++; },
    });

    await syncVnstockData(["VCB", "FPT", "HPG", "MBB"], deps);
    expect(checkpointCount).toBe(2); // only FPT and MBB had calls
  });
});

// ---------------------------------------------------------------------------
// AC-3: injectable — walCheckpointFn errors don't crash the sync
// ---------------------------------------------------------------------------

describe("Task 1857a — walCheckpointFn errors are non-fatal (AC-3)", () => {
  it("continues processing remaining stocks when checkpoint throws", async () => {
    const syncedCodes: string[] = [];

    const deps = makeDeps({
      syncStockFn: async (code: string) => {
        syncedCodes.push(code);
        return 1;
      },
      walCheckpointFn: async () => {
        throw new Error("checkpoint failed");
      },
    });

    // Must not throw — checkpoint errors are best-effort
    const total = await syncVnstockData(["VCB", "FPT"], deps);
    expect(total).toBe(2);
    expect(syncedCodes).toEqual(["VCB", "FPT"]);
  });
});

// ---------------------------------------------------------------------------
// AC-4: empty codes array — no calls, no checkpoint
// ---------------------------------------------------------------------------

describe("Task 1857a — empty codes array (AC-4)", () => {
  it("returns 0 and never calls walCheckpointFn for empty input", async () => {
    let checkpointCount = 0;

    const deps = makeDeps({
      walCheckpointFn: async () => { checkpointCount++; },
    });

    const total = await syncVnstockData([], deps);
    expect(total).toBe(0);
    expect(checkpointCount).toBe(0);
  });
});
