/**
 * Task 1002 — Anonymous SSC PDF Attribution
 *
 * Tests normaliseFilename, action_code column on pdf_extracted_text,
 * and D-7c fallback to action_code for stranded PDF detection.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { normaliseFilename } from "../application/usecases/fetchParseAndStoreBctc.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ─────────────────────────────────────────────────────────────────────────────
// normaliseFilename tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1002 — normaliseFilename", () => {
  it("returns canonical name for anonymous filename (document.pdf)", () => {
    const result = normaliseFilename(
      "https://congbothongtin.ssc.gov.vn/uploads/12345/document.pdf",
      "VCB",
      2025,
      "Q1",
    );
    expect(result).toBe("VCB_2025_Q1.pdf");
  });

  it("returns canonical name for GUID filename", () => {
    const result = normaliseFilename(
      "https://example.com/abc123-def456.pdf",
      "FPT",
      2025,
      "Q2",
    );
    expect(result).toBe("FPT_2025_Q2.pdf");
  });

  it("preserves filename that already contains the ticker", () => {
    const result = normaliseFilename(
      "https://example.com/BCTC_VCB_Q1_2025.pdf",
      "VCB",
      2025,
      "Q1",
    );
    expect(result).toBe("BCTC_VCB_Q1_2025.pdf");
  });

  it("handles non-.pdf extension in URL — uses canonical", () => {
    const result = normaliseFilename(
      "https://example.com/VCB_report.html",
      "VCB",
      2025,
      "Q3",
    );
    expect(result).toBe("VCB_2025_Q3.pdf");
  });

  it("handles invalid URL gracefully — uses canonical", () => {
    const result = normaliseFilename(
      "not a valid url at all",
      "HPG",
      2025,
      "Q4",
    );
    expect(result).toBe("HPG_2025_Q4.pdf");
  });

  it("is case-insensitive when checking for ticker in filename", () => {
    const result = normaliseFilename(
      "https://example.com/bctc-vcb-q1.pdf",
      "VCB",
      2025,
      "Q1",
    );
    expect(result).toBe("bctc-vcb-q1.pdf");
  });

  it("returns canonical when URL has empty path", () => {
    const result = normaliseFilename(
      "https://example.com/",
      "VEA",
      2025,
      "Q1",
    );
    expect(result).toBe("VEA_2025_Q1.pdf");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// pdf_extracted_text.action_code column tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1002 — pdf_extracted_text.action_code column", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    initNewsTables(db);
    initMarketDataTables(db);
    initSystemTables(db);
    db.exec(`
      CREATE TABLE pdf_extracted_text (
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
    db.exec(`CREATE INDEX IF NOT EXISTS idx_pet_action_code ON pdf_extracted_text(action_code)`);
  });

  it("stores action_code alongside OCR text", () => {
    db.run(
      "INSERT INTO pdf_extracted_text (filename, page_number, text_content, confidence, action_code) VALUES (?, ?, ?, ?, ?)",
      ["document.pdf", 1, "Some financial text", 0.8, "VCB"],
    );

    const row = db
      .query<{ action_code: string }, [string]>(
        "SELECT action_code FROM pdf_extracted_text WHERE filename = ?",
      )
      .get("document.pdf");
    expect(row?.action_code).toBe("VCB");
  });

  it("action_code defaults to empty string when not provided", () => {
    db.run(
      "INSERT INTO pdf_extracted_text (filename, page_number, text_content, confidence) VALUES (?, ?, ?, ?)",
      ["legacy.pdf", 1, "Old text", 0.5],
    );

    const row = db
      .query<{ action_code: string }, [string]>(
        "SELECT action_code FROM pdf_extracted_text WHERE filename = ?",
      )
      .get("legacy.pdf");
    expect(row?.action_code).toBe("");
  });

  it("D-7c fallback: query by action_code when filename has no ticker", () => {
    db.run(
      "INSERT INTO pdf_extracted_text (filename, page_number, text_content, confidence, action_code) VALUES (?, ?, ?, ?, ?)",
      ["document.pdf", 1, "Financial data", 0.8, "FPT"],
    );

    // Simulate D-7c fallback lookup
    const row = db
      .query<{ action_code: string }, [string]>(
        "SELECT action_code FROM pdf_extracted_text WHERE filename = ? AND action_code != '' LIMIT 1",
      )
      .get("document.pdf");
    expect(row?.action_code).toBe("FPT");
  });

  it("D-7c fallback returns null when no action_code stored", () => {
    db.run(
      "INSERT INTO pdf_extracted_text (filename, page_number, text_content, confidence) VALUES (?, ?, ?, ?)",
      ["mystery.pdf", 1, "Unknown text", 0.5],
    );

    const row = db
      .query<{ action_code: string }, [string]>(
        "SELECT action_code FROM pdf_extracted_text WHERE filename = ? AND action_code != '' LIMIT 1",
      )
      .get("mystery.pdf");
    expect(row).toBeNull();
  });
});
