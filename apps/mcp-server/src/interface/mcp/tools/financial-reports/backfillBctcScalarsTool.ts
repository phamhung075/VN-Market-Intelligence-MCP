/**
 * MCP Tool: backfill_bctc_scalars — BEQ-2 eligibility-filter fix
 *
 * Sprint BCTC-EXTRACT-QUALITY
 * DDD layer: interface (application use-case orchestration via domain aggregator)
 * Brief: docs/architecture-briefs/2026-06-02-bctc-extract-quality.md § FIX-1
 *
 * Root cause (Symptom A+B+C):
 *   The fleet cron (OPTION-Y) triggers the full agentic refine pipeline (push_bctc_refined_unit
 *   → finalize_bctc_refine) which requires a running Claude subagent to extract markdown.
 *   For legacy tickers that already have bctc_table_rows from the original parseBctcReport
 *   ingest (e.g. FPT 2025-Q4, DHG, EIB, HPG, SHB, VEA, VNM), the agentic pipeline was
 *   never dispatched — so they remain PENDING with 0 refined_units.
 *
 * Fix strategy:
 *   For reports with existing bctc_table_rows (legacy pdf-parse), we can directly call
 *   aggregateScalars on those rows and write the result to financial_reports scalar columns,
 *   bypassing the agentic push step entirely. This is safe because:
 *     - The table rows already exist (no new extraction)
 *     - aggregateScalars is a pure domain function (zero I/O)
 *     - We set refine_status='DONE' after successful aggregation
 *     - Balance identity gate prevents writing inconsistent scalars
 *
 * Exclusion rule:
 *   Reports with 0 bctc_table_rows are skipped (CTG, DGC, VCB x2, etc.).
 *   CTG in particular is a cover-letter-only PDF: its real financial tables need
 *   BCTC-CTG-ATTACHMENT-FETCH before any aggregation can succeed.
 *
 * LF-SERVE-REFLOW (force_reflow):
 *   BEQ-3 added new scalar mappings (operating_profit, cash, CF columns) to
 *   aggregateScalars AFTER finalize_bctc_refine last ran on several reports.
 *   Those reports transitioned to refine_status='DONE' before BEQ-3 shipped,
 *   so they were never re-derived — and the old PENDING-only eligibility
 *   predicate silently excluded them from the standard backfill sweep.
 *
 *   The durable fix: force_reflow=true extends eligibility to refine_status='DONE'
 *   reports (in addition to PENDING). This one-command sweep is safe to re-run
 *   whenever the aggregator's column mapping set changes — it re-derives from
 *   existing table_rows without touching the parse layer.
 *
 * OFF-HOSE guard:
 *   This tool modifies financial_reports rows. Callers MUST check the off-hose
 *   window (02:00–08:59 UTC Mon–Fri) before executing.
 *
 * @module interface/mcp/tools/financial-reports/backfillBctcScalarsTool
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDb } from "../../../../infrastructure/db/schema.js";
import { logger } from "../../../../infrastructure/logger.js";
import { aggregateScalars } from "../../../../domain/services/financial-reports/bctcScalarAggregator.js";
import type { ScalarAggregateResult } from "../../../../domain/services/financial-reports/bctcScalarAggregator.js";
import { checkSectionCompleteness } from "../../../../domain/services/financial-reports/bctcSectionCompleteness.js";

// ── DB row types ──────────────────────────────────────────────────────────────

interface PendingReportRow {
  id: string;
  action_code: string;
  sort_key: string;
  confirm_status: string | null;
}

interface AggregatorRow {
  code: string | null;
  label: string;
  value_current: number | null;
  statement_section: string;
  is_summary_row: number;
  unit: string;
}

// ── Input schema ──────────────────────────────────────────────────────────────

const InputSchema = z.object({
  dry_run: z
    .boolean()
    .optional()
    .describe("If true, compute scalars but do NOT write to DB. Returns what would be written."),
  report_id: z
    .string()
    .optional()
    .describe("Target a single report by ID. If omitted, backfills ALL eligible reports."),
  force_reflow: z
    .boolean()
    .optional()
    .describe(
      "If true, also re-derive scalar columns for reports with refine_status='DONE' " +
      "(not just PENDING). Use after any aggregator mapping change (e.g. BEQ-3 new columns) " +
      "to reflow stale DONE reports whose scalars were derived before the new mappings shipped. " +
      "CONFIRMED reports are always excluded regardless of this flag.",
    ),
});

// ── Result type ───────────────────────────────────────────────────────────────

interface BackfillResult {
  report_id: string;
  action_code: string;
  sort_key: string;
  table_row_count: number;
  status: "DONE" | "SKIPPED" | "BALANCE_VIOLATION" | "ERROR";
  /** BEQ-6: effective refine_status written to DB (DONE | PARTIAL) */
  refine_status?: "DONE" | "PARTIAL";
  reason?: string;
  section_breakdown?: { hasBalanceSheet: boolean; hasIncomeStatement: boolean; hasCashFlow: boolean };
  updated_cols?: string[];
  null_cleared_cols?: string[];
  balance_violation?: string;
}

