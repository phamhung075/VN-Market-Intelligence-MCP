/**
 * Morning Briefing — Step 12: prediction-market signals (HIGH/CRITICAL only, last 24h).
 *
 * Extracted from assembleBriefing.ts _assembleBriefingImpl (FACTORY-APP-split-assembleBriefing).
 *
 * Layer: application/usecases/briefing — may import from infrastructure/.
 */
import type { Database } from "bun:sqlite";
import { failLoud } from "../../../domain/utils/safeQuery.js";
import type { BriefingPredictionSignal } from "../../../infrastructure/db/predictionStore.js";

/** Query HIGH/CRITICAL prediction-market signals from the last 24h. */
export async function queryPredictionSignals(db: Database): Promise<BriefingPredictionSignal[]> {
  try {
    const { getRecentPredictionSignals } = await import("../../../infrastructure/db/predictionStore.js");
    const allSignals = getRecentPredictionSignals(db, 24);
    return allSignals.filter((s) => s.severity === "high" || s.severity === "critical");
  } catch (err) {
    // FIX-ERRAUDIT-W2-MCP-DATALAYER: was bare catch → silently empty prediction signals
    failLoud(err, "assembleBriefing.step12.predictionSignals");
    return [];
  }
}
