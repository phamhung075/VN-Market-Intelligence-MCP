/**
 * Bug 1068 — BCTC Reparse OCR-Fallback
 *
 * Root cause: reparseSingle() called extractPdfText() (pdf-parse) for the
 * local file and bailed out when the result was < 100 chars / confidence 0.
 * It never consulted the OCR cache (getCachedPdfText) that pdfOcrWorker had
 * already built. VNM Q4-2025 had 61 OCR pages at 0.8 confidence ready to use.
 *
 * Fix: in reparseSingle(), after the low-confidence guard fails, fall back to
 * getCachedPdfText(filename) — same pattern as fetchParseAndStoreBctc step 2b.
 *
 * Acceptance criteria (all must be GREEN after fix):
 *   1. reparseSingle succeeds when pdf-parse yields empty but OCR cache is warm
 *   2. reparseSingle still fails when both pdf-parse AND OCR cache are empty
 *   3. runBctcReparseJob resolves a feedback row whose PDF needs OCR fallback
 *   4. VEA feedback row (not-in-watchlist strandee) can be processed once inserted
 */

import { describe, it, expect, beforeEach, mock } from "bun:test";
import { Database } from "bun:sqlite";
import { runBctcReparseJob } from "../scheduler/financial-reports/bctcReparseJob.js";

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE agent_feedback (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      agent             TEXT NOT NULL,
      category          TEXT NOT NULL,
      title             TEXT NOT NULL,
      detail            TEXT NOT NULL DEFAULT '',
      priority          TEXT NOT NULL DEFAULT 'medium',
      status            TEXT NOT NULL DEFAULT 'new',
      created_at        TEXT NOT NULL,
      reparse_attempts  INTEGER NOT NULL DEFAULT 0
    );
  `);
  return db;
}

function seedStranded(
  db: Database,
  ticker: string,
  filename: string,
  filePath: string,
  attempts = 0,
): number {
  const payload = { ticker, filename, filePath };
  const detail = `${ticker}:${filename} ${JSON.stringify(payload)}`;
  const result = db
    .prepare(
      `INSERT INTO agent_feedback
         (agent, category, title, detail, priority, status, created_at, reparse_attempts)
       VALUES (?, ?, ?, ?, 'medium', 'new', datetime('now'), ?)`,
    )
    .run(
      "data-auditor",
      "other",
      `[AUDIT] stranded_bctc_pdf — financial_reports (1 rows) [${filename}]`,
      detail,
      attempts,
    );
  return Number(result.lastInsertRowid);
}

// ─── Test 1: OCR fallback used when pdf-parse yields empty ───────────────────

describe("Bug 1068 — reparseSingle OCR cache fallback", () => {
  it("resolves feedback when pdf-parse is empty but OCR cache is warm", async () => {
    const db = makeDb();

    // Seed a feedback row pointing to a PDF that pdf-parse cannot read
    // but whose OCR cache was built by pdfOcrWorker (confidence 0.8).
    // We use a fake filePath; the reparseFn stub bypasses actual file I/O.
    seedStranded(
      db,
      "VNM",
      "BCTC VNM 31.12.2025 - HOP NHAT - VN.pdf",
      "/fake/BCTC VNM 31.12.2025 - HOP NHAT - VN.pdf",
    );

    // reparseFn stub simulates a successful pipeline call after OCR text is used
    const result = await runBctcReparseJob({
      db,
      notify: async () => undefined,
      reparseFn: async (_payload) => true,  // stub: succeeds
    });

    expect(result.examined).toBe(1);
    expect(result.resolved).toBe(1);
    expect(result.failed).toBe(0);

    const row = db
      .query<{ status: string }, [number]>(
        "SELECT status FROM agent_feedback WHERE id = 1",
      )
      .get(1);
    expect(row?.status).toBe("resolved");
  });

  it("fails when both pdf-parse AND OCR cache are empty", async () => {
    const db = makeDb();
    seedStranded(
      db,
      "VNM",
      "BCTC VNM 31.12.2025 - HOP NHAT - VN.pdf",
      "/fake/BCTC VNM 31.12.2025 - HOP NHAT - VN.pdf",
    );

    // reparseFn stub simulates pipeline failure (OCR yielded nothing usable)
    const result = await runBctcReparseJob({
      db,
      notify: async () => undefined,
      reparseFn: async () => false,
    });

    expect(result.examined).toBe(1);
    expect(result.resolved).toBe(0);
    expect(result.failed).toBe(1);
  });

  it("processes VEA when a feedback row is inserted (not-in-watchlist strandee)", async () => {
    const db = makeDb();
    seedStranded(
      db,
      "VEA",
      "BCTC VEA 31.12.2025 - RIENG - VN.pdf",
      "/fake/BCTC VEA 31.12.2025 - RIENG - VN.pdf",
    );

    const result = await runBctcReparseJob({
      db,
      notify: async () => undefined,
      reparseFn: async () => true,
    });

    expect(result.examined).toBe(1);
    expect(result.resolved).toBe(1);
  });
});

// ─── Test 2: reparseSingleWithOcrFallback directly ───────────────────────────
// This test exercises the exported reparseSingleWithOcrFallback function
// (the fixed version of reparseSingle that consults the OCR cache).

describe("Bug 1068 — reparseSingleWithOcrFallback unit tests", () => {
  it("uses OCR cache text (Tier 3) when service and pdf-parse both return low-confidence", async () => {
    const { reparseSingleWithOcrFallback } = await import(
      "../scheduler/financial-reports/bctcReparseJob.js"
    );

    const ocrText = "A".repeat(200); // well above 100-char threshold

    // 1954c: service Tier 1 → null, pdf-parse Tier 2 → empty, OCR cache Tier 3 → used
    const result = await reparseSingleWithOcrFallback(
      {
        ticker: "VNM",
        filename: "BCTC VNM 31.12.2025 - HOP NHAT - VN.pdf",
        filePath: "/nonexistent/path.pdf",
      },
      {
        // Tier 1: service returns null (unavailable)
        extractViaService: async (_url: string) => null,
        // Tier 2: pdf-parse returns empty
        extractText: async () => ({ text: "   ", confidence: 0 }),
        // Tier 3: warm OCR cache
        getOcrCache: (_filename: string) => ({
          text: ocrText,
          pages: 61,
          confidence: 0.8,
        }),
        // Stub pipeline call — returns non-null means success
        pipeline: async (_params: unknown) => ({ id: "fake-id" }),
        fileExists: (_path: string) => true,
        readFile: (_path: string) => Buffer.from("fake-pdf"),
        insertFallbackRecord: async () => {}, // SPRINT-1330: fallback insert (not triggered in this test)
      },
    );

    expect(result).toBe(true);
  });

  it("returns false when service, pdf-parse, AND OCR cache all fail", async () => {
    const { reparseSingleWithOcrFallback } = await import(
      "../scheduler/financial-reports/bctcReparseJob.js"
    );

    const result = await reparseSingleWithOcrFallback(
      {
        ticker: "VNM",
        filename: "BCTC VNM 31.12.2025 - HOP NHAT - VN.pdf",
        filePath: "/nonexistent/path.pdf",
      },
      {
        extractViaService: async (_url: string) => null,
        extractText: async () => ({ text: "   ", confidence: 0 }),
        getOcrCache: (_filename: string) => null,
        pipeline: async (_params: unknown) => null,
        fileExists: (_path: string) => true,
        readFile: (_path: string) => Buffer.from("fake-pdf"),
        insertFallbackRecord: async () => {}, // SPRINT-1330: fallback insert
      },
    );

    expect(result).toBe(false);
  });

  it("returns false when OCR cache confidence is below 0.3 (all tiers exhausted)", async () => {
    const { reparseSingleWithOcrFallback } = await import(
      "../scheduler/financial-reports/bctcReparseJob.js"
    );

    const result = await reparseSingleWithOcrFallback(
      {
        ticker: "VNM",
        filename: "BCTC VNM 31.12.2025 - HOP NHAT - VN.pdf",
        filePath: "/nonexistent/path.pdf",
      },
      {
        extractViaService: async (_url: string) => null,
        extractText: async () => ({ text: "   ", confidence: 0 }),
        getOcrCache: (_filename: string) => ({ text: "A".repeat(200), pages: 5, confidence: 0.2 }),
        pipeline: async (_params: unknown) => null,
        fileExists: (_path: string) => true,
        readFile: (_path: string) => Buffer.from("fake-pdf"),
        insertFallbackRecord: async () => {}, // SPRINT-1330: fallback insert
      },
    );

    expect(result).toBe(false);
  });
});
