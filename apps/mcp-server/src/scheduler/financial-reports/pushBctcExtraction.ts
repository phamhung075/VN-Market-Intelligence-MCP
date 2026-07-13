/**
 * Push-BCTC Extraction Helper — Task 1945d / 1954c / FIX-CTG-3-STEP-C /
 * FIX-PDFEXTRACTOR-TIER1-OCR-TIMEOUT
 *
 * Extracted from `server.ts` push-bctc-pdf handler for testability.
 *
 * 1945d: Original fix — replaced the old `setImmediate → fetchParseAndStoreBctc`
 * (which had no pdfTextOverride) with local OCR extraction → pdfTextOverride.
 *
 * 1954c (G5b): Consolidation — replaces the OCR-based extraction pattern
 * (`extractAndStorePdfPagesWithRetry` + `getCachedPdfText`) with a single
 * HTTP call to the pdf-extractor microservice via `pdfExtractorClient.extractViaMicroservice`.
 * The service is now the single extraction owner for all 4 BCTC callers.
 *
 * FIX-CTG-3-STEP-C: Three-tier local-file fallback for geo-blocked push URLs.
 *   When extractViaService(pdfUrl) returns null (e.g. hsx.vn is geo-blocked from
 *   the extraction service), fall back to:
 *   Tier 2: extractViaService(file://${filePath}) — reads from local disk, not remote.
 *   Tier 3: extractText(readFile(filePath)) — direct pdf-parse from local buffer.
 *   This closes the "status=fetching, financial_reports empty" bug where the push
 *   handler saved the PDF to disk but extraction silently failed on the remote URL.
 *
 * FIX-PDFEXTRACTOR-TIER1-OCR-TIMEOUT (design: docs/architecture-briefs/
 * 2026-07-13-pdfextractor-ocr-timeout-async-reroute.md):
 *
 *   AC1 (fail-loud, root cause): `triggerPushBctcExtraction` used to return
 *   `Promise<void>` and was documented "never throws… non-fatal" — the caller
 *   (bctcVpsIngestHandler.ts) treated no-throw as success and unconditionally
 *   marked the queue row 'done', even when all 3 tiers were exhausted or
 *   `runPipeline()` returned null. Now returns a discriminated
 *   `PushBctcExtractionOutcome` (`done | async_routed | failed`) so the
 *   caller can no longer default to success.
 *
 *   AC2 (large-PDF path): a confidence pre-gate now runs ahead of Tier 1,
 *   reusing the EXISTING `extractPdfText()` classifier
 *   (infrastructure/fetchers/pdf.ts, `PDF_CONFIDENCE_HIGH_THRESHOLD=200`) via
 *   the same `extractText`/`readFile` deps Tier 3 already used — no new
 *   constant, no byte-size cutoff (a byte-size cutoff was evaluated and
 *   rejected: the live corpus has already-healthy text-native filings 2-3x
 *   larger than the failing scanned HPG PDF, purely due to embedded scan
 *   appendices). `confidence < 1.0` (scanned/minimal-text) routes to the
 *   already-shipped async `/pek-extract` pipeline (ensureShellRow → explicit
 *   unconditional pdf_path overwrite [Risk 1, see `overwritePdfPathUnconditional`
 *   below] → triggerPekExtraction); `confidence === 1.0` (text-native) keeps
 *   the existing sync Tier1→2→3 gauntlet unchanged.
 *
 * Layer: interface/scheduler — dependencies on infrastructure (pdfExtractorClient,
 *        logger) and application (fetchParseAndStoreBctc).
 */

import { existsSync } from "node:fs";
import type { Database } from "bun:sqlite";
import { logger } from "../../infrastructure/logger.js";
import type { PdfExtractorResult } from "../../infrastructure/fetchers/pdfExtractorClient.js";
import type { PekTriggerOutcome } from "../../infrastructure/fetchers/pekExtractTrigger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Injectable deps — enables unit testing without real HTTP or real DB
// ─────────────────────────────────────────────────────────────────────────────

export interface PushBctcExtractionDeps {
  /**
   * Delegate PDF extraction to the pdf-extractor microservice.
   * 1954c: replaces extractPages + getCache (OCR pattern).
   * Returns null when service unavailable or returns error.
   * Maps to `extractViaMicroservice` from pdfExtractorClient in production.
   * Called for the remote pdfUrl (Tier 2) and file:// fallback (old Tier 2).
   */
  extractViaService: (url: string) => Promise<PdfExtractorResult | null>;

