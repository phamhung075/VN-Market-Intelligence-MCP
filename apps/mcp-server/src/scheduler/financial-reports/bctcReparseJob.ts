/**
 * BCTC Reparse Job — Sprint 053 / task 1019
 *
 * Recovery path for stranded BCTC PDFs:
 *   `dataAuditJob` (check D-7c) detects PDF files sitting in `data/pdfs/`
 *   that have no matching `financial_reports` row and writes one
 *   `agent_feedback` entry per file. This job reads those entries, extracts
 *   text from the local file, calls the same `fetchParseAndStoreBctc`
 *   pipeline that the live SSC path uses, and marks the feedback `resolved`
 *   on success. Failures increment `reparse_attempts`; the row is escalated
 *   to `priority='high'` after 3 attempts and a WORK-channel alert fires
 *   after 5.
 *
 * Bug 1068 fix: reparseSingle() now falls back to getCachedPdfText() when
 *   extractPdfText (pdf-parse) yields < 100 chars or confidence < 0.3.
 *   Scanned/image PDFs that OCR already processed are correctly re-ingested.
 *
 * Runs daily at 09:30 GMT+7 (right after `bctcOverdueCheck` at 09:00).
 *
 * Layer: interface/scheduler — depends on infrastructure (DB, logger,
 *        telegram, pdf parser) and application (fetchParseAndStoreBctc).
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { logger } from "../../infrastructure/logger.js";
import { getDb } from "../../infrastructure/db/schema.js";
import { currentDataEnv } from "../../infrastructure/envCheck.js";
import { recordJobRun } from "../../infrastructure/db/cronJobRunStore.js";
import { shouldSkipRecoveryReplay } from "../startupHelpers.js";
import { extractPdfText } from "../../infrastructure/fetchers/pdf.js";
import { getCachedPdfText } from "../../infrastructure/fetchers/pdfOcrWorker.js";
import { sendTelegramWork } from "../../infrastructure/notifiers/telegram.js";
import type { PdfExtractorResult } from "../../infrastructure/fetchers/pdfExtractorClient.js";
import type { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface StrandedPayload {
  ticker: string;
  filename: string;
  filePath: string;
}

interface FeedbackRow {
  id: number;
  title: string;
  detail: string;
  reparse_attempts: number;
}

export interface ReparseRunResult {
  /** Number of feedback rows examined this run (status=new, stranded_bctc_pdf) */
  examined: number;
  /** Number of PDFs successfully re-parsed and stored */
  resolved: number;
  /** Number of files that failed to reparse this run (counted as attempt increments) */
  failed: number;
  /** Number of rows escalated to high priority after 3 attempts */
  escalated: number;
  /** Number of WORK-channel alerts sent (fires at attempt>=5) */
  alerted: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Threshold at which a failing row is escalated from medium → high priority. */
const ESCALATE_AT_ATTEMPTS = 3;

/** Threshold at which a WORK-channel alert fires (one-shot per row). */
const ALERT_AT_ATTEMPTS = 5;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract the JSON payload from a stranded-PDF feedback detail string.
 *
 * Detail format produced by dataAuditJob D-7c:
 *   "VNM:filename.pdf {"ticker":"VNM","filename":"...","filePath":"..."}"
 *
 * Returns null when the detail does not contain a parseable JSON body.
 */
export function parseStrandedDetail(detail: string): StrandedPayload | null {
  const braceIdx = detail.indexOf("{");
  if (braceIdx >= 0) {
    try {
      const parsed = JSON.parse(detail.slice(braceIdx)) as Partial<StrandedPayload>;
      if (parsed.ticker && parsed.filename && parsed.filePath) {
        return {
          ticker: parsed.ticker,
          filename: parsed.filename,
          filePath: parsed.filePath,
        };
      }
    } catch {
      // fall through to legacy parser
    }
  }

  // Legacy format (report 1055): details look like
  //   "Stranded PDFs (need re-parse): VNM:BCTC VNM 31.12.2025 - HOP NHAT - VN.pdf"
  // Reconstruct the payload by finding TICKER:filename.pdf and defaulting
  // filePath to the on-disk data/pdfs/ location.
  const legacy = detail.match(/([A-Z]{2,5}):([^\s].*?\.pdf)/);
  if (legacy) {
    const ticker = legacy[1]!;
    const filename = legacy[2]!.trim();
    const filePath = join(process.cwd(), "data", "pdfs", filename);
    return { ticker, filename, filePath };
  }
  return null;
}

