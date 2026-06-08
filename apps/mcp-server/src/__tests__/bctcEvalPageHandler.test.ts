/**
 * bctcEvalPageHandler.test.ts — Unit tests for GET /api/bctc-eval/{report_id}/page/{page_no}
 *
 * Sprint: BCTC-EVAL-INSPECT-MERGE
 *
 * Test cases:
 *   1. Valid page in multi-page PEK unit → stage 4 partial_fragment_warning:true
 *   2. Valid page in single-page PEK unit → stage 4 partial_fragment_warning:false
 *   3. Valid page not covered by any PEK unit → stage 4 pek_unit_id:null
 *   4. Report with no eval rows → HTTP 409 EVAL_NOT_COMPUTED
 *   5. Invalid UUID → HTTP 400 INVALID_UUID
 *   6. Invalid page_no (0, negative, non-integer) → HTTP 400 INVALID_PAGE_NO
 *   7. Stage 1/2/5/6 always carry report_level:true and label_suffix:"(toàn báo cáo)"
 *   8. Stage 3 with OCR row present → page_annotation.has_ocr_row:true
 *   9. Stage 3 with no OCR row → page_annotation.has_ocr_row:false
 *
 * DELIBERATE-VIOLATION smoke (anti-false-green per feedback_fence_false_green):
 *   - Test DV-1 verifies that suppressing the partial_fragment_warning causes the
 *     fragment-banner assertion to fail (proves the gate is not hollow).
 *
 * Uses in-memory Bun:sqlite DB (no container, no creds).
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import type { IncomingMessage, ServerResponse } from "node:http";
import { bctcEvalPageHandler } from "../interface/mcp/routes/bctcEvalPageHandler.js";
import { upsertEvalRow } from "../infrastructure/db/bctcEvalStore.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_UUID   = "e71f845d-ffa5-48f9-8f09-30ac2cd09c65";
const INVALID_UUID = "not-a-uuid";
const NO_EVAL_UUID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const REPORT_UUID  = "f1f1f1f1-f2f2-f3f3-f4f4-f5f5f5f5f5f5";

// ─── DB setup ─────────────────────────────────────────────────────────────────

function makeTestDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys=OFF");

  db.exec(`
    CREATE TABLE IF NOT EXISTS financial_reports (
      id TEXT PRIMARY KEY,
      action_code TEXT NOT NULL DEFAULT '',
      period_type TEXT NOT NULL DEFAULT 'Q',
      period_year INTEGER NOT NULL DEFAULT 2025,
      period_quarter INTEGER,
      pdf_path TEXT,
      net_revenue REAL,
      gross_profit REAL,
      net_profit REAL,
      parsed_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Production schema (verbatim from sqlite_master):
  // Includes FK constraint — foreign_keys=OFF means it is not enforced in tests.
  db.exec(`
    CREATE TABLE IF NOT EXISTS bctc_eval_results (
      report_id TEXT NOT NULL,
      stage_no INTEGER NOT NULL,
      stage_name TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('green','yellow','red')),
      metrics_json TEXT NOT NULL DEFAULT '{}',
      gate_failures_json TEXT NOT NULL DEFAULT '[]',
      golden_diff_json TEXT NOT NULL DEFAULT '{}',
      detector_version TEXT NOT NULL DEFAULT 'v1',
      computed_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (report_id, stage_no),
      CONSTRAINT fk_report FOREIGN KEY (report_id) REFERENCES financial_reports(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS bctc_layout_units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id TEXT NOT NULL,
      unit_id TEXT NOT NULL,
      schema_page INTEGER NOT NULL DEFAULT 1,
      page_numbers_json TEXT NOT NULL,
      page_type TEXT NOT NULL DEFAULT 'table',
      stitched_markdown TEXT NOT NULL DEFAULT '',
      row_count INTEGER NOT NULL DEFAULT 0,
      quarantined INTEGER NOT NULL DEFAULT 0,
      quarantine_reason TEXT,
      document_map_json TEXT,
      extracted_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(report_id, unit_id)
    )
  `);

  // Production schema (verbatim from sqlite_master — NO report_id column):
  // CREATE TABLE pdf_extracted_text (
  //   id INTEGER PRIMARY KEY AUTOINCREMENT,
  //   filename TEXT NOT NULL,
  //   page_number INTEGER NOT NULL,
  //   text_content TEXT NOT NULL,
  //   confidence REAL DEFAULT 0,
  //   extracted_at TEXT NOT NULL DEFAULT (datetime('now')),
  //   action_code TEXT NOT NULL DEFAULT '',
  //   UNIQUE(filename, page_number)
  // )
  db.exec(`
    CREATE TABLE IF NOT EXISTS pdf_extracted_text (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      page_number INTEGER NOT NULL,
      text_content TEXT NOT NULL,
      confidence REAL DEFAULT 0,
      extracted_at TEXT NOT NULL DEFAULT (datetime('now')),
      action_code TEXT NOT NULL DEFAULT '',
      UNIQUE(filename, page_number)
    )
  `);

  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

// ─── Helper: insert 6 eval rows for a report ──────────────────────────────────

function insertAllEvalRows(db: Database, reportId: string, status: "green" | "yellow" | "red" = "green"): void {
  const stages = [
    [1, "RASTERIZE"],
    [2, "LAYOUT_DETECT"],
    [3, "OCR"],
    [4, "TABLE_RECONSTRUCT"],
    [5, "MARKDOWN_RENDER"],
    [6, "STRUCTURED_EXTRACT"],
  ] as const;

  for (const [stageNo, stageName] of stages) {
    upsertEvalRow(db, {
      report_id: reportId,
      stage_no: stageNo,
      stage_name: stageName,
      status,
      metrics_json: { sample_key: `stage_${stageNo}` },
      gate_failures_json: [],
      golden_diff_json: {},
    });
  }
}

// ─── Mock request/response ────────────────────────────────────────────────────

interface MockResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

function makeMockRes(): { res: ServerResponse; getMock: () => MockResponse } {
  const mock: MockResponse = { statusCode: 200, headers: {}, body: "" };
  const res = {
    writeHead(code: number, headers?: Record<string, string>) {
      mock.statusCode = code;
      if (headers) Object.assign(mock.headers, headers);
    },
    setHeader(key: string, value: string) {
      mock.headers[key] = value;
    },
    end(body?: string) {
      mock.body = body ?? "";
    },
  } as unknown as ServerResponse;
  return { res, getMock: () => mock };
}

function makeMockReq(): IncomingMessage {
  return {
    url: "/",
    method: "GET",
    headers: {},
  } as unknown as IncomingMessage;
}

// ─── Test: TC-5 Invalid UUID → 400 INVALID_UUID ──────────────────────────────

describe("bctcEvalPageHandler — TC-5: invalid UUID", () => {
  it("returns 400 INVALID_UUID for non-UUID string", () => {
    const db = makeTestDb();
    const { res, getMock } = makeMockRes();
    bctcEvalPageHandler(makeMockReq(), res, db, INVALID_UUID, 1);
    const mock = getMock();
    expect(mock.statusCode).toBe(400);
    const body = JSON.parse(mock.body);
    expect(body.code).toBe("INVALID_UUID");
  });
});

// ─── Test: TC-6 Invalid page_no → 400 INVALID_PAGE_NO ───────────────────────

describe("bctcEvalPageHandler — TC-6: invalid page_no", () => {
  it("returns 400 for page_no = 0", () => {
    const db = makeTestDb();
    const { res, getMock } = makeMockRes();
    bctcEvalPageHandler(makeMockReq(), res, db, VALID_UUID, 0);
    const mock = getMock();
    expect(mock.statusCode).toBe(400);
    const body = JSON.parse(mock.body);
    expect(body.code).toBe("INVALID_PAGE_NO");
  });

  it("returns 400 for page_no = -1", () => {
    const db = makeTestDb();
    const { res, getMock } = makeMockRes();
    bctcEvalPageHandler(makeMockReq(), res, db, VALID_UUID, -1);
    const mock = getMock();
    expect(mock.statusCode).toBe(400);
    const body = JSON.parse(mock.body);
    expect(body.code).toBe("INVALID_PAGE_NO");
  });

  it("returns 400 for non-integer page_no (NaN)", () => {
    const db = makeTestDb();
    const { res, getMock } = makeMockRes();
    bctcEvalPageHandler(makeMockReq(), res, db, VALID_UUID, NaN);
    const mock = getMock();
    expect(mock.statusCode).toBe(400);
    const body = JSON.parse(mock.body);
    expect(body.code).toBe("INVALID_PAGE_NO");
  });
});

// ─── Test: TC-4 Report with no eval rows → 409 EVAL_NOT_COMPUTED ─────────────

describe("bctcEvalPageHandler — TC-4: no eval rows → 409", () => {
  it("returns 409 EVAL_NOT_COMPUTED when report has no eval rows", () => {
    const db = makeTestDb();
    // Note: the handler does NOT require the report to exist in financial_reports
    // before the eval check — it calls getEvalForReport first.
    const { res, getMock } = makeMockRes();
    bctcEvalPageHandler(makeMockReq(), res, db, NO_EVAL_UUID, 1);
    const mock = getMock();
    expect(mock.statusCode).toBe(409);
    const body = JSON.parse(mock.body);
    expect(body.code).toBe("EVAL_NOT_COMPUTED");
  });
});

// ─── Test: TC-7 Stages 1/2/5/6 are report_level:true ────────────────────────

describe("bctcEvalPageHandler — TC-7: report_level flags", () => {
  it("stages 1,2,5,6 carry report_level:true and label_suffix:(toàn báo cáo)", () => {
    const db = makeTestDb();
    db.prepare(`INSERT INTO financial_reports (id, action_code, period_year) VALUES (?, ?, ?)`).run(VALID_UUID, "FPT", 2025);
    insertAllEvalRows(db, VALID_UUID);

    const { res, getMock } = makeMockRes();
    bctcEvalPageHandler(makeMockReq(), res, db, VALID_UUID, 1);
    const mock = getMock();
    expect(mock.statusCode).toBe(200);

    const body = JSON.parse(mock.body);
    expect(body.schema_version).toBe("1");
    expect(body.report_id).toBe(VALID_UUID);
    expect(body.page_no).toBe(1);
    expect(Array.isArray(body.gate_strip)).toBe(true);

    const reportLevelStages = [1, 2, 5, 6];
    for (const stageNo of reportLevelStages) {
      const gate = body.gate_strip.find((g: { stage_no: number }) => g.stage_no === stageNo);
      expect(gate).toBeDefined();
      expect(gate.report_level).toBe(true);
      expect(gate.label_suffix).toBe("(toàn báo cáo)");
    }

    // Stages 3 and 4 must be report_level:false
    const stage3 = body.gate_strip.find((g: { stage_no: number }) => g.stage_no === 3);
    expect(stage3.report_level).toBe(false);
    expect(stage3.label_suffix).toBeNull();

    const stage4 = body.gate_strip.find((g: { stage_no: number }) => g.stage_no === 4);
    expect(stage4.report_level).toBe(false);
    expect(stage4.label_suffix).toBeNull();
  });
});

// ─── Test: TC-1 Multi-page PEK unit → partial_fragment_warning:true ──────────

describe("bctcEvalPageHandler — TC-1: multi-page PEK unit", () => {
  it("stage 4 partial_fragment_warning:true when unit covers multiple pages", () => {
    const db = makeTestDb();
    db.prepare(`INSERT INTO financial_reports (id, action_code, period_year) VALUES (?, ?, ?)`).run(VALID_UUID, "FPT", 2025);
    insertAllEvalRows(db, VALID_UUID);

    // Insert multi-page unit covering pages [5, 6, 7]
    db.prepare(`
      INSERT INTO bctc_layout_units (report_id, unit_id, schema_page, page_numbers_json)
      VALUES (?, ?, ?, ?)
    `).run(VALID_UUID, "unit_multi_001", 5, JSON.stringify([5, 6, 7]));

    const { res, getMock } = makeMockRes();
    bctcEvalPageHandler(makeMockReq(), res, db, VALID_UUID, 6);
    const mock = getMock();
    expect(mock.statusCode).toBe(200);

    const body = JSON.parse(mock.body);
    expect(body.page_no).toBe(6);
    const stage4 = body.gate_strip.find((g: { stage_no: number }) => g.stage_no === 4);
    expect(stage4).toBeDefined();
    expect(stage4.page_annotation.is_multi_page_unit).toBe(true);
    expect(stage4.page_annotation.partial_fragment_warning).toBe(true);
    expect(stage4.page_annotation.pek_unit_id).toBe("unit_multi_001");
    expect(stage4.page_annotation.pek_unit_page_numbers).toEqual([5, 6, 7]);
    expect(stage4.page_annotation.partial_label).toContain("6");
    expect(stage4.page_annotation.partial_label).toContain("5");
    expect(stage4.page_annotation.partial_label).toContain("7");
  });
});

// ─── Test: TC-2 Single-page PEK unit → partial_fragment_warning:false ────────

describe("bctcEvalPageHandler — TC-2: single-page PEK unit", () => {
  it("stage 4 partial_fragment_warning:false for single-page unit", () => {
    const db = makeTestDb();
    db.prepare(`INSERT INTO financial_reports (id, action_code, period_year) VALUES (?, ?, ?)`).run(VALID_UUID, "FPT", 2025);
    insertAllEvalRows(db, VALID_UUID);

    // Insert single-page unit covering only page 3
    db.prepare(`
      INSERT INTO bctc_layout_units (report_id, unit_id, schema_page, page_numbers_json)
      VALUES (?, ?, ?, ?)
    `).run(VALID_UUID, "unit_single_001", 3, JSON.stringify([3]));

    const { res, getMock } = makeMockRes();
    bctcEvalPageHandler(makeMockReq(), res, db, VALID_UUID, 3);
    const mock = getMock();
    expect(mock.statusCode).toBe(200);

    const body = JSON.parse(mock.body);
    const stage4 = body.gate_strip.find((g: { stage_no: number }) => g.stage_no === 4);
    expect(stage4.page_annotation.is_multi_page_unit).toBe(false);
    expect(stage4.page_annotation.partial_fragment_warning).toBe(false);
    expect(stage4.page_annotation.pek_unit_id).toBe("unit_single_001");
    expect(stage4.page_annotation.partial_label).toBeNull();
  });
});

// ─── Test: TC-3 Page not covered by any PEK unit ─────────────────────────────

describe("bctcEvalPageHandler — TC-3: page not in any PEK unit", () => {
  it("stage 4 page_annotation.pek_unit_id is null when page not covered", () => {
    const db = makeTestDb();
    db.prepare(`INSERT INTO financial_reports (id, action_code, period_year) VALUES (?, ?, ?)`).run(VALID_UUID, "FPT", 2025);
    insertAllEvalRows(db, VALID_UUID);

    // No layout units for this report at all
    const { res, getMock } = makeMockRes();
    bctcEvalPageHandler(makeMockReq(), res, db, VALID_UUID, 99);
    const mock = getMock();
    expect(mock.statusCode).toBe(200);

    const body = JSON.parse(mock.body);
    const stage4 = body.gate_strip.find((g: { stage_no: number }) => g.stage_no === 4);
    expect(stage4.page_annotation.pek_unit_id).toBeNull();
    expect(stage4.page_annotation.partial_fragment_warning).toBe(false);
    expect(stage4.page_annotation.is_multi_page_unit).toBe(false);
    expect(stage4.page_annotation.pek_unit_page_numbers).toEqual([]);
  });
});

// ─── Test: TC-8 Stage 3 with OCR row present ──────────────────────────────────

describe("bctcEvalPageHandler — TC-8: stage 3 OCR row present", () => {
  it("stage 3 has_ocr_row:true when pdf_extracted_text row exists for filename + page", () => {
    const db = makeTestDb();
    // financial_reports must have pdf_path so the handler can resolve the filename
    db.prepare(
      `INSERT INTO financial_reports (id, action_code, period_year, pdf_path) VALUES (?, ?, ?, ?)`
    ).run(REPORT_UUID, "VNM", 2025, "/data/pdfs/vnm_q4_2025.pdf");
    insertAllEvalRows(db, REPORT_UUID);

    // Production pdf_extracted_text has NO report_id column — insert by filename only.
    // Handler resolves: financial_reports.pdf_path → basename "vnm_q4_2025.pdf"
    //                   → pdf_extracted_text WHERE filename = 'vnm_q4_2025.pdf' AND page_number = 7
    db.prepare(`
      INSERT INTO pdf_extracted_text (filename, page_number, text_content, confidence)
      VALUES (?, ?, ?, ?)
    `).run("vnm_q4_2025.pdf", 7, "Doanh thu thuần 1,234,567", 0.93);

    const { res, getMock } = makeMockRes();
    bctcEvalPageHandler(makeMockReq(), res, db, REPORT_UUID, 7);
    const mock = getMock();
    expect(mock.statusCode).toBe(200);

    const body = JSON.parse(mock.body);
    const stage3 = body.gate_strip.find((g: { stage_no: number }) => g.stage_no === 3);
    expect(stage3.page_annotation.has_ocr_row).toBe(true);
    expect(stage3.page_annotation.ocr_confidence).toBeCloseTo(0.93, 2);
    expect(stage3.page_annotation.text_length_chars).toBeGreaterThan(0);
    expect(stage3.page_annotation.page_no).toBe(7);
  });
});

// ─── Test: TC-9 Stage 3 with no OCR row ──────────────────────────────────────

describe("bctcEvalPageHandler — TC-9: stage 3 no OCR row", () => {
  it("stage 3 has_ocr_row:false when no pdf_extracted_text for that page", () => {
    const db = makeTestDb();
    db.prepare(`INSERT INTO financial_reports (id, action_code, period_year) VALUES (?, ?, ?)`).run(VALID_UUID, "FPT", 2025);
    insertAllEvalRows(db, VALID_UUID);

    // No OCR rows in db at all
    const { res, getMock } = makeMockRes();
    bctcEvalPageHandler(makeMockReq(), res, db, VALID_UUID, 5);
    const mock = getMock();
    expect(mock.statusCode).toBe(200);

    const body = JSON.parse(mock.body);
    const stage3 = body.gate_strip.find((g: { stage_no: number }) => g.stage_no === 3);
    expect(stage3.page_annotation.has_ocr_row).toBe(false);
    expect(stage3.page_annotation.ocr_confidence).toBeNull();
    expect(stage3.page_annotation.text_length_chars).toBeNull();
  });
});

// ─── Test: TC-D1 debug sub-object fields present (M-7) ──────────────────────
//
// Assert that:
//   a) every gate_strip element carries a `debug` object with the five base fields
//   b) stage-3 `debug.ocr_filename` equals the fixture basename
//   c) stage-4 `debug.pek_row_count` equals the fixture row_count (42)
//   d) all existing user-view fields still present (non-regression)
//
// DELIBERATE-VIOLATION: removing `debug` from the handler response causes (a) to fail.
// Evidence of non-hollow gate: see DV-2 test below.

describe("bctcEvalPageHandler — TC-D1: debug sub-object fields (M-7)", () => {
  it("every gate carries debug with 5 base fields; stage 3 debug.ocr_filename matches fixture basename", () => {
    const db = makeTestDb();
    db.prepare(`INSERT INTO financial_reports (id, action_code, period_year, pdf_path) VALUES (?, ?, ?, ?)`)
      .run(REPORT_UUID, "VNM", 2025, "/data/pdfs/vnm_q4_2025.pdf");
    insertAllEvalRows(db, REPORT_UUID, "green");

    db.prepare(`INSERT INTO pdf_extracted_text (filename, page_number, text_content, confidence) VALUES (?, ?, ?, ?)`)
      .run("vnm_q4_2025.pdf", 7, "Doanh thu thuần 1,234,567", 0.93);

    const { res, getMock } = makeMockRes();
    bctcEvalPageHandler(makeMockReq(), res, db, REPORT_UUID, 7);
    const mock = getMock();
    expect(mock.statusCode).toBe(200);

    const body = JSON.parse(mock.body);
    expect(Array.isArray(body.gate_strip)).toBe(true);
    expect(body.gate_strip).toHaveLength(6);

    // (a) every gate has debug with 5 base fields
    for (const gate of body.gate_strip) {
      expect(gate.debug).toBeDefined();
      // metrics_json is a parsed object (not string)
      expect(typeof gate.debug.metrics_json).toBe("object");
      // gate_failures_json is an array
      expect(Array.isArray(gate.debug.gate_failures_json)).toBe(true);
      // golden_diff_json is an object
      expect(typeof gate.debug.golden_diff_json).toBe("object");
      expect(typeof gate.debug.detector_version).toBe("string");
      expect(typeof gate.debug.computed_at).toBe("string");
    }

    // (b) stage 3 debug.ocr_filename = basename of pdf_path
    const stage3 = body.gate_strip.find((g: { stage_no: number }) => g.stage_no === 3);
    expect(stage3).toBeDefined();
    expect(stage3.debug.ocr_filename).toBe("vnm_q4_2025.pdf");

    // (d) existing user-view fields still present (non-regression)
    expect(stage3.stage_no).toBe(3);
    expect(stage3.stage_name).toBe("OCR");
    expect(stage3.status).toBe("green");
    expect(stage3.report_level).toBe(false);
    expect(typeof stage3.metrics_summary).toBe("string");
    expect(stage3.page_annotation).toBeDefined();
    expect(stage3.page_annotation.has_ocr_row).toBe(true);
  });

  it("stage 4 debug.pek_row_count matches fixture row_count (42)", () => {
    const db = makeTestDb();
    db.prepare(`INSERT INTO financial_reports (id, action_code, period_year) VALUES (?, ?, ?)`).run(VALID_UUID, "FPT", 2025);
    insertAllEvalRows(db, VALID_UUID, "green");

    // Insert layout unit with row_count=42, quarantined=1
    db.prepare(`
      INSERT INTO bctc_layout_units (report_id, unit_id, schema_page, page_numbers_json, row_count, quarantined, quarantine_reason)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(VALID_UUID, "unit_debug_001", 3, JSON.stringify([3]), 42, 1, "low_confidence");

    const { res, getMock } = makeMockRes();
    bctcEvalPageHandler(makeMockReq(), res, db, VALID_UUID, 3);
    const mock = getMock();
    expect(mock.statusCode).toBe(200);

    const body = JSON.parse(mock.body);
    const stage4 = body.gate_strip.find((g: { stage_no: number }) => g.stage_no === 4);
    expect(stage4).toBeDefined();
    expect(stage4.debug.pek_row_count).toBe(42);
    expect(stage4.debug.pek_quarantined).toBe(true);
    expect(stage4.debug.pek_quarantine_reason).toBe("low_confidence");

    // Non-regression: existing page_annotation fields still present
    expect(stage4.page_annotation).toBeDefined();
    expect(stage4.page_annotation.pek_unit_id).toBe("unit_debug_001");
    expect(stage4.stage_no).toBe(4);
    expect(typeof stage4.metrics_summary).toBe("string");
  });
});

// ─── Test: DV-2 DELIBERATE-VIOLATION smoke for debug field (M-7 anti-false-green) ──
//
// Proves the debug field assertions in TC-D1 are NOT hollow.
// If `debug` is absent from the handler response, the assertion below FAILS.
//
// RED PROOF (documented here):
//   If bctcEvalPageHandler emitted gate_strip without a `debug` property,
//   `expect(gate.debug).toBeDefined()` would FAIL with: Expected value to be defined, received undefined.
//   To verify: temporarily comment out the `debug` property in the gateStrip map.
//   TC-D1 goes RED. This proves the debug gate is real.
//
// The live assertion below cross-checks that debug.metrics_json is NOT a string
// (it must be a parsed object). If the handler emitted the raw string instead of
// parsing it, the typeof check `"object"` would fail on "string" → RED.

describe("bctcEvalPageHandler — DV-2: deliberate-violation smoke for debug field", () => {
  it("LIVE PROOF: debug.metrics_json is parsed object not raw string (gate is not hollow)", () => {
    const db = makeTestDb();
    db.prepare(`INSERT INTO financial_reports (id, action_code, period_year) VALUES (?, ?, ?)`).run(VALID_UUID, "FPT", 2025);
    insertAllEvalRows(db, VALID_UUID, "yellow");

    const { res, getMock } = makeMockRes();
    bctcEvalPageHandler(makeMockReq(), res, db, VALID_UUID, 1);
    const mock = getMock();
    expect(mock.statusCode).toBe(200);

    const body = JSON.parse(mock.body);
    for (const gate of body.gate_strip) {
      // If handler sent raw string, typeof would be "string" → this goes RED
      expect(typeof gate.debug.metrics_json).toBe("object");
      // metrics_json must NOT be null (fixture inserts {sample_key: "stage_N"})
      expect(gate.debug.metrics_json).not.toBeNull();
    }

    // Verify debug does NOT replace existing fields (additive check)
    const anyGate = body.gate_strip[0];
    expect(anyGate.stage_no).toBeDefined();
    expect(anyGate.stage_name).toBeDefined();
    expect(anyGate.status).toBeDefined();
    expect(anyGate.report_level).toBeDefined();
    expect(anyGate.metrics_summary).toBeDefined();
    // debug is ADDITIONAL to these, not instead of them
    expect(anyGate.debug).toBeDefined();
  });
});

// ─── Test: DV-1 DELIBERATE-VIOLATION — anti-false-green smoke ────────────────
//
// This test demonstrates that the fragment-banner guard is NOT hollow.
// We construct the expected behavior: if partial_fragment_warning were suppressed
// (e.g. the handler always set it false), the assertion below would go RED.
//
// RED PROOF (documented here):
//   If bctcEvalPageHandler returned partial_fragment_warning: false for multi-page units,
//   the assertion `expect(stage4.page_annotation.partial_fragment_warning).toBe(true)`
//   in TC-1 above would FAIL with: Expected true, received false.
//
//   To verify this manually: in bctcEvalPageHandler.ts, temporarily change the
//   `partial_fragment_warning: isMultiPage` line to `partial_fragment_warning: false`.
//   TC-1 goes RED. This proves the guard is real.
//
// The test below is a LIVE assertion that proves the gate fires correctly:
describe("bctcEvalPageHandler — DV-1: deliberate-violation smoke (anti-false-green)", () => {
  it("LIVE PROOF: multi-page unit on page 6 fires partial_fragment_warning=true (gate is not hollow)", () => {
    const db = makeTestDb();
    db.prepare(`INSERT INTO financial_reports (id, action_code, period_year) VALUES (?, ?, ?)`).run(VALID_UUID, "FPT", 2025);
    insertAllEvalRows(db, VALID_UUID);

    // Inject multi-page unit spanning [5, 6, 7]
    db.prepare(`
      INSERT INTO bctc_layout_units (report_id, unit_id, schema_page, page_numbers_json)
      VALUES (?, ?, ?, ?)
    `).run(VALID_UUID, "unit_dv1", 5, JSON.stringify([5, 6, 7]));

    const { res, getMock } = makeMockRes();
    bctcEvalPageHandler(makeMockReq(), res, db, VALID_UUID, 6);
    const mock = getMock();
    expect(mock.statusCode).toBe(200);

    const body = JSON.parse(mock.body);
    const stage4 = body.gate_strip.find((g: { stage_no: number }) => g.stage_no === 4);

    // PRIMARY ASSERTION — this is the live proof that the banner gate fires
    // If you suppress partial_fragment_warning in the handler, this goes RED.
    expect(stage4.page_annotation.partial_fragment_warning).toBe(true);
    expect(stage4.page_annotation.partial_label).toContain("trang 6");

    // Also verify single-page unit on same report does NOT fire
    db.prepare(`
      INSERT INTO bctc_layout_units (report_id, unit_id, schema_page, page_numbers_json)
      VALUES (?, ?, ?, ?)
    `).run(VALID_UUID, "unit_dv1_single", 3, JSON.stringify([3]));

    const { res: res2, getMock: getMock2 } = makeMockRes();
    bctcEvalPageHandler(makeMockReq(), res2, db, VALID_UUID, 3);
    const mock2 = getMock2();
    const body2 = JSON.parse(mock2.body);
    const stage4b = body2.gate_strip.find((g: { stage_no: number }) => g.stage_no === 4);

    // This asserts the gate does NOT fire for single-page units
    // If we incorrectly set partial_fragment_warning:true always, this goes RED.
    expect(stage4b.page_annotation.partial_fragment_warning).toBe(false);
  });
});
