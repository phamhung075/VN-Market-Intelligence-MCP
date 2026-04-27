/**
 * Task 1321 — TDD RED: "lỗ" (standalone loss) not in bearish keywords + NFC gap
 *
 * Bug: VN_BEARISH list lacks standalone "lỗ". Compound forms "thua lỗ" and
 * "khoản lỗ" exist but bare "lỗ" does not fire. Additionally classifySentiment
 * calls text.toLowerCase() without text.normalize("NFC") first, so NFD-encoded
 * Vietnamese diacritics from RSS feeds may miss keyword matches.
 *
 * Fix:
 *   1. Add { word: "lỗ", weight: 2 } and { word: "lợi nhuận âm", weight: 3 }
 *      to VN_BEARISH.
 *   2. Change line 514: const lower = text.normalize("NFC").toLowerCase();
 *
 * T1: "VIX Q1 lợi nhuận lỗ 63% giảm" → bearish
 * T2: "lợi nhuận tăng 20%" → bullish (regression)
 * T3: "giảm 30% so với cùng kỳ" → bearish (regression)
 * T4: NFD-encoded "lỗ" → bearish (NFC normalization fix)
 * T5: "lỗi trong hệ thống" does NOT match "lỗ" (word-boundary guard)
 */

import { describe, it, expect } from "bun:test";
import { classifySentiment } from "../domain/services/sentimentClassifier.js";

describe("Task 1321 — standalone 'lỗ' bearish keyword + NFC normalization", () => {
  it("T1: loss context — 'lỗ' in Q1 headline → bearish", () => {
    const result = classifySentiment("VIX Q1 lợi nhuận lỗ 63% giảm");
    expect(result.direction).toBe("bearish");
  });

  it("T2: profit context — 'lợi nhuận tăng 20%' → bullish (regression)", () => {
    const result = classifySentiment("lợi nhuận tăng 20%");
    expect(result.direction).toBe("bullish");
  });

  it("T3: generic decline — 'giảm 30% so với cùng kỳ' → bearish (regression)", () => {
    const result = classifySentiment("giảm 30% so với cùng kỳ");
    expect(result.direction).toBe("bearish");
  });

  it("T4: NFD-encoded 'lỗ' matches after NFC normalization → bearish", () => {
    // NFD decomposition of "lỗ": l + o (U+006F) + circumflex (U+0302) + tilde (U+0303)
    // RSS feeds sometimes emit NFD; classifySentiment must normalise to NFC before matching.
    const nfdText = "VIX l\u006F\u0302\u0303 63%"; // already NFD — no need to .normalize("NFD")
    const result = classifySentiment(nfdText);
    expect(result.direction).toBe("bearish");
  });

  it("T5: 'lỗi' (error) does NOT match 'lỗ' (loss) — word-boundary guard", () => {
    const result = classifySentiment("lỗi trong hệ thống");
    // Should NOT be bearish due to "lỗ" match — "lỗi" is a different word
    // The word-boundary check must ensure "lỗ" only matches whole words
    expect(result.direction).not.toBe("bearish");
  });
});
