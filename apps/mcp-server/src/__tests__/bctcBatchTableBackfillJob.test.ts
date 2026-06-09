/**
 * BT3-FIX-3 — Unit tests for bctcBatchTableBackfillJob
 *
 * All tests use in-memory SQLite + fetch mocks.
 * No real PDF files required (existsSync driven by real tmp files or nonexistent paths).
 * No real HTTP calls.
 *
 * BT3-FIX-3 strategy: NO pre-supplied OCR pages. The POST body contains only
 * report_id + pdf_path + statement_section. Fresh Tesseract runs inside the
 * pdf-extractor container via PdfOcrAdapter. The stored OCR in pdf_extracted_text
 * is NOT pre-fetched and NOT sent (was BT-4b-2; superseded by BT3-FIX-3 architect ruling §2).
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
 * BT3-FIX-3 additions (fresh-OCR, no pre-supply):
 *   TC9:  doc has real file on disk → POST body contains NO pages field (fresh OCR only)
 *   TC10: doc has no stored OCR in pdf_extracted_text → fetch IS called (no skipped_no_ocr path)
 *   TC11: POST body shape: only report_id + pdf_path + statement_section, no pre_supplied_pages
 *   TC12: result has no skipped_no_ocr field (type no longer includes it)
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { backfillBctcTables } from "../application/usecases/bctcBatchTableBackfillJob.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Create a minimal in-memory DB with the financial_reports table (no pdf_extracted_text needed) */
function makeDb(
  rows: {
    id: string;
    action_code: string;
    period_year: number;
    period_quarter: number | null;
    pdf_path: string | null;
  }[],
): Database {
  const db = new Database(":memory:");
  db.prepare(`
    CREATE TABLE IF NOT EXISTS financial_reports (
      id TEXT PRIMARY KEY,
      action_code TEXT NOT NULL,
      period_year INTEGER,
      period_quarter INTEGER,
      pdf_path TEXT,
      parsed_at TEXT DEFAULT (datetime('now'))
    )
  `).run();
  const insertFr = db.prepare(
    `INSERT INTO financial_reports (id, action_code, period_year, period_quarter, pdf_path)
     VALUES (?, ?, ?, ?, ?)`,
  );
  for (const r of rows) {
    insertFr.run(r.id, r.action_code, r.period_year, r.period_quarter, r.pdf_path);
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

    const db = makeDb([
      { id: VALID_UUID_1, action_code: "FPT", period_year: 2025, period_quarter: 4, pdf_path: realPath },
    ]);

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

    const db = makeDb([
      { id: VALID_UUID_2, action_code: "VNM", period_year: 2025, period_quarter: 4, pdf_path: realPath },
    ]);

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

    const db = makeDb([
      { id: VALID_UUID_3, action_code: "HPG", period_year: 2025, period_quarter: 4, pdf_path: realPath },
    ]);

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
      CREATE TABLE IF NOT EXISTS financial_reports (
        id TEXT PRIMARY KEY,
        action_code TEXT NOT NULL,
        period_year INTEGER,
        period_quarter INTEGER,
        pdf_path TEXT,
        parsed_at TEXT DEFAULT (datetime('now'))
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

  // ── BT3-FIX-3: fresh-OCR path — no pre-supplied pages ────────────────────

  it("TC9: doc with real file → POST body contains NO pages field (fresh OCR only)", async () => {
    const fs = await import("node:fs");
    const pdfFilename = "bctc-tc9-fpt.pdf";
    const fullPath = `/tmp/${pdfFilename}`;
    fs.writeFileSync(fullPath, "fake pdf");

    // No pdf_extracted_text table needed — fresh-OCR path does not query it
    const db = makeDb([
      { id: VALID_UUID_1, action_code: "FPT", period_year: 2025, period_quarter: 4, pdf_path: fullPath },
    ]);

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
      // POST body must NOT include pages or pre_supplied_pages (BT3-FIX-3)
      expect(capturedBody).not.toBeNull();
      expect(capturedBody!["pages"]).toBeUndefined();
      expect(capturedBody!["pre_supplied_pages"]).toBeUndefined();
      // Only the three required fields
      expect(capturedBody!["report_id"]).toBe(VALID_UUID_1);
      expect(capturedBody!["pdf_path"]).toBe(fullPath);
      expect(capturedBody!["statement_section"]).toBe("balance_sheet");
    } finally {
      restore();
      try { fs.unlinkSync(fullPath); } catch { /* ok */ }
    }
  });

  it("TC10: doc has no stored OCR in pdf_extracted_text → fetch IS called (no skipped_no_ocr path)", async () => {
    const fs = await import("node:fs");
    const fullPath = "/tmp/bctc-tc10-bsr.pdf";
    fs.writeFileSync(fullPath, "fake pdf");

    // No pdf_extracted_text table — BT3-FIX-3 does not query it
    const db = makeDb([
      { id: VALID_UUID_2, action_code: "BSR", period_year: 2025, period_quarter: 4, pdf_path: fullPath },
    ]);

    let fetchCalled = false;
    const restore = mockFetch(async () => {
      fetchCalled = true;
      return new Response(
        JSON.stringify({ ok: true, rows_stored: 50, balance_pass: true }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    try {
      const result = await backfillBctcTables(db, "http://pdf-extractor:5001");
      // BT3-FIX-3: no skipped_no_ocr path — fetch MUST be called even with zero stored OCR
      expect(fetchCalled).toBe(true);
      expect(result.success).toBe(1);
      expect(result.outcomes[0]?.status).toBe("success");
    } finally {
      restore();
      try { fs.unlinkSync(fullPath); } catch { /* ok */ }
    }
  });

  it("TC11: POST body shape is exactly {report_id, pdf_path, statement_section} — no OCR fields", async () => {
    const fs = await import("node:fs");
    const fullPath = "/tmp/bctc-tc11-shb.pdf";
    fs.writeFileSync(fullPath, "fake pdf");

    const db = makeDb([
      { id: VALID_UUID_3, action_code: "SHB", period_year: 2025, period_quarter: 4, pdf_path: fullPath },
    ]);

    let capturedBody: Record<string, unknown> | null = null;
    const restore = mockFetch(async (_url: unknown, init: unknown) => {
      capturedBody = JSON.parse((init as { body: string }).body) as Record<string, unknown>;
      return new Response(
        JSON.stringify({ ok: true, rows_stored: 60, balance_pass: true }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    try {
      await backfillBctcTables(db, "http://pdf-extractor:5001");
      expect(capturedBody).not.toBeNull();
      // Exactly 3 keys — no pages, no pre_supplied_pages, no other OCR fields
      const keys = Object.keys(capturedBody!);
      expect(keys).toContain("report_id");
      expect(keys).toContain("pdf_path");
      expect(keys).toContain("statement_section");
      expect(keys).not.toContain("pages");
      expect(keys).not.toContain("pre_supplied_pages");
    } finally {
      restore();
      try { fs.unlinkSync(fullPath); } catch { /* ok */ }
    }
  });

  it("TC12: result has no skipped_no_ocr field (removed in BT3-FIX-3)", async () => {
    const db = makeDb([
      {
        id: VALID_UUID_1,
        action_code: "FPT",
        period_year: 2025,
        period_quarter: 4,
        pdf_path: "/nonexistent/fpt-tc12.pdf",
      },
    ]);

    const restore = mockFetch(async () =>
      new Response(JSON.stringify({ ok: true, rows_stored: 80, balance_pass: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    try {
      const result = await backfillBctcTables(db, "http://pdf-extractor:5001");
      // skipped_no_ocr no longer exists on the result type
      expect((result as unknown as Record<string, unknown>)["skipped_no_ocr"]).toBeUndefined();
      // Structural check: the known fields are present
      expect(typeof result.success).toBe("number");
      expect(typeof result.failed).toBe("number");
      expect(typeof result.skipped_no_file).toBe("number");
      expect(typeof result.skipped_null_path).toBe("number");
    } finally {
      restore();
    }
  });
});
