/**
 * FIX-BCTC-SIZE-GUARD — Two bug fixes:
 *
 * Bug 1: push-bctc-pdf accepts PDFs as small as 100 bytes.
 *        Real BCTC PDFs are never under 10 KB. Threshold must be 10,240 bytes.
 *
 * Bug 2: 4 fake/corrupt PDFs are marked 'done' in bctc_vps_queue and will
 *        never be retried. One-time migration must reset them to 'pending',
 *        delete the corrupt PDF files, and clear pdf_extracted_text rows.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ─────────────────────────────────────────────────────────────────────────────
// Shared in-memory DB setup
// ─────────────────────────────────────────────────────────────────────────────

function createTestDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS bctc_vps_queue (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      action_code     TEXT    NOT NULL,
      period_year     INTEGER NOT NULL,
      period_quarter  TEXT    NOT NULL,
      status          TEXT    NOT NULL DEFAULT 'pending',
      source_url      TEXT,
      attempts        INTEGER NOT NULL DEFAULT 0,
      last_attempt    TEXT,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(action_code, period_year, period_quarter)
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS pdf_extracted_text (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      filename     TEXT    NOT NULL,
      page_number  INTEGER NOT NULL,
      text_content TEXT    NOT NULL DEFAULT '',
      confidence   REAL    NOT NULL DEFAULT 0,
      extracted_at TEXT    NOT NULL DEFAULT (datetime('now')),
      action_code  TEXT    NOT NULL DEFAULT '',
      UNIQUE(filename, page_number)
    )
  `);
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// Bug 1 — Size guard validation logic
// ─────────────────────────────────────────────────────────────────────────────

const MIN_PDF_BYTES = 10_240; // 10 KB — real BCTC PDFs are never smaller

/**
 * Simulates the size validation guard extracted from the push-bctc-pdf handler.
 * Returns null if valid, or an error message string if invalid.
 */
function validatePdfSize(buffer: Buffer): string | null {
  if (!(buffer instanceof Buffer) || buffer.length < MIN_PDF_BYTES) {
    return `PDF too small: ${buffer.length} bytes (minimum ${MIN_PDF_BYTES} bytes / 10 KB). Real BCTC PDFs are never under 10 KB.`;
  }
  return null;
}