  /**
   * FEAT-PDF-EXTRACTOR-LOCAL-INPUT: delegate PDF extraction using the shared-volume
   * pdf_path (POST /extract body: {pdf_path, source_type} — NO url key).
   * Tier 1 — attempted first when filePath is non-empty.
   * Returns null when service unavailable or extraction fails.
   * Maps to `extractViaMicroservice(url="", ..., pdfPath)` from pdfExtractorClient.
   * Optional — when absent, Tier 1 is skipped and Tier 2 (URL mode) is attempted.
   */
  extractViaServicePdfPath?: (pdfPath: string) => Promise<PdfExtractorResult | null>;

  /**
   * Run the full BCTC parse+store pipeline.
   * Maps to `fetchParseAndStoreBctc` in production.
   */
  runPipeline: (params: {
    actionCode: string;
    year: number;
    quarter: "Q1" | "Q2" | "Q3" | "Q4";
    pdfTextOverride: string;
    pdfUrl: string;
  }) => Promise<{ id: string } | null>;

  /**
   * FIX-CTG-3-STEP-C Tier 3: extract text from a PDF buffer via pdf-parse.
   * Called when both service calls (remote URL + file://) return null/short text.
   * Optional — if absent, Tier 3 is skipped.
   * Maps to `extractPdfText` from infrastructure/fetchers/pdf.ts in production.
   */
  extractText?: (buf: Buffer) => Promise<{ text: string; confidence: number }>;

  /**
   * FIX-CTG-3-STEP-C Tier 3: read a local file into a Buffer.
   * Called to obtain the PDF buffer before passing to extractText.
   * Optional — if absent, Tier 3 is skipped.
   * Maps to `readFileSync` in production.
   *
   * FIX-PDFEXTRACTOR-TIER1-OCR-TIMEOUT: this SAME dep is also used for the
   * new confidence pre-gate (Decision 2) — one read of the just-saved
   * buffer, reused for both the pre-gate and (if reached) Tier 3.
   */
  readFile?: (path: string) => Buffer;

  /**
   * FIX-PDFEXTRACTOR-TIER1-OCR-TIMEOUT (AC2, Decision 3 §1) — idempotent
   * shell-row upsert for the scanned/async branch. Gives a stable
   * `financial_reports.id` for a brand-new ticker/quarter (or reuses the
   * existing one). Maps to `ensureFinancialReportShellRow`
   * (application/usecases/bctc/ensureFinancialReportShellRow.js) in production.
   * Optional — when the confidence gate routes to the scanned branch and
   * this dep is absent, the branch cannot proceed and the outcome is "failed".
   */
  ensureShellRow?: (params: {
    actionCode: string;
    year: number;
    quarter: "Q1" | "Q2" | "Q3" | "Q4";
    pdfPath: string;
  }) => Promise<{ id: string; sortKey: string }>;

  /**
   * FIX-PDFEXTRACTOR-TIER1-OCR-TIMEOUT (AC2, Decision 3 §1a — MUST-FIX Risk 1)
   * — explicit UNCONDITIONAL pdf_path overwrite, issued AFTER ensureShellRow().
   * ensureShellRow's own upsert deliberately never clobbers an existing
   * pdf_path (`WHERE financial_reports.pdf_path IS NULL` guard) because its
   * primary caller (bctcPdfPullJob.ts) never needs to correct an existing
   * path. `push-bctc-pdf`'s use case is explicitly CORRECTIVE (e.g. HPG:
   * replacing a stale standalone PDF with the real consolidated one) — an
   * existing row for (action_code, sort_key) is the COMMON case here, not
   * the exception. Without this explicit unconditional overwrite,
   * `/pek-extract` would be triggered against the STALE pdf_path and this
   * fix would silently reproduce its own bug class.
   * Maps to `overwritePdfPathUnconditional` (this module, production wraps
   * it with the getDb() singleton) — NOT a modification of
   * ensureFinancialReportShellRow.ts, which stays untouched.
   * Optional — when the confidence gate routes to the scanned branch and
   * this dep is absent, the branch cannot proceed and the outcome is "failed".
   */
  updatePdfPath?: (params: {
    actionCode: string;
    sortKey: string;
    pdfPath: string;
  }) => Promise<void>;

