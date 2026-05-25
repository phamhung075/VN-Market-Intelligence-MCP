/**
 * BT-4b — Unit tests for bctcBatchTableBackfillJob
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
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { backfillBctcTables } from "../application/usecases/bctcBatchTableBackfillJob.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Create a minimal in-memory DB with the financial_reports table */
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
    CREATE TABLE financial_reports (
      id TEXT PRIMARY KEY,
      action_code TEXT NOT NULL,
      period_year INTEGER,
      period_quarter INTEGER,
      pdf_path TEXT,
      parsed_at TEXT DEFAULT (datetime('now'))
    )
  `).run();
  const insert = db.prepare(
    `INSERT INTO financial_reports (id, action_code, period_year, period_quarter, pdf_path)
     VALUES (?, ?, ?, ?, ?)`,
  );
  for (const r of rows) {
    insert.run(r.id, r.action_code, r.period_year, r.period_quarter, r.pdf_path);
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
      {
        id: VALID_UUID_1,
        action_code: "FPT",
        period_year: 2025,
        period_quarter: 4,
        pdf_path: realPath,
      },
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
      {
        id: VALID_UUID_2,
        action_code: "VNM",
        period_year: 2025,
        period_quarter: 4,
        pdf_path: realPath,
      },
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
      {
        id: VALID_UUID_3,
        action_code: "HPG",
        period_year: 2025,
        period_quarter: 4,
        pdf_path: realPath,
      },
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
      CREATE TABLE financial_reports (
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
});
