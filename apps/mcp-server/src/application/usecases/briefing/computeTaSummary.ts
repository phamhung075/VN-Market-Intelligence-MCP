/**
 * Morning Briefing — Step 17: TA signals for watchlist tickers (non-neutral only).
 *
 * Extracted from assembleBriefing.ts _assembleBriefingImpl (FACTORY-APP-split-assembleBriefing).
 * Per-ticker TA computation lives in defaultComputeTa.ts — this module is
 * only the watchlist loop + non-neutral filter.
 *
 * Layer: application/usecases/briefing — pure orchestration, no direct DB access.
 */
import type { Database } from "bun:sqlite";
import { logger } from "../../../infrastructure/logger.js";
import { defaultComputeTa } from "./defaultComputeTa.js";
import type { WatchlistRow } from "./queryWatchlistSummary.js";
import type { TaSignal } from "./types.js";

/**
 * Runs `computeTaFn` (defaultComputeTa unless overridden for tests) over
 * every watchlist ticker and keeps only non-neutral signals. Per-ticker
 * failures are skipped silently (one bad ticker must not drop the rest).
 */
export async function computeTaSummary(
  db: Database,
  watchlistRows: WatchlistRow[],
  computeTaFn?: (code: string, db: Database) => TaSignal | null | Promise<TaSignal | null>,
): Promise<TaSignal[]> {
  try {
    const taFn = computeTaFn ?? defaultComputeTa;
    const signals: TaSignal[] = [];
    for (const row of watchlistRows) {
      try {
        const sig = await Promise.resolve(taFn(row.code, db));
        if (sig !== null) signals.push(sig);
      } catch { /* per-ticker failure — skip silently */ }
    }
    return signals.filter(
      (s) => s.rsiStatus !== "neutral" || s.priceVsMa20 !== "neutral",
    );
  } catch (taErr) {
    logger.warn("[assembleBriefing] taSummary step failed", {
      error: taErr instanceof Error ? taErr.message : String(taErr),
    });
    return [];
  }
}
