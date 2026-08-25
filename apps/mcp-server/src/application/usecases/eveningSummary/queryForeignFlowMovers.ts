/**
 * Evening Summary — Step 4b: foreign flow movers (Task 1503).
 *
 * Extracted from assembleEveningSummary.ts _assembleEveningSummaryImpl
 * (FACTORY-APP-split-assembleEveningSummary).
 *
 * Layer: application/usecases/eveningSummary — may import from infrastructure/.
 */
import type { Database } from "bun:sqlite";
import { logger } from "../../../infrastructure/logger.js";
import type { ForeignFlowMover } from "./types.js";

interface OhlcvFlowRow {
  code: string;
  foreign_net_vol: number;
  foreign_buy_vol: number;
  foreign_sell_vol: number;
}

/**
 * Top 5 stocks by |foreign_net_vol| for the latest daily_ohlcv date, via the
 * daily_ohlcv_with_flow compat view (TASK_2003 SUBTASK-DAILY-FF-4 — COALESCE
 * new daily_foreign_flow, then legacy daily_ohlcv.foreign_*).
 * `getForeignFlowMoversFn` overrides the default query for test injection.
 */
export function queryForeignFlowMovers(
  db: Database,
  getForeignFlowMoversFn?: (db: Database) => ForeignFlowMover[],
): ForeignFlowMover[] {
  try {
    if (getForeignFlowMoversFn) {
      return getForeignFlowMoversFn(db);
    }
    const flowRows = db
      .prepare<OhlcvFlowRow, []>(
        `SELECT code, foreign_net_vol, foreign_buy_vol, foreign_sell_vol
           FROM daily_ohlcv_with_flow
          -- TASK_2003 (SUBTASK-DAILY-FF-4): daily_ohlcv_with_flow compat view
          -- (COALESCE new daily_foreign_flow, then legacy daily_ohlcv.foreign_*).
          WHERE date = (SELECT MAX(date) FROM daily_ohlcv)
            AND foreign_net_vol IS NOT NULL
            AND foreign_net_vol <> 0
          ORDER BY ABS(foreign_net_vol) DESC
          LIMIT 5`,
      )
      .all();
    return flowRows.map((r) => ({
      code: r.code,
      foreignNetVol: r.foreign_net_vol,
      foreignBuyVol: r.foreign_buy_vol,
      foreignSellVol: r.foreign_sell_vol,
    }));
  } catch (err) {
    logger.warn("[assembleEveningSummary] foreignFlowMovers step failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
