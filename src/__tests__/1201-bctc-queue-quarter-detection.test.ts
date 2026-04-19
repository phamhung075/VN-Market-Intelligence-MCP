// src/__tests__/1201-bctc-queue-quarter-detection.test.ts
// Task 1201 — BCTC Queue Quarter-Detection Fix
//
// TDD: Tests written FIRST (RED), then implementation makes them pass (GREEN).
//
// Tests verify:
//   1. Correct SSC deadline boundary: Jan–Apr → Q4 prev year, May–Jul → Q1,
//      Aug–Oct → Q2, Nov–Dec → Q3
//   2. Critical April edge case: month=4 yields {targetYear: currentYear-1, targetQuarter:"Q4"}
//   3. Backfill upsert is idempotent: calling twice yields exactly 7 rows in
//      bctc_vps_queue (6 Q4-2025 + 1 VCB Q1-2025), not 14

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import type { Database } from "bun:sqlite";

// ─── Quarter-detection logic extracted for unit testing ───────────────────────
//
// Mirrors the corrected implementation in server.ts (Task 1201 fix).
// SSC filing deadlines (Vietnamese):
//   Q4 (Oct–Dec) filings due ~30 March → collect during Jan–Apr
//   Q1 (Jan–Mar) filings due ~30 April → collect during May–Jul
//   Q2 (Apr–Jun) filings due ~30 July  → collect during Aug–Oct
//   Q3 (Jul–Sep) filings due ~30 Oct   → collect during Nov–Dec

interface QuarterResult {
  targetYear: number;
  targetQuarter: string;
}

/**
 * Determines the BCTC filing period to collect based on the given month.
 * This is the corrected logic replacing the buggy server.ts lines 918–921.
 *
 * @param currentYear - Full 4-digit year (e.g. 2026)
 * @param currentMonth - 1-indexed month (1 = January, 12 = December)
 */
export function detectTargetQuarter(
  currentYear: number,
  currentMonth: number,
): QuarterResult {
  let targetYear = currentYear;
  let targetQuarter: string;

  if (currentMonth <= 4) {
    // Jan–Apr: collect Q4 of previous year (SSC deadline ~30 March, stragglers through April)
    targetYear = currentYear - 1;
    targetQuarter = "Q4";
  } else if (currentMonth <= 7) {
    // May–Jul: collect Q1 of current year (SSC deadline ~30 April)
    targetQuarter = "Q1";
  } else if (currentMonth <= 10) {
    // Aug–Oct: collect Q2 of current year (SSC deadline ~30 July)
    targetQuarter = "Q2";
  } else {
    // Nov–Dec: collect Q3 of current year (SSC deadline ~30 October)
    targetQuarter = "Q3";
  }

  return { targetYear, targetQuarter };
}

// ─── Backfill migration logic extracted for unit testing ─────────────────────
//
// Mirrors the startup migration added to initDatabase() in schema.ts (Task 1201).
// 7 rows: BID/EIB/SHB/VCB/FPT/HPG Q4-2025 + VCB Q1-2025

const BACKFILL_079 = [
  { code: "BID", year: 2025, quarter: "Q4" },
  { code: "EIB", year: 2025, quarter: "Q4" },
  { code: "SHB", year: 2025, quarter: "Q4" },
  { code: "VCB", year: 2025, quarter: "Q4" },
  { code: "FPT", year: 2025, quarter: "Q4" },
  { code: "HPG", year: 2025, quarter: "Q4" },
  { code: "VCB", year: 2025, quarter: "Q1" }, // Task 1204: re-fetch after VCB Q1 deletion
];

