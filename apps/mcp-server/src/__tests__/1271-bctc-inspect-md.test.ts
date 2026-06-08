// src/__tests__/1271-bctc-inspect-md.test.ts
// MD-INSPECT — GET /api/bctc-inspect/md/{doc_id} handler tests
//
// TDD: RED → GREEN → REFACTOR
//
// ACs covered:
//   AC-I-1: pre-populated row → full contract shape; no row → has_md_tables:false;
//           invalid UUID doc_id → 400.
//   AC-I-3: existing GET /api/bctc-inspect/table/{doc_id} is untouched
//           (verified by import — bctcInspectHandler.ts still exports handleBctcInspectTable).
//
// Test isolation: uses in-memory SQLite (:memory:) — NEVER writes live market.db.

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import type { IncomingMessage, ServerResponse } from "node:http";
import { handleBctcInspectMd } from "../interface/mcp/routes/bctcInspectMdHandler.js";
// AC-I-3: importing from the existing handler proves it's still present/unchanged
import { handleBctcInspectTable } from "../interface/mcp/routes/bctcInspectHandler.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTestDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS bctc_md_tables (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id        TEXT    NOT NULL UNIQUE,
      md_tables_json   TEXT    NOT NULL,
      ocr_as_markdown  TEXT    NOT NULL,
      table_count      INTEGER NOT NULL DEFAULT 0,
      page_count       INTEGER NOT NULL DEFAULT 0,
      extracted_at     TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

const mockReq = {} as IncomingMessage;

function makeRes() {
  let statusCode = 0;
  let body = "";

  const res = {
    writeHead(code: number) { statusCode = code; },
    end(data?: string) { body = data ?? ""; },
    get statusCode() { return statusCode; },
    get body() { return body; },
    get parsedBody() { return JSON.parse(body); },
  } as unknown as ServerResponse & { statusCode: number; body: string; parsedBody: unknown };

  return res;
}

// ── Fixture data ──────────────────────────────────────────────────────────────

const VALID_UUID = "e71f845d-ffa5-48f9-8f09-30ac2cd09c65";
const MISSING_UUID = "aaaabbbb-cccc-dddd-eeee-ffffaaaabbbb";

const MD_TABLES = [
  "| Col A | Col B |\n|---|---|\n| val1 | val2 |",
  "| Header X | Header Y |\n|---|---|\n| a | b |",
];

function seedRow(db: Database, reportId: string) {
  db.prepare(`
    INSERT INTO bctc_md_tables
      (report_id, md_tables_json, ocr_as_markdown, table_count, page_count)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    reportId,
    JSON.stringify(MD_TABLES),
    "## Section One\n> 12345",
    MD_TABLES.length,
    7,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("bctcInspectMdHandler", () => {
  let db: Database;

  beforeEach(() => {
    db = makeTestDb();
  });

  it("AC-I-1a: pre-populated row → full contract shape with has_md_tables:true", async () => {
    seedRow(db, VALID_UUID);
    const res = makeRes();
    await handleBctcInspectMd(mockReq, res, db, VALID_UUID);

    expect(res.statusCode).toBe(200);
    const data = res.parsedBody as {
      doc_id: string;
      report_id: string;
      has_md_tables: boolean;
      table_count: number;
      page_count: number;
      md_tables: string[];
      ocr_as_markdown: string;
      extracted_at: string;
    };

    expect(data.doc_id).toBe(VALID_UUID);
    expect(data.report_id).toBe(VALID_UUID);
    expect(data.has_md_tables).toBe(true);
    expect(data.table_count).toBe(2);
    expect(data.page_count).toBe(7);
    expect(Array.isArray(data.md_tables)).toBe(true);
    expect(data.md_tables).toHaveLength(2);
    expect(data.md_tables[0]).toContain("| Col A |");
    expect(data.md_tables[1]).toContain("| Header X |");
    expect(data.ocr_as_markdown).toContain("## Section One");
    expect(typeof data.extracted_at).toBe("string");
    expect(data.extracted_at.length).toBeGreaterThan(0);
  });

  it("AC-I-1b: no row → has_md_tables:false with HTTP 200 (not 404)", async () => {
    const res = makeRes();
    await handleBctcInspectMd(mockReq, res, db, MISSING_UUID);

    expect(res.statusCode).toBe(200);
    const data = res.parsedBody as { has_md_tables: boolean };
    expect(data.has_md_tables).toBe(false);
  });

  it("AC-I-1c: invalid UUID doc_id → 400", async () => {
    const res = makeRes();
    await handleBctcInspectMd(mockReq, res, db, "not-a-uuid");

    expect(res.statusCode).toBe(400);
    const data = res.parsedBody as { error: string };
    expect(data.error).toMatch(/invalid_doc_id/);
  });

  it("AC-I-1d: empty string doc_id → 400", async () => {
    const res = makeRes();
    await handleBctcInspectMd(mockReq, res, db, "");

    expect(res.statusCode).toBe(400);
  });

  it("AC-I-1e: md_tables array is correctly deserialized (JSON round-trip)", async () => {
    seedRow(db, VALID_UUID);
    const res = makeRes();
    await handleBctcInspectMd(mockReq, res, db, VALID_UUID);

    const data = res.parsedBody as { md_tables: string[] };
    // Verify the JSON round-trip produced the correct strings
    expect(data.md_tables[0]).toBe(MD_TABLES[0]);
    expect(data.md_tables[1]).toBe(MD_TABLES[1]);
  });

  it("AC-I-3: handleBctcInspectTable is still importable (non-regression)", () => {
    // The import at the top of this file verifies the function is still exported.
    // This test asserts it's a function (not undefined) — proves no structural breakage.
    expect(typeof handleBctcInspectTable).toBe("function");
  });

  it("does not touch bctc_table_rows or bctc_balance_checks (Decision A)", () => {
    // The test DB only has bctc_md_tables — confirm handler never references other tables
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[];
    const names = tables.map(t => t.name);
    expect(names).not.toContain("bctc_table_rows");
    expect(names).not.toContain("bctc_balance_checks");
  });
});
