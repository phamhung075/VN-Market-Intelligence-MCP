/**
 * POLICY_RULES — government policy cascade rule table
 *
 * Extracted from cascadeEngine.ts (FACTORY-DOMAIN-split-cascade-engine, Step 1).
 * Pure data move, no behavior change. Consumed via the cascade/rules barrel.
 *
 * Layer: domain/services
 */

import type { CascadeKeywordRule } from "./cascadeKeywordRule.js";

/**
 * Policy cascade rules: government policy keywords → sector-level impact.
 */
export const POLICY_RULES: CascadeKeywordRule[] = [
  { key: "credit_room_banking", keyword: "room tín dụng", sector: "banking" },
  { key: "interest_rate_banking", keyword: "lãi suất điều hành", sector: "banking" },
  { key: "tax_ttdb_automotive", keyword: "thuế TTĐB", sector: "automotive" },
  { key: "industrial_zone_dev", keyword: "khu công nghiệp", sector: "other" },
  { key: "energy_policy_utilities", keyword: "quy hoạch điện", sector: "utilities" },
  { key: "fit_utilities", keyword: "FIT", sector: "utilities" },
  { key: "realestate_credit_tighten", keyword: "siết tín dụng BĐS", sector: "real_estate" },
  { key: "land_law_realestate", keyword: "luật đất đai", sector: "real_estate" },
  { key: "fta_steel", keyword: "FTA", sector: "steel" },
  { key: "exchange_rate_banking", keyword: "tỷ giá", sector: "banking" },
  { key: "monetary_policy_banking", keyword: "dự trữ bắt buộc", sector: "banking" },
  // Task 1004 — VN stabilization + systemic stress additions
  { key: "sbv_rate_cut_banking", keyword: "hạ lãi suất điều hành", sector: "banking" },
  { key: "sbv_rate_cut_securities", keyword: "nhnn hạ lãi suất", sector: "securities" },
  { key: "fiscal_stimulus_securities", keyword: "gói kích thích tài khóa", sector: "securities" },
  { key: "scic_intervention", keyword: "scic mua vào cổ phiếu", sector: "securities" },
  { key: "systemic_npl_banking", keyword: "nợ xấu hệ thống vượt", sector: "banking" },
  { key: "bank_liquidity_crisis", keyword: "khủng hoảng thanh khoản ngân hàng", sector: "banking" },
  { key: "interbank_rate_spike", keyword: "lãi suất liên ngân hàng tăng đột biến", sector: "banking" },
  { key: "soe_equitisation", keyword: "cổ phần hóa doanh nghiệp nhà nước", sector: "securities" },
  { key: "open_market_operations", keyword: "nghiệp vụ thị trường mở", sector: "banking" },
  { key: "fiscal_capex_emergency", keyword: "tăng đầu tư công khẩn cấp", sector: "construction" },
];
