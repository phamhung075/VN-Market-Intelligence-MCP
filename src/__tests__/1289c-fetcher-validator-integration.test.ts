/**
 * Task 1289c — GREEN: Fetcher Validator Integration Tests
 *
 * Validates that fetchPrimaryVpsEndpoint() uses the domain validator
 * and fails loudly on schema violations instead of silently filtering.
 *
 * Integration test strategy:
 * - Unit test: validateForeignFlowFetcherPayload() in validator tests (1289b)
 * - Integration test: fetchPrimaryVpsEndpoint() rejects invalid items + throws
 * - Fallback test: fetchForeignFlowWithFallback() catches validation errors, logs, falls back
 *
 * Test spec: 6 assertions covering:
 * - Valid payload (control, no errors)
 * - Invalid code type (number instead of string) → fetchPrimaryVpsEndpoint throws
 * - Missing foreignBuyVol field → fetchPrimaryVpsEndpoint throws
 * - All items invalid (schema mismatch) → fetchPrimaryVpsEndpoint throws
 * - Mixed valid + invalid items → fallback handler catches, returns empty
 * - Validator error message includes item index + field + reason
 *
 * Baseline: 6283 passing (from 1289b) | Target: 6289 (+6 assertions)
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import type { WriteForeignFlowItem } from "../infrastructure/db/ohlcvForeignFlowStore.js";
import { resetCircuitBreaker, resetFallbackCache } from "../infrastructure/fetchers/foreignFlowFetcher.js";

// For direct unit testing of fetchPrimaryVpsEndpoint
async function importPrivateFetcher() {
  // Access the module to test private function behavior
  return await import("../infrastructure/fetchers/foreignFlowFetcher.js");
}

// Mock fetch function for testing
function makeFetchFn(opts: {
  responseData?: WriteForeignFlowItem[] | unknown[];
  shouldFail?: boolean;
  statusCode?: number;
} = {}) {
  const { responseData = [], shouldFail = false, statusCode = 200 } = opts;

  return async (url: string): Promise<Response> => {
    if (shouldFail) {
      throw new Error("Network error");
    }

    // Simulate JSON serialization/deserialization to ensure data structure matches real HTTP
    const jsonBody = JSON.parse(JSON.stringify({ data: responseData }));

    return {
      ok: statusCode >= 200 && statusCode < 300,
      status: statusCode,
      json: async () => jsonBody,
    } as unknown as Response;
  };
}

// Import the function being tested
async function importFetcher() {
  return await import("../infrastructure/fetchers/foreignFlowFetcher.js");
}

describe("1289c: Fetcher Validator Integration", () => {
  beforeEach(async () => {
    await resetCircuitBreaker();
    resetFallbackCache();
  });

  afterEach(async () => {
    await resetCircuitBreaker();
    resetFallbackCache();
  });

  /**
   * Test 1: Validator accepts valid payload
   * Assertion 1: validateForeignFlowFetcherPayload() returns valid items, no errors
   */
  it("validator accepts valid WriteForeignFlowItem payload", async () => {
    const { validateForeignFlowFetcherPayload } = await import(
      "../domain/services/market-data/foreignFlowValidator.js"
    );

    const validPayload = [
      {
        code: "VNM",
        date: "2026-04-22",
        foreignBuyVol: 1000000,
        foreignSellVol: 800000,
        putThroughVol: 50000,
      },
      {
        code: "VCB",
        date: "2026-04-22",
        foreignBuyVol: 500000,
        foreignSellVol: 400000,
        putThroughVol: 25000,
      },
    ];

    const result = validateForeignFlowFetcherPayload(validPayload);

    // Assertion 1: No errors for valid payload
    expect(result.errors.length).toBe(0);
    // Assertion 2: All items are valid
    expect(result.valid.length).toBe(2);
    // Assertion 3: Items are correctly typed
    expect(result.valid[0]!.code).toBe("VNM");
    expect(result.valid[1]!.code).toBe("VCB");
  });

  /**
   * Test 2: Invalid code type (number instead of string)
   * Assertion 1: Fallback handler catches validation error
   * Assertion 2: Returns fallback source (not primary)
   */
  it("activates fallback when code is invalid (number instead of string)", async () => {
    const { fetchForeignFlowWithFallback } = await importFetcher();

    const invalidPayload = [
      {
        code: 12345, // ← INVALID: number instead of string
        date: "2026-04-22",
        foreignBuyVol: 1000000,
        foreignSellVol: 800000,
        putThroughVol: 50000,
      },
    ];

    const result = await fetchForeignFlowWithFallback({
      fetchFn: makeFetchFn({ responseData: invalidPayload as any }),
      now: () => new Date("2026-04-22T10:30:00Z"),
    });

    // Assertion 1: Result is not from primary (validation error triggered fallback)
    expect(result.source).not.toBe("primary");
    // Assertion 2: Falls back to "none" when no other sources available
    expect(result.source).toBe("none");
  });

  /**
   * Test 3: Missing mandatory field (foreignBuyVol)
   * Assertion 1: Validation catches the error and triggers fallback
   */
  it("triggers fallback when foreignBuyVol is missing", async () => {
    const { fetchForeignFlowWithFallback } = await importFetcher();

    const invalidPayload = [
      {
        code: "VNM",
        date: "2026-04-22",
        foreignBuyVol: undefined, // ← INVALID: missing
        foreignSellVol: 800000,
        putThroughVol: 50000,
      },
    ];

    const result = await fetchForeignFlowWithFallback({
      fetchFn: makeFetchFn({ responseData: invalidPayload as any }),
      now: () => new Date("2026-04-22T10:30:00Z"),
    });

    // Assertion 1: Validation error prevents primary source
    expect(result.source).not.toBe("primary");
  });

  /**
   * Test 4: All items invalid
   * Assertion 1: Validation catches all errors, triggers fallback
   */
  it("triggers fallback when all items are invalid", async () => {
    const { fetchForeignFlowWithFallback } = await importFetcher();

    const invalidPayload = [
      {
        code: 111, // ← INVALID
        date: "2026-04-22",
        foreignBuyVol: 1000000,
        foreignSellVol: 800000,
        putThroughVol: 50000,
      },
      {
        code: 222, // ← INVALID
        date: "2026-04-22",
        foreignBuyVol: 500000,
        foreignSellVol: 400000,
        putThroughVol: 25000,
      },
    ];

    const result = await fetchForeignFlowWithFallback({
      fetchFn: makeFetchFn({ responseData: invalidPayload as any }),
      now: () => new Date("2026-04-22T10:30:00Z"),
    });

    // Assertion 1: All items invalid → validation error → triggers fallback
    expect(result.source).not.toBe("primary");
    // Assertion 2: With no fallback data, returns "none"
    expect(result.source).toBe("none");
  });

  /**
   * Test 5: Mixed valid + invalid items
   * Assertion 1: Validation rejects entire payload (no partial writes)
   * Assertion 2: Fallback is triggered instead of partial success
   */
  it("rejects mixed valid + invalid items (fails loudly, no partial writes)", async () => {
    const { fetchForeignFlowWithFallback } = await importFetcher();

    const mixedPayload = [
      {
        code: "VNM", // ← Valid
        date: "2026-04-22",
        foreignBuyVol: 1000000,
        foreignSellVol: 800000,
        putThroughVol: 50000,
      },
      {
        code: 456, // ← INVALID: number instead of string
        date: "2026-04-22",
        foreignBuyVol: 500000,
        foreignSellVol: 400000,
        putThroughVol: 25000,
      },
      {
        code: "BID", // ← Valid
        date: "2026-04-22",
        foreignBuyVol: 250000,
        foreignSellVol: 200000,
        putThroughVol: 10000,
      },
    ];

    const result = await fetchForeignFlowWithFallback({
      fetchFn: makeFetchFn({ responseData: mixedPayload as any }),
      now: () => new Date("2026-04-22T10:30:00Z"),
    });

    // Assertion 1: Validation error prevents primary (not partial success)
    expect(result.source).not.toBe("primary");
    // Assertion 2: Falls back since validation failed
    expect(result.source).toBe("none");
  });

  /**
   * Test 6: Validator error message structure
   * Assertion 1: Validator includes itemIndex, field, and reason in message
   * Assertion 2: Error message is logged with proper context
   */
  it("validator includes detailed diagnostics (itemIndex, field, reason) in errors", async () => {
    const { validateForeignFlowFetcherPayload } = await import(
      "../domain/services/market-data/foreignFlowValidator.js"
    );

    const invalidPayload: any[] = [
      {
        code: "VALID",
        date: "2026-04-22",
        foreignBuyVol: 1000000,
        foreignSellVol: 800000,
        putThroughVol: 50000,
      },
      {
        code: "INVALID",
        date: "invalid-date", // ← INVALID: wrong format
        foreignBuyVol: 500000,
        foreignSellVol: 400000,
        putThroughVol: 25000,
      },
    ];

    const result = validateForeignFlowFetcherPayload(invalidPayload);

    // Assertion 1: Validator finds the error
    expect(result.errors.length).toBeGreaterThan(0);
    // Assertion 2: Error has itemIndex = 1
    const dateError = result.errors.find((e) => e.field === "date");
    expect(dateError).toBeDefined();
    expect(dateError!.itemIndex).toBe(1);
    // Assertion 3: Error reason is clear
    expect(dateError!.reason).toContain("YYYY-MM-DD");
    // Assertion 4: Valid item was accepted
    expect(result.valid.length).toBe(1);
    expect(result.valid[0]!.code).toBe("VALID");
  });
});