  /**
   * FIX-PDFEXTRACTOR-TIER1-OCR-TIMEOUT (AC2, Decision 3 §1b) — fire the async
   * PEK table-extraction trigger for the scanned branch. Maps to
   * `triggerPekExtractionForReport` (infrastructure/fetchers/pekExtractTrigger.js)
   * — the SAME helper `bctcPdfPullJob.ts` and the manual
   * `/api/trigger-pek-extract` MCP route already use. Per Decision 3 §1c the
   * returned outcome (202/503/502/unreachable) is intentionally NOT
   * special-cased here — that discrimination belongs to
   * bctcExtractReconcileJob.ts, which is untouched by this fix.
   * Optional — when the confidence gate routes to the scanned branch and
   * this dep is absent, the branch cannot proceed and the outcome is "failed".
   */
  triggerPekExtraction?: (
    reportId: string,
    pdfPath: string,
  ) => Promise<PekTriggerOutcome>;
}

/**
 * FIX-PDFEXTRACTOR-TIER1-OCR-TIMEOUT — discriminated outcome union (AC1).
 * Replaces the old `Promise<void>` return type so "no throw" can no longer
 * be silently read as "success" by the caller.
 *
 *   "done"         — `runPipeline()` returned a non-null result (existing
 *                    sync Tier1→2→3 gauntlet, confidence === 1.0 branch).
 *   "async_routed" — scanned PDF (confidence < 1.0) routed to the async
 *                    `/pek-extract` pipeline; bctcExtractReconcileJob.ts owns
 *                    the rest of the lifecycle.
 *   "failed"       — all extraction tiers exhausted, `runPipeline()` returned
 *                    null, `runPipeline()` threw, or the scanned branch could
 *                    not proceed (missing deps / threw). Never silently
 *                    folded into "done".
 */
export type PushBctcExtractionOutcome =
  | { outcome: "done"; reportId: string }
  | { outcome: "async_routed"; reportId: string }
  | { outcome: "failed"; reason: string };

/**
 * FIX-PDFEXTRACTOR-TIER1-OCR-TIMEOUT (MUST-FIX Risk 1) — explicit
 * UNCONDITIONAL pdf_path overwrite for a `financial_reports` row identified
 * by (action_code, sort_key). Deliberately has NO `WHERE pdf_path IS NULL`
 * guard (unlike `ensureFinancialReportShellRow`'s own upsert) — see the
 * `updatePdfPath` dep doc comment above for the full corrective-path
 * rationale. Exported (not inlined in makeProductionDeps) so it can be unit
 * tested directly against a real in-memory DB, proving the overwrite is NOT
 * silently skipped when a stale pdf_path already exists.
 */
export function overwritePdfPathUnconditional(
  db: Database,
  params: { actionCode: string; sortKey: string; pdfPath: string },
): void {
  db.prepare(
    `UPDATE financial_reports SET pdf_path = ? WHERE action_code = ? AND sort_key = ?`,
  ).run(params.pdfPath, params.actionCode, params.sortKey);
}

export interface PushBctcExtractionParams {
  actionCode: string;
  year: number;
  quarter: "Q1" | "Q2" | "Q3" | "Q4";
  filePath: string;
  filename: string;
  pdfUrl: string;
  deps?: PushBctcExtractionDeps;
}

// Retain PushBctcExtractionParams for backward compatibility with server.ts callers.
// The filePath/filename params are still accepted but no longer used for OCR extraction
// (1954c): extraction is now delegated to the service via pdfUrl.

// ─────────────────────────────────────────────────────────────────────────────
// Production deps factory — lazy-loaded so module import never touches LanceDB
// ─────────────────────────────────────────────────────────────────────────────

