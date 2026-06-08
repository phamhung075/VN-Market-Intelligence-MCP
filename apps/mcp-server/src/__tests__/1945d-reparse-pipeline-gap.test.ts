/**
 * Task 1945d — BCTC Reparse Pipeline Gap
 *
 * Root cause: two independent gaps in the reparse pipeline:
 *
 * GAP-A: `runBctcReparseJob` calls `scanDiskForStrandedPdfs` ONLY when
 *         `agent_feedback` returns 0 rows. If OTHER stranded-PDF feedback
 *         rows exist, fresh on-disk PDFs (EIB Q1-2026 pushed at 08:22Z)
 *         are never picked up until D-7c creates their own feedback rows
 *         and the next 09:30 GMT+7 cron fires (18+ h gap).
 *
 *   FIX-A: Run `scanDiskForStrandedPdfs` unconditionally — merge feedback-
 *          row payloads with disk-scan payloads, dedup, process all.
 *
 * GAP-B: `push-bctc-pdf` handler calls `fetchParseAndStoreBctc` with
 *         `pdfUrl: sourceUrl || file://...` but NO `pdfTextOverride`.
 *         The pipeline tries to download from the SSC/VPS URL which is
 *         geo-blocked or requires auth that axios does not inject, so
 *         extraction returns empty text → `financial_reports` never written.
 *
 *   FIX-B: Extract text locally via `extractAndStorePdfPagesWithRetry` +
 *           `getCachedPdfText` before calling `fetchParseAndStoreBctc`, and
 *           pass the result as `pdfTextOverride`. Identical pattern to
 *           `bctcPdfPullJob.triggerExtraction`.
 *
 * AC-3: At least one test asserts `bctcReparseJob` picks up a freshly-
 *       stored PDF with year=2026 quarter=Q1 and inserts a
 *       `financial_reports` row (task handoff requirement).
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  parseYearQuarterFromFilename,
  scanDiskForStrandedPdfs,
  runBctcReparseJob,
} from "../scheduler/financial-reports/bctcReparseJob.js";
import { initDatabase } from "../infrastructure/db/schema.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ─────────────────────────────────────────────────────────────────────────────
// Shared DB helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeTestDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS financial_reports (
      id TEXT PRIMARY KEY,
      action_code TEXT NOT NULL,
      period_year INTEGER NOT NULL,
      period_type TEXT NOT NULL,
      period_quarter TEXT,
      sort_key TEXT,
      company_name TEXT,
      exchange TEXT,
      domain TEXT,
      period_start TEXT,
      period_end TEXT,
      parsed_at TEXT,
      extraction_confidence REAL DEFAULT 0
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      exchange TEXT,
      domain TEXT
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent TEXT NOT NULL,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      priority TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'new',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      reparse_attempts INTEGER NOT NULL DEFAULT 0
    )
  `);
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

function seedWatchlist(db: Database, ...codes: string[]): void {
  const stmt = db.prepare(
    "INSERT OR IGNORE INTO watchlist (code, exchange, domain) VALUES (?, 'HOSE', 'banking')",
  );
  for (const code of codes) {
    stmt.run(code);
  }
}

function seedFeedbackRow(
  db: Database,
  ticker: string,
  filename: string,
  filePath: string,
): void {
  const payload = { ticker, filename, filePath };
  const detail = `${ticker}:${filename.slice(0, 50)} ${JSON.stringify(payload)}`;
  db.prepare(`
    INSERT INTO agent_feedback
      (agent, category, title, detail, priority, status, created_at)
    VALUES ('data-auditor', 'other', '[AUDIT] stranded_bctc_pdf — financial_reports (1 rows)', ?, 'medium', 'new', datetime('now'))
  `).run(detail);
}

function countFinancialReports(
  db: Database,
  code: string,
  year: number,
  quarter: string,
): number {
  const row = db
    .prepare(
      "SELECT COUNT(*) AS cnt FROM financial_reports WHERE action_code = ? AND period_year = ? AND period_type = ?",
    )
    .get(code, year, quarter) as { cnt: number };
  return row?.cnt ?? 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// TC-1: parseYearQuarterFromFilename — VPS-format filename (YYYYMMDD prefix)
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-1: parseYearQuarterFromFilename — VPS YYYYMMDD-prefix Q1-2026 filename", () => {
  it("parses 20260428-EIB-BCTC-hop-nhat-Q1.2026.pdf → year=2026, quarter=Q1", () => {
    const result = parseYearQuarterFromFilename(
      "20260428-EIB-BCTC-hop-nhat-Q1.2026.pdf",
    );
    expect(result).not.toBeNull();
    expect(result!.year).toBe(2026);
    expect(result!.quarter).toBe("Q1");
  });

  it("parses 20260420-DHG-BCTC-Quy-1.2026.pdf → year=2026, quarter=Q1", () => {
    const result = parseYearQuarterFromFilename(
      "20260420-DHG-BCTC-Quy-1.2026.pdf",
    );
    expect(result).not.toBeNull();
    expect(result!.year).toBe(2026);
    expect(result!.quarter).toBe("Q1");
  });

  it("parses canonical EIB_2026_Q1.pdf (bctcPdfPullJob format) → year=2026, quarter=Q1", () => {
    // bctcPdfPullJob saves as EIB_2026_Q1.pdf — must be parseable
    const result = parseYearQuarterFromFilename("EIB_2026_Q1.pdf");
    expect(result).not.toBeNull();
    expect(result!.year).toBe(2026);
    expect(result!.quarter).toBe("Q1");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-2: scanDiskForStrandedPdfs — picks up EIB Q1-2026 on-disk PDF
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-2: scanDiskForStrandedPdfs — EIB Q1-2026 freshly stored", () => {
  let tmpDir: string;
  let pdfDir: string;
  let db: Database;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `reparse-gap-tc2-${Date.now()}`);
    pdfDir = join(tmpDir, "pdfs");
    mkdirSync(pdfDir, { recursive: true });
    db = makeTestDb();
    seedWatchlist(db, "EIB", "DHG");
  });

  afterEach(() => {
    try { db.close(); } catch { /* ignore */ }
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns EIB Q1-2026 as stranded when no financial_reports row exists", async () => {
    // Simulate VPS push-saved PDF (original VPS filename)
    writeFileSync(join(pdfDir, "20260428-EIB-BCTC-hop-nhat-Q1.2026.pdf"), "fake-pdf-content");

    const stranded = await scanDiskForStrandedPdfs(db, pdfDir);
    const eib = stranded.find((s) => s.ticker === "EIB");
    expect(eib).toBeDefined();
    expect(eib!.filename).toBe("20260428-EIB-BCTC-hop-nhat-Q1.2026.pdf");
  });

  it("skips EIB Q1-2026 when financial_reports already has a row", async () => {
    writeFileSync(join(pdfDir, "20260428-EIB-BCTC-hop-nhat-Q1.2026.pdf"), "fake-pdf-content");
    db.prepare(
      "INSERT INTO financial_reports (id, action_code, period_year, period_type) VALUES (?, 'EIB', 2026, 'Q1')",
    ).run("test-eib-q1");

    const stranded = await scanDiskForStrandedPdfs(db, pdfDir);
    const eib = stranded.find((s) => s.ticker === "EIB");
    expect(eib).toBeUndefined();
  });

  it("returns both EIB and DHG when both are stranded", async () => {
    writeFileSync(join(pdfDir, "20260428-EIB-BCTC-hop-nhat-Q1.2026.pdf"), "fake-pdf-content");
    writeFileSync(join(pdfDir, "20260420-DHG-BCTC-Quy-1.2026.pdf"), "fake-pdf-content");

    const stranded = await scanDiskForStrandedPdfs(db, pdfDir);
    expect(stranded.length).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-3 (AC-3): runBctcReparseJob — picks up fresh Q1-2026 PDF even when
//              agent_feedback has OTHER stranded rows (GAP-A fix)
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-3 (AC-3): runBctcReparseJob — disk scan runs even when feedback rows exist", () => {
  let tmpDir: string;
  let pdfDir: string;
  let db: Database;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `reparse-gap-tc3-${Date.now()}`);
    pdfDir = join(tmpDir, "pdfs");
    mkdirSync(pdfDir, { recursive: true });
    db = makeTestDb();
    seedWatchlist(db, "EIB", "VCB");
  });

  afterEach(() => {
    try { db.close(); } catch { /* ignore */ }
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("processes EIB Q1-2026 on-disk PDF when feedback rows exist for OTHER tickers", async () => {
    // Seed a feedback row for VCB (different ticker — simulates other stranded PDFs)
    seedFeedbackRow(db, "VCB", "VCB_2025_Q4.pdf", "/tmp/VCB_2025_Q4.pdf");

    // EIB Q1-2026 is on disk but has NO feedback row (freshly stored — D-7c hasn't run yet)
    writeFileSync(join(pdfDir, "20260428-EIB-BCTC-hop-nhat-Q1.2026.pdf"), "fake-pdf-content");

    // Track whether reparseFn was called for EIB
    const reparsedTickers: string[] = [];
    const reparseFn = async (payload: { ticker: string; filename: string; filePath: string }): Promise<boolean> => {
      reparsedTickers.push(payload.ticker);
      // Simulate success: insert financial_reports row
      db.prepare(
        "INSERT OR IGNORE INTO financial_reports (id, action_code, period_year, period_type) VALUES (?, ?, ?, ?)",
      ).run(`${payload.ticker}-2026-Q1`, payload.ticker, 2026, "Q1");
      return true;
    };

    await runBctcReparseJob({ db, reparseFn, pdfDir } as any);

    // EIB must have been processed from disk scan (even though feedback rows existed for VCB)
    expect(reparsedTickers).toContain("EIB");

    // financial_reports must have an EIB Q1-2026 row
    expect(countFinancialReports(db, "EIB", 2026, "Q1")).toBe(1);
  });

  it("processes EIB Q1-2026 when feedback rows = 0 (baseline: disk scan already ran before)", async () => {
    // No feedback rows — disk scan was always triggered in original code
    writeFileSync(join(pdfDir, "20260428-EIB-BCTC-hop-nhat-Q1.2026.pdf"), "fake-pdf-content");

    const reparsedTickers: string[] = [];
    const reparseFn = async (payload: { ticker: string; filename: string; filePath: string }): Promise<boolean> => {
      reparsedTickers.push(payload.ticker);
      db.prepare(
        "INSERT OR IGNORE INTO financial_reports (id, action_code, period_year, period_type) VALUES (?, ?, ?, ?)",
      ).run(`${payload.ticker}-2026-Q1`, payload.ticker, 2026, "Q1");
      return true;
    };

    await runBctcReparseJob({ db, reparseFn, pdfDir } as any);

    expect(reparsedTickers).toContain("EIB");
    expect(countFinancialReports(db, "EIB", 2026, "Q1")).toBe(1);
  });

  it("does NOT reprocess EIB if financial_reports already has Q1-2026 row (idempotency)", async () => {
    writeFileSync(join(pdfDir, "20260428-EIB-BCTC-hop-nhat-Q1.2026.pdf"), "fake-pdf-content");
    // Pre-insert: EIB Q1-2026 already parsed
    db.prepare(
      "INSERT INTO financial_reports (id, action_code, period_year, period_type) VALUES (?, 'EIB', 2026, 'Q1')",
    ).run("eib-q1-existing");

    const reparsedTickers: string[] = [];
    const reparseFn = async (payload: { ticker: string }): Promise<boolean> => {
      reparsedTickers.push(payload.ticker);
      return true;
    };

    await runBctcReparseJob({ db, reparseFn, pdfDir } as any);

    expect(reparsedTickers).not.toContain("EIB");
    expect(countFinancialReports(db, "EIB", 2026, "Q1")).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-4: push-bctc-pdf extraction module — triggerPushBctcExtraction
//        (extracted helper used by server.ts setImmediate callback)
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-4: triggerPushBctcExtraction — 1954c service delegate", () => {
  it("passes service text as pdfTextOverride to fetchParseAndStoreBctc", async () => {
    const { triggerPushBctcExtraction } = await import(
      "../scheduler/financial-reports/pushBctcExtraction.js"
    );

    const serviceText = "Báo cáo tài chính Q1 2026 " + "A".repeat(200);

    const callArgs: Record<string, unknown>[] = [];
    const deps = {
      extractViaService: async (_url: string) => ({
        documentId: "doc-1",
        tables: [],
        textContent: serviceText,
        ocrConfidence: 0.85,
        status: "success" as const,
      }),
      runPipeline: async (params: Record<string, unknown>): Promise<{ id: string } | null> => {
        callArgs.push(params);
        return { id: "test-id" };
      },
    };

    await triggerPushBctcExtraction({
      actionCode: "EIB",
      year: 2026,
      quarter: "Q1",
      filePath: "/data/pdfs/20260428-EIB-BCTC-hop-nhat-Q1.2026.pdf",
      filename: "20260428-EIB-BCTC-hop-nhat-Q1.2026.pdf",
      pdfUrl: "http://125.212.251.27:8765/bctc-files/EIB/20260428-EIB-BCTC-hop-nhat-Q1.2026.pdf",
      deps,
    });

    expect(callArgs.length).toBe(1);
    expect(callArgs[0]!.pdfTextOverride).toBe(serviceText);
    expect(callArgs[0]!.actionCode).toBe("EIB");
    expect(callArgs[0]!.year).toBe(2026);
    expect(callArgs[0]!.quarter).toBe("Q1");
  });

  it("skips pipeline when service returns null", async () => {
    const { triggerPushBctcExtraction } = await import(
      "../scheduler/financial-reports/pushBctcExtraction.js"
    );

    const callCount = { n: 0 };
    const deps = {
      extractViaService: async (_url: string) => null,
      runPipeline: async (_params: unknown): Promise<null> => {
        callCount.n++;
        return null;
      },
    };

    await triggerPushBctcExtraction({
      actionCode: "ACB",
      year: 2026,
      quarter: "Q1",
      filePath: "/data/pdfs/ACB_2026_Q1.pdf",
      filename: "ACB_2026_Q1.pdf",
      pdfUrl: "http://125.212.251.27:8765/bctc-files/ACB/ACB_2026_Q1.pdf",
      deps,
    });

    // Pipeline should NOT be called when service returns null
    expect(callCount.n).toBe(0);
  });

  it("skips pipeline when service text is too short (< 100 chars)", async () => {
    const { triggerPushBctcExtraction } = await import(
      "../scheduler/financial-reports/pushBctcExtraction.js"
    );

    const callCount = { n: 0 };
    const deps = {
      extractViaService: async (_url: string) => ({
        documentId: "doc-short",
        tables: [],
        textContent: "too short",
        ocrConfidence: 0.5,
        status: "success" as const,
      }),
      runPipeline: async (_params: unknown): Promise<null> => {
        callCount.n++;
        return null;
      },
    };

    await triggerPushBctcExtraction({
      actionCode: "ACB",
      year: 2026,
      quarter: "Q1",
      filePath: "/data/pdfs/ACB_2026_Q1.pdf",
      filename: "ACB_2026_Q1.pdf",
      pdfUrl: "http://125.212.251.27:8765/bctc-files/ACB/ACB_2026_Q1.pdf",
      deps,
    });

    expect(callCount.n).toBe(0);
  });
});
