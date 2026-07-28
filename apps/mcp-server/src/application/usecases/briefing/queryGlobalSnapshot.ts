/**
 * Morning Briefing — Step 19: global market snapshot (VIX, DXY, S&P500, Hang Seng).
 *
 * Extracted from assembleBriefing.ts _assembleBriefingImpl (FACTORY-APP-split-assembleBriefing).
 *
 * Layer: application/usecases/briefing — pure query, no side effects.
 */
import type { Database } from "bun:sqlite";
import type { GlobalSnapshot } from "./types.js";

interface CpRow {
  vix: number;
  dxy: number;
  sp500: number;
  hang_seng: number;
  fetched_at: string;
}

/**
 * Query the latest commodity_prices row (+ the previous row for delta
 * arrows). Best-effort: commodity_prices may not exist in all envs, and an
 * all-zero row is treated as absent data (never surfaced as a real snapshot).
 */
export function queryGlobalSnapshot(db: Database): GlobalSnapshot | undefined {
  try {
    const cpRow = db.prepare<CpRow, []>(
      `SELECT vix, dxy, sp500, hang_seng, fetched_at FROM commodity_prices ORDER BY fetched_at DESC LIMIT 1`
    ).get();
    const cpRowPrev = db.prepare<CpRow, []>(
      `SELECT vix, dxy, sp500, hang_seng, fetched_at FROM commodity_prices ORDER BY fetched_at DESC LIMIT 1 OFFSET 1`
    ).get();
    if (cpRow && (cpRow.vix !== 0 || cpRow.dxy !== 0 || cpRow.sp500 !== 0 || cpRow.hang_seng !== 0)) {
      return {
        vix: cpRow.vix,
        dxy: cpRow.dxy,
        sp500: cpRow.sp500,
        hangSeng: cpRow.hang_seng,
        fetchedAt: cpRow.fetched_at,
        ...(cpRowPrev ? {
          prevVix: cpRowPrev.vix,
          prevDxy: cpRowPrev.dxy,
          prevSp500: cpRowPrev.sp500,
          prevHangSeng: cpRowPrev.hang_seng,
        } : {}),
      };
    }
    return undefined;
  } catch {
    // best-effort: commodity_prices may not exist in all envs
    return undefined;
  }
}
