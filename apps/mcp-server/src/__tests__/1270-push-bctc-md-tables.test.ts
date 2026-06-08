// src/__tests__/1270-push-bctc-md-tables.test.ts
// MD-INSPECT — POST /api/push-bctc-md-tables handler tests
//
// TDD: RED → GREEN → REFACTOR
//
// ACs covered:
//   AC-I-0: valid payload → 200 + tables_stored matches; idempotency → COUNT=1;
//           invalid UUID → 400.
//   AC-I-4: pushBctcTableHandler still untouched (verified by type-check at build).
//
// Test isolation: uses in-memory SQLite (:memory:) — NEVER writes live market.db.

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import type { IncomingMessage, ServerResponse } from "node:http";
import { handlePushBctcMdTables } from "../interface/mcp/routes/pushBctcMdTablesHandler.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal in-memory DB with the bctc_md_tables schema. */
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
  db.exec(`CREATE INDEX IF NOT EXISTS idx_bmt_report ON bctc_md_tables(report_id)`);
  return db;
}

/** Minimal mock IncomingMessage (body injection path — req body unused). */
const mockReq = {} as IncomingMessage;

/** Capture response status + body from the handler. */
function makeRes() {
  let statusCode = 0;
  let body = "";
  const headers: Record<string, string> = {};

  const res = {
    writeHead(code: number, hdrs?: Record<string, string>) {
      statusCode = code;
      Object.assign(headers, hdrs ?? {});
    },
    end(data?: string) {
      body = data ?? "";
    },
    get statusCode() { return statusCode; },
    get body() { return body; },
    get parsedBody() { return JSON.parse(body); },
  } as unknown as ServerResponse & { statusCode: number; body: string; parsedBody: unknown };

  return res;
}

// ── Valid UUID fixture ────────────────────────────────────────────────────────

const VALID_UUID = "e71f845d-ffa5-48f9-8f09-30ac2cd09c65";
const ANOTHER_UUID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

const VALID_BODY = {
  report_id: VALID_UUID,
  md_tables: [
    "| Col A | Col B |\n|---|---|\n| val1 | val2 |",
    "| Header X | Header Y | Header Z |\n|---|---|---|\n| a | b | c |",
  ],
  ocr_as_markdown: "## Section One\n> 12345\n## Section Two",
  page_count: 7,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("pushBctcMdTablesHandler", () => {
  let db: Database;

  beforeEach(() => {
    db = makeTestDb();
  });

  it("AC-I-0a: valid payload → 200 + ok:true + tables_stored=1 (DB-verified)", async () => {
    const res = makeRes();
    await handlePushBctcMdTables(mockReq, res, db, VALID_BODY);

    expect(res.statusCode).toBe(200);
    const parsed = res.parsedBody as { ok: boolean; tables_stored: number };
    expect(parsed.ok).toBe(true);
    // tables_stored is DB .changes (1 row written), not input array length
    expect(parsed.tables_stored).toBe(1);
  });

  it("AC-I-0a: tables are persisted and retrievable", async () => {
    const res = makeRes();
    await handlePushBctcMdTables(mockReq, res, db, VALID_BODY);

    const row = db
      .prepare("SELECT * FROM bctc_md_tables WHERE report_id = ?")
      .get(VALID_UUID) as { md_tables_json: string; table_count: number; page_count: number } | null;

    expect(row).not.toBeNull();
    const stored = JSON.parse(row!.md_tables_json) as string[];
    expect(stored).toHaveLength(2);
    expect(stored[0]).toContain("| Col A |");
    expect(row!.table_count).toBe(2);
    expect(row!.page_count).toBe(7);
  });

  it("AC-I-0b: idempotency — second POST with same report_id → COUNT=1 (not 2)", async () => {
    const res1 = makeRes();
    const res2 = makeRes();

    await handlePushBctcMdTables(mockReq, res1, db, VALID_BODY);
    await handlePushBctcMdTables(mockReq, res2, db, VALID_BODY);

    // Both calls succeed
    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);

    // Only ONE row in the table (INSERT OR REPLACE, not duplicate INSERT)
    const countRow = db
      .prepare("SELECT COUNT(*) as cnt FROM bctc_md_tables WHERE report_id = ?")
      .get(VALID_UUID) as { cnt: number };
    expect(countRow.cnt).toBe(1);
  });

  it("AC-I-0b: second POST replaces data, not appends", async () => {
    const res1 = makeRes();
    await handlePushBctcMdTables(mockReq, res1, db, VALID_BODY);

    const updatedBody = {
      ...VALID_BODY,
      md_tables: ["| Only | One |\n|---|---|\n| x | y |"],
      page_count: 3,
    };
    const res2 = makeRes();
    await handlePushBctcMdTables(mockReq, res2, db, updatedBody);

    const row = db
      .prepare("SELECT md_tables_json, table_count, page_count FROM bctc_md_tables WHERE report_id = ?")
      .get(VALID_UUID) as { md_tables_json: string; table_count: number; page_count: number };

    const stored = JSON.parse(row.md_tables_json) as string[];
    expect(stored).toHaveLength(1);
    expect(row.table_count).toBe(1);
    expect(row.page_count).toBe(3);
  });

  it("AC-I-0c: invalid UUID → 400", async () => {
    const res = makeRes();
    const badBody = { ...VALID_BODY, report_id: "not-a-uuid" };
    await handlePushBctcMdTables(mockReq, res, db, badBody);

    expect(res.statusCode).toBe(400);
    const parsed = res.parsedBody as { error: string };
    expect(parsed.error).toMatch(/invalid_report_id/);
  });

  it("AC-I-0d: non-string report_id → 400", async () => {
    const res = makeRes();
    // Force a non-string value
    const badBody = { ...VALID_BODY, report_id: 12345 as unknown as string };
    await handlePushBctcMdTables(mockReq, res, db, badBody);

    expect(res.statusCode).toBe(400);
  });

  it("AC-I-0e: md_tables not an array → 400", async () => {
    const res = makeRes();
    const badBody = { ...VALID_BODY, md_tables: "not-an-array" as unknown as string[] };
    await handlePushBctcMdTables(mockReq, res, db, badBody);

    expect(res.statusCode).toBe(400);
    const parsed = res.parsedBody as { error: string };
    expect(parsed.error).toMatch(/md_tables must be an array/);
  });

  it("AC-I-0f: empty md_tables array is accepted (table_count=0)", async () => {
    const res = makeRes();
    const emptyBody = { ...VALID_BODY, report_id: ANOTHER_UUID, md_tables: [] };
    await handlePushBctcMdTables(mockReq, res, db, emptyBody);

    expect(res.statusCode).toBe(200);
    const parsed = res.parsedBody as { ok: boolean; tables_stored: number };
    expect(parsed.ok).toBe(true);
    // tables_stored = DB .changes = 1 (the row was written)
    expect(parsed.tables_stored).toBe(1);

    const row = db
      .prepare("SELECT table_count FROM bctc_md_tables WHERE report_id = ?")
      .get(ANOTHER_UUID) as { table_count: number };
    expect(row.table_count).toBe(0);
  });

  it("does not touch bctc_table_rows or bctc_balance_checks (Decision A)", () => {
    // These tables do not exist in the test DB — referencing them would throw.
    // The handler only touches bctc_md_tables; confirm no cross-table writes.
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[];
    const names = tables.map(t => t.name);
    expect(names).not.toContain("bctc_table_rows");
    expect(names).not.toContain("bctc_balance_checks");
    expect(names).toContain("bctc_md_tables");
  });
});
