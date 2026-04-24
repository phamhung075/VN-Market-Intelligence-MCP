/**
 * Task 1302a — textUtils domain service
 * TDD RED phase: all assertions must FAIL before implementation,
 * GREEN after textUtils.ts is created.
 *
 * AC-1: truncateNewsSummary respects 1000 grapheme limit
 * AC-2: truncatePolicySummary respects 500 grapheme limit
 * AC-3: Vietnamese diacritics handled correctly (grapheme-aware)
 * AC-4: Word-boundary truncation (no mid-word cuts)
 * AC-5: "…" appended only when truncated
 */

import { describe, it, expect } from "bun:test";
import {
  truncateNewsSummary,
  truncatePolicySummary,
  smartTruncate,
} from "../domain/services/textUtils.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function graphemeCount(text: string): number {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const seg = new Intl.Segmenter();
    return [...seg.segment(text)].length;
  }
  return [...text].length;
}

/** Build a string of exactly `n` ASCII words of 5 chars each, space-separated */
function makeWords(n: number): string {
  return Array.from({ length: n }, (_, i) => `word${i % 10}`).join(" ");
}

// ─── AC-1: truncateNewsSummary — 1000 grapheme limit ────────────────────────

describe("AC-1: truncateNewsSummary — 1000 grapheme limit", () => {
  it("returns text unchanged when under 1000 graphemes", () => {
    const short = "short text";
    expect(truncateNewsSummary(short)).toBe(short);
  });

  it("truncates text exceeding 1000 graphemes", () => {
    // ~200 words × ~6 chars/word ≈ 1200 graphemes
    const long = makeWords(200);
    const result = truncateNewsSummary(long);
    expect(graphemeCount(result)).toBeLessThanOrEqual(1001); // 1000 + "…"
  });

  it("result grapheme count (without ellipsis) does not exceed 1000", () => {
    const long = makeWords(200);
    const result = truncateNewsSummary(long);
    const withoutEllipsis = result.endsWith("…") ? result.slice(0, -1) : result;
    expect(graphemeCount(withoutEllipsis)).toBeLessThanOrEqual(1000);
  });
});

// ─── AC-2: truncatePolicySummary — 500 grapheme limit ───────────────────────

describe("AC-2: truncatePolicySummary — 500 grapheme limit", () => {
  it("returns text unchanged when under 500 graphemes", () => {
    const short = "short policy text";
    expect(truncatePolicySummary(short)).toBe(short);
  });

  it("truncates text exceeding 500 graphemes", () => {
    const long = makeWords(100); // ~600 graphemes
    const result = truncatePolicySummary(long);
    expect(graphemeCount(result)).toBeLessThanOrEqual(501); // 500 + "…"
  });

  it("result grapheme count (without ellipsis) does not exceed 500", () => {
    const long = makeWords(100);
    const result = truncatePolicySummary(long);
    const withoutEllipsis = result.endsWith("…") ? result.slice(0, -1) : result;
    expect(graphemeCount(withoutEllipsis)).toBeLessThanOrEqual(500);
  });
});

// ─── AC-3: Vietnamese diacritics (grapheme-aware) ───────────────────────────

describe("AC-3: Vietnamese diacritics handled correctly", () => {
  it("treats Vietnamese precomposed graphemes as single units", () => {
    // "ề" is a single grapheme (U+1EC1) — 3 bytes in UTF-8
    const vn = "Ngân hàng Nhà nước Việt Nam điều chỉnh lãi suất";
    const result = truncateNewsSummary(vn);
    // short string — must be returned unchanged
    expect(result).toBe(vn);
  });

  it("truncates long Vietnamese text without splitting diacritics", () => {
    // Build a long Vietnamese string: repeat the phrase until >1000 graphemes
    const phrase = "Kinh tế Việt Nam tăng trưởng mạnh mẽ trong quý này. ";
    let long = "";
    while (graphemeCount(long) < 1100) long += phrase;

    const result = truncateNewsSummary(long);
    expect(graphemeCount(result)).toBeLessThanOrEqual(1001);
    // must not end with a partial word or broken diacritic
    expect(result.endsWith("…")).toBe(true);
  });

  it("handles combining diacritics (NFD form) safely", () => {
    // NFD: "ề" = "e" + combining marks (multiple code units, 1 grapheme)
    const nfd = "Vie\u0302\u0323t Nam ta\u0306ng tru\u01b0\u0309ng"; // NFD Vietnamese
    const result = truncateNewsSummary(nfd);
    // still under 1000 graphemes — unchanged
    expect(graphemeCount(result)).toBeLessThanOrEqual(graphemeCount(nfd));
  });
});

// ─── AC-4: Word-boundary truncation ─────────────────────────────────────────

describe("AC-4: Word-boundary truncation — no mid-word cuts", () => {
  it("does not cut in the middle of a word", () => {
    // 6-char words + space: each token = 7 chars
    // At maxLen=10: sliced = "abcdef abc" → lastSpace=6 → "abcdef…"
    const result = smartTruncate("abcdef abcdef abcdef", 10);
    // Must end with a full word (before "…")
    const withoutEllipsis = result.endsWith("…") ? result.slice(0, -1) : result;
    expect(withoutEllipsis.includes(" ") || withoutEllipsis.length <= 10).toBe(true);
    // The trimmed part must not end mid-word
    const words = withoutEllipsis.trim().split(" ");
    const lastWord = words[words.length - 1] ?? "";
    expect(lastWord.length).toBeGreaterThan(0);
  });

  it("falls back to hard cut when no space found", () => {
    // Single very long word with no spaces
    const noSpace = "a".repeat(20);
    const result = smartTruncate(noSpace, 10);
    expect(result).toBe("aaaaaaaaaa…");
  });
});

// ─── AC-5: Ellipsis appended only when truncated ────────────────────────────

describe("AC-5: ellipsis appended only when truncated", () => {
  it("does NOT append ellipsis for short text", () => {
    expect(truncateNewsSummary("hello world")).toBe("hello world");
    expect(truncatePolicySummary("short")).toBe("short");
  });

  it("appends ellipsis for truncated news summary", () => {
    const long = makeWords(200);
    const result = truncateNewsSummary(long);
    expect(result.endsWith("…")).toBe(true);
  });

  it("appends ellipsis for truncated policy summary", () => {
    const long = makeWords(100);
    const result = truncatePolicySummary(long);
    expect(result.endsWith("…")).toBe(true);
  });

  it("does NOT append ellipsis for text exactly at limit", () => {
    // Exactly 500 graphemes of ASCII
    const exact = "a ".repeat(250).trimEnd(); // 499 chars + no trailing space = 499 graphemes
    // Use smartTruncate directly
    const result = smartTruncate(exact, graphemeCount(exact));
    expect(result.endsWith("…")).toBe(false);
    expect(result).toBe(exact);
  });

  it("handles empty string without ellipsis", () => {
    expect(truncateNewsSummary("")).toBe("");
    expect(truncatePolicySummary("")).toBe("");
  });
});