async function makeProductionDeps(): Promise<PushBctcExtractionDeps> {
  const { extractViaMicroservice } = await import(
    "../../infrastructure/fetchers/pdfExtractorClient.js"
  );
  const { fetchParseAndStoreBctc } = await import(
    "../../application/usecases/fetchParseAndStoreBctc.js"
  );
  const { extractPdfText } = await import(
    "../../infrastructure/fetchers/pdf.js"
  );
  const { readFileSync } = await import("node:fs");
  const { ensureFinancialReportShellRow } = await import(
    "../../application/usecases/bctc/ensureFinancialReportShellRow.js"
  );
  const { triggerPekExtractionForReport } = await import(
    "../../infrastructure/fetchers/pekExtractTrigger.js"
  );

  return {
    // 1954c: service is the extraction owner — replace OCR pattern
    extractViaService: async (url: string) => extractViaMicroservice(url, "bctc"),
    // FEAT-PDF-EXTRACTOR-LOCAL-INPUT: Tier 1 — pdf_path body mode (no url key)
    extractViaServicePdfPath: async (pdfPath: string) => extractViaMicroservice("", "bctc", pdfPath),
    runPipeline: async (params) => fetchParseAndStoreBctc(params),
    // FIX-CTG-3-STEP-C Tier 3 / FIX-PDFEXTRACTOR-TIER1-OCR-TIMEOUT pre-gate:
    // direct pdf-parse (no OCR, sub-second even on 20MB files).
    extractText: async (buf: Buffer) => extractPdfText(buf),
    readFile: (path: string) => readFileSync(path),
    // FIX-PDFEXTRACTOR-TIER1-OCR-TIMEOUT (AC2) — scanned/async branch deps.
    ensureShellRow: async (params) => ensureFinancialReportShellRow(params),
    updatePdfPath: async ({ actionCode, sortKey, pdfPath }) => {
      const { getDb } = await import("../../infrastructure/db/schema.js");
      overwritePdfPathUnconditional(getDb(), { actionCode, sortKey, pdfPath });
    },
    triggerPekExtraction: async (reportId: string, pdfPath: string) =>
      triggerPekExtractionForReport(reportId, pdfPath),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Core function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract text from a newly-pushed BCTC PDF and run the parse+store pipeline
 * (confidence === 1.0 / text-native), OR route to the async PEK extraction
 * pipeline (confidence < 1.0 / scanned) — see FIX-PDFEXTRACTOR-TIER1-OCR-TIMEOUT.
 *
 * FIX-PDFEXTRACTOR-TIER1-OCR-TIMEOUT confidence pre-gate (Decision 2, runs
 * BEFORE Tier 1): `extractText(readFile(filePath))` is run once on the
 * just-saved buffer. `confidence < 1.0` (scanned/minimal-text) short-circuits
 * straight to the async `/pek-extract` route (Decision 3) — the sync gauntlet
 * below is never attempted for these. `confidence === 1.0` (text-native), or
 * the gate being skipped entirely (no filePath / extractText / readFile
 * dep — preserves pre-existing behavior for callers that omit them), falls
 * through to the UNCHANGED sync gauntlet:
 *
 * FEAT-PDF-EXTRACTOR-LOCAL-INPUT three-tier extraction (updated from FIX-CTG-3-STEP-C):
 *
 *   Tier 1: extractViaServicePdfPath(filePath) — pdf_path body mode (no url key).
 *           Service reads from the shared volume directly → real OCR, no 401.
 *           Called when filePath is non-empty and the dep is wired.
 *   Tier 2: extractViaService(pdfUrl) — remote URL (hsx.vn / VPS source URL).
 *           Attempted when Tier 1 is absent or returns null/short text.
 *           May fail when the extraction service cannot reach a geo-blocked URL.
 *   Tier 3: extractText(readFile(filePath)) — direct pdf-parse fallback.
 *           Called when both service tiers return null/short AND extractText/readFile deps
 *           are provided. Minimum confidence guard: text must be >= 100 chars.
 *
 * Pipeline is called iff at least one tier yields text >= 100 chars.
 *
 * FIX-PDFEXTRACTOR-TIER1-OCR-TIMEOUT (AC1): returns a discriminated
 * `PushBctcExtractionOutcome` — "no throw" no longer implies success. Still
 * never throws itself (all failure modes are represented in the returned
 * union); callers must branch on `outcome` instead of assuming success.
 *
 * Used by `server.ts` POST /api/push-bctc-pdf handler (via bctcVpsIngestHandler.ts).
 */
export async function triggerPushBctcExtraction(
  params: PushBctcExtractionParams,
): Promise<PushBctcExtractionOutcome> {
  const { actionCode, year, quarter, filePath, pdfUrl } = params;
  const deps = params.deps ?? (await makeProductionDeps());

  // ── FIX-PDFEXTRACTOR-TIER1-OCR-TIMEOUT (AC2, Decision 2): confidence
  // pre-gate ahead of Tier 1 — reuses the EXISTING extractPdfText()/
  // PDF_CONFIDENCE_HIGH_THRESHOLD=200 classifier via the same extractText/
  // readFile deps Tier 3 already uses. No new constant, no byte-size cutoff
  // (rejected — see Decision 2 in the design brief: the live corpus has
  // already-healthy text-native filings 2-3x larger than the failing scanned
  // PDF, purely due to embedded scan appendices).
  let preGateConfidence: number | null = null;
  if (filePath && deps.readFile && deps.extractText) {
    try {
      const buf = deps.readFile(filePath);
      const { confidence } = await deps.extractText(buf);
      preGateConfidence = confidence;
    } catch (err) {
      logger.warn("[pushBctcExtraction] confidence pre-gate threw — falling back to sync gauntlet", {
        ticker: actionCode,
        filePath,
        error: err instanceof Error ? err.message : String(err),
      });
      preGateConfidence = null;
    }
  }

  if (preGateConfidence !== null && preGateConfidence < 1.0) {
    logger.info("[pushBctcExtraction] scanned PDF detected (confidence < 1.0) — routing to async PEK extraction", {
      ticker: actionCode,
      filePath,
      confidence: preGateConfidence,
    });
    return routeToAsyncPekExtraction({ actionCode, year, quarter, filePath, deps });
  }

  let rawText: string | null = null;

  // ── Tier 1: pdf-extractor service with pdf_path (shared volume) ───────────
  // FEAT-PDF-EXTRACTOR-LOCAL-INPUT: when filePath is non-empty and the dep is wired,
  // send {pdf_path, source_type} (no url key) so the service reads from the
  // shared volume directly. This bypasses HTTP fetch entirely — no 401 from VPS URLs,
  // real OCR pipeline for scanned PDFs.
  if (filePath && deps.extractViaServicePdfPath) {
    try {
      const serviceResult = await deps.extractViaServicePdfPath(filePath);
      if (serviceResult && serviceResult.textContent.trim().length >= 100) {
        rawText = serviceResult.textContent;
        logger.info("[pushBctcExtraction] Tier 1 (pdf_path) succeeded", {
          ticker: actionCode,
          filePath,
          chars: serviceResult.textContent.length,
        });
      } else {
        logger.info("[pushBctcExtraction] Tier 1 (pdf_path) null/short — trying Tier 2 (remote URL)", {
          ticker: actionCode,
          filePath,
          textLength: serviceResult?.textContent.trim().length ?? 0,
        });
      }
    } catch (err) {
      logger.warn("[pushBctcExtraction] Tier 1 (pdf_path) threw — trying Tier 2 (remote URL)", {
        ticker: actionCode,
        filePath,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ── Tier 2: pdf-extractor service with remote/source URL ──────────────────
  if (rawText === null) {
    try {
      const serviceResult = await deps.extractViaService(pdfUrl);
      if (serviceResult && serviceResult.textContent.trim().length >= 100) {
        rawText = serviceResult.textContent;
        logger.info("[pushBctcExtraction] Tier 2 (remote URL) succeeded", {
          ticker: actionCode,
          pdfUrl,
          chars: serviceResult.textContent.length,
        });
      } else {
        logger.info("[pushBctcExtraction] Tier 2 (remote URL) null/short — trying Tier 3 (pdf-parse)", {
          ticker: actionCode,
          pdfUrl,
          textLength: serviceResult?.textContent.trim().length ?? 0,
        });
      }
    } catch (err) {
      logger.warn("[pushBctcExtraction] Tier 2 threw — trying Tier 3 (pdf-parse)", {
        ticker: actionCode,
        pdfUrl,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ── Tier 3: direct pdf-parse fallback ─────────────────────────────────────
  // Used when both service tiers fail and filePath+extractText deps are available.
  if (rawText === null && filePath && deps.extractText && deps.readFile) {
    try {
      const buf = deps.readFile(filePath);
      const { text, confidence } = await deps.extractText(buf);
      if (text && text.trim().length >= 100) {
        rawText = text;
        logger.info("[pushBctcExtraction] Tier 3 (pdf-parse) succeeded", {
          ticker: actionCode,
          filePath,
          chars: text.length,
          confidence,
        });
      } else {
        logger.warn("[pushBctcExtraction] all 3 tiers exhausted — pipeline skipped", {
          ticker: actionCode,
          filePath,
          chars: text?.trim().length ?? 0,
          confidence,
        });
      }
    } catch (err) {
      logger.warn("[pushBctcExtraction] Tier 3 threw — pipeline skipped", {
        ticker: actionCode,
        filePath,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  } else if (rawText === null) {
    logger.warn("[pushBctcExtraction] all tiers failed — pipeline skipped", {
      ticker: actionCode,
      pdfUrl,
      filePath: filePath || "(none)",
    });
  }

  if (rawText === null) {
    return {
      outcome: "failed",
      reason: `all extraction tiers exhausted for ${actionCode} ${year}-${quarter} — no tier yielded >= 100 chars`,
    };
  }

  // ── Run pipeline with text override ───────────────────────────────────────
  try {
    const result = await deps.runPipeline({
      actionCode,
      year,
      quarter,
      pdfTextOverride: rawText,
      pdfUrl,
    });
    if (result) {
      logger.info("[pushBctcExtraction] pipeline complete", {
        ticker: actionCode,
        year,
        quarter,
        id: result.id,
      });
      return { outcome: "done", reportId: result.id };
    }

    // FIX-PDFEXTRACTOR-TIER1-OCR-TIMEOUT (AC1): a second latent instance of
    // the silent-swallow bug class — runPipeline() reading tiers succeeded
    // but the pipeline itself rejected the report (returned null). This must
    // ALSO become "failed", not fall through to an implicit success.
    logger.warn("[pushBctcExtraction] pipeline returned null", {
      ticker: actionCode,
      year,
      quarter,
    });
    return {
      outcome: "failed",
      reason: `runPipeline returned null for ${actionCode} ${year}-${quarter}`,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.warn("[pushBctcExtraction] pipeline threw (non-fatal)", {
      ticker: actionCode,
      year,
      quarter,
      error: errMsg,
    });
    return {
      outcome: "failed",
      reason: `runPipeline threw for ${actionCode} ${year}-${quarter}: ${errMsg}`,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FIX-PDFEXTRACTOR-TIER1-OCR-TIMEOUT — async PEK-extraction branch (Decision 3)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scanned/minimal-text branch (confidence < 1.0): route to the already-shipped
 * async `/pek-extract` pipeline instead of the slow/timeout-prone sync
 * gauntlet. `bctcExtractReconcileJob.ts` (untouched) owns the rest of the
 * lifecycle once the queue row lands at 'pek_triggered' — see
 * bctcVpsIngestHandler.ts's `applyPushBctcExtractionOutcome`.
 *
 * Order matters (MUST-FIX Risk 1): ensureShellRow() first (stable id for a
 * brand-new ticker/quarter), THEN an explicit unconditional pdf_path
 * overwrite (ensureShellRow's own upsert never clobbers an existing
 * pdf_path — see `overwritePdfPathUnconditional` doc comment), THEN fire the
 * PEK trigger. Per Decision 3 §1c, the PEK trigger's own outcome
 * (202/503/502/unreachable) is intentionally NOT branched on here.
 */
async function routeToAsyncPekExtraction(args: {
  actionCode: string;
  year: number;
  quarter: "Q1" | "Q2" | "Q3" | "Q4";
  filePath: string;
  deps: PushBctcExtractionDeps;
}): Promise<PushBctcExtractionOutcome> {
  const { actionCode, year, quarter, filePath, deps } = args;

  if (!deps.ensureShellRow || !deps.updatePdfPath || !deps.triggerPekExtraction) {
    logger.warn("[pushBctcExtraction] scanned PDF detected but async-route deps missing — failing loud", {
      ticker: actionCode,
      filePath,
    });
    return {
      outcome: "failed",
      reason: `scanned PDF detected for ${actionCode} ${year}-${quarter} but ensureShellRow/updatePdfPath/triggerPekExtraction deps are not wired`,
    };
  }

  try {
    const shellRow = await deps.ensureShellRow({ actionCode, year, quarter, pdfPath: filePath });

    // MUST-FIX (Risk 1): explicit unconditional overwrite — see doc comment
    // on the `updatePdfPath` dep / `overwritePdfPathUnconditional` above.
    await deps.updatePdfPath({ actionCode, sortKey: shellRow.sortKey, pdfPath: filePath });

    await deps.triggerPekExtraction(shellRow.id, filePath);

    logger.info("[pushBctcExtraction] scanned PDF routed to async PEK extraction", {
      ticker: actionCode,
      reportId: shellRow.id,
      filePath,
    });

    return { outcome: "async_routed", reportId: shellRow.id };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.warn("[pushBctcExtraction] async PEK route threw", {
      ticker: actionCode,
      filePath,
      error: errMsg,
    });
    return {
      outcome: "failed",
      reason: `async PEK route threw for ${actionCode} ${year}-${quarter}: ${errMsg}`,
    };
  }
}
