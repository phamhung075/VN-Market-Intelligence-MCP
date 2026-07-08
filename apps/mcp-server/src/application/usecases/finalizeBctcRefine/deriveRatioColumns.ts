/**
 * deriveRatioColumns.ts — BLOCK-3 (BAL-1a ratio re-derive), relocated verbatim
 * (FACTORY-INTERFACE-extract-finalizeBctc-usecase).
 *
 * DDD layer: application (usecases/finalizeBctcRefine).
 *
 * Root cause (brief 2026-06-02-bctc-analytics-layer-bal1 §2.2):
 *   BLOCK-1 corrects base scalars (net_profit, equity_total, total_assets, …)
 *   but the ratio columns (roe, roa, current_ratio, debt_to_equity,
 *   net_debt_to_ebitda) retain their original OCR-parse values — which may be
 *   stale, unit-scale wrong, or zero (incomeBroken guard fired at parse time).
 *   This block re-derives them from the freshly committed scalars.
 *
 * Formula SSOT: ratioComputer.ts (same formulas, no fork). safeDivideLocal
 * below is a private duplicate scoped to this file — absorbed here verbatim
 * per the task's extraction approach ("deriveRatioColumns absorb
 * safeDivideLocal"). Deliberately NOT unified with ratioComputer's own
 * private safeDivide — this is a pure relocation, not a dedup refactor.
 *
 * Null-safety: any missing/null/zero denominator → SET NULL (never
 * Infinity/NaN/0). Runs OUTSIDE the main transaction; non-fatal on error
 * (same pattern as the other BLOCK-*.ts siblings in this directory).
 *
 * @module application/usecases/finalizeBctcRefine/deriveRatioColumns
 */

import type { Database } from "bun:sqlite";
import { logger } from "../../../infrastructure/logger.js";

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

interface DerivedRatios {
  roe: number | null;
  roa: number | null;
  current_ratio: number | null;
  debt_to_equity: number | null;
  net_debt_to_ebitda: number | null;
}

/**
 * safeDivide: returns null when denominator ≤ 0 or result is non-finite.
 * Mirrors ratioComputer.ts safeDivide — same null-safety contract.
 */
function safeDivideLocal(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  const result = numerator / denominator;
  if (!Number.isFinite(result)) return null;
  return result;
}

/**
 * computeDerivedRatios — pure computation from the freshly committed scalars.
 *   roe               = net_profit / equity_total × 100  (guard: equity_total > 0)
 *   roa               = net_profit / total_assets  × 100 (guard: total_assets > 0)
 *   current_ratio     = current_assets / currentLiabilities.total
 *                       (denominator from balance_sheet_json.currentLiabilities.total)
 *   debt_to_equity    = (short_term_debt + long_term_debt) / equity_total
 *   net_debt_to_ebitda = (short_term_debt + long_term_debt - cash) / ebitda
 */
function computeDerivedRatios(src: RatioSourceRow): DerivedRatios {
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
  } = src;

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
      ? safeDivideLocal(short_term_debt + long_term_debt - cash, ebitda)
      : null;

  return { roe, roa, current_ratio, debt_to_equity, net_debt_to_ebitda };
}

/**
 * deriveRatioColumns — BLOCK-3 main entry.
 * SETs all 5 ratio columns unconditionally (NULL is correct when a
 * denominator is missing — preserving stale value is the bug this block
 * fixes) plus forces eps = NULL post-refine (no standard VAS code; stale OCR
 * EPS is worse than null — tracked FU-BCTC-EPS-FOOTNOTE).
 * Non-fatal: any error is logged and swallowed.
 */
export function deriveRatioColumns(db: Database, report_id: string): void {
  try {
    const ratioSrc = db
      .prepare<RatioSourceRow, [string]>(
        `SELECT net_profit, equity_total, total_assets, current_assets,
                ebitda, cash, short_term_debt, long_term_debt, balance_sheet_json
         FROM financial_reports WHERE id = ?`,
      )
      .get(report_id);

    if (!ratioSrc) return;

    const { roe, roa, current_ratio, debt_to_equity, net_debt_to_ebitda } =
      computeDerivedRatios(ratioSrc);

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
  } catch (ratioErr) {
    // Non-fatal: log and continue — scalar backfill already committed.
    // Ratio re-derive failure leaves stale ratio columns; BAL-0 PUB-6 guards serve time.
    logger.warn("[finalize_bctc_refine] BLOCK-3 ratio re-derive error (non-fatal)", {
      report_id,
      error: ratioErr instanceof Error ? ratioErr.message : String(ratioErr),
    });
  }
}
