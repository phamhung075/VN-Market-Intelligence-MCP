/**
 * MSCI_WATCHLIST_RULES — MSCI watchlist cascade rule table
 *
 * Extracted from cascadeEngine.ts (FACTORY-DOMAIN-split-cascade-engine, Step 1).
 * Pure data move, no behavior change. Consumed via the cascade/rules barrel.
 *
 * Layer: domain/services
 */

import type { CascadeKeywordRule } from "./cascadeKeywordRule.js";

/**
 * MSCI watchlist cascade rules: News about Vietnam being added to MSCI watchlist.
 *
 * Business logic:
 *   - MSCI watchlist (precursor step) = early signal for potential full inclusion
 *   - Triggers passive fund allocation planning before formal inclusion decision
 *   - Keywords: "danh sách theo dõi msci" (watchlist), "watchlist", "xem xét nâng hạng" (consider upgrade)
 *   - Targets large-cap stocks (all_largecp pseudo-sector)
 *
 * Task 1329: MSCI watchlist cascade rules
 */
export const MSCI_WATCHLIST_RULES: CascadeKeywordRule[] = [
  { key: "msci_watchlist_1", keyword: "danh sách theo dõi msci", sector: "all_largecp" },
  { key: "msci_watchlist_2", keyword: "msci watchlist", sector: "all_largecp" },
  { key: "msci_watchlist_3", keyword: "xem xét nâng hạng msci", sector: "all_largecp" },
];
