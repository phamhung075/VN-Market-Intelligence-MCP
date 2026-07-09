/**
 * MSCI_EXCLUSION_RULES — MSCI index-exclusion cascade rule table
 *
 * Extracted from cascadeEngine.ts (FACTORY-DOMAIN-split-cascade-engine, Step 1).
 * Pure data move, no behavior change. Consumed via the cascade/rules barrel.
 *
 * Layer: domain/services
 */

import type { CascadeKeywordRule } from "./cascadeKeywordRule.js";

/**
 * MSCI exclusion cascade rules: News about Vietnam being removed from MSCI index.
 *
 * Business logic:
 *   - MSCI exclusion = forced selling, large passive fund outflows
 *   - Negative catalyst for all stocks, especially large-caps with heavy foreign ownership
 *   - Keywords: "loại khỏi msci" (removed), "msci loại việt nam" (MSCI removes Vietnam), "bị xóa khỏi" (deleted from)
 *   - Targets large-cap stocks (all_largecp pseudo-sector)
 *   - Direction: bearish (opposite of inclusion)
 *
 * Task 1329: MSCI exclusion cascade rules
 */
export const MSCI_EXCLUSION_RULES: CascadeKeywordRule[] = [
  { key: "msci_exclusion_1", keyword: "loại khỏi msci", sector: "all_largecp" },
  { key: "msci_exclusion_2", keyword: "msci loại việt nam", sector: "all_largecp" },
  { key: "msci_exclusion_3", keyword: "bị xóa khỏi chỉ số", sector: "all_largecp" },
];
