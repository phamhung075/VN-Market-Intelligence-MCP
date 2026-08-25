/**
 * Evening Summary — Step 5b: portfolio P&L snapshot (best-effort).
 *
 * Extracted from assembleEveningSummary.ts _assembleEveningSummaryImpl
 * (FACTORY-APP-split-assembleEveningSummary).
 *
 * NOTE: deliberately NOT the same as morning briefing's
 * usecases/briefing/computePortfolioPnlStep.ts — that module filters
 * market_prices by `updated_at >= '-3 days'` and persists a pnlSnapshotStore
 * row; this evening version does neither (behavior preserved verbatim from
 * the pre-split assembleEveningSummary.ts).
 *
 * Layer: application/usecases/eveningSummary — may import from domain/ + infrastructure/.
 */
import type { Database } from "bun:sqlite";
import { logger } from "../../../infrastructure/logger.js";
import type { PortfolioPnlResult } from "../../../domain/services/portfolioPnlCalculator.js";

interface OpenPositionRow {
  code: string;
  shares: number;
  avg_price: number;
}

/**
 * Computes per-position and aggregate unrealized P&L for all open positions.
 * `getPnlFn` overrides the default DB-backed implementation for tests; throws
 * from `getPnlFn` are caught (portfolioPnl set to null, no crash). Returns
 * null when there are no open positions.
 */
export async function computePortfolioPnlStep(
  db: Database,
  getPnlFn?: () => Promise<PortfolioPnlResult | null>,
): Promise<PortfolioPnlResult | null> {
  let portfolioPnl: PortfolioPnlResult | null = null;
  try {
    if (getPnlFn) {
      portfolioPnl = await getPnlFn();
    } else {
      // Default: query positions table + market_prices (mirrors assembleBriefing pattern)
      const openPositions = db
        .prepare<OpenPositionRow, []>(
          `SELECT code, shares, avg_price FROM positions WHERE closed_at IS NULL`,
        )
        .all();

      if (openPositions.length > 0) {
        const priceRows = db
          .prepare<{ code: string; price: number }, []>(
            `SELECT code, price FROM market_prices WHERE price IS NOT NULL AND price > 0
             UNION ALL
             SELECT code, close AS price FROM daily_ohlcv
             WHERE (code, date) IN (SELECT code, MAX(date) FROM daily_ohlcv GROUP BY code)
               AND code NOT IN (SELECT code FROM market_prices WHERE price IS NOT NULL AND price > 0)`,
          )
          .all();
        const priceMap = new Map(priceRows.map((r) => [r.code, r.price]));

        const { computePortfolioPnl } = await import(
          "../../../domain/services/portfolioPnlCalculator.js"
        );
        portfolioPnl = computePortfolioPnl(
          openPositions.map((p) => ({
            code: p.code,
            shares: p.shares,
            avgPrice: p.avg_price,
          })),
          priceMap,
        );
      }
    }
  } catch (pnlErr) {
    logger.warn("[assembleEveningSummary] portfolioPnl step failed", {
      error: pnlErr instanceof Error ? pnlErr.message : String(pnlErr),
    });
    portfolioPnl = null;
  }

  return portfolioPnl;
}
