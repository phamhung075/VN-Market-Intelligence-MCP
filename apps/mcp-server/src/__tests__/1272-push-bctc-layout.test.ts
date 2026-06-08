/**
 * LF-OVERLAY test 1272 — handlePushBctcLayout
 *
 * Tests POST /api/push-bctc-layout handler (AC-LFO-4, AC-LFO-5):
 *   (a) valid payload writes correct rows to bctc_layout_units + bctc_page_zones
 *   (b) quarantined unit stored with quarantined=1
 *   (c) duplicate push is idempotent (INSERT OR REPLACE)
 *   (d) missing report_id returns 400
 *   (e) invalid UUID report_id returns 400
 *   (f) handler touches ONLY the two new tables (zero cross-table write to bctc_table_rows)
 *   (g) DB-verified count: units_stored reflects actual committed rows (write-wedge guard)
 *
 * Uses in-memory SQLite (DB_PATH=:memory:) for full isolation.
 * Zero credentials, zero network, zero pdf-extractor dependency.
 *
 * MZH-2 guard: fails suite if any test would open the production market.db path.
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from "bun:test";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";

// Force in-memory DB before any module-level import
Bun.env["DB_PATH"] = ":memory:";

import { Database as BunDatabase } from "bun:sqlite";
import { initFinancialReportsTables } from "../infrastructure/db/schema-financial-reports.js";
import { handlePushBctcLayout } from "../interface/mcp/routes/pushBctcLayoutHandler.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ── MZH-2 production DB guard ──────────────────────────────────────────────────
const PRODUCTION_DB_PATTERNS = [/market\.db/, /\/app\/data\//, /apps\/mcp-server\/data\//];
function assertNotProductionDb(path: string): void {
  for (const pattern of PRODUCTION_DB_PATTERNS) {
    if (pattern.test(path)) {
      throw new Error(
        `[MZH-2 guard] BLOCKED: attempt to open production DB path "${path}". Tests MUST use :memory:.`,
      );
    }
  }
}
assertNotProductionDb(Bun.env["DB_PATH"] ?? "");

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
    writeHead(code: number, _headers?: Record<string, string>) { captured.statusCode = code; },
    end(data?: string) { captured.body = data ?? ""; },
  } as unknown as ServerResponse;
  return { res, captured };
}

function mockReq(_body?: unknown): IncomingMessage {
  return {} as IncomingMessage;
}

// ── Fixtures (§3.2 contract shape) ───────────────────────────────────────────

const REPORT_UUID = "e8ea3df5-3f32-413d-a3eb-c71634c0438d";
const UNIT_UUID_A = "a1b2c3d4-0000-0000-0000-000000000001";
const UNIT_UUID_B = "a1b2c3d4-0000-0000-0000-000000000002";

const ZONES_PAGE_3 = {
  image_width_px: 2338,
  image_height_px: 3308,
  image_dpi: 200,
  coordinate_origin: "top-left",
  coordinate_unit: "px",
  header_band: { y_min: 0, y_max: 185 },
  footer_band: { y_min: 3100, y_max: 3308 },
  column_gutters: [
    { col_id: "col_0", x_min: 0, x_max: 460 },
    { col_id: "col_1", x_min: 461, x_max: 520 },
    { col_id: "col_2", x_min: 521, x_max: 810 },
  ],
  row_bands: [
    { y_min: 186, y_max: 220, row_density: 0.71 },
    { y_min: 221, y_max: 256, row_density: 0.68 },
  ],
  unit_hints: [],
  unit_boundary_after_page: false,
};

const ZONES_PAGE_5 = {
  ...ZONES_PAGE_3,
  header_band: { y_min: 0, y_max: 140 },
  unit_boundary_after_page: true,
};

const VALID_PAYLOAD = {
  report_id: REPORT_UUID,
  document_map: {
    total_pages: 10,
    units: [
      {
        unit_id: UNIT_UUID_A,
        schema_page: 3,
        pages: [3, 4, 5],
        page_type: "table",
      },
      {
        unit_id: UNIT_UUID_B,
        schema_page: 7,
        pages: [7, 8],
        page_type: "prose",
      },
    ],
  },
  units: [
    {
      unit_id: UNIT_UUID_A,
      stitched_markdown: "| col_0 | col_1 |\n|---|---|\n| A | 100 |",
      row_count: 1,
      quarantined: false,
      quarantine_reason: null,
    },
    {
      unit_id: UNIT_UUID_B,
      stitched_markdown: "",
      row_count: 0,
      quarantined: true,
      quarantine_reason: "balance_identity_fail: delta=12",
    },
  ],
  page_zones: [
    {
      page_number: 3,
      unit_id: UNIT_UUID_A,
      page_type: "table",
      is_schema_page: true,
      is_continuation_page: false,
      schema_inherited_from_page: null,
      zones: ZONES_PAGE_3,
    },
    {
      page_number: 5,
      unit_id: UNIT_UUID_A,
      page_type: "table",
      is_schema_page: false,
      is_continuation_page: true,
      schema_inherited_from_page: 3,
      zones: ZONES_PAGE_5,
    },
  ],
  pass_rate_report: {
    units_total: 2,
    units_passing: 1,
    units_quarantined: 1,
    quarantine_breakdown: { balance_identity_fail: 1, codes_not_monotonic: 0, orphan_rows: 0 },
  },
};

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("1272 — handlePushBctcLayout", () => {
  let db: Database;

  beforeAll(() => {
    const dbPath = Bun.env["DB_PATH"] ?? "";
    assertNotProductionDb(dbPath);
    if (dbPath !== ":memory:") {
      throw new Error(`[MZH-2 guard] DB_PATH must be :memory: in test suite, got: "${dbPath}"`);
    }
  });

  beforeEach(() => {
    db = openTestDb();
  });

  afterEach(() => {
    db.close();
  });

  // ── Schema existence ───────────────────────────────────────────────────────

  it("bctc_layout_units table exists after initFinancialReportsTables", () => {
    const row = db
      .prepare<{ name: string }, [string]>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
      )
      .get("bctc_layout_units");
    expect(row?.name).toBe("bctc_layout_units");
  });

  it("bctc_page_zones table exists after initFinancialReportsTables", () => {
    const row = db
      .prepare<{ name: string }, [string]>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
      )
      .get("bctc_page_zones");
    expect(row?.name).toBe("bctc_page_zones");
  });

  it("idx_blu_report index exists", () => {
    const row = db
      .prepare<{ name: string }, [string]>(
        "SELECT name FROM sqlite_master WHERE type='index' AND name=?",
      )
      .get("idx_blu_report");
    expect(row?.name).toBe("idx_blu_report");
  });

  it("idx_bpz_report index exists", () => {
    const row = db
      .prepare<{ name: string }, [string]>(
        "SELECT name FROM sqlite_master WHERE type='index' AND name=?",
      )
      .get("idx_bpz_report");
    expect(row?.name).toBe("idx_bpz_report");
  });

  // ── (a) Valid payload writes correct rows ──────────────────────────────────

  it("(a) valid payload: bctc_layout_units has 2 rows for report_id", async () => {
    const { res, captured } = mockRes();
    await handlePushBctcLayout(mockReq(), res, db, VALID_PAYLOAD);

    expect(captured.statusCode).toBe(200);
    const resp = JSON.parse(captured.body) as { ok: boolean; units_stored: number; pages_stored: number };
    expect(resp.ok).toBe(true);
    expect(resp.units_stored).toBe(2);

    const cnt = db
      .prepare<{ cnt: number }, [string]>(
        "SELECT COUNT(*) AS cnt FROM bctc_layout_units WHERE report_id = ?",
      )
      .get(REPORT_UUID);
    expect(cnt?.cnt).toBe(2);
  });

  it("(a) valid payload: bctc_page_zones has 2 rows for report_id", async () => {
    const { res, captured } = mockRes();
    await handlePushBctcLayout(mockReq(), res, db, VALID_PAYLOAD);

    expect(captured.statusCode).toBe(200);
    const resp = JSON.parse(captured.body) as { ok: boolean; units_stored: number; pages_stored: number };
    expect(resp.pages_stored).toBe(2);

    const cnt = db
      .prepare<{ cnt: number }, [string]>(
        "SELECT COUNT(*) AS cnt FROM bctc_page_zones WHERE report_id = ?",
      )
      .get(REPORT_UUID);
    expect(cnt?.cnt).toBe(2);
  });

  it("(a) schema_page stored correctly for unit A", async () => {
    const { res } = mockRes();
    await handlePushBctcLayout(mockReq(), res, db, VALID_PAYLOAD);

    const row = db
      .prepare<{ schema_page: number }, [string, string]>(
        "SELECT schema_page FROM bctc_layout_units WHERE report_id = ? AND unit_id = ?",
      )
      .get(REPORT_UUID, UNIT_UUID_A);
    expect(row?.schema_page).toBe(3);
  });

  it("(a) zones_json stored for page 3 — col_id col_0 present", async () => {
    const { res } = mockRes();
    await handlePushBctcLayout(mockReq(), res, db, VALID_PAYLOAD);

    const row = db
      .prepare<{ zones_json: string }, [string, number]>(
        "SELECT zones_json FROM bctc_page_zones WHERE report_id = ? AND page_number = ?",
      )
      .get(REPORT_UUID, 3);
    expect(row).not.toBeNull();
    const zones = JSON.parse(row!.zones_json) as { column_gutters: { col_id: string }[] };
    expect(zones.column_gutters[0]?.col_id).toBe("col_0");
  });

  it("(a) schema_inherited_from_page stored correctly for page 5", async () => {
    const { res } = mockRes();
    await handlePushBctcLayout(mockReq(), res, db, VALID_PAYLOAD);

    const row = db
      .prepare<{ schema_inherited_from_page: number | null }, [string, number]>(
        "SELECT schema_inherited_from_page FROM bctc_page_zones WHERE report_id = ? AND page_number = ?",
      )
      .get(REPORT_UUID, 5);
    expect(row?.schema_inherited_from_page).toBe(3);
  });

  // ── (b) Quarantined unit stored with quarantined=1 ─────────────────────────

  it("(b) quarantined unit stored with quarantined=1 and quarantine_reason set", async () => {
    const { res } = mockRes();
    await handlePushBctcLayout(mockReq(), res, db, VALID_PAYLOAD);

    const row = db
      .prepare<{ quarantined: number; quarantine_reason: string | null }, [string, string]>(
        "SELECT quarantined, quarantine_reason FROM bctc_layout_units WHERE report_id = ? AND unit_id = ?",
      )
      .get(REPORT_UUID, UNIT_UUID_B);
    expect(row?.quarantined).toBe(1);
    expect(row?.quarantine_reason).toContain("balance_identity_fail");
  });

  it("(b) passing unit stored with quarantined=0", async () => {
    const { res } = mockRes();
    await handlePushBctcLayout(mockReq(), res, db, VALID_PAYLOAD);

    const row = db
      .prepare<{ quarantined: number }, [string, string]>(
        "SELECT quarantined FROM bctc_layout_units WHERE report_id = ? AND unit_id = ?",
      )
      .get(REPORT_UUID, UNIT_UUID_A);
    expect(row?.quarantined).toBe(0);
  });

  // ── (c) Idempotency (AC-LFO-5) ────────────────────────────────────────────

  it("(c) two identical pushes: COUNT(*) FROM bctc_layout_units = 2 (not 4)", async () => {
    const { res: r1 } = mockRes();
    await handlePushBctcLayout(mockReq(), r1, db, VALID_PAYLOAD);

    const { res: r2, captured: cap2 } = mockRes();
    await handlePushBctcLayout(mockReq(), r2, db, VALID_PAYLOAD);

    expect(cap2.statusCode).toBe(200);

    const cnt = db
      .prepare<{ cnt: number }, [string]>(
        "SELECT COUNT(*) AS cnt FROM bctc_layout_units WHERE report_id = ?",
      )
      .get(REPORT_UUID);
    expect(cnt?.cnt).toBe(2);
  });

  it("(c) two identical pushes: COUNT(*) FROM bctc_page_zones = 2 (not 4)", async () => {
    const { res: r1 } = mockRes();
    await handlePushBctcLayout(mockReq(), r1, db, VALID_PAYLOAD);

    const { res: r2 } = mockRes();
    await handlePushBctcLayout(mockReq(), r2, db, VALID_PAYLOAD);

    const cnt = db
      .prepare<{ cnt: number }, [string]>(
        "SELECT COUNT(*) AS cnt FROM bctc_page_zones WHERE report_id = ?",
      )
      .get(REPORT_UUID);
    expect(cnt?.cnt).toBe(2);
  });

  // ── (d/e) Missing/invalid report_id → 400 ─────────────────────────────────

  it("(d) missing report_id returns 400", async () => {
    const { res, captured } = mockRes();
    const badPayload = { ...VALID_PAYLOAD, report_id: undefined } as unknown as typeof VALID_PAYLOAD;
    await handlePushBctcLayout(mockReq(), res, db, badPayload);
    expect(captured.statusCode).toBe(400);
  });

  it("(e) invalid UUID report_id returns 400", async () => {
    const { res, captured } = mockRes();
    const badPayload = { ...VALID_PAYLOAD, report_id: "not-a-uuid" };
    await handlePushBctcLayout(mockReq(), res, db, badPayload);
    expect(captured.statusCode).toBe(400);
    const resp = JSON.parse(captured.body) as { error: string };
    expect(resp.error).toContain("invalid");
  });

  // ── (f) Zero cross-table write (AC-LFO-4) ─────────────────────────────────

  it("(f) after push: bctc_table_rows has zero rows (no cross-write)", async () => {
    const { res } = mockRes();
    await handlePushBctcLayout(mockReq(), res, db, VALID_PAYLOAD);

    const cnt = db
      .prepare<{ cnt: number }, []>(
        "SELECT COUNT(*) AS cnt FROM bctc_table_rows",
      )
      .get();
    expect(cnt?.cnt).toBe(0);
  });

  it("(f) after push: bctc_balance_checks has zero rows (no cross-write)", async () => {
    const { res } = mockRes();
    await handlePushBctcLayout(mockReq(), res, db, VALID_PAYLOAD);

    const cnt = db
      .prepare<{ cnt: number }, []>(
        "SELECT COUNT(*) AS cnt FROM bctc_balance_checks",
      )
      .get();
    expect(cnt?.cnt).toBe(0);
  });

  // ── (g) DB-verified count — write-wedge detection ─────────────────────────

  it("(g) silent-noop DB — units_stored=0 (not input length)", async () => {
    const fakeDb = {
      transaction: (fn: () => void) => () => fn(),
      prepare: (sql: string) => {
        if (sql.trim().startsWith("INSERT") || sql.trim().startsWith("DELETE")) {
          return { run: (..._: unknown[]) => ({ changes: 0 }) };
        }
        if (sql.includes("COUNT(*)")) {
          return { get: (..._: unknown[]): { cnt: number } => ({ cnt: 0 }) };
        }
        return { run: (..._: unknown[]) => ({ changes: 0 }), get: (..._: unknown[]) => null };
      },
    } as unknown as Database;

    const { res, captured } = mockRes();
    await handlePushBctcLayout(mockReq(), res, fakeDb, VALID_PAYLOAD);

    expect(captured.statusCode).toBe(200);
    const resp = JSON.parse(captured.body) as { ok: boolean; units_stored: number; pages_stored: number };
    expect(resp.ok).toBe(true);
    expect(resp.units_stored).toBe(0);
    expect(resp.pages_stored).toBe(0);
  });

  // ── (h) BTB-PERSIST-FIX: idempotency with DIFFERENT unit_ids (re-extraction) ─
  // DV guard: this is the actual bug scenario — pdf-extractor emits NEW UUIDs on
  // every run. Without DELETE-before-INSERT the second push appends (dupes); with
  // DELETE-before-INSERT the second push REPLACES (count stays at 2).
  // Deliberate-violation annotation: remove the two DELETE lines in the handler →
  // this test MUST fail (count becomes 4, not 2).

  it("(h-DV) re-push with NEW unit_ids: bctc_layout_units count stays at 2 (not 4)", async () => {
    // First extraction — push VALID_PAYLOAD (2 units: UNIT_UUID_A, UNIT_UUID_B)
    const { res: r1 } = mockRes();
    await handlePushBctcLayout(mockReq(), r1, db, VALID_PAYLOAD);

    // Second extraction — pdf-extractor emits new UUIDs for the same report
    const NEW_UNIT_UUID_C = "c1c2c3c4-0000-0000-0000-000000000001";
    const NEW_UNIT_UUID_D = "c1c2c3c4-0000-0000-0000-000000000002";
    const REEXTRACTED_PAYLOAD = {
      ...VALID_PAYLOAD,
      document_map: {
        total_pages: 10,
        units: [
          { unit_id: NEW_UNIT_UUID_C, schema_page: 3, pages: [3, 4, 5], page_type: "table" },
          { unit_id: NEW_UNIT_UUID_D, schema_page: 7, pages: [7, 8], page_type: "prose" },
        ],
      },
      units: [
        {
          unit_id: NEW_UNIT_UUID_C,
          stitched_markdown: "| col_0 | col_1 |\n|---|---|\n| A | 200 |",
          row_count: 1,
          quarantined: false,
          quarantine_reason: null,
        },
        {
          unit_id: NEW_UNIT_UUID_D,
          stitched_markdown: "",
          row_count: 0,
          quarantined: false,
          quarantine_reason: null,
        },
      ],
      page_zones: [
        {
          page_number: 3,
          unit_id: NEW_UNIT_UUID_C,
          page_type: "table",
          is_schema_page: true,
          is_continuation_page: false,
          schema_inherited_from_page: null,
          zones: ZONES_PAGE_3,
        },
        {
          page_number: 5,
          unit_id: NEW_UNIT_UUID_C,
          page_type: "table",
          is_schema_page: false,
          is_continuation_page: true,
          schema_inherited_from_page: 3,
          zones: ZONES_PAGE_5,
        },
      ],
    };

    const { res: r2, captured: cap2 } = mockRes();
    await handlePushBctcLayout(mockReq(), r2, db, REEXTRACTED_PAYLOAD);
    expect(cap2.statusCode).toBe(200);

    const cnt = db
      .prepare<{ cnt: number }, [string]>(
        "SELECT COUNT(*) AS cnt FROM bctc_layout_units WHERE report_id = ?",
      )
      .get(REPORT_UUID);
    // Must be 2 (REPLACED), not 4 (APPENDED).
    // Without DELETE-before-INSERT: count=4 → test fails → DV proven-red.
    expect(cnt?.cnt).toBe(2);
  });

  it("(h-DV) re-push with NEW unit_ids: old unit_ids no longer present in DB", async () => {
    // First push: UNIT_UUID_A and UNIT_UUID_B enter DB
    const { res: r1 } = mockRes();
    await handlePushBctcLayout(mockReq(), r1, db, VALID_PAYLOAD);

    // Verify first push stored the original UUIDs
    const firstPush = db
      .prepare<{ unit_id: string }, [string]>(
        "SELECT unit_id FROM bctc_layout_units WHERE report_id = ?",
      )
      .all(REPORT_UUID);
    expect(firstPush.map((r) => r.unit_id)).toContain(UNIT_UUID_A);

    // Second push: fresh UUIDs (simulating re-extraction)
    const NEW_UNIT_UUID_E = "e1e2e3e4-0000-0000-0000-000000000001";
    const REPUSH = {
      ...VALID_PAYLOAD,
      document_map: {
        total_pages: 10,
        units: [
          { unit_id: NEW_UNIT_UUID_E, schema_page: 3, pages: [3], page_type: "table" },
        ],
      },
      units: [
        { unit_id: NEW_UNIT_UUID_E, stitched_markdown: "", row_count: 0, quarantined: false, quarantine_reason: null },
      ],
      page_zones: [
        { page_number: 3, unit_id: NEW_UNIT_UUID_E, page_type: "table", is_schema_page: true, is_continuation_page: false, schema_inherited_from_page: null, zones: ZONES_PAGE_3 },
      ],
    };

    const { res: r2 } = mockRes();
    await handlePushBctcLayout(mockReq(), r2, db, REPUSH);

    // Old UUID must be gone — DELETE-before-INSERT removed it.
    // Without DELETE-before-INSERT: old UUID still present → test fails.
    const afterRepush = db
      .prepare<{ unit_id: string }, [string]>(
        "SELECT unit_id FROM bctc_layout_units WHERE report_id = ?",
      )
      .all(REPORT_UUID);
    expect(afterRepush.map((r) => r.unit_id)).not.toContain(UNIT_UUID_A);
    expect(afterRepush.map((r) => r.unit_id)).toContain(NEW_UNIT_UUID_E);
  });

  // ── (i) Prose persistence (BTB-PERSIST-FIX BLOCKING-2) ────────────────────
  // The mcp-server handler must persist prose units (page_type="prose") exactly
  // as received. The page_type comes from document_map.units[].page_type.
  // Deliberate-violation annotation: if the handler filters units where
  // page_type != "table" (or defaults page_type to "table" always) → this
  // test MUST fail (no prose row found).

  it("(i) prose unit in payload: page_type='prose' row stored in DB", async () => {
    const { res } = mockRes();
    // VALID_PAYLOAD already has UNIT_UUID_B with page_type="prose" in document_map
    await handlePushBctcLayout(mockReq(), res, db, VALID_PAYLOAD);

    const row = db
      .prepare<{ page_type: string }, [string, string]>(
        "SELECT page_type FROM bctc_layout_units WHERE report_id = ? AND unit_id = ?",
      )
      .get(REPORT_UUID, UNIT_UUID_B);
    // Must be 'prose'. If handler defaults to 'table' → test fails → DV proven-red.
    expect(row?.page_type).toBe("prose");
  });

  it("(i) prose unit count: at least 1 prose row stored per extraction", async () => {
    const { res } = mockRes();
    await handlePushBctcLayout(mockReq(), res, db, VALID_PAYLOAD);

    const proseCnt = db
      .prepare<{ cnt: number }, [string]>(
        "SELECT COUNT(*) AS cnt FROM bctc_layout_units WHERE report_id = ? AND page_type = 'prose'",
      )
      .get(REPORT_UUID);
    expect(proseCnt?.cnt).toBeGreaterThanOrEqual(1);
  });

  it("(i-DV) prose unit survives re-push with fresh unit_ids", async () => {
    // Simulate re-extraction: new UUIDs, prose unit still in document_map
    const NEW_TABLE_UUID = "f1f2f3f4-0000-0000-0000-000000000001";
    const NEW_PROSE_UUID = "f1f2f3f4-0000-0000-0000-000000000002";
    const REPUSH_WITH_PROSE = {
      ...VALID_PAYLOAD,
      document_map: {
        total_pages: 10,
        units: [
          { unit_id: NEW_TABLE_UUID, schema_page: 3, pages: [3], page_type: "table" },
          { unit_id: NEW_PROSE_UUID, schema_page: 10, pages: [10], page_type: "prose" },
        ],
      },
      units: [
        { unit_id: NEW_TABLE_UUID, stitched_markdown: "| A | B |", row_count: 1, quarantined: false, quarantine_reason: null },
        { unit_id: NEW_PROSE_UUID, stitched_markdown: "", row_count: 0, quarantined: false, quarantine_reason: null },
      ],
      page_zones: [
        { page_number: 3, unit_id: NEW_TABLE_UUID, page_type: "table", is_schema_page: true, is_continuation_page: false, schema_inherited_from_page: null, zones: ZONES_PAGE_3 },
      ],
    };

    const { res } = mockRes();
    await handlePushBctcLayout(mockReq(), res, db, REPUSH_WITH_PROSE);

    const proseRow = db
      .prepare<{ unit_id: string; page_type: string }, [string]>(
        "SELECT unit_id, page_type FROM bctc_layout_units WHERE report_id = ? AND page_type = 'prose'",
      )
      .get(REPORT_UUID);
    expect(proseRow).not.toBeNull();
    expect(proseRow?.unit_id).toBe(NEW_PROSE_UUID);
  });

  // ── missing arrays → 400 ──────────────────────────────────────────────────

  it("missing units array returns 400", async () => {
    const { res, captured } = mockRes();
    const badPayload = { ...VALID_PAYLOAD, units: undefined } as unknown as typeof VALID_PAYLOAD;
    await handlePushBctcLayout(mockReq(), res, db, badPayload);
    expect(captured.statusCode).toBe(400);
  });

  it("missing page_zones array returns 400", async () => {
    const { res, captured } = mockRes();
    const badPayload = { ...VALID_PAYLOAD, page_zones: undefined } as unknown as typeof VALID_PAYLOAD;
    await handlePushBctcLayout(mockReq(), res, db, badPayload);
    expect(captured.statusCode).toBe(400);
  });
});
