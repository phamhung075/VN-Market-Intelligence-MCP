/**
 * Evening Summary — Step 5: prediction market signals, medium fallback + diag.
 *
 * Extracted from assembleEveningSummary.ts _assembleEveningSummaryImpl
 * (FACTORY-APP-split-assembleEveningSummary).
 *
 * Layer: application/usecases/eveningSummary — may import from infrastructure/.
 */
import type { Database } from "bun:sqlite";
import { logger } from "../../../infrastructure/logger.js";
import type { BriefingPredictionSignal } from "../../../infrastructure/db/predictionStore.js";
import { getRecentPredictionSignals } from "../../../infrastructure/db/predictionStore.js";
import type { PredictionDiag } from "./types.js";

/**
 * Fetches last-24h prediction signals. Prefers HIGH/CRITICAL severity; when
 * none exist, falls back to up to 3 MEDIUM-severity signals. `predictionDiag`
 * always reports the total count fetched (any severity), independent of the
 * severity filter applied to `predictionSignals`.
 */
export async function queryPredictionSignalsStep(
  db: Database,
  getPredictionSignalsFn?: (db: Database, hoursBack: number) => BriefingPredictionSignal[] | Promise<BriefingPredictionSignal[]>,
): Promise<{ predictionSignals: BriefingPredictionSignal[]; predictionDiag: PredictionDiag }> {
  let predictionSignals: BriefingPredictionSignal[] = [];
  let predictionDiag: PredictionDiag = { stored: 0 };
  try {
    const signalsFn = getPredictionSignalsFn ?? getRecentPredictionSignals;
    const allSignals = await signalsFn(db, 24);
    const stored = allSignals.length;
    predictionDiag = { stored };

    const highCritical = allSignals.filter(
      (s) => s.severity === "high" || s.severity === "critical",
    );
    if (highCritical.length > 0) {
      predictionSignals = highCritical;
    } else {
      predictionSignals = allSignals
        .filter((s) => s.severity === "medium")
        .slice(0, 3);
    }
  } catch (err) {
    logger.warn("[assembleEveningSummary] prediction signals query failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return { predictionSignals, predictionDiag };
}