describe("FIX-BCTC-SIZE-GUARD — Bug 1: PDF size guard (10 KB minimum)", () => {
  test("AC-1a: rejects buffer of 0 bytes", () => {
    const buf = Buffer.alloc(0);
    const err = validatePdfSize(buf);
    expect(err).not.toBeNull();
    expect(err).toContain("10240");
  });

  test("AC-1b: rejects buffer of 459 bytes (fake test PDF that previously passed)", () => {
    const buf = Buffer.alloc(459, 0x25); // 0x25 = '%', mimics PDF header prefix
    const err = validatePdfSize(buf);
    expect(err).not.toBeNull();
    expect(err).toContain("459");
  });

  test("AC-1c: rejects buffer of 100 bytes (old threshold)", () => {
    const buf = Buffer.alloc(100);
    const err = validatePdfSize(buf);
    expect(err).not.toBeNull();
  });

  test("AC-1d: rejects buffer of 10,239 bytes (one byte under threshold)", () => {
    const buf = Buffer.alloc(10_239);
    const err = validatePdfSize(buf);
    expect(err).not.toBeNull();
  });

  test("AC-1e: accepts buffer of exactly 10,240 bytes (minimum valid)", () => {
    const buf = Buffer.alloc(10_240);
    const err = validatePdfSize(buf);
    expect(err).toBeNull();
  });

  test("AC-1f: accepts buffer of 1 MB (typical BCTC PDF)", () => {
    const buf = Buffer.alloc(1_048_576);
    const err = validatePdfSize(buf);
    expect(err).toBeNull();
  });

  test("AC-1g: error message includes byte count and minimum threshold", () => {
    const buf = Buffer.alloc(459);
    const err = validatePdfSize(buf);
    expect(err).toContain("459");
    expect(err).toContain("10240");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bug 2 — Poisoned queue cleanup migration
// ─────────────────────────────────────────────────────────────────────────────

/** The exact 4 poisoned entries that must be reset. */
const POISONED_ENTRIES = [
  { action_code: "BID", period_year: 2025, period_quarter: "Q4", filename: "BID_2025_Q4.pdf" },
  { action_code: "BSR", period_year: 2025, period_quarter: "Q4", filename: "BSR_2025_Q4.pdf" },
  { action_code: "DGC", period_year: 2025, period_quarter: "Q4", filename: "DGC_2025_Q4.pdf" },
  { action_code: "TEST", period_year: 2025, period_quarter: "Q4", filename: "test.pdf" },
] as const;

/**
 * One-time queue poison cleanup. Operates on the provided db handle so it
 * is testable without touching production DB.
 *
 * Steps:
 *  1. Reset bctc_vps_queue rows from 'done' → 'pending' (clears attempts too)
 *  2. Delete pdf_extracted_text rows for each filename
 *
 * Physical PDF deletion is handled separately (fs.rmSync) — tested via
 * the filenames returned from this function.
 */
function cleanPoisonedQueueEntries(db: Database): string[] {
  const deletedFilenames: string[] = [];

  for (const entry of POISONED_ENTRIES) {
    // Step 1: reset queue status
    db.prepare(
      `UPDATE bctc_vps_queue
       SET status = 'pending', attempts = 0, last_attempt = NULL
       WHERE action_code = ? AND period_year = ? AND period_quarter = ?`,
    ).run(entry.action_code, entry.period_year, entry.period_quarter);

    // Step 2: delete extracted text cache rows
    const result = db.prepare(
      `DELETE FROM pdf_extracted_text WHERE filename = ?`,
    ).run(entry.filename);

    if (result.changes > 0 || true) {
      // Always return filename so caller can delete the physical file
      deletedFilenames.push(entry.filename);
    }
  }

  return deletedFilenames;
}

describe("FIX-BCTC-SIZE-GUARD — Bug 2: Poisoned queue cleanup migration", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();

    // Seed the 4 poisoned 'done' entries
    const insert = db.prepare(
      `INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, attempts)
       VALUES (?, ?, ?, 'done', 1)`,
    );
    insert.run("BID", 2025, "Q4");
    insert.run("BSR", 2025, "Q4");
    insert.run("DGC", 2025, "Q4");
    insert.run("TEST", 2025, "Q4");

    // Seed pdf_extracted_text rows for the poisoned filenames
    const insertText = db.prepare(
      `INSERT INTO pdf_extracted_text (filename, page_number, text_content, action_code)
       VALUES (?, 1, 'fake', ?)`,
    );
    insertText.run("BID_2025_Q4.pdf", "BID");
    insertText.run("BSR_2025_Q4.pdf", "BSR");
    insertText.run("DGC_2025_Q4.pdf", "DGC");
    insertText.run("test.pdf", "TEST");

    // Also add a non-poisoned 'done' entry that must NOT be touched
    db.prepare(
      `INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, attempts)
       VALUES ('VCB', 2025, 'Q4', 'done', 1)`,
    ).run();
    db.prepare(
      `INSERT INTO pdf_extracted_text (filename, page_number, text_content, action_code)
       VALUES ('VCB_2025_Q4.pdf', 1, 'real', 'VCB')`,
    ).run();
  });

  test("AC-2a: resets BID_2025_Q4 from done → pending", () => {
    cleanPoisonedQueueEntries(db);
    const row = db.prepare(
      `SELECT status, attempts FROM bctc_vps_queue WHERE action_code = 'BID' AND period_quarter = 'Q4'`,
    ).get() as { status: string; attempts: number } | null;
    expect(row?.status).toBe("pending");
    expect(row?.attempts).toBe(0);
  });

  test("AC-2b: resets all 4 poisoned entries to pending", () => {
    cleanPoisonedQueueEntries(db);
    const rows = db.prepare(
      `SELECT action_code, status FROM bctc_vps_queue
       WHERE action_code IN ('BID','BSR','DGC','TEST') AND period_quarter = 'Q4'
       ORDER BY action_code`,
    ).all() as { action_code: string; status: string }[];
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row.status).toBe("pending");
    }
  });

  test("AC-2c: does NOT reset VCB (non-poisoned done entry)", () => {
    cleanPoisonedQueueEntries(db);
    const row = db.prepare(
      `SELECT status FROM bctc_vps_queue WHERE action_code = 'VCB' AND period_quarter = 'Q4'`,
    ).get() as { status: string } | null;
    expect(row?.status).toBe("done");
  });

  test("AC-2d: deletes pdf_extracted_text rows for all 4 poisoned filenames", () => {
    cleanPoisonedQueueEntries(db);
    const count = db.prepare(
      `SELECT COUNT(*) as cnt FROM pdf_extracted_text
       WHERE filename IN ('BID_2025_Q4.pdf','BSR_2025_Q4.pdf','DGC_2025_Q4.pdf','test.pdf')`,
    ).get() as { cnt: number };
    expect(count.cnt).toBe(0);
  });

  test("AC-2e: preserves VCB pdf_extracted_text row (non-poisoned)", () => {
    cleanPoisonedQueueEntries(db);
    const row = db.prepare(
      `SELECT filename FROM pdf_extracted_text WHERE filename = 'VCB_2025_Q4.pdf'`,
    ).get() as { filename: string } | null;
    expect(row?.filename).toBe("VCB_2025_Q4.pdf");
  });

  test("AC-2f: returns list of 4 filenames for physical deletion", () => {
    const filenames = cleanPoisonedQueueEntries(db);
    expect(filenames).toHaveLength(4);
    expect(filenames).toContain("BID_2025_Q4.pdf");
    expect(filenames).toContain("BSR_2025_Q4.pdf");
    expect(filenames).toContain("DGC_2025_Q4.pdf");
    expect(filenames).toContain("test.pdf");
  });

  test("AC-2g: resets attempts to 0 for all 4 poisoned entries", () => {
    cleanPoisonedQueueEntries(db);
    const rows = db.prepare(
      `SELECT attempts FROM bctc_vps_queue
       WHERE action_code IN ('BID','BSR','DGC','TEST') AND period_quarter = 'Q4'`,
    ).all() as { attempts: number }[];
    for (const row of rows) {
      expect(row.attempts).toBe(0);
    }
  });

  test("AC-2h: idempotent — running twice does not corrupt state", () => {
    cleanPoisonedQueueEntries(db);
    cleanPoisonedQueueEntries(db); // second run should be safe
    const rows = db.prepare(
      `SELECT status FROM bctc_vps_queue
       WHERE action_code IN ('BID','BSR','DGC','TEST') AND period_quarter = 'Q4'`,
    ).all() as { status: string }[];
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row.status).toBe("pending");
    }
  });
});
