/**
 * BT-3i-A — pushBctcTableHandler tests
 *
 * Tests POST /api/push-bctc-table handler:
 *   - Bulk INSERT of rows into bctc_table_rows
 *   - UPSERT of balance_check into bctc_balance_checks
 *   - Idempotency: second call for same report_id yields same row count
 *   - Invalid UUID returns 400
 *   - Missing rows array returns 400
 *
 * Uses in-memory SQLite (DB_PATH=:memory:) for full isolation.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";

// Use in-memory SQLite for test isolation
Bun.env["DB_PATH"] = ":memory:";

import { Database as BunDatabase } from "bun:sqlite";
import { initFinancialReportsTables } from "../infrastructure/db/schema-financial-reports.js";
import { handlePushBctcTable } from "../interface/mcp/routes/pushBctcTableHandler.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function openTestDb(): Database {
  const db = new BunDatabase(":memory:");
  initFinancialReportsTables(db);
  return db;
}

interface CapturedResponse {
  statusCode: number;
  body: string;
}

/**
 * Mock ServerResponse that captures status + body for assertions.
 */
function mockRes(): { res: ServerResponse; captured: CapturedResponse } {
  const captured: CapturedResponse = { statusCode: 200, body: "" };

  const res = {
    writeHead(code: number, _headers?: Record<string, string>) {
      captured.statusCode = code;
    },
    end(data?: string) {
      captured.body = data ?? "";
    },
  } as unknown as ServerResponse;

  return { res, captured };
}

/**
 * Build a minimal mock IncomingMessage with a JSON body.
 */
function mockReq(body: unknown): IncomingMessage {
  return {} as IncomingMessage;
}

// FPT golden fixture — 10-row slice matching BT-3-C output shape
const FPT_UUID = "12345678-1234-1234-1234-123456789abc";

const FPT_ROWS = [
  { page_number: 4, row_order: 0, code: "100", label: "TÀI SẢN NGẮN HẠN", value_current: 58102970741619, value_prior: 45535942846453, unit: "vnd", is_summary_row: 1 },
  { page_number: 4, row_order: 1, code: "110", label: "Tiền và các khoản tương đương tiền", value_current: 2455354649806, value_prior: 1800000000000, unit: "vnd", is_summary_row: 0 },
  { page_number: 4, row_order: 2, code: null, label: "Tiền", value_current: null, value_prior: null, unit: "vnd", is_summary_row: 0 },
  { page_number: 5, row_order: 3, code: "200", label: "TÀI SẢN DÀI HẠN", value_current: 29986651038243, value_prior: 27000000000000, unit: "vnd", is_summary_row: 1 },
  { page_number: 5, row_order: 4, code: "270", label: "TỔNG CỘNG TÀI SẢN", value_current: 88089621779862, value_prior: 72535942846453, unit: "vnd", is_summary_row: 1 },
  { page_number: 6, row_order: 5, code: "300", label: "NỢ PHẢI TRẢ", value_current: 44338155487272, value_prior: 38000000000000, unit: "vnd", is_summary_row: 1 },
  { page_number: 7, row_order: 6, code: "400", label: "VỐN CHỦ SỞ HỮU", value_current: 43751466292590, value_prior: 34535942846453, unit: "vnd", is_summary_row: 1 },
  { page_number: 7, row_order: 7, code: "440", label: "TỔNG NGUỒN VỐN", value_current: 88089621779862, value_prior: 72535942846453, unit: "vnd", is_summary_row: 1 },
  { page_number: 7, row_order: 8, code: "410", label: "Vốn góp của chủ sở hữu", value_current: 5000000000000, value_prior: 5000000000000, unit: "vnd", is_summary_row: 0 },
  { page_number: 7, row_order: 9, code: "420", label: "Thặng dư vốn cổ phần", value_current: 1200000000000, value_prior: 1200000000000, unit: "vnd", is_summary_row: 0 },
];

const FPT_BALANCE_CHECK = {
  total_assets: 88089621779862,
  total_liabilities: 44338155487272,
  total_equity: 43751466292590,
  balance_delta: 0.0,
  balance_pass: true,
};

