/**
 * Task 1347a — Test DB Isolation: telegram_reports must have 0 net new rows
 * after the test suite runs.
 *
 * RED: this test fails because the production DB has 2537+ historical rows
 *      leaked by earlier test runs (before setup.ts preload was in place).
 *
 * GREEN: after cleanup (DELETE FROM telegram_reports WHERE text patterns match
 *        known fixture values) the production DB is clean and stays clean.
 *
 * Invariant: every test that touches telegram_reports must use :memory: DB.
 *   - setup.ts preload sets DB_PATH=:memory: for all bun test runs
 *   - Individual test files may also set it explicitly (double-guard)
 *   - The singleton getDb() reads Bun.env["DB_PATH"] at runtime, so the
 *     preload takes effect before any DB open
 *
 * Tests:
 *   1. DB_PATH is :memory: when this test runs (preload guard)
 *   2. The singleton DB is not the production file-based DB
 *   3. After initDatabase(), telegram_reports is empty (fresh :memory: DB)
 *   4. insertReport + listNewReports round-trip works on :memory:
 *   5. Production DB row count is stable (no new rows between two reads)
 *   6. Production DB has no unprocessed fixture rows (known leak patterns)
 */

// Preload already sets DB_PATH=:memory:, but add explicit guard for clarity
Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  insertReport,
  listNewReports,
} from "../infrastructure/db/telegramReportStore.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const PROJECT_ROOT = resolve(import.meta.dir, "..", "..", "..", "..");
const PRODUCTION_DB = resolve(PROJECT_ROOT, "data", "market.db");

// Known fixture text patterns from test files — these should never appear in
// the production DB. Presence = test isolation breach.
const FIXTURE_PATTERNS = [
  "New report 1",
  "New report 2",
  "New report 3",
  "Report 1",
  "Report 2",
  "Report 3",
  "Report A",
  "Report B",
  "Report with TG message",
  "Failed delete",
  "Error during delete",
  "No TG message",
  "Skip delete",
  "No delete but process",
  "Capture message_id",
  "Audit trail test",
  "Full row test",
  "Full fields test",
  "ISO test",
  "Lookup test",
  "Only one",
  "Check values",
  "Untouched",
  "To be processed",
  "To process",
  "Keep new",
  "Process me",
  "Double process",
  "Stay new",
  "Unprocessed",
  "Processed report",
  "First report",
  "Second report",
  "First",
  "Second",
  "Third",
  "Timestamp test",
  "Some report",
  "Alert: VNM dropped 5%",
  "No message",
  "Priority critical report",
  "Priority high report",
  "Priority normal report",
  "Priority monitor report",
  "Test report text",
  "VCB tests are failing",
  "Critical: FPT price feed down",
  "check VNM",
  "ping",
  "new issue",
  "issue 1",
  "issue 2",
  "issue 3",
  "numeric id test",
  "test",
  "report message",
  "Test row",
  "Problem: VNM data stale",
  "Bug report",
  "Needs fix",
  "Report",
  "Race condition target",
  "Already owned",
  "Same claimant twice",
  "Claimed report",
  "Unclaimed",
  "Claimed",
  "Processed unclaimed",
  "Keep new",
];

