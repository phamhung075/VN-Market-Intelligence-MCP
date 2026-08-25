/**
 * Evening Summary — Step 7: persist step. Writes the assembled summary to
 * `reportsDir/<date>-evening.json` (overwrites on re-run).
 *
 * Extracted from assembleEveningSummary.ts _assembleEveningSummaryImpl
 * (FACTORY-APP-split-assembleEveningSummary).
 *
 * Layer: application/usecases/eveningSummary — infrastructure fs access, best-effort.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { logger } from "../../../infrastructure/logger.js";

/**
 * Generic over the caller's summary shape (kept decoupled from
 * assembleEveningSummary.ts's EveningSummary to avoid a reverse import —
 * this module only needs a `date` field to name the output file).
 */
export interface PersistableEveningSummary {
  date: string;
}

/** Persist `summary` to `reportsDir/<summary.date>-evening.json`. Failure is logged, never thrown. */
export function persistEveningSummary<T extends PersistableEveningSummary>(summary: T, reportsDir: string): void {
  try {
    mkdirSync(reportsDir, { recursive: true });
    const filePath = join(reportsDir, `${summary.date}-evening.json`);
    writeFileSync(filePath, JSON.stringify(summary, null, 2), "utf-8");
    logger.info("[assembleEveningSummary] summary persisted", { filePath });
  } catch (err) {
    logger.warn("[assembleEveningSummary] failed to persist summary", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