const VALID_PAYLOAD = {
  report_id: FPT_UUID,
  statement_section: "balance_sheet",
  period_current: "31/12/2025",
  period_prior: "31/12/2024",
  rows: FPT_ROWS,
  balance_check: FPT_BALANCE_CHECK,
};

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("BT-3i-A — handlePushBctcTable", () => {
  let db: Database;

  beforeEach(() => {
    db = openTestDb();
  });

  afterEach(() => {
    db.close();
  });

  // ── Schema existence ───────────────────────────────────────────────────────

  it("bctc_table_rows table exists after initFinancialReportsTables", () => {
    const row = db
      .prepare<{ name: string }, [string]>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
      )
      .get("bctc_table_rows");
    expect(row?.name).toBe("bctc_table_rows");
  });

  it("bctc_balance_checks table exists after initFinancialReportsTables", () => {
    const row = db
      .prepare<{ name: string }, [string]>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
      )
      .get("bctc_balance_checks");
    expect(row?.name).toBe("bctc_balance_checks");
  });

  it("idx_btr_report index exists", () => {
    const row = db
      .prepare<{ name: string }, [string]>(
        "SELECT name FROM sqlite_master WHERE type='index' AND name=?",
      )
      .get("idx_btr_report");
    expect(row?.name).toBe("idx_btr_report");
  });

  it("idx_bbc_report index exists", () => {
    const row = db
      .prepare<{ name: string }, [string]>(
        "SELECT name FROM sqlite_master WHERE type='index' AND name=?",
      )
      .get("idx_bbc_report");
    expect(row?.name).toBe("idx_bbc_report");
  });

  // ── Happy path: bulk INSERT ────────────────────────────────────────────────

  it("bulk INSERT 10 rows — SELECT COUNT returns 10", async () => {
    const { res, captured } = mockRes();
    await handlePushBctcTable(mockReq(VALID_PAYLOAD), res, db, VALID_PAYLOAD);

    expect(captured.statusCode).toBe(200);
    const respObj = JSON.parse(captured.body) as { ok: boolean; rows_stored: number };
    expect(respObj.ok).toBe(true);
    expect(respObj.rows_stored).toBe(10);

    const count = db
      .prepare<{ cnt: number }, [string]>(
        "SELECT COUNT(*) as cnt FROM bctc_table_rows WHERE report_id = ?",
      )
      .get(FPT_UUID);
    expect(count?.cnt).toBe(10);
  });

  it("balance_check row stored with balance_pass=1", async () => {
    const { res } = mockRes();
    await handlePushBctcTable(mockReq(VALID_PAYLOAD), res, db, VALID_PAYLOAD);

    const row = db
      .prepare<{ balance_pass: number; balance_delta: number }, [string]>(
        "SELECT balance_pass, balance_delta FROM bctc_balance_checks WHERE report_id = ?",
      )
      .get(FPT_UUID);
    expect(row?.balance_pass).toBe(1);
    expect(row?.balance_delta).toBe(0.0);
  });

  it("stores period_current in bctc_table_rows rows", async () => {
    const { res } = mockRes();
    await handlePushBctcTable(mockReq(VALID_PAYLOAD), res, db, VALID_PAYLOAD);

    const row = db
      .prepare<{ period_current: string }, [string]>(
        "SELECT period_current FROM bctc_table_rows WHERE report_id = ? AND row_order = 0",
      )
      .get(FPT_UUID);
    expect(row?.period_current).toBe("31/12/2025");
  });

  it("stores code null rows correctly (header rows)", async () => {
    const { res } = mockRes();
    await handlePushBctcTable(mockReq(VALID_PAYLOAD), res, db, VALID_PAYLOAD);

    const row = db
      .prepare<{ code: string | null }, [string, number]>(
        "SELECT code FROM bctc_table_rows WHERE report_id = ? AND row_order = ?",
      )
      .get(FPT_UUID, 2);
    expect(row?.code).toBeNull();
  });

  // ── Idempotency ────────────────────────────────────────────────────────────

  it("second push for same report_id: row count unchanged (idempotency)", async () => {
    const { res: res1 } = mockRes();
    await handlePushBctcTable(mockReq(VALID_PAYLOAD), res1, db, VALID_PAYLOAD);

    const { res: res2, captured: cap2 } = mockRes();
    await handlePushBctcTable(mockReq(VALID_PAYLOAD), res2, db, VALID_PAYLOAD);

    expect(cap2.statusCode).toBe(200);

    const count = db
      .prepare<{ cnt: number }, [string]>(
        "SELECT COUNT(*) as cnt FROM bctc_table_rows WHERE report_id = ?",
      )
      .get(FPT_UUID);
    expect(count?.cnt).toBe(10);
  });

  it("second push: balance_check UPSERT — still one row in bctc_balance_checks", async () => {
    const { res: res1 } = mockRes();
    await handlePushBctcTable(mockReq(VALID_PAYLOAD), res1, db, VALID_PAYLOAD);

    const { res: res2 } = mockRes();
    await handlePushBctcTable(mockReq(VALID_PAYLOAD), res2, db, VALID_PAYLOAD);

    const count = db
      .prepare<{ cnt: number }, [string]>(
        "SELECT COUNT(*) as cnt FROM bctc_balance_checks WHERE report_id = ?",
      )
      .get(FPT_UUID);
    expect(count?.cnt).toBe(1);
  });

  // ── UUID validation ────────────────────────────────────────────────────────

  it("invalid UUID returns 400", async () => {
    const { res, captured } = mockRes();
    const badPayload = { ...VALID_PAYLOAD, report_id: "not-a-uuid" };
    await handlePushBctcTable(mockReq(badPayload), res, db, badPayload);

    expect(captured.statusCode).toBe(400);
    const respObj = JSON.parse(captured.body) as { error: string };
    expect(respObj.error).toContain("invalid");
  });

  it("missing rows array returns 400", async () => {
    const { res, captured } = mockRes();
    const badPayload = { ...VALID_PAYLOAD, rows: undefined };
    await handlePushBctcTable(mockReq(badPayload), res, db, badPayload as any);

    expect(captured.statusCode).toBe(400);
  });

  it("no balance_check: rows still inserted, no bctc_balance_checks row", async () => {
    const { res, captured } = mockRes();
    const noBalancePayload = { ...VALID_PAYLOAD, balance_check: null };
    await handlePushBctcTable(mockReq(noBalancePayload), res, db, noBalancePayload);

    expect(captured.statusCode).toBe(200);

    const count = db
      .prepare<{ cnt: number }, [string]>(
        "SELECT COUNT(*) as cnt FROM bctc_table_rows WHERE report_id = ?",
      )
      .get(FPT_UUID);
    expect(count?.cnt).toBe(10);

    const balCount = db
      .prepare<{ cnt: number }, [string]>(
        "SELECT COUNT(*) as cnt FROM bctc_balance_checks WHERE report_id = ?",
      )
      .get(FPT_UUID);
    expect(balCount?.cnt).toBe(0);
  });
});
