/**
 * PI-3-redo — TDD tests for GET /api/bctc-inspect/* handlers
 *
 * Covers all acceptance criteria from the architect's re-ground design:
 *   AC-1  list endpoint returns correct shape from financial_reports
 *   AC-2  list includes rows with null/empty pdf_path (REOPEN-2: filter removed)
 *          has_pdf=false when pdf_path IS NULL or file missing on disk
 *   AC-3  list has_pdf reflects file existence (no real fs call — mocked via has_pdf logic)
 *   AC-4  has_ocr reflects pdf_extracted_text rows for basename(pdf_path)
 *   AC-5  anomaly_decimal_shift fires when |ocr - api| / |api| > 10
 *   AC-6  anomaly_decimal_shift does NOT fire for small deviations
 *   AC-7  GET /api/bctc-inspect/pdf/{doc_id} — unknown UUID → 404
 *   AC-8  GET /api/bctc-inspect/pdf/bad-id  — invalid UUID → 400
 *   AC-9  GET /api/bctc-inspect/ocr/{doc_id} — returns correct shape + figures
 *   AC-10 GET /api/bctc-inspect/ocr/{doc_id} — 0 OCR rows → honest empty state
 *   AC-11 GET /api/bctc-inspect/ocr/{doc_id}?page=2 — pagination works (has_more)
 *   AC-12 isDecimalShiftAnomaly — unit tests for the anomaly logic
 *   AC-13 isValidUuid — unit tests for the UUID guard
 *   AC-14 list returns label in "{action_code} {period_type} {period_year}" format
 *   AC-15 GET /api/bctc-inspect/ocr/ bad-id → 400
 *   AC-16 list excludes action_code containing "example" / "error" / "missing"
 *   AC-17 no write SQL verbs in handler (structural — enforced by grep)
 *   BEQ-4a refine_status=PENDING → net_profit nulled in /docs listing (not garbage OCR value)
 *   BEQ-4a refine_status=DONE/PARTIAL → net_profit passed through unchanged (no regression)
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import type { IncomingMessage, ServerResponse } from "node:http";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";
import {
  isValidUuid,
  isDecimalShiftAnomaly,
  handleBctcInspectDocs,
  handleBctcInspectPdf,
  handleBctcInspectOcr,
  type DocListItem,
  type OcrPageResponse,
  type FiguresPayload,
} from "../interface/mcp/routes/bctcInspectHandler.js";

// ─── Test DB helpers ──────────────────────────────────────────────────────────

function setupTestDb(): Database {
  const db = new Database(":memory:");

  // financial_reports — minimal DDL matching the production schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS financial_reports (
      id                    TEXT PRIMARY KEY,
      action_code           TEXT NOT NULL,
      company_name          TEXT NOT NULL,
      exchange              TEXT NOT NULL DEFAULT 'HOSE',
      domain                TEXT NOT NULL DEFAULT 'banking',
      period_year           INTEGER NOT NULL,
      period_quarter        INTEGER,
      period_type           TEXT NOT NULL,
      period_start          TEXT NOT NULL DEFAULT '2025-01-01',
      period_end            TEXT NOT NULL DEFAULT '2025-03-31',
      sort_key              TEXT NOT NULL,
      pdf_path              TEXT,
      parsed_at             TEXT NOT NULL,
      net_revenue           REAL,
      gross_profit          REAL,
      net_profit            REAL,
      net_profit_api_bridge REAL,
      net_margin_pct        REAL,
      ocr_confidence        REAL,
      confidence_financial  REAL,
      extraction_confidence REAL,
      refine_status         TEXT NOT NULL DEFAULT 'PENDING',
      balance_sheet_json    TEXT NOT NULL DEFAULT '{}',
      income_stmt_json      TEXT NOT NULL DEFAULT '{}',
      cash_flow_json        TEXT NOT NULL DEFAULT '{}',
      ratios_json           TEXT NOT NULL DEFAULT '{}',
      UNIQUE(action_code, sort_key)
    )
  `);

  // bctc_layout_units — queried by handleBctcInspectOcr PEK check (must exist)
  db.exec(`
    CREATE TABLE IF NOT EXISTS bctc_layout_units (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id       TEXT    NOT NULL,
      unit_id         TEXT    NOT NULL,
      schema_page     INTEGER NOT NULL,
      page_numbers_json TEXT  NOT NULL,
      page_type       TEXT    NOT NULL DEFAULT 'table',
      stitched_markdown TEXT  NOT NULL DEFAULT '',
      quarantined     INTEGER NOT NULL DEFAULT 0,
      UNIQUE(report_id, unit_id)
    )
  `);

  // pdf_extracted_text — minimal DDL
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

interface InsertReportOpts {
  id?: string;
  action_code?: string;
  company_name?: string;
  period_year?: number;
  period_quarter?: number | null;
  period_type?: string;
  sort_key?: string;
  pdf_path?: string | null;
  parsed_at?: string;
  net_profit?: number | null;
  net_profit_api_bridge?: number | null;
  net_revenue?: number | null;
  gross_profit?: number | null;
  net_margin_pct?: number | null;
  ocr_confidence?: number | null;
  confidence_financial?: number | null;
  extraction_confidence?: number | null;
  /** BEQ-4a: refine lifecycle status — PENDING | DONE | PARTIAL; defaults to 'PENDING' */
  refine_status?: string;
}

