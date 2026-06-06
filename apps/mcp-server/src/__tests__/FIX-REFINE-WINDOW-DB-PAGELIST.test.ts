/**
 * FIX-REFINE-WINDOW-DB-PAGELIST.test.ts
 *
 * Task: FIX-REFINE-WINDOW-DB-PAGELIST
 * Signal: rtr-refine-window-truncation-202606060950
 *
 * Defect: fetchAllPageTexts broke at the first missing/empty interior page
 * (treated as EOF). DGC report 0c6f0535 had 45/46 pages in pdf_extracted_text;
 * page 27 absent → windows[] truncated to p1-26, silently dropping p28-46.
 *
 * Fix: DB-driven page list — SELECT DISTINCT page_number FROM pdf_extracted_text
 * WHERE filename = ? ORDER BY page_number. Missing pages are skipped, not EOF.
 *
 * Tests:
 *   DPL-1: 46-page fixture with page 27 absent → pageTexts covers all 45 pages,
 *           no page > 26 is dropped, pages 28-46 all present.
 *   DPL-2: windows[] partitions past the gap — pages 28-46 produce windows.
 *   DPL-3: getPageListFn injection works — hermetic, no DB required.
 *   DPL-4: MAX_PAGES cap — list longer than 200 is trimmed to 200.
 *   DPL-5: getPageTextFn-only injection (no getPageListFn, no db) → legacy
 *           sequential-probe Path A (existing tests are not regressed).
 *   DPL-6: Production DB path with db injection + interior gap → 45 pages.
 *   DPL-7: refineOneReport end-to-end with DB page list + interior gap →
 *           windows cover pages beyond the gap (p28 present in some window).
 *
 * DDD: fetchAllPageTexts is scheduler layer; tests inject via FetchPageTextsDeps.
 * All DB operations use bun:sqlite in-memory Database().
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initFinancialReportsTables } from "../infrastructure/db/schema-financial-reports.js";
import {
  fetchAllPageTexts,
  refineOneReport,
  type FetchPageTextsDeps,
  type WindowResult,
} from "../scheduler/financial-reports/bctcRefineJob.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

const DGC_FILENAME = "20260130-DGC-BCTC-hop-nhat-quy-4-2025.pdf";
const TOTAL_PAGES = 46;
const MISSING_PAGE = 27;

/**
 * Seed pdf_extracted_text with pages 1-46 EXCEPT page 27 (interior gap).
 * Simulates the live DGC 0c6f0535 case proven by the defect report.
 */
function seedPdfExtractedText(db: Database, filename: string): void {
  const insert = db.prepare(
    `INSERT OR REPLACE INTO pdf_extracted_text (filename, page_number, text_content, confidence)
     VALUES (?, ?, ?, ?)`,
  );
  for (let p = 1; p <= TOTAL_PAGES; p++) {
    if (p === MISSING_PAGE) continue; // deliberately absent — the interior gap
    const text =
      p === 1
        ? "BẢNG CÂN ĐỐI KẾ TOÁN | Mã số | Thuyết minh | Số cuối kỳ |"
        : p === 28
          ? "tiếp theo\n| 200 | Phải thu ngắn hạn | 1.234.567 |" // continuation page after gap
          : `Nội dung trang ${p} — dữ liệu tài chính | Mã số | giá trị |`;
    insert.run(filename, p, text, 0.92);
  }
}

function makeInMemoryDb(): Database {
  const db = new Database(":memory:");
  initFinancialReportsTables(db);
  return db;
}

function seedReport(db: Database, id: string, filename: string): void {
  const pdfPath = `/app/data/pdfs/${filename}`;
  db.prepare(
    `INSERT OR REPLACE INTO financial_reports
       (id, action_code, company_name, exchange, domain,
        period_year, period_quarter, period_type,
        period_start, period_end, sort_key, parsed_at, extraction_confidence,
        pdf_path, text_status, refine_status,
        balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETE', 'PENDING', '{}', '{}', '{}', '{}')`,
  ).run(
    id, "DGC", "Đạm Cà Mau", "HOSE", "chemicals",
    2025, "Q4", "Q4", "2025-10-01", "2025-12-31", "2025-Q4",
    new Date().toISOString(), 0.9, pdfPath,
  );
}

// ── DPL-1: 46-page fixture with page 27 absent → 45 pages returned ────────────

