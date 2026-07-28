/**
 * Morning Briefing — Step 9: auto-tracked commodity indicators (news-mined).
 *
 * Extracted from assembleBriefing.ts _assembleBriefingImpl (FACTORY-APP-split-assembleBriefing).
 *
 * FIX-COMMODITY-WTI-DELTA-CORRUPT (I10): uses listTrackedIndicatorsFromDb()
 * (DSI-MACRO-PHANTOM-STALE-GUARD's isStale flag, 4h threshold) — news-mined
 * indicators like wti_crude_usd have no live fetcher and can freeze for
 * months once a source stops mentioning them. Never silently serve a frozen
 * value as "current" — surface the staleness in the briefing text instead.
 *
 * Layer: application/usecases/briefing — may import from application/utils + infrastructure/.
 */
import type { Database } from "bun:sqlite";
import { logger } from "../../../infrastructure/logger.js";
import { runSectionAsync } from "../../utils/runSection.js";

export interface TrackedCommodityRow {
  indicator: string;
  value: number;
  unit: string;
  dataPoints: number;
  previousValue?: number;
  isStale?: boolean;
}

/** Query auto-tracked commodities with staleness + delta-vs-previous. Degrades to [] on error. */
export async function queryTrackedCommodities(db: Database): Promise<TrackedCommodityRow[]> {
  const result = await runSectionAsync(async () => {
    const { listTrackedIndicatorsFromDb, getIndicatorHistory } = await import(
      "../../../infrastructure/db/commodityTracker.js"
    );
    return listTrackedIndicatorsFromDb(db).map((t) => {
      // Fetch last 2 values for this indicator to compute delta direction.
      // history[0] = latest, history[1] = previous (ordered DESC).
      const history = getIndicatorHistory(t.indicator, 2);
      const previousValue = history.length >= 2 ? history[1]?.value : undefined;
      return {
        indicator: t.indicator,
        value: t.value,
        unit: t.unit,
        dataPoints: t.dataPoints,
        isStale: t.isStale,
        ...(previousValue !== undefined ? { previousValue } : {}),
      };
    });
  }, "assembleBriefing.step9.trackedCommodities");

  if (result.ok) return result.value;
  if (result.reason === "error") {
    logger.warn("[assembleBriefing] step9 trackedCommodities degraded", { ctx: result.ctx });
  }
  return [];
}
