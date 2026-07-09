/**
 * MSCI_INCLUSION_RULES — MSCI index-inclusion cascade rule table
 *
 * Extracted from cascadeEngine.ts (FACTORY-DOMAIN-split-cascade-engine, Step 1).
 * Pure data move, no behavior change. Consumed via the cascade/rules barrel.
 *
 * Layer: domain/services
 */

import type { CascadeKeywordRule } from "./cascadeKeywordRule.js";

/**
 * MSCI inclusion cascade rules: News about MSCI index inclusion eligibility.
 *
 * Business logic:
 *   - MSCI index inclusion is a major bullish catalyst (proven multi-quarter price impact)
 *   - Affects large-cap stocks across all sectors (cross-sector, not sector-specific)
 *   - Keywords: "nộp danh sách" (submit list), "đáp ứng tiêu chí" (meet criteria), "chỉ số msci" (MSCI index)
 *   - Targets "all_largecp" pseudo-sector (application layer filters watchlist to large-cap only)
 *
 * Contrast with INSIDER_DUMP_RULES:
 *   - Insider dump: bearish, sector-specific (banking), peer contagion
 *   - MSCI inclusion: bullish, cross-sector, large-cap specific (no peer cascade)
 *
 * Task 1279: MSCI inclusion cascade detection + application integration
 */
export const MSCI_INCLUSION_RULES: CascadeKeywordRule[] = [
  { key: "msci_large_cap_1", keyword: "nộp danh sách", sector: "all_largecp" },
  { key: "msci_large_cap_2", keyword: "đáp ứng tiêu chí", sector: "all_largecp" },
  { key: "msci_large_cap_3", keyword: "chỉ số msci", sector: "all_largecp" },
];
