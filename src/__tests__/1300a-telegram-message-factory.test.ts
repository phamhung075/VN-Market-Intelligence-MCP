/**
 * Task 1300a — TelegramMessageFactory unit tests
 *
 * TDD RED phase: verify factory methods + smart truncation behavior.
 * Covers:
 *   - word-boundary truncation
 *   - Vietnamese diacritical mark handling (grapheme safety)
 *   - "…" appended iff truncated
 *   - all 5 method signatures
 *   - edge cases: empty string, exact-limit, under-limit
 */

import { describe, it, expect } from "bun:test";
import { TelegramMessageFactory } from "../infrastructure/notifiers/telegramMessageFactory.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Count graphemes using the same Intl.Segmenter the factory uses */
function countGraphemes(s: string): number {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    return [...new Intl.Segmenter().segment(s)].length;
  }
  return [...s].length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Smart truncation — shared logic
// ─────────────────────────────────────────────────────────────────────────────

describe("TelegramMessageFactory — smartTruncate (via formatAlertMessage)", () => {
  it("returns unchanged string when within limit", () => {
    const short = "Short alert";
    expect(TelegramMessageFactory.formatAlertMessage(short)).toBe(short);
  });

  it("does NOT append … when text fits exactly in limit", () => {
    // 100-char ASCII string (exactly at limit)
    const exact = "a".repeat(100);
    expect(TelegramMessageFactory.formatAlertMessage(exact)).toBe(exact);
    expect(TelegramMessageFactory.formatAlertMessage(exact)).not.toContain("…");
  });

  it("appends … when truncated", () => {
    const long = "a".repeat(150);
    const result = TelegramMessageFactory.formatAlertMessage(long);
    expect(result.endsWith("…")).toBe(true);
  });

  it("truncates at word boundary (last space before limit)", () => {
    // Build a string: "word1 word2 word3 ... wordN" that exceeds 100 chars
    // Last space before char 100 should be respected
    const base = "Hello world this is a test message with many words to check boundary truncation logic here end";
    // Pad to exceed 100 chars
    const long = base + " extrapadding to go over one hundred characters definitely";
    const result = TelegramMessageFactory.formatAlertMessage(long);
    expect(result.endsWith("…")).toBe(true);
    // Result (minus "…") should not break mid-word — last char before "…" should be end of a word
    const withoutEllipsis = result.slice(0, -1); // remove "…"
    const lastChar = withoutEllipsis[withoutEllipsis.length - 1];
    expect(lastChar).not.toBe(" "); // no trailing space
    // Must not contain partial word (verify by checking content matches input up to a space)
    const expectedPrefix = withoutEllipsis;
    expect(long.startsWith(expectedPrefix)).toBe(true);
  });

  it("returns empty string for empty input", () => {
    expect(TelegramMessageFactory.formatAlertMessage("")).toBe("");
  });

  it("handles single long word with no spaces (falls back to hard cut)", () => {
    const noSpace = "x".repeat(200);
    const result = TelegramMessageFactory.formatAlertMessage(noSpace);
    expect(result.endsWith("…")).toBe(true);
    // Length of result is 101 graphemes ("x"*100 + "…")
    // The "…" itself is one grapheme
    expect(countGraphemes(result)).toBeLessThanOrEqual(101);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Vietnamese diacritical marks (grapheme safety)
// ─────────────────────────────────────────────────────────────────────────────

describe("TelegramMessageFactory — Vietnamese diacritics handling", () => {
  it("counts Vietnamese characters as single graphemes", () => {
    // "Đây là tin tức quan trọng" = each char is one grapheme
    const vi = "Đây là tin tức quan trọng về thị trường chứng khoán Việt Nam hôm nay rất tốt";
    // String is < 100 chars — should be unchanged
    expect(TelegramMessageFactory.formatAlertMessage(vi)).toBe(vi);
  });

  it("truncates Vietnamese text at word boundary, not mid-diacritic", () => {
    // Build a >100 grapheme Vietnamese string
    const viWord = "chứng khoán "; // 12 graphemes
    const viLong = viWord.repeat(10); // 120 graphemes
    const result = TelegramMessageFactory.formatAlertMessage(viLong.trim());
    expect(result.endsWith("…")).toBe(true);
    // The char before "…" should not be a diacritical fragment
    const withoutEllipsis = result.slice(0, -"…".length);
    // Should end with a complete Vietnamese word (not a partial one)
    expect(withoutEllipsis.endsWith("khoán")).toBe(true);
  });

  it("preserves all diacritics in short text", () => {
    const text = "àáảãạăắằẳẵặâấầẩẫậ";
    const result = TelegramMessageFactory.formatAlertMessage(text);
    expect(result).toBe(text);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Method: formatAlertMessage (max 100)
// ─────────────────────────────────────────────────────────────────────────────

describe("TelegramMessageFactory.formatAlertMessage", () => {
  it("returns ≤100 graphemes (excluding ellipsis)", () => {
    const long = "Alert ".repeat(30); // ~180 graphemes
    const result = TelegramMessageFactory.formatAlertMessage(long.trim());
    const withoutEllipsis = result.endsWith("…")
      ? result.slice(0, -"…".length)
      : result;
    expect(countGraphemes(withoutEllipsis)).toBeLessThanOrEqual(100);
  });

  it("does not mutate short messages", () => {
    const msg = "VNM giảm 3% vượt ngưỡng";
    expect(TelegramMessageFactory.formatAlertMessage(msg)).toBe(msg);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Method: formatStoryTitle (max 100)
// ─────────────────────────────────────────────────────────────────────────────

describe("TelegramMessageFactory.formatStoryTitle", () => {
  it("returns ≤100 graphemes for long titles", () => {
    const title = "Tin tức thị trường chứng khoán ".repeat(5);
    const result = TelegramMessageFactory.formatStoryTitle(title.trim());
    const withoutEllipsis = result.endsWith("…")
      ? result.slice(0, -"…".length)
      : result;
    expect(countGraphemes(withoutEllipsis)).toBeLessThanOrEqual(100);
  });

  it("preserves short titles", () => {
    const title = "VCB báo lãi Q1 tăng 20%";
    expect(TelegramMessageFactory.formatStoryTitle(title)).toBe(title);
  });

  it("appends … when truncated", () => {
    const long = "Long title ".repeat(15);
    expect(TelegramMessageFactory.formatStoryTitle(long.trim())).toContain("…");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Method: formatSignalReasoning (max 1000)
// ─────────────────────────────────────────────────────────────────────────────

describe("TelegramMessageFactory.formatSignalReasoning", () => {
  it("preserves text within 1000 graphemes", () => {
    const short = "RSI oversold. Support at 45k. Conviction high.";
    expect(TelegramMessageFactory.formatSignalReasoning(short)).toBe(short);
  });

  it("truncates at word boundary beyond 1000 graphemes", () => {
    const long = "Signal reasoning word ".repeat(60); // ~1320 graphemes
    const result = TelegramMessageFactory.formatSignalReasoning(long.trim());
    expect(result.endsWith("…")).toBe(true);
    const withoutEllipsis = result.slice(0, -"…".length);
    expect(countGraphemes(withoutEllipsis)).toBeLessThanOrEqual(1000);
  });

  it("does not truncate text of exactly 1000 graphemes", () => {
    const exact = "a".repeat(1000);
    expect(TelegramMessageFactory.formatSignalReasoning(exact)).toBe(exact);
    expect(TelegramMessageFactory.formatSignalReasoning(exact)).not.toContain("…");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Method: formatNewsSummary (max 1000)
// ─────────────────────────────────────────────────────────────────────────────

describe("TelegramMessageFactory.formatNewsSummary", () => {
  it("preserves summary within limit", () => {
    const s = "FED giữ lãi suất. Thị trường phản ứng tích cực.";
    expect(TelegramMessageFactory.formatNewsSummary(s)).toBe(s);
  });

  it("truncates long summaries", () => {
    const long = "Summary content ".repeat(70); // ~1120 graphemes
    const result = TelegramMessageFactory.formatNewsSummary(long.trim());
    expect(result.endsWith("…")).toBe(true);
  });

  it("handles empty string", () => {
    expect(TelegramMessageFactory.formatNewsSummary("")).toBe("");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Method: formatPolicySummary (max 500)
// ─────────────────────────────────────────────────────────────────────────────

describe("TelegramMessageFactory.formatPolicySummary", () => {
  it("preserves text within 500 graphemes", () => {
    const s = "Chính sách tài khóa mở rộng. Ngân hàng nhà nước giữ lãi suất.";
    expect(TelegramMessageFactory.formatPolicySummary(s)).toBe(s);
  });

  it("truncates beyond 500 graphemes at word boundary", () => {
    const long = "Policy detail word ".repeat(30); // ~570 graphemes
    const result = TelegramMessageFactory.formatPolicySummary(long.trim());
    expect(result.endsWith("…")).toBe(true);
    const withoutEllipsis = result.slice(0, -"…".length);
    expect(countGraphemes(withoutEllipsis)).toBeLessThanOrEqual(500);
  });

  it("does not truncate exactly-500-grapheme text", () => {
    const exact = "b".repeat(500);
    expect(TelegramMessageFactory.formatPolicySummary(exact)).toBe(exact);
  });
});
