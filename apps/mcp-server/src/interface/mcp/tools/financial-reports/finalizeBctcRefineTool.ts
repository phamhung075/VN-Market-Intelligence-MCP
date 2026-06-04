/**
 * MCP Tool: finalize_bctc_refine — AC-MCP-OPTY-3
 *
 * Sprint BCTC-AGENTIC-REFINE (Option-Y, §0.7.4)
 * DDD layer: application (Phase 4 collect-then-write boundary)
 *
 * Phase 4 collect-then-write: called by the fleet cron ONCE after all
 * push_bctc_refined_unit calls complete for a report.
 *
 * Steps (atomic transaction):
 * 1. DELETE bctc_table_rows WHERE report_id = ?
 * 2. Read all DONE windows from bctc_refined_units
 * 3. Parse each DONE window via parseRefinedMarkdown → BctcTableRow[]
 * 4. INSERT all rows into bctc_table_rows
 * 5. UPDATE financial_reports.refine_status = report_status
 *
 * FAILED windows are NOT parsed — they contribute NO rows (isolation invariant).
 * One transaction wraps both the parse-and-insert and the status update
 * (atomicity: all-or-nothing — if any parse fails, no rows are written).
 *
 * @module interface/mcp/tools/financial-reports/finalizeBctcRefineTool
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDb } from "../../../../infrastructure/db/schema.js";
import { logger } from "../../../../infrastructure/logger.js";
import { parseRefinedMarkdown } from "../../../../application/utils/refinedMarkdownParser.js";
import {
  getCorrectionsMap,
  reAnchorCorrections,
} from "../../../../infrastructure/db/bctcHumanCorrectionsStore.js";
import type { HumanCorrectionRecord } from "../../../../infrastructure/db/bctcHumanCorrectionsStore.js";
import {
  detectMagnitudeViolations,
  detectCrossStatementRevenue,
} from "../../../../domain/services/financial-reports/bctcMagnitudeValidator.js";
import { isBankFormFromRows } from "../../../../domain/services/financial-reports/bctcFormType.js";
import { checkSectionCompleteness } from "../../../../domain/services/financial-reports/bctcSectionCompleteness.js";
import {
  aggregateScalars,
} from "../../../../domain/services/financial-reports/bctcScalarAggregator.js";
import type { ScalarAggregateResult } from "../../../../domain/services/financial-reports/bctcScalarAggregator.js";
import {
  computeBctcEval,
  loadBctcEvalThresholds,
} from "../../../../application/usecases/computeBctcEval.js";
import { validateFinancialReport } from "../../../../domain/services/financial-reports/bctcValidator.js";

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
  rows: Array<{
    report_id: string;
    page_number: number;
    statement_section: string;
    row_order: number;
    code: string | null;
    label: string;
    period_current: string;
    value_current: number | null;
    period_prior: string | null;
    value_prior: number | null;
    unit: string;
    is_summary_row: number;
    source_confidence: number;
  }>,
  correctionsMap: Map<string, HumanCorrectionRecord>,
): typeof rows {
  return rows.map((row) => {
    const key = `${row.label}||${row.page_number}||${row.statement_section}||${row.code ?? ""}`;
    const correction = correctionsMap.get(key);
    if (!correction) return row;
    return { ...row, value_current: correction.new_value, source_confidence: 1.0 };
  });
}

// ── Zod input schema ──────────────────────────────────────────────────────────

const InputSchema = z.object({
  report_id: z.string().min(1).describe("Financial report ID"),
  report_status: z
    .enum(["DONE", "PARTIAL", "FAILED"])
    .describe("Report-level status determined by the fleet cron after aggregating window results"),
});

// ── Handler ───────────────────────────────────────────────────────────────────

export function buildFinalizeBctcRefineHandler(
  dbOverride?: ReturnType<typeof getDb>,
): (input: z.input<typeof InputSchema>) => Promise<{ content: [{ type: "text"; text: string }] }> {
  return async (rawInput) => {
    const parsed = InputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ error: "validation_error", details: parsed.error.issues }),
          },
        ],
      };
    }

    const { report_id, report_status: callerReportStatus } = parsed.data;
    // BEQ-7: effectiveStatus may be overridden to PARTIAL if section guard fires
    let report_status: "DONE" | "PARTIAL" | "FAILED" = callerReportStatus;
    const db = dbOverride ?? getDb();

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
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ ok: true, skipped: true, reason: "confirmed" }),
            },
          ],
        };
      }

      // Parse all DONE windows into BctcTableRow objects
      // Done outside the transaction (pure computation, no I/O risk)
      let totalRows = 0;
      const allTableRows: Array<{
        report_id: string;
        page_number: number;
        statement_section: string;
        row_order: number;
        code: string | null;
        label: string;
        period_current: string;
        value_current: number | null;
        period_prior: string | null;
        value_prior: number | null;
        unit: string;
        is_summary_row: number;
        source_confidence: number;
      }> = [];

      for (const unit of doneUnits) {
        if (!unit.markdown) continue;

        let pageNumbers: number[];
        try {
          pageNumbers = JSON.parse(unit.page_numbers_json) as number[];
        } catch {
          pageNumbers = [1];
        }

        const parseResult = parseRefinedMarkdown(unit.markdown, report_id, pageNumbers);

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

      // applyCorrections post-pass: overlay human corrections BEFORE INSERT
      // (ARCH-DECIDE A: post-pass, parser internals 0-diff)
      const correctionMap = getCorrectionsMap(db, report_id);
      const finalRows = applyCorrections(allTableRows, correctionMap);

      // ── DT-2 + DT-3: Aggregate report-level sanity checks ─────────────────
      // Fires AFTER parse loop + applyCorrections, BEFORE INSERT transaction.
      // NFR-5: CONFIRMED guard (Layer 1) already handled above — no re-check needed here.

      // C-4 (BANK-DEV-2): structural bank detection from finalRows (already loaded).
      // isBankFormFromRows returns true when finalRows has NO 3-digit numeric codes
      // (bank Mẫu B02-TCTD uses Roman/single-digit/alphabetic codes only).
      // Domain column is universally "other" in live DB — not used.
      const reportIsBankForm = isBankFormFromRows(finalRows);

      const magnitudeViolations = detectMagnitudeViolations(finalRows, reportIsBankForm);
      const crossStmtViolations = detectCrossStatementRevenue(finalRows);
      const allViolations = [...magnitudeViolations, ...crossStmtViolations];
      const hasBlockViolation = allViolations.some((v) => v.severity === "BLOCK");

      if (hasBlockViolation) {
        // BLOCK: do NOT insert rows; set report to REJECTED_SANITY
        db.transaction(() => {
          // Update financial_reports.refine_status
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
              const parsed = JSON.parse(unit.flags ?? "[]");
              if (Array.isArray(parsed)) existingFlags.push(...parsed);
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

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                ok: false,
                report_id,
                rejected_reason: allViolations,
              }),
            },
          ],
        };
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
      // section-incomplete (e.g., agentic refine produced only income_statement rows),
      // override to PARTIAL. The server is the SSOT for completeness invariant.
      // Empty finalRows also triggers this guard (fail-safe: no evidence → PARTIAL).
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
        // Rows covered by a correction are NOT deleted (their value_current was
        // already updated by submitCorrection; they survive the re-parse intact).
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
            row.source_confidence ?? 1.0,
          );
          totalRows++;
        }

        // Delete stale OLD pinned rows BEFORE re-anchor, so reAnchorCorrections
        // sees exactly one row per corrected label (the newly inserted parser row).
        // This prevents false anchor_ambiguous when the only duplicate is the transient old pinned row.
        for (const oldRowId of pinnedRowIds) {
          db.prepare(`DELETE FROM bctc_table_rows WHERE id = ? AND report_id = ?`).run(oldRowId, report_id);
        }

        // Re-anchor corrections to new row IDs (inside transaction after INSERT + old-row cleanup)
        // Updates bctc_human_corrections.row_id to match new bctc_table_rows.id
        // At this point exactly one row per non-ambiguous corrected label exists.
        // Genuine duplicates in the final row set will correctly flag anchor_ambiguous (not regressed).
        reAnchorCorrections(db, report_id);

        // Update financial_reports.refine_status
        db.prepare(
          "UPDATE financial_reports SET refine_status = ? WHERE id = ?",
        ).run(report_status, report_id);
      })();

      // ── BLOCK-1 FIX: Backfill financial_reports scalar aggregate columns ──
      // Source: freshly inserted bctc_table_rows (the refined truth).
      // Reuses bctcScalarAggregator (domain, pure, zero I/O) — DRY:
      // same code→column mapping as the original parseBctcReport/storeReport path.
      // Runs OUTSIDE the main transaction (read+write is safe — all rows committed).
      // NULL semantics preserved: absent line items stay NULL, not 0.
      try {
        interface ScalarRow {
          code: string | null;
          label: string;
          value_current: number | null;
          statement_section: string;
          is_summary_row: number;
          unit: string;
        }
        const scalarRows = db
          .prepare<ScalarRow, [string]>(
            `SELECT code, label, value_current, statement_section, is_summary_row, unit
             FROM bctc_table_rows
             WHERE report_id = ?`,
          )
          .all(report_id);

        const aggResult: ScalarAggregateResult = aggregateScalars(scalarRows);

        // FU-6c: balance-identity gate — if the aggregator detected an internally
        // inconsistent result (wrong-row pick), log.error and SKIP the UPDATE.
        // Preserving stale/null scalars is safer than writing known-wrong numbers.
        // The table rows are already committed; ops can re-finalize after the fix.
        if (aggResult.balanceViolation !== null) {
          logger.error("[finalize_bctc_refine] balance identity violated — scalar UPDATE skipped", {
            report_id,
            violation: aggResult.balanceViolation,
          });
        } else {
          const agg = aggResult.scalars;
          const naSet = new Set(aggResult.notApplicable);

          // FU-6e: 3-case scalar UPDATE logic
          //
          // Case 1 — NOT-APPLICABLE for this report type (e.g. bank gross_profit):
          //   The aggregator signals this via notApplicable[]. These columns MUST be
          //   SET NULL explicitly to clear any stale legacy pdf-parse value. A bank will
          //   never have gross_profit, so any existing value is always wrong.
          //
          // Case 2 — EXPECTED but transiently null (e.g. corporate gross_profit that
          //   failed to parse this run): SKIP (preserve prior value). FU-5 intent preserved.
          //   Detection: aggregator returned null AND column is NOT in notApplicable.
          //
          // Case 3 — Resolved to a real non-null value: SET value (existing behavior).
          //
          // The gross_margin_pct column is included in notApplicable for bank reports
          // (it is derived from gross_profit — invalid without it). net_margin_pct is
          // NOT in notApplicable because banks do have net profit; if it resolves null
          // that is a transient parse miss, not a structural absence.

          // Resolved non-null scalars → SET value (Case 3)
          const updates: Array<{ col: string; val: number }> = [];
          // Original 10 columns:
          if (agg.net_revenue       !== null) updates.push({ col: "net_revenue",       val: agg.net_revenue });
          if (agg.gross_profit      !== null) updates.push({ col: "gross_profit",      val: agg.gross_profit });
          if (agg.profit_before_tax !== null) updates.push({ col: "profit_before_tax", val: agg.profit_before_tax });
          if (agg.net_profit        !== null) updates.push({ col: "net_profit",        val: agg.net_profit });
          if (agg.total_assets      !== null) updates.push({ col: "total_assets",      val: agg.total_assets });
          if (agg.current_assets    !== null) updates.push({ col: "current_assets",    val: agg.current_assets });
          if (agg.total_liabilities !== null) updates.push({ col: "total_liabilities", val: agg.total_liabilities });
          if (agg.equity_total      !== null) updates.push({ col: "equity_total",      val: agg.equity_total });
          if (agg.gross_margin_pct  !== null) updates.push({ col: "gross_margin_pct",  val: agg.gross_margin_pct });
          if (agg.net_margin_pct    !== null) updates.push({ col: "net_margin_pct",    val: agg.net_margin_pct });
          // BEQ-3: new columns (10 additional scalars from full column audit)
          if (agg.operating_profit  !== null) updates.push({ col: "operating_profit",  val: agg.operating_profit });
          if (agg.ebitda            !== null) updates.push({ col: "ebitda",            val: agg.ebitda });
          if (agg.cash              !== null) updates.push({ col: "cash",              val: agg.cash });
          if (agg.eps               !== null) updates.push({ col: "eps",               val: agg.eps });
          if (agg.diluted_eps       !== null) updates.push({ col: "diluted_eps",       val: agg.diluted_eps });
          if (agg.operating_cf      !== null) updates.push({ col: "operating_cf",      val: agg.operating_cf });
          if (agg.investing_cf      !== null) updates.push({ col: "investing_cf",      val: agg.investing_cf });
          if (agg.financing_cf      !== null) updates.push({ col: "financing_cf",      val: agg.financing_cf });
          if (agg.capex             !== null) updates.push({ col: "capex",             val: agg.capex });
          if (agg.free_cash_flow    !== null) updates.push({ col: "free_cash_flow",    val: agg.free_cash_flow });
          // FIX-DE-2: debt decomposition scalars (missed in BEQ-3 column audit)
          // BLOCK-3 already reads short_term_debt/long_term_debt from DB to compute
          // debt_to_equity and net_debt_to_ebitda — but was reading the zeros/garbage
          // that BLOCK-1 never replaced. Now BLOCK-1 writes the real values, so BLOCK-3
          // auto-computes the correct D/E ratio on the same finalize run.
          if (agg.short_term_debt   !== null) updates.push({ col: "short_term_debt",   val: agg.short_term_debt });
          if (agg.long_term_debt    !== null) updates.push({ col: "long_term_debt",     val: agg.long_term_debt });
          // FIX-F: new equity/asset scalar fields (corporate B01-DN only; bank path uses notApplicable)
          if (agg.charter_capital      !== null) updates.push({ col: "charter_capital",      val: agg.charter_capital });
          if (agg.investment_property  !== null) updates.push({ col: "investment_property",  val: agg.investment_property });
          if (agg.reward_fund          !== null) updates.push({ col: "reward_fund",          val: agg.reward_fund });

          // NOT-APPLICABLE columns → SET NULL (Case 1): clear stale legacy values
          const nullClearCols: string[] = [...naSet];

          if (updates.length > 0 || nullClearCols.length > 0) {
            // Build a single UPDATE statement: resolved columns SET value,
            // not-applicable columns SET NULL, everything else untouched (Case 2 skip).
            const setClauses: string[] = [
              ...updates.map((u) => `${u.col} = ?`),
              ...nullClearCols.map((col) => `${col} = NULL`),
            ];
            const bindVals: (number | string)[] = [...updates.map((u) => u.val), report_id];
            (db.prepare(`UPDATE financial_reports SET ${setClauses.join(", ")} WHERE id = ?`) as {
              run: (...args: (number | string)[]) => unknown;
            }).run(...bindVals);
            logger.info("[finalize_bctc_refine] scalar backfill complete", {
              report_id,
              updated_cols: updates.map((u) => u.col),
              null_cleared_cols: nullClearCols,
            });

            // FU-6f B-2 FIX: sync JSON blobs for not-applicable columns.
            //
            // When FU-6e null-cleared scalar columns (e.g. gross_profit for banks),
            // the income_stmt_json and balance_sheet_json blobs were NOT updated.
            // This left stale values (e.g. ACB income_stmt_json.grossProfit=6,989,162)
            // visible to /api/bctc-inspect and raw JSON views.
            //
            // Fix: for each not-applicable scalar column, null the corresponding camelCase
            // field in the appropriate JSON blob and re-serialize it.
            //
            // Mapping (snake_case scalar → blob + camelCase key):
            //   gross_profit  → income_stmt_json  .grossProfit
            //   current_assets → balance_sheet_json .currentAssets (via nested structure)
            //   gross_margin_pct → ratios_json (skip: not a blob field at this layer)
            //
            // Constraint: only update if the blob column actually exists and contains
            // the target key. This is generalized to the notApplicable set.
            if (nullClearCols.length > 0) {
              // income_stmt_json field mapping: scalar col → camelCase key in blob
              const incomeStmtFieldMap: Record<string, string> = {
                gross_profit: "grossProfit",
                // cogs is the counterpart; banks have no COGS — also null it
                // (derived from gross_profit absence; keep consistent)
              };

              // balance_sheet_json field mapping: scalar col → camelCase key in blob
              // currentAssets lives in a nested structure {currentAssets: {total: ...}}
              // We null the top-level key only — safe for bank where the concept is absent.
              const balanceSheetFieldMap: Record<string, string> = {
                current_assets: "currentAssets",
              };

              const nullsInIncomeBlob = nullClearCols
                .map((col) => incomeStmtFieldMap[col])
                .filter((k): k is string => k !== undefined);

              const nullsInBalanceBlob = nullClearCols
                .map((col) => balanceSheetFieldMap[col])
                .filter((k): k is string => k !== undefined);

              if (nullsInIncomeBlob.length > 0) {
                const blobRow = db
                  .prepare<{ income_stmt_json: string | null }, [string]>(
                    "SELECT income_stmt_json FROM financial_reports WHERE id = ?",
                  )
                  .get(report_id);

                if (blobRow?.income_stmt_json) {
                  try {
                    const blob = JSON.parse(blobRow.income_stmt_json) as Record<string, unknown>;
                    for (const key of nullsInIncomeBlob) {
                      blob[key] = null;
                    }
                    db.prepare(
                      "UPDATE financial_reports SET income_stmt_json = ? WHERE id = ?",
                    ).run(JSON.stringify(blob), report_id);
                    logger.info("[finalize_bctc_refine] income_stmt_json blob synced (null-clear)", {
                      report_id,
                      nulled_keys: nullsInIncomeBlob,
                    });
                  } catch (blobErr) {
                    logger.warn("[finalize_bctc_refine] income_stmt_json blob sync failed (non-fatal)", {
                      report_id,
                      error: blobErr instanceof Error ? blobErr.message : String(blobErr),
                    });
                  }
                }
              }

              if (nullsInBalanceBlob.length > 0) {
                const bsRow = db
                  .prepare<{ balance_sheet_json: string | null }, [string]>(
                    "SELECT balance_sheet_json FROM financial_reports WHERE id = ?",
                  )
                  .get(report_id);

                if (bsRow?.balance_sheet_json) {
                  try {
                    const blob = JSON.parse(bsRow.balance_sheet_json) as Record<string, unknown>;
                    for (const key of nullsInBalanceBlob) {
                      blob[key] = null;
                    }
                    db.prepare(
                      "UPDATE financial_reports SET balance_sheet_json = ? WHERE id = ?",
                    ).run(JSON.stringify(blob), report_id);
                    logger.info("[finalize_bctc_refine] balance_sheet_json blob synced (null-clear)", {
                      report_id,
                      nulled_keys: nullsInBalanceBlob,
                    });
                  } catch (blobErr) {
                    logger.warn("[finalize_bctc_refine] balance_sheet_json blob sync failed (non-fatal)", {
                      report_id,
                      error: blobErr instanceof Error ? blobErr.message : String(blobErr),
                    });
                  }
                }
              }
            }

            // FIX-DE-2 B-2: sync resolved debt scalars into balance_sheet_json blob.
            //
            // The balance_sheet_json blob was written at OCR-parse time (balanceSheetExtractor)
            // with wrong VAS codes (311 for shortTermDebt, 334 for longTermDebt) and was never
            // updated by the refined path (only the top-level scalar columns were updated by
            // BLOCK-1 before FIX-DE-2). This leaves stale zeros in the blob even when the
            // scalar columns are now correctly populated.
            //
            // Fix: for each newly resolved debt scalar, write the correct value into the
            // nested blob path using a safe nested-key descent. The intermediate objects
            // (currentLiabilities, longTermLiabilities) must exist — if absent, skip
            // silently (non-fatal: the blob path structure depends on the original OCR extract).
            //
            // Blob path mapping (mirrors balanceSheetExtractor.ts output structure):
            //   short_term_debt → balance_sheet_json.currentLiabilities.shortTermDebt
            //   long_term_debt  → balance_sheet_json.longTermLiabilities.longTermDebt
            //
            // Note: this syncs ONLY the two fields we know are wrong (debt scalars).
            // Other blob fields (accounts payable, etc.) are not touched — only the
            // fields that BLOCK-1 just updated from the refined truth.
            if (
              (agg.short_term_debt !== null || agg.long_term_debt !== null)
            ) {
              const bsDebtRow = db
                .prepare<{ balance_sheet_json: string | null }, [string]>(
                  "SELECT balance_sheet_json FROM financial_reports WHERE id = ?",
                )
                .get(report_id);

              if (bsDebtRow?.balance_sheet_json) {
                try {
                  const blob = JSON.parse(bsDebtRow.balance_sheet_json) as Record<string, unknown>;
                  let blobChanged = false;

                  // short_term_debt → currentLiabilities.shortTermDebt
                  if (agg.short_term_debt !== null) {
                    const cl = blob["currentLiabilities"];
                    if (cl !== null && cl !== undefined && typeof cl === "object") {
                      (cl as Record<string, unknown>)["shortTermDebt"] = agg.short_term_debt;
                      blobChanged = true;
                    }
                    // If currentLiabilities is absent/null, skip silently — blob structure
                    // may be minimal for some extractors; we do not create the nested object.
                  }

                  // long_term_debt → longTermLiabilities.longTermDebt
                  if (agg.long_term_debt !== null) {
                    const ltl = blob["longTermLiabilities"];
                    if (ltl !== null && ltl !== undefined && typeof ltl === "object") {
                      (ltl as Record<string, unknown>)["longTermDebt"] = agg.long_term_debt;
                      blobChanged = true;
                    }
                  }

                  if (blobChanged) {
                    db.prepare(
                      "UPDATE financial_reports SET balance_sheet_json = ? WHERE id = ?",
                    ).run(JSON.stringify(blob), report_id);
                    logger.info("[finalize_bctc_refine] FIX-DE-2 balance_sheet_json debt blob synced", {
                      report_id,
                      short_term_debt: agg.short_term_debt,
                      long_term_debt: agg.long_term_debt,
                    });
                  }
                } catch (bsDebtErr) {
                  logger.warn("[finalize_bctc_refine] FIX-DE-2 debt blob sync failed (non-fatal)", {
                    report_id,
                    error: bsDebtErr instanceof Error ? bsDebtErr.message : String(bsDebtErr),
                  });
                }
              }
            }
          } else {
            logger.warn("[finalize_bctc_refine] scalar backfill: no non-null scalars found", {
              report_id,
            });
          }
        }
      } catch (scalarErr) {
        // Non-fatal: log and continue — table rows are committed; scalar backfill
        // failure is surfaced in logs for FU-6 ops to investigate.
        logger.warn("[finalize_bctc_refine] scalar backfill error (non-fatal)", {
          report_id,
          error: scalarErr instanceof Error ? scalarErr.message : String(scalarErr),
        });
      }

      // ── BAL-1c: Set period_basis from period_quarter ────────────────────────
      //
      // Root cause (brief 2026-06-02-bctc-analytics-layer-bal1 §4.3):
      //   PUB-7 comparison guard previously used a period_type heuristic (no column).
      //   BAL-1c adds a persisted `period_basis` column so the guard is structural.
      //
      // VAS standard:
      //   period_quarter = 4  → 'full_year_cumulative'  (Q4 BCTC = FY Jan–Dec cumulative)
      //   period_quarter IN (1,2,3) → 'standalone_quarter' (YTD but treated as standalone
      //                               for comparison basis; Phase 2 will do true subtraction)
      //   period_quarter IS NULL    → leave NULL (annual filing — no quarterly basis concept)
      //
      // Runs OUTSIDE the main transaction (additive, idempotent UPDATE).
      // Non-fatal: error logged; scalar/ratio backfills already committed.
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

      // ── BAL-1d: Set report_scope from revenue/profit heuristic ───────────────
      //
      // Root cause (brief 2026-06-02-bctc-analytics-layer-bal1 §5.2):
      //   No structural column distinguishes consolidated from parent-only reports.
      //   PUB-8 previously relied solely on an inline heuristic at serve time.
      //   BAL-1d persists the heuristic result as a column so the publish gate
      //   is structural (column-based) rather than repeated inference on every serve.
      //
      // Heuristic (SSOT — mirrors PUB-8 guard in bctcFullTools.ts):
      //   net_revenue = 0 OR net_revenue IS NULL → revenue-absent
      //   AND net_profit IS NOT NULL AND net_profit > 0 → profitable with no revenue
      //   → 'parent_only'  (holding-company pattern: holding-co earns dividends, no ops revenue)
      //   else → 'consolidated'
      //
      // False-positive guard: only stamp 'parent_only' when revenue is GENUINELY zero
      // or absent, not merely small. Small positive revenue (e.g. 1–100 triệu) is a
      // real ops line — keep as 'consolidated'. The threshold is zero (= 0 or NULL),
      // not "less than some threshold". This is intentionally strict.
      //
      // NULL net_profit with zero revenue is stamped 'consolidated' (not enough signal
      // to distinguish parent-only from a zero-revenue corp that lost money).
      //
      // Runs OUTSIDE the main transaction (additive, idempotent UPDATE).
      // Non-fatal: error logged; scalar/ratio/period_basis backfills already committed.
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

      // ── BLOCK-3: Re-derive ratio columns from corrected scalars (BAL-1a) ─────
      //
      // Root cause (brief 2026-06-02-bctc-analytics-layer-bal1 §2.2):
      //   BLOCK-1 corrects base scalars (net_profit, equity_total, total_assets, …)
      //   but the ratio columns (roe, roa, current_ratio, debt_to_equity,
      //   net_debt_to_ebitda) retain their original OCR-parse values — which may be
      //   stale, unit-scale wrong, or zero (incomeBroken guard fired at parse time).
      //   This block re-derives them from the freshly committed scalars.
      //
      // Formula SSOT: ratioComputer.ts (same formulas, no fork).
      //   roe               = net_profit / equity_total × 100  (guard: equity_total > 0)
      //   roa               = net_profit / total_assets  × 100 (guard: total_assets > 0)
      //   current_ratio     = current_assets / currentLiabilities.total
      //                       (denominator from balance_sheet_json.currentLiabilities.total;
      //                        guard: denominator > 0 and not null)
      //   debt_to_equity    = (short_term_debt + long_term_debt) / equity_total
      //                       (guard: equity_total > 0, both debt values non-null)
      //   net_debt_to_ebitda = (short_term_debt + long_term_debt - cash) / ebitda
      //                       (guard: ebitda > 0, required values non-null)
      //   eps               = NULL (no standard VAS code; bctcScalarAggregator L744;
      //                        stale OCR EPS worse than null — tracked FU-BCTC-EPS-FOOTNOTE)
      //
      // Null-safety: any missing/null/zero denominator → SET NULL (never Infinity/NaN/0).
      // Runs OUTSIDE the main transaction; non-fatal on error (same pattern as BLOCK-1).
      try {
        interface RatioSourceRow {
          net_profit: number | null;
          equity_total: number | null;
          total_assets: number | null;
          current_assets: number | null;
          ebitda: number | null;
          cash: number | null;
          short_term_debt: number | null;
          long_term_debt: number | null;
          balance_sheet_json: string | null;
        }
        const ratioSrc = db
          .prepare<RatioSourceRow, [string]>(
            `SELECT net_profit, equity_total, total_assets, current_assets,
                    ebitda, cash, short_term_debt, long_term_debt, balance_sheet_json
             FROM financial_reports WHERE id = ?`,
          )
          .get(report_id);

        if (ratioSrc) {
          const {
            net_profit,
            equity_total,
            total_assets,
            current_assets,
            ebitda,
            cash,
            short_term_debt,
            long_term_debt,
            balance_sheet_json,
          } = ratioSrc;

          // safeDivide: returns null when denominator ≤ 0 or result is non-finite.
          // Mirrors ratioComputer.ts safeDivide — same null-safety contract.
          function safeDivideLocal(numerator: number, denominator: number): number | null {
            if (denominator === 0) return null;
            const result = numerator / denominator;
            if (!Number.isFinite(result)) return null;
            return result;
          }

          // roe: net_profit / equity_total × 100
          const roe: number | null =
            net_profit !== null && equity_total !== null && equity_total > 0
              ? safeDivideLocal(net_profit, equity_total) !== null
                ? safeDivideLocal(net_profit, equity_total)! * 100
                : null
              : null;

          // roa: net_profit / total_assets × 100
          const roa: number | null =
            net_profit !== null && total_assets !== null && total_assets > 0
              ? safeDivideLocal(net_profit, total_assets) !== null
                ? safeDivideLocal(net_profit, total_assets)! * 100
                : null
              : null;

          // current_ratio: current_assets / currentLiabilities.total
          // currentLiabilities.total is NOT a scalar column — read from balance_sheet_json.
          let current_ratio: number | null = null;
          if (current_assets !== null && balance_sheet_json) {
            try {
              const bs = JSON.parse(balance_sheet_json) as Record<string, unknown>;
              const clTotal =
                bs["currentLiabilities"] !== null &&
                typeof bs["currentLiabilities"] === "object" &&
                bs["currentLiabilities"] !== undefined
                  ? (bs["currentLiabilities"] as Record<string, unknown>)["total"]
                  : undefined;
              if (typeof clTotal === "number" && clTotal > 0) {
                current_ratio = safeDivideLocal(current_assets, clTotal);
              }
            } catch {
              // JSON parse error — leave current_ratio null (safe fallback)
            }
          }

          // debt_to_equity: (short_term_debt + long_term_debt) / equity_total
          const debt_to_equity: number | null =
            short_term_debt !== null &&
            long_term_debt !== null &&
            equity_total !== null &&
            equity_total > 0
              ? safeDivideLocal(short_term_debt + long_term_debt, equity_total)
              : null;

          // net_debt_to_ebitda: (short_term_debt + long_term_debt - cash) / ebitda
          // Guard: ebitda > 0 (mirrors ratioComputer.ts L132)
          const net_debt_to_ebitda: number | null =
            short_term_debt !== null &&
            long_term_debt !== null &&
            cash !== null &&
            ebitda !== null &&
            ebitda > 0
              ? safeDivideLocal(
                  short_term_debt + long_term_debt - cash,
                  ebitda,
                )
              : null;

          // eps: SET NULL post-refine (no standard VAS code; bctcScalarAggregator eps:null).
          // Stale OCR EPS is worse than null — explicit NULL clears bad OCR values.
          // Tracked: FU-BCTC-EPS-FOOTNOTE (future footnote extraction).

          // Build the UPDATE — SET all 6 ratio columns unconditionally (NULL is correct
          // when denominator is missing; preserving stale value is the bug this block fixes).
          db.prepare(
            `UPDATE financial_reports
             SET roe               = ?,
                 roa               = ?,
                 current_ratio     = ?,
                 debt_to_equity    = ?,
                 net_debt_to_ebitda = ?,
                 eps               = NULL
             WHERE id = ?`,
          ).run(
            roe ?? null,
            roa ?? null,
            current_ratio ?? null,
            debt_to_equity ?? null,
            net_debt_to_ebitda ?? null,
            report_id,
          );

          logger.info("[finalize_bctc_refine] BLOCK-3 ratio re-derive complete (BAL-1a)", {
            report_id,
            roe: roe !== null ? `${roe.toFixed(2)}%` : "NULL",
            roa: roa !== null ? `${roa.toFixed(2)}%` : "NULL",
            current_ratio: current_ratio !== null ? current_ratio.toFixed(3) : "NULL",
            debt_to_equity: debt_to_equity !== null ? debt_to_equity.toFixed(3) : "NULL",
            net_debt_to_ebitda: net_debt_to_ebitda !== null ? net_debt_to_ebitda.toFixed(3) : "NULL",
            eps: "NULL (forced — FU-BCTC-EPS-FOOTNOTE)",
          });
        }
      } catch (ratioErr) {
        // Non-fatal: log and continue — scalar backfill already committed.
        // Ratio re-derive failure leaves stale ratio columns; BAL-0 PUB-6 guards serve time.
        logger.warn("[finalize_bctc_refine] BLOCK-3 ratio re-derive error (non-fatal)", {
          report_id,
          error: ratioErr instanceof Error ? ratioErr.message : String(ratioErr),
        });
      }

      // ── BLOCK-4: Re-run balance/identity validation from corrected scalars ──────
      //
      // Root cause (FU-LF-VALIDATION-STATUS-REFLOW):
      //   validation_status is frozen at OCR-parse time (parseBctcReport.ts).
      //   BLOCK-1 corrects base scalars, BLOCK-3 re-derives ratios, but
      //   validation_status stays 'failed' with stale notes (e.g. 'Liabilities (0) +
      //   Equity (0)') even for balance-EXACT reports after refine.
      //   A consumer filtering validation_status='passed' wrongly skips correct data.
      //
      // Fix (finalize prong): after BLOCK-1+BLOCK-3 commit the corrected scalars,
      //   re-run validateFinancialReport from the freshly committed values, then
      //   UPDATE validation_status + validation_notes to reflect the CURRENT state.
      //   Future finalizes will write a fresh validation_status (not the frozen parse one).
      //
      // Non-fatal: error logged; scalar/ratio backfills already committed.
      // isBankFormFromRows uses the already-computed finalRows (same source as C-4 above).
      try {
        interface ValidationSourceRow {
          net_revenue: number | null;
          gross_profit: number | null;
          net_profit: number | null;
          total_assets: number | null;
          total_liabilities: number | null;
          equity_total: number | null;
          current_assets: number | null;
          extraction_confidence: number | null;
        }
        const valSrc = db
          .prepare<ValidationSourceRow, [string]>(
            `SELECT net_revenue, gross_profit, net_profit,
                    total_assets, total_liabilities, equity_total,
                    current_assets, extraction_confidence
             FROM financial_reports WHERE id = ?`,
          )
          .get(report_id);

        if (valSrc) {
          const isBankForValidation = isBankFormFromRows(finalRows);

          const valResult = validateFinancialReport({
            balanceSheet: {
              totalAssets:      valSrc.total_assets      ?? 0,
              totalLiabilities: valSrc.total_liabilities ?? 0,
              equityTotal:      valSrc.equity_total      ?? 0,
              currentAssets:    valSrc.current_assets    ?? 0,
              nonCurrentAssets:
                (valSrc.total_assets ?? 0) > 0 && (valSrc.current_assets ?? 0) > 0
                  ? (valSrc.total_assets ?? 0) - (valSrc.current_assets ?? 0)
                  : 0,
            },
            incomeStatement: {
              netRevenue:  valSrc.net_revenue  ?? 0,
              grossProfit: valSrc.gross_profit ?? 0,
              netProfit:   valSrc.net_profit   ?? 0,
            },
            extractionConfidence: valSrc.extraction_confidence ?? 1,
            isBankForm: isBankForValidation,
          });

          let newValidationStatus: string;
          if (!valResult.isValid) {
            newValidationStatus = "failed";
          } else if (valResult.warnings.length > 0) {
            newValidationStatus = "passed_with_warnings";
          } else {
            newValidationStatus = "passed";
          }

          const newValidationNotes: string | null =
            valResult.errors.length > 0
              ? valResult.errors.join("; ")
              : valResult.warnings.length > 0
                ? valResult.warnings.join("; ")
                : null;

          db.prepare(
            "UPDATE financial_reports SET validation_status = ?, validation_notes = ? WHERE id = ?",
          ).run(newValidationStatus, newValidationNotes, report_id);

          logger.info("[finalize_bctc_refine] BLOCK-4 validation_status refreshed (FU-LF-VALIDATION-STATUS-REFLOW)", {
            report_id,
            new_status: newValidationStatus,
            is_valid: valResult.isValid,
            error_count: valResult.errors.length,
            warning_count: valResult.warnings.length,
          });
        }
      } catch (valErr) {
        // Non-fatal: scalar/ratio backfills already committed.
        // Stale validation_status remains; bctcFullTools recompute-on-read handles it.
        logger.warn("[finalize_bctc_refine] BLOCK-4 validation refresh error (non-fatal)", {
          report_id,
          error: valErr instanceof Error ? valErr.message : String(valErr),
        });
      }

      // ── BLOCK-2 FIX: Recompute bctc_eval stages 4-6 post-refine ─────────────
      // The eval was computed against pre-refine data (stale red for ACB).
      // Recompute inside finalize so the eval reflects the freshly refined rows.
      // Approach: inline recompute (stages 4-6 are fast — DB reads only, no PDF).
      // If threshold loading fails (no thresholds file in test env), skip gracefully.
      try {
        const projectRoot = Bun.env["PROJECT_ROOT"] ?? process.cwd();
        const thresholds = loadBctcEvalThresholds(projectRoot);
        await computeBctcEval(db, report_id, thresholds);
        logger.info("[finalize_bctc_refine] bctc_eval recomputed post-refine", { report_id });
      } catch (evalErr) {
        // Non-fatal: eval recompute failure must NOT block the finalize response.
        // The table rows and scalar backfill are already committed.
        // Ops can trigger a manual recompute via POST /api/bctc-eval/recompute/{id}.
        logger.warn("[finalize_bctc_refine] eval recompute error (non-fatal) — manual recompute available", {
          report_id,
          error: evalErr instanceof Error ? evalErr.message : String(evalErr),
        });
      }

      logger.info("[finalize_bctc_refine] complete", {
        report_id,
        report_status,
        done_units: doneUnits.length,
        rows_parsed: totalRows,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ ok: true, rows_parsed: totalRows }),
          },
        ],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn("[finalize_bctc_refine] error", { report_id, error: msg });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ error: msg }),
          },
        ],
      };
    }
  };
}

// ── MCP tool registration ─────────────────────────────────────────────────────

export function registerFinalizeBctcRefineTool(server: McpServer): void {
  const handler = buildFinalizeBctcRefineHandler();

  server.tool(
    "finalize_bctc_refine",
    "Phase 4 collect-then-write: called by fleet cron after all push_bctc_refined_unit calls complete. " +
      "Atomically: DELETE bctc_table_rows for report → parse all DONE windows via refinedMarkdownParser → " +
      "INSERT rows → UPDATE financial_reports.refine_status. " +
      "FAILED windows contribute NO rows (isolation invariant). " +
      "report_status must be determined by the caller (DONE/PARTIAL/FAILED) based on window aggregation. " +
      "Output: { ok: true, rows_parsed: number } or { error: string }.",
    {
      report_id: z.string().min(1).describe("Financial report ID"),
      report_status: z
        .enum(["DONE", "PARTIAL", "FAILED"])
        .describe("Report-level status: DONE (all windows OK), PARTIAL (some failed), FAILED (all failed)"),
    },
    async (input) => {
      return handler(input);
    },
  );
}
