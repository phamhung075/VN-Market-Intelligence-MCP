/**
 * Evening Summary — Step 6b: global snapshot (VIX / DXY / SP500 / Hang Seng).
 *
 * Extracted from assembleEveningSummary.ts _assembleEveningSummaryImpl
 * (FACTORY-APP-split-assembleEveningSummary).
 *
 * NOTE: deliberately NOT the same query as morning briefing's
 * usecases/briefing/queryGlobalSnapshot.ts — that module orders by
 * `fetched_at DESC` and also returns the previous row for delta arrows; this
 * evening version takes an unordered `LIMIT 1` row and never returns
 * prev-* fields (behavior preserved verbatim from the pre-split
 * assembleEveningSummary.ts).
 *
 * Layer: application/usecases/eveningSummary — pure query, no side effects.
 */
import type { Database } from "bun:sqlite";
import { logger } from "../../../infrastructure/logger.js";
import type { GlobalSnapshot } from "../assembleBriefing.js";

/**
 * Query the (unordered) first commodity_prices row. Best-effort:
 * commodity_prices may not exist in all envs, and an all-zero row is treated
 * as absent data (never surfaced as a real snapshot).
 */
export function queryGlobalSnapshotStep(db: Database): GlobalSnapshot | undefined {
  try {
    const gsRow = db
      .query<
        { vix: number; dxy: number; sp500: number; hang_seng: number; fetched_at: string },
        []
      >("SELECT vix, dxy, sp500, hang_seng, fetched_at FROM commodity_prices LIMIT 1")
      .get();
    if (gsRow && (gsRow.vix !== 0 || gsRow.dxy !== 0 || gsRow.sp500 !== 0)) {
      return {
        vix: gsRow.vix,
        dxy: gsRow.dxy,
        sp500: gsRow.sp500,
        hangSeng: gsRow.hang_seng,
        fetchedAt: gsRow.fetched_at,
      };
    }
    return undefined;
  } catch (gsErr) {
    logger.warn("[assembleEveningSummary] globalSnapshot step failed", {
      error: gsErr instanceof Error ? gsErr.message : String(gsErr),
    });
    return undefined;
  }
}
