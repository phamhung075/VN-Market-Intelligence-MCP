/**
 * finalizeBctcRefine.ts — application-layer use case for finalize_bctc_refine
 * (FACTORY-INTERFACE-extract-finalizeBctc-usecase — relocated from
 * interface/mcp/tools/financial-reports/finalizeBctcRefineTool.ts, which had
 * ~1100 lines of application logic living in the interface layer).
 *
 * DDD layer: application (Phase 4 collect-then-write boundary).
 *
 * Sprint BCTC-AGENTIC-REFINE (Option-Y, §0.7.4). Phase 4 collect-then-write:
 * called by the fleet cron ONCE after all push_bctc_refined_unit calls
 * complete for a report.
 *
 * Steps (atomic transaction):
 * 1. DELETE bctc_table_rows WHERE report_id = ?
 * 2. Read all DONE windows from bctc_refined_units
 * 3. Parse each DONE window via parseRefinedMarkdown → BctcTableRow[]
 * 4. INSERT all rows into bctc_table_rows
 * 5. UPDATE financial_reports.refine_status = report_status
 *
 * FAILED windows are NOT parsed — they contribute NO rows (isolation
 * invariant). One transaction wraps both the parse-and-insert and the
 * status update (atomicity: all-or-nothing).
 *
 * Post-transaction (outside the atomic transaction, each independently
 * non-fatal): BLOCK-1 scalar backfill, BAL-1c period_basis, BAL-1d
 * report_scope, BLOCK-3 ratio re-derive, BLOCK-4 validation refresh,
 * BLOCK-5 extraction_confidence recompute, BLOCK-2 bctc_eval recompute —
 * extracted to their own files in this directory (call order preserved
 * exactly; see backfillScalarColumns.ts / deriveRatioColumns.ts /
 * revalidateBalanceIdentity.ts / recomputeExtractionConfidence.ts /
 * recomputeBctcEval.ts).
 *
 * The interface layer (finalizeBctcRefineTool.ts) owns the Zod input schema,
 * the MCP `server.tool` registration, and wraps this function's plain result
 * object into the `{content: [...]}` MCP response shape — this function
 * returns the raw result only (same JSON payload the interface previously
 * built inline at each return point; pure relocation, no behavior change).
 *
 * @module application/usecases/finalizeBctcRefine/finalizeBctcRefine
 */

import type { Database } from "bun:sqlite";
import { logger } from "../../../infrastructure/logger.js";
import { parseRefinedMarkdown } from "../../utils/refinedMarkdownParser.js";
import {
  getCorrectionsMap,
  reAnchorCorrections,
} from "../../../infrastructure/db/bctcHumanCorrectionsStore.js";
import type { HumanCorrectionRecord } from "../../../infrastructure/db/bctcHumanCorrectionsStore.js";
import {
  detectMagnitudeViolations,
  detectCrossStatementRevenue,
} from "../../../domain/services/financial-reports/bctcMagnitudeValidator.js";
import type { SanityViolation } from "../../../domain/services/financial-reports/bctcSanityValidator.js";
import { isBankFormFromRows } from "../../../domain/services/financial-reports/bctcFormType.js";
import { checkSectionCompleteness } from "../../../domain/services/financial-reports/bctcSectionCompleteness.js";
import { backfillScalarColumns } from "./backfillScalarColumns.js";
import { deriveRatioColumns } from "./deriveRatioColumns.js";
import { revalidateBalanceIdentity } from "./revalidateBalanceIdentity.js";
import { recomputeExtractionConfidence } from "./recomputeExtractionConfidence.js";
import { recomputeBctcEval } from "./recomputeBctcEval.js";
import type { FinalizeBctcTableRow } from "./finalizeBctcRefineTypes.js";

// ── DB row types ──────────────────────────────────────────────────────────────

interface RefinedUnitRow {
  unit_id: string;
  page_numbers_json: string;
  markdown: string;
  window_status: string;
}

interface ConfirmStatusRow {
  confirm_status: string | null;
}

// ── Result type ─────────────────────────────────────────────────────────────

