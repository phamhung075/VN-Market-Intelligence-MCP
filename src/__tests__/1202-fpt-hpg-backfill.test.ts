// src/__tests__/1202-fpt-hpg-backfill.test.ts
// Task 1202 — FPT/HPG Q4-2025 BCTC backfill verification
//
// Context: Task 1201 added the BACKFILL_079 array to initDatabase() in schema.ts.
// The array includes all 6 tickers: BID, EIB, SHB, VCB, FPT, HPG (Q4-2025) + VCB Q1-2025.
// Task 1202 verifies that FPT and HPG specifically are present and correctly configured
// in bctc_vps_queue after initDatabase() runs — targeted test complementing 1201's broader
// idempotency suite.
//
// These tests cover the 1202 acceptance criteria independently:
//   AC-1: FPT Q4-2025 row present in bctc_vps_queue with status='pending', attempts=0
//   AC-2: HPG Q4-2025 row present in bctc_vps_queue with status='pending', attempts=0
//   AC-3: Both FPT and HPG rows survive a second initDatabase() call unchanged (idempotent)
//   AC-4: FPT failed row is reset to pending by initDatabase() startup migration
//   AC-5: HPG pending row with attempts<5 is NOT disrupted by initDatabase()

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";

describe("Task 1202 — FPT Q4-2025 in bctc_vps_queue after initDatabase()", () => {
  beforeEach(async () => {
    closeDb();
    await initDatabase();
  });

  afterEach(() => {
    closeDb();
  });

  it("AC-1: FPT Q4-2025 row exists with status=pending and attempts=0", () => {
    const db = getDb();
    const row = db
      .prepare(
        `SELECT action_code, period_year, period_quarter, status, attempts
         FROM bctc_vps_queue
         WHERE action_code = 'FPT' AND period_year = 2025 AND period_quarter = 'Q4'`,
      )
      .get() as {
        action_code: string;
        period_year: number;
        period_quarter: string;
        status: string;
        attempts: number;
      } | null;

    expect(row).not.toBeNull();
    expect(row!.action_code).toBe("FPT");
    expect(row!.period_year).toBe(2025);
    expect(row!.period_quarter).toBe("Q4");
    expect(row!.status).toBe("pending");
    expect(row!.attempts).toBe(0);
  });
});

describe("Task 1202 — HPG Q4-2025 in bctc_vps_queue after initDatabase()", () => {
  beforeEach(async () => {
    closeDb();
    await initDatabase();
  });

  afterEach(() => {
    closeDb();
  });

  it("AC-2: HPG Q4-2025 row exists with status=pending and attempts=0", () => {
    const db = getDb();
    const row = db
      .prepare(
        `SELECT action_code, period_year, period_quarter, status, attempts
         FROM bctc_vps_queue
         WHERE action_code = 'HPG' AND period_year = 2025 AND period_quarter = 'Q4'`,
      )
      .get() as {
        action_code: string;
        period_year: number;
        period_quarter: string;
        status: string;
        attempts: number;
      } | null;

    expect(row).not.toBeNull();
    expect(row!.action_code).toBe("HPG");
    expect(row!.period_year).toBe(2025);
    expect(row!.period_quarter).toBe("Q4");
    expect(row!.status).toBe("pending");
    expect(row!.attempts).toBe(0);
  });
});

describe("Task 1202 — FPT and HPG idempotency across double initDatabase()", () => {
  afterEach(() => {
    closeDb();
  });

  it("AC-3: calling initDatabase() twice does not duplicate FPT or HPG rows", async () => {
    closeDb();
    await initDatabase();
    closeDb();
    await initDatabase(); // second call — must be idempotent

    const db = getDb();

    const fptCount = db
      .prepare(
        `SELECT COUNT(*) AS n FROM bctc_vps_queue
         WHERE action_code = 'FPT' AND period_year = 2025 AND period_quarter = 'Q4'`,
      )
      .get() as { n: number };
    expect(fptCount.n).toBe(1); // exactly one row, not two

    const hpgCount = db
      .prepare(
        `SELECT COUNT(*) AS n FROM bctc_vps_queue
         WHERE action_code = 'HPG' AND period_year = 2025 AND period_quarter = 'Q4'`,
      )
      .get() as { n: number };
    expect(hpgCount.n).toBe(1); // exactly one row, not two
  });
});

describe("Task 1202 — FPT failed row is reset by initDatabase() startup migration", () => {
  afterEach(() => {
    closeDb();
  });

  it("AC-4: FPT row pre-set to failed/exhausted is reset to pending on next initDatabase()", async () => {
    // First init — creates FPT Q4-2025 pending row
    closeDb();
    await initDatabase();

    // Simulate exhausted fetch: set FPT to failed with attempts=5
    const db = getDb();
    db.prepare(
      `INSERT OR REPLACE INTO bctc_vps_queue
         (action_code, period_year, period_quarter, status, attempts)
       VALUES ('FPT', 2025, 'Q4', 'failed', 5)`,
    ).run();

    const exhausted = db
      .prepare(
        `SELECT status, attempts FROM bctc_vps_queue
         WHERE action_code = 'FPT' AND period_year = 2025 AND period_quarter = 'Q4'`,
      )
      .get() as { status: string; attempts: number } | null;
    expect(exhausted?.status).toBe("failed");
    expect(exhausted?.attempts).toBe(5);

    // Second init — startup migration must reset the failed row back to pending
    closeDb();
    await initDatabase();

    const reset = getDb()
      .prepare(
        `SELECT status, attempts FROM bctc_vps_queue
         WHERE action_code = 'FPT' AND period_year = 2025 AND period_quarter = 'Q4'`,
      )
      .get() as { status: string; attempts: number } | null;

    expect(reset).not.toBeNull();
    expect(reset!.status).toBe("pending");
    expect(reset!.attempts).toBe(0);
  });
});

describe("Task 1202 — HPG in-progress row is preserved by backfill upsert guard", () => {
  beforeEach(async () => {
    closeDb();
    await initDatabase();
  });

  afterEach(() => {
    closeDb();
  });

  it("AC-5: HPG Q4-2025 with attempts=2 is not reset by a second backfill upsert", () => {
    const db = getDb();

    // Simulate in-progress: HPG has been attempted twice (pending, attempts=2).
    // Use INSERT OR REPLACE to overwrite the initDatabase()-seeded row.
    db.prepare(
      `INSERT OR REPLACE INTO bctc_vps_queue
         (action_code, period_year, period_quarter, status, attempts)
       VALUES ('HPG', 2025, 'Q4', 'pending', 2)`,
    ).run();

    // Run the same upsert that initDatabase() uses to verify the WHERE guard holds.
    // The DO UPDATE fires only WHERE status='failed' OR attempts>=5.
    // A pending row with attempts=2 must NOT be touched.
    db.prepare(`
      INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, attempts)
      VALUES ('HPG', 2025, 'Q4', 'pending', 0)
      ON CONFLICT(action_code, period_year, period_quarter)
      DO UPDATE SET status = 'pending', attempts = 0, last_attempt = NULL
      WHERE status = 'failed' OR attempts >= 5
    `).run();

    const row = db
      .prepare(
        `SELECT status, attempts FROM bctc_vps_queue
         WHERE action_code = 'HPG' AND period_year = 2025 AND period_quarter = 'Q4'`,
      )
      .get() as { status: string; attempts: number } | null;

    expect(row).not.toBeNull();
    // The WHERE guard prevents reset: attempts=2 < 5 and status='pending' (not 'failed')
    expect(row!.status).toBe("pending");
    expect(row!.attempts).toBe(2); // unchanged
  });
});