/**
 * Parse year + quarter from a Vietnamese BCTC filename.
 *
 * Common patterns observed in prod:
 *   "BCTC VNM 31.12.2025 - HOP NHAT - VN.pdf" → {2025, "Q4"}
 *   "FPT_30.09.2025_Q3.pdf"                    → {2025, "Q3"}
 *
 * Date-based extraction takes precedence; falls back to explicit Qn tokens.
 * Returns null when neither a date nor a Q-token can be found.
 */
export function parseYearQuarterFromFilename(
  filename: string,
): { year: number; quarter: "Q1" | "Q2" | "Q3" | "Q4" } | null {
  // dd.mm.yyyy or dd-mm-yyyy or dd/mm/yyyy
  const dateMatch = filename.match(/(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})/);
  if (dateMatch) {
    const month = parseInt(dateMatch[2]!, 10);
    const year = parseInt(dateMatch[3]!, 10);
    let quarter: "Q1" | "Q2" | "Q3" | "Q4" | null = null;
    if (month === 3) quarter = "Q1";
    else if (month === 6) quarter = "Q2";
    else if (month === 9) quarter = "Q3";
    else if (month === 12) quarter = "Q4";
    if (quarter !== null) return { year, quarter };
  }

  // Tier 2: Q-token (Qn or Vietnamese "Quy-n") near a plausible year (1990-2099).
  // Bug fix: restrict year match to 1990-2099 to avoid matching partial YYYYMMDD
  // prefixes (e.g. "20260130-VCB-...Q4.2025.pdf" was matching "0130" as year=130).
  // Also handles Vietnamese "Quy-4-2025" and "Quy-1-nam-2025" patterns.
  const qRe = /(?:Q(?:uy[-_\s]?)?)([1-4])[^\d]*((19|20)\d{2})|((19|20)\d{2})[^\d]*(?:Q(?:uy[-_\s]?)?)([1-4])/gi;
  let qm: RegExpExecArray | null;
  while ((qm = qRe.exec(filename)) !== null) {
    const qDigit = qm[1] ?? qm[6];
    const yearStr = qm[2] ?? qm[4];
    if (qDigit && yearStr) {
      return {
        year: parseInt(yearStr, 10),
        quarter: `Q${qDigit}` as "Q1" | "Q2" | "Q3" | "Q4",
      };
    }
  }

  // Tier 3: YYYYMMDD prefix (e.g. "20250429-VCB-...Quy-1-nam-2025_signed.pdf").
  // When tiers 1+2 fail, infer quarter from the month in the leading YYYYMMDD.
  // Prefer any explicit 20XX year found later in the filename over the prefix year.
  //
  // Bug 1810b: YYYYMMDD in VPS-style filenames is the *publication* date, not the
  // period-end date. Q1 reports (Jan–Mar) are published in April (SSC deadline ~Apr 30).
  // Month 4 must map to Q1, not Q2 — align with detectTargetQuarter() boundaries:
  //   months 1–4  → Q1 (Q1 report published Jan–Apr)
  //   months 5–7  → Q2
  //   months 8–10 → Q3
  //   months 11–12 → Q4
  const yyyymmdd = filename.match(/^(20\d{2})(0[1-9]|1[0-2])\d{2}/);
  if (yyyymmdd) {
    const prefixYear = parseInt(yyyymmdd[1]!, 10);
    const month = parseInt(yyyymmdd[2]!, 10);
    let quarter: "Q1" | "Q2" | "Q3" | "Q4";
    if (month <= 4) quarter = "Q1";
    else if (month <= 7) quarter = "Q2";
    else if (month <= 10) quarter = "Q3";
    else quarter = "Q4";
    // Use any explicit later year (e.g. "2025" in "20250429-VCB-...-2025_signed.pdf")
    const laterYearMatch = filename.match(/[^0-9](20\d{2})[^0-9]/);
    const year = laterYearMatch ? parseInt(laterYearMatch[1]!, 10) : prefixYear;
    return { year, quarter };
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Injectable deps for reparseSingleWithOcrFallback (enables unit testing
// without real files, OCR tools, or SQLite).
// ─────────────────────────────────────────────────────────────────────────────

export interface ReparseDeps {
  /**
   * FEAT-PDF-EXTRACTOR-LOCAL-INPUT: delegate PDF extraction using pdf_path body mode.
   * Tier 1a — attempted first when filePath is non-empty; sends body
   *   {pdf_path: filePath, source_type: "bctc"} with NO url key.
   * The service reads from the shared volume → real OCR, no 401.
   * Optional — when absent, falls through directly to Tier 1b (URL mode).
   * Maps to `extractViaMicroservice("", "bctc", pdfPath)` from pdfExtractorClient.
   */
  extractViaServicePdfPath?: (pdfPath: string) => Promise<PdfExtractorResult | null>;

  /**
   * Delegate PDF extraction to the pdf-extractor microservice via URL.
   * 1954c (Tier 1b — URL mode): replaces the old extractText (pdf-parse) as Tier 1.
   * Returns null when service unavailable or extraction fails.
   * Maps to `extractViaMicroservice` from pdfExtractorClient in production.
   */
  extractViaService: (url: string) => Promise<PdfExtractorResult | null>;
  /**
   * Extract text from a PDF buffer (pdf-parse — Tier 2 fallback).
   * 1954c: demoted from Tier 1 to Tier 2 (service unavailable fallback).
   * Reads the local file buffer passed by reparseSingleWithOcrFallback.
   */
  extractText: (buf: Buffer) => Promise<{ text: string; confidence: number }>;
  /** Read OCR cache for a given filename (Tier 3 — last resort). Returns null on cache miss. */
  getOcrCache: (filename: string) => { text: string; pages: number; confidence: number } | null;
  /** Run the full BCTC parse+store pipeline. Returns null on failure. */
  pipeline: (params: {
    actionCode: string;
    year: number;
    quarter: "Q1" | "Q2" | "Q3" | "Q4";
    pdfTextOverride: string;
    pdfUrl: string;
  }) => Promise<{ id: string } | null>;
  /** Check if a file exists on disk. */
  fileExists: (path: string) => boolean;
  /** Read a file from disk. */
  readFile: (path: string) => Buffer;
  /** Insert a minimal fallback record to prevent QUA_HAN status when extraction fails with low confidence. */
  insertFallbackRecord: (payload: {
    ticker: string;
    year: number;
    quarter: "Q1" | "Q2" | "Q3" | "Q4";
  }) => Promise<void>;
  /**
   * @deprecated 1954c (G5b): extractHighDpiRetry removed — high-DPI OCR is now
   * owned by the pdf-extractor service. Kept optional to avoid breaking callers
   * that still inject it; field is no longer consulted in reparseSingleWithOcrFallback.
   */
  extractHighDpiRetry?: (filePath: string, filename: string, actionCode: string) => Promise<void>;
}

/** VPS base URL for deriving service URL from stranded PDF filenames (1954c). */
const VPS_BCTC_BASE_URL = Bun.env.VPS_BCTC_BASE_URL ?? "http://125.212.251.27:8765/bctc-files";

/**
 * Attempt to re-parse a single stranded PDF.
 *
 * 1954c three-tier text extraction:
 *   Tier 1: pdf-extractor microservice (service-first — calls extractViaService)
 *   Tier 2: pdf-parse via extractText (service unavailable fallback)
 *   Tier 3: OCR cache via getOcrCache (for scanned PDFs already OCR-processed)
 *
 * Returns true iff the pipeline produced a persisted FinancialReport.
 *
 * All I/O is injected via `deps` so this function can be tested without real
 * files, real OCR tools, or a live SQLite database.
 */
export async function reparseSingleWithOcrFallback(
  payload: StrandedPayload,
  deps: ReparseDeps,
): Promise<boolean> {
  if (!deps.fileExists(payload.filePath)) {
    logger.warn("[bctc-reparse-job] file disappeared before reparse", {
      filePath: payload.filePath,
    });
    return false;
  }

  const yq = parseYearQuarterFromFilename(payload.filename);
  if (!yq) {
    logger.warn("[bctc-reparse-job] cannot parse year/quarter from filename", {
      filename: payload.filename,
    });
    return false;
  }

  let rawText: string | null = null;

  // ── Tier 1a: pdf-extractor service with pdf_path (shared volume) ──────────
  // FEAT-PDF-EXTRACTOR-LOCAL-INPUT: when the dep is wired and filePath is on disk,
  // send {pdf_path, source_type} (no url key) so the service reads from the
  // shared volume. This bypasses HTTP fetch entirely — no 401, real OCR.
  if (deps.extractViaServicePdfPath && deps.fileExists(payload.filePath)) {
    try {
      const serviceResult = await deps.extractViaServicePdfPath(payload.filePath);
      if (serviceResult !== null && serviceResult.status === "success" &&
          serviceResult.textContent.trim().length >= 100) {
        rawText = serviceResult.textContent;
        logger.info("[bctc-reparse-job] service extraction succeeded (Tier 1a pdf_path)", {
          filename: payload.filename,
          filePath: payload.filePath,
          chars: serviceResult.textContent.length,
          confidence: serviceResult.ocrConfidence,
        });
      } else {
        logger.info("[bctc-reparse-job] Tier 1a (pdf_path) null/short — trying Tier 1b (URL)", {
          filename: payload.filename,
          serviceStatus: serviceResult?.status ?? null,
          textLength: serviceResult?.textContent.trim().length ?? 0,
        });
      }
    } catch (svcErr) {
      logger.warn("[bctc-reparse-job] Tier 1a (pdf_path) threw — trying Tier 1b (URL)", {
        filename: payload.filename,
        error: svcErr instanceof Error ? svcErr.message : String(svcErr),
      });
    }
  }

  // ── Tier 1b: pdf-extractor service via derived VPS URL ────────────────────
  // 1954c (now Tier 1b — URL mode): derive the VPS URL from ticker + filename so
  // the service can fetch the PDF. If the service cannot reach the URL
  // (PDF no longer on VPS, 401, geo-blocked) → null → Tier 2.
  if (rawText === null) {
    const derivedVpsUrl = `${VPS_BCTC_BASE_URL}/${payload.ticker}/${payload.filename}`;
    try {
      const serviceResult = await deps.extractViaService(derivedVpsUrl);
      if (serviceResult !== null && serviceResult.status === "success" &&
          serviceResult.textContent.trim().length >= 100) {
        rawText = serviceResult.textContent;
        logger.info("[bctc-reparse-job] service extraction succeeded (Tier 1b URL)", {
          filename: payload.filename,
          chars: serviceResult.textContent.length,
          confidence: serviceResult.ocrConfidence,
        });
      } else {
        logger.info("[bctc-reparse-job] service Tier 1b null/short — trying pdf-parse Tier 2", {
          filename: payload.filename,
          serviceStatus: serviceResult?.status ?? null,
          textLength: serviceResult?.textContent.trim().length ?? 0,
        });
      }
    } catch (svcErr) {
      logger.warn("[bctc-reparse-job] service Tier 1b threw — trying pdf-parse Tier 2", {
        filename: payload.filename,
        error: svcErr instanceof Error ? svcErr.message : String(svcErr),
      });
    }
  }

  // ── Tier 2: pdf-parse (service unavailable) ────────────────────────────────
  if (rawText === null) {
    try {
      const buf = deps.readFile(payload.filePath);
      const { text, confidence } = await deps.extractText(buf);
      if (text && text.trim().length >= 100 && confidence >= 0.3) {
        rawText = text;
        logger.info("[bctc-reparse-job] pdf-parse Tier 2 succeeded", {
          filename: payload.filename,
          chars: text.length,
          confidence,
        });
      } else {
        logger.info("[bctc-reparse-job] pdf-parse Tier 2 yielded too little text — trying OCR cache Tier 3", {
          filename: payload.filename,
          chars: text?.trim().length ?? 0,
          confidence,
        });
      }
    } catch (err) {
      logger.warn("[bctc-reparse-job] pdf-parse Tier 2 threw — trying OCR cache Tier 3", {
        filename: payload.filename,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ── Tier 3: OCR cache (last resort — Bug 1068, kept for pre-existing OCR data) ──
  if (rawText === null) {
    const cached = deps.getOcrCache(payload.filename);
    if (cached !== null && cached.confidence >= 0.3 && cached.text.trim().length >= 100) {
      rawText = cached.text;
      logger.info("[bctc-reparse-job] using OCR cache Tier 3", {
        filename: payload.filename,
        pages: cached.pages,
        confidence: cached.confidence,
        chars: cached.text.length,
      });
    } else {
      logger.warn("[bctc-reparse-job] all tiers exhausted — inserting DA_NOP fallback", {
        filename: payload.filename,
        cached: cached ? { pages: cached.pages, confidence: cached.confidence } : null,
      });

      // ── SPRINT-1330: DA_NOP Fallback ───────────────────────────────────────
      // When all extraction tiers fail, insert a minimal fallback record to
      // prevent QUA_HAN in the earnings calendar.
      try {
        await deps.insertFallbackRecord({
          ticker: payload.ticker,
          year: yq.year,
          quarter: yq.quarter,
        });

        logger.info("[bctc-reparse-job] inserted DA_NOP fallback record", {
          ticker: payload.ticker,
          period: `${yq.year}-${yq.quarter}`,
          reason: "all extraction tiers failed",
        });
      } catch (fallbackErr) {
        logger.warn("[bctc-reparse-job] fallback record insert failed", {
          ticker: payload.ticker,
          error: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr),
        });
      }

      return false;
    }
  }

  // ── Run the parse+store pipeline ──────────────────────────────────────────
  try {
    const result = await deps.pipeline({
      actionCode: payload.ticker,
      year: yq.year,
      quarter: yq.quarter,
      pdfTextOverride: rawText,
      pdfUrl: `file://${payload.filePath}`,
    });
    return result !== null;
  } catch (err) {
    logger.warn("[bctc-reparse-job] pipeline threw", {
      filename: payload.filename,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-fix C (Task 1196): Disk-scan fallback
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract a Vietnamese stock ticker from a BCTC PDF filename without requiring
 * a watchlist lookup. Used as a fallback when the watchlist table is empty.
 *
 * Strategy (in priority order):
 *   1. "BCTC {TICKER} " prefix pattern — standard VPS filename format
 *      e.g. "BCTC VNM 31.12.2025 - HOP NHAT - VN.pdf" → "VNM"
 *   2. First standalone 2–5 uppercase-letter word in the filename stem
 *      e.g. "VEA_Q4-2025.pdf" → "VEA"
 *      Words that are BCTC-domain noise tokens (BCTC, VN, HOP, NHAT, RIENG,
 *      BIEN, BAO, TAI, CAO, KET, QUA, HOP, NHAT, DONG, NAM) are excluded.
 *
 * Returns null when no ticker can be confidently extracted.
 */
export function tickerFromFilename(filename: string): string | null {
  const stem = filename.replace(/\.pdf$/i, "");

  // Strategy 1: "BCTC {TICKER}" prefix
  const bctcPrefix = stem.match(/^BCTC\s+([A-Z]{2,5})\b/i);
  if (bctcPrefix) return bctcPrefix[1]!.toUpperCase();

  // Noise tokens that should never be returned as a ticker
  const NOISE = new Set([
    "BCTC", "VN", "HOP", "NHAT", "RIENG", "BIEN", "BAO", "TAI",
    "CAO", "KET", "QUA", "DONG", "NAM", "PDF",
  ]);

  // Strategy 2: first standalone uppercase 2–5 letter word
  const words = stem.toUpperCase().split(/[^A-Z]+/);
  for (const word of words) {
    if (word.length >= 2 && word.length <= 5 && !NOISE.has(word)) {
      return word;
    }
  }

  return null;
}

/**
 * Scan data/pdfs/ directly for BCTC PDFs that have no matching financial_reports
 * row. Called by runBctcReparseJob() when agent_feedback returns 0 rows (D-7c
 * did not run or ran without finding any stranded files).
 *
 * Does NOT write any agent_feedback rows — that remains D-7c's responsibility.
 * Returns only StrandedPayload[] for the caller to process via reparse().
 *
 * Empty watchlist fallback (task 1915-fix-part1): when the watchlist table has
 * no rows at cron time (e.g. 09:30 GMT+7 on a fresh container boot), the
 * watchlist-based codes.find() loop returns [] and every PDF is silently skipped.
 * Fix: when codes is empty, extract the ticker directly from the filename via
 * tickerFromFilename() so on-disk PDFs (e.g. VEA + VNM Q4-2025) are always
 * processed regardless of watchlist state.
 *
 * @param db      - SQLite database (supports in-memory injection for tests)
 * @param pdfDir  - Override pdf directory (defaults to data/pdfs/ — injectable for tests)
 */
export async function scanDiskForStrandedPdfs(
  db: Database,
  pdfDir?: string,
): Promise<StrandedPayload[]> {
  const resolvedPdfDir = pdfDir ?? join(process.cwd(), "data", "pdfs");
  if (!existsSync(resolvedPdfDir)) return [];

  let codes: string[];
  try {
    const watchlistCodes = db
      .prepare("SELECT code FROM watchlist ORDER BY code")
      .all() as { code: string }[];
    codes = watchlistCodes.map((r) => r.code);
  } catch {
    // watchlist table may not exist in minimal test DBs — skip scan
    return [];
  }

  const watchlistEmpty = codes.length === 0;

  const files = readdirSync(resolvedPdfDir).filter((f) =>
    f.toLowerCase().endsWith(".pdf"),
  );
  const stranded: StrandedPayload[] = [];

  for (const filename of files) {
    let ticker: string;

    if (watchlistEmpty) {
      // Watchlist is empty: derive ticker from filename directly (task 1915-fix-part1)
      const extracted = tickerFromFilename(filename);
      if (!extracted) continue;
      ticker = extracted;
    } else {
      const upper = filename.toUpperCase();
      // Bug 1 fix: codes from the watchlist DB may be lowercase or mixed-case
      // (e.g. "dig", "Shb"). The regex is tested against the uppercased filename,
      // so the code itself must also be uppercased when building the pattern.
      const matched = codes.find((c) => {
        const cu = c.toUpperCase();
        const re = new RegExp(`(^|[^A-Z])${cu}([^A-Z]|$)`);
        return re.test(upper);
      });
      if (matched) {
        // Normalise ticker to uppercase so downstream callers receive a consistent value
        ticker = matched.toUpperCase();
      } else {
        // Not in watchlist — try to extract ticker directly from filename (task 1915-fix-part2)
        // Covers production cases where VEA/VNM have PDFs on disk but are absent from watchlist.
        const extracted = tickerFromFilename(filename);
        if (!extracted) continue;
        ticker = extracted;
      }
    }

    const yq = parseYearQuarterFromFilename(filename);
    if (!yq) continue;

    // Check against financial_reports using period_type (TEXT: 'Q1'..'Q4')
    const filed = db
      .prepare(
        `SELECT COUNT(*) AS cnt FROM financial_reports
         WHERE action_code = ? AND period_year = ? AND period_type = ?`,
      )
      .get(ticker, yq.year, yq.quarter) as { cnt: number };

    if ((filed?.cnt ?? 0) > 0) continue;

    stranded.push({
      ticker,
      filename,
      filePath: join(resolvedPdfDir, filename),
    });
  }

  return stranded;
}

/**
 * Production deps wired to real infrastructure.
 * Lazy-imported inside reparseSingle to avoid loading LanceDB at module init.
 */
async function makeProductionDeps(): Promise<ReparseDeps> {
  const { fetchParseAndStoreBctc } = await import(
    "../../application/usecases/fetchParseAndStoreBctc.js"
  );
  const { extractViaMicroservice } = await import(
    "../../infrastructure/fetchers/pdfExtractorClient.js"
  );
  return {
    // FEAT-PDF-EXTRACTOR-LOCAL-INPUT Tier 1a: pdf_path mode (no url key)
    extractViaServicePdfPath: async (pdfPath: string) => extractViaMicroservice("", "bctc", pdfPath),
    // 1954c Tier 1b: pdf-extractor service via URL (demoted from Tier 1)
    extractViaService: async (url: string) => extractViaMicroservice(url, "bctc"),
    // 1954c Tier 2: pdf-parse fallback when service unavailable
    extractText: async (buf: Buffer) => extractPdfText(buf),
    // 1954c Tier 3: OCR cache (pre-existing OCR data from pdfOcrWorker runs)
    getOcrCache: (filename: string) => getCachedPdfText(filename),
    pipeline: async (params) => {
      // reparseSingleWithOcrFallback always sets pdfTextOverride before calling
      // pipeline — the file:// URL in pdfUrl is only for source.pdfPath stamping.
      // Pass through directly; fetchParseAndStoreBctc handles pdfTextOverride path.
      return fetchParseAndStoreBctc(params);
    },
    fileExists: (path: string) => existsSync(path),
    readFile: (path: string) => readFileSync(path),
    // extractHighDpiRetry deprecated (1954c) — not wired in production
    insertFallbackRecord: async (payload) => {
      const db = getDb();
      const now = new Date().toISOString();
      const sortKey = `${payload.year}-${payload.quarter.startsWith('Q') ? payload.quarter : `Q${payload.quarter}`}`;
      const fallbackId = `fallback-${payload.ticker}-${sortKey}`;

      // FIX-CTG-3-STEP-D (B): balance_sheet_json / income_stmt_json /
      // cash_flow_json / ratios_json are NOT NULL in the DDL (bctc-schema.ts).
      // Supply empty-object literals so the INSERT does not throw.
      db.prepare(`
        INSERT INTO financial_reports (
          id, action_code, company_name, exchange, domain,
          period_year, period_quarter, period_type,
          period_start, period_end, sort_key, parsed_at, extraction_confidence,
          data_env,
          balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        fallbackId,
        payload.ticker,
        payload.ticker, // Use ticker as placeholder company name
        "HOSE", // Default to HOSE
        "other", // Default domain
        payload.year,
        payload.quarter,
        payload.quarter.startsWith('Q') ? payload.quarter : `Q${payload.quarter}`,
        `${payload.year}-01-01`,
        `${payload.year}-12-31`,
        sortKey,
        now,
        0, // Low confidence marker
        currentDataEnv(),
        '{}', // balance_sheet_json — NOT NULL; empty object sentinel for DA_NOP
        '{}', // income_stmt_json  — NOT NULL; empty object sentinel
        '{}', // cash_flow_json    — NOT NULL; empty object sentinel
        '{}', // ratios_json       — NOT NULL; empty object sentinel
      );
    },
  };
}

/**
 * Attempt to re-parse a single stranded PDF (production entry point).
 * Delegates to reparseSingleWithOcrFallback with real infrastructure deps.
 */
async function reparseSingle(payload: StrandedPayload): Promise<boolean> {
  const deps = await makeProductionDeps();
  return reparseSingleWithOcrFallback(payload, deps);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run one reparse cycle. Idempotent — resolved rows are not re-queued and
 * escalation/alerting are one-shot per feedback row.
 *
 * Test hook: pass `options.db` to inject an in-memory SQLite, `options.notify`
 * to stub the WORK-channel send, and `options.reparseFn` to stub the parse
 * pipeline (so tests do not need real PDFs).
 */
/**
 * @idempotency T4 — cron_job_runs recency guard; replay skipped if last success < 90% of daily cadence (21.6h window)
 */
export async function runBctcReparseJob(
  options: {
    db?: Database;
    notify?: (message: string) => Promise<unknown>;
    reparseFn?: (payload: StrandedPayload) => Promise<boolean>;
    /** Override PDF directory for disk scan (injectable for tests). */
    pdfDir?: string;
    /** Injectable nowMs for recovery dedup guard (tests only) */
    nowMsFn?: () => number;
  } = {},
): Promise<ReparseRunResult> {
  const db = options.db ?? getDb();

  const DAILY_CADENCE_MS = 86_400_000;
  if (shouldSkipRecoveryReplay(db, "bctcReparseJob", DAILY_CADENCE_MS, options.nowMsFn)) {
    return { examined: 0, resolved: 0, failed: 0, escalated: 0, alerted: 0 };
  }
  const notify =
    options.notify ?? ((msg: string) => sendTelegramWork(msg, { parseMode: "" }));
  const reparse = options.reparseFn ?? reparseSingle;

  const rows = db
    .prepare(
      `SELECT id, title, detail, reparse_attempts
         FROM agent_feedback
        WHERE agent = 'data-auditor'
          AND category = 'other'
          AND status = 'new'
          AND title LIKE '[AUDIT] stranded_bctc_pdf%'`,
    )
    .all() as FeedbackRow[];

  // 1196: Start-of-cycle observability
  logger.info("[bctc-reparse-job] starting cycle", {
    feedbackRows: rows.length,
    timestamp: new Date().toISOString(),
  });

  const result: ReparseRunResult = {
    examined: rows.length,
    resolved: 0,
    failed: 0,
    escalated: 0,
    alerted: 0,
  };

  for (const row of rows) {
    const payload = parseStrandedDetail(row.detail);
    if (!payload) {
      logger.warn("[bctc-reparse-job] detail has no parseable payload", {
        id: row.id,
        title: row.title.slice(0, 80),
      });
      continue;
    }

    let success = false;
    try {
      success = await reparse(payload);
    } catch (err) {
      logger.warn("[bctc-reparse-job] reparse threw", {
        id: row.id,
        error: err instanceof Error ? err.message : String(err),
      });
      success = false;
    }

    if (success) {
      db.prepare(
        "UPDATE agent_feedback SET status = 'resolved' WHERE id = ?",
      ).run(row.id);
      result.resolved++;
      logger.info("[bctc-reparse-job] reparse succeeded", {
        id: row.id,
        ticker: payload.ticker,
        filename: basename(payload.filePath),
      });
      continue;
    }

    const nextAttempts = row.reparse_attempts + 1;
    db.prepare(
      "UPDATE agent_feedback SET reparse_attempts = ? WHERE id = ?",
    ).run(nextAttempts, row.id);
    result.failed++;

    if (nextAttempts === ESCALATE_AT_ATTEMPTS) {
      db.prepare(
        "UPDATE agent_feedback SET priority = 'high' WHERE id = ?",
      ).run(row.id);
      result.escalated++;
      logger.warn("[bctc-reparse-job] escalated to high", {
        id: row.id,
        attempts: nextAttempts,
      });
    }

    if (nextAttempts >= ALERT_AT_ATTEMPTS && nextAttempts === ALERT_AT_ATTEMPTS) {
      // One-shot alert at the ALERT_AT_ATTEMPTS boundary
      const msg =
        `[bctc-reparse] giving up after ${nextAttempts} attempts\n` +
        `Ticker: ${payload.ticker}\n` +
        `File: ${basename(payload.filePath)}\n` +
        `feedback_id: ${row.id}`;
      try {
        await notify(msg);
        result.alerted++;
      } catch (err) {
        logger.warn("[bctc-reparse-job] WORK notify failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // 1196 / 1945d: Disk scan runs unconditionally (not just when feedback rows = 0).
  // GAP-A fix: freshly-pushed PDFs (EIB/DHG Q1-2026) stored between D-7c audit
  // runs were silently skipped when other feedback rows existed. Now we always
  // scan for on-disk unextracted PDFs, deduplicating against filenames already
  // processed from feedback rows above.
  const processedFilenames = new Set<string>(
    rows
      .map((r) => parseStrandedDetail(r.detail))
      .filter((p): p is StrandedPayload => p !== null)
      .map((p) => p.filename),
  );

  const diskStranded = await scanDiskForStrandedPdfs(db, options.pdfDir);
  const freshDisk = diskStranded.filter((p) => !processedFilenames.has(p.filename));
  logger.info("[bctc-reparse-job] disk-scan", {
    found: diskStranded.length,
    fresh: freshDisk.length,
    skippedAlreadyInFeedback: diskStranded.length - freshDisk.length,
  });
  for (const payload of freshDisk) {
    let success = false;
    try {
      success = await reparse(payload);
    } catch (err) {
      logger.warn("[bctc-reparse-job] disk-scan reparse threw", {
        ticker: payload.ticker,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    if (success) {
      result.resolved++;
    } else {
      result.failed++;
    }
    result.examined++;
  }

  logger.info("[bctc-reparse-job] cycle complete", {
    examined: result.examined,
    resolved: result.resolved,
    failed: result.failed,
    escalated: result.escalated,
    alerted: result.alerted,
  });

  // Observability: record this run in cron_job_runs (fire-and-forget for test-injected DBs)
  if (!options.db) {
    void recordJobRun(db, "bctcReparseJob", async () => {
      // Already ran above — just record the outcome
    }).catch(() => {});
  }

  return result;
}
