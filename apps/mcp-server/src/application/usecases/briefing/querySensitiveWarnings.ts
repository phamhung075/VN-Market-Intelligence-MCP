/**
 * Morning Briefing — Step 8: sensitive date warnings (pure date math, no DB).
 *
 * Extracted from assembleBriefing.ts _assembleBriefingImpl (FACTORY-APP-split-assembleBriefing).
 *
 * Non-data step — failLoud (not a silent swallow) so a failure here is never
 * silently dropped from the briefing.
 *
 * Layer: application/usecases/briefing — may import from domain/.
 */
import { failLoud } from "../../../domain/utils/safeQuery.js";

/** Compute sensitive-date warnings. Returns [] (with a failLoud log) on error. */
export async function querySensitiveWarnings(): Promise<string[]> {
  try {
    const { detectSensitiveDates } = await import(
      "../../../domain/services/financial-reports/priceNewsValidator.js"
    );
    return detectSensitiveDates();
  } catch (err) {
    failLoud(err, "assembleBriefing.step8.sensitiveWarnings");
    return [];
  }
}
