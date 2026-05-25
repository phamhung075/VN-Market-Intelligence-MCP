/**
 * BT3-FIX-3 — One-shot BCTC table backfill job (fresh Tesseract OCR strategy)
 *
 * NOT a cron. Run ONCE after BT-3+BT-3i+BT-5 are live, BEFORE BT-6 QA.
 *
 * Purpose: iterate all financial_reports rows with a real PDF on disk,
 * POST each to pdf-extractor /extract-tables so the extractor runs FRESH Tesseract
 * OCR (PdfOcrAdapter, 200 DPI, vie+eng, psm 6) inside the 8GB-capped container,
 * assembles structured rows using the proven inline-layout parser, and pushes them
 * back via /api/push-bctc-table.
 *
 * Strategy change (BT3-FIX-3, was BT-4b-2):
 *   PREVIOUS: pre-supply stored OCR from pdf_extracted_text to avoid host Tesseract.
 *   NOW:      NO pre-supplied pages. The extractor uses the fresh-OCR path (BT-3-D /
 *             PdfOcrAdapter) entirely inside the pdf-extractor Docker container, which
 *             is bounded to 8GB RAM. The stored OCR in pdf_extracted_text used a
 *             column-separated layout incompatible with the line parser, causing label
 *             splits, null prior-column values, and address junk. Fresh Tesseract at
 *             200 DPI produces the proven inline layout.
 *
 * Skips:
 *   - Rows where pdf_path IS NULL or '' (news-inference rows — no PDF to re-extract)
 *   - Rows where the PDF file does NOT exist on disk at the stored path
 *
 * Ordering: SEQUENTIAL — one doc at a time. Never parallel.
 * OCR runs in the container (~4s/page); sequential execution enforces R1 risk mitigation.
 *
 * Idempotency: the /extract-tables → /push-bctc-table pipeline does DELETE+INSERT
 * per report_id, so re-running is safe.
 *
 * DDD layer: application (injected db + extractTableUrl; no domain imports; no interface imports).
 * Zone: apps/mcp-server/ (sole writer of market.db via push handler on pdf-extractor's behalf).
 */

import type { Database } from "bun:sqlite";
import { existsSync } from "node:fs";

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

export interface DocOutcome {
  doc_id: string;
  action_code: string;
  period_year: number;
  period_quarter: number | null;
  pdf_path: string;
  status: "success" | "gate_blocked" | "error" | "skipped_no_file";
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
  /** Per-doc outcomes (for reporting) */
  outcomes: DocOutcome[];
}

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * backfillBctcTables — one-shot extraction for all stored financial_reports docs
 * that have a real PDF on disk.
 *
 * Posts report_id + pdf_path + statement_section only to /extract-tables.
 * The pdf-extractor container runs fresh Tesseract OCR via PdfOcrAdapter (BT-3-D path).
 * No stored OCR is passed; the stored OCR in pdf_extracted_text used a column-separated
 * layout that caused label misalignment (BT3-FIX-3 root cause, architect ruling §2).
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
    `[bctcBatchTableBackfillJob] Starting one-shot backfill (BT3-FIX-3 fresh-OCR): ` +
      `${eligibleRows.length} eligible (PDF on disk), ` +
      `${missingFileRows.length} skipped (file not found), ` +
      `${nullPathCount} skipped (pdf_path NULL — news-inference rows). ` +
      `Fresh Tesseract runs inside pdf-extractor container (8GB-capped, no host OCR).`,
  );

  // ── Sequential extraction — one doc at a time ─────────────────────────────
  const outcomes: DocOutcome[] = [];
  let successCount = 0;
  let gateBlockedCount = 0;
  let failedCount = 0;

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

    // BT3-FIX-3: POST report_id + pdf_path + statement_section ONLY.
    // No pages / pre_supplied_pages — the pdf-extractor container runs fresh
    // Tesseract via PdfOcrAdapter (the proven BT-3-D path, inline-layout OCR).
    console.log(
      `[bctcBatchTableBackfillJob] Extracting ${docLabel} (${docId}) ` +
        `— fresh Tesseract OCR via container PdfOcrAdapter ...`,
    );

    try {
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report_id: docId,
          pdf_path: row.pdf_path,
          statement_section: statementSection,
          // No pages / pre_supplied_pages: forces fresh Tesseract in container (BT3-FIX-3)
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
    outcomes,
  };

  console.log(
    `[bctcBatchTableBackfillJob] DONE: success=${successCount} ` +
      `gate_blocked=${gateBlockedCount} failed=${failedCount} ` +
      `skipped_no_file=${missingFileRows.length} skipped_null_path=${nullPathCount}`,
  );

  return result;
}
