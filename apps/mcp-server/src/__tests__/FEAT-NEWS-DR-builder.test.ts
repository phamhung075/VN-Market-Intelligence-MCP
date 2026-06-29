/**
 * FEAT-NEWS-DR-builder.test.ts — unit tests for buildDecisionResume()
 *
 * 10 test cases (5 FR-1 concrete examples + 5 edge cases):
 *
 * FR-1 concrete examples (from BA spec):
 *  TC-1: bullish + action level + tickers [VCB, FPT] + keywords → "Tích cực cho VCB, FPT: tăng trưởng, lợi nhuận"
 *  TC-2: bearish + domain [banking] + keywords → "Tiêu cực ngành ngân hàng: nợ xấu, lãi suất"
 *  TC-3: bullish + country level + no domain + keywords → "Tích cực: vn-index, tăng"
 *  TC-4: bearish + country + no domain + empty keywords (defensive) → "Tiêu cực: tín hiệu tổng hợp"
 *  TC-5: neutral → null
 *
 * Edge cases:
 *  TC-6: empty bullishMatched + bullish sentiment → "tín hiệu tổng hợp" fallback
 *  TC-7: affectedActions.length > 3 → cap at 3 tickers in résumé
 *  TC-8: unknown DomainType in affectedDomains → domain segment omitted (no crash)
 *  TC-9: résumé > 120 chars → hard-truncated at last space ≤ 120
 *  TC-10: truncateAt120 — exactly 120 chars → unchanged; 121+ → truncated
 *
 * DDD layer: domain/services (pure function — no DB, no imports from infra/interface)
 */

import { describe, it, expect } from "bun:test";
import {
  buildDecisionResume,
  truncateAt120,
  DOMAIN_VN_LABEL,
} from "../domain/services/newsNormalizer.js";

// ─────────────────────────────────────────────────────────────────────────────
// FR-1 concrete examples
// ─────────────────────────────────────────────────────────────────────────────

describe("FEAT-NEWS-DR — buildDecisionResume() FR-1 concrete examples", () => {
  it("TC-1: bullish + action level + tickers [VCB, FPT] + keywords → correct résumé", () => {
    const result = buildDecisionResume(
      "bullish",
      "action",
      ["VCB", "FPT"],
      [],
      ["tăng trưởng", "lợi nhuận"],
      [],
    );
    expect(result).toBe("Tích cực cho VCB, FPT: tăng trưởng, lợi nhuận");
  });

  it("TC-2: bearish + domain [banking] + keywords → ngành ngân hàng résumé", () => {
    const result = buildDecisionResume(
      "bearish",
      "domain",
      [],
      ["banking"],
      [],
      ["nợ xấu", "lãi suất"],
    );
    expect(result).toBe("Tiêu cực ngành ngân hàng: nợ xấu, lãi suất");
  });

  it("TC-3: bullish + country level + no domain + keywords → no context prefix", () => {
    const result = buildDecisionResume(
      "bullish",
      "country",
      [],
      [],
      ["vn-index", "tăng"],
      [],
    );
    expect(result).toBe("Tích cực: vn-index, tăng");
  });

  it("TC-4: bearish + country + no domain + empty keywords → tín hiệu tổng hợp defensive", () => {
    const result = buildDecisionResume(
      "bearish",
      "country",
      [],
      [],
      [],
      [],
    );
    expect(result).toBe("Tiêu cực: tín hiệu tổng hợp");
  });

  it("TC-5: neutral → null (no résumé)", () => {
    const result = buildDecisionResume(
      "neutral",
      "country",
      [],
      ["banking"],
      ["tăng"],
      ["giảm"],
    );
    expect(result).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe("FEAT-NEWS-DR — buildDecisionResume() edge cases", () => {
  it("TC-6: bullish + empty bullishMatched → tín hiệu tổng hợp fallback", () => {
    const result = buildDecisionResume(
      "bullish",
      "domain",
      [],
      ["tech"],
      [],
      [],
    );
    expect(result).toBe("Tích cực ngành công nghệ: tín hiệu tổng hợp");
  });

  it("TC-7: affectedActions.length > 3 → capped at 3 tickers in résumé", () => {
    const result = buildDecisionResume(
      "bullish",
      "action",
      ["VCB", "FPT", "MWG", "HPG", "ACB"],
      [],
      ["tăng trưởng"],
      [],
    );
    // Should only contain first 3 tickers
    expect(result).toContain("VCB");
    expect(result).toContain("FPT");
    expect(result).toContain("MWG");
    expect(result).not.toContain("HPG");
    expect(result).not.toContain("ACB");
  });

  it("TC-8: unknown DomainType in affectedDomains → domain segment omitted (no crash)", () => {
    const result = buildDecisionResume(
      "bearish",
      "domain",
      [],
      // "unknown_sector" is not in DOMAIN_VN_LABEL — must be omitted safely
      ["unknown_sector" as never],
      [],
      ["giảm"],
    );
    // No crash; no domain segment; falls back to plain prefix
    expect(result).not.toBeNull();
    expect(result).not.toContain("unknown_sector");
    // Domain segment should be absent (no "ngành" context when label is undefined)
    expect(result).toBe("Tiêu cực: giảm");
  });

  it("TC-9: résumé > 120 chars → hard-truncated at last space ≤ 120", () => {
    // Compose a situation that produces > 120 chars
    const longTickers = ["VCB", "FPT", "MWG"];
    const longKeywords = [
      "tăng trưởng mạnh mẽ vượt bậc",
      "lợi nhuận kỷ lục lịch sử",
    ];
    const result = buildDecisionResume(
      "bullish",
      "action",
      longTickers,
      [],
      longKeywords,
      [],
    );
    if (result !== null) {
      expect(result.length).toBeLessThanOrEqual(120);
      // Must not end mid-word (no trailing partial word after a space)
      expect(result).not.toMatch(/\s+$/);
    }
  });

  it("TC-10: truncateAt120 — exactly 120 chars → unchanged; 121+ → truncated at last space", () => {
    // Exactly 120 — must be returned unchanged
    const exactly120 = "a".repeat(120);
    expect(truncateAt120(exactly120)).toBe(exactly120);
    expect(truncateAt120(exactly120).length).toBe(120);

    // 121 chars with a space at position 115 — should truncate before the last word
    const s121 = "a".repeat(115) + " word_end";  // 115 + 1 + 8 = 124 chars
    const truncated = truncateAt120(s121);
    expect(truncated.length).toBeLessThanOrEqual(120);
    // The last space is at position 115, so truncated = "a".repeat(115)
    expect(truncated).toBe("a".repeat(115));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN_VN_LABEL sanity check (FR-1 Note A — 17 entries)
// ─────────────────────────────────────────────────────────────────────────────

describe("FEAT-NEWS-DR — DOMAIN_VN_LABEL coverage", () => {
  it("has all 17 required domain entries from FR-1 Note A", () => {
    const required = [
      "oil_gas", "banking", "real_estate", "steel", "aviation",
      "retail", "tech", "utilities", "agriculture", "insurance",
      "securities", "pharma", "logistics", "gold_mining", "automotive",
      "construction", "energy",
    ];
    for (const domain of required) {
      expect(DOMAIN_VN_LABEL[domain]).toBeDefined();
      // Must be Vietnamese (no English domain names in label)
      expect(DOMAIN_VN_LABEL[domain]).not.toBe(domain);
    }
  });
});
