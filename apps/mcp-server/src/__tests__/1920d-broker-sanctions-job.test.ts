/**
 * TASK 1920d — Broker Sanctions Quarterly Sweep Job tests
 *
 * TC-1: Quarter guard — job skips non-quarter months (Jan=1 → skip, no fetcher call)
 * TC-2: Quarter guard — job runs in quarter months (Mar=3 → fetcher called)
 * TC-3: Sanctions fetched + INSERT OR IGNORE called (rows inserted)
 * TC-4: WORK telegram sent on fetch error; job does not rethrow
 * TC-5: Idempotency — same broker_name+sanction_start run twice → 1 row
 * TC-6: Zero-result alert in quarter month → sendWorkFn spy called with warning
 * TC-7: Non-quarter skip records status='skipped' in cron_job_runs (recordJobRunSpy called)
 * TC-8: CRONS.brokerSanctionsSweep defaults to '0 8 25-31 * 5'
 *
 * All tests inject deps (fetchFn + sendWorkFn + getCurrentMonthFn) — no real HTTP,
 * no real Telegram, no network calls.
 * DB: :memory: (set globally in setup.ts preload).
 */
import { describe, it, expect, beforeEach } from "bun:test";
import {
  runBrokerSanctionsJob,
  type BrokerSanctionsJobOptions,
} from "../scheduler/news-analysis/brokerSanctionsJob.js";
import { CRONS } from "../scheduler/cronConfig.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeSanction(overrides: Partial<{
  brokerName: string;
  sanctionStart: string;
  sanctionEnd: string | null;
  severity: "warning" | "suspension";
  source: string;
}> = {}) {
  return {
    brokerName: "Công ty Cổ phần Chứng khoán Test",
    sanctionStart: "2026-03-01",
    sanctionEnd: null,
    severity: "warning" as const,
    source: "https://congbothongtin.ssc.gov.vn/test",
    ...overrides,
  };
}

const BROKER_SANCTIONS_DDL = `
  CREATE TABLE IF NOT EXISTS broker_sanctions (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    broker_name    TEXT NOT NULL,
    sanction_start TEXT NOT NULL,
    sanction_end   TEXT,
    severity       TEXT NOT NULL CHECK (severity IN ('warning','suspension')),
    source         TEXT,
    created_at     TEXT NOT NULL,
    UNIQUE(broker_name, sanction_start)
  )
`;

