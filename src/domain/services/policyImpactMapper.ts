/**
 * Policy Impact Mapper — Task 241
 *
 * Pure domain service that classifies Vietnamese government policy text
 * (Nghị định, Thông tư, Quyết định) into structured PolicySignal objects
 * with affected sectors and stocks.
 *
 * Design rules:
 * - Zero imports from infrastructure/ or application/ (DDD: domain-only)
 *   Exception: TelegramMessageFactory (pure utility for string truncation, Task 1300b)
 * - No I/O, no side effects, no async
 * - DomainType sourced from bctc-schema.ts (root-level, permitted structural import)
 */

import type { DomainType } from "../../../bctc-schema.js";
import type { ImpactDirection } from "./newsNormalizer.js";
import { TelegramMessageFactory } from "../../infrastructure/notifiers/telegramMessageFactory.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type PolicyType =
  | "credit_policy"
  | "tax_change"
  | "industrial_zone"
  | "energy_policy"
  | "real_estate_policy"
  | "trade_policy"
  | "monetary_policy"
  | "legal_risk";

export interface PolicySignal {
  /** Category of policy document */
  policyType: PolicyType;
  /** Sectors affected by this policy */
  affectedSectors: DomainType[];
  /** Specific stocks most directly affected */
  affectedStocks: string[];
  /** Expected market impact direction */
  direction: ImpactDirection;
  /** Human-readable summary of the policy impact */
  summary: string;
  /** 0..1 confidence in the classification */
  confidence: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Policy-sector mapping
// ─────────────────────────────────────────────────────────────────────────────

interface PolicyRule {
  policyType: PolicyType;
  keywords: string[];
  sectors: DomainType[];
  stocks: string[];
  defaultDirection: ImpactDirection;
  negativeKeywords?: string[];
  summaryTemplate: string;
}

/**
 * Criminal prosecution exclusion keywords — Vietnamese legal proceedings.
 * If any of these appear in the combined text, the article is about a legal
 * prosecution of a person, NOT a monetary or credit policy change.
 *
 * Task 1210: must be checked BEFORE the monetary_policy rule to prevent
 * misclassification of banker arrest/prosecution articles.
 */
const CRIMINAL_PROSECUTION_KEYWORDS: string[] = [
  "khởi tố",
  "khoi to",
  "bắt giữ",
  "bat giu",
  "truy tố",
  "truy to",
  "xét xử",
  "xet xu",
  "bắt tạm giam",
  "bat tam giam",
  "bị can",
  "bi can",
  "bị cáo",
  "bi cao",
  "cơ quan điều tra",
  "co quan dieu tra",
  "cảnh sát điều tra",
  "canh sat dieu tra",
  "viện kiểm sát",
  "vien kiem sat",
  "tòa án",
  "toa an",
];

const POLICY_RULES: PolicyRule[] = [
  // ── LEGAL_RISK — must be FIRST to prevent criminal articles being mis-classified
  // as monetary_policy when they contain "lãi suất" in the banking-crime context.
  // Task 1210: any criminal prosecution keyword → legal_risk.
  {
    policyType: "legal_risk",
    keywords: CRIMINAL_PROSECUTION_KEYWORDS,
    sectors: ["banking"],
    stocks: [],
    defaultDirection: "down",
    summaryTemplate: "Rủi ro pháp lý — khởi tố/xét xử liên quan ngành ngân hàng",
  },
  {
    policyType: "credit_policy",
    keywords: ["room tín dụng", "lãi suất điều hành", "tăng trưởng tín dụng", "hạn mức tín dụng"],
    sectors: ["banking"],
    stocks: ["VCB", "BID", "CTG", "TCB"],
    defaultDirection: "neutral",
    negativeKeywords: ["siết", "giảm room", "hạn chế tín dụng"],
    summaryTemplate: "Chính sách tín dụng ảnh hưởng đến ngành ngân hàng",
  },
  {
    policyType: "tax_change",
    keywords: ["thuế TTĐB", "thuế nhập khẩu", "thuế xuất khẩu", "thuế tiêu thụ đặc biệt"],
    sectors: ["automotive", "other"],
    stocks: ["SAB", "VBL", "VEA"],
    defaultDirection: "neutral",
    negativeKeywords: ["tăng thuế", "áp thuế", "nâng thuế"],
    summaryTemplate: "Thay đổi chính sách thuế ảnh hưởng đến sản xuất và tiêu dùng",
  },
  {
    policyType: "industrial_zone",
    keywords: ["khu công nghiệp", "KCN", "phê duyệt KCN", "quy hoạch khu công nghiệp"],
    sectors: ["other"],
    stocks: ["IDC", "KBC", "SZC"],
    defaultDirection: "up",
    summaryTemplate: "Chính sách khu công nghiệp tạo cơ hội thu hút FDI",
  },
  {
    policyType: "energy_policy",
    keywords: ["quy hoạch điện", "giá FIT", "biểu giá FIT", "cơ chế FIT", "năng lượng tái tạo", "điện mặt trời", "điện gió"],
    sectors: ["utilities", "oil_gas"],
    stocks: ["GEG", "REE", "PC1"],
    defaultDirection: "neutral",
    summaryTemplate: "Chính sách năng lượng ảnh hưởng đến ngành điện và dầu khí",
  },
  {
    policyType: "real_estate_policy",
    keywords: ["siết tín dụng BĐS", "luật đất đai", "quy hoạch đô thị", "tín dụng bất động sản"],
    sectors: ["real_estate"],
    stocks: ["VHM", "NVL", "KDH"],
    defaultDirection: "neutral",
    negativeKeywords: ["siết", "hạn chế", "kiểm soát"],
    summaryTemplate: "Chính sách bất động sản ảnh hưởng đến ngành địa ốc",
  },
  {
    policyType: "trade_policy",
    keywords: ["FTA", "thuế quan", "hàng rào thương mại", "hiệp định thương mại"],
    sectors: ["steel", "agriculture"],
    stocks: ["HPG", "MPC", "ANV"],
    defaultDirection: "up",
    negativeKeywords: ["hàng rào", "chống bán phá giá", "trả đũa thương mại"],
    summaryTemplate: "Chính sách thương mại ảnh hưởng đến xuất nhập khẩu",
  },
  {
    policyType: "monetary_policy",
    keywords: ["lãi suất", "tỷ giá", "dự trữ bắt buộc", "chính sách tiền tệ"],
    sectors: ["banking"],
    stocks: ["VCB", "BID", "CTG"],
    defaultDirection: "neutral",
    summaryTemplate: "Chính sách tiền tệ ảnh hưởng đến hệ thống ngân hàng",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function normalizeForMatch(s: string): string {
  return s.toLowerCase().trim();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Check if text contains any of the given keywords.
 * Short keywords (≤4 chars) use word-boundary matching to avoid
 * false positives (e.g. "FIT" matching inside "profit").
 */
function hasKeyword(normText: string, keywords: string[]): boolean {
  return keywords.some((kw) => {
    const normKw = normalizeForMatch(kw);
    if (normKw.length <= 4) {
      // Word-boundary match for short keywords to avoid substring false positives
      const re = new RegExp(`(?:^|[\\s,;.()\\[\\]"'])${escapeRegex(normKw)}(?:$|[\\s,;.()\\[\\]"'])`, "u");
      return re.test(normText);
    }
    return normText.includes(normKw);
  });
}

function resolveDirection(normText: string, rule: PolicyRule): ImpactDirection {
  if (rule.negativeKeywords && hasKeyword(normText, rule.negativeKeywords)) {
    return "down";
  }
  return rule.defaultDirection;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Classify a policy document by type and map to affected sectors/stocks.
 *
 * Scans combined title + body text for known policy keywords.
 * Returns the first matching rule's PolicySignal, or null if no match.
 *
 * @param title - Policy document title
 * @param body  - Policy document body text or summary
 * @returns     - PolicySignal if a known policy type is detected, null otherwise
 */
export function classifyPolicy(title: string, body: string): PolicySignal | null {
  if (!title && !body) return null;

  const combined = `${title} ${body}`;
  const normText = normalizeForMatch(combined);

  for (const rule of POLICY_RULES) {
    if (!hasKeyword(normText, rule.keywords)) continue;

    const direction = resolveDirection(normText, rule);
    const formattedBody = TelegramMessageFactory.formatPolicySummary(body.trim());

    return {
      policyType: rule.policyType,
      affectedSectors: rule.sectors,
      affectedStocks: rule.stocks,
      direction,
      summary: `${rule.summaryTemplate} — ${title.trim() || formattedBody}`,
      confidence: 0.75,
    };
  }

  return null;
}
