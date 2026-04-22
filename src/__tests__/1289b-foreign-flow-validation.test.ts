/**
 * Task 1289b — RED Tests for Foreign Flow Validation Error Handling
 *
 * Tests verify that validateForeignFlowPayload() properly detects and reports
 * validation errors instead of silently filtering invalid items.
 *
 * Test spec: 9 assertions covering invalid payload scenarios
 * - Valid payload (control)
 * - Invalid code type (number instead of string)
 * - Missing date field
 * - Invalid foreignBuyVol (string instead of number)
 * - Invalid foreignSellVol (null instead of number)
 * - Mixed valid + invalid items
 * - All items invalid
 * - Null payload
 * - Empty payload
 *
 * Baseline: 6274 passing | Target: 6283 (+9 assertions)
 */

import { describe, it, expect } from "bun:test";
import {
  validateForeignFlowPayload,
  ValidationResult,
} from "../domain/services/market-data/foreignFlowValidator.js";

describe("1289b: Foreign flow validation error handling", () => {
  /**
   * Test 1: Valid payload (control)
   * Assertion 1: errors.length === 0, valid.length === 3
   */
  it("returns no errors for valid payload with 3 items", () => {
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
      {
        code: "BID",
        date: "2026-04-22",
        foreign_volume: 1500,
        foreign_room: 3000,
        holding_ratio: 0.15,
        fetched_at: "2026-04-22T10:30:00Z",
      },
    ];

    const result = validateForeignFlowPayload(payload);
    expect(result.errors.length).toBe(0);
    expect(result.valid.length).toBe(3);
  });

  /**
   * Test 2: Invalid code type (number instead of string)
   * Assertion 1: errors[0].itemIndex === 1, errors[0].field === "code",
   *              reason contains "string"
   */
  it("detects invalid code type (number instead of string)", () => {
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
        code: 123, // ← INVALID: number instead of string
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

    const result = validateForeignFlowPayload(payload);
    expect(result.errors.length).toBeGreaterThan(0);
    const codeError = result.errors.find((e) => e.field === "code");
    expect(codeError).toBeDefined();
    expect(codeError!.itemIndex).toBe(1);
    expect(codeError!.field).toBe("code");
    expect(codeError!.reason).toContain("string");
  });

  /**
   * Test 3: Missing date field
   * Assertion 1: errors[0].field === "date", errors.length === 1 (or more)
   *
   * Note: Missing date should default to today UTC, so this test checks
   * that date field is handled correctly even when absent.
   */
  it("returns valid item with date defaulting to today UTC when date field is absent", () => {
    const payload = [
      {
        code: "VNM",
        // ← date field is absent
        foreign_volume: 1000,
        foreign_room: null,
        holding_ratio: null,
        fetched_at: null,
      },
    ];

    const result = validateForeignFlowPayload(payload);
    // Date field is optional and defaults to today UTC
    expect(result.errors.length).toBe(0);
    expect(result.valid.length).toBe(1);
    // Verify date was set to today UTC (YYYY-MM-DD format)
    const todayUtc = new Date().toISOString().slice(0, 10);
    expect(result.valid[0]!.date).toBe(todayUtc);
  });

  /**
   * Test 4: Invalid foreign_volume (string instead of number, but parseable)
   * Assertion 1: errors[0].field === "foreign_volume"
   *
   * Note: "500" is parseable, so it should coerce successfully without error
   */
  it("coerces parseable numeric string for foreign_volume", () => {
    const payload = [
      {
        code: "VNM",
        date: "2026-04-22",
        foreign_volume: "500", // ← Parseable string
        foreign_room: null,
        holding_ratio: null,
        fetched_at: null,
      },
    ];

    const result = validateForeignFlowPayload(payload);
    expect(result.errors.length).toBe(0);
    expect(result.valid.length).toBe(1);
    expect(result.valid[0]!.foreign_volume).toBe(500);
  });

  /**
   * Test 5: Invalid foreign_volume with unparseable string
   * Assertion 1: errors[0].field === "foreign_volume", reason contains "unparseable"
   */
  it("detects unparseable numeric string for foreign_volume", () => {
    const payload = [
      {
        code: "VNM",
        date: "2026-04-22",
        foreign_volume: "abc", // ← Unparseable string
        foreign_room: null,
        holding_ratio: null,
        fetched_at: null,
      },
    ];

    const result = validateForeignFlowPayload(payload);
    const fvError = result.errors.find((e) => e.field === "foreign_volume");
    expect(fvError).toBeDefined();
    expect(fvError!.reason).toContain("unparseable");
  });

  /**
   * Test 6: Invalid fetched_at (number instead of string)
   * Assertion 1: errors[0].field === "fetched_at", reason contains "timestamp"
   */
  it("detects invalid fetched_at type (number instead of ISO string)", () => {
    const payload = [
      {
        code: "VNM",
        date: "2026-04-22",
        foreign_volume: 1000,
        foreign_room: null,
        holding_ratio: null,
        fetched_at: 1713787800, // ← INVALID: number (Unix timestamp) instead of ISO string
      },
    ];

    const result = validateForeignFlowPayload(payload);
    const faError = result.errors.find((e) => e.field === "fetched_at");
    expect(faError).toBeDefined();
    expect(faError!.reason).toContain("ISO 8601");
  });

  /**
   * Test 7: Mixed valid + invalid items in one payload
   * Assertion 2: errors.length === 2, valid.length === 3
   *              (3 items valid, 2 error entries)
   *
   * Note: Invalid date format is logged as an error but item is still included
   * (validation continues after reporting coercion errors).
   */
  it("filters invalid items and retains valid ones in mixed payload", () => {
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
      {
        code: "TCB",
        date: "invalid-date", // ← INVALID: wrong date format, logged as error
        foreign_volume: 800,
        foreign_room: null,
        holding_ratio: null,
        fetched_at: null,
      },
    ];

    const result = validateForeignFlowPayload(payload);
    // Should have 3 valid items (VNM, BID, TCB)
    // and 2 error entries (456 code type, TCB date format)
    expect(result.valid.length).toBe(3);
    expect(result.errors.length).toBe(2);
    // Verify we have both code and date errors
    const errorFields = result.errors.map((e) => e.field);
    expect(errorFields).toContain("code");
    expect(errorFields).toContain("date");
    // Verify valid items have correct codes
    const validCodes = result.valid.map((v) => v.code);
    expect(validCodes).toContain("VNM");
    expect(validCodes).toContain("BID");
    expect(validCodes).toContain("TCB");
  });

  /**
   * Test 8: All items invalid
   * Assertion 1: errors.length === 4, valid.length === 0
   */
  it("returns no valid items when all items are invalid", () => {
    const payload = [
      {
        code: 123, // ← INVALID: number
        date: "2026-04-22",
        foreign_volume: 1000,
        foreign_room: null,
        holding_ratio: null,
        fetched_at: null,
      },
      {
        code: true, // ← INVALID: boolean
        date: "2026-04-22",
        foreign_volume: 2000,
        foreign_room: null,
        holding_ratio: null,
        fetched_at: null,
      },
      {
        code: null, // ← INVALID: null
        date: "2026-04-22",
        foreign_volume: 1500,
        foreign_room: null,
        holding_ratio: null,
        fetched_at: null,
      },
      {
        code: "", // ← INVALID: empty string
        date: "2026-04-22",
        foreign_volume: 800,
        foreign_room: null,
        holding_ratio: null,
        fetched_at: null,
      },
    ];

    const result = validateForeignFlowPayload(payload);
    expect(result.errors.length).toBe(4);
    expect(result.valid.length).toBe(0);
  });

  /**
   * Test 9: Non-object items in payload
   * Assertion 1: Detects and rejects non-object items
   *
   * Tests the error case where payload contains primitives instead of objects.
   */
  it("detects and rejects non-object items in payload", () => {
    const payload = [
      {
        code: "VNM",
        date: "2026-04-22",
        foreign_volume: 1000,
        foreign_room: null,
        holding_ratio: null,
        fetched_at: null,
      },
      123, // ← INVALID: primitive (number) instead of object
      {
        code: "BID",
        date: "2026-04-22",
        foreign_volume: 1500,
        foreign_room: null,
        holding_ratio: null,
        fetched_at: null,
      },
    ] as unknown[];

    const result = validateForeignFlowPayload(payload);
    // Item[1] (the number 123) should be rejected
    expect(result.errors.length).toBeGreaterThan(0);
    const nonObjError = result.errors.find((e) => e.itemIndex === 1);
    expect(nonObjError).toBeDefined();
    expect(nonObjError!.reason).toContain("not an object");
    // Valid items should be VNM and BID
    expect(result.valid.length).toBe(2);
  });

  /**
   * Test 10 (Bonus): Empty payload
   * Assertion 1: errors.length === 0, valid.length === 0
   */
  it("returns empty result for empty payload", () => {
    const payload: unknown[] = [];

    const result = validateForeignFlowPayload(payload);
    expect(result.errors.length).toBe(0);
    expect(result.valid.length).toBe(0);
  });

  /**
   * Test 11 (Bonus): Validate error structure completeness
   * Assertion 1: Each error has itemIndex, field, reason, originalValue
   */
  it("includes complete error details (itemIndex, field, reason, originalValue)", () => {
    const payload = [
      {
        code: 789, // ← INVALID: number instead of string
        date: "2026-04-22",
        foreign_volume: 1000,
        foreign_room: null,
        holding_ratio: null,
        fetched_at: null,
      },
    ];

    const result = validateForeignFlowPayload(payload);
    expect(result.errors.length).toBeGreaterThan(0);

    const error = result.errors[0]!;
    expect(error).toHaveProperty("itemIndex");
    expect(error).toHaveProperty("field");
    expect(error).toHaveProperty("reason");
    expect(error).toHaveProperty("originalValue");
    expect(typeof error!.itemIndex).toBe("number");
    expect(typeof error!.field).toBe("string");
    expect(typeof error!.reason).toBe("string");
  });
});
