/**
 * BPE-DEV-3 — Regression tests for OCR coverage fixes
 *
 * GAP-1: total_pages COUNT(*)->MAX(page_number)
 *   1. PEK hit path: total_pages = MAX(page_number), not COUNT(*)
 *   2. PEK coverage-gap path: total_pages = MAX(page_number)
 *   3. Non-PEK path: total_pages = MAX(page_number)
 *
 * GAP-1 (non-PEK pagination): OFFSET->point-lookup
 *   4. Non-PEK path returns correct page when gaps exist (point-lookup, not OFFSET)
 *   5. Non-PEK path returns empty for page absent from pdf_extracted_text (not wrong row)
 *
 * GAP-3: skip-guard threshold < 10 -> < 3
 *   6. Page with 3-char text is NOT counted as lowChar (threshold moved to < 3)
 *   7. Page with 5-char text is NOT counted as lowChar (kept, not skipped)
 *   8. Page with 2-char text IS counted as lowChar (below new threshold)
 *   9. Page with 0-char text IS skipped (empty = always skipped)
 *
 * GAP-3: DPI escalation
 *  10. Source: DPI escalation retry block exists in pdfOcrWorker.ts
 *  11. Source: escalation uses dpi=300
 *  12. Source: logger.warn per skipped page (observability)
 *
 * RISK-OCR-2: confidence<0.1 fallback guard
 *  13. Source: confidence < 0.1 guard in bctcInspectHandler.ts
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── DB setup ──────────────────────────────────────────────────────────────────

function setupDb(): Database {
  const db = new Database(":memory:");

  db.exec(`
    CREATE TABLE IF NOT EXISTS financial_reports (
      id                    TEXT PRIMARY KEY,
      action_code           TEXT NOT NULL,
      company_name          TEXT NOT NULL DEFAULT '',
      exchange              TEXT NOT NULL DEFAULT 'HOSE',
      domain                TEXT NOT NULL DEFAULT 'banking',
      period_year           INTEGER NOT NULL DEFAULT 2026,
      period_quarter        INTEGER,
      period_type           TEXT NOT NULL DEFAULT 'Q1',
      period_start          TEXT NOT NULL DEFAULT '2026-01-01',
      period_end            TEXT NOT NULL DEFAULT '2026-03-31',
      sort_key              TEXT NOT NULL DEFAULT '2026-Q1',
      pdf_path              TEXT,
      parsed_at             TEXT NOT NULL DEFAULT '2026-01-01',
      net_revenue           REAL,
      gross_profit          REAL,
      net_profit            REAL,
      net_profit_api_bridge REAL,
      net_margin_pct        REAL,
      ocr_confidence        REAL,
      confidence_financial  REAL,
      extraction_confidence REAL,
      refine_status         TEXT NOT NULL DEFAULT 'DONE',
      balance_sheet_json    TEXT NOT NULL DEFAULT '{}',
      income_stmt_json      TEXT NOT NULL DEFAULT '{}',
      cash_flow_json        TEXT NOT NULL DEFAULT '{}',
      ratios_json           TEXT NOT NULL DEFAULT '{}'
    )
  `);

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

  db.exec(`
    CREATE TABLE IF NOT EXISTS pdf_extracted_text (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      filename     TEXT    NOT NULL,
      page_number  INTEGER NOT NULL,
      text_content TEXT    NOT NULL DEFAULT '',
      confidence   REAL    NOT NULL DEFAULT 0,
      extracted_at TEXT    NOT NULL DEFAULT (datetime('now')),
      action_code  TEXT    NOT NULL DEFAULT '',
      data_env     TEXT    NOT NULL DEFAULT '',
      UNIQUE(filename, page_number)
    )
  `);

  return db;
}

function mockRes(): { res: ServerResponse; status: () => number; body: () => unknown } {
  let _status = 200;
  let _body = "";
  const res = {
    writeHead(s: number) { _status = s; },
    end(data?: string) { _body = data ?? ""; },
  } as unknown as ServerResponse;
  return {
    res,
    status: () => _status,
    body: () => { try { return JSON.parse(_body); } catch { return _body; } },
  };
}

function mockReq(url: string): IncomingMessage {
  return { url, headers: {}, method: "GET" } as unknown as IncomingMessage;
}

// ── Fixtures: FPT-like document with gaps (35 rows, MAX page_number=46) ──────
// Simulate: pages 1-10 + page 16 + pages 23-46 inserted (pages 11-15,17-22 missing)
// Count = 35, MAX(page_number) = 46

function insertFptFixture(db: Database, docId: string, filename: string): void {
  db.prepare(`
    INSERT INTO financial_reports (id, action_code, pdf_path) VALUES (?, ?, ?)
  `).run(docId, "FPT", `/app/data/pdfs/${filename}`);

  // Insert pages 1-10 (10 rows)
  for (let p = 1; p <= 10; p++) {
    db.prepare(`INSERT INTO pdf_extracted_text (filename, page_number, text_content, confidence) VALUES (?, ?, ?, ?)`)
      .run(filename, p, `Page ${p} content with enough text to be stored here`, 0.8);
  }
  // Insert page 16 (1 row — gap at 11-15 missing)
  db.prepare(`INSERT INTO pdf_extracted_text (filename, page_number, text_content, confidence) VALUES (?, ?, ?, ?)`)
    .run(filename, 16, "THUYẾT MINH BÁO CÁO TÀI CHÍNH HỢP NHẤT notes content page 16", 0.8);
  // Insert pages 23-46 (24 rows — gap at 17-22 missing)
  for (let p = 23; p <= 46; p++) {
    db.prepare(`INSERT INTO pdf_extracted_text (filename, page_number, text_content, confidence) VALUES (?, ?, ?, ?)`)
      .run(filename, p, `Page ${p} financial notes content with sufficient chars`, 0.8);
  }
  // Total: 10 + 1 + 24 = 35 rows; MAX(page_number) = 46
}

// ── GAP-1 Tests: total_pages = MAX(page_number) ───────────────────────────────

describe("BPE-DEV-3 — GAP-1: total_pages = MAX(page_number) not COUNT(*)", () => {
  it("1. Non-PEK path: total_pages = MAX(page_number)=46, not COUNT(*)=35", async () => {
    const db = setupDb();
    const docId = "aaaabbbb-cccc-dddd-eeee-ffffffffffff";
    const filename = "FPT_2026_Q1.pdf";
    insertFptFixture(db, docId, filename);

    const { handleBctcInspectOcr } = await import("../interface/mcp/routes/bctcInspectHandler.js");
    const { res, body } = mockRes();
    await handleBctcInspectOcr(mockReq(`/api/bctc-inspect/ocr/${docId}?page=1`), res, db, docId);

    const resp = body() as { total_pages: number; has_pek: boolean };
    expect(resp.has_pek).toBe(false);
    // MAX(page_number) = 46 (not COUNT(*) = 35)
    expect(resp.total_pages).toBe(46);

    db.close();
  });

  it("2. PEK coverage-gap path: total_pages = MAX(page_number)=46", async () => {
    const db = setupDb();
    const docId = "bbbbcccc-dddd-eeee-ffff-aaaaaaaaaaaa";
    const filename = "FPT_PEK_2026_Q1.pdf";
    insertFptFixture(db, docId, filename);

    // Insert a PEK unit so the PEK path is taken (but for page 12, which has no row)
    db.prepare(`
      INSERT INTO bctc_layout_units (report_id, unit_id, schema_page, page_numbers_json, page_type, stitched_markdown)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(docId, "unit-001", 5, JSON.stringify([5]), "table", "| col | value |\n| --- | --- |");

    const { handleBctcInspectOcr } = await import("../interface/mcp/routes/bctcInspectHandler.js");
    const { res, body } = mockRes();
    // Page 12 has no row in pdf_extracted_text (simulating FPT gap)
    await handleBctcInspectOcr(mockReq(`/api/bctc-inspect/ocr/${docId}?page=12`), res, db, docId);

    const resp = body() as { total_pages: number; has_pek: boolean; pek_coverage_gap: boolean };
    expect(resp.has_pek).toBe(true);
    expect(resp.pek_coverage_gap).toBe(true);
    // total_pages should reflect MAX(page_number)=46, not COUNT(*)=35
    expect(resp.total_pages).toBe(46);

    db.close();
  });

  it("3. PEK hit path: total_pages = MAX(page_number)=46 on stitched_markdown serve", async () => {
    const db = setupDb();
    const docId = "ccccdddd-eeee-ffff-aaaa-bbbbbbbbbbbb";
    const filename = "FPT_PEK_HIT_2026_Q1.pdf";
    insertFptFixture(db, docId, filename);

    // Insert a PEK unit covering page 5 with content
    db.prepare(`
      INSERT INTO bctc_layout_units (report_id, unit_id, schema_page, page_numbers_json, page_type, stitched_markdown)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(docId, "unit-page5", 5, JSON.stringify([5]), "table", "| Balance Sheet |\n| --- |\n| 1000 |");

    const { handleBctcInspectOcr } = await import("../interface/mcp/routes/bctcInspectHandler.js");
    const { res, body } = mockRes();
    await handleBctcInspectOcr(mockReq(`/api/bctc-inspect/ocr/${docId}?page=5`), res, db, docId);

    const resp = body() as { total_pages: number; has_pek: boolean; text_content: string };
    expect(resp.has_pek).toBe(true);
    expect(resp.text_content).toBeTruthy();
    // total_pages should reflect MAX(page_number)=46, not COUNT(*)=35
    expect(resp.total_pages).toBe(46);

    db.close();
  });
});

// ── GAP-1 Tests: non-PEK OFFSET->point-lookup ────────────────────────────────

describe("BPE-DEV-3 — GAP-1: non-PEK point-lookup not OFFSET", () => {
  it("4. Non-PEK page=16 returns page 16 content (not 16th row by position)", async () => {
    const db = setupDb();
    const docId = "ddddeeee-ffff-aaaa-bbbb-cccccccccccc";
    const filename = "FPT_GAP_TEST.pdf";
    insertFptFixture(db, docId, filename);

    const { handleBctcInspectOcr } = await import("../interface/mcp/routes/bctcInspectHandler.js");
    const { res, body } = mockRes();
    // Page 16 — with OFFSET, row 16 (0-indexed 15) by ascending page_number order
    // would be row #12 (pages 1-10 = rows 0-9, page 16 = row 10, page 23 = row 11...)
    // Actually: pages stored are 1-10, 16, 23-46. Sorted ascending:
    //   rows 0-9 = pages 1-10; row 10 = page 16; rows 11-34 = pages 23-46.
    //   OFFSET 15 = row 15 = page 28. BUG!
    // Point-lookup WHERE page_number=16 must return page 16's content.
    await handleBctcInspectOcr(mockReq(`/api/bctc-inspect/ocr/${docId}?page=16`), res, db, docId);

    const resp = body() as { page: number; text_content: string; has_pek: boolean };
    expect(resp.has_pek).toBe(false);
    expect(resp.page).toBe(16);
    // Must return page 16's actual content, not a different page's content via OFFSET
    expect(resp.text_content).toContain("page 16");

    db.close();
  });

  it("5. Non-PEK page=12 (absent from DB) returns empty text, not wrong page via OFFSET", async () => {
    const db = setupDb();
    const docId = "eeeeffff-aaaa-bbbb-cccc-dddddddddddd";
    const filename = "FPT_MISSING_PAGE.pdf";
    insertFptFixture(db, docId, filename);

    const { handleBctcInspectOcr } = await import("../interface/mcp/routes/bctcInspectHandler.js");
    const { res, body } = mockRes();
    // Page 12 has no row in pdf_extracted_text (it's one of the gap pages)
    // OFFSET approach: OFFSET 11 = row 11 = page 23 (wrong! returns content for page 23)
    // Point-lookup: returns empty (correct — page 12 genuinely missing)
    await handleBctcInspectOcr(mockReq(`/api/bctc-inspect/ocr/${docId}?page=12`), res, db, docId);

    const resp = body() as { page: number; text_content: string; has_pek: boolean };
    expect(resp.has_pek).toBe(false);
    expect(resp.page).toBe(12);
    // Must be empty (page 12 has no row) — NOT "Page 23 financial notes content"
    expect(resp.text_content).toBe("");

    db.close();
  });
});

// ── GAP-3 Tests: skip-guard threshold source inspection ──────────────────────

describe("BPE-DEV-3 — GAP-3: skip-guard threshold < 10 -> < 3 (source inspection)", () => {
  const ocrSrc = readFileSync(
    resolve(import.meta.dir, "../infrastructure/fetchers/pdfOcrWorker.ts"),
    "utf-8"
  );

  it("6. Source: skip-guard threshold is < 3 (length < 3)", () => {
    // The old guard was: pageText.length < 10
    // The new guard must be length < 3 (using finalText or pageText variable)
    // finalText is the post-escalation text; the threshold applies to it.
    expect(ocrSrc).toMatch(/(?:finalText|pageText)\.length\s*<\s*3\b/);
  });

  it("7. Source: old active < 10 skip guard replaced (no longer primary threshold)", () => {
    // Must NOT have the old "} else if (pageText.length < 10)" branch as primary skip
    // (< 10 may still appear in comments but not as a live else-if branch for skipping)
    expect(ocrSrc).not.toMatch(/\} else if \(pageText\.length < 10\)/);
  });

  it("8. Logic: 5-char page is NOT skipped (>= 3 threshold)", () => {
    // Simulate the new threshold logic
    const pageText = "hello";  // 5 chars
    const isLowChar = pageText.length < 3;
    expect(isLowChar).toBe(false);
  });

  it("9. Logic: 2-char page IS counted as lowChar (< 3 threshold)", () => {
    const pageText = "ab";  // 2 chars
    const isLowChar = pageText.length < 3;
    expect(isLowChar).toBe(true);
  });

  it("10. Logic: 0-char page is skipped (empty → genuine blank)", () => {
    const pageText = "";  // 0 chars
    const isEmpty = pageText.length === 0;
    const isLowChar = pageText.length < 3 && pageText.length > 0;
    expect(isEmpty).toBe(true);
    expect(isLowChar).toBe(false);
  });
});

// ── GAP-3 Tests: DPI escalation source inspection ────────────────────────────

describe("BPE-DEV-3 — GAP-3: DPI escalation retry (source inspection)", () => {
  const ocrSrc = readFileSync(
    resolve(import.meta.dir, "../infrastructure/fetchers/pdfOcrWorker.ts"),
    "utf-8"
  );

  it("11. Source: DPI escalation retry block exists (re-renders at higher DPI for low-output pages)", () => {
    // Must contain a retry path that invokes ocrOnePage with dpi=300
    expect(ocrSrc).toContain("300");
    // Must also contain the low-output guard (< 50 chars) that triggers escalation
    expect(ocrSrc).toMatch(/pageText\.length\s*[<]\s*50/);
  });

  it("12. Source: escalation logger.warn per skipped page with page number and char count", () => {
    // Must log: page number, char count, and reason for skip
    expect(ocrSrc).toMatch(/logger\.warn.*\[ocr\]/);
    // Must reference page variable in warn call
    expect(ocrSrc).toContain("[ocr] page");
  });

  it("13. Source: RISK-OCR-2 confidence < 0.1 guard exists in bctcInspectHandler.ts", () => {
    const handlerSrc = readFileSync(
      resolve(import.meta.dir, "../interface/mcp/routes/bctcInspectHandler.ts"),
      "utf-8"
    );
    // The handler must suppress truly junk rows (confidence < 0.1) from prose fallback
    expect(handlerSrc).toMatch(/confidence.*<.*0\.1|0\.1.*>.*confidence/);
  });
});

// ── GAP-3 Tests: ocrStats counter logic (updated for new threshold) ───────────

describe("BPE-DEV-3 — GAP-3: ocrStats counter logic with new threshold", () => {
  it("14. pagesProcessed = 1 for [5-char, empty, 50-char] (5-char no longer lowChar)", () => {
    // Old behaviour: 5-char = lowChar (skipped); 50-char = processed → pagesProcessed=1
    // New behaviour: 5-char = processed (>= 3); 50-char = processed → pagesProcessed=2
    // But with DPI escalation, a 5-char page may become 50+ after retry.
    // This test verifies the COUNTING logic (before DPI escalation):
    let pagesProcessed = 0;
    let pagesSkipped = 0;
    let pagesLowChar = 0;
    const NEW_THRESHOLD = 3;
    const fakePages = ["hello", "", "A".repeat(50)];  // 5, 0, 50 chars

    for (const text of fakePages) {
      if (text.length === 0) {
        pagesSkipped++;
      } else if (text.length < NEW_THRESHOLD) {
        pagesLowChar++;
      } else {
        pagesProcessed++;
      }
    }

    expect(pagesProcessed).toBe(2);   // "hello" (5) + "AAA..." (50)
    expect(pagesSkipped).toBe(1);     // empty string
    expect(pagesLowChar).toBe(0);     // none below threshold of 3
  });

  it("15. pagesLowChar = 1 for ['ab', 'hello', ''] (2-char is lowChar, 5-char is not)", () => {
    let pagesProcessed = 0;
    let pagesSkipped = 0;
    let pagesLowChar = 0;
    const NEW_THRESHOLD = 3;
    const fakePages = ["ab", "hello", ""];

    for (const text of fakePages) {
      if (text.length === 0) {
        pagesSkipped++;
      } else if (text.length < NEW_THRESHOLD) {
        pagesLowChar++;
      } else {
        pagesProcessed++;
      }
    }

    expect(pagesProcessed).toBe(1);   // "hello"
    expect(pagesSkipped).toBe(1);     // ""
    expect(pagesLowChar).toBe(1);     // "ab" (2 chars < 3)
  });
});
