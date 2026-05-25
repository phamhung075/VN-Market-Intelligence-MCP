/**
 * BT-4b — One-shot BCTC table backfill job
 *
 * NOT a cron. Run ONCE after BT-3+BT-3i+BT-5 are live, BEFORE BT-6 QA.
 *
 * Purpose: iterate all financial_reports rows with a real PDF on disk,
 * POST each to pdf-extractor /extract-tables so the extractor OCRs the doc,
 * assembles structured rows, and pushes them back via /api/push-bctc-table.
 *
 * Skips:
 *   - Rows where pdf_path IS NULL or '' (news-inference rows — no PDF to re-extract)
 *   - Rows where the PDF file does NOT exist on disk at the stored path
 *
 * Ordering: SEQUENTIAL — one doc at a time. Never parallel.
 * OCR is CPU-bound (~4s/page) and the host Mac is memory-constrained.
 *
 * Idempotency: the /extract-tables → /push-bctc-table pipeline does DELETE+INSERT
 * per report_id, so re-running is safe.
 *
 * DDD layer: application (injected db + extractTableUrl; no domain imports; no interface imports).
 * Zone: apps/mcp-server/ (sole writer of market.db via push handler on pdf-extractor's behalf).
 */

import type { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { basename } from "node:path";

// ─── UUID validation ──────────────────────────────────────────────────────────

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(id: string): boolean {
  return UUID_REGEX.test(id);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface FinancialReportPdfRow {
  id: string;
  action_code: string;
  period_year: number;
  period_quarter: number | null;
  pdf_path: string;
}

interface OcrPageRow {
  page_number: number;
  text_content: string;
}

export interface DocOutcome {
  doc_id: string;
  action_code: string;
  period_year: number;
  period_quarter: number | null;
  pdf_path: string;
  status: "success" | "gate_blocked" | "error" | "skipped_no_file" | "skipped_no_ocr";
  /** Number of rows stored, if status=success */
  rows_stored?: number;
  /** Whether accounting identity holds, if status=success */
  balance_pass?: boolean;
  /** Blocked reason from cross-check gate, if status=gate_blocked */
  blocked_reason?: string;
  /** Error message, if status=error */
  error?: string;
}

export interface BackfillBctcTablesResult {
  /** Docs successfully extracted + rows stored */
  success: number;
  /** Docs where cross-check gate blocked the push */
  gate_blocked: number;
  /** Docs that had an extraction or network error */
  failed: number;
  /** Docs skipped because the PDF file was not on disk */
  skipped_no_file: number;
  /** Docs skipped because pdf_path was NULL or empty (news-inference rows) */
  skipped_null_path: number;
  /**
   * Docs skipped because no OCR text is stored in pdf_extracted_text for this doc.
   * BT-4b-2: host-safety guardrail — without pre-supplied OCR, the pdf-extractor
   * would run Tesseract in-process on the 16GB Mac (kernel-panic risk). Skip instead.
   */
  skipped_no_ocr: number;
  /** Per-doc outcomes (for reporting) */
  outcomes: DocOutcome[];
}

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * backfillBctcTables — one-shot extraction for all stored financial_reports docs
 * that have a real PDF on disk.
 *
 * @param db              Injected market.db Database instance
 * @param extractTableUrl Base URL of the pdf-extractor service, e.g. http://pdf-extractor:5001
 * @param statementSection Which section to extract (default: "balance_sheet")
 * @returns Summary of outcomes per doc
 */
export async function backfillBctcTables(
  db: Database,
  extractTableUrl: string,
  statementSection = "balance_sheet",
): Promise<BackfillBctcTablesResult> {
  // Sanitize URL (strip trailing slash)
  const baseUrl = extractTableUrl.replace(/\/$/, "");
  const endpoint = `${baseUrl}/extract-tables`;

  // ── Query all rows with a stored pdf_path ──────────────────────────────────
  const allRows = db
    .prepare(
      `SELECT id, action_code, period_year, period_quarter, pdf_path
       FROM financial_reports
       WHERE pdf_path IS NOT NULL AND pdf_path != ''
       ORDER BY parsed_at ASC`,
    )
    .all() as FinancialReportPdfRow[];

  // ── Separate rows where PDF file actually exists on disk ───────────────────
  const eligibleRows: FinancialReportPdfRow[] = [];
  const missingFileRows: FinancialReportPdfRow[] = [];

  for (const row of allRows) {
    if (existsSync(row.pdf_path)) {
      eligibleRows.push(row);
    } else {
      missingFileRows.push(row);
      console.warn(
        `[bctcBatchTableBackfillJob] SKIP no-file: doc_id=${row.id} ` +
          `(${row.action_code} ${row.period_year}Q${row.period_quarter ?? "?"}) ` +
          `pdf_path=${row.pdf_path}`,
      );
    }
  }

  // Count NULL/empty rows (news-inference, already excluded by WHERE clause)
  // Surfaced here for context only — the WHERE clause already handles them.
  const nullPathCount =
    (
      db
        .prepare(
          `SELECT COUNT(*) as n FROM financial_reports
           WHERE pdf_path IS NULL OR pdf_path = ''`,
        )
        .get() as { n: number }
    ).n;

  console.log(
    `[bctcBatchTableBackfillJob] Starting one-shot backfill: ` +
      `${eligibleRows.length} eligible (PDF on disk), ` +
      `${missingFileRows.length} skipped (file not found), ` +
      `${nullPathCount} skipped (pdf_path NULL — news-inference rows). ` +
      `OCR pre-supply enabled (BT-4b-2) — docs without stored OCR will be skipped.`,
  );

  // ── Prepare OCR query (BT-4b-2: pre-supply stored OCR text to avoid Tesseract) ────
  const ocrQuery = db.prepare(
    `SELECT page_number, text_content
     FROM pdf_extracted_text
     WHERE filename = ?
     ORDER BY page_number ASC`,
  );

  // ── Sequential extraction — one doc at a time ─────────────────────────────
  const outcomes: DocOutcome[] = [];
  let successCount = 0;
  let gateBlockedCount = 0;
  let failedCount = 0;
  let skippedNoOcrCount = 0;

  for (const row of eligibleRows) {
    const docLabel = `${row.action_code} ${row.period_year}Q${row.period_quarter ?? "?"}`;
    const docId = row.id;

    // UUID-validate before any HTTP call
    if (!isValidUuid(docId)) {
      console.error(
        `[bctcBatchTableBackfillJob] ERROR invalid UUID: doc_id=${docId} — skipping`,
      );
      outcomes.push({
        doc_id: docId,
        action_code: row.action_code,
        period_year: row.period_year,
        period_quarter: row.period_quarter,
        pdf_path: row.pdf_path,
        status: "error",
        error: "invalid_uuid",
      });
      failedCount++;
      continue;
    }

    // ── BT-4b-2: Query stored OCR text for this doc (join by basename) ────────
    // HOST SAFETY: we only POST with pre-supplied pages so that pdf-extractor uses
    // Path A (no Tesseract). If no OCR is stored, skip the doc — forcing in-process
    // OCR on the 16GB Mac risks kernel-panic from swap exhaustion.
    const pdfBasename = basename(row.pdf_path);
    const ocrPages = ocrQuery.all(pdfBasename) as OcrPageRow[];

    if (ocrPages.length === 0) {
      console.warn(
        `[bctcBatchTableBackfillJob] SKIP no-ocr: doc_id=${docId} ` +
          `(${docLabel}) — no stored OCR text for filename=${pdfBasename}. ` +
          `Skipping to avoid in-process Tesseract on host Mac (kernel-panic risk).`,
      );
      outcomes.push({
        doc_id: docId,
        action_code: row.action_code,
        period_year: row.period_year,
        period_quarter: row.period_quarter,
        pdf_path: row.pdf_path,
        status: "skipped_no_ocr",
      });
      skippedNoOcrCount++;
      continue;
    }

    // Map OCR rows to the pages format expected by /extract-tables (BT-3-D schema)
    const pages = ocrPages.map((p) => ({
      page_number: p.page_number,
      text: p.text_content,
    }));

    console.log(
      `[bctcBatchTableBackfillJob] Extracting ${docLabel} (${docId}) ` +
        `— ${pages.length} pre-supplied OCR pages (zero Tesseract) ...`,
    );

    try {
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report_id: docId,
          pdf_path: row.pdf_path,
          statement_section: statementSection,
          pages, // BT-4b-2: pre-supplied OCR text → pdf-extractor uses Path A, no Tesseract
        }),
      });

      const body = (await resp.json()) as Record<string, unknown>;

      if (!resp.ok) {
        const errMsg = String(body?.detail ?? body?.error ?? resp.status);
        console.error(
          `[bctcBatchTableBackfillJob] ERROR HTTP ${resp.status} for ${docLabel}: ${errMsg}`,
        );
        outcomes.push({
          doc_id: docId,
          action_code: row.action_code,
          period_year: row.period_year,
          period_quarter: row.period_quarter,
          pdf_path: row.pdf_path,
          status: "error",
          error: `http_${resp.status}: ${errMsg}`,
        });
        failedCount++;
        continue;
      }

      // Check for gate-blocked outcome (BT-5 cross-check gate)
      const blockedReason =
        typeof body.blocked_reason === "string" ? body.blocked_reason : null;

      if (blockedReason) {
        console.warn(
          `[bctcBatchTableBackfillJob] GATE BLOCKED ${docLabel}: ${blockedReason}`,
        );
        outcomes.push({
          doc_id: docId,
          action_code: row.action_code,
          period_year: row.period_year,
          period_quarter: row.period_quarter,
          pdf_path: row.pdf_path,
          status: "gate_blocked",
          blocked_reason: blockedReason,
        });
        gateBlockedCount++;
        continue;
      }

      const rowsStored = typeof body.rows_stored === "number" ? body.rows_stored : 0;
      const balancePass = body.balance_pass === true;

      console.log(
        `[bctcBatchTableBackfillJob] OK ${docLabel}: rows_stored=${rowsStored} balance_pass=${balancePass}`,
      );
      outcomes.push({
        doc_id: docId,
        action_code: row.action_code,
        period_year: row.period_year,
        period_quarter: row.period_quarter,
        pdf_path: row.pdf_path,
        status: "success",
        rows_stored: rowsStored,
        balance_pass: balancePass,
      });
      successCount++;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(
        `[bctcBatchTableBackfillJob] ERROR network/parse for ${docLabel}: ${errMsg}`,
      );
      outcomes.push({
        doc_id: docId,
        action_code: row.action_code,
        period_year: row.period_year,
        period_quarter: row.period_quarter,
        pdf_path: row.pdf_path,
        status: "error",
        error: errMsg,
      });
      failedCount++;
    }
  }

  // Add skipped-no-file outcomes to the list (for completeness in report)
  for (const row of missingFileRows) {
    outcomes.push({
      doc_id: row.id,
      action_code: row.action_code,
      period_year: row.period_year,
      period_quarter: row.period_quarter,
      pdf_path: row.pdf_path,
      status: "skipped_no_file",
    });
  }

  const result: BackfillBctcTablesResult = {
    success: successCount,
    gate_blocked: gateBlockedCount,
    failed: failedCount,
    skipped_no_file: missingFileRows.length,
    skipped_null_path: nullPathCount,
    skipped_no_ocr: skippedNoOcrCount,
    outcomes,
  };

  console.log(
    `[bctcBatchTableBackfillJob] DONE: success=${successCount} ` +
      `gate_blocked=${gateBlockedCount} failed=${failedCount} ` +
      `skipped_no_file=${missingFileRows.length} skipped_null_path=${nullPathCount} ` +
      `skipped_no_ocr=${skippedNoOcrCount}`,
  );

  return result;
}
