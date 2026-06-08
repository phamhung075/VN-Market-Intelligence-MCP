/**
 * FIX-CTG-3 STEP-C — Extraction pipeline fixes for stuck-fetching and geo-blocked URLs
 *
 * Root cause: POST /api/push-bctc-pdf saves PDF to disk, sets status='fetching',
 * then fires setImmediate→triggerPushBctcExtraction(sourceUrl=hsx.vn URL).
 * The pdf-extractor service is called with the geo-blocked hsx.vn URL → returns null.
 * triggerPushBctcExtraction logs warn and returns WITHOUT running the pipeline.
 * setImmediate catches no error → sets status='done' — but financial_reports is empty.
 *
 * Two-part fix:
 *
 * FIX-1: triggerPushBctcExtraction local-file fallback (pushBctcExtraction.ts)
 *   FEAT-PDF-EXTRACTOR-LOCAL-INPUT update: Tier 1 now uses extractViaServicePdfPath
 *   (pdf_path body mode — no url key) when filePath is non-empty. When that dep is
 *   absent or fails, Tier 2 tries remote URL mode. Tier 3 falls through to pdf-parse.
 *
 * FIX-2: recoverStuckFetchingQueue migration (schema-financial-reports.ts)
 *   On startup, reset bctc_vps_queue rows with status='fetching' that have no
 *   corresponding financial_reports entry back to status='pending'. This allows
 *   the bctcQueueEnricher + bctcPdfPullJob cycle to pick them up. Also triggers
 *   bctcReparseJob disk scan path for any on-disk PDF.
 *
 * AC:
 *   FIX-1-A: pipeline IS called when extractViaServicePdfPath (Tier 1) succeeds
 *   FIX-1-B: pipeline IS called when Tier 1 absent + Tier 2 URL fails → pdf-parse succeeds
 *   FIX-1-C: pipeline NOT called when all tiers fail (no filePath, no text)
 *   FIX-2-A: recoverStuckFetchingQueue resets fetching rows with no financial_reports to pending
 *   FIX-2-B: recoverStuckFetchingQueue leaves fetching rows that DO have a financial_reports row
 *   FIX-2-C: recoverStuckFetchingQueue is idempotent (second call = 0 changes)
 *   FIX-2-D: CTG Q1-2026 with filename containing spaces is correctly parsed year=2026 quarter=Q1
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

import {
  triggerPushBctcExtraction,
  type PushBctcExtractionDeps,
} from "../scheduler/financial-reports/pushBctcExtraction.js";

import {
  parseYearQuarterFromFilename,
} from "../scheduler/financial-reports/bctcReparseJob.js";

import {
  recoverStuckFetchingQueue,
} from "../infrastructure/db/schema-financial-reports.js";

// ─────────────────────────────────────────────────────────────────────────────
// FIX-1: pushBctcExtraction local-file fallback
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-1-A: pipeline called via extractViaServicePdfPath (Tier 1) when wired", () => {
  it("calls runPipeline with text from pdf_path Tier 1 when extractViaServicePdfPath is provided", async () => {
    // FEAT-PDF-EXTRACTOR-LOCAL-INPUT: Tier 1 now uses extractViaServicePdfPath (pdf_path body mode).
    const fileText = "Báo cáo tài chính CTG Q1 2026 bank B02-TCTD " + "X".repeat(200);

    const callArgs: Record<string, unknown>[] = [];
    let pdfPathCallCount = 0;
    let remoteUrlCallCount = 0;

    const deps: PushBctcExtractionDeps = {
      // Tier 1: pdf_path mode — succeeds
      extractViaServicePdfPath: async (_pdfPath: string) => {
        pdfPathCallCount++;
        return {
          documentId: "doc-local",
          tables: [],
          textContent: fileText,
          ocrConfidence: 0.85,
          status: "success" as const,
        };
      },
      // Tier 2: remote URL mode — should NOT be reached when Tier 1 succeeds
      extractViaService: async (_url: string) => {
        remoteUrlCallCount++;
        return null;
      },
      runPipeline: async (params: Record<string, unknown>): Promise<{ id: string } | null> => {
        callArgs.push(params);
        return { id: "ctg-q1-2026" };
      },
      extractText: async (_buf: Buffer): Promise<{ text: string; confidence: number }> => {
        return { text: "", confidence: 0 };
      },
      readFile: (_path: string): Buffer => {
        return Buffer.from("fake-pdf-bytes");
      },
    };

    await triggerPushBctcExtraction({
      actionCode: "CTG",
      year: 2026,
      quarter: "Q1",
      filePath: "/data/pdfs/CTG_2026_Q1.pdf",
      filename: "CTG_2026_Q1.pdf",
      pdfUrl: "https://staticfile.hsx.vn/Uploads/documents/CTG_Quy_I.2026.pdf",
      deps,
    });

    // pipeline must be called with the Tier 1 text
    expect(callArgs.length).toBe(1);
    expect(callArgs[0]!.pdfTextOverride).toBe(fileText);
    expect(callArgs[0]!.actionCode).toBe("CTG");
    // Tier 1 (pdf_path) must have been called once
    expect(pdfPathCallCount).toBe(1);
    // Tier 2 (remote URL) must NOT have been called (Tier 1 succeeded)
    expect(remoteUrlCallCount).toBe(0);
  });
});

describe("FIX-1-B: pipeline called via direct pdf-parse when service tiers absent/fail", () => {
  it("falls back to extractText(readFile) when extractViaServicePdfPath absent and URL service returns null", async () => {
    const bufText = "CTG bank B02-TCTD direct parse " + "Y".repeat(200);

    const callArgs: Record<string, unknown>[] = [];
    let readFileCalled = false;
    let extractTextCalled = false;

    const deps: PushBctcExtractionDeps = {
      // No extractViaServicePdfPath (Tier 1 absent) → falls through to Tier 2
      extractViaService: async (_url: string) => null, // Tier 2 (URL mode) also fails
      runPipeline: async (params: Record<string, unknown>): Promise<{ id: string } | null> => {
        callArgs.push(params);
        return { id: "ctg-direct" };
      },
      extractText: async (_buf: Buffer): Promise<{ text: string; confidence: number }> => {
        extractTextCalled = true;
        return { text: bufText, confidence: 0.65 };
      },
      readFile: (_path: string): Buffer => {
        readFileCalled = true;
        return Buffer.from("fake-pdf-bytes-local");
      },
    };

    await triggerPushBctcExtraction({
      actionCode: "CTG",
      year: 2026,
      quarter: "Q1",
      filePath: "/data/pdfs/CTG_2026_Q1.pdf",
      filename: "CTG_2026_Q1.pdf",
      pdfUrl: "https://staticfile.hsx.vn/Uploads/documents/CTG_Quy_I.2026.pdf",
      deps,
    });

    expect(readFileCalled).toBe(true);
    expect(extractTextCalled).toBe(true);
    expect(callArgs.length).toBe(1);
    expect(callArgs[0]!.pdfTextOverride).toBe(bufText);
  });
});

describe("FIX-1-C: pipeline NOT called when no filePath and service fails", () => {
  it("skips pipeline entirely when service fails and no filePath provided", async () => {
    const callCount = { n: 0 };

    const deps: PushBctcExtractionDeps = {
      extractViaService: async (_url: string) => null,
      runPipeline: async (_params: unknown): Promise<null> => {
        callCount.n++;
        return null;
      },
    };

    await triggerPushBctcExtraction({
      actionCode: "CTG",
      year: 2026,
      quarter: "Q1",
      // No filePath
      filePath: "",
      filename: "CTG_2026_Q1.pdf",
      pdfUrl: "https://staticfile.hsx.vn/Uploads/documents/CTG_Quy_I.2026.pdf",
      deps,
    });

    expect(callCount.n).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FIX-2: recoverStuckFetchingQueue migration
// ─────────────────────────────────────────────────────────────────────────────

function makeTestDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS bctc_vps_queue (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      action_code     TEXT    NOT NULL,
      period_year     INTEGER NOT NULL,
      period_quarter  TEXT    NOT NULL,
      status          TEXT    NOT NULL DEFAULT 'pending',
      source_url      TEXT,
      attempts        INTEGER NOT NULL DEFAULT 0,
      last_attempt    TEXT,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(action_code, period_year, period_quarter)
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS financial_reports (
      id TEXT PRIMARY KEY,
      action_code TEXT NOT NULL,
      period_year INTEGER NOT NULL,
      period_type TEXT NOT NULL
    )
  `);
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

describe("FIX-2-A: recoverStuckFetchingQueue resets fetching→pending when no financial_reports row", () => {
  it("resets CTG Q1-2026 from fetching to pending when financial_reports has no row", () => {
    const db = makeTestDb();

    // Simulate: push-bctc-pdf handler set status='fetching'
    db.prepare(
      "INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, attempts) VALUES ('CTG', 2026, 'Q1', 'fetching', 1)"
    ).run();

    const count = recoverStuckFetchingQueue(db);

    expect(count).toBe(1);

    const row = db.prepare(
      "SELECT status FROM bctc_vps_queue WHERE action_code='CTG' AND period_year=2026 AND period_quarter='Q1'"
    ).get() as { status: string };
    expect(row.status).toBe("pending");

    db.close();
  });
});

describe("FIX-2-B: recoverStuckFetchingQueue leaves fetching row when financial_reports EXISTS", () => {
  it("does NOT reset CTG Q1-2026 when financial_reports has a row for it", () => {
    const db = makeTestDb();

    db.prepare(
      "INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, attempts) VALUES ('CTG', 2026, 'Q1', 'fetching', 1)"
    ).run();

    // financial_reports has a row — extraction succeeded
    db.prepare(
      "INSERT INTO financial_reports (id, action_code, period_year, period_type) VALUES ('ctg-q1', 'CTG', 2026, 'Q1')"
    ).run();

    const count = recoverStuckFetchingQueue(db);

    expect(count).toBe(0); // no rows reset

    const row = db.prepare(
      "SELECT status FROM bctc_vps_queue WHERE action_code='CTG' AND period_year=2026 AND period_quarter='Q1'"
    ).get() as { status: string };
    expect(row.status).toBe("fetching"); // unchanged

    db.close();
  });
});

describe("FIX-2-C: recoverStuckFetchingQueue is idempotent", () => {
  it("returns 0 on second call (rows already reset to pending)", () => {
    const db = makeTestDb();

    db.prepare(
      "INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, attempts) VALUES ('CTG', 2026, 'Q1', 'fetching', 1)"
    ).run();

    const firstCount = recoverStuckFetchingQueue(db);
    const secondCount = recoverStuckFetchingQueue(db);

    expect(firstCount).toBe(1);
    expect(secondCount).toBe(0); // already pending

    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FIX-2-D: CTG filename with spaces parses correctly
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-2-D: CTG YYYYMMDD filename with spaces parses year=2026 quarter=Q1", () => {
  it("parses '20260428 - CTG - BCTC hop nhat Quy I.2026 va giai trinh..._signed.pdf'", () => {
    const filename = "20260428 - CTG - BCTC hop nhat Quy I.2026 va giai trinh bien dong loi nhuan_signed.pdf";
    const result = parseYearQuarterFromFilename(filename);
    expect(result).not.toBeNull();
    expect(result!.year).toBe(2026);
    expect(result!.quarter).toBe("Q1");
  });

  it("parses 'CTG_2026_Q1.pdf' (normalised push-bctc-pdf filename)", () => {
    const result = parseYearQuarterFromFilename("CTG_2026_Q1.pdf");
    expect(result).not.toBeNull();
    expect(result!.year).toBe(2026);
    expect(result!.quarter).toBe("Q1");
  });
});