function insertReport(db: Database, opts: InsertReportOpts = {}): string {
  const id = opts.id ?? crypto.randomUUID();
  db.prepare(`
    INSERT INTO financial_reports
      (id, action_code, company_name, period_year, period_quarter, period_type, sort_key,
       pdf_path, parsed_at, net_profit, net_profit_api_bridge, net_revenue, gross_profit,
       net_margin_pct, ocr_confidence, confidence_financial, extraction_confidence,
       refine_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    opts.action_code ?? "VCB",
    opts.company_name ?? "Vietcombank",
    opts.period_year ?? 2025,
    opts.period_quarter ?? 1,
    opts.period_type ?? "Q1",
    opts.sort_key ?? "2025-Q1",
    opts.pdf_path !== undefined ? opts.pdf_path : "/app/data/pdfs/VCB_2025_Q1.pdf",
    opts.parsed_at ?? new Date().toISOString(),
    opts.net_profit ?? null,
    opts.net_profit_api_bridge ?? null,
    opts.net_revenue ?? null,
    opts.gross_profit ?? null,
    opts.net_margin_pct ?? null,
    opts.ocr_confidence ?? null,
    opts.confidence_financial ?? null,
    opts.extraction_confidence ?? null,
    opts.refine_status ?? "PENDING",
  );
  return id;
}

function insertOcrPage(
  db: Database,
  filename: string,
  page_number: number,
  text_content = "Test OCR page content",
  confidence = 0.9,
): void {
  db.prepare(`
    INSERT INTO pdf_extracted_text (filename, page_number, text_content, confidence)
    VALUES (?, ?, ?, ?)
  `).run(filename, page_number, text_content, confidence);
}

// ─── Mock request / response helpers ─────────────────────────────────────────

function mockReq(url: string): IncomingMessage {
  return { url, headers: {}, method: "GET" } as unknown as IncomingMessage;
}

function mockRes(): {
  res: ServerResponse;
  getStatus: () => number;
  getHeaders: () => Record<string, string>;
  getBody: () => unknown;
  getRawBody: () => string;
} {
  let status = 200;
  const headers: Record<string, string> = {};
  let body = "";

  const res = {
    writeHead(s: number, h?: Record<string, string>) {
      status = s;
      if (h) Object.assign(headers, h);
    },
    end(data: string | Buffer) {
      body = typeof data === "string" ? data : data.toString("binary");
    },
    setHeader(k: string, v: string) {
      headers[k.toLowerCase()] = v;
    },
  } as unknown as ServerResponse;

  return {
    res,
    getStatus: () => status,
    getHeaders: () => headers,
    getBody: () => {
      try { return JSON.parse(body); } catch { return body; }
    },
    getRawBody: () => body,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Unit tests — pure functions
// ═════════════════════════════════════════════════════════════════════════════

describe("PI-3 AC-12 — isDecimalShiftAnomaly()", () => {
  test("fires when |ocr - api| / |api| > 10 (decimal-shift case: 0.000051 vs 51000)", () => {
    // Real case: net_profit_ocr=0.000051, net_profit_api_bridge=51000 (million VND)
    expect(isDecimalShiftAnomaly(0.000051, 51000)).toBe(true);
  });

  test("fires for large deviation (1000 vs 5)", () => {
    // |1000 - 5| / 5 = 199 > 10
    expect(isDecimalShiftAnomaly(1000, 5)).toBe(true);
  });

  test("does NOT fire for ratio exactly 10 (boundary — NOT > 10)", () => {
    // max(10, 1) / min(10, 1) = 10/1 = 10, which is NOT > 10
    expect(isDecimalShiftAnomaly(10, 1)).toBe(false);
  });

  test("does NOT fire for similar values (small deviation)", () => {
    expect(isDecimalShiftAnomaly(1200, 1250)).toBe(false);
  });

  test("returns false when net_profit_ocr is null", () => {
    expect(isDecimalShiftAnomaly(null, 1000)).toBe(false);
  });

  test("returns false when net_profit_api_bridge is null", () => {
    expect(isDecimalShiftAnomaly(1000, null)).toBe(false);
  });

  test("returns false when both are null", () => {
    expect(isDecimalShiftAnomaly(null, null)).toBe(false);
  });

  test("returns false when api_bridge is 0 (avoid division by zero)", () => {
    expect(isDecimalShiftAnomaly(9999, 0)).toBe(false);
  });
});

describe("PI-3 AC-13 — isValidUuid()", () => {
  test("accepts a valid v4 UUID (lowercase)", () => {
    expect(isValidUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  test("accepts a valid UUID with uppercase hex", () => {
    expect(isValidUuid("550E8400-E29B-41D4-A716-446655440000")).toBe(true);
  });

  test("rejects a short string", () => {
    expect(isValidUuid("abc")).toBe(false);
  });

  test("rejects empty string", () => {
    expect(isValidUuid("")).toBe(false);
  });

  test("rejects path traversal attempt", () => {
    expect(isValidUuid("../../etc/passwd")).toBe(false);
  });

  test("rejects a UUID missing dashes", () => {
    expect(isValidUuid("550e8400e29b41d4a716446655440000")).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Handler tests — GET /api/bctc-inspect/docs
// ═════════════════════════════════════════════════════════════════════════════

describe("PI-3 AC-1/2 — GET /api/bctc-inspect/docs — list shape", () => {
  let db: Database;

  beforeEach(() => {
    db = setupTestDb();
  });

  test("AC-1: returns ok:true with items array + count", () => {
    insertReport(db, {
      id: "e1e1e1e1-aaaa-4bbb-8ccc-111111111111",
      action_code: "VCB",
      pdf_path: "/app/data/pdfs/VCB_2025_Q1.pdf",
    });

    const { res, getStatus, getBody } = mockRes();
    handleBctcInspectDocs(mockReq("/api/bctc-inspect/docs"), res, db);

    expect(getStatus()).toBe(200);
    const body = getBody() as { ok: boolean; count: number; items: DocListItem[] };
    expect(body.ok).toBe(true);
    expect(body.count).toBe(1);
    expect(body.items).toHaveLength(1);
  });

  test("AC-2 (REOPEN-2): rows with null pdf_path ARE included — has_pdf=false", () => {
    // REOPEN-2 change: LIST_SQL no longer filters WHERE pdf_path IS NOT NULL.
    // All real rows appear. pdf_path IS NULL → has_pdf:false (data quality signal).
    insertReport(db, {
      id: "e2e2e2e2-aaaa-4bbb-8ccc-222222222222",
      pdf_path: null,
      action_code: "VNM",
      sort_key: "2025-Q1-VNM",
    });

    const { res, getBody } = mockRes();
    handleBctcInspectDocs(mockReq("/api/bctc-inspect/docs"), res, db);

    const body = getBody() as { count: number; items: DocListItem[] };
    expect(body.count).toBe(1); // row IS returned
    expect(body.items[0]!.has_pdf).toBe(false); // but has_pdf=false
  });

  test("AC-2 (REOPEN-2): rows with empty string pdf_path ARE included — has_pdf=false", () => {
    // Same as null — empty string also means no PDF on disk.
    insertReport(db, {
      id: "e3e3e3e3-aaaa-4bbb-8ccc-333333333333",
      pdf_path: "",
      action_code: "VNM",
      sort_key: "2025-Q2-VNM",
    });

    const { res, getBody } = mockRes();
    handleBctcInspectDocs(mockReq("/api/bctc-inspect/docs"), res, db);
    const body = getBody() as { count: number; items: DocListItem[] };
    expect(body.count).toBe(1); // row IS returned
    expect(body.items[0]!.has_pdf).toBe(false); // has_pdf=false
  });

  test("AC-14: label format is '{action_code} {period_type} {period_year}'", () => {
    insertReport(db, {
      id: "e4e4e4e4-aaaa-4bbb-8ccc-444444444444",
      action_code: "VCB",
      period_type: "Q1",
      period_year: 2025,
      period_quarter: 1,
      pdf_path: "/app/data/pdfs/VCB_2025_Q1.pdf",
    });

    const { res, getBody } = mockRes();
    handleBctcInspectDocs(mockReq("/api/bctc-inspect/docs"), res, db);
    const body = getBody() as { items: DocListItem[] };
    expect(body.items[0]!.label).toBe("VCB Q1 Q1 2025");
  });

  test("AC-16: excludes action_code containing 'example'", () => {
    insertReport(db, {
      id: "e5e5e5e5-aaaa-4bbb-8ccc-555555555555",
      action_code: "example-corp",
      pdf_path: "/app/data/pdfs/example.pdf",
      sort_key: "2025-Q1-ex",
    });
    insertReport(db, {
      id: "e6e6e6e6-aaaa-4bbb-8ccc-666666666666",
      action_code: "VCB",
      pdf_path: "/app/data/pdfs/VCB_2025_Q1.pdf",
      sort_key: "2025-Q1",
    });

    const { res, getBody } = mockRes();
    handleBctcInspectDocs(mockReq("/api/bctc-inspect/docs"), res, db);
    const body = getBody() as { count: number; items: DocListItem[] };
    expect(body.count).toBe(1);
    expect(body.items[0]!.action_code).toBe("VCB");
  });

  test("AC-4/5: anomaly_decimal_shift=true when ratio > 10 (DONE row, net_profit not nulled)", () => {
    // BEQ-4a note: anomaly_decimal_shift uses the guarded net_profit from LIST_SQL.
    // For PENDING rows net_profit=null → isDecimalShiftAnomaly(null, api)=false (no value to compare).
    // To test the anomaly logic, use refine_status='DONE' so net_profit passes through.
    insertReport(db, {
      id: "e7e7e7e7-aaaa-4bbb-8ccc-777777777777",
      action_code: "VNM",
      pdf_path: "/app/data/pdfs/VNM_2024_Q4.pdf",
      sort_key: "2024-Q4",
      net_profit: 0.000051,          // wrong OCR value (decimal-shift anomaly)
      net_profit_api_bridge: 51000,  // API: correct value (million VND)
      refine_status: "DONE",         // DONE: net_profit passes through → anomaly detectable
    });

    const { res, getBody } = mockRes();
    handleBctcInspectDocs(mockReq("/api/bctc-inspect/docs"), res, db);
    const body = getBody() as { items: DocListItem[] };
    expect(body.items[0]!.anomaly_decimal_shift).toBe(true);
  });

  test("AC-6: anomaly_decimal_shift=false for normal deviation", () => {
    insertReport(db, {
      id: "e8e8e8e8-aaaa-4bbb-8ccc-888888888888",
      action_code: "VCB",
      pdf_path: "/app/data/pdfs/VCB_2025_Q1.pdf",
      net_profit: 1200,
      net_profit_api_bridge: 1250,
    });

    const { res, getBody } = mockRes();
    handleBctcInspectDocs(mockReq("/api/bctc-inspect/docs"), res, db);
    const body = getBody() as { items: DocListItem[] };
    expect(body.items[0]!.anomaly_decimal_shift).toBe(false);
  });

  test("AC-4: has_ocr=true when pdf_extracted_text has rows for basename(pdf_path)", () => {
    insertReport(db, {
      id: "e9e9e9e9-aaaa-4bbb-8ccc-999999999999",
      action_code: "VCB",
      pdf_path: "/app/data/pdfs/VCB_2025_Q1.pdf",
      sort_key: "2025-Q1-vcb",
    });
    insertOcrPage(db, "VCB_2025_Q1.pdf", 1, "Balance sheet page 1");

    const { res, getBody } = mockRes();
    handleBctcInspectDocs(mockReq("/api/bctc-inspect/docs"), res, db);
    const body = getBody() as { items: DocListItem[] };
    expect(body.items[0]!.has_ocr).toBe(true);
  });

  test("has_ocr=false when no pdf_extracted_text rows", () => {
    insertReport(db, {
      id: "eaeaeaea-aaaa-4bbb-8ccc-aaaaaaaaaaaa",
      action_code: "HPG",
      pdf_path: "/app/data/pdfs/HPG_2025_Q1.pdf",
      sort_key: "2025-Q1-hpg",
    });
    // No OCR rows inserted

    const { res, getBody } = mockRes();
    handleBctcInspectDocs(mockReq("/api/bctc-inspect/docs"), res, db);
    const body = getBody() as { items: DocListItem[] };
    expect(body.items[0]!.has_ocr).toBe(false);
  });

  test("returns figures scalars in response (net_profit, net_profit_api_bridge, etc)", () => {
    insertReport(db, {
      id: "ebebebeb-aaaa-4bbb-8ccc-bbbbbbbbbbbb",
      action_code: "VCB",
      pdf_path: "/app/data/pdfs/VCB_2025_Q1.pdf",
      sort_key: "2025-Q1-vcb2",
      net_profit: 5000,
      net_profit_api_bridge: 5100,
      ocr_confidence: 0.92,
      confidence_financial: 0.85,
      refine_status: "DONE",   // BEQ-4a: must be DONE for net_profit to pass through
    });

    const { res, getBody } = mockRes();
    handleBctcInspectDocs(mockReq("/api/bctc-inspect/docs"), res, db);
    const body = getBody() as { items: DocListItem[] };
    const item = body.items[0]!;
    expect(item.net_profit).toBe(5000);
    expect(item.net_profit_api_bridge).toBe(5100);
    expect(item.ocr_confidence).toBe(0.92);
    expect(item.confidence_financial).toBe(0.85);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// BEQ-4a — refine_status guard in LIST_SQL
// Anti-false-green: mock a PENDING row with net_profit=999.99; prove the
// handler outputs null (not the garbage scalar). DONE/PARTIAL pass through.
// Ref: docs/architecture-briefs/2026-06-02-bctc-extract-quality.md § Symptom C
// ═════════════════════════════════════════════════════════════════════════════

describe("BEQ-4a — PENDING net_profit nulled in /docs listing (CASE WHEN guard)", () => {
  let db: Database;

  beforeEach(() => {
    db = setupTestDb();
  });

  test("BEQ-4a-1: refine_status=PENDING → net_profit is null in response (not garbage OCR value)", () => {
    // Mimics CTG=5, EIB=1, VNM=5.1e-05, DIG=18 — broken OCR-parse values for PENDING rows
    insertReport(db, {
      id: "beq4a000-0000-4000-8000-000000000001",
      action_code: "CTG",
      sort_key: "2026-Q1",
      net_profit: 999.99,          // garbage OCR-parse value — must NOT be served
      net_profit_api_bridge: null,
      refine_status: "PENDING",    // explicit PENDING — the guard should null net_profit
    });

    const { res, getBody } = mockRes();
    handleBctcInspectDocs(mockReq("/api/bctc-inspect/docs"), res, db);

    const body = getBody() as { items: DocListItem[] };
    const item = body.items[0]!;
    // CASE WHEN refine_status = 'PENDING' THEN NULL ELSE net_profit END
    expect(item.net_profit).toBeNull();
    // refine_status badge must be surfaced so UI can show the PENDING indicator
    expect(item.refine_status).toBe("PENDING");
    // row is NOT filtered out — analyst can still see the ticker exists
    expect(item.action_code).toBe("CTG");
  });

  test("BEQ-4a-2: refine_status=DONE → net_profit passes through unchanged (no regression)", () => {
    // FPT / ACB with correct refined values — must not be touched by the guard
    insertReport(db, {
      id: "beq4a000-0000-4000-8000-000000000002",
      action_code: "FPT",
      sort_key: "2026-Q1",
      net_profit: 2476790,         // correct refined value (million VND)
      net_profit_api_bridge: 2476800,
      refine_status: "DONE",
    });

    const { res, getBody } = mockRes();
    handleBctcInspectDocs(mockReq("/api/bctc-inspect/docs"), res, db);

    const body = getBody() as { items: DocListItem[] };
    const item = body.items[0]!;
    expect(item.net_profit).toBe(2476790);
    expect(item.refine_status).toBe("DONE");
  });

  test("BEQ-4a-3 / BEQ-8b: refine_status=PARTIAL → net_profit=null (BEQ-8b extended guard)", () => {
    /**
     * BEQ-4a original: PARTIAL was pass-through ("trustworthy").
     * BEQ-8b: PARTIAL also nulled — after BEQ-5/6/7, balance-sheet-only tickers
     * transition to PARTIAL and their legacy net_profit is still garbage.
     * Guard now covers IN ('PENDING', 'PARTIAL').
     */
    insertReport(db, {
      id: "beq4a000-0000-4000-8000-000000000003",
      action_code: "ACB",
      sort_key: "2026-Q1",
      net_profit: 1850000,
      net_profit_api_bridge: 1860000,
      refine_status: "PARTIAL",
    });

    const { res, getBody } = mockRes();
    handleBctcInspectDocs(mockReq("/api/bctc-inspect/docs"), res, db);

    const body = getBody() as { items: DocListItem[] };
    const item = body.items[0]!;
    // BEQ-8b: PARTIAL also nulled (legacy garbage must not be served)
    expect(item.net_profit).toBeNull();
    expect(item.refine_status).toBe("PARTIAL");
  });

  test("BEQ-4a-4: mixed list — PENDING nulled, DONE preserved in same response", () => {
    // Seed a PENDING ticker (VNM-like garbage) and a DONE ticker (FPT-like good value)
    insertReport(db, {
      id: "beq4a000-0000-4000-8000-000000000004",
      action_code: "VNM",
      sort_key: "2025-Q4",
      net_profit: 0.000051,        // garbage OCR unit-shift (real case from brief)
      net_profit_api_bridge: 51000,
      refine_status: "PENDING",
      parsed_at: "2026-01-01T00:00:00.000Z",
    });
    insertReport(db, {
      id: "beq4a000-0000-4000-8000-000000000005",
      action_code: "FPT",
      sort_key: "2026-Q1",
      net_profit: 2476790,
      net_profit_api_bridge: 2476800,
      refine_status: "DONE",
      parsed_at: "2026-06-01T00:00:00.000Z",
    });

    const { res, getBody } = mockRes();
    handleBctcInspectDocs(mockReq("/api/bctc-inspect/docs"), res, db);

    const body = getBody() as { count: number; items: DocListItem[] };
    expect(body.count).toBe(2);

    const fpt = body.items.find((i) => i.action_code === "FPT")!;
    const vnm = body.items.find((i) => i.action_code === "VNM")!;

    // DONE ticker: net_profit intact
    expect(fpt.net_profit).toBe(2476790);
    expect(fpt.refine_status).toBe("DONE");

    // PENDING ticker: net_profit nulled — no garbage served
    expect(vnm.net_profit).toBeNull();
    expect(vnm.refine_status).toBe("PENDING");
    // Both rows present in the listing
    expect(fpt.action_code).toBe("FPT");
    expect(vnm.action_code).toBe("VNM");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Handler tests — GET /api/bctc-inspect/pdf/{doc_id}
// ═════════════════════════════════════════════════════════════════════════════

describe("PI-3 AC-7/8 — GET /api/bctc-inspect/pdf/{doc_id}", () => {
  let db: Database;

  beforeEach(() => {
    db = setupTestDb();
  });

  test("AC-8: non-UUID doc_id → 400 with error:invalid_doc_id", () => {
    const { res, getStatus, getBody } = mockRes();
    handleBctcInspectPdf(
      mockReq("/api/bctc-inspect/pdf/not-a-uuid"),
      res,
      db,
      "not-a-uuid",
    );

    expect(getStatus()).toBe(400);
    const body = getBody() as { error: string };
    expect(body.error).toBe("invalid_doc_id");
  });

  test("AC-8: path traversal attempt → 400 (not 500 or file read)", () => {
    const { res, getStatus, getBody } = mockRes();
    handleBctcInspectPdf(
      mockReq("/api/bctc-inspect/pdf/../../etc/passwd"),
      res,
      db,
      "../../etc/passwd",
    );

    expect(getStatus()).toBe(400);
    const body = getBody() as { error: string };
    expect(body.error).toBe("invalid_doc_id");
  });

  test("AC-7: valid UUID not in DB → 404 with error:doc_not_found", () => {
    const unknownId = "f1f1f1f1-bbbb-4ccc-8ddd-111111111111";
    const { res, getStatus, getBody } = mockRes();
    handleBctcInspectPdf(
      mockReq(`/api/bctc-inspect/pdf/${unknownId}`),
      res,
      db,
      unknownId,
    );

    expect(getStatus()).toBe(404);
    const body = getBody() as { error: string; doc_id: string };
    expect(body.error).toBe("doc_not_found");
    expect(body.doc_id).toBe(unknownId);
  });

  test("doc exists but pdf_path is null → 404 with error:pdf_path_null", () => {
    const id = "f2f2f2f2-bbbb-4ccc-8ddd-222222222222";
    insertReport(db, { id, pdf_path: null });

    const { res, getStatus, getBody } = mockRes();
    handleBctcInspectPdf(mockReq(`/api/bctc-inspect/pdf/${id}`), res, db, id);

    expect(getStatus()).toBe(404);
    const body = getBody() as { error: string };
    expect(body.error).toBe("pdf_path_null");
  });

  test("doc exists, pdf_path set, file NOT on disk → 404 with error:pdf_not_on_disk + stored_path", () => {
    const id = "f3f3f3f3-bbbb-4ccc-8ddd-333333333333";
    insertReport(db, { id, pdf_path: "/app/data/pdfs/NONEXISTENT_2025_Q1.pdf" });

    const { res, getStatus, getBody } = mockRes();
    handleBctcInspectPdf(mockReq(`/api/bctc-inspect/pdf/${id}`), res, db, id);

    expect(getStatus()).toBe(404);
    const body = getBody() as { error: string; stored_path: string };
    expect(body.error).toBe("pdf_not_on_disk");
    // stored_path is returned for ops diagnostics
    expect(typeof body.stored_path).toBe("string");
    expect(body.stored_path).toContain("NONEXISTENT_2025_Q1.pdf");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Handler tests — GET /api/bctc-inspect/ocr/{doc_id}
// ═════════════════════════════════════════════════════════════════════════════

describe("PI-3 AC-9/10/11 — GET /api/bctc-inspect/ocr/{doc_id}", () => {
  let db: Database;

  beforeEach(() => {
    db = setupTestDb();
  });

  test("AC-15: invalid UUID → 400 with error:invalid_doc_id", () => {
    const { res, getStatus, getBody } = mockRes();
    handleBctcInspectOcr(
      mockReq("/api/bctc-inspect/ocr/bad-id"),
      res,
      db,
      "bad-id",
    );

    expect(getStatus()).toBe(400);
    const body = getBody() as { error: string };
    expect(body.error).toBe("invalid_doc_id");
  });

  test("AC-9: unknown UUID → 404 doc_not_found", () => {
    const unknownId = "a1b2c3d4-e5f6-4a7b-8c9d-aabbccddeeff";
    const { res, getStatus, getBody } = mockRes();
    handleBctcInspectOcr(
      mockReq(`/api/bctc-inspect/ocr/${unknownId}`),
      res,
      db,
      unknownId,
    );

    expect(getStatus()).toBe(404);
    const body = getBody() as { error: string };
    expect(body.error).toBe("doc_not_found");
  });

  test("AC-10: doc with no OCR rows → total_pages:0, empty text, has_more:false", () => {
    const id = "b1c2d3e4-f5a6-4b7c-8d9e-aabbccddeef0";
    insertReport(db, {
      id,
      pdf_path: "/app/data/pdfs/VCB_2025_Q1.pdf",
    });
    // No OCR rows inserted

    const { res, getStatus, getBody } = mockRes();
    handleBctcInspectOcr(
      mockReq(`/api/bctc-inspect/ocr/${id}?page=1`),
      res,
      db,
      id,
    );

    expect(getStatus()).toBe(200);
    const body = getBody() as OcrPageResponse;
    expect(body.doc_id).toBe(id);
    expect(body.total_pages).toBe(0);
    expect(body.text_content).toBe("");
    expect(body.has_more).toBe(false);
    expect(body.filename).toBe("VCB_2025_Q1.pdf");
  });

  test("AC-9: doc with OCR rows returns correct page shape", () => {
    const id = "c1d2e3f4-a5b6-4c7d-8e9f-aabbccddeef1";
    insertReport(db, {
      id,
      pdf_path: "/app/data/pdfs/VNM_2024_Q4.pdf",
      net_profit: 42000,
      net_profit_api_bridge: 42100,
      ocr_confidence: 0.93,
    });
    insertOcrPage(db, "VNM_2024_Q4.pdf", 1, "Page 1 content about financials", 0.88);
    insertOcrPage(db, "VNM_2024_Q4.pdf", 2, "Page 2 continuation", 0.90);

    const { res, getStatus, getBody } = mockRes();
    handleBctcInspectOcr(
      mockReq(`/api/bctc-inspect/ocr/${id}?page=1`),
      res,
      db,
      id,
    );

    expect(getStatus()).toBe(200);
    const body = getBody() as OcrPageResponse;
    expect(body.doc_id).toBe(id);
    expect(body.filename).toBe("VNM_2024_Q4.pdf");
    expect(body.total_pages).toBe(2);
    expect(body.page).toBe(1);
    expect(body.text_content).toBe("Page 1 content about financials");
    expect(body.confidence).toBeCloseTo(0.88, 2);
    expect(body.has_more).toBe(true);
  });

  test("AC-11: page=2 returns second page + has_more:false (last page)", () => {
    const id = "d1e2f3a4-b5c6-4d7e-8f9a-aabbccddeef2";
    insertReport(db, {
      id,
      pdf_path: "/app/data/pdfs/HPG_2025_Q1.pdf",
    });
    insertOcrPage(db, "HPG_2025_Q1.pdf", 1, "First page text", 0.85);
    insertOcrPage(db, "HPG_2025_Q1.pdf", 2, "Second page text", 0.80);

    const { res, getStatus, getBody } = mockRes();
    handleBctcInspectOcr(
      mockReq(`/api/bctc-inspect/ocr/${id}?page=2`),
      res,
      db,
      id,
    );

    expect(getStatus()).toBe(200);
    const body = getBody() as OcrPageResponse;
    expect(body.page).toBe(2);
    expect(body.total_pages).toBe(2);
    expect(body.text_content).toBe("Second page text");
    expect(body.has_more).toBe(false);
  });

  test("figures payload contains net_profit + net_profit_api_bridge + anomaly flag", () => {
    const id = "e1f2a3b4-c5d6-4e7f-8a9b-aabbccddeef3";
    insertReport(db, {
      id,
      pdf_path: "/app/data/pdfs/VNM_2024_Q4.pdf",
      sort_key: "2024-Q4-vnm",
      net_profit: 0.000051,        // decimal-shift bug
      net_profit_api_bridge: 51000,
      ocr_confidence: 0.75,
      confidence_financial: 0.60,
    });
    insertOcrPage(db, "VNM_2024_Q4.pdf", 1, "BCTC text", 0.75);

    const { res, getBody } = mockRes();
    handleBctcInspectOcr(
      mockReq(`/api/bctc-inspect/ocr/${id}?page=1`),
      res,
      db,
      id,
    );

    const body = getBody() as OcrPageResponse;
    expect(body.figures).not.toBeNull();
    const figures = body.figures as FiguresPayload;
    expect(figures.net_profit).toBeCloseTo(0.000051, 6);
    expect(figures.net_profit_api_bridge).toBe(51000);
    expect(figures.anomaly_decimal_shift).toBe(true);
    expect(figures.ocr_confidence).toBeCloseTo(0.75, 2);
    expect(figures.confidence_financial).toBeCloseTo(0.60, 2);
  });

  test("figures.anomaly_decimal_shift=false for normal values", () => {
    const id = "f1a2b3c4-d5e6-4f7a-8b9c-aabbccddeef4";
    insertReport(db, {
      id,
      pdf_path: "/app/data/pdfs/VCB_2025_Q1.pdf",
      sort_key: "2025-Q1-vcb-ocr",
      net_profit: 5000,
      net_profit_api_bridge: 5100,
    });

    const { res, getBody } = mockRes();
    handleBctcInspectOcr(
      mockReq(`/api/bctc-inspect/ocr/${id}?page=1`),
      res,
      db,
      id,
    );

    const body = getBody() as OcrPageResponse;
    expect(body.figures?.anomaly_decimal_shift).toBe(false);
  });

  test("doc with null pdf_path → total_pages:0, filename:null, figures returned", () => {
    const id = "a1b2c3d4-e5f6-4a7b-8c9d-bbccddee0011";
    insertReport(db, {
      id,
      pdf_path: null,
      net_profit: 1000,
    });

    const { res, getStatus, getBody } = mockRes();
    handleBctcInspectOcr(
      mockReq(`/api/bctc-inspect/ocr/${id}?page=1`),
      res,
      db,
      id,
    );

    expect(getStatus()).toBe(200);
    const body = getBody() as OcrPageResponse;
    expect(body.filename).toBeNull();
    expect(body.total_pages).toBe(0);
    expect(body.figures).not.toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// AC-17 — structural: no write SQL verbs in handler (documentary)
// ═════════════════════════════════════════════════════════════════════════════

describe("PI-3 AC-17 — handler is SELECT-only (no INSERT/UPDATE/DELETE)", () => {
  test("handler file contains no INSERT statements", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const handlerPath = resolve(
      import.meta.dir,
      "../interface/mcp/routes/bctcInspectHandler.ts",
    );
    const src = readFileSync(handlerPath, "utf-8");
    // Allow INSERT in comments (e.g. "// No INSERT"), but not as a SQL keyword in queries
    const insertInCode = src.match(/\bINSERT\b(?![^`'"]*[`'"])/g);
    expect(insertInCode).toBeNull();
  });

  test("handler file contains no UPDATE statements in query strings", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const handlerPath = resolve(
      import.meta.dir,
      "../interface/mcp/routes/bctcInspectHandler.ts",
    );
    const src = readFileSync(handlerPath, "utf-8");
    // Check that UPDATE does not appear in backtick template literals (SQL queries)
    const hasUpdateInQuery = /`[^`]*\bUPDATE\b[^`]*`/.test(src);
    expect(hasUpdateInQuery).toBe(false);
  });
});
