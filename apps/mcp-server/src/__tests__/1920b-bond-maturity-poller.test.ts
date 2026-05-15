/**
 * TASK 1920b — Bond Maturity Poller Job tests
 *
 * TC-1: Successful fetch + upsert — rowsWritten equals bond count
 * TC-2: Zero-row result → sendWorkFn spy called with zero-row warning
 * TC-3: Fetch error → sendWorkFn spy called with error summary; no crash
 * TC-4: Upsert idempotency — duplicate run produces same row count (no duplicates)
 *
 * All tests inject deps (fetchFn + sendWorkFn) — no real HTTP calls, no real Telegram.
 * DB: :memory: (set globally in setup.ts preload).
 */
import { describe, it, expect, beforeEach } from "bun:test";
import { runBondMaturityPollerJob } from "../scheduler/macro/bondMaturityPollerJob.js";
import type { BondMaturityEvent } from "../domain/services/bondMaturityTracker.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/index.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeBond(overrides: Partial<BondMaturityEvent> = {}): BondMaturityEvent {
  return {
    issuer: "Test Corp",
    issuerCode: "TST",
    amount: 1000,
    maturityDate: "2028-01-01",
    couponRate: 10.0,
    status: "upcoming",
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Task 1920b — bondMaturityPollerJob", () => {
  beforeEach(async () => {
    closeDb();
    await initDatabase();
  });

  // TC-1: Happy path — successful fetch + upsert
  it("TC-1: returns rowsWritten equal to number of bonds fetched", async () => {
    const bonds = [
      makeBond({ issuerCode: "VHM", issuer: "VinHomes" }),
      makeBond({ issuerCode: "NVL", issuer: "Novaland" }),
      makeBond({ issuerCode: "KDH", issuer: "Khang Dien" }),
    ];

    const workMessages: string[] = [];
    const result = await runBondMaturityPollerJob({
      fetchFn: async () => bonds,
      sendWorkFn: async (msg: string) => { workMessages.push(msg); },
    });

    expect(result.rowsWritten).toBe(3);
    expect(result.success).toBe(true);
    // No work alert on success with rows
    expect(workMessages.length).toBe(0);
  });

  // TC-2: Zero-row alert
  it("TC-2: sends WORK telegram when fetcher returns empty array", async () => {
    const workMessages: string[] = [];
    const result = await runBondMaturityPollerJob({
      fetchFn: async () => [],
      sendWorkFn: async (msg: string) => { workMessages.push(msg); },
    });

    expect(result.rowsWritten).toBe(0);
    expect(workMessages.length).toBeGreaterThan(0);
    expect(workMessages[0]).toContain("Zero bond records");
  });

  // TC-3: Fetch error — alert sent, no rethrow
  it("TC-3: sends WORK telegram on fetch error and does not crash", async () => {
    const workMessages: string[] = [];
    const result = await runBondMaturityPollerJob({
      fetchFn: async () => { throw new Error("network timeout"); },
      sendWorkFn: async (msg: string) => { workMessages.push(msg); },
    });

    expect(result.success).toBe(false);
    expect(workMessages.length).toBeGreaterThan(0);
    expect(workMessages[0]).toContain("bondMaturityPoller");
    expect(workMessages[0]).toContain("network timeout");
  });

  // TC-4: Upsert idempotency — two identical runs → COUNT unchanged
  it("TC-4: running job twice with same bonds produces no duplicate rows", async () => {
    const db = getDb();
    const bonds = [
      makeBond({ issuerCode: "VHM", issuer: "VinHomes" }),
      makeBond({ issuerCode: "NVL", issuer: "Novaland" }),
    ];

    const fetchFn = async () => bonds;
    const sendWorkFn = async (_msg: string) => {};

    await runBondMaturityPollerJob({ fetchFn, sendWorkFn });
    const countAfterFirst = (db.prepare("SELECT COUNT(*) as n FROM bond_maturity").get() as { n: number }).n;

    await runBondMaturityPollerJob({ fetchFn, sendWorkFn });
    const countAfterSecond = (db.prepare("SELECT COUNT(*) as n FROM bond_maturity").get() as { n: number }).n;

    expect(countAfterFirst).toBe(2);
    expect(countAfterSecond).toBe(2); // no duplicates
  });
});
