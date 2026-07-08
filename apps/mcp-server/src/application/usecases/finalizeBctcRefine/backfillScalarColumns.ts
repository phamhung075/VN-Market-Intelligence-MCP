/**
 * backfillScalarColumns.ts — BLOCK-1 FIX, relocated verbatim
 * (FACTORY-INTERFACE-extract-finalizeBctc-usecase).
 *
 * DDD layer: application (usecases/finalizeBctcRefine).
 *
 * Backfill financial_reports scalar aggregate columns from freshly inserted
 * bctc_table_rows (the refined truth). Reuses bctcScalarAggregator (domain,
 * pure, zero I/O) — DRY: same code→column mapping as the original
 * parseBctcReport/storeReport path.
 *
 * Runs OUTSIDE the main finalize db.transaction (read+write is safe — all
 * rows already committed). NULL semantics preserved: absent line items stay
 * NULL, not 0. Non-fatal on error (logged, never thrown) — matches the
 * original inline try/catch behavior in finalizeBctcRefineTool.ts.
 *
 * @module application/usecases/finalizeBctcRefine/backfillScalarColumns
 */

import type { Database } from "bun:sqlite";
import { logger } from "../../../infrastructure/logger.js";
import { aggregateScalars } from "../../../domain/services/financial-reports/bctcScalarAggregator.js";
import type { ScalarAggregateResult, ScalarAggregate } from "../../../domain/services/financial-reports/bctcScalarAggregator.js";

interface ScalarRow {
  code: string | null;
  label: string;
  value_current: number | null;
  statement_section: string;
  is_summary_row: number;
  unit: string;
}

/**
 * buildScalarUpdates — FU-6e Case 3: resolved non-null scalars → SET value.
 * Pure — no I/O. Mirrors the original inline `updates` array construction.
 */
function buildScalarUpdates(agg: ScalarAggregate): Array<{ col: string; val: number }> {
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
  if (agg.short_term_debt   !== null) updates.push({ col: "short_term_debt",   val: agg.short_term_debt });
  if (agg.long_term_debt    !== null) updates.push({ col: "long_term_debt",     val: agg.long_term_debt });
  // FIX-F: new equity/asset scalar fields (corporate B01-DN only; bank path uses notApplicable)
  if (agg.charter_capital      !== null) updates.push({ col: "charter_capital",      val: agg.charter_capital });
  if (agg.investment_property  !== null) updates.push({ col: "investment_property",  val: agg.investment_property });
  if (agg.reward_fund          !== null) updates.push({ col: "reward_fund",          val: agg.reward_fund });
  return updates;
}

/**
 * syncNullClearBlobs — FU-6f B-2 FIX: sync JSON blobs for not-applicable columns.
 *
 * When FU-6e null-clears scalar columns (e.g. gross_profit for banks), the
 * income_stmt_json and balance_sheet_json blobs were NOT updated. This left
 * stale values (e.g. ACB income_stmt_json.grossProfit=6,989,162) visible to
 * /api/bctc-inspect and raw JSON views.
 *
 * Fix: for each not-applicable scalar column, null the corresponding
 * camelCase field in the appropriate JSON blob and re-serialize it.
 */
function syncNullClearBlobs(db: Database, report_id: string, nullClearCols: string[]): void {
  if (nullClearCols.length === 0) return;

  // income_stmt_json field mapping: scalar col → camelCase key in blob
  const incomeStmtFieldMap: Record<string, string> = {
    gross_profit: "grossProfit",
  };

  // balance_sheet_json field mapping: scalar col → camelCase key in blob
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

/**
 * syncDebtBlob — FIX-DE-2 B-2: sync resolved debt scalars into balance_sheet_json blob.
 *
 * The balance_sheet_json blob was written at OCR-parse time (balanceSheetExtractor)
 * with wrong VAS codes (311 for shortTermDebt, 334 for longTermDebt) and was never
 * updated by the refined path (only the top-level scalar columns were updated by
 * BLOCK-1 before FIX-DE-2). This syncs ONLY the two debt fields BLOCK-1 just
 * resolved — other blob fields (accounts payable, etc.) are not touched.
 */
function syncDebtBlob(db: Database, report_id: string, agg: ScalarAggregate): void {
  if (agg.short_term_debt === null && agg.long_term_debt === null) return;

  const bsDebtRow = db
    .prepare<{ balance_sheet_json: string | null }, [string]>(
      "SELECT balance_sheet_json FROM financial_reports WHERE id = ?",
    )
    .get(report_id);

  if (!bsDebtRow?.balance_sheet_json) return;

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

/**
 * backfillScalarColumns — BLOCK-1 FIX main entry.
 * Non-fatal: any error is logged and swallowed (table rows already committed).
 */
export function backfillScalarColumns(db: Database, report_id: string): void {
  try {
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
    if (aggResult.balanceViolation !== null) {
      logger.error("[finalize_bctc_refine] balance identity violated — scalar UPDATE skipped", {
        report_id,
        violation: aggResult.balanceViolation,
      });
      return;
    }

    const agg = aggResult.scalars;
    const naSet = new Set(aggResult.notApplicable);

    // FU-6e: 3-case scalar UPDATE logic — see buildScalarUpdates (Case 3),
    // nullClearCols below (Case 1). Case 2 (expected-but-null) is an implicit
    // skip: any column not in `updates` and not in `nullClearCols` is left
    // untouched by the dynamic SET clause built below.
    const updates = buildScalarUpdates(agg);
    const nullClearCols: string[] = [...naSet];

    if (updates.length === 0 && nullClearCols.length === 0) {
      logger.warn("[finalize_bctc_refine] scalar backfill: no non-null scalars found", {
        report_id,
      });
      return;
    }

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

    syncNullClearBlobs(db, report_id, nullClearCols);
    syncDebtBlob(db, report_id, agg);
  } catch (scalarErr) {
    // Non-fatal: log and continue — table rows are committed; scalar backfill
    // failure is surfaced in logs for FU-6 ops to investigate.
    logger.warn("[finalize_bctc_refine] scalar backfill error (non-fatal)", {
      report_id,
      error: scalarErr instanceof Error ? scalarErr.message : String(scalarErr),
    });
  }
}
