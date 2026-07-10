/**
 * FIX-BCTC-D2-ENSURE-SHELL-ROW
 *
 * Application use case: idempotently ensure a `financial_reports` shell row
 * exists for a PDF the pull job has just saved to disk — decoupled from the
 * legacy OCR-confidence scalar-parse pipeline (apps/pdf-extractor's own
 * 0.5-confidence gate, domain/services.py, is untouched by this change).
 *
 * Design: docs/handoffs/TASK_FIX-BCTC-PDFPULL-WIRE-TABLE-EXTRACTION.md §D2
 *
 * Called from bctcPdfPullJob.ts immediately after deps.savePdf() succeeds
 * (Step 4), before Step 5 (triggerExtraction). Closes two concerns in one
 * write:
 *   - concern 2: pdf_path is set the moment the file lands on disk — no
 *     longer dependent on the legacy scalar pipeline (parseBctcReport.ts)
 *     ever running or succeeding for this report.
 *   - concern 3: a `financial_reports` row now exists for every pulled PDF
 *     regardless of extraction confidence — a report whose scalar tiers
 *     would fail the OCR-confidence threshold still gets a row a later
 *     /pek-extract trigger (D3, follow-up task) can reference.
 *
 * id stability (reuses D1's pattern — FIX-BCTC-D1-STABILIZE-REPORT-ID): a
 * pre-check SELECT on (action_code, sort_key) supplies the existing row's id
 * when present, so the id returned here stays stable across repeat calls and
 * matches whatever the legacy scalar pipeline's own ON CONFLICT DO UPDATE
 * (parseBctcReport.ts::storeReport()) would reuse for the same row later —
 * the two write paths share one id-stability contract, not two.
 *
 * pdf_path is upserted via `ON CONFLICT(action_code, sort_key) DO UPDATE SET
 * pdf_path = excluded.pdf_path WHERE financial_reports.pdf_path IS NULL` —
 * this never clobbers a pdf_path a later successful scalar/legacy write (or
 * an earlier call to this same usecase) already set.
 *
 * validation_status='pending_extraction' is a new, additive enum value —
 * distinct from pending|passed|failed|passed_with_warnings|low_confidence —
 * used ONLY on first-insert (never touched by the ON CONFLICT DO UPDATE
 * branch, so a later legacy scalar write freely overwrites it with its own
 * real validation_status).
 *
 * Layer: application (usecases/bctc/) — orchestrates a single persistence
 * operation, no domain logic. Mirrors fetchParseAndStoreBctc precedent.
 *
 * `db` is an OPTIONAL injected parameter (default: getDb() singleton) — same
 * pattern as backfillBctcPdfPaths(db, pdfDir), the sibling pdf_path-linking
 * usecase for this same table. Callers holding their own test/production
 * Database instance (e.g. bctcPdfPullJob's `opts.db`) MUST pass it
 * explicitly so this write lands in the same database the caller reads back
 * from — bctcPdfPullJob's own test suite constructs a dedicated `:memory:`
 * Database instance separate from the getDb() singleton.
 */

import { randomUUID } from "node:crypto";
import type { Database } from "bun:sqlite";

import { getDb } from "../../../infrastructure/db/schema.js";
import { buildFiscalPeriod } from "./newsChainFallback.js";

import type { QuarterString } from "./types.js";

export interface EnsureFinancialReportShellRowParams {
  actionCode: string;
  year: number;
  quarter: QuarterString;
  pdfPath: string;
  /** Injected DB handle — defaults to the getDb() singleton. */
  db?: Database;
}

export interface EnsureFinancialReportShellRowResult {
  /**
   * The financial_reports.id for this (action_code, sort_key) — stable
   * across repeat calls and across a later legacy scalar-pipeline write.
   */
  id: string;
  /** "<year>-<quarter>" e.g. "2025-Q4" — the ON CONFLICT target key's other half. */
  sortKey: string;
}

/**
 * Idempotent upsert on (action_code, sort_key):
 *   - No existing row                 → INSERT a shell row
 *     (validation_status='pending_extraction', all statement JSON columns
 *     '{}', pdf_path = params.pdfPath).
 *   - Existing row, pdf_path IS NULL  → UPDATE pdf_path only.
 *   - Existing row, pdf_path NOT NULL → no-op (never clobbers a real pdf_path).
 */
export async function ensureFinancialReportShellRow(
  params: EnsureFinancialReportShellRowParams,
): Promise<EnsureFinancialReportShellRowResult> {
  const { actionCode, year, quarter, pdfPath } = params;
  const db = params.db ?? getDb();

  const period = buildFiscalPeriod(year, quarter);

  // FIX-BCTC-D1-STABILIZE-REPORT-ID pattern reused: pre-check for an
  // existing row so the id returned here is stable across repeat calls —
  // the ON CONFLICT DO UPDATE below never touches `id` on a real conflict
  // either way, but the pre-check keeps the in-memory value returned to the
  // caller from silently diverging (same rationale as parseBctcReport.ts
  // Step 6 pre-check).
  const existingRow = db
    .query<{ id: string }, [string, string]>(
      "SELECT id FROM financial_reports WHERE action_code = ? AND sort_key = ?",
    )
    .get(actionCode, period.sortKey);
  const id = existingRow?.id ?? randomUUID();

  const parsedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO financial_reports (
      id, action_code, company_name, exchange, domain,
      period_year, period_quarter, period_type, period_start, period_end, sort_key,
      pdf_path, parsed_at, validation_status, extraction_confidence,
      balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json
    ) VALUES (
      $id, $actionCode, '', 'HOSE', 'other',
      $periodYear, $periodQuarter, $periodType, $periodStart, $periodEnd, $sortKey,
      $pdfPath, $parsedAt, 'pending_extraction', 0,
      '{}', '{}', '{}', '{}'
    )
    ON CONFLICT(action_code, sort_key) DO UPDATE SET
      pdf_path = excluded.pdf_path
    WHERE financial_reports.pdf_path IS NULL
    -- id is deliberately NOT in this SET clause — SQLite keeps the existing
    -- row's id untouched on conflict (shares D1's id-stability contract).
    -- extraction_confidence is bound to 0 (not left to the schema's silent
    -- DEFAULT 1.0, bctc-schema.ts:750) — a shell row has MEASURED zero
    -- confidence, not the "fully extracted" reading the default implies.
    -- FIX-BCTC-D2-ENSURE-SHELL-ROW round-1 QA regression fix.
  `).run({
    $id: id,
    $actionCode: actionCode,
    $periodYear: period.year,
    $periodQuarter: period.quarter,
    $periodType: period.periodType,
    $periodStart: period.startDate,
    $periodEnd: period.endDate,
    $sortKey: period.sortKey,
    $pdfPath: pdfPath,
    $parsedAt: parsedAt,
  });

  return { id, sortKey: period.sortKey };
}
