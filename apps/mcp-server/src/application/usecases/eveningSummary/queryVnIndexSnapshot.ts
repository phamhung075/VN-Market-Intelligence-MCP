/**
 * Evening Summary — Step 0: VN-Index snapshot (best-effort, front-loaded).
 *
 * Extracted from assembleEveningSummary.ts _assembleEveningSummaryImpl
 * (FACTORY-APP-split-assembleEveningSummary).
 *
 * Layer: application/usecases/eveningSummary — may import from infrastructure/.
 */
import type { Database } from "bun:sqlite";
import { logger } from "../../../infrastructure/logger.js";
import type { VnIndexSnapshot } from "./types.js";

/**
 * Default: read VNINDEX from market_prices (VPS-pushed every 60s) — avoids
 * geo-blocked live fetch from France. `fetchVnIndexFn` overrides this default
 * for test injection (or e.g. hose.ts for local dev).
 *
 * Errors are caught and logged; returns undefined rather than throwing.
 */
export async function queryVnIndexSnapshot(
  db: Database,
  fetchVnIndexFn?: () => Promise<import("../../../infrastructure/fetchers/hose.js").MarketPrice | null>,
): Promise<VnIndexSnapshot | undefined> {
  try {
    if (fetchVnIndexFn) {
      // Test-injected or custom fetch path (e.g. hose.ts for local dev)
      const mp = await fetchVnIndexFn();
      if (mp !== null) {
        return {
          close: mp.price,
          change: Math.round(mp.price - mp.previousPrice),
          changePct: Math.round(mp.changePct * 100) / 100,
          fetchedAt: mp.fetchedAt,
        };
      }
      return undefined;
    }

    // Default: read VNINDEX from market_prices (VPS-pushed every 60s)
    // Compute cutoff date dynamically to handle date-driven tests properly
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const cutoffDateStr = threeDaysAgo.toISOString().split('T')[0]!;
    const row = db
      .prepare<{ price: number; change_pct: number; updated_at: string }, [string]>(
        `SELECT price, change_pct, updated_at
         FROM market_prices
         WHERE code = 'VNINDEX'
           AND date(updated_at) >= ?
         LIMIT 1`,
      )
      .get(cutoffDateStr);
    if (row !== null && row !== undefined) {
      return {
        close: row.price,
        change: Math.round(row.price * row.change_pct / 100),
        changePct: Math.round(row.change_pct * 100) / 100,
        fetchedAt: row.updated_at,
      };
    }
    return undefined;
  } catch (err) {
    logger.warn("[assembleEveningSummary] vnIndex step failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}
