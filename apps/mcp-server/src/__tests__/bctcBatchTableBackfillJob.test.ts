/**
 * BT-4b / BT-4b-2 — Unit tests for bctcBatchTableBackfillJob
 *
 * All tests use in-memory SQLite + fetch mocks.
 * No real PDF files required (existsSync driven by real tmp files or nonexistent paths).
 * No real HTTP calls.
 *
 * Scenarios:
 *   TC1: eligible doc with nonexistent pdf_path → skipped_no_file (confirms file-check logic)
 *   TC2: gate-blocked doc — blocked_reason in response → gate_blocked count incremented
 *   TC3: network error (fetch throws) → failed count incremented, does not crash
 *   TC4: HTTP 500 from extractor → failed count incremented
 *   TC5: null pdf_path rows are excluded (skipped_null_path counted)
 *   TC6: pdf_path set but file does not exist → skipped_no_file
 *   TC7: idempotency — calling backfill twice returns same structure
 *   TC8: invalid UUID row → error without fetch being called
 *
 * BT-4b-2 additions (host-safe pages pre-supply from pdf_extracted_text):
 *   TC9:  doc has stored OCR pages → POST body includes pages array with page_number+text
 *   TC10: doc has NO stored OCR pages → skipped_no_ocr, fetch NOT called (host safety)
 *   TC11: doc has partial OCR (some pages) → only those pages in POST body, fetch called
 *   TC12: pages populated correctly (page_number values + text from pdf_extracted_text)
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { backfillBctcTables } from "../application/usecases/bctcBatchTableBackfillJob.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Create a minimal in-memory DB with the financial_reports + pdf_extracted_text tables */
function makeDb(
  rows: {
    id: string;
    action_code: string;
    period_year: number;
    period_quarter: number | null;
    pdf_path: string | null;
  }[],
  ocrRows: {
    filename: string;
    page_number: number;
    text_content: string;
  }[] = [],
): Database {
  const db = new Database(":memory:");
  db.prepare(`
    CREATE TABLE financial_reports (
      id TEXT PRIMARY KEY,
      action_code TEXT NOT NULL,
      period_year INTEGER,
      period_quarter INTEGER,
      pdf_path TEXT,
      parsed_at TEXT DEFAULT (datetime('now'))
    )
  `).run();
  db.prepare(`
    CREATE TABLE pdf_extracted_text (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      page_number INTEGER NOT NULL,
      text_content TEXT NOT NULL DEFAULT '',
      confidence REAL NOT NULL DEFAULT 0,
      extracted_at TEXT NOT NULL DEFAULT (datetime('now')),
      action_code TEXT NOT NULL DEFAULT ''
    )
  `).run();
  const insertFr = db.prepare(
    `INSERT INTO financial_reports (id, action_code, period_year, period_quarter, pdf_path)
     VALUES (?, ?, ?, ?, ?)`,
  );
  for (const r of rows) {
    insertFr.run(r.id, r.action_code, r.period_year, r.period_quarter, r.pdf_path);
  }
  const insertOcr = db.prepare(
    `INSERT INTO pdf_extracted_text (filename, page_number, text_content)
     VALUES (?, ?, ?)`,
  );
  for (const r of ocrRows) {
    insertOcr.run(r.filename, r.page_number, r.text_content);
  }
  return db;
}

/** Helper: set a mock fetch and return a restore function */
function mockFetch(fn: (...args: unknown[]) => unknown): () => void {
  const original = globalThis.fetch;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).fetch = fn;
  return () => {
    globalThis.fetch = original;
  };
}

const VALID_UUID_1 = "a0000000-0000-0000-0000-000000000001";
const VALID_UUID_2 = "a0000000-0000-0000-0000-000000000002";
const VALID_UUID_3 = "a0000000-0000-0000-0000-000000000003";
const INVALID_UUID = "not-a-uuid";

// ── TC1: nonexistent pdf_path → skipped ──────────────────────────────────────

