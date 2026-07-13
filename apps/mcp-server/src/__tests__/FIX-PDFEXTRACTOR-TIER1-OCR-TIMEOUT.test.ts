/**
 * FIX-PDFEXTRACTOR-TIER1-OCR-TIMEOUT
 *
 * Design: docs/architecture-briefs/2026-07-13-pdfextractor-ocr-timeout-async-reroute.md
 *
 * Root cause: `pdfExtractorClient.ts`'s raw `AbortSignal.timeout(120_000)` Tier 1/2
 * call could hang for 17+ minutes on a scanned (OCR-heavy) PDF, and
 * `triggerPushBctcExtraction()` was documented "never throws… non-fatal" —
 * returning `Promise<void>` unconditionally, which `bctcVpsIngestHandler.ts`'s
 * `setImmediate` callback read as success, marking `bctc_vps_queue.status='done'`
 * even when all 3 tiers were exhausted or `runPipeline()` returned null.
 *
 * AC1 (fail-loud): `triggerPushBctcExtraction` now returns a discriminated
 *   `PushBctcExtractionOutcome` (`done | async_routed | failed`); the queue
 *   row is marked `done` ONLY on `{outcome:"done"}`; `"failed"` stays
 *   retryable AND fires `sendTelegramBug`.
 *
 * AC2 (large-PDF path): a confidence pre-gate (reusing the EXISTING
 *   `extractPdfText()`/`PDF_CONFIDENCE_HIGH_THRESHOLD=200` classifier — no new
 *   constant, no byte-size cutoff) runs ahead of Tier 1. `confidence < 1.0`
 *   (scanned) routes to the async `/pek-extract` pipeline instead of the
 *   sync gauntlet; `confidence === 1.0` (text-native) keeps the existing
 *   Tier1→2→3 gauntlet unchanged.
 *
 * MUST-FIX (Risk 1): `ensureFinancialReportShellRow`'s own upsert never
 *   clobbers an existing pdf_path (`WHERE pdf_path IS NULL` guard) — but
 *   `push-bctc-pdf` is a CORRECTIVE path (e.g. HPG re-source) where an
 *   existing row is the COMMON case. An explicit UNCONDITIONAL
 *   `overwritePdfPathUnconditional()` call (no IS NULL guard) must follow
 *   `ensureShellRow()` so `/pek-extract` never fires against a stale path.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";

import {
  triggerPushBctcExtraction,
  overwritePdfPathUnconditional,
  type PushBctcExtractionDeps,
} from "../scheduler/financial-reports/pushBctcExtraction.js";

import { applyPushBctcExtractionOutcome } from "../interface/mcp/routes/bctcVpsIngestHandler.js";

import { ensureFinancialReportShellRow } from "../application/usecases/bctc/ensureFinancialReportShellRow.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Shared fakes
// ─────────────────────────────────────────────────────────────────────────────

function makeLog() {
  const errors: Array<{ msg: string; ctx?: unknown }> = [];
  const infos: Array<{ msg: string; ctx?: unknown }> = [];
  return {
    debug: (_msg: string, _ctx?: unknown) => {},
    info: (msg: string, ctx?: unknown) => { infos.push({ msg, ctx }); },
    warn: (_msg: string, _ctx?: unknown) => {},
    error: (msg: string, ctx?: unknown) => { errors.push({ msg, ctx }); },
    _errors: errors,
    _infos: infos,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AC2 — confidence pre-gate routing (pushBctcExtraction.ts, pure deps mocks)
// ─────────────────────────────────────────────────────────────────────────────

describe("AC2: confidence < 1.0 (scanned) routes to async PEK extraction, bypassing the sync gauntlet", () => {
  it("calls ensureShellRow → updatePdfPath → triggerPekExtraction, in that order, and returns async_routed", async () => {
    const callOrder: string[] = [];
    let tier1Called = false;
    let runPipelineCalled = false;

    const deps: PushBctcExtractionDeps = {
      // Tier 1/2 must NEVER be reached for a scanned PDF.
      extractViaServicePdfPath: async (_pdfPath: string) => {
        tier1Called = true;
        return null;
      },
      extractViaService: async (_url: string) => null,
      runPipeline: async (_params): Promise<{ id: string } | null> => {
        runPipelineCalled = true;
        return { id: "should-not-be-called" };
      },
      // Confidence pre-gate: scanned PDF (confidence 0.3, per pdf.ts's own
      // "some text extracted but below threshold" bucket).
      extractText: async (_buf: Buffer) => ({ text: "short scan artifact", confidence: 0.3 }),
      readFile: (_path: string) => Buffer.from("fake-scanned-pdf-bytes"),
      ensureShellRow: async (params) => {
        callOrder.push("ensureShellRow");
        expect(params.actionCode).toBe("HPG");
        expect(params.pdfPath).toBe("/data/pdfs/HPG_2025_Q4.pdf");
        return { id: "hpg-report-id", sortKey: "2025-Q4" };
      },
      updatePdfPath: async (params) => {
        callOrder.push("updatePdfPath");
        expect(params.actionCode).toBe("HPG");
        expect(params.sortKey).toBe("2025-Q4");
        expect(params.pdfPath).toBe("/data/pdfs/HPG_2025_Q4.pdf");
      },
      triggerPekExtraction: async (reportId, pdfPath) => {
        callOrder.push("triggerPekExtraction");
        expect(reportId).toBe("hpg-report-id");
        expect(pdfPath).toBe("/data/pdfs/HPG_2025_Q4.pdf");
        return { outcome: "queued", status: 202, reportId, pdfPath };
      },
    };

    const outcome = await triggerPushBctcExtraction({
      actionCode: "HPG",
      year: 2025,
      quarter: "Q4",
      filePath: "/data/pdfs/HPG_2025_Q4.pdf",
      filename: "HPG_2025_Q4.pdf",
      pdfUrl: "http://125.212.251.27:8765/bctc-files/HPG/HPG_2025_Q4.pdf",
      deps,
    });

    expect(tier1Called).toBe(false);
    expect(runPipelineCalled).toBe(false);
    expect(callOrder).toEqual(["ensureShellRow", "updatePdfPath", "triggerPekExtraction"]);
    expect(outcome).toEqual({ outcome: "async_routed", reportId: "hpg-report-id" });
  });

  it("confidence 0 (no text at all — fully scanned) ALSO routes async, not just the 0.3 bucket", async () => {
    let triggerCalled = false;
    const deps: PushBctcExtractionDeps = {
      extractViaService: async (_url: string) => null,
      runPipeline: async (_params): Promise<{ id: string } | null> => ({ id: "unused" }),
      extractText: async (_buf: Buffer) => ({ text: "", confidence: 0 }),
      readFile: (_path: string) => Buffer.from("fake"),
      ensureShellRow: async (params) => ({ id: "id-1", sortKey: `${params.year}-${params.quarter}` }),
      updatePdfPath: async (_params) => {},
      triggerPekExtraction: async (reportId, pdfPath) => {
        triggerCalled = true;
        return { outcome: "queued", status: 202, reportId, pdfPath };
      },
    };

    const outcome = await triggerPushBctcExtraction({
      actionCode: "BSR",
      year: 2025,
      quarter: "Q4",
      filePath: "/data/pdfs/BSR_2025_Q4.pdf",
      filename: "BSR_2025_Q4.pdf",
      pdfUrl: "http://125.212.251.27:8765/bctc-files/BSR/BSR_2025_Q4.pdf",
      deps,
    });

    expect(triggerCalled).toBe(true);
    expect(outcome.outcome).toBe("async_routed");
  });

  it("returns 'failed' (never silently 'done') when async-route deps are missing", async () => {
    const deps: PushBctcExtractionDeps = {
      extractViaService: async (_url: string) => null,
      runPipeline: async (_params): Promise<{ id: string } | null> => ({ id: "unused" }),
      extractText: async (_buf: Buffer) => ({ text: "", confidence: 0 }),
      readFile: (_path: string) => Buffer.from("fake"),
      // ensureShellRow / updatePdfPath / triggerPekExtraction all omitted
    };

    const outcome = await triggerPushBctcExtraction({
      actionCode: "DGC",
      year: 2025,
      quarter: "Q4",
      filePath: "/data/pdfs/DGC_2025_Q4.pdf",
      filename: "DGC_2025_Q4.pdf",
      pdfUrl: "http://125.212.251.27:8765/bctc-files/DGC/DGC_2025_Q4.pdf",
      deps,
    });

    expect(outcome.outcome).toBe("failed");
    if (outcome.outcome === "failed") {
      expect(outcome.reason).toContain("deps are not wired");
    }
  });
});

describe("AC2: confidence === 1.0 (text-native) keeps the sync Tier1→2→3 gauntlet unchanged", () => {
  it("does NOT call ensureShellRow/updatePdfPath/triggerPekExtraction when confidence is 1.0", async () => {
    let asyncDepsCalled = false;
    const deps: PushBctcExtractionDeps = {
      extractViaServicePdfPath: async (_pdfPath: string) => ({
        documentId: "doc-1",
        tables: [],
        textContent: "Báo cáo tài chính VCB " + "X".repeat(200),
        ocrConfidence: 0.95,
        status: "success" as const,
      }),
      extractViaService: async (_url: string) => null,
      runPipeline: async (_params): Promise<{ id: string } | null> => ({ id: "vcb-id" }),
      extractText: async (_buf: Buffer) => ({ text: "X".repeat(200), confidence: 1.0 }),
      readFile: (_path: string) => Buffer.from("fake-text-native-pdf"),
      ensureShellRow: async (params) => {
        asyncDepsCalled = true;
        return { id: "unused", sortKey: `${params.year}-${params.quarter}` };
      },
      updatePdfPath: async (_params) => { asyncDepsCalled = true; },
      triggerPekExtraction: async (reportId, pdfPath) => {
        asyncDepsCalled = true;
        return { outcome: "queued", status: 202, reportId, pdfPath };
      },
    };

    const outcome = await triggerPushBctcExtraction({
      actionCode: "VCB",
      year: 2025,
      quarter: "Q4",
      filePath: "/data/pdfs/VCB_2025_Q4.pdf",
      filename: "VCB_2025_Q4.pdf",
      pdfUrl: "http://125.212.251.27:8765/bctc-files/VCB/VCB_2025_Q4.pdf",
      deps,
    });

    expect(asyncDepsCalled).toBe(false);
    expect(outcome).toEqual({ outcome: "done", reportId: "vcb-id" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC1 — discriminated outcome for the sync gauntlet's own failure modes
// ─────────────────────────────────────────────────────────────────────────────

describe("AC1: runPipeline() returning null must be 'failed', not silently folded into 'done'", () => {
  it("returns {outcome:'failed'} when runPipeline resolves null after a successful tier read", async () => {
    const deps: PushBctcExtractionDeps = {
      extractViaService: async (_url: string) => ({
        documentId: "doc-2",
        tables: [],
        textContent: "Báo cáo " + "Y".repeat(200),
        ocrConfidence: 0.9,
        status: "success" as const,
      }),
      runPipeline: async (_params): Promise<{ id: string } | null> => null,
    };

    const outcome = await triggerPushBctcExtraction({
      actionCode: "NKG",
      year: 2025,
      quarter: "Q4",
      filePath: "",
      filename: "NKG_2025_Q4.pdf",
      pdfUrl: "http://125.212.251.27:8765/bctc-files/NKG/NKG_2025_Q4.pdf",
      deps,
    });

    expect(outcome.outcome).toBe("failed");
    if (outcome.outcome === "failed") {
      expect(outcome.reason).toContain("runPipeline returned null");
    }
  });

  it("returns {outcome:'failed'} when runPipeline throws", async () => {
    const deps: PushBctcExtractionDeps = {
      extractViaService: async (_url: string) => ({
        documentId: "doc-3",
        tables: [],
        textContent: "Báo cáo " + "Z".repeat(200),
        ocrConfidence: 0.9,
        status: "success" as const,
      }),
      runPipeline: async (_params): Promise<{ id: string } | null> => {
        throw new Error("DB write failed");
      },
    };

    const outcome = await triggerPushBctcExtraction({
      actionCode: "NKG",
      year: 2025,
      quarter: "Q4",
      filePath: "",
      filename: "NKG_2025_Q4.pdf",
      pdfUrl: "http://125.212.251.27:8765/bctc-files/NKG/NKG_2025_Q4.pdf",
      deps,
    });

    expect(outcome.outcome).toBe("failed");
    if (outcome.outcome === "failed") {
      expect(outcome.reason).toContain("DB write failed");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MUST-FIX (Risk 1) — overwritePdfPathUnconditional, real in-memory DB
// ─────────────────────────────────────────────────────────────────────────────

describe("MUST-FIX Risk 1: overwritePdfPathUnconditional overwrites a STALE pdf_path (not silently skipped)", () => {
  beforeAll(async () => {
    Bun.env["DB_PATH"] = ":memory:";
    await initDatabase();
  });

  afterAll(() => {
    closeDb();
    delete Bun.env["DB_PATH"];
  });

  beforeEach(() => {
    getDb().prepare("DELETE FROM financial_reports WHERE action_code LIKE 'RISK1%'").run();
  });

  it("ensureFinancialReportShellRow ALONE does NOT clobber an existing pdf_path (sibling contract, sanity check)", async () => {
    const first = await ensureFinancialReportShellRow({
      actionCode: "RISK1HPG",
      year: 2025,
      quarter: "Q4",
      pdfPath: "/app/data/pdfs/RISK1HPG_2025_Q4_STALE_STANDALONE.pdf",
    });

    // Simulate the corrective re-push: ensureShellRow alone must NOT update
    // the stale path (this is the documented, unchanged behavior of
    // ensureFinancialReportShellRow.ts — the bug this fix must NOT reproduce).
    const second = await ensureFinancialReportShellRow({
      actionCode: "RISK1HPG",
      year: 2025,
      quarter: "Q4",
      pdfPath: "/app/data/pdfs/RISK1HPG_2025_Q4_NEW_CONSOLIDATED.pdf",
    });

    expect(second.id).toBe(first.id);
    const row = getDb()
      .prepare("SELECT pdf_path FROM financial_reports WHERE action_code = ? AND sort_key = ?")
      .get("RISK1HPG", "2025-Q4") as { pdf_path: string };
    // STILL the stale path — proves ensureShellRow alone is NOT sufficient.
    expect(row.pdf_path).toBe("/app/data/pdfs/RISK1HPG_2025_Q4_STALE_STANDALONE.pdf");
  });

  it("overwritePdfPathUnconditional DOES overwrite the same stale pdf_path — the must-fix behavior", async () => {
    const shellRow = await ensureFinancialReportShellRow({
      actionCode: "RISK1HPG2",
      year: 2025,
      quarter: "Q4",
      pdfPath: "/app/data/pdfs/RISK1HPG2_2025_Q4_STALE_STANDALONE.pdf",
    });

    // Re-run ensureShellRow with the NEW path (as pushBctcExtraction.ts does)
    // — proves the no-op happens first, exactly like the real call sequence.
    await ensureFinancialReportShellRow({
      actionCode: "RISK1HPG2",
      year: 2025,
      quarter: "Q4",
      pdfPath: "/app/data/pdfs/RISK1HPG2_2025_Q4_NEW_CONSOLIDATED.pdf",
    });

    // Now issue the explicit unconditional overwrite (MUST-FIX Risk 1).
    overwritePdfPathUnconditional(getDb(), {
      actionCode: "RISK1HPG2",
      sortKey: "2025-Q4",
      pdfPath: "/app/data/pdfs/RISK1HPG2_2025_Q4_NEW_CONSOLIDATED.pdf",
    });

    const row = getDb()
      .prepare("SELECT id, pdf_path FROM financial_reports WHERE action_code = ? AND sort_key = ?")
      .get("RISK1HPG2", "2025-Q4") as { id: string; pdf_path: string };

    expect(row.id).toBe(shellRow.id); // id stability preserved
    // pdf_path IS the new path now — the overwrite was NOT silently skipped.
    expect(row.pdf_path).toBe("/app/data/pdfs/RISK1HPG2_2025_Q4_NEW_CONSOLIDATED.pdf");
  });

  it("overwritePdfPathUnconditional is a true no-guard UPDATE — works even with no pre-existing row match (0 rows affected, no throw)", () => {
    expect(() =>
      overwritePdfPathUnconditional(getDb(), {
        actionCode: "RISK1NOROW",
        sortKey: "2025-Q4",
        pdfPath: "/app/data/pdfs/RISK1NOROW_2025_Q4.pdf",
      }),
    ).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC1 — bctcVpsIngestHandler.ts: applyPushBctcExtractionOutcome queue transitions
// ─────────────────────────────────────────────────────────────────────────────

function makeQueueTestDb(): Database {
  const db = new Database(":memory:");
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
  return db;
}

function seedQueueRow(db: Database, actionCode: string, year: number, quarter: string): void {
  db.prepare(
    `INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, attempts)
     VALUES (?, ?, ?, 'fetching', 1)`,
  ).run(actionCode, year, quarter);
}

describe("AC1: applyPushBctcExtractionOutcome — queue-status transition per discriminated outcome", () => {
  it("'done' outcome → status='done'", async () => {
    const db = makeQueueTestDb();
    seedQueueRow(db, "VCB", 2025, "Q4");
    const log = makeLog();

    await applyPushBctcExtractionOutcome(
      db,
      log as any,
      { actionCode: "VCB", periodYear: 2025, periodQuarter: "Q4" },
      { outcome: "done", reportId: "vcb-id" },
    );

    const row = db.prepare(
      "SELECT status FROM bctc_vps_queue WHERE action_code='VCB' AND period_year=2025 AND period_quarter='Q4'",
    ).get() as { status: string };
    expect(row.status).toBe("done");
    db.close();
  });

  it("'async_routed' outcome → status='pek_triggered' with last_attempt set (reconcile job owns the rest)", async () => {
    const db = makeQueueTestDb();
    seedQueueRow(db, "HPG", 2025, "Q4");
    const log = makeLog();

    await applyPushBctcExtractionOutcome(
      db,
      log as any,
      { actionCode: "HPG", periodYear: 2025, periodQuarter: "Q4" },
      { outcome: "async_routed", reportId: "hpg-id" },
    );

    const row = db.prepare(
      "SELECT status, last_attempt FROM bctc_vps_queue WHERE action_code='HPG' AND period_year=2025 AND period_quarter='Q4'",
    ).get() as { status: string; last_attempt: string | null };
    expect(row.status).toBe("pek_triggered");
    expect(row.last_attempt).not.toBeNull();
    db.close();
  });

  it("'failed' outcome → status STAYS 'failed' (retryable), NEVER 'done', and fires sendBugFn", async () => {
    const db = makeQueueTestDb();
    seedQueueRow(db, "BSR", 2025, "Q4");
    const log = makeLog();

    const bugMessages: string[] = [];
    const sendBugFn = async (msg: string) => { bugMessages.push(msg); };

    await applyPushBctcExtractionOutcome(
      db,
      log as any,
      { actionCode: "BSR", periodYear: 2025, periodQuarter: "Q4" },
      { outcome: "failed", reason: "all extraction tiers exhausted for BSR 2025-Q4" },
      sendBugFn,
    );

    const row = db.prepare(
      "SELECT status FROM bctc_vps_queue WHERE action_code='BSR' AND period_year=2025 AND period_quarter='Q4'",
    ).get() as { status: string };
    expect(row.status).toBe("failed");
    expect(row.status).not.toBe("done");

    // Fail-loud: sendBugFn must have fired with the failure reason.
    expect(bugMessages.length).toBe(1);
    expect(bugMessages[0]).toContain("BSR");
    expect(bugMessages[0]).toContain("all extraction tiers exhausted");
    db.close();
  });

  it("'failed' outcome: a throwing sendBugFn does NOT block the status transition (non-fatal to fail-loud)", async () => {
    const db = makeQueueTestDb();
    seedQueueRow(db, "DGC", 2025, "Q4");
    const log = makeLog();

    const sendBugFn = async (_msg: string) => {
      throw new Error("Telegram unreachable");
    };

    await applyPushBctcExtractionOutcome(
      db,
      log as any,
      { actionCode: "DGC", periodYear: 2025, periodQuarter: "Q4" },
      { outcome: "failed", reason: "runPipeline returned null" },
      sendBugFn,
    );

    const row = db.prepare(
      "SELECT status FROM bctc_vps_queue WHERE action_code='DGC' AND period_year=2025 AND period_quarter='Q4'",
    ).get() as { status: string };
    expect(row.status).toBe("failed");
    db.close();
  });
});