export type FinalizeBctcRefineResult =
  | { ok: true; skipped: true; reason: "confirmed" }
  | { ok: false; report_id: string; rejected_reason: SanityViolation[] }
  | {
      ok: true;
      rows_parsed: number;
      effective_status: "DONE" | "PARTIAL" | "FAILED";
      beg7_override: boolean;
    }
  | { error: string };

// ── applyCorrections post-pass helper ─────────────────────────────────────────

/**
 * applyCorrections — post-pass override that replaces parser-computed values
 * with human-confirmed corrections BEFORE the INSERT loop.
 *
 * ARCH-DECIDE A: Post-pass (Option A2). Parser internals are 0-diff.
 * Key format: `${label}||${page_number}||${statement_section}||${code ?? ''}`
 *
 * @param rows          Parsed rows from parseRefinedMarkdown
 * @param correctionsMap Map keyed by stable anchor key from getCorrectionsMap
 * @returns New array with corrected rows overridden; uncorrected rows unchanged
 */
function applyCorrections(
  rows: FinalizeBctcTableRow[],
  correctionsMap: Map<string, HumanCorrectionRecord>,
): FinalizeBctcTableRow[] {
  return rows.map((row) => {
    const key = `${row.label}||${row.page_number}||${row.statement_section}||${row.code ?? ""}`;
    const correction = correctionsMap.get(key);
    if (!correction) return row;
    // Human-confirmed correction: 1.0 is a REAL value here (full trust from
    // a human), not a fabricated fallback — distinct from resolveSourceConfidence's
    // NOT-NULL guard below, which only fires on a genuinely absent value.
    return { ...row, value_current: correction.new_value, source_confidence: 1.0 };
  });
}

/**
 * resolveSourceConfidence — FACTORY-INTERFACE-source-confidence-10-mask
 *
 * Sole INSERT-boundary resolver for `bctc_table_rows.source_confidence`
 * (`REAL NOT NULL DEFAULT 1.0` — schema-financial-reports.ts:512-523). The
 * column cannot be made nullable (hard constraint), so a real value must
 * always be written.
 *
 * Propagates a real, parser-supplied confidence UNCHANGED — it is never
 * overridden or coerced. `parseRefinedMarkdown` always computes a genuine
 * per-row confidence (0.1 unparseable / 0.2 red flag / 0.4 yellow flag / 1.0
 * no flag found — see refinedMarkdownParser.ts `BctcTableRow.source_confidence`
 * doc), so in the current pipeline this function's `undefined` branch is
 * never actually reached. It exists as an explicit, documented, NOT-NULL-safe
 * fallback ONLY for a row that genuinely carries no confidence value at all
 * (e.g. a future row producer that does not route through the parser) —
 * do NOT read the 1.0 below as a silent mask of unknown confidence; it is
 * the schema's own documented default, applied only when nothing is known.
 */
export function resolveSourceConfidence(sourceConfidence: number | undefined): number {
  if (sourceConfidence !== undefined) return sourceConfidence;
  return 1.0; // schema default — bctc_table_rows.source_confidence NOT NULL DEFAULT 1.0
}

// ── Parse-loop helper ─────────────────────────────────────────────────────────

/**
 * parseDoneUnitsToRows — parse all DONE windows into BctcTableRow objects.
 * Done outside the transaction (pure computation, no I/O risk).
 *
 * FIX-BCTC-BANK-BS-SECTION-CLASSIFIER: thread `statement_section` state
 * across DONE units in page order. `doneUnits` is already `ORDER BY
 * unit_id ASC` (caller's query), which matches page order for the
 * zero-padded window IDs the agentic-refine scheduler assigns
 * (unit-0001, unit-0002, ...). Real multi-page VN BCTC statements print
 * their header line ("BẢNG CÂN ĐỐI KẾ TOÁN" etc.) once, on the FIRST page —
 * a continuation unit with no header line of its own used to always fall
 * back to "general" (reproduced: report_id 96e36139 unit-0003).
 * parseRefinedMarkdown stays pure/stateless per call; this loop owns the
 * ordering and carries `finalSection` forward as the next unit's
 * `initialSection`.
 */
