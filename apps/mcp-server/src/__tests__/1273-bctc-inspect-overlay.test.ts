/**
 * LF-OVERLAY test 1273 — handleBctcInspectZones
 *
 * Tests GET /api/bctc-inspect/zones/{doc_id}?page=N (AC-LFO-1, AC-LFO-2):
 *   (a) Returns zones_json from bctc_page_zones with positional col_id values
 *   (b) Returns 404 when no zone data is found for the given page
 *   (c) Returns 400 for invalid UUID doc_id
 *   (d) Handler does NOT call pdf-extractor (pure DB read, verified by import grep)
 *   (e) col_id values are positional (col_0/col_1 pattern) — no BCTC semantic labels
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
import { handleBctcInspectZones } from "../interface/mcp/routes/bctcInspectHandler.js";
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

function mockReqWithPage(pageNum: number): IncomingMessage {
  return {
    url: `/api/bctc-inspect/zones/x?page=${pageNum}`,
  } as unknown as IncomingMessage;
}

// ── Fixture ────────────────────────────────────────────────────────────────────

const REPORT_UUID = "e8ea3df5-3f32-413d-a3eb-c71634c0438d";
const UNIT_UUID   = "a1b2c3d4-0000-0000-0000-000000000001";

const ZONES_P3 = {
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
  ],
  unit_hints: [],
  unit_boundary_after_page: false,
};

const SEED_PAYLOAD = {
  report_id: REPORT_UUID,
  document_map: {
    total_pages: 6,
    units: [
      { unit_id: UNIT_UUID, schema_page: 3, pages: [3, 4, 5], page_type: "table" },
    ],
  },
  units: [
    {
      unit_id: UNIT_UUID,
      stitched_markdown: "| col_0 |\n|---|\n| A |",
      row_count: 1,
      quarantined: false,
      quarantine_reason: null,
    },
  ],
  page_zones: [
    {
      page_number: 3,
      unit_id: UNIT_UUID,
      page_type: "table",
      is_schema_page: true,
      is_continuation_page: false,
      schema_inherited_from_page: null,
      zones: ZONES_P3,
    },
    {
      page_number: 5,
      unit_id: UNIT_UUID,
      page_type: "table",
      is_schema_page: false,
      is_continuation_page: true,
      schema_inherited_from_page: 3,
      zones: { ...ZONES_P3, unit_boundary_after_page: true },
    },
  ],
  pass_rate_report: null,
};

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("1273 — handleBctcInspectZones", () => {
  let db: Database;

  beforeAll(() => {
    const dbPath = Bun.env["DB_PATH"] ?? "";
    assertNotProductionDb(dbPath);
    if (dbPath !== ":memory:") {
      throw new Error(`[MZH-2 guard] DB_PATH must be :memory: in test suite, got: "${dbPath}"`);
    }
  });

  beforeEach(async () => {
    db = openTestDb();
    // Seed zone data via the push handler (tests the read side against real DB state)
    const { res } = mockRes();
    await handlePushBctcLayout({} as IncomingMessage, res, db, SEED_PAYLOAD);
  });

  afterEach(() => {
    db.close();
  });

  // ── (a) Returns zones_json with positional col_id values ──────────────────

  it("(a) GET zones for page 3 returns 200 with zones data", () => {
    const { res, captured } = mockRes();
    handleBctcInspectZones(mockReqWithPage(3), res, db, REPORT_UUID);

    expect(captured.statusCode).toBe(200);
    const data = JSON.parse(captured.body) as {
      report_id: string;
      page_number: number;
      zones: { column_gutters: { col_id: string }[] };
    };
    expect(data.report_id).toBe(REPORT_UUID);
    expect(data.page_number).toBe(3);
    expect(Array.isArray(data.zones.column_gutters)).toBe(true);
  });

  it("(a) response includes is_schema_page=true for page 3", () => {
    const { res, captured } = mockRes();
    handleBctcInspectZones(mockReqWithPage(3), res, db, REPORT_UUID);

    const data = JSON.parse(captured.body) as { is_schema_page: boolean };
    expect(data.is_schema_page).toBe(true);
  });

  it("(a) response includes is_continuation_page=true for page 5", () => {
    const { res, captured } = mockRes();
    handleBctcInspectZones(mockReqWithPage(5), res, db, REPORT_UUID);

    const data = JSON.parse(captured.body) as { is_continuation_page: boolean };
    expect(data.is_continuation_page).toBe(true);
  });

  it("(a) response schema_inherited_from_page=3 for page 5", () => {
    const { res, captured } = mockRes();
    handleBctcInspectZones(mockReqWithPage(5), res, db, REPORT_UUID);

    const data = JSON.parse(captured.body) as { schema_inherited_from_page: number | null };
    expect(data.schema_inherited_from_page).toBe(3);
  });

  // ── (e) AC-LFO-0/AC-LFO-1: col_id values are positional — no semantic labels ─

  it("(e) col_id values match positional col_0/col_1 pattern — no BCTC semantic labels", () => {
    const { res, captured } = mockRes();
    handleBctcInspectZones(mockReqWithPage(3), res, db, REPORT_UUID);

    const data = JSON.parse(captured.body) as {
      zones: { column_gutters: { col_id: string }[] };
    };
    for (const col of data.zones.column_gutters) {
      // Must match col_N positional pattern
      expect(col.col_id).toMatch(/^col_\d+$/);
      // Must NOT contain BCTC semantic labels
      expect(col.col_id).not.toMatch(/ma.so|thuyet.minh|so.cuoi|so.dau/i);
    }
  });

  // ── (b) Returns 404 when no zone data found ────────────────────────────────

  it("(b) page with no zone data returns 404", () => {
    const { res, captured } = mockRes();
    handleBctcInspectZones(mockReqWithPage(99), res, db, REPORT_UUID);

    expect(captured.statusCode).toBe(404);
    const body = JSON.parse(captured.body) as { error: string };
    expect(body.error).toBe("zone_not_found");
  });

  it("(b) non-existent report_id returns 404", () => {
    const { res, captured } = mockRes();
    handleBctcInspectZones(mockReqWithPage(3), res, db, "11111111-1111-1111-1111-111111111111");

    expect(captured.statusCode).toBe(404);
  });

  // ── (c) Returns 400 for invalid UUID ─────────────────────────────────────

  it("(c) invalid UUID doc_id returns 400", () => {
    const { res, captured } = mockRes();
    handleBctcInspectZones(mockReqWithPage(3), res, db, "not-a-uuid");

    expect(captured.statusCode).toBe(400);
    const body = JSON.parse(captured.body) as { error: string };
    expect(body.error).toContain("invalid");
  });

  // ── (d) Pure DB read — no pdf-extractor dependency in the handler ────────
  // This is grep-auditable: the handler file must not import pdf-extractor.
  // The test validates behavior, not file contents (import is a compile-time check).
  // The AC-LFO-2 grep audit is:
  //   grep -rn "from.*pdf.extractor|import.*pdf.extractor|pdf_extractor" bctcInspectHandler.ts
  // Here we confirm the handler responds correctly using only DB data.

  it("(d) handler returns zones from DB without any pdf-extractor call (pure read)", async () => {
    // Seed another page via direct DB insert (bypassing push handler) to confirm
    // the zones endpoint only reads from bctc_page_zones
    db.prepare(`
      INSERT INTO bctc_page_zones
        (report_id, page_number, unit_id, page_type, is_schema_page, is_continuation_page,
         schema_inherited_from_page, zones_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      REPORT_UUID, 4, UNIT_UUID, "table", 0, 1, 3,
      JSON.stringify({ image_width_px: 2338, image_height_px: 3308,
        column_gutters: [{ col_id: "col_0", x_min: 0, x_max: 460 }] }),
    );

    const { res, captured } = mockRes();
    handleBctcInspectZones(mockReqWithPage(4), res, db, REPORT_UUID);

    expect(captured.statusCode).toBe(200);
    const data = JSON.parse(captured.body) as {
      page_number: number;
      zones: { column_gutters: { col_id: string }[] };
    };
    expect(data.page_number).toBe(4);
    expect(data.zones.column_gutters[0]?.col_id).toBe("col_0");
  });
});
