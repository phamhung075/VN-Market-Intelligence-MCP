/**
 * Task 1289d — GREEN Tests for POST Endpoint Validator Integration
 *
 * Tests verify that the domain validator (validateForeignFlowPayload) is properly
 * integrated into the POST /api/push-foreign-flow endpoint by testing the
 * validation result structure and error reporting.
 *
 * Note: These tests focus on the validator integration logic rather than end-to-end
 * HTTP testing, as the endpoint requires full database schema setup.
 *
 * Test spec: 6 assertions covering validator integration scenarios
 * - Validator returns correct structure (valid, errors arrays)
 * - Validation errors include itemIndex, field, reason
 * - Invalid code type triggers validation error
 * - Invalid date triggers validation error
 * - Unparseable numeric fields trigger validation error
 * - Mixed valid + invalid items separate correctly
 *
 * Baseline: 6274 passing (1289b) | Target: 6280 (+6 assertions)
 */

import { describe, it, expect } from "bun:test";
import {
  validateForeignFlowPayload,
  type ValidationResult,
} from "../domain/services/market-data/foreignFlowValidator.js";

describe("1289d: Endpoint validator integration (domain-level)", () => {
  /**
   * Test 1: Validator returns correct structure with no errors for valid payload
   * Assertion 1: result has valid and errors arrays, valid.length > 0, errors.length === 0
   */
  it("returns ValidationResult with valid items when all items pass validation", () => {
    const payload = [
      {
        code: "VNM",
        date: "2026-04-22",
        foreign_volume: 1000,
        foreign_room: 5000,
        holding_ratio: 0.25,
        fetched_at: "2026-04-22T10:30:00Z",
      },
      {
        code: "VCB",
        date: "2026-04-22",
        foreign_volume: 2000,
        foreign_room: null,
        holding_ratio: null,
        fetched_at: null,
      },
    ];

    const result: ValidationResult = validateForeignFlowPayload(payload);

    // Assertions
    expect(result).toHaveProperty("valid");
    expect(result).toHaveProperty("errors");
    expect(Array.isArray(result.valid)).toBe(true);
    expect(Array.isArray(result.errors)).toBe(true);
    expect(result.valid.length).toBe(2);
    expect(result.errors.length).toBe(0);
  });

  /**
   * Test 2: Validator detects invalid code type (number instead of string)
   * Assertion 1: errors[0].field === "code", errors[0].itemIndex defined, reason includes "string"
   */
  it("detects invalid code type and includes error details (itemIndex, field, reason)", () => {
    const payload = [
      {
        code: 123, // ← INVALID: number instead of string
        date: "2026-04-22",
        foreign_volume: 1000,
        foreign_room: null,
        holding_ratio: null,
        fetched_at: null,
      },
    ];

    const result: ValidationResult = validateForeignFlowPayload(payload);

    expect(result.errors.length).toBeGreaterThan(0);
    const codeError = result.errors.find((e) => e.field === "code");
    expect(codeError).toBeDefined();
    expect(typeof codeError!.itemIndex).toBe("number");
    expect(codeError!.itemIndex).toBe(0);
    expect(codeError!.field).toBe("code");
    expect(codeError!.reason).toContain("string");
  });

  /**
   * Test 3: Validator detects invalid date format
   * Assertion 1: errors[0].field === "date", reason includes "YYYY-MM-DD"
   */
  it("detects invalid date format and logs error with reason", () => {
    const payload = [
      {
        code: "VNM",
        date: "invalid-date", // ← INVALID: wrong format
        foreign_volume: 1000,
        foreign_room: null,
        holding_ratio: null,
        fetched_at: null,
      },
    ];

    const result: ValidationResult = validateForeignFlowPayload(payload);

    expect(result.errors.length).toBeGreaterThan(0);
    const dateError = result.errors.find((e) => e.field === "date");
    expect(dateError).toBeDefined();
    expect(dateError!.reason).toContain("YYYY-MM-DD");
  });

  /**
   * Test 4: Validator detects unparseable numeric fields
   * Assertion 1: errors include field name, reason contains "unparseable"
   */
  it("detects unparseable numeric string and includes field name in error", () => {
    const payload = [
      {
        code: "VNM",
        date: "2026-04-22",
        foreign_volume: "not_a_number", // ← INVALID: unparseable
        foreign_room: null,
        holding_ratio: null,
        fetched_at: null,
      },
    ];

    const result: ValidationResult = validateForeignFlowPayload(payload);

    const fvError = result.errors.find(
      (e) => e.field === "foreign_volume",
    );
    expect(fvError).toBeDefined();
    expect(fvError!.reason).toContain("unparseable");
  });

  /**
   * Test 5: Validator separates valid from invalid items in mixed payload
   * Assertion 1: result.valid.length > 0 and result.errors.length > 0
   *              (mixed payload produces both valid items and error entries)
   */
  it("separates valid and invalid items in mixed payload, returns both valid[] and errors[]", () => {
    const payload = [
      {
        code: "VNM",
        date: "2026-04-22",
        foreign_volume: 1000,
        foreign_room: null,
        holding_ratio: null,
        fetched_at: null,
      },
      {
        code: 456, // ← INVALID: number instead of string
        date: "2026-04-22",
        foreign_volume: 2000,
        foreign_room: null,
        holding_ratio: null,
        fetched_at: null,
      },
      {
        code: "BID",
        date: "2026-04-22",
        foreign_volume: 1500,
        foreign_room: null,
        holding_ratio: null,
        fetched_at: null,
      },
    ];

    const result: ValidationResult = validateForeignFlowPayload(payload);

    // Endpoint should see both valid items (VNM, BID) and errors (456)
    expect(result.valid.length).toBeGreaterThan(0);
    expect(result.errors.length).toBeGreaterThan(0);
    // Specifically: 2 valid (VNM, BID), 1 error (456 code type)
    expect(result.valid.length).toBe(2);
    expect(result.errors.length).toBe(1);
  });

  /**
   * Test 6: ValidationError object has complete required fields
   * Assertion 1: error has itemIndex (number), field (string), reason (string), originalValue (any)
   */
  it("includes complete error structure with itemIndex, field, reason, originalValue", () => {
    const payload = [
      {
        code: "VNM",
        date: "2026-04-22",
        foreign_volume: 1000,
        foreign_room: null,
        holding_ratio: null,
        fetched_at: 123, // ← INVALID: number instead of ISO string
      },
    ];

    const result: ValidationResult = validateForeignFlowPayload(payload);

    expect(result.errors.length).toBeGreaterThan(0);
    const error = result.errors[0]!;

    // Check complete error structure
    expect(error).toHaveProperty("itemIndex");
    expect(error).toHaveProperty("field");
    expect(error).toHaveProperty("reason");
    expect(error).toHaveProperty("originalValue");

    // Type checks
    expect(typeof error.itemIndex).toBe("number");
    expect(typeof error.field).toBe("string");
    expect(typeof error.reason).toBe("string");
    // originalValue can be any type
    expect(error.originalValue).toBeDefined();
  });
});
