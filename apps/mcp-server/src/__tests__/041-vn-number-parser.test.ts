/**
 * Task 041 — Vietnamese Number Parser
 *
 * Vietnamese financial reports use:
 *   - Dots as thousands separators: 1.234.567
 *   - Commas as decimal separators: 1.234,56
 *   - Parentheses for negative numbers: (456.789)
 *
 * This parser converts those strings to JS numbers.
 */
import { describe, expect, it } from "bun:test";
import { parseVnNumber } from "../domain/services/vnNumberParser";

describe("parseVnNumber", () => {
  // --- Basic Vietnamese format ---

  it("parses dot-separated thousands: '1.234.567' → 1234567", () => {
    expect(parseVnNumber("1.234.567")).toBe(1234567);
  });

  it("parses parenthesized negative: '(456.789)' → -456789", () => {
    expect(parseVnNumber("(456.789)")).toBe(-456789);
  });

  it("parses comma as decimal separator: '1.234,56' → 1234.56", () => {
    expect(parseVnNumber("1.234,56")).toBe(1234.56);
  });

  it("parses negative with dash: '-1.234.567' → -1234567", () => {
    expect(parseVnNumber("-1.234.567")).toBe(-1234567);
  });

  it("parses parenthesized negative with decimal: '(1.234.567,89)' → -1234567.89", () => {
    expect(parseVnNumber("(1.234.567,89)")).toBe(-1234567.89);
  });

  // --- Zero and trivial ---

  it("parses zero: '0' → 0", () => {
    expect(parseVnNumber("0")).toBe(0);
  });

  it("parses plain number without separators: '12345' → 12345", () => {
    expect(parseVnNumber("12345")).toBe(12345);
  });

  // --- Non-numeric inputs → null ---

  it("returns null for empty string", () => {
    expect(parseVnNumber("")).toBeNull();
  });

  it("returns null for em-dash '—'", () => {
    expect(parseVnNumber("—")).toBeNull();
  });

  it("returns null for single dash used as placeholder '-'", () => {
    expect(parseVnNumber("-")).toBeNull();
  });

  it("returns null for 'N/A'", () => {
    expect(parseVnNumber("N/A")).toBeNull();
  });

  // --- Whitespace handling ---

  it("trims whitespace: ' 1.234 ' → 1234", () => {
    expect(parseVnNumber(" 1.234 ")).toBe(1234);
  });

  // --- Large numbers ---

  it("parses large numbers: '1.234.567.890' → 1234567890", () => {
    expect(parseVnNumber("1.234.567.890")).toBe(1234567890);
  });

  // --- Decimal only ---

  it("parses decimal without thousands: '0,5' → 0.5", () => {
    expect(parseVnNumber("0,5")).toBe(0.5);
  });

  it("parses negative with comma decimal: '-1.234,56' → -1234.56", () => {
    expect(parseVnNumber("-1.234,56")).toBe(-1234.56);
  });

  // --- English format detection ---

  it("handles English comma-separated format gracefully: '1,234,567' → 1234567", () => {
    expect(parseVnNumber("1,234,567")).toBe(1234567);
  });

  // --- Additional edge cases ---

  it("returns null for purely alphabetic input", () => {
    expect(parseVnNumber("abc")).toBeNull();
  });

  it("parses number with trailing dot notation: '1.000' → 1000", () => {
    // 1.000 in Vietnamese means one thousand, not 1.0
    // Heuristic: groups of exactly 3 after dot → thousands separator
    expect(parseVnNumber("1.000")).toBe(1000);
  });

  it("parses percentage-like without percent sign: '12,5' → 12.5", () => {
    expect(parseVnNumber("12,5")).toBe(12.5);
  });
});
