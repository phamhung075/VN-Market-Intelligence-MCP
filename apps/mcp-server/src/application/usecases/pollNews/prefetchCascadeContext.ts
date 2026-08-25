/**
 * Prefetch cascade context — Poll News (FACTORY-APP-split-pollNews, stage 3:
 * cascade/alert-generation)
 *
 * Loads the macro data (σ-deviation stats + live commodity/SBV context) and
 * the broadcast-floor config ONCE per poll cycle, so the per-entry cascade
 * loop never re-fetches them (avoids 95× HTTP calls for a 95-article batch).
 *
 * Split out of pollNews.ts's pollNews() body (previously inline, lines
 * 230-265 of the pre-stage-3 orchestrator).
 *
 * Layer: application/usecases — may import from domain/ and infrastructure/.
 */

import type { MacroContext } from "../../../domain/services/cascadeEngine.js";
import { DEFAULT_BROADCAST_MIN_IMPACT } from "../../../domain/services/cascadeEngine.js";
import type { MacroStats } from "../../../domain/services/macroThresholds.js";

export interface CascadeContext {
  macroStats: MacroStats[];
  macroContext: MacroContext | null;
  broadcastMinImpact: number;
}

/**
 * Pre-fetch macro σ-stats, live macro context (commodity/SBV), and the
 * broadcast-floor config for one poll cycle's cascade batch. Every source is
 * independently best-effort — a failure on one leaves the others populated
 * and falls back to an empty/null/default value, never aborts the cycle.
 */
export async function prefetchCascadeContext(): Promise<CascadeContext> {
  // Pre-fetch macro data ONCE for the whole batch (avoid 95× HTTP calls)
  let macroStats: MacroStats[] = [];
  let macroContext: MacroContext | null = null;
  try {
    const { getAllMacroStats } = await import("../../../infrastructure/db/macroStatsStore.js");
    macroStats = getAllMacroStats();
  } catch { /* no σ data yet */ }
  // CI-NETWORK-SKIP-GUARDS: skip live macro HTTP fetches in CI to avoid ETIMEDOUT.
  if (Bun.env.CI !== "true") try {
    const { fetchYahooFinancePrices } = await import("../../../infrastructure/fetchers/yahooFinance.js");
    const { fetchSbvRates } = await import("../../../infrastructure/fetchers/sbv.js");
    const [commodity, sbv] = await Promise.allSettled([fetchYahooFinancePrices(), fetchSbvRates()]);
    macroContext = {
      brentCrudeUSD: commodity.status === "fulfilled" ? commodity.value?.brentCrudeUSD ?? null : null,
      goldUSDPerOz: commodity.status === "fulfilled" ? commodity.value?.goldUSDPerOz ?? null : null,
      usdVndMarket: commodity.status === "fulfilled" ? commodity.value?.usdVndRate ?? null : null,
      refinancingRatePct: sbv.status === "fulfilled" ? sbv.value?.refinancingRatePct ?? null : null,
      overnightRatePct: sbv.status === "fulfilled" ? sbv.value?.overnightRatePct ?? null : null,
      usdVndOfficial: sbv.status === "fulfilled" ? sbv.value?.usdVndOfficial ?? null : null,
      // new risk-off fields (sprint 188, FR-7)
      vix:      commodity.status === "fulfilled" ? commodity.value?.vix      ?? null : null,
      sp500:    commodity.status === "fulfilled" ? commodity.value?.sp500    ?? null : null,
      dxy:      commodity.status === "fulfilled" ? commodity.value?.dxy      ?? null : null,
      hangSeng: commodity.status === "fulfilled" ? commodity.value?.hangSeng ?? null : null,
    };
  } catch { /* no macro context */ }

  // Load broadcastMinImpact ("broadcast floor") from config once for the
  // whole batch (falls back to the domain SSOT default on failure or
  // missing config key).
  let broadcastMinImpact = DEFAULT_BROADCAST_MIN_IMPACT;
  try {
    const { loadMcpConfig } = await import("../../../infrastructure/config.js");
    const cfg = loadMcpConfig();
    broadcastMinImpact = cfg.alerts?.marketWideCascadeMinImpact ?? DEFAULT_BROADCAST_MIN_IMPACT;
  } catch { /* use default */ }

  return { macroStats, macroContext, broadcastMinImpact };
}
