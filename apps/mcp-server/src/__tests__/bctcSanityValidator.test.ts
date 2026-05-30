/**
 * Unit tests — bctcSanityValidator (DT-1 digit-run detector)
 *
 * Sprint BCTC-TRUST-RED (TR0-DEV-1 + TR1-DEV-1)
 *
 * Tests cover:
 *   - isDigitRun: all classification cases (AC-TR1-1-2 through AC-TR1-1-7)
 *   - validateBctcUnit: BLOCK / WARN / CLEAN outputs (AC-TR1-1-1, AC-TR1-1-8, AC-TR1-1-9)
 *   - Domain purity: no infrastructure imports (verified by test isolation + static grep)
 */

import { describe, it, expect } from "bun:test";
import {
  isDigitRun,
  validateBctcUnit,
} from "../domain/services/financial-reports/bctcSanityValidator";

// ── isDigitRun ────────────────────────────────────────────────────────────────

describe("isDigitRun", () => {
  // AC-TR1-1-2
  it("returns true for ascending digit runs", () => {
    expect(isDigitRun("12345678901234")).toBe(true);
    expect(isDigitRun("23456789012345")).toBe(true);
    expect(isDigitRun("1234")).toBe(true);
    expect(isDigitRun("1234567890")).toBe(true);
  });

  // AC-TR1-1-3 (descending / cyclic)
  it("returns true for descending/cyclic digit runs", () => {
    // "8901234567890" is a substring of the ascending cycle — also true
    expect(isDigitRun("8901234567890")).toBe(true);
    expect(isDigitRun("09876543210987")).toBe(true);
    expect(isDigitRun("0987654321")).toBe(true);
  });

  // AC-TR1-1-4
  it("returns true for all-same digit runs (≥4 chars)", () => {
    expect(isDigitRun("1111")).toBe(true);
    expect(isDigitRun("9999")).toBe(true);
    expect(isDigitRun("00000")).toBe(true);
    expect(isDigitRun("1111111111")).toBe(true);
  });

  // AC-TR1-1-5
  it("returns false for strings shorter than 4 chars", () => {
    expect(isDigitRun("123")).toBe(false);
    expect(isDigitRun("99")).toBe(false);
    expect(isDigitRun("1")).toBe(false);
    expect(isDigitRun("")).toBe(false);
  });

  // AC-TR1-1-6 / AC-TR1-1-7
  it("returns false for non-monotonic real numbers", () => {
    expect(isDigitRun("1024")).toBe(false);
    expect(isDigitRun("16058")).toBe(false);
    expect(isDigitRun("11481")).toBe(false);
    expect(isDigitRun("2509520")).toBe(false);
    expect(isDigitRun("1234560")).toBe(false); // not a pure ascending substring
  });

  it("returns false for realistic financial values", () => {
    expect(isDigitRun("100000")).toBe(false);
    expect(isDigitRun("500000")).toBe(false);
    expect(isDigitRun("20225000")).toBe(false);
  });

  // Verify the REQ spec ACs explicitly
  it("AC-TR1-1-6: isDigitRun('1234') = true (ascending run length 4)", () => {
    expect(isDigitRun("1234")).toBe(true);
  });

  it("AC-TR1-1-7: isDigitRun('1024') = false", () => {
    expect(isDigitRun("1024")).toBe(false);
  });
});

// ── validateBctcUnit ──────────────────────────────────────────────────────────

