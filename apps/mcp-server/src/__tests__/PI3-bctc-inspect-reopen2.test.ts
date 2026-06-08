/**
 * PI-3-redo REOPEN-2 — TDD tests for backfill + updated inspector
 *
 * Covers architect acceptance criteria (REOPEN-2 design):
 *   AC-R1  parsePdfFilenameTokens — canonical short form: VCB_2025_Q1.pdf
 *   AC-R2  parsePdfFilenameTokens — dated long form: 20250429-VCB-...-Quy-1-nam-2025.pdf
 *   AC-R3  parsePdfFilenameTokens — dated FPT: 20260126-FPT-BCTC-hop-nhat-Quy-4-2025.pdf
 *   AC-R4  parsePdfFilenameTokens — month form: BCTC VNM 31.12.2025 - HOP NHAT - VN.pdf → Q4
 *   AC-R5  parsePdfFilenameTokens — VCB Q1 vs Q4 disambiguation (distinct tokens → correct quarter)
 *   AC-R6  backfillBctcPdfPaths — links exactly one file to a matching row
 *   AC-R7  backfillBctcPdfPaths — ambiguous (2 files same ticker/year/quarter) → no link
 *   AC-R8  backfillBctcPdfPaths — zero matches → leaves pdf_path NULL
 *   AC-R9  backfillBctcPdfPaths — idempotent (already-linked rows not re-processed)
 *   AC-R10 LIST returns all 14 real-like rows (no pdf_path filter)
 *   AC-R11 LIST: has_pdf=true when pdf_path set and file on disk (existsSync via fixture)
 *   AC-R12 LIST: has_pdf=false when pdf_path IS NULL
 *   AC-R13 LIST: has_ocr=true via secondary OCR join (pdf_path IS NULL but OCR filename matches)
 *   AC-R14 LIST: has_ocr=false when no OCR match exists (pdf_path IS NULL, no OCR rows)
 *   AC-R15 OCR endpoint: returns OCR text via secondary join when pdf_path IS NULL
 *   AC-R16 LIST: news-inference rows (all-zero figures, pdf_path NULL) still appear
 *   AC-R17 backfillBctcPdfPaths — pdfDir not found → returns zero counts, no crash
 *   AC-R18 parsePdfFilenameTokens — returns null for unrecognized filename (no year/quarter)
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import type { IncomingMessage, ServerResponse } from "node:http";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";
import {
  parsePdfFilenameTokens,
  backfillBctcPdfPaths,
  type BackfillResult,
} from "../application/usecases/backfillBctcPdfPaths.js";
import {
  handleBctcInspectDocs,
  handleBctcInspectOcr,
  type DocListItem,
  type OcrPageResponse,
} from "../interface/mcp/routes/bctcInspectHandler.js";

// ─── Test helpers ─────────────────────────────────────────────────────────────

function setupTestDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS financial_reports (
      id                    TEXT PRIMARY KEY,
      action_code           TEXT NOT NULL,
      company_name          TEXT NOT NULL DEFAULT 'Test Corp',
      exchange              TEXT NOT NULL DEFAULT 'HOSE',
      domain                TEXT NOT NULL DEFAULT 'banking',
      period_year           INTEGER NOT NULL,
      period_quarter        INTEGER,
      period_type           TEXT NOT NULL DEFAULT 'Q1',
      period_start          TEXT NOT NULL DEFAULT '2025-01-01',
      period_end            TEXT NOT NULL DEFAULT '2025-03-31',
      sort_key              TEXT NOT NULL,
      pdf_path              TEXT,
      refine_status         TEXT NOT NULL DEFAULT 'PENDING',
      parsed_at             TEXT NOT NULL DEFAULT (datetime('now')),
      net_revenue           REAL,
      gross_profit          REAL,
      net_profit            REAL,
      net_profit_api_bridge REAL,
      net_margin_pct        REAL,
      ocr_confidence        REAL,
      confidence_financial  REAL,
      extraction_confidence REAL,
      balance_sheet_json    TEXT NOT NULL DEFAULT '{}',
      income_stmt_json      TEXT NOT NULL DEFAULT '{}',
      cash_flow_json        TEXT NOT NULL DEFAULT '{}',
      ratios_json           TEXT NOT NULL DEFAULT '{}',
      UNIQUE(action_code, sort_key)
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
  db.exec(`
    CREATE TABLE IF NOT EXISTS bctc_layout_units (
      unit_id            TEXT PRIMARY KEY,
      report_id          TEXT NOT NULL,
      page_type          TEXT NOT NULL,
      schema_page        INTEGER,
      page_numbers_json  TEXT NOT NULL DEFAULT '[]',
      stitched_markdown  TEXT NOT NULL DEFAULT '',
      quarantined        INTEGER NOT NULL DEFAULT 0
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
  period_year?: number;
  period_quarter?: number | null;
  period_type?: string;
  sort_key?: string;
  pdf_path?: string | null;
  net_profit?: number | null;
  net_profit_api_bridge?: number | null;
}

function insertReport(db: Database, opts: InsertReportOpts = {}): string {
  const id = opts.id ?? crypto.randomUUID();
  db.prepare(`
    INSERT INTO financial_reports
      (id, action_code, period_year, period_quarter, period_type, sort_key,
       pdf_path, net_profit, net_profit_api_bridge)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    opts.action_code ?? "VCB",
    opts.period_year ?? 2025,
    opts.period_quarter !== undefined ? opts.period_quarter : 1,
    opts.period_type ?? "Q1",
    opts.sort_key ?? `${opts.period_year ?? 2025}-Q${opts.period_quarter ?? 1}-${opts.action_code ?? "VCB"}`,
    opts.pdf_path !== undefined ? opts.pdf_path : null,
    opts.net_profit ?? null,
    opts.net_profit_api_bridge ?? null,
  );
  return id;
}

function insertOcrPage(db: Database, filename: string, page = 1, text = "OCR text"): void {
  db.prepare(
    `INSERT INTO pdf_extracted_text (filename, page_number, text_content, confidence) VALUES (?, ?, ?, ?)`,
  ).run(filename, page, text, 0.9);
}

function mockReq(url: string): IncomingMessage {
  return { url, headers: {}, method: "GET" } as unknown as IncomingMessage;
}

function mockRes(): {
  res: ServerResponse;
  getStatus: () => number;
  getBody: () => unknown;
} {
  let status = 200;
  let body = "";
  const res = {
    writeHead(s: number) { status = s; },
    end(data: string) { body = data; },
    setHeader() {},
  } as unknown as ServerResponse;
  return {
    res,
    getStatus: () => status,
    getBody: () => { try { return JSON.parse(body); } catch { return body; } },
  };
}

/** Create a temp directory with stub PDF files; return the dir path and cleanup fn */
function createTempPdfDir(filenames: string[]): { dir: string; cleanup: () => void } {
  const dir = resolve(tmpdir(), `bctc-backfill-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  for (const f of filenames) {
    // Write a minimal stub — content doesn't matter for path matching
    writeFileSync(resolve(dir, f), Buffer.alloc(20480, 0x25)); // 20KB stub
  }
  return {
    dir,
    cleanup: () => { try { rmSync(dir, { recursive: true, force: true }); } catch {} },
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// AC-R1..R5 — parsePdfFilenameTokens unit tests
// ═════════════════════════════════════════════════════════════════════════════

describe("REOPEN-2 AC-R1..R5 — parsePdfFilenameTokens()", () => {
  test("AC-R1: canonical short form VCB_2025_Q1.pdf → ticker=VCB, year=2025, quarter=1", () => {
    const r = parsePdfFilenameTokens("VCB_2025_Q1.pdf", "/app/data/pdfs/VCB_2025_Q1.pdf");
    expect(r).not.toBeNull();
    expect(r!.ticker).toBe("VCB");
    expect(r!.year).toBe(2025);
    expect(r!.quarter).toBe(1);
    expect(r!.filename).toBe("VCB_2025_Q1.pdf");
  });

  test("AC-R1b: canonical short form VCB_2025_Q4.pdf → quarter=4 (distinct from Q1)", () => {
    const r = parsePdfFilenameTokens("VCB_2025_Q4.pdf", "/app/data/pdfs/VCB_2025_Q4.pdf");
    expect(r).not.toBeNull();
    expect(r!.ticker).toBe("VCB");
    expect(r!.year).toBe(2025);
    expect(r!.quarter).toBe(4);
  });

  test("AC-R5: VCB Q1 vs Q4 disambiguation — Q1 filename matches only Q1, not Q4", () => {
    const r1 = parsePdfFilenameTokens("VCB_2025_Q1.pdf", "");
    const r4 = parsePdfFilenameTokens("VCB_2025_Q4.pdf", "");
    expect(r1!.quarter).toBe(1);
    expect(r4!.quarter).toBe(4);
    // Q1 does NOT match Q4
    expect(r1!.quarter === r4!.quarter).toBe(false);
  });

  test("AC-R2: dated form 20250429-VCB-Bao-cao-tai-chinh-hop-nhat-Quy-1-nam-2025_signed.pdf → ticker=VCB, year=2025, quarter=1", () => {
    const f = "20250429-VCB-Bao-cao-tai-chinh-hop-nhat-Quy-1-nam-2025_signed.pdf";
    const r = parsePdfFilenameTokens(f, "");
    expect(r).not.toBeNull();
    expect(r!.ticker).toBe("VCB");
    expect(r!.year).toBe(2025);
    expect(r!.quarter).toBe(1);
  });

  test("AC-R3: dated FPT: 20260126-FPT-BCTC-hop-nhat-Quy-4-2025.pdf → ticker=FPT, year=2025, quarter=4", () => {
    const f = "20260126-FPT-BCTC-hop-nhat-Quy-4-2025.pdf";
    const r = parsePdfFilenameTokens(f, "");
    expect(r).not.toBeNull();
    expect(r!.ticker).toBe("FPT");
    expect(r!.year).toBe(2025);
    expect(r!.quarter).toBe(4);
  });

  test("AC-R4: month form BCTC VNM 31.12.2025 - HOP NHAT - VN.pdf → ticker=VNM, year=2025, quarter=4", () => {
    const f = "BCTC VNM 31.12.2025 - HOP NHAT - VN.pdf";
    const r = parsePdfFilenameTokens(f, "");
    expect(r).not.toBeNull();
    expect(r!.ticker).toBe("VNM");
    expect(r!.year).toBe(2025);
    expect(r!.quarter).toBe(4); // December → Q4
  });

  test("AC-R18: returns null for unrecognized filename with no year/quarter", () => {
    const r = parsePdfFilenameTokens("document.pdf", "");
    expect(r).toBeNull();
  });

  test("simple FPT form: FPT_2025_Q2.pdf → ticker=FPT, year=2025, quarter=2", () => {
    const r = parsePdfFilenameTokens("FPT_2025_Q2.pdf", "");
    expect(r).not.toBeNull();
    expect(r!.ticker).toBe("FPT");
    expect(r!.year).toBe(2025);
    expect(r!.quarter).toBe(2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// AC-R6..R9 — backfillBctcPdfPaths unit tests
// ═════════════════════════════════════════════════════════════════════════════

describe("REOPEN-2 AC-R6..R9 — backfillBctcPdfPaths()", () => {
  let db: Database;

  beforeEach(() => { db = setupTestDb(); });

  test("AC-R6: links exactly one file to a matching row", () => {
    const id = insertReport(db, { action_code: "VCB", period_year: 2025, period_quarter: 1, pdf_path: null });

    const { dir, cleanup } = createTempPdfDir(["VCB_2025_Q1.pdf"]);
    try {
      const result: BackfillResult = backfillBctcPdfPaths(db, dir);
      expect(result.updated).toBe(1);
      expect(result.no_match).toBe(0);
      expect(result.ambiguous).toBe(0);

      // Verify the DB row was updated
      const row = db.prepare("SELECT pdf_path FROM financial_reports WHERE id = ?").get(id) as { pdf_path: string | null };
      expect(row.pdf_path).toContain("VCB_2025_Q1.pdf");
    } finally { cleanup(); }
  });

  test("AC-R7: cover-letter + consolidated → picks consolidated (not ambiguous)", () => {
    // VCB_2025_Q1.pdf is a short-form cover-letter candidate; the dated long-form is
    // the consolidated report. With the cover-letter filter, this is no longer ambiguous —
    // the consolidated file is linked directly.
    const id = insertReport(db, { action_code: "VCB", period_year: 2025, period_quarter: 1, pdf_path: null });

    const { dir, cleanup } = createTempPdfDir([
      "VCB_2025_Q1.pdf",
      "20250429-VCB-Bao-cao-tai-chinh-hop-nhat-Quy-1-nam-2025_signed.pdf",
    ]);
    try {
      const result: BackfillResult = backfillBctcPdfPaths(db, dir);
      // cover-letter filter: VCB_2025_Q1 is filtered → consolidated wins
      expect(result.ambiguous).toBe(0);
      expect(result.updated).toBe(1);

      const row = db.prepare("SELECT pdf_path FROM financial_reports WHERE id = ?").get(id) as { pdf_path: string | null };
      expect(row.pdf_path).not.toBeNull();
      expect(row.pdf_path).toContain("20250429-VCB-Bao-cao-tai-chinh-hop-nhat");
    } finally { cleanup(); }
  });

  test("AC-R8: zero matches → leaves pdf_path NULL, no_match incremented", () => {
    const id = insertReport(db, { action_code: "VNM", period_year: 2025, period_quarter: 2, pdf_path: null });

    const { dir, cleanup } = createTempPdfDir(["VCB_2025_Q1.pdf"]); // VCB, not VNM
    try {
      const result: BackfillResult = backfillBctcPdfPaths(db, dir);
      expect(result.no_match).toBe(1);
      expect(result.updated).toBe(0);

      const row = db.prepare("SELECT pdf_path FROM financial_reports WHERE id = ?").get(id) as { pdf_path: string | null };
      expect(row.pdf_path).toBeNull();
    } finally { cleanup(); }
  });

  test("AC-R9: idempotent — already-linked rows not re-processed (WHERE pdf_path IS NULL skips them)", () => {
    // Row already has pdf_path set
    insertReport(db, {
      action_code: "VCB",
      period_year: 2025,
      period_quarter: 1,
      pdf_path: "/app/data/pdfs/VCB_2025_Q1.pdf",
    });

    const { dir, cleanup } = createTempPdfDir(["VCB_2025_Q1.pdf"]);
    try {
      const result: BackfillResult = backfillBctcPdfPaths(db, dir);
      // Already set — nothing to update
      expect(result.updated).toBe(0);
      expect(result.already_set).toBe(1);
    } finally { cleanup(); }
  });

  test("AC-R9b: running twice links the row only once", () => {
    insertReport(db, { action_code: "VCB", period_year: 2025, period_quarter: 1, pdf_path: null });

    const { dir, cleanup } = createTempPdfDir(["VCB_2025_Q1.pdf"]);
    try {
      const first = backfillBctcPdfPaths(db, dir);
      const second = backfillBctcPdfPaths(db, dir);
      expect(first.updated).toBe(1);
      // Second run: pdf_path now set → WHERE pdf_path IS NULL finds nothing
      expect(second.updated).toBe(0);
      expect(second.already_set).toBe(1);
    } finally { cleanup(); }
  });

  test("AC-R17: pdfDir not found → returns zero counts, no crash", () => {
    insertReport(db, { action_code: "VCB", period_year: 2025, period_quarter: 1, pdf_path: null });
    const result = backfillBctcPdfPaths(db, "/nonexistent/path/to/pdfs");
    expect(result.updated).toBe(0);
    expect(result.no_match).toBe(0);
    expect(result.ambiguous).toBe(0);
  });

  test("correctly resolves two different rows to two different files", () => {
    const id1 = insertReport(db, { action_code: "VCB", period_year: 2025, period_quarter: 1, sort_key: "2025-Q1-vcb", pdf_path: null });
    const id2 = insertReport(db, { action_code: "VNM", period_year: 2025, period_quarter: 4, sort_key: "2025-Q4-vnm", pdf_path: null });

    const { dir, cleanup } = createTempPdfDir([
      "VCB_2025_Q1.pdf",
      "VNM_2025_Q4.pdf",
    ]);
    try {
      const result = backfillBctcPdfPaths(db, dir);
      expect(result.updated).toBe(2);

      const r1 = db.prepare("SELECT pdf_path FROM financial_reports WHERE id = ?").get(id1) as { pdf_path: string | null };
      const r2 = db.prepare("SELECT pdf_path FROM financial_reports WHERE id = ?").get(id2) as { pdf_path: string | null };
      expect(r1.pdf_path).toContain("VCB_2025_Q1.pdf");
      expect(r2.pdf_path).toContain("VNM_2025_Q4.pdf");
    } finally { cleanup(); }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// AC-R10..R14 — handleBctcInspectDocs REOPEN-2 tests
// ═════════════════════════════════════════════════════════════════════════════

describe("REOPEN-2 AC-R10..R14 — GET /api/bctc-inspect/docs with all rows", () => {
  let db: Database;

  beforeEach(() => { db = setupTestDb(); });

  test("AC-R10: LIST returns rows with pdf_path IS NULL (no filter exclusion)", () => {
    // Insert 3 rows: 1 with pdf_path set, 2 with pdf_path IS NULL
    insertReport(db, { action_code: "VCB", period_quarter: 1, sort_key: "2025-Q1-vcb", pdf_path: "/app/data/pdfs/VCB_2025_Q1.pdf" });
    insertReport(db, { action_code: "VNM", period_quarter: 4, sort_key: "2025-Q4-vnm", pdf_path: null });
    insertReport(db, { action_code: "HPG", period_quarter: 2, sort_key: "2025-Q2-hpg", pdf_path: null });

    const { res, getBody } = mockRes();
    handleBctcInspectDocs(mockReq("/api/bctc-inspect/docs"), res, db);

    const body = getBody() as { count: number; items: DocListItem[] };
    expect(body.count).toBe(3);
  });

  test("AC-R12: has_pdf=false for rows with pdf_path IS NULL", () => {
    insertReport(db, { action_code: "VNM", period_quarter: 4, sort_key: "2025-Q4-vnm2", pdf_path: null });

    const { res, getBody } = mockRes();
    handleBctcInspectDocs(mockReq("/api/bctc-inspect/docs"), res, db);

    const body = getBody() as { items: DocListItem[] };
    expect(body.items[0]!.has_pdf).toBe(false);
  });

  test("AC-R11: has_pdf=true when pdf_path set and existsSync would return true (test file exists on disk)", () => {
    // Use a real temp file to test existsSync
    const tmpFile = resolve(tmpdir(), `vcb-test-${Date.now()}.pdf`);
    writeFileSync(tmpFile, Buffer.alloc(10240, 0x25));
    try {
      insertReport(db, { action_code: "VCB", period_quarter: 1, sort_key: "2025-Q1-vcb-fs", pdf_path: tmpFile });

      const { res, getBody } = mockRes();
      handleBctcInspectDocs(mockReq("/api/bctc-inspect/docs"), res, db);

      const body = getBody() as { items: DocListItem[] };
      expect(body.items[0]!.has_pdf).toBe(true);
    } finally {
      try { rmSync(tmpFile); } catch {}
    }
  });

  test("AC-R13: has_ocr=true via secondary OCR join when pdf_path IS NULL", () => {
    // Row with no pdf_path but OCR exists under a filename matching (VNM, 2025, Q4)
    insertReport(db, { action_code: "VNM", period_year: 2025, period_quarter: 4, sort_key: "2025-Q4-vnm-ocr", pdf_path: null });
    // Insert OCR rows under a canonical filename that parsePdfFilenameTokens will match
    insertOcrPage(db, "VNM_2025_Q4.pdf", 1, "BCTC VNM page 1");

    const { res, getBody } = mockRes();
    handleBctcInspectDocs(mockReq("/api/bctc-inspect/docs"), res, db);

    const body = getBody() as { items: DocListItem[] };
    const item = body.items.find((i) => i.action_code === "VNM")!;
    expect(item).toBeDefined();
    expect(item.has_ocr).toBe(true);
    expect(item.has_pdf).toBe(false); // still no pdf_path
  });

  test("AC-R14: has_ocr=false when no OCR filename matches (pdf_path IS NULL, no OCR rows)", () => {
    insertReport(db, { action_code: "ACB", period_year: 2025, period_quarter: 3, sort_key: "2025-Q3-acb", pdf_path: null });
    // No OCR rows for ACB

    const { res, getBody } = mockRes();
    handleBctcInspectDocs(mockReq("/api/bctc-inspect/docs"), res, db);

    const body = getBody() as { items: DocListItem[] };
    const item = body.items.find((i) => i.action_code === "ACB")!;
    expect(item.has_ocr).toBe(false);
    expect(item.has_pdf).toBe(false);
  });

  test("AC-R16: news-inference rows (all-null figures, pdf_path NULL) still appear in list", () => {
    // Simulate a typical news-inference row: all figures null/zero, no pdf_path
    insertReport(db, {
      action_code: "SHB",
      period_year: 2025,
      period_quarter: 1,
      sort_key: "2025-Q1-shb",
      pdf_path: null,
      net_profit: null,
      net_profit_api_bridge: null,
    });

    const { res, getBody } = mockRes();
    handleBctcInspectDocs(mockReq("/api/bctc-inspect/docs"), res, db);

    const body = getBody() as { items: DocListItem[] };
    const item = body.items.find((i) => i.action_code === "SHB");
    expect(item).toBeDefined();
    expect(item!.has_pdf).toBe(false);
    expect(item!.has_ocr).toBe(false);
    expect(item!.net_profit).toBeNull();
  });

  test("junk exclusion still works (action_code with 'example' excluded)", () => {
    insertReport(db, { action_code: "example-corp", period_quarter: 1, sort_key: "2025-Q1-ex", pdf_path: null });
    insertReport(db, { action_code: "VCB", period_quarter: 1, sort_key: "2025-Q1-vcb-junk", pdf_path: null });

    const { res, getBody } = mockRes();
    handleBctcInspectDocs(mockReq("/api/bctc-inspect/docs"), res, db);

    const body = getBody() as { count: number; items: DocListItem[] };
    expect(body.count).toBe(1);
    expect(body.items[0]!.action_code).toBe("VCB");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// AC-R15 — OCR endpoint secondary join (pdf_path IS NULL but OCR match found)
// ═════════════════════════════════════════════════════════════════════════════

describe("REOPEN-2 AC-R15 — OCR endpoint secondary join", () => {
  let db: Database;

  beforeEach(() => { db = setupTestDb(); });

  test("AC-R15: OCR endpoint returns text via secondary join when pdf_path IS NULL", () => {
    const id = insertReport(db, {
      action_code: "VNM",
      period_year: 2025,
      period_quarter: 4,
      sort_key: "2025-Q4-vnm-ocr2",
      pdf_path: null,
    });
    insertOcrPage(db, "VNM_2025_Q4.pdf", 1, "Bao cao tai chinh VNM Q4 2025 page 1");
    insertOcrPage(db, "VNM_2025_Q4.pdf", 2, "Bao cao tai chinh VNM Q4 2025 page 2");

    const { res, getStatus, getBody } = mockRes();
    handleBctcInspectOcr(mockReq(`/api/bctc-inspect/ocr/${id}?page=1`), res, db, id);

    expect(getStatus()).toBe(200);
    const body = getBody() as OcrPageResponse;
    expect(body.total_pages).toBe(2);
    expect(body.text_content).toContain("VNM Q4 2025 page 1");
    expect(body.filename).toBe("VNM_2025_Q4.pdf");
    expect(body.has_more).toBe(true);
  });

  test("OCR endpoint still returns figures (not null) for news-inference rows", () => {
    const id = insertReport(db, {
      action_code: "ACB",
      period_year: 2025,
      period_quarter: 2,
      sort_key: "2025-Q2-acb-ocr",
      pdf_path: null,
      net_profit: 1234.56,
      net_profit_api_bridge: 1300.00,
    });

    const { res, getStatus, getBody } = mockRes();
    handleBctcInspectOcr(mockReq(`/api/bctc-inspect/ocr/${id}?page=1`), res, db, id);

    expect(getStatus()).toBe(200);
    const body = getBody() as OcrPageResponse;
    expect(body.figures).not.toBeNull();
    expect(body.figures!.net_profit).toBeCloseTo(1234.56, 2);
    // No OCR text available — honest degrade
    expect(body.total_pages).toBe(0);
    expect(body.text_content).toBe("");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Structural: backfillBctcPdfPaths writes ONLY pdf_path
// ═════════════════════════════════════════════════════════════════════════════

describe("REOPEN-2 — backfillBctcPdfPaths writes ONLY pdf_path column", () => {
  test("handler file (backfillBctcPdfPaths) contains no DELETE or INSERT statements", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve: r } = await import("node:path");
    const src = readFileSync(
      r(import.meta.dir, "../application/usecases/backfillBctcPdfPaths.ts"),
      "utf-8",
    );
    // UPDATE is expected (UPDATE financial_reports SET pdf_path...) but only for pdf_path
    const hasInsert = /\bINSERT\b/.test(src);
    const hasDelete = /\bDELETE\b/.test(src);
    expect(hasInsert).toBe(false);
    expect(hasDelete).toBe(false);
    // Verify UPDATE is scoped to SET pdf_path
    const updateMatches = src.match(/`[^`]*\bUPDATE\b[^`]*`/g) ?? [];
    for (const m of updateMatches) {
      expect(m).toContain("SET pdf_path");
    }
  });
});
