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
 * Runs daily at 09:30 GMT+7 (right after `bctcOverdueCheck` at 09:00).
 *
 * Layer: interface/scheduler — depends on infrastructure (DB, logger,
 *        telegram, pdf parser) and application (fetchParseAndStoreBctc).
 */

import { readFileSync, existsSync } from "node:fs";
import { basename, join } from "node:path";
import { logger } from "../infrastructure/logger.js";
import { getDb } from "../infrastructure/db/schema.js";
import { extractPdfText } from "../infrastructure/fetchers/pdf.js";
import { sendTelegramWork } from "../infrastructure/notifiers/telegram.js";
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

  // Explicit "Q1".."Q4" token near a 4-digit year
  const qMatch = filename.match(/Q([1-4])[^\d]*(\d{4})|(\d{4})[^\d]*Q([1-4])/i);
  if (qMatch) {
    const qDigit = qMatch[1] ?? qMatch[4];
    const yearStr = qMatch[2] ?? qMatch[3];
    if (qDigit && yearStr) {
      return {
        year: parseInt(yearStr, 10),
        quarter: `Q${qDigit}` as "Q1" | "Q2" | "Q3" | "Q4",
      };
    }
  }
  return null;
}

/**
 * Attempt to re-parse a single stranded PDF by extracting text locally and
 * calling the full `fetchParseAndStoreBctc` pipeline with `pdfTextOverride`.
 *
 * Returns true iff the pipeline produced a persisted FinancialReport.
 */
async function reparseSingle(payload: StrandedPayload): Promise<boolean> {
  if (!existsSync(payload.filePath)) {
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

  let buffer: Buffer;
  try {
    buffer = readFileSync(payload.filePath);
  } catch (err) {
    logger.warn("[bctc-reparse-job] read file failed", {
      filePath: payload.filePath,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }

  const { text, confidence } = await extractPdfText(buffer);
  if (!text || text.trim().length < 100 || confidence < 0.3) {
    logger.warn("[bctc-reparse-job] local extraction yielded too little text", {
      filename: payload.filename,
      chars: text?.length ?? 0,
      confidence,
    });
    return false;
  }

  const { fetchParseAndStoreBctc } = await import(
    "../application/usecases/fetchParseAndStoreBctc.js"
  );

  try {
    const result = await fetchParseAndStoreBctc({
      actionCode: payload.ticker,
      year: yq.year,
      quarter: yq.quarter,
      pdfTextOverride: text,
      // Supply a fake pdfUrl so the upstream SSC listing step is skipped.
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
export async function runBctcReparseJob(
  options: {
    db?: Database;
    notify?: (message: string) => Promise<unknown>;
    reparseFn?: (payload: StrandedPayload) => Promise<boolean>;
  } = {},
): Promise<ReparseRunResult> {
  const db = options.db ?? getDb();
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

  logger.info("[bctc-reparse-job] cycle complete", {
    examined: result.examined,
    resolved: result.resolved,
    failed: result.failed,
    escalated: result.escalated,
    alerted: result.alerted,
  });
  return result;
}
