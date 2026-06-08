/**
 * TASK 1942a — Startup Backfill Probe for vnstock Fundamentals
 *
 * Tests that the startup IIFE probe in startScheduler.ts correctly
 * detects a cold/stale DB and fires runVnstockFundamentalsJob() after
 * a 90-second delay, or skips when the DB is warm.
 *
 * Strategy: export a testable probe factory function
 * `makeVnstockStartupProbe(deps)` from a separate module that
 * startScheduler.ts can import. The probe itself is a fire-and-forget
 * async function accepting injectable deps for:
 *   - getDb (returns the DB instance)
 *   - runJob (the fundamentals job runner)
 *   - scheduleDelay (wraps setTimeout — returns a Promise<void>)
 *   - log (log function)
 *
 * T1: cold DB (count < 10) → fires job
 * T2: stale data (last fetch > 7 days) → fires job
 * T3: warm DB (count >= 10 AND age < 7d) → skips job
 * T4: DB query error → caught, job fires anyway (safe fallback per spec FR-6)
 * T5: setTimeout delay arg = 90000ms
 * T6: vnstock_fetch_log table missing → catch, fire anyway (EC-4)
 */

import { describe, it, expect, mock, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { runVnstockStartupProbe } from "../scheduler/financial-reports/vnstockStartupProbe.js";

// ── DDL helper — mirrors schema-financial-reports.ts subset ──────────────────

function buildDb(opts?: { withFetchLog?: boolean }): Database {
  const db = new Database(":memory:");
  if (opts?.withFetchLog !== false) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS vnstock_fetch_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL,
        data_type TEXT NOT NULL,
        fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(code, data_type)
      )
    `);
  }
  return db;
}

function seedFetchLog(
  db: Database,
  codes: string[],
  daysAgo: number,
): void {
  const ts = new Date(Date.now() - daysAgo * 86_400_000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);
  for (const code of codes) {
    db.prepare(
      `INSERT OR IGNORE INTO vnstock_fetch_log (code, data_type, fetched_at)
       VALUES (?, 'financials', ?)`,
    ).run(code, ts);
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("TASK 1942a — vnstock startup backfill probe", () => {
  let capturedDelay: number;

  beforeEach(() => {
    capturedDelay = -1;
  });

  // ── T1: cold DB (count < 10) → fires job ──────────────────────────────────

  it("T1: cold DB (count < 10) fires runVnstockFundamentalsJob", async () => {
    const db = buildDb();
    seedFetchLog(db, ["VCB", "FPT", "VNM"], 1); // only 3 codes, < 10

    let jobCalled = false;
    const runJob = mock(async () => {
      jobCalled = true;
      return { succeeded: 3, failed: [] };
    });

    const logs: string[] = [];
    const scheduleDelay = async (ms: number): Promise<void> => {
      capturedDelay = ms;
    };

    await runVnstockStartupProbe({
      getDb: () => db,
      runJob,
      scheduleDelay,
      log: (msg: string) => logs.push(msg),
    });

    expect(jobCalled).toBe(true);
    expect(logs.some((l) => l.includes("cold DB detected"))).toBe(true);
  });

  // ── T2: stale data (last fetch > 7 days) → fires job ─────────────────────

  it("T2: stale data (> 7 days) fires runVnstockFundamentalsJob", async () => {
    const db = buildDb();
    seedFetchLog(
      db,
      ["VCB", "FPT", "VNM", "VIC", "VHM", "VRE", "BCM", "SAB", "MSN", "TCB"],
      8, // 8 days ago — stale
    );

    let jobCalled = false;
    const runJob = mock(async () => {
      jobCalled = true;
      return { succeeded: 10, failed: [] };
    });

    const logs: string[] = [];
    await runVnstockStartupProbe({
      getDb: () => db,
      runJob,
      scheduleDelay: async () => {},
      log: (msg: string) => logs.push(msg),
    });

    expect(jobCalled).toBe(true);
    expect(logs.some((l) => l.includes("stale data detected"))).toBe(true);
  });

  // ── T3: warm DB → skips job ───────────────────────────────────────────────

  it("T3: warm DB (>= 10 codes, age < 7d) skips job", async () => {
    const db = buildDb();
    seedFetchLog(
      db,
      ["VCB", "FPT", "VNM", "VIC", "VHM", "VRE", "BCM", "SAB", "MSN", "TCB"],
      1, // 1 day ago — fresh
    );

    let jobCalled = false;
    const runJob = mock(async () => {
      jobCalled = true;
      return { succeeded: 10, failed: [] };
    });

    const logs: string[] = [];
    await runVnstockStartupProbe({
      getDb: () => db,
      runJob,
      scheduleDelay: async () => {},
      log: (msg: string) => logs.push(msg),
    });

    expect(jobCalled).toBe(false);
    expect(logs.some((l) => l.includes("DB warm"))).toBe(true);
  });

  // ── T4: DB query error → caught, job fires anyway (FR-6) ─────────────────

  it("T4: DB query error caught — server does not crash, job fires anyway", async () => {
    // DB with no fetch_log table → SELECT will throw
    const db = buildDb({ withFetchLog: false });

    let jobCalled = false;
    const runJob = mock(async () => {
      jobCalled = true;
      return { succeeded: 0, failed: [] };
    });

    const logs: string[] = [];
    let threw = false;

    try {
      await runVnstockStartupProbe({
        getDb: () => db,
        runJob,
        scheduleDelay: async () => {},
        log: (msg: string) => logs.push(msg),
      });
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(jobCalled).toBe(true); // fires anyway per FR-6
    expect(logs.some((l) => l.includes("startup probe error") || l.includes("scheduling sweep"))).toBe(true);
  });

  // ── T5: setTimeout delay = 90000ms ───────────────────────────────────────

  it("T5: delay passed to scheduleDelay is exactly 90000ms", async () => {
    const db = buildDb();
    // cold DB — count = 0
    const delays: number[] = [];

    await runVnstockStartupProbe({
      getDb: () => db,
      runJob: async () => ({ succeeded: 0, failed: [] }),
      scheduleDelay: async (ms: number) => {
        delays.push(ms);
      },
      log: () => {},
    });

    expect(delays).toHaveLength(1);
    expect(delays[0]).toBe(90_000);
  });

  // ── T6: vnstock_fetch_log table missing → fire anyway (EC-4) ─────────────

  it("T6: missing vnstock_fetch_log table — catches error and fires job", async () => {
    // Empty in-memory DB — no tables at all
    const db = new Database(":memory:");

    let jobCalled = false;
    const runJob = mock(async () => {
      jobCalled = true;
      return { succeeded: 0, failed: [] };
    });

    const logs: string[] = [];
    let threw = false;

    try {
      await runVnstockStartupProbe({
        getDb: () => db,
        runJob,
        scheduleDelay: async () => {},
        log: (msg: string) => logs.push(msg),
      });
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(jobCalled).toBe(true);
  });
});
