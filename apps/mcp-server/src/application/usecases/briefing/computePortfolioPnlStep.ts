/**
 * Morning Briefing — Step 13a: portfolio P&L snapshot (per-position + aggregate).
 *
 * Extracted from assembleBriefing.ts _assembleBriefingImpl (FACTORY-APP-split-assembleBriefing).
 *
 * Layer: application/usecases/briefing — may import from domain/ + infrastructure/.
 */
import type { Database } from "bun:sqlite";
import { logger } from "../../../infrastructure/logger.js";
import {
  computePortfolioPnl,
  type PortfolioPnlResult,
} from "../../../domain/services/portfolioPnlCalculator.js";
import { todayVietnam } from "../../../domain/services/timeHelpers.js";

interface OpenPositionRow {
  code: string;
  shares: number;
  avg_price: number;
}

/**
 * Computes per-position and aggregate unrealized P&L for all open positions,
 * then best-effort persists a daily snapshot. Returns null when the
 * positions table is empty or no open positions exist.
 */
export async function computePortfolioPnlStep(db: Database): Promise<PortfolioPnlResult | null> {
  let portfolioPnl: PortfolioPnlResult | null = null;
  try {
    const openPositions = db
      .prepare<OpenPositionRow, []>(
        `SELECT code, shares, avg_price FROM positions WHERE closed_at IS NULL`,
      )
      .all();

    if (openPositions.length > 0) {
      // Build a price map — market_prices preferred, daily_ohlcv fallback
      const priceRows = db
        .prepare<{ code: string; price: number }, []>(
          `SELECT code, price FROM market_prices
           WHERE price IS NOT NULL AND price > 0
             AND updated_at >= datetime('now', '-3 days')
           UNION ALL
           SELECT code, close AS price FROM daily_ohlcv
           WHERE (code, date) IN (SELECT code, MAX(date) FROM daily_ohlcv GROUP BY code)
             AND code NOT IN (
               SELECT code FROM market_prices
               WHERE price IS NOT NULL AND price > 0
                 AND updated_at >= datetime('now', '-3 days')
             )`,
        )
        .all();
      const priceMap = new Map(priceRows.map((r) => [r.code, r.price]));

      const result = computePortfolioPnl(
        openPositions.map((p) => ({
          code: p.code,
          shares: p.shares,
          avgPrice: p.avg_price,
        })),
        priceMap,
      );

      portfolioPnl = result;

      // Persist snapshot (best-effort)
      try {
        const { savePnlSnapshot } = await import("../../../infrastructure/db/pnlSnapshotStore.js");
        const snapshotDate = todayVietnam();
        savePnlSnapshot(db, snapshotDate, result.items);
      } catch (snapErr) {
        logger.warn("[assembleBriefing] savePnlSnapshot failed", {
          error: snapErr instanceof Error ? snapErr.message : String(snapErr),
        });
      }
    }
  } catch (pnlErr) {
    logger.warn("[assembleBriefing] portfolioPnl step failed", {
      error: pnlErr instanceof Error ? pnlErr.message : String(pnlErr),
    });
  }
  return portfolioPnl;
}