describe("bctcBatchTableBackfillJob", () => {
  it("TC1: pdf_path does not exist on disk → skipped_no_file=1, no fetch call", async () => {
    const db = makeDb([
      {
        id: VALID_UUID_1,
        action_code: "FPT",
        period_year: 2025,
        period_quarter: 4,
        pdf_path: "/nonexistent/path/fpt.pdf",
      },
    ]);

    let fetchCalled = false;
    const restore = mockFetch(async () => {
      fetchCalled = true;
      return new Response("{}", { status: 200 });
    });

    try {
      const result = await backfillBctcTables(db, "http://pdf-extractor:5001");
      expect(result.skipped_no_file).toBe(1);
      expect(result.success).toBe(0);
      expect(fetchCalled).toBe(false);
      expect(result.outcomes).toHaveLength(1);
      expect(result.outcomes[0]?.status).toBe("skipped_no_file");
    } finally {
      restore();
    }
  });

  it("TC2: gate-blocked response → gate_blocked counted", async () => {
    const fs = await import("node:fs");
    const realPath = "/tmp/bctc-tc2.pdf";
    fs.writeFileSync(realPath, "fake pdf");

    const db = makeDb(
      [{ id: VALID_UUID_1, action_code: "FPT", period_year: 2025, period_quarter: 4, pdf_path: realPath }],
      // OCR rows required (BT-4b-2) — without these, the doc would be skipped_no_ocr
      [{ filename: "bctc-tc2.pdf", page_number: 1, text_content: "some ocr text" }],
    );

    const restore = mockFetch(async () =>
      new Response(
        JSON.stringify({
          ok: true,
          rows_stored: 0,
          balance_pass: false,
          blocked_reason: "cross_check_fail",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    try {
      const result = await backfillBctcTables(db, "http://pdf-extractor:5001");
      expect(result.gate_blocked).toBe(1);
      expect(result.success).toBe(0);
      expect(result.outcomes[0]?.status).toBe("gate_blocked");
      expect(result.outcomes[0]?.blocked_reason).toBe("cross_check_fail");
    } finally {
      restore();
      try { fs.unlinkSync(realPath); } catch { /* ok */ }
    }
  });

  it("TC3: network error → failed counted, no crash", async () => {
    const fs = await import("node:fs");
    const realPath = "/tmp/bctc-tc3.pdf";
    fs.writeFileSync(realPath, "fake pdf");

    const db = makeDb(
      [{ id: VALID_UUID_2, action_code: "VNM", period_year: 2025, period_quarter: 4, pdf_path: realPath }],
      [{ filename: "bctc-tc3.pdf", page_number: 1, text_content: "some ocr text" }],
    );

    const restore = mockFetch(async () => {
      throw new Error("ECONNREFUSED connect failed");
    });

    try {
      const result = await backfillBctcTables(db, "http://pdf-extractor:5001");
      expect(result.failed).toBe(1);
      expect(result.success).toBe(0);
      expect(result.outcomes[0]?.status).toBe("error");
      expect(result.outcomes[0]?.error).toContain("ECONNREFUSED");
    } finally {
      restore();
      try { fs.unlinkSync(realPath); } catch { /* ok */ }
    }
  });

  it("TC4: HTTP 500 response → failed counted", async () => {
    const fs = await import("node:fs");
    const realPath = "/tmp/bctc-tc4.pdf";
    fs.writeFileSync(realPath, "fake pdf");

    const db = makeDb(
      [{ id: VALID_UUID_3, action_code: "HPG", period_year: 2025, period_quarter: 4, pdf_path: realPath }],
      [{ filename: "bctc-tc4.pdf", page_number: 1, text_content: "some ocr text" }],
    );

    const restore = mockFetch(async () =>
      new Response(JSON.stringify({ error: "server_error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
    );

    try {
      const result = await backfillBctcTables(db, "http://pdf-extractor:5001");
      expect(result.failed).toBe(1);
      expect(result.success).toBe(0);
      expect(result.outcomes[0]?.status).toBe("error");
    } finally {
      restore();
      try { fs.unlinkSync(realPath); } catch { /* ok */ }
    }
  });

  it("TC5: null pdf_path rows counted in skipped_null_path, no fetch call", async () => {
    const db = makeDb([
      {
        id: VALID_UUID_1,
        action_code: "VCB",
        period_year: 2025,
        period_quarter: 1,
        pdf_path: null,
      },
      {
        id: VALID_UUID_2,
        action_code: "VCB",
        period_year: 2025,
        period_quarter: 4,
        pdf_path: null,
      },
    ]);

    let fetchCalled = false;
    const restore = mockFetch(async () => {
      fetchCalled = true;
      return new Response("{}", { status: 200 });
    });

    try {
      const result = await backfillBctcTables(db, "http://pdf-extractor:5001");
      expect(result.skipped_null_path).toBe(2);
      expect(result.success).toBe(0);
      expect(fetchCalled).toBe(false);
      // Null rows excluded by WHERE clause → not in outcomes list
      expect(result.outcomes).toHaveLength(0);
    } finally {
      restore();
    }
  });

  it("TC6: pdf_path set but file missing → skipped_no_file, no fetch call", async () => {
    const db = makeDb([
      {
        id: VALID_UUID_1,
        action_code: "DHG",
        period_year: 2026,
        period_quarter: 1,
        pdf_path: "/app/data/pdfs/does_not_exist_tc6.pdf",
      },
    ]);

    let fetchCalled = false;
    const restore = mockFetch(async () => {
      fetchCalled = true;
      return new Response("{}", { status: 200 });
    });

    try {
      const result = await backfillBctcTables(db, "http://pdf-extractor:5001");
      expect(result.skipped_no_file).toBe(1);
      expect(result.success).toBe(0);
      expect(fetchCalled).toBe(false);
      expect(result.outcomes[0]?.status).toBe("skipped_no_file");
    } finally {
      restore();
    }
  });

  it("TC7: idempotent — two calls return same structure shape", async () => {
    const db = makeDb([
      {
        id: VALID_UUID_1,
        action_code: "FPT",
        period_year: 2025,
        period_quarter: 4,
        pdf_path: "/nonexistent/fpt-tc7.pdf",
      },
    ]);

    const restore = mockFetch(async () =>
      new Response(JSON.stringify({ ok: true, rows_stored: 80, balance_pass: true }), {
        status: 200,
      }),
    );

    try {
      const r1 = await backfillBctcTables(db, "http://pdf-extractor:5001");
      const r2 = await backfillBctcTables(db, "http://pdf-extractor:5001");
      // Both runs see same eligible docs (file doesn't exist → both skipped)
      expect(r1.skipped_no_file).toBe(r2.skipped_no_file);
      expect(r1.success).toBe(r2.success);
      expect(r1.outcomes).toHaveLength(r2.outcomes.length);
    } finally {
      restore();
    }
  });

  it("TC8: invalid UUID row → error status, fetch never called", async () => {
    const db = new Database(":memory:");
    db.prepare(`
      CREATE TABLE financial_reports (
        id TEXT PRIMARY KEY,
        action_code TEXT NOT NULL,
        period_year INTEGER,
        period_quarter INTEGER,
        pdf_path TEXT,
        parsed_at TEXT DEFAULT (datetime('now'))
      )
    `).run();
    db.prepare(`
      CREATE TABLE pdf_extracted_text (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        page_number INTEGER NOT NULL,
        text_content TEXT NOT NULL DEFAULT '',
        confidence REAL NOT NULL DEFAULT 0,
        extracted_at TEXT NOT NULL DEFAULT (datetime('now')),
        action_code TEXT NOT NULL DEFAULT ''
      )
    `).run();
    // Force-insert a non-UUID id (bypasses app-level validation, tests the backfill guard)
    db.prepare(
      `INSERT INTO financial_reports (id, action_code, period_year, period_quarter, pdf_path)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(INVALID_UUID, "BAD", 2025, 4, "/tmp/bctc-tc8-bad.pdf");

    const fs = await import("node:fs");
    fs.writeFileSync("/tmp/bctc-tc8-bad.pdf", "fake");

    let fetchCalled = false;
    const restore = mockFetch(async () => {
      fetchCalled = true;
      return new Response("{}", { status: 200 });
    });

    try {
      const result = await backfillBctcTables(db, "http://pdf-extractor:5001");
      // UUID guard fires before fetch call
      expect(result.failed).toBe(1);
      expect(fetchCalled).toBe(false);
      expect(result.outcomes[0]?.status).toBe("error");
      expect(result.outcomes[0]?.error).toBe("invalid_uuid");
    } finally {
      restore();
      try { fs.unlinkSync("/tmp/bctc-tc8-bad.pdf"); } catch { /* ok */ }
    }
  });

  // ── BT-4b-2: host-safe pages pre-supply from pdf_extracted_text ───────────

  it("TC9: doc has stored OCR pages → POST body includes pages array (host-safe, zero Tesseract)", async () => {
    const fs = await import("node:fs");
    const realPath = "/tmp/bctc-tc9-fpt.pdf";
    fs.writeFileSync(realPath, "fake pdf");
    const pdfFilename = "bctc-tc9-fpt.pdf";
    const fullPath = `/tmp/${pdfFilename}`;
    fs.writeFileSync(fullPath, "fake pdf");

    const db = makeDb(
      [{ id: VALID_UUID_1, action_code: "FPT", period_year: 2025, period_quarter: 4, pdf_path: fullPath }],
      [
        { filename: pdfFilename, page_number: 4, text_content: "270  88.089.621.779.862" },
        { filename: pdfFilename, page_number: 5, text_content: "300  44.338.155.487.272" },
      ],
    );

    let capturedBody: Record<string, unknown> | null = null;
    const restore = mockFetch(async (_url: unknown, init: unknown) => {
      capturedBody = JSON.parse((init as { body: string }).body) as Record<string, unknown>;
      return new Response(
        JSON.stringify({ ok: true, rows_stored: 80, balance_pass: true }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    try {
      const result = await backfillBctcTables(db, "http://pdf-extractor:5001");
      expect(result.success).toBe(1);
      expect(result.outcomes[0]?.status).toBe("success");
      // POST body must include pages array with the stored OCR text
      expect(capturedBody).not.toBeNull();
      expect(Array.isArray(capturedBody!["pages"])).toBe(true);
      const pages = capturedBody!["pages"] as Array<{ page_number: number; text: string }>;
      expect(pages).toHaveLength(2);
      // page_number values match what is stored in pdf_extracted_text
      expect(pages.some((p) => p.page_number === 4)).toBe(true);
      expect(pages.some((p) => p.page_number === 5)).toBe(true);
      // text content matches stored OCR text
      const p4 = pages.find((p) => p.page_number === 4);
      expect(p4?.text).toBe("270  88.089.621.779.862");
    } finally {
      restore();
      try { fs.unlinkSync(fullPath); } catch { /* ok */ }
      try { fs.unlinkSync(realPath); } catch { /* ok */ }
    }
  });

  it("TC10: doc has NO stored OCR pages → skipped_no_ocr, fetch NOT called (host safety)", async () => {
    const fs = await import("node:fs");
    const fullPath = "/tmp/bctc-tc10-bsr.pdf";
    fs.writeFileSync(fullPath, "fake pdf");
    const pdfFilename = "bctc-tc10-bsr.pdf"; // basename matches

    // DB has no OCR rows for this filename
    const db = makeDb(
      [{ id: VALID_UUID_2, action_code: "BSR", period_year: 2025, period_quarter: 4, pdf_path: fullPath }],
      [], // no OCR rows
    );

    let fetchCalled = false;
    const restore = mockFetch(async () => {
      fetchCalled = true;
      return new Response("{}", { status: 200 });
    });

    try {
      const result = await backfillBctcTables(db, "http://pdf-extractor:5001");
      // Must NOT call fetch — no OCR text → cannot supply pages → host-safe skip
      expect(fetchCalled).toBe(false);
      expect(result.success).toBe(0);
      // Outcome recorded as skipped_no_ocr
      expect(result.outcomes[0]?.status).toBe("skipped_no_ocr");
    } finally {
      restore();
      try { fs.unlinkSync(fullPath); } catch { /* ok */ }
    }
  });

  it("TC11: doc has OCR pages for different filename → skipped_no_ocr (join by basename)", async () => {
    const fs = await import("node:fs");
    const fullPath = "/tmp/bctc-tc11-shb.pdf";
    fs.writeFileSync(fullPath, "fake pdf");

    // OCR rows stored under a DIFFERENT filename — no join match
    const db = makeDb(
      [{ id: VALID_UUID_3, action_code: "SHB", period_year: 2025, period_quarter: 4, pdf_path: fullPath }],
      [{ filename: "DIFFERENT-FILE.pdf", page_number: 1, text_content: "some text" }],
    );

    let fetchCalled = false;
    const restore = mockFetch(async () => {
      fetchCalled = true;
      return new Response("{}", { status: 200 });
    });

    try {
      const result = await backfillBctcTables(db, "http://pdf-extractor:5001");
      // basename("/tmp/bctc-tc11-shb.pdf") = "bctc-tc11-shb.pdf" ≠ "DIFFERENT-FILE.pdf"
      expect(fetchCalled).toBe(false);
      expect(result.outcomes[0]?.status).toBe("skipped_no_ocr");
    } finally {
      restore();
      try { fs.unlinkSync(fullPath); } catch { /* ok */ }
    }
  });

  it("TC12: pages in POST body ordered by page_number ASC with correct text", async () => {
    const fs = await import("node:fs");
    const pdfFilename = "bctc-tc12-fpt.pdf";
    const fullPath = `/tmp/${pdfFilename}`;
    fs.writeFileSync(fullPath, "fake pdf");

    // Insert OCR rows out-of-order to verify sort
    const db = makeDb(
      [{ id: VALID_UUID_1, action_code: "FPT", period_year: 2025, period_quarter: 4, pdf_path: fullPath }],
      [
        { filename: pdfFilename, page_number: 7, text_content: "page seven content" },
        { filename: pdfFilename, page_number: 4, text_content: "page four content" },
        { filename: pdfFilename, page_number: 5, text_content: "page five content" },
        { filename: pdfFilename, page_number: 6, text_content: "page six content" },
      ],
    );

    let capturedBody: Record<string, unknown> | null = null;
    const restore = mockFetch(async (_url: unknown, init: unknown) => {
      capturedBody = JSON.parse((init as { body: string }).body) as Record<string, unknown>;
      return new Response(
        JSON.stringify({ ok: true, rows_stored: 100, balance_pass: true }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    try {
      await backfillBctcTables(db, "http://pdf-extractor:5001");
      expect(capturedBody).not.toBeNull();
      const pages = capturedBody!["pages"] as Array<{ page_number: number; text: string }>;
      expect(pages).toHaveLength(4);
      // Ordered ASC by page_number
      expect(pages[0]!.page_number).toBe(4);
      expect(pages[1]!.page_number).toBe(5);
      expect(pages[2]!.page_number).toBe(6);
      expect(pages[3]!.page_number).toBe(7);
      // text field matches text_content column
      expect(pages[0]!.text).toBe("page four content");
      expect(pages[3]!.text).toBe("page seven content");
    } finally {
      restore();
      try { fs.unlinkSync(fullPath); } catch { /* ok */ }
    }
  });
});
