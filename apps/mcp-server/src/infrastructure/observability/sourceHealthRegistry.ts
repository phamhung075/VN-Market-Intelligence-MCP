/**
 * Source Health Registry — Infrastructure Layer
 *
 * Holds the process-wide SourceHealthTracker singleton — a stateful,
 * cross-cutting in-memory registry written to by the application layer
 * (pollNews.ts) and infrastructure fetchers (tradingEconomicsChromium.ts),
 * and read by the interface layer (systemTools.ts) for the
 * `get_system_status` MCP tool. A stateful cross-cutting singleton like this
 * belongs in the infrastructure layer, not the interface layer — the
 * interface layer renders output; it should not own shared runtime state
 * that application/infrastructure code depends on.
 *
 * FACTORY-APP-pollNews-layering-fix (2026-07-24): relocated verbatim from
 * interface/mcp/tools/news-analysis/sourceHealthTools.ts, which previously
 * defined this singleton (a documented Fence-B violation — see
 * apps/mcp-server/eslint.config.mjs). Pure relocation — singleton semantics
 * (module-singleton via a globalThis stash, same seeded/disabled sources,
 * same reset behavior) are unchanged from the original interface-layer copy.
 * `formatSourceHealthTable` / `registerSourceHealthTools` (pure rendering
 * helpers, no state) remain in sourceHealthTools.ts — only the stateful
 * tracker singleton moved.
 *
 * @module infrastructure/observability/sourceHealthRegistry
 */

import { SourceHealthTracker } from "../../domain/services/sourceHealthTracker.js";

// ─────────────────────────────────────────────────────────────────────────────
// Singleton tracker — shared across the process lifetime
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Global singleton instance of SourceHealthTracker.
 *
 * Stashed on `globalThis` so that `bun --hot` module reloads do NOT wipe
 * the in-memory health state. Without this, every hot-reload of pollNews.ts
 * (or any module that transitively re-imports this module) creates
 * a fresh tracker with `lastSuccessAt = null` for all sources, causing the
 * SOURCE HEALTH table to show "Chưa bao giờ" even though fetchers are running
 * successfully (regression reported in Loop #36, report 1003).
 *
 * Application-layer modules (e.g. pollNews.ts) import and use this directly:
 *
 * ```typescript
 * import { globalSourceTracker } from '../../infrastructure/observability/sourceHealthRegistry.js';
 * globalSourceTracker.recordSuccess("CafeF RSS");
 * ```
 */
const GLOBAL_TRACKER_KEY = "__vnMarketSourceHealthTracker__";
type GlobalWithTracker = typeof globalThis & {
  [GLOBAL_TRACKER_KEY]?: SourceHealthTracker;
};
const _g = globalThis as GlobalWithTracker;
export const globalSourceTracker: SourceHealthTracker =
  _g[GLOBAL_TRACKER_KEY] ?? (_g[GLOBAL_TRACKER_KEY] = new SourceHealthTracker());

// Pre-seed the 5 known news sources so get_system_status / get_source_health
// return rows immediately on a fresh process — before the first pollNews
// tick has fired. The names match what pollNews uses in its sourceEntries.
// Sprint 1833g: Reuters RSS and Trading Economics (legacy stream) removed from
// default seeds — both sources are permanently disabled in pollNews resolvedFetchers.
// Trading Economics News (Chromium scraper) remains active.
globalSourceTracker.seedKnownSources([
  "CafeF RSS",
  "VnExpress RSS",
  "VnEconomy RSS",
  "Trading Economics News",
]);
// Task 1898b: mark permanently-disabled legacy sources as "disabled" (not "Ngưng").
// Reuters RSS fetcher was removed from resolvedFetchers defaults in Sprint 1833g.
// Trading Economics (legacy stream) was also permanently disabled in Sprint 1833g.
// Calling recordDisabled() here mirrors the newsapi | disabled display pattern and
// prevents ghost "Ngưng | 20" entries from misleading operators on a fresh process start.
globalSourceTracker.recordDisabled("Reuters RSS");
globalSourceTracker.recordDisabled("Trading Economics");

/**
 * Test-only reset for the global source health tracker.
 *
 * Clears all accumulated failure/success state from the globalSourceTracker
 * singleton. The existing object reference is preserved (no replacement) so
 * all code that imports `globalSourceTracker` sees the cleared state.
 *
 * Called by pollNews._resetAllDarkAlert so that any test using that hook
 * also gets clean source-health state between tests.
 *
 * @internal — do NOT call from production paths.
 */
export function _resetGlobalSourceTracker(): void {
  globalSourceTracker._reset();
  // Re-seed known sources so getAllHealth() returns rows immediately after reset.
  // Sprint 1833g: Reuters RSS and Trading Economics (legacy) removed from seeds.
  globalSourceTracker.seedKnownSources([
    "CafeF RSS",
    "VnExpress RSS",
    "VnEconomy RSS",
    "Trading Economics News",
  ]);
}
