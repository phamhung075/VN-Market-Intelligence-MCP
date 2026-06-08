/**
 * BT-3i-B — handleBctcInspectTable tests
 *
 * Tests GET /api/bctc-inspect/table/{doc_id}:
 *   - Valid UUID with stored rows → 200, has_table: true, rows ordered by row_order
 *   - Valid UUID with no rows → 200, has_table: false, rows: [] (not 404)
 *   - Invalid UUID → 400
 *   - balance_check badge logic: balance_pass=true → pass, false → fail
 *   - Summary rows (codes 100/200/270/300/400/440) present in output
 *   - period_current/period_prior returned in response
 *   - Empty doc (no rows, no balance check) → graceful has_table:false state
 *
 * Uses in-memory SQLite for isolation.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";

Bun.env["DB_PATH"] = ":memory:";

import { Database as BunDatabase } from "bun:sqlite";
import { initFinancialReportsTables } from "../infrastructure/db/schema-financial-reports.js";
import { handlePushBctcTable } from "../interface/mcp/routes/pushBctcTableHandler.js";
import { handleBctcInspectTable } from "../interface/mcp/routes/bctcInspectHandler.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function openTestDb(): Database {
  const db = new BunDatabase(":memory:");
  initFinancialReportsTables(db);
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

interface CapturedResponse {
  statusCode: number;
  body: string;
}

function mockRes(): { res: ServerResponse; captured: CapturedResponse } {
  const captured: CapturedResponse = { statusCode: 200, body: "" };
  const res = {
    writeHead(code: number) { captured.statusCode = code; },
    end(data?: string) { captured.body = data ?? ""; },
  } as unknown as ServerResponse;
  return { res, captured };
}

function mockReq(): IncomingMessage {
  return { url: "/api/bctc-inspect/table/test" } as unknown as IncomingMessage;
}

// FPT golden fixture
const FPT_UUID = "aaaabbbb-cccc-dddd-eeee-ffffffffffff";

const FPT_ROWS = [
  { page_number: 4, row_order: 0, code: "100", label: "TÀI SẢN NGẮN HẠN", value_current: 58102970741619, value_prior: 45535942846453, unit: "vnd", is_summary_row: 1 },
  { page_number: 4, row_order: 1, code: "110", label: "Tiền và các khoản tương đương tiền", value_current: 2455354649806, value_prior: 1800000000000, unit: "vnd", is_summary_row: 0 },
  { page_number: 4, row_order: 2, code: null, label: "Tiền (header)", value_current: null, value_prior: null, unit: "vnd", is_summary_row: 0 },
  { page_number: 5, row_order: 3, code: "270", label: "TỔNG CỘNG TÀI SẢN", value_current: 88089621779862, value_prior: 72535942846453, unit: "vnd", is_summary_row: 1 },
  { page_number: 6, row_order: 4, code: "300", label: "NỢ PHẢI TRẢ", value_current: 44338155487272, value_prior: 38000000000000, unit: "vnd", is_summary_row: 1 },
  { page_number: 7, row_order: 5, code: "400", label: "VỐN CHỦ SỞ HỮU", value_current: 43751466292590, value_prior: 34535942846453, unit: "vnd", is_summary_row: 1 },
];

const FPT_BALANCE_CHECK_PASS = {
  total_assets: 88089621779862,
  total_liabilities: 44338155487272,
  total_equity: 43751466292590,
  balance_delta: 0.0,
  balance_pass: true,
};

const FPT_BALANCE_CHECK_FAIL = {
  total_assets: 88089621779862,
  total_liabilities: 44338155487272,
  total_equity: 43000000000000,
  balance_delta: 751466292590,
  balance_pass: false,
};

const VALID_PAYLOAD = {
  report_id: FPT_UUID,
  statement_section: "balance_sheet",
  period_current: "31/12/2025",
  period_prior: "31/12/2024",
  rows: FPT_ROWS,
  balance_check: FPT_BALANCE_CHECK_PASS,
};

// ── Seed helper ────────────────────────────────────────────────────────────────

async function seedFixture(db: Database, payload = VALID_PAYLOAD): Promise<void> {
  const { res } = mockRes();
  await handlePushBctcTable(mockReq(), res, db, payload);
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("BT-3i-B — handleBctcInspectTable", () => {
  let db: Database;

  beforeEach(() => {
    db = openTestDb();
  });

  afterEach(() => {
    db.close();
  });

  // ── Happy path: rows exist ─────────────────────────────────────────────────

  it("valid UUID with rows → 200, has_table: true", async () => {
    await seedFixture(db);
    const { res, captured } = mockRes();
    await handleBctcInspectTable(mockReq(), res, db, FPT_UUID);

    expect(captured.statusCode).toBe(200);
    const body = JSON.parse(captured.body) as { has_table: boolean; rows: unknown[] };
    expect(body.has_table).toBe(true);
    expect(Array.isArray(body.rows)).toBe(true);
    expect(body.rows.length).toBe(6);
  });

  it("rows returned ordered by row_order ASC", async () => {
    await seedFixture(db);
    const { res, captured } = mockRes();
    await handleBctcInspectTable(mockReq(), res, db, FPT_UUID);

    const body = JSON.parse(captured.body) as { rows: Array<{ row_order: number }> };
    const orders = body.rows.map((r) => r.row_order);
    expect(orders).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("period_current returned in response", async () => {
    await seedFixture(db);
    const { res, captured } = mockRes();
    await handleBctcInspectTable(mockReq(), res, db, FPT_UUID);

    const body = JSON.parse(captured.body) as { period_current: string };
    expect(body.period_current).toBe("31/12/2025");
  });

  it("period_prior returned in response", async () => {
    await seedFixture(db);
    const { res, captured } = mockRes();
    await handleBctcInspectTable(mockReq(), res, db, FPT_UUID);

    const body = JSON.parse(captured.body) as { period_prior: string };
    expect(body.period_prior).toBe("31/12/2024");
  });

  it("summary row (code=100) has is_summary_row=true", async () => {
    await seedFixture(db);
    const { res, captured } = mockRes();
    await handleBctcInspectTable(mockReq(), res, db, FPT_UUID);

    const body = JSON.parse(captured.body) as { rows: Array<{ code: string; is_summary_row: boolean }> };
    const row100 = body.rows.find((r) => r.code === "100");
    expect(row100?.is_summary_row).toBe(true);
  });

  it("header row (code=null) preserved in output", async () => {
    await seedFixture(db);
    const { res, captured } = mockRes();
    await handleBctcInspectTable(mockReq(), res, db, FPT_UUID);

    const body = JSON.parse(captured.body) as { rows: Array<{ code: string | null }> };
    const headerRow = body.rows.find((r) => r.code === null);
    expect(headerRow).toBeDefined();
  });

  // ── Balance check badge ────────────────────────────────────────────────────

  it("balance_pass=true → balance_check.balance_pass=true in response", async () => {
    await seedFixture(db);
    const { res, captured } = mockRes();
    await handleBctcInspectTable(mockReq(), res, db, FPT_UUID);

    const body = JSON.parse(captured.body) as { balance_check: { balance_pass: boolean } };
    expect(body.balance_check?.balance_pass).toBe(true);
  });

  it("balance_pass=false → balance_check.balance_pass=false in response", async () => {
    await seedFixture(db, { ...VALID_PAYLOAD, balance_check: FPT_BALANCE_CHECK_FAIL });
    const { res, captured } = mockRes();
    await handleBctcInspectTable(mockReq(), res, db, FPT_UUID);

    const body = JSON.parse(captured.body) as { balance_check: { balance_pass: boolean; balance_delta: number } };
    expect(body.balance_check?.balance_pass).toBe(false);
    expect(body.balance_check?.balance_delta).toBeGreaterThan(0);
  });

  // ── No rows stored (legacy/unextracted docs) ───────────────────────────────

  it("valid UUID with no rows → 200, has_table: false (NOT 404)", async () => {
    const freshUuid = "00000000-0000-0000-0000-000000000001";
    const { res, captured } = mockRes();
    await handleBctcInspectTable(mockReq(), res, db, freshUuid);

    expect(captured.statusCode).toBe(200);
    const body = JSON.parse(captured.body) as { has_table: boolean; rows: unknown[] };
    expect(body.has_table).toBe(false);
    expect(body.rows).toEqual([]);
  });

  it("no rows → balance_check is null", async () => {
    const freshUuid = "00000000-0000-0000-0000-000000000002";
    const { res, captured } = mockRes();
    await handleBctcInspectTable(mockReq(), res, db, freshUuid);

    const body = JSON.parse(captured.body) as { balance_check: null };
    expect(body.balance_check).toBeNull();
  });

  // ── UUID validation ────────────────────────────────────────────────────────

  it("invalid UUID → 400", async () => {
    const { res, captured } = mockRes();
    await handleBctcInspectTable(mockReq(), res, db, "not-a-uuid");

    expect(captured.statusCode).toBe(400);
  });

  it("empty string doc_id → 400", async () => {
    const { res, captured } = mockRes();
    await handleBctcInspectTable(mockReq(), res, db, "");

    expect(captured.statusCode).toBe(400);
  });

  // ── doc_id passthrough ─────────────────────────────────────────────────────

  it("doc_id echoed in response", async () => {
    await seedFixture(db);
    const { res, captured } = mockRes();
    await handleBctcInspectTable(mockReq(), res, db, FPT_UUID);

    const body = JSON.parse(captured.body) as { doc_id: string };
    expect(body.doc_id).toBe(FPT_UUID);
  });
});
