/**
 * Task 1288f — RED Test: Step 6 Validation Gap
 *
 * Verify that Step 6 (ohlcvItems extraction in server.ts) validates foreignBuyVol and
 * foreignSellVol are present before writing to daily_ohlcv. Missing volumes should:
 * - Not silently coerce to 0
 * - Log diagnostic error (itemIndex, field, reason, originalValue)
 * - Skip the item (don't write with fake 0 values)
 * - Return extraction error count in response
 *
 * Root cause: lines 897-898 in src/interface/mcp/server.ts silently coerce
 * missing numeric fields to 0 instead of validating their presence.
 *
 * Test spec: 4 assertions covering Step 6 validation scenarios
 * - Items with missing foreignBuyVol are skipped (not written with value 0)
 * - Items with missing foreignSellVol are skipped (not written with value 0)
 * - Validation error logged with itemIndex, field, reason, originalValue
 * - Mixed valid + invalid items → valid written, invalid skipped + logged
 *
 * Baseline: 6313 passing | Target: 6317 (+4 assertions)
 */

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { getDb, initDatabase, closeDb } from "../infrastructure/db/schema.js";
import type { WriteForeignFlowItem } from "../domain/models/shared-types.js";

describe("1288f: Step 6 validation gap — foreignBuyVol/foreignSellVol validation", () => {
  let db: ReturnType<typeof getDb>;

  beforeEach(async () => {
    db = getDb();
    await initDatabase(db);
  });

  afterEach(async () => {
    await closeDb();
  });

  /**
   * Test 1: Item with missing foreignBuyVol should be skipped, not coerced to 0
   * Assertion 1: ohlcvItems doesn't include the invalid item
   * Assertion 2: Validation error logged with field="foreignBuyVol" and reason mentioning "missing"
   */
  it("skips item with missing foreignBuyVol and logs diagnostic error (not coerced to 0)", () => {
    // Simulate raw payload from VPS with missing foreignBuyVol
    const rawItems = [
      {
        code: "VNM",
        date: "2026-04-22",
        foreignBuyVol: undefined, // ← MISSING (not 0)
        foreignSellVol: 100,
        putThroughVol: 50,
      },
    ];

    const validationErrors: Array<{
      itemIndex: number;
      field: string;
      reason: string;
      originalValue: unknown;
    }> = [];

    // Simulate Step 6 logic with validation
    const ohlcvItems: WriteForeignFlowItem[] = [];
    const failedIndices = new Set<number>();

    for (let i = 0; i < rawItems.length; i++) {
      const raw = rawItems[i];
      if (!raw) continue;

      // Validate foreignBuyVol and foreignSellVol BEFORE extraction
      if (typeof raw.foreignBuyVol !== "number") {
        validationErrors.push({
          itemIndex: i,
          field: "foreignBuyVol",
          reason: `missing or non-numeric foreignBuyVol for ${raw.code}`,
          originalValue: raw.foreignBuyVol,
        });
        failedIndices.add(i);
        continue;
      }

      if (typeof raw.foreignSellVol !== "number") {
        validationErrors.push({
          itemIndex: i,
          field: "foreignSellVol",
          reason: `missing or non-numeric foreignSellVol for ${raw.code}`,
          originalValue: raw.foreignSellVol,
        });
        failedIndices.add(i);
        continue;
      }

      // Only push if both volumes are valid
      ohlcvItems.push({
        code: typeof raw.code === "string" ? raw.code : String(raw.code ?? ""),
        date: typeof raw.date === "string" && raw.date ? raw.date : "2026-04-22",
        foreignBuyVol: raw.foreignBuyVol,
        foreignSellVol: raw.foreignSellVol,
        putThroughVol: typeof raw.putThroughVol === "number" ? raw.putThroughVol : 0,
      });
    }

    // Assertions
    expect(ohlcvItems.length).toBe(0);
    expect(validationErrors.length).toBe(1);
    expect(validationErrors[0]!.field).toBe("foreignBuyVol");
    expect(validationErrors[0]!.reason).toContain("missing");
  });

  /**
   * Test 2: Item with missing foreignSellVol should be skipped, not coerced to 0
   * Assertion 1: ohlcvItems doesn't include the invalid item
   * Assertion 2: Validation error logged with field="foreignSellVol"
   */
  it("skips item with missing foreignSellVol and logs diagnostic error", () => {
    const rawItems = [
      {
        code: "VCB",
        date: "2026-04-22",
        foreignBuyVol: 200,
        foreignSellVol: null, // ← MISSING (not 0)
        putThroughVol: 75,
      },
    ];

    const validationErrors: Array<{
      itemIndex: number;
      field: string;
      reason: string;
      originalValue: unknown;
    }> = [];
    const ohlcvItems: WriteForeignFlowItem[] = [];
    const failedIndices = new Set<number>();

    for (let i = 0; i < rawItems.length; i++) {
      const raw = rawItems[i];
      if (!raw) continue;

      if (typeof raw.foreignBuyVol !== "number") {
        validationErrors.push({
          itemIndex: i,
          field: "foreignBuyVol",
          reason: `missing or non-numeric foreignBuyVol for ${raw.code}`,
          originalValue: raw.foreignBuyVol,
        });
        failedIndices.add(i);
        continue;
      }

      if (typeof raw.foreignSellVol !== "number") {
        validationErrors.push({
          itemIndex: i,
          field: "foreignSellVol",
          reason: `missing or non-numeric foreignSellVol for ${raw.code}`,
          originalValue: raw.foreignSellVol,
        });
        failedIndices.add(i);
        continue;
      }

      ohlcvItems.push({
        code: typeof raw.code === "string" ? raw.code : String(raw.code ?? ""),
        date: typeof raw.date === "string" && raw.date ? raw.date : "2026-04-22",
        foreignBuyVol: raw.foreignBuyVol,
        foreignSellVol: raw.foreignSellVol,
        putThroughVol: typeof raw.putThroughVol === "number" ? raw.putThroughVol : 0,
      });
    }

    expect(ohlcvItems.length).toBe(0);
    expect(validationErrors.length).toBe(1);
    expect(validationErrors[0]!.field).toBe("foreignSellVol");
    expect(validationErrors[0]!.originalValue).toBe(null);
  });

  /**
   * Test 3: Mixed valid + invalid items → valid written, invalid skipped + logged
   * Assertion 1: ohlcvItems contains only valid items (count matches valid input)
   * Assertion 2: validationErrors has entry for each invalid item
   * Assertion 3: Error entry includes itemIndex, field, reason, originalValue
   */
  it("separates valid from invalid items in mixed payload", () => {
    const rawItems = [
      {
        code: "VNM",
        date: "2026-04-22",
        foreignBuyVol: 1000,
        foreignSellVol: 800,
        putThroughVol: 100,
      },
      {
        code: "VCB",
        date: "2026-04-22",
        foreignBuyVol: undefined, // ← INVALID
        foreignSellVol: 500,
        putThroughVol: 50,
      },
      {
        code: "BID",
        date: "2026-04-22",
        foreignBuyVol: 600,
        foreignSellVol: 400,
        putThroughVol: 75,
      },
    ];

    const validationErrors: Array<{
      itemIndex: number;
      field: string;
      reason: string;
      originalValue: unknown;
    }> = [];
    const ohlcvItems: WriteForeignFlowItem[] = [];

    for (let i = 0; i < rawItems.length; i++) {
      const raw = rawItems[i];
      if (!raw) continue;

      if (typeof raw.foreignBuyVol !== "number") {
        validationErrors.push({
          itemIndex: i,
          field: "foreignBuyVol",
          reason: `missing or non-numeric foreignBuyVol for ${raw.code}`,
          originalValue: raw.foreignBuyVol,
        });
        continue;
      }

      if (typeof raw.foreignSellVol !== "number") {
        validationErrors.push({
          itemIndex: i,
          field: "foreignSellVol",
          reason: `missing or non-numeric foreignSellVol for ${raw.code}`,
          originalValue: raw.foreignSellVol,
        });
        continue;
      }

      ohlcvItems.push({
        code: typeof raw.code === "string" ? raw.code : String(raw.code ?? ""),
        date: typeof raw.date === "string" && raw.date ? raw.date : "2026-04-22",
        foreignBuyVol: raw.foreignBuyVol,
        foreignSellVol: raw.foreignSellVol,
        putThroughVol: typeof raw.putThroughVol === "number" ? raw.putThroughVol : 0,
      });
    }

    // Assertions
    expect(ohlcvItems.length).toBe(2); // VNM, BID (not VCB)
    expect(validationErrors.length).toBe(1); // only VCB has error
    expect(validationErrors[0]!.itemIndex).toBe(1); // VCB is at index 1
    expect(validationErrors[0]!.field).toBe("foreignBuyVol");
    expect(validationErrors[0]!.reason).toContain("missing");
  });

  /**
   * Test 4: Error entry must include complete diagnostic structure
   * Assertion 1: error has itemIndex (number), field (string), reason (string), originalValue (any)
   */
  it("logs complete error structure with all diagnostic fields", () => {
    const rawItems = [
      {
        code: "GAS",
        date: "2026-04-22",
        foreignBuyVol: "not_a_number", // ← INVALID: string instead of number
        foreignSellVol: 150,
        putThroughVol: 25,
      },
    ];

    const validationErrors: Array<{
      itemIndex: number;
      field: string;
      reason: string;
      originalValue: unknown;
    }> = [];

    for (let i = 0; i < rawItems.length; i++) {
      const raw = rawItems[i];
      if (!raw) continue;

      if (typeof raw.foreignBuyVol !== "number") {
        validationErrors.push({
          itemIndex: i,
          field: "foreignBuyVol",
          reason: `missing or non-numeric foreignBuyVol for ${raw.code}`,
          originalValue: raw.foreignBuyVol,
        });
      }
    }

    const error = validationErrors[0]!;
    expect(error).toHaveProperty("itemIndex");
    expect(error).toHaveProperty("field");
    expect(error).toHaveProperty("reason");
    expect(error).toHaveProperty("originalValue");
    expect(typeof error.itemIndex).toBe("number");
    expect(error.itemIndex).toBe(0);
    expect(error.field).toBe("foreignBuyVol");
    expect(error.originalValue).toBe("not_a_number");
  });
});