// ─────────────────────────────────────────────────────────────────────────────
// 1. DB_PATH guard — confirms setup.ts preload is active
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1347a — DB isolation: DB_PATH guard", () => {
  it("DB_PATH is :memory: when test suite runs (setup.ts preload active)", () => {
    expect(Bun.env["DB_PATH"]).toBe(":memory:");
  });

  it("the DB singleton uses :memory: path (not production file)", async () => {
    closeDb();
    await initDatabase();
    const db = getDb();
    // In-memory DB: filename() returns empty string or ':memory:'
    const filename = db.filename;
    expect(filename === "" || filename === ":memory:").toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Fresh :memory: DB starts empty
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1347a — DB isolation: fresh :memory: DB is empty", () => {
  let db: Database;

  beforeEach(async () => {
    closeDb();
    await initDatabase();
    db = getDb();
  });

  it("telegram_reports table is empty after initDatabase on fresh :memory: DB", () => {
    const rows = listNewReports(db);
    expect(rows).toHaveLength(0);
  });

  it("insertReport + listNewReports round-trip on :memory: DB", () => {
    const id = insertReport(db, "isolation test row", "test-agent", 0, "normal");
    expect(id).toBeGreaterThan(0);
    const rows = listNewReports(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.text).toBe("isolation test row");
    // This row lives ONLY in :memory: — production DB is unaffected
  });

  it(":memory: DB is discarded between closeDb() calls — no cross-test state", async () => {
    insertReport(db, "ephemeral row", "test-agent", 0, "normal");
    expect(listNewReports(db)).toHaveLength(1);

    closeDb();
    await initDatabase();
    const freshDb = getDb();
    // Fresh :memory: connection — previous row is gone
    expect(listNewReports(freshDb)).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Production DB: no fixture rows (RED until cleanup)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1347a — Production DB: no fixture pollution", () => {
  it("production market.db exists (sanity check)", () => {
    // If the production DB doesn't exist, there's nothing to clean — pass.
    // If it does exist, the next test validates it's clean.
    const exists = existsSync(PRODUCTION_DB);
    // Always passes — just documents the path
    expect(typeof exists).toBe("boolean");
  });

  it("production DB telegram_reports has 0 rows with known fixture text patterns", () => {
    if (!existsSync(PRODUCTION_DB)) {
      // No production DB — test passes trivially
      return;
    }

    const prodDb = new Database(PRODUCTION_DB, { readonly: true });
    try {
      // Build a query that counts rows matching any of the known fixture patterns
      const placeholders = FIXTURE_PATTERNS.map(() => "?").join(", ");
      const count = prodDb
        .query<{ c: number }, string[]>(
          `SELECT COUNT(*) as c FROM telegram_reports WHERE text IN (${placeholders})`,
        )
        .get(...FIXTURE_PATTERNS);

      // RED: this fails because the production DB has 521+ fixture rows
      // GREEN: after cleanup, count = 0
      expect(count?.c ?? 0).toBe(0);
    } finally {
      prodDb.close();
    }
  });

  it("production DB telegram_reports has 0 rows with status='new' and text matching test fixtures", () => {
    if (!existsSync(PRODUCTION_DB)) {
      return;
    }

    const prodDb = new Database(PRODUCTION_DB, { readonly: true });
    try {
      // Short fixture texts that appear verbatim in test files
      const shortPatterns = ["First", "Second", "Third", "test", "ping"];
      const placeholders = shortPatterns.map(() => "?").join(", ");
      const count = prodDb
        .query<{ c: number }, string[]>(
          `SELECT COUNT(*) as c FROM telegram_reports WHERE text IN (${placeholders}) AND status='new'`,
        )
        .get(...shortPatterns);

      expect(count?.c ?? 0).toBe(0);
    } finally {
      prodDb.close();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Concurrent test isolation — insertReport in :memory: does not bleed
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1347a — DB isolation: concurrent test simulation", () => {
  it("multiple initDatabase calls each get :memory: — no production writes", async () => {
    // Simulate what multiple test files do:
    for (let i = 0; i < 5; i++) {
      closeDb();
      await initDatabase();
      const db = getDb();
      insertReport(db, `Concurrent test row ${i}`, "test-agent", i, "normal");
      const rows = listNewReports(db);
      expect(rows.length).toBeGreaterThan(0);
      // All in :memory: — production DB unaffected
    }

    if (!existsSync(PRODUCTION_DB)) return;

    const prodDb = new Database(PRODUCTION_DB, { readonly: true });
    try {
      const count = prodDb
        .query<{ c: number }, []>(
          "SELECT COUNT(*) as c FROM telegram_reports WHERE text LIKE 'Concurrent test row%'",
        )
        .get();
      expect(count?.c ?? 0).toBe(0);
    } finally {
      prodDb.close();
    }
  });
});