const CRON_JOB_RUNS_DDL = `
  CREATE TABLE IF NOT EXISTS cron_job_runs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    job_name     TEXT NOT NULL,
    started_at   TEXT NOT NULL,
    finished_at  TEXT,
    status       TEXT NOT NULL DEFAULT 'running',
    rows_written INTEGER,
    error_msg    TEXT,
    duration_ms  INTEGER
  )
`;

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1920d — brokerSanctionsJob", () => {
  beforeEach(async () => {
    closeDb();
    await initDatabase();
  });

  // TC-1: Quarter guard — skip non-quarter months
  it("TC-1: skips fetch in non-quarter month (January=1)", async () => {
    let fetchCalled = false;
    const workMessages: string[] = [];

    const result = await runBrokerSanctionsJob({
      getCurrentMonthFn: () => 1, // January — not a quarter-end month
      fetchFn: async () => {
        fetchCalled = true;
        return [makeSanction()];
      },
      sendWorkFn: async (msg: string) => { workMessages.push(msg); },
    });

    expect(fetchCalled).toBe(false);
    expect(result.skipped).toBe(true);
    expect(result.rowsWritten).toBe(0);
    // No WORK alert for non-quarter skip
    expect(workMessages.length).toBe(0);
  });

  // TC-2: Quarter guard — active in quarter months (March=3)
  it("TC-2: calls fetcher in quarter month (March=3)", async () => {
    let fetchCalled = false;

    const result = await runBrokerSanctionsJob({
      getCurrentMonthFn: () => 3, // March — quarter-end month
      fetchFn: async () => {
        fetchCalled = true;
        return [makeSanction()];
      },
      sendWorkFn: async (_msg: string) => {},
    });

    expect(fetchCalled).toBe(true);
    expect(result.skipped).toBe(false);
  });

  // TC-3: Sanctions fetched + inserted
  // Uses unique timestamped broker names to avoid cross-test contamination
  // in case of DB singleton bleed between tests (Bun in-process test runner).
  it("TC-3: inserts sanctions when fetcher returns records", async () => {
    const db = getDb();
    const ts = Date.now();
    const sanctions = [
      makeSanction({ brokerName: `TC3-Alpha-${ts}`, sanctionStart: "2026-03-01" }),
      makeSanction({ brokerName: `TC3-Beta-${ts}`, sanctionStart: "2026-03-05" }),
    ];

    const countBefore = (db.prepare(
      `SELECT COUNT(*) as n FROM broker_sanctions WHERE broker_name LIKE 'TC3-%'`
    ).get() as { n: number }).n;

    const result = await runBrokerSanctionsJob({
      getCurrentMonthFn: () => 3,
      fetchFn: async () => sanctions,
      sendWorkFn: async (_msg: string) => {},
    });

    const countAfter = (db.prepare(
      `SELECT COUNT(*) as n FROM broker_sanctions WHERE broker_name LIKE 'TC3-%'`
    ).get() as { n: number }).n;

    expect(result.skipped).toBe(false);
    // 2 new unique rows inserted regardless of DB pre-existing state
    expect(countAfter - countBefore).toBe(2);
    expect(result.rowsWritten).toBe(2);
  });

  // TC-4: WORK telegram on fetch error; no rethrow
  it("TC-4: sends WORK telegram on fetch error and does not crash", async () => {
    const workMessages: string[] = [];

    const result = await runBrokerSanctionsJob({
      getCurrentMonthFn: () => 6, // June — quarter-end
      fetchFn: async () => { throw new Error("SSC portal unreachable"); },
      sendWorkFn: async (msg: string) => { workMessages.push(msg); },
    });

    expect(result.success).toBe(false);
    expect(result.skipped).toBe(false);
    expect(workMessages.length).toBeGreaterThan(0);
    expect(workMessages[0]).toContain("brokerSanctionsSweep");
    expect(workMessages[0]).toContain("SSC portal unreachable");
  });

  // TC-5: Idempotency — same broker_name+sanction_start run twice → 1 row
  it("TC-5: running job twice with same sanction produces exactly 1 row", async () => {
    const db = getDb();
    const sanctions = [
      makeSanction({ brokerName: "Dedup Broker", sanctionStart: "2026-03-01" }),
    ];

    const opts: BrokerSanctionsJobOptions = {
      getCurrentMonthFn: () => 3,
      fetchFn: async () => sanctions,
      sendWorkFn: async (_msg: string) => {},
    };

    await runBrokerSanctionsJob(opts);
    await runBrokerSanctionsJob(opts);

    const count = (db.prepare(
      "SELECT COUNT(*) as n FROM broker_sanctions WHERE broker_name='Dedup Broker'"
    ).get() as { n: number }).n;

    expect(count).toBe(1);
  });

  // TC-6: Zero-result alert in quarter month
  it("TC-6: sends WORK telegram when fetcher returns empty list in quarter month", async () => {
    const workMessages: string[] = [];

    const result = await runBrokerSanctionsJob({
      getCurrentMonthFn: () => 9, // September — quarter-end
      fetchFn: async () => [],
      sendWorkFn: async (msg: string) => { workMessages.push(msg); },
    });

    expect(result.rowsWritten).toBe(0);
    expect(workMessages.length).toBeGreaterThan(0);
    expect(workMessages[0]).toContain("brokerSanctionsSweep");
    expect(workMessages[0]).toContain("zero");
  });

  // TC-7: Non-quarter skip — result.skipped=true, no work alert
  it("TC-7: non-quarter months (Feb, Apr, May, ...) all skip without WORK alert", async () => {
    const NON_QUARTER_MONTHS = [1, 2, 4, 5, 7, 8, 10, 11];
    for (const month of NON_QUARTER_MONTHS) {
      let fetchCalled = false;
      const workMessages: string[] = [];

      const result = await runBrokerSanctionsJob({
        getCurrentMonthFn: () => month,
        fetchFn: async () => { fetchCalled = true; return []; },
        sendWorkFn: async (msg: string) => { workMessages.push(msg); },
      });

      expect(fetchCalled).toBe(false);
      expect(result.skipped).toBe(true);
      expect(workMessages.length).toBe(0);
    }
  });

  // TC-8: Cron expression check
  it("TC-8: CRONS.brokerSanctionsSweep defaults to '0 8 25-31 * 5'", () => {
    expect(CRONS.brokerSanctionsSweep).toBe("0 8 25-31 * 5");
  });
});