describe("validateBctcUnit", () => {
  // AC-TR1-1-1: ≥2 distinct digit-runs → BLOCK
  it("returns BLOCK when markdown has ≥2 distinct digit-run values", () => {
    const md = `| Mã số | Chỉ tiêu | Số cuối kỳ | Số đầu kỳ |
|---|---|---|---|
| 100 | Doanh thu thuần | 12345678901234 | 8901234567890 |
| 200 | Lợi nhuận gộp | 23456789012345 | 7890123456789 |`;

    const result = validateBctcUnit(md, 0.85, [], "test-rpt");
    expect(result.valid).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations[0].severity).toBe("BLOCK");
    expect(result.violations[0].code).toBe("DIGIT_RUN");
    expect(result.adjusted_confidence).toBe(0.1); // min(0.85, 0.1)
  });

  // AC-TR1-1-1 (explicit variant from REQ spec)
  it("REQ AC-TR1-1-1: two distinct runs from spec example", () => {
    const md = `| 100 | Doanh thu thuần | 12345678901234 | 8901234567890 |`;
    // "12345678901234" is ascending run (true); "8901234567890" — check:
    // ASC_DOUBLED="1234567890123456789012345678901234567890"; pos 7 = "89012345678901234567890..."
    // "8901234567890" length 13, substring of ASC_DOUBLED? yes at pos 7
    // So both are digit-runs → BLOCK
    const result = validateBctcUnit(md, 0.85, [], "test-rpt");
    expect(result.valid).toBe(false);
    expect(result.violations[0].code).toBe("DIGIT_RUN");
  });

  // AC-TR1-1-2: exactly 1 digit-run → WARN
  it("returns WARN with adjusted_confidence when markdown has exactly 1 digit-run value", () => {
    const md = `| 100 | Mã số dòng | 123456 | 90000 |`;
    // "123456" → isDigitRun? ASC_DOUBLED.includes("123456")? "12345678901234567890..." yes
    // "90000" → all-same? No (9≠0). ASC/DESC? No. False.
    const result = validateBctcUnit(md, 0.85, [], "test-rpt");
    expect(result.valid).toBe(true);
    expect(result.violations.length).toBe(1);
    expect(result.violations[0].severity).toBe("WARN");
    expect(result.violations[0].code).toBe("DIGIT_RUN_SINGLE");
    expect(result.adjusted_confidence).toBe(0.4); // min(0.85, 0.4)
  });

  // AC-TR1-1-3: realistic Vietnamese BCTC values → CLEAN
  it("returns CLEAN for realistic Vietnamese BCTC values", () => {
    const md = `| Mã số | Chỉ tiêu | Số cuối kỳ | Số đầu kỳ |
|---|---|---|---|
| 10 | Doanh thu thuần | 16,058 | 11,481 |
| 20 | Lợi nhuận gộp | 2,509,520 | 2,100,000 |
| 30 | Chi phí bán hàng | 500,123 | 480,000 |`;

    const result = validateBctcUnit(md, 0.85, [], "test-rpt");
    expect(result.valid).toBe(true);
    expect(result.violations).toEqual([]);
    expect(result.adjusted_confidence).toBe(0.85);
  });

  // AC-TR1-1-8: single BCTC code appearance → WARN not BLOCK
  it("AC-TR1-1-8: single digit-run-shaped BCTC code → WARN, not BLOCK", () => {
    const md = `| 123456 | Mã số dòng kế toán | 100000 | 90000 |`;
    const result = validateBctcUnit(md, 0.9, [], "test-rpt");
    expect(result.valid).toBe(true);
    expect(result.violations[0]?.severity).toBe("WARN");
  });

  // confidence floor at 0.4 for WARN
  it("applies min(confidence, 0.4) for WARN violations", () => {
    // "123456" is a digit-run; "90001" is not → single digit-run → WARN
    const md = `| 100 | Label | 123456 | 90001 |`;
    const result = validateBctcUnit(md, 0.3, [], "test-rpt");
    expect(result.violations[0]?.severity).toBe("WARN");
    expect(result.adjusted_confidence).toBe(0.3); // min(0.3, 0.4) = 0.3
  });

  it("applies min(confidence, 0.1) for BLOCK violations", () => {
    const md = `| 100 | L | 12345678901234 | 09876543210987 |`;
    const result = validateBctcUnit(md, 0.05, [], "test-rpt");
    expect(result.adjusted_confidence).toBe(0.05); // min(0.05, 0.1) = 0.05
  });

  it("passes flags and allUnitMarkdowns through without error", () => {
    const result = validateBctcUnit("| 100 | Doanh thu | 16058 |", 0.9, ["flag1"], "rpt", ["other"]);
    expect(result.valid).toBe(true);
  });

  it("handles empty markdown without throwing", () => {
    const result = validateBctcUnit("", 0.9, [], "rpt");
    expect(result.valid).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it("handles markdown with no table cells without throwing", () => {
    const result = validateBctcUnit("No table here.", 0.9, [], "rpt");
    expect(result.valid).toBe(true);
  });
});