function parseDoneUnitsToRows(doneUnits: RefinedUnitRow[], report_id: string): FinalizeBctcTableRow[] {
  const allTableRows: FinalizeBctcTableRow[] = [];
  let carrySection = "general";

  for (const unit of doneUnits) {
    if (!unit.markdown) continue;

    let pageNumbers: number[];
    try {
      pageNumbers = JSON.parse(unit.page_numbers_json) as number[];
    } catch {
      pageNumbers = [1];
    }

    const parseResult = parseRefinedMarkdown(unit.markdown, report_id, pageNumbers, carrySection);
    carrySection = parseResult.finalSection;

    if (parseResult.errors.length > 0) {
      logger.warn("[finalize_bctc_refine] parser errors in unit", {
        report_id,
        unit_id: unit.unit_id,
        errorCount: parseResult.errors.length,
        errors: parseResult.errors.slice(0, 5),
      });
    }

    for (const tableRow of parseResult.rows) {
      allTableRows.push({
        report_id: tableRow.report_id,
        page_number: tableRow.page_number,
        statement_section: tableRow.statement_section,
        row_order: tableRow.row_order,
        code: tableRow.code ?? null,
        label: tableRow.label,
        period_current: tableRow.period_current,
        value_current: tableRow.value_current ?? null,
        period_prior: tableRow.period_prior ?? null,
        value_prior: tableRow.value_prior ?? null,
        unit: tableRow.unit,
        is_summary_row: tableRow.is_summary_row,
        source_confidence: tableRow.source_confidence,
      });
    }
  }

  return allTableRows;
}

// ── BAL-1c / BAL-1d helpers ───────────────────────────────────────────────────

/**
 * applyPeriodBasis — BAL-1c: set period_basis from period_quarter.
 *
 * Root cause (brief 2026-06-02-bctc-analytics-layer-bal1 §4.3):
 *   PUB-7 comparison guard previously used a period_type heuristic (no column).
 *   BAL-1c adds a persisted `period_basis` column so the guard is structural.
 *
 * VAS standard:
 *   period_quarter = 4  → 'full_year_cumulative'  (Q4 BCTC = FY Jan–Dec cumulative)
 *   period_quarter IN (1,2,3) → 'standalone_quarter'
 *   period_quarter IS NULL    → leave NULL (annual filing — no quarterly basis concept)
 *
 * Runs OUTSIDE the main transaction (additive, idempotent UPDATE).
 * Non-fatal: error logged; scalar/ratio backfills already committed.
 */
function applyPeriodBasis(db: Database, report_id: string): void {
  try {
    interface PeriodQRow { period_quarter: number | null }
    const pqRow = db
      .prepare<PeriodQRow, [string]>(
        "SELECT period_quarter FROM financial_reports WHERE id = ?",
      )
      .get(report_id);

    if (pqRow && pqRow.period_quarter !== null) {
      const periodBasis: string =
        pqRow.period_quarter === 4 ? "full_year_cumulative" : "standalone_quarter";
      db.prepare(
        "UPDATE financial_reports SET period_basis = ? WHERE id = ?",
      ).run(periodBasis, report_id);
      logger.info("[finalize_bctc_refine] BAL-1c period_basis set", {
        report_id,
        period_quarter: pqRow.period_quarter,
        period_basis: periodBasis,
      });
    }
  } catch (pbErr) {
    logger.warn("[finalize_bctc_refine] BAL-1c period_basis update error (non-fatal)", {
      report_id,
      error: pbErr instanceof Error ? pbErr.message : String(pbErr),
    });
  }
}

/**
 * applyReportScope — BAL-1d: set report_scope from revenue/profit heuristic.
 *
 * Heuristic (SSOT — mirrors PUB-8 guard in bctcFullTools.ts):
 *   net_revenue = 0 OR net_revenue IS NULL → revenue-absent
 *   AND net_profit IS NOT NULL AND net_profit > 0 → profitable with no revenue
 *   → 'parent_only'  (holding-company pattern)
 *   else → 'consolidated'
 *
 * NULL net_profit with zero revenue is stamped 'consolidated' (not enough
 * signal to distinguish parent-only from a zero-revenue corp that lost money).
 *
 * Runs OUTSIDE the main transaction (additive, idempotent UPDATE).
 * Non-fatal: error logged; scalar/ratio/period_basis backfills already committed.
 */