// ── Handler builder ───────────────────────────────────────────────────────────

export function buildBackfillBctcScalarsHandler(
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

    const { dry_run = false, report_id, force_reflow = false } = parsed.data;
    const db = dbOverride ?? getDb();

    try {
      // ── 1. Find eligible reports ────────────────────────────────────────────
      // Default: PENDING + not CONFIRMED + at least 1 bctc_table_row
      // force_reflow=true: also include refine_status='DONE' (re-derive stale scalars
      //   whose aggregator mappings have changed since finalize last ran, e.g. BEQ-3).
      const statusClause = force_reflow
        ? `refine_status IN ('PENDING', 'DONE')`
        : `refine_status = 'PENDING'`;

      let targetReports: PendingReportRow[];

      if (report_id) {
        targetReports = db
          .prepare<PendingReportRow, [string]>(
            `SELECT id, action_code, sort_key, confirm_status
             FROM financial_reports
             WHERE id = ? AND ${statusClause}`,
          )
          .all(report_id);
      } else {
        targetReports = db
          .prepare<PendingReportRow, []>(
            `SELECT id, action_code, sort_key, confirm_status
             FROM financial_reports
             WHERE ${statusClause}
               AND (confirm_status IS NULL OR confirm_status != 'CONFIRMED')
             ORDER BY sort_key ASC`,
          )
          .all();
      }

      const results: BackfillResult[] = [];

      for (const report of targetReports) {
        // CONFIRMED guard: never overwrite human-confirmed reports
        if (report.confirm_status === "CONFIRMED") {
          results.push({
            report_id: report.id,
            action_code: report.action_code,
            sort_key: report.sort_key,
            table_row_count: 0,
            status: "SKIPPED",
            reason: "confirm_status=CONFIRMED — skipping to preserve human corrections",
          });
          continue;
        }

        // Fetch existing table rows for this report
        const tableRows = db
          .prepare<AggregatorRow, [string]>(
            `SELECT code, label, value_current, statement_section, is_summary_row, unit
             FROM bctc_table_rows
             WHERE report_id = ?`,
          )
          .all(report.id);

        // Skip reports with 0 table rows (CTG cover-letter, DGC, VCB without OCR, etc.)
        if (tableRows.length === 0) {
          results.push({
            report_id: report.id,
            action_code: report.action_code,
            sort_key: report.sort_key,
            table_row_count: 0,
            status: "SKIPPED",
            reason:
              report.action_code === "CTG"
                ? "CTG 0 table_rows — cover-letter-only PDF; requires BCTC-CTG-ATTACHMENT-FETCH"
                : "0 table_rows — no parseable financial data; requires re-fetch or re-extraction",
          });
          continue;
        }

        // BEQ-6: section completeness gate — never aggregate incomplete row sets
        // (prevents false-DONE on balance-sheet-only fragments like VNM/FPT-Q4/DHG)
        const completeness = checkSectionCompleteness(tableRows);
        if (!completeness.isComplete) {
          const sectionBreakdown = {
            hasBalanceSheet: completeness.hasBalanceSheet,
            hasIncomeStatement: completeness.hasIncomeStatement,
            hasCashFlow: completeness.hasCashFlow,
          };
          const reason = completeness.hasBalanceSheet && !completeness.hasIncomeStatement && !completeness.hasCashFlow
            ? "balance_sheet_only: section completeness violated — income_statement and cash_flow absent"
            : "section_incomplete: cannot aggregate — missing one or more statement sections";

          // Write PARTIAL status to DB (not DONE — corpus would be poisoned)
          if (!dry_run) {
            db.prepare("UPDATE financial_reports SET refine_status = 'PARTIAL' WHERE id = ?").run(report.id);
            logger.info("[backfill_bctc_scalars] section-incomplete — set PARTIAL", {
              report_id: report.id,
              action_code: report.action_code,
              ...sectionBreakdown,
            });
          }

          results.push({
            report_id: report.id,
            action_code: report.action_code,
            sort_key: report.sort_key,
            table_row_count: tableRows.length,
            status: "SKIPPED",
            refine_status: "PARTIAL",
            reason,
            section_breakdown: sectionBreakdown,
            updated_cols: [],
            null_cleared_cols: [],
          });
          continue;
        }

        // Run the scalar aggregator (pure domain function — only reached when all 3 sections present)
        const aggResult: ScalarAggregateResult = aggregateScalars(tableRows);

        if (aggResult.balanceViolation !== null) {
          logger.warn("[backfill_bctc_scalars] balance identity violated — skipping scalar write", {
            report_id: report.id,
            action_code: report.action_code,
            violation: aggResult.balanceViolation,
          });
          results.push({
            report_id: report.id,
            action_code: report.action_code,
            sort_key: report.sort_key,
            table_row_count: tableRows.length,
            status: "BALANCE_VIOLATION",
            balance_violation: aggResult.balanceViolation,
          });
          continue;
        }

        const agg = aggResult.scalars;
        const naSet = new Set(aggResult.notApplicable);

        // Build SET clauses using the same 3-case logic as finalizeBctcRefineTool
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
        // BEQ-3: new columns
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
        // FU-BACKFILL-DE-SYNC: debt decomposition scalars (missed in BEQ-3 column audit)
        // finalizeBctcRefineTool BLOCK-1 added these (FIX-DE-2/b5286dba) but the backfill
        // path was never updated — so force_reflow could not re-derive debt scalars for
        // already-DONE reports. Bank path: both columns are in notApplicable → they land
        // in nullClearCols below, not here (the null-guard prevents double-write).
        if (agg.short_term_debt   !== null) updates.push({ col: "short_term_debt",   val: agg.short_term_debt });
        if (agg.long_term_debt    !== null) updates.push({ col: "long_term_debt",     val: agg.long_term_debt });
        // FIX-F: new equity/asset scalar fields (corporate B01-DN only; bank path uses notApplicable)
        if (agg.charter_capital      !== null) updates.push({ col: "charter_capital",      val: agg.charter_capital });
        if (agg.investment_property  !== null) updates.push({ col: "investment_property",  val: agg.investment_property });
        if (agg.reward_fund          !== null) updates.push({ col: "reward_fund",          val: agg.reward_fund });

        // NOT-APPLICABLE columns → SET NULL (clear stale legacy values)
        const nullClearCols: string[] = [...naSet];

        if (!dry_run) {
          if (updates.length > 0 || nullClearCols.length > 0) {
            const setClauses: string[] = [
              ...updates.map((u) => `${u.col} = ?`),
              ...nullClearCols.map((col) => `${col} = NULL`),
              "refine_status = 'DONE'",
            ];
            const bindVals: (number | string)[] = [
              ...updates.map((u) => u.val),
              report.id,
            ];
            (db.prepare(`UPDATE financial_reports SET ${setClauses.join(", ")} WHERE id = ?`) as {
              run: (...args: (number | string)[]) => unknown;
            }).run(...bindVals);

            logger.info("[backfill_bctc_scalars] scalar backfill complete", {
              report_id: report.id,
              action_code: report.action_code,
              updated_cols: updates.map((u) => u.col),
              null_cleared_cols: nullClearCols,
            });

            // FU-BACKFILL-DE-SYNC B-2: sync resolved debt scalars into balance_sheet_json blob.
            //
            // Mirrors finalizeBctcRefineTool FIX-DE-2 B-2 exactly.
            // The blob was written at OCR-parse time with wrong VAS codes and was never
            // updated by the backfill path (only the scalar columns were updated by the
            // UPDATE above). This leaves stale zeros in the blob even when the scalar
            // columns are now correctly populated.
            //
            // Blob path mapping (mirrors balanceSheetExtractor.ts output structure):
            //   short_term_debt → balance_sheet_json.currentLiabilities.shortTermDebt
            //   long_term_debt  → balance_sheet_json.longTermLiabilities.longTermDebt
            //
            // Non-fatal: if the blob is missing, malformed, or the nested key is absent,
            // skip silently. Scalar columns are already committed above.
            if (agg.short_term_debt !== null || agg.long_term_debt !== null) {
              try {
                const bsDebtRow = db
                  .prepare<{ balance_sheet_json: string | null }, [string]>(
                    "SELECT balance_sheet_json FROM financial_reports WHERE id = ?",
                  )
                  .get(report.id);

                if (bsDebtRow?.balance_sheet_json) {
                  const blob = JSON.parse(bsDebtRow.balance_sheet_json) as Record<string, unknown>;
                  let blobChanged = false;

                  // short_term_debt → currentLiabilities.shortTermDebt
                  if (agg.short_term_debt !== null) {
                    const cl = blob["currentLiabilities"];
                    if (cl !== null && cl !== undefined && typeof cl === "object") {
                      (cl as Record<string, unknown>)["shortTermDebt"] = agg.short_term_debt;
                      blobChanged = true;
                    }
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
                    ).run(JSON.stringify(blob), report.id);
                    logger.info("[backfill_bctc_scalars] FU-BACKFILL-DE-SYNC balance_sheet_json debt blob synced", {
                      report_id: report.id,
                      action_code: report.action_code,
                      short_term_debt: agg.short_term_debt,
                      long_term_debt: agg.long_term_debt,
                    });
                  }
                }
              } catch (bsDebtErr) {
                // Non-fatal: scalar columns already committed; blob sync failure is logged only.
                logger.warn("[backfill_bctc_scalars] FU-BACKFILL-DE-SYNC debt blob sync failed (non-fatal)", {
                  report_id: report.id,
                  action_code: report.action_code,
                  error: bsDebtErr instanceof Error ? bsDebtErr.message : String(bsDebtErr),
                });
              }
            }
          } else {
            // No scalars resolved — still mark DONE (table rows exist, nothing to set)
            db.prepare("UPDATE financial_reports SET refine_status = 'DONE' WHERE id = ?").run(report.id);
          }
        }

        results.push({
          report_id: report.id,
          action_code: report.action_code,
          sort_key: report.sort_key,
          table_row_count: tableRows.length,
          status: "DONE",
          refine_status: "DONE",
          updated_cols: updates.map((u) => u.col),
          null_cleared_cols: nullClearCols,
        });
      }

      const doneCount = results.filter((r) => r.status === "DONE").length;
      const skippedCount = results.filter((r) => r.status === "SKIPPED").length;
      const violationCount = results.filter((r) => r.status === "BALANCE_VIOLATION").length;

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              ok: true,
              dry_run,
              summary: { done: doneCount, skipped: skippedCount, balance_violations: violationCount },
              results,
            }, null, 2),
          },
        ],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn("[backfill_bctc_scalars] error", { error: msg });
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
// DEREGISTER: backfill_bctc_scalars removed (U3 TOOL-SURFACE-UPGRADE) — admin-only
// backfill tool with zero claims across 4 layers. Handler retained for direct invocation.

export function registerBackfillBctcScalarsTool(_server: McpServer): void {
  // Tool deregistered: backfill_bctc_scalars — TOOL-SURFACE-UPGRADE U3
  // Admin backfill only; zero agent/flow/skill/cron claims.
  // Use buildBackfillBctcScalarsHandler() directly for one-off admin invocations.
  void _server; // explicit unused-param acknowledgement
}