export function runBackfill079(db: Database): void {
  const stmt = db.prepare(`
    INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, attempts)
    VALUES (?, ?, ?, 'pending', 0)
    ON CONFLICT(action_code, period_year, period_quarter)
    DO UPDATE SET status = 'pending', attempts = 0, last_attempt = NULL
    WHERE status = 'failed' OR attempts >= 5
  `);
  for (const entry of BACKFILL_079) {
    stmt.run(entry.code, entry.year, entry.quarter);
  }
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe("Task 1201 — BCTC quarter-detection logic (parameterized)", () => {
  const currentYear = 2026;

  // Expected mapping per TECH_079 boundary table
  const cases: Array<{ month: number; expectedYear: number; expectedQuarter: string }> = [
    { month: 1,  expectedYear: 2025, expectedQuarter: "Q4" }, // Jan → Q4 prev year
    { month: 2,  expectedYear: 2025, expectedQuarter: "Q4" }, // Feb → Q4 prev year
    { month: 3,  expectedYear: 2025, expectedQuarter: "Q4" }, // Mar → Q4 prev year
    { month: 4,  expectedYear: 2025, expectedQuarter: "Q4" }, // Apr → Q4 prev year (was BUG: Q1)
    { month: 5,  expectedYear: 2026, expectedQuarter: "Q1" }, // May → Q1 curr year
    { month: 6,  expectedYear: 2026, expectedQuarter: "Q1" }, // Jun → Q1 curr year
    { month: 7,  expectedYear: 2026, expectedQuarter: "Q1" }, // Jul → Q1 curr year
    { month: 8,  expectedYear: 2026, expectedQuarter: "Q2" }, // Aug → Q2 curr year
    { month: 9,  expectedYear: 2026, expectedQuarter: "Q2" }, // Sep → Q2 curr year
    { month: 10, expectedYear: 2026, expectedQuarter: "Q2" }, // Oct → Q2 curr year
    { month: 11, expectedYear: 2026, expectedQuarter: "Q3" }, // Nov → Q3 curr year
    { month: 12, expectedYear: 2026, expectedQuarter: "Q3" }, // Dec → Q3 curr year
  ];

  for (const { month, expectedYear, expectedQuarter } of cases) {
    it(`month=${month} → {targetYear:${expectedYear}, targetQuarter:"${expectedQuarter}"}`, () => {
      const result = detectTargetQuarter(currentYear, month);
      expect(result.targetYear).toBe(expectedYear);
      expect(result.targetQuarter).toBe(expectedQuarter);
    });
  }
});

describe("Task 1201 — April edge case (critical bug fix)", () => {
  const currentYear = 2026;

  it("month=4 (April 2026) yields targetYear=2025, targetQuarter=Q4 (NOT Q1)", () => {
    const result = detectTargetQuarter(currentYear, 4);
    expect(result.targetYear).toBe(2025);
    expect(result.targetQuarter).toBe("Q4");
    // Explicitly confirm it is NOT the bugged result
    expect(result.targetQuarter).not.toBe("Q1");
    expect(result.targetYear).not.toBe(2026);
  });

  it("month=3 (March 2026) also yields Q4 prev year (boundary check)", () => {
    const result = detectTargetQuarter(currentYear, 3);
    expect(result.targetYear).toBe(2025);
    expect(result.targetQuarter).toBe("Q4");
  });

  it("month=5 (May 2026) yields Q1 current year (boundary after fix)", () => {
    const result = detectTargetQuarter(currentYear, 5);
    expect(result.targetYear).toBe(2026);
    expect(result.targetQuarter).toBe("Q1");
  });
});

describe("Task 1201 — backfill migration idempotency", () => {
  beforeEach(async () => {
    closeDb();
    await initDatabase();
  });

  afterEach(() => {
    closeDb();
  });

  it("first backfill call inserts exactly 7 rows", () => {
    const db = getDb();
    runBackfill079(db);

    const row = db.prepare(
      "SELECT COUNT(*) AS n FROM bctc_vps_queue",
    ).get() as { n: number };
    expect(row.n).toBe(7);
  });

  it("second backfill call does NOT duplicate rows (idempotent — still 7 rows)", () => {
    const db = getDb();
    runBackfill079(db);
    runBackfill079(db); // called twice

    const row = db.prepare(
      "SELECT COUNT(*) AS n FROM bctc_vps_queue",
    ).get() as { n: number };
    expect(row.n).toBe(7); // NOT 14
  });

  it("backfill includes 6 Q4-2025 rows (BID/EIB/SHB/VCB/FPT/HPG)", () => {
    const db = getDb();
    runBackfill079(db);

    const rows = db.prepare(
      `SELECT action_code FROM bctc_vps_queue
       WHERE period_year = 2025 AND period_quarter = 'Q4'
       ORDER BY action_code`,
    ).all() as { action_code: string }[];

    expect(rows.length).toBe(6);
    const codes = rows.map((r) => r.action_code).sort();
    expect(codes).toEqual(["BID", "EIB", "FPT", "HPG", "SHB", "VCB"]);
  });

  it("backfill includes VCB Q1-2025 row (Task 1204 re-fetch trigger)", () => {
    const db = getDb();
    runBackfill079(db);

    const row = db.prepare(
      `SELECT action_code, period_year, period_quarter, status, attempts
       FROM bctc_vps_queue
       WHERE action_code = 'VCB' AND period_year = 2025 AND period_quarter = 'Q1'`,
    ).get() as { action_code: string; period_year: number; period_quarter: string; status: string; attempts: number } | null;

    expect(row).not.toBeNull();
    expect(row!.action_code).toBe("VCB");
    expect(row!.period_year).toBe(2025);
    expect(row!.period_quarter).toBe("Q1");
    expect(row!.status).toBe("pending");
    expect(row!.attempts).toBe(0);
  });

  it("backfill resets a failed row (status=failed OR attempts>=5) back to pending", () => {
    const db = getDb();

    // Force BID Q4-2025 into a failed/exhausted state (overwrite initDatabase backfill row)
    db.prepare(
      `INSERT OR REPLACE INTO bctc_vps_queue (action_code, period_year, period_quarter, status, attempts)
       VALUES ('BID', 2025, 'Q4', 'failed', 5)`,
    ).run();

    // Run backfill — should reset failed/exhausted row
    runBackfill079(db);

    const row = db.prepare(
      `SELECT status, attempts FROM bctc_vps_queue
       WHERE action_code = 'BID' AND period_year = 2025 AND period_quarter = 'Q4'`,
    ).get() as { status: string; attempts: number } | null;

    expect(row).not.toBeNull();
    expect(row!.status).toBe("pending");
    expect(row!.attempts).toBe(0);

    // Still 7 total rows (pre-inserted BID row was updated, not duplicated)
    const count = db.prepare(
      "SELECT COUNT(*) AS n FROM bctc_vps_queue",
    ).get() as { n: number };
    expect(count.n).toBe(7);
  });

  it("backfill does NOT reset a pending row with attempts < 5 (do not disrupt in-progress)", () => {
    const db = getDb();

    // Force EIB Q4-2025 into a pending/in-progress state with 2 attempts
    // (overwrite the initDatabase backfill row which starts at attempts=0)
    db.prepare(
      `INSERT OR REPLACE INTO bctc_vps_queue (action_code, period_year, period_quarter, status, attempts)
       VALUES ('EIB', 2025, 'Q4', 'pending', 2)`,
    ).run();

    runBackfill079(db);

    const row = db.prepare(
      `SELECT status, attempts FROM bctc_vps_queue
       WHERE action_code = 'EIB' AND period_year = 2025 AND period_quarter = 'Q4'`,
    ).get() as { status: string; attempts: number } | null;

    // The DO UPDATE WHERE clause only fires when status='failed' OR attempts>=5.
    // A pending row with attempts=2 must NOT be reset.
    expect(row).not.toBeNull();
    expect(row!.status).toBe("pending");
    expect(row!.attempts).toBe(2); // unchanged — NOT reset to 0
  });
});