function applyReportScope(db: Database, report_id: string): void {
  try {
    interface ScopeSourceRow {
      net_revenue: number | null;
      net_profit: number | null;
    }
    const scopeSrc = db
      .prepare<ScopeSourceRow, [string]>(
        "SELECT net_revenue, net_profit FROM financial_reports WHERE id = ?",
      )
      .get(report_id);

    if (scopeSrc) {
      const { net_revenue, net_profit } = scopeSrc;
      // Heuristic: revenue-absent (null or exactly 0) AND profit positive → parent_only
      const revenueAbsent = net_revenue === null || net_revenue === 0;
      const profitPositive = net_profit !== null && net_profit > 0;

      const reportScope: string = revenueAbsent && profitPositive
        ? "parent_only"
        : "consolidated";

      db.prepare(
        "UPDATE financial_reports SET report_scope = ? WHERE id = ?",
      ).run(reportScope, report_id);
      logger.info("[finalize_bctc_refine] BAL-1d report_scope set", {
        report_id,
        net_revenue,
        net_profit,
        report_scope: reportScope,
      });
    }
  } catch (rsErr) {
    logger.warn("[finalize_bctc_refine] BAL-1d report_scope update error (non-fatal)", {
      report_id,
      error: rsErr instanceof Error ? rsErr.message : String(rsErr),
    });
  }
}

// ── Main use case ─────────────────────────────────────────────────────────────

/**
 * runFinalizeBctcRefine — main use case entry (called by the thin interface
 * wrapper in finalizeBctcRefineTool.ts after Zod validation).
 *
 * Preserves the exact original call order:
 *   CONFIRMED guard → parse loop → applyCorrections → DT-2/DT-3 → DT-4 →
 *   BEQ-7 → single atomic db.transaction (DELETE+INSERT+reAnchor+status) →
 *   BLOCK-1 → BAL-1c → BAL-1d → BLOCK-3 → BLOCK-4 → BLOCK-5 → BLOCK-2 →
 *   response.
 */