describe("FIX-REFINE-WINDOW-DB-PAGELIST: fetchAllPageTexts interior gap", () => {
  it("DPL-1: DB-driven path returns 45 pages when page 27 is absent from pdf_extracted_text", async () => {
    const db = makeInMemoryDb();
    seedPdfExtractedText(db, DGC_FILENAME);

    const pageTexts = await fetchAllPageTexts("dgc-test-id", DGC_FILENAME, { db });

    // Must return exactly 45 pages (46 seeded − 1 missing)
    expect(pageTexts).toHaveLength(45);

    // Page 27 must NOT appear
    const pages = pageTexts.map((pt) => pt.page);
    expect(pages).not.toContain(27);

    // Pages 1-26 must all be present
    for (let p = 1; p <= 26; p++) {
      expect(pages).toContain(p);
    }

    // Pages 28-46 must ALL be present (the formerly-truncated tail)
    for (let p = 28; p <= 46; p++) {
      expect(pages).toContain(p);
    }
  });

  // ── DPL-2: windows[] partitions past the gap ────────────────────────────────

  it("DPL-2: windows[] produced from DB-driven page list include pages beyond the gap", async () => {
    const db = makeInMemoryDb();
    seedPdfExtractedText(db, DGC_FILENAME);

    const { partitionIntoWindows } = await import(
      "../scheduler/financial-reports/bctcRefineJob.js"
    );

    const pageTexts = await fetchAllPageTexts("dgc-test-id", DGC_FILENAME, { db });
    const windows = partitionIntoWindows(pageTexts, { maxWindowPages: 3 });

    // Must have windows — 45 pages / ~3 per window ≈ 15 windows (continuation may vary)
    expect(windows.length).toBeGreaterThan(10);

    // Flatten all page_numbers from all windows
    const allPagesInWindows = windows.flatMap((w) => w.page_numbers);

    // Page 27 absent → not in any window (correct: it was never in DB)
    expect(allPagesInWindows).not.toContain(27);

    // Page 28 MUST appear in some window (formerly truncated — the core regression)
    expect(allPagesInWindows).toContain(28);

    // Pages 30-46 must be present in windows (sanity check post-gap coverage)
    for (const p of [30, 35, 40, 46]) {
      expect(allPagesInWindows).toContain(p);
    }
  });

  // ── DPL-3: getPageListFn injection — hermetic, no DB ──────────────────────

  it("DPL-3: getPageListFn injection drives iteration without a real DB", async () => {
    // Simulate 46 pages with page 27 absent — no DB needed
    const fakeRows = Array.from({ length: TOTAL_PAGES }, (_, i) => i + 1)
      .filter((p) => p !== MISSING_PAGE)
      .map((p) => ({
        page_number: p,
        text_content: `fake text for page ${p}`,
      }));

    const deps: FetchPageTextsDeps = {
      getPageListFn: async () => fakeRows,
    };

    const pageTexts = await fetchAllPageTexts("dgc-test-id", DGC_FILENAME, deps);

    expect(pageTexts).toHaveLength(45);
    expect(pageTexts.map((pt) => pt.page)).not.toContain(27);
    expect(pageTexts.map((pt) => pt.page)).toContain(28);
    expect(pageTexts.map((pt) => pt.page)).toContain(46);
  });

  // ── DPL-3b: getPageListFn + getPageTextFn override ────────────────────────

  it("DPL-3b: getPageListFn + getPageTextFn — page list from fn, text override from fn", async () => {
    const fakeRows = [
      { page_number: 1, text_content: "db text 1" },
      { page_number: 3, text_content: "db text 3" }, // gap at page 2
      { page_number: 5, text_content: "db text 5" },
    ];

    let fetchedPages: number[] = [];
    const deps: FetchPageTextsDeps = {
      getPageListFn: async () => fakeRows,
      getPageTextFn: async (_reportId, _filename, pageNum) => {
        fetchedPages.push(pageNum);
        return `override text for page ${pageNum}`;
      },
    };

    const pageTexts = await fetchAllPageTexts("test-id", "test.pdf", deps);

    // Only pages from the list are iterated (1, 3, 5 — not 2 or 4)
    expect(pageTexts).toHaveLength(3);
    expect(fetchedPages).toEqual([1, 3, 5]); // page 2 never fetched
    expect(pageTexts[0]!.text).toBe("override text for page 1");
    expect(pageTexts[1]!.page).toBe(3);
    expect(pageTexts[2]!.page).toBe(5);
  });

  // ── DPL-4: MAX_PAGES cap ──────────────────────────────────────────────────

  it("DPL-4: page list longer than MAX_PAGES (200) is capped to 200", async () => {
    // 250 pages, no gaps
    const fakeRows = Array.from({ length: 250 }, (_, i) => ({
      page_number: i + 1,
      text_content: `page ${i + 1}`,
    }));

    const deps: FetchPageTextsDeps = {
      getPageListFn: async () => fakeRows,
    };

    const pageTexts = await fetchAllPageTexts("test-id", "test.pdf", deps);

    // Safety cap: at most 200 pages
    expect(pageTexts).toHaveLength(200);
    expect(pageTexts[199]!.page).toBe(200); // last page is 200, not 250
  });

  // ── DPL-5: getPageTextFn-only (no db, no getPageListFn) → Path A ─────────

  it("DPL-5: getPageTextFn-only injection triggers legacy sequential-probe Path A", async () => {
    // Simulates pre-existing test pattern: inject getPageTextFn, no db, no getPageListFn
    // Path A must run: probe 1, 2, … until empty after page 1.
    let probedPages: number[] = [];
    const deps: FetchPageTextsDeps = {
      getPageTextFn: async (_reportId, _filename, pageNum) => {
        probedPages.push(pageNum);
        if (pageNum <= 5) return `text for page ${pageNum}`;
        return ""; // signals end of doc in Path A
      },
    };

    const pageTexts = await fetchAllPageTexts("test-id", "test.pdf", deps);

    // Path A stops at first empty after page 1: pages 1-5 present, page 6 probed and triggers stop
    expect(pageTexts).toHaveLength(5);
    expect(probedPages).toContain(6); // page 6 was probed (and returned empty → stop)
    expect(probedPages).not.toContain(7); // page 7 never probed
  });

  // ── DPL-6: Production DB path + interior gap ─────────────────────────────

  it("DPL-6: DB-driven path with in-memory DB + gap at page 27 → 45 pages, no truncation", async () => {
    // Same as DPL-1 but via the { db } injection (explicit, not relying on getDb())
    const db = makeInMemoryDb();
    seedPdfExtractedText(db, DGC_FILENAME);

    const pageTexts = await fetchAllPageTexts("dgc-0c6f0535", DGC_FILENAME, { db });

    expect(pageTexts).toHaveLength(45);

    const pages = pageTexts.map((pt) => pt.page);
    // Regression guard: pages 28-46 must be present
    for (let p = 28; p <= 46; p++) {
      expect(pages).toContain(p);
    }
  });

  // ── DPL-7: refineOneReport end-to-end with DB page list + interior gap ────

  it("DPL-7: refineOneReport with DB page list covers pages past gap — p28 reaches a window", async () => {
    const db = makeInMemoryDb();
    seedReport(db, "dgc-e2e", DGC_FILENAME);
    seedPdfExtractedText(db, DGC_FILENAME);

    const windowPagesLog: number[][] = [];

    await refineOneReport("dgc-e2e", {
      db,
      // No getPageTextFn → DB-driven page list (Path B) is used
      spawnSubagentFn: async (_reportId, win): Promise<WindowResult> => {
        windowPagesLog.push([...win.page_numbers]);
        return {
          unit_id: win.unit_id,
          page_numbers: win.page_numbers,
          markdown: `| Mã số | Chỉ tiêu | Số cuối kỳ |\n|---|---|---|\n| 100 | Data | 1.000 |`,
          confidence: 0.85,
          flags: [],
          status: "DONE",
        };
      },
    });

    // Collect all pages that appeared in any window
    const allPagesInWindows = windowPagesLog.flat();

    // Core regression guard: pages 28-46 must have been processed (not truncated)
    expect(allPagesInWindows).toContain(28);
    expect(allPagesInWindows).toContain(46);

    // Page 27 must not appear (it was absent from pdf_extracted_text)
    expect(allPagesInWindows).not.toContain(27);

    // At least 15 windows for 45 pages (rough sanity, maxWindowPages=3 default)
    expect(windowPagesLog.length).toBeGreaterThan(10);
  });
});
