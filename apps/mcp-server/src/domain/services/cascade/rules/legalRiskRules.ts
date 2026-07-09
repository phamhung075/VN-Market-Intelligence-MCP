/**
 * LEGAL_RISK_RULES — legal risk cascade rule table
 *
 * Extracted from cascadeEngine.ts (FACTORY-DOMAIN-split-cascade-engine, Step 1).
 * Pure data move, no behavior change. Consumed via the cascade/rules barrel.
 *
 * Layer: domain/services
 */

import type { CascadeKeywordRule } from "./cascadeKeywordRule.js";

/**
 * Legal risk cascade rules: news with these keywords → sector-level impact.
 */
export const LEGAL_RISK_RULES: CascadeKeywordRule[] = [
  { key: "prosecution_banking", keyword: "khởi tố", sector: "banking" },
  { key: "prosecution_realestate", keyword: "khởi tố", sector: "real_estate" },
  { key: "asset_freeze_realestate", keyword: "phong tỏa tài sản", sector: "real_estate" },
  { key: "asset_freeze_banking", keyword: "kê biên", sector: "banking" },
  { key: "tax_penalty_all", keyword: "truy thu thuế", sector: "other" },
  { key: "license_revocation_realestate", keyword: "thu hồi giấy phép", sector: "real_estate" },
  { key: "anti_dumping_steel", keyword: "chống bán phá giá", sector: "steel" },
  { key: "anti_dumping_agriculture", keyword: "anti-dumping", sector: "agriculture" },
  { key: "investigation_securities", keyword: "điều tra", sector: "securities" },
  { key: "administrative_penalty", keyword: "xử phạt hành chính", sector: "other" },
];