export async function runFinalizeBctcRefine(
  db: Database,
  report_id: string,
  callerReportStatus: "DONE" | "PARTIAL" | "FAILED",
): Promise<FinalizeBctcRefineResult> {
  // BEQ-7: effectiveStatus may be overridden to PARTIAL if section guard fires
  let report_status: "DONE" | "PARTIAL" | "FAILED" = callerReportStatus;
  // FIX-FINALIZE-STATUS-STUCK-PARTIAL (Fix B): track whether caller supplied DONE
  // so the response can surface beg7_override=true when BEQ-7 fires.
  const callerWasDone = callerReportStatus === "DONE";

  try {
    // Read all DONE windows for this report
    const doneUnits = db
      .prepare<RefinedUnitRow, [string]>(
        `SELECT unit_id, page_numbers_json, markdown, window_status
         FROM bctc_refined_units
         WHERE report_id = ? AND window_status = 'DONE'
         ORDER BY unit_id ASC`,
      )
      .all(report_id);

    // Layer 1 guard: if report is CONFIRMED, skip entirely — never clobber
    const confirmRow = db
      .prepare<ConfirmStatusRow, [string]>(
        "SELECT confirm_status FROM financial_reports WHERE id = ?",
      )
      .get(report_id);
    if (confirmRow?.confirm_status === "CONFIRMED") {
      logger.info("[finalize_bctc_refine] report is CONFIRMED — skipping write", { report_id });
      return { ok: true, skipped: true, reason: "confirmed" };
    }

    let totalRows = 0;
    const allTableRows = parseDoneUnitsToRows(doneUnits, report_id);

    // applyCorrections post-pass: overlay human corrections BEFORE INSERT
    // (ARCH-DECIDE A: post-pass, parser internals 0-diff)
    const correctionMap = getCorrectionsMap(db, report_id);
    const finalRows = applyCorrections(allTableRows, correctionMap);

    // ── DT-2 + DT-3: Aggregate report-level sanity checks ─────────────────
    // Fires AFTER parse loop + applyCorrections, BEFORE INSERT transaction.
    // NFR-5: CONFIRMED guard (Layer 1) already handled above — no re-check needed here.

    // C-4 (BANK-DEV-2): structural bank detection from finalRows (already loaded).
    const reportIsBankForm = isBankFormFromRows(finalRows);

    const magnitudeViolations = detectMagnitudeViolations(finalRows, reportIsBankForm);
    const crossStmtViolations = detectCrossStatementRevenue(finalRows);
    const allViolations: SanityViolation[] = [...magnitudeViolations, ...crossStmtViolations];
    const hasBlockViolation = allViolations.some((v) => v.severity === "BLOCK");

    if (hasBlockViolation) {
      // BLOCK: do NOT insert rows; set report to REJECTED_SANITY
      db.transaction(() => {
        db.prepare(
          "UPDATE financial_reports SET refine_status = ? WHERE id = ?",
        ).run("REJECTED_SANITY", report_id);

        // Append violations to flags for all units in this report (audit trail)
        const unitsForReport = db
          .prepare<{ id: number; flags: string | null }, [string]>(
            "SELECT id, flags FROM bctc_refined_units WHERE report_id = ?",
          )
          .all(report_id);

        for (const unit of unitsForReport) {
          const existingFlags: string[] = [];
          try {
            const parsedFlags = JSON.parse(unit.flags ?? "[]");
            if (Array.isArray(parsedFlags)) existingFlags.push(...parsedFlags);
          } catch {
            // ignore invalid JSON flags
          }
          const mergedFlags = [
            ...existingFlags,
            ...allViolations.map((v) => `dt23:${v.code}`),
          ];
          db.prepare(
            "UPDATE bctc_refined_units SET flags = ? WHERE id = ?",
          ).run(JSON.stringify(mergedFlags), unit.id);
        }
      })();

      logger.warn("[finalize_bctc_refine] REJECTED_SANITY — DT-2/DT-3 BLOCK violations", {
        report_id,
        violations: allViolations,
      });

      return { ok: false, report_id, rejected_reason: allViolations };
    }

    // WARN-only violations: log but proceed with normal transaction
    if (allViolations.length > 0) {
      logger.warn("[finalize_bctc_refine] DT-2/DT-3 WARN violations (proceeding)", {
        report_id,
        violations: allViolations,
      });
    }

    // ── DT-4: Identical-timestamp WARN (forensic signal, non-blocking) ───
    // Checks if all DONE units for this report share an identical refined_at timestamp.
    // Genuine parallel fan-out produces staggered timestamps; identical = suspicious.
    // AC-TR1-4-1: logger.warn with DT4_IDENTICAL_TIMESTAMP. No rejection.
    if (doneUnits.length > 1) {
      const refinedAtValues = db
        .prepare<{ refined_at: string }, [string]>(
          "SELECT DISTINCT refined_at FROM bctc_refined_units WHERE report_id = ? AND window_status = 'DONE'",
        )
        .all(report_id);

      const uniqueTimestamps = new Set(refinedAtValues.map((r) => r.refined_at));
      if (uniqueTimestamps.size === 1) {
        logger.warn("[finalize_bctc_refine] DT4_IDENTICAL_TIMESTAMP — all units share one refined_at", {
          report_id,
          refined_at: refinedAtValues[0]?.refined_at,
          unit_count: doneUnits.length,
        });
      }
    }

    // ── BEQ-7: Section completeness guard — server-side safety net ────────────
    // If the caller supplies report_status='DONE' but the parsed rows are
    // section-incomplete, override to PARTIAL. The server is the SSOT for
    // completeness invariant.
    //
    // ARCH RULING (2026-06-12): This guard is CORRECT and MUST NOT be removed
    // or weakened. The caller does not have section visibility; the server
    // owns the DONE/PARTIAL decision. The beg7_override field in the response
    // surfaces the override to callers.
    if (report_status === "DONE") {
      const completeness = checkSectionCompleteness(finalRows);
      if (!completeness.isComplete) {
        const reason = "section_incomplete after agentic refine — caller DONE overridden to PARTIAL";
        report_status = "PARTIAL";
        logger.info("[finalize_bctc_refine] BEQ-7 section guard: DONE overridden to PARTIAL", {
          report_id,
          hasBalanceSheet: completeness.hasBalanceSheet,
          hasIncomeStatement: completeness.hasIncomeStatement,
          hasCashFlow: completeness.hasCashFlow,
          reason,
        });
      }
    }

    // Atomic transaction: selective DELETE + INSERT + re-anchor + status update
    // EC-7 prevention: single SQLite transaction — no partial-delete window
    db.transaction(() => {
      // Before selective DELETE, record which row IDs are pinned by corrections
      // (these will be preserved, then deleted after re-anchor points to new rows)
      const pinnedRowIds = db
        .prepare<{ row_id: number }, [string]>(
          `SELECT DISTINCT row_id FROM bctc_human_corrections WHERE report_id = ?`,
        )
        .all(report_id)
        .map((r) => r.row_id);

      // Layer 2: selective DELETE — preserve rows that have human corrections
      db.prepare(
        `DELETE FROM bctc_table_rows
         WHERE report_id = ?
           AND id NOT IN (
             SELECT row_id FROM bctc_human_corrections WHERE report_id = ?
           )`,
      ).run(report_id, report_id);

      // Insert all parsed rows from DONE windows (with corrections applied)
      const insertStmt = db.prepare(
        `INSERT INTO bctc_table_rows
           (report_id, page_number, statement_section, row_order, code, label,
            period_current, value_current, period_prior, value_prior, unit,
            is_summary_row, source_confidence)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );

      for (const row of finalRows) {
        insertStmt.run(
          row.report_id,
          row.page_number,
          row.statement_section,
          row.row_order,
          row.code,
          row.label,
          row.period_current,
          row.value_current,
          row.period_prior,
          row.value_prior,
          row.unit,
          row.is_summary_row,
          resolveSourceConfidence(row.source_confidence),
        );
        totalRows++;
      }

      // Delete stale OLD pinned rows BEFORE re-anchor, so reAnchorCorrections
      // sees exactly one row per corrected label (the newly inserted parser row).
      for (const oldRowId of pinnedRowIds) {
        db.prepare(`DELETE FROM bctc_table_rows WHERE id = ? AND report_id = ?`).run(oldRowId, report_id);
      }

      // Re-anchor corrections to new row IDs (inside transaction after INSERT + old-row cleanup)
      reAnchorCorrections(db, report_id);

      // Update financial_reports.refine_status
      db.prepare(
        "UPDATE financial_reports SET refine_status = ? WHERE id = ?",
      ).run(report_status, report_id);
    })();

    // ── BLOCK-1 FIX: Backfill financial_reports scalar aggregate columns ──
    backfillScalarColumns(db, report_id);

    // ── BAL-1c: Set period_basis from period_quarter ────────────────────────
    applyPeriodBasis(db, report_id);

    // ── BAL-1d: Set report_scope from revenue/profit heuristic ───────────────
    applyReportScope(db, report_id);

    // ── BLOCK-3: Re-derive ratio columns from corrected scalars (BAL-1a) ─────
    deriveRatioColumns(db, report_id);

    // ── BLOCK-4: Re-run balance/identity validation from corrected scalars ──────
    revalidateBalanceIdentity(db, report_id, finalRows);

    // ── BLOCK-5: Recompute extraction_confidence from refined section coverage ──
    recomputeExtractionConfidence(db, report_id, finalRows);

    // ── BLOCK-2 FIX: Recompute bctc_eval stages 4-6 post-refine ─────────────
    await recomputeBctcEval(db, report_id);

    logger.info("[finalize_bctc_refine] complete", {
      report_id,
      report_status,
      done_units: doneUnits.length,
      rows_parsed: totalRows,
    });

    // FIX-FINALIZE-STATUS-STUCK-PARTIAL (Fix B): include effective_status and
    // beg7_override so callers can observe when BEQ-7 overrode their supplied
    // report_status.
    return {
      ok: true,
      rows_parsed: totalRows,
      effective_status: report_status,
      beg7_override: callerWasDone && report_status === "PARTIAL",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("[finalize_bctc_refine] error", { report_id, error: msg });
    return { error: msg };
  }
}
