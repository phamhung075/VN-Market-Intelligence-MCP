/**
 * Morning Briefing — Step 7: macro dashboard (σ-based deviation status).
 *
 * Extracted from assembleBriefing.ts _assembleBriefingImpl (FACTORY-APP-split-assembleBriefing).
 *
 * FIX-ERRAUDIT-W2-MCP-DATALAYER: was a bare best-effort catch → macroSnapshot=[]
 * served as "no macro". Now uses runSectionAsync → tagged-degraded on error,
 * no-data ONLY on genuine empty. Never serves [] as real data.
 *
 * Layer: application/usecases/briefing — may import from application/utils + infrastructure/.
 */
import { logger } from "../../../infrastructure/logger.js";
import { runSectionAsync } from "../../utils/runSection.js";
import type { MacroIndicator } from "./types.js";

/** Query all macro stats and classify each against its σ-based threshold. Degrades to [] on error. */
export async function queryMacroSnapshot(): Promise<MacroIndicator[]> {
  const result = await runSectionAsync(async () => {
    const { getAllMacroStats } = await import("../../../infrastructure/db/macroStatsStore.js");
    const { classifyDeviation } = await import("../../../domain/services/macroThresholds.js");
    const stats = getAllMacroStats();
    return stats.map((s) => {
      const dev = classifyDeviation(s);
      return {
        name: s.name,
        value: s.current,
        unit: s.name.includes("Pct") ? "%" : s.name.includes("usd") ? "USD" : "",
        status: dev.summary,
      };
    });
  }, "assembleBriefing.step7.macroSnapshot");

  if (result.ok) return result.value;
  if (result.reason === "error") {
    logger.warn("[assembleBriefing] step7 macroSnapshot degraded", { ctx: result.ctx });
  }
  // reason:'no-data' = genuine empty (no macro stats yet) — stays [] silently
  return [];
}
