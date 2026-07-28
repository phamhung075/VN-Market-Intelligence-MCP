/**
 * Morning Briefing — Step 11: top conviction signal from the watchlist.
 *
 * Extracted from assembleBriefing.ts _assembleBriefingImpl (FACTORY-APP-split-assembleBriefing).
 *
 * Layer: application/usecases/briefing — may import from domain/ + application/services.
 */
import type { Database } from "bun:sqlite";
import { failLoud } from "../../../domain/utils/safeQuery.js";
import type { WatchlistRow } from "./queryWatchlistSummary.js";
import type { TopConviction } from "./types.js";

/**
 * Scans watchlist rows for the highest-scoring non-weak conviction signal,
 * blending in the IMF macro dimension when available (never fabricates a
 * score when the macro dimension is unavailable — dimension is dropped).
 */
export async function computeTopConviction(
  db: Database,
  watchlistRows: WatchlistRow[],
): Promise<TopConviction | null> {
  let topConviction: TopConviction | null = null;
  try {
    const { computeConviction } = await import("../../../domain/services/convictionScorer.js");
    const { getImfMacroScoreForConviction } = await import("../../services/imfConvictionBridge.js");

    // Dimension 7: IMF macro — returns number|undefined (never fabricates 0).
    // undefined = drop-dimension (DB error or no fresh rows).
    const briefingImfScore: number | undefined = getImfMacroScoreForConviction(db);

    let bestScore = 0;

    for (const stock of watchlistRows) {
      if (stock.price == null || stock.change_pct == null) continue;
      const result = computeConviction({
        code: stock.code,
        changePct: stock.change_pct,
        ...(briefingImfScore !== undefined ? { imfMacroScore: briefingImfScore } : {}),
      });
      if (result.score > bestScore && result.level !== "weak") {
        bestScore = result.score;
        topConviction = {
          code: result.code,
          score: result.score,
          direction: result.direction,
          summary: result.summary,
        };
      }
    }
  } catch (err) {
    // FIX-ERRAUDIT-W2-MCP-DATALAYER: was bare catch → silently no topConviction
    failLoud(err, "assembleBriefing.step11.topConviction");
  }
  return topConviction;
}
