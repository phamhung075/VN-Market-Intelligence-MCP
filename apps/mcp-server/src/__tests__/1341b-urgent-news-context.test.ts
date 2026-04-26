/**
 * 1341b: UrgentNews catalyst context fields
 *
 * Verifies that UrgentNewsFindingData and UrgentNewsBuilder support the
 * three optional cascade-enrichment traceability fields introduced in task 1341b:
 *   - catalyst_stock_code?: string (min 2 chars)
 *   - catalyst_direction?: "bullish" | "bearish" | "neutral"
 *   - time_to_price_move?: number (>= 0)
 */

import { describe, it, expect } from "bun:test";
import { UrgentNewsFindingDataSchema } from "../domain/signals/signalTypes";
import { createUrgentNewsBuilder } from "../domain/signals/signalBuilders";

// Helper: minimal valid base payload
const basePayload = {
  headline: "SBV announces emergency rate cut",
  source: "cafef",
  severity: "high" as const,
};

describe("1341b: UrgentNews catalyst context fields", () => {
  describe("UrgentNewsFindingDataSchema — optional fields accepted", () => {
    it("should accept payload without context fields (backward compat)", () => {
      const result = UrgentNewsFindingDataSchema.safeParse(basePayload);
      expect(result.success).toBe(true);
    });

    it("should accept catalyst_stock_code as optional string", () => {
      const result = UrgentNewsFindingDataSchema.safeParse({
        ...basePayload,
        catalyst_stock_code: "VCB",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.catalyst_stock_code).toBe("VCB");
      }
    });

    it("should accept catalyst_direction bullish", () => {
      const result = UrgentNewsFindingDataSchema.safeParse({
        ...basePayload,
        catalyst_direction: "bullish",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.catalyst_direction).toBe("bullish");
      }
    });

    it("should accept catalyst_direction bearish", () => {
      const result = UrgentNewsFindingDataSchema.safeParse({
        ...basePayload,
        catalyst_direction: "bearish",
      });
      expect(result.success).toBe(true);
    });

    it("should accept catalyst_direction neutral", () => {
      const result = UrgentNewsFindingDataSchema.safeParse({
        ...basePayload,
        catalyst_direction: "neutral",
      });
      expect(result.success).toBe(true);
    });

    it("should accept time_to_price_move >= 0", () => {
      const result = UrgentNewsFindingDataSchema.safeParse({
        ...basePayload,
        time_to_price_move: 4,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.time_to_price_move).toBe(4);
      }
    });

    it("should accept time_to_price_move = 0", () => {
      const result = UrgentNewsFindingDataSchema.safeParse({
        ...basePayload,
        time_to_price_move: 0,
      });
      expect(result.success).toBe(true);
    });

    it("should accept all three context fields together", () => {
      const result = UrgentNewsFindingDataSchema.safeParse({
        ...basePayload,
        catalyst_stock_code: "VCB",
        catalyst_direction: "bearish",
        time_to_price_move: 2.5,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.catalyst_stock_code).toBe("VCB");
        expect(result.data.catalyst_direction).toBe("bearish");
        expect(result.data.time_to_price_move).toBe(2.5);
      }
    });

    it("should reject catalyst_stock_code shorter than 2 chars", () => {
      const result = UrgentNewsFindingDataSchema.safeParse({
        ...basePayload,
        catalyst_stock_code: "V",
      });
      expect(result.success).toBe(false);
    });

    it("should reject invalid catalyst_direction value", () => {
      const result = UrgentNewsFindingDataSchema.safeParse({
        ...basePayload,
        catalyst_direction: "upward",
      });
      expect(result.success).toBe(false);
    });

    it("should reject time_to_price_move < 0", () => {
      const result = UrgentNewsFindingDataSchema.safeParse({
        ...basePayload,
        time_to_price_move: -1,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("UrgentNewsBuilder — new setter methods", () => {
    it("should set catalyst_stock_code via builder", () => {
      const signal = createUrgentNewsBuilder()
        .setHeadline("Bank liquidity crisis")
        .setSource("cafef")
        .setSeverity("critical")
        .setCatalystStockCode("VCB")
        .build();

      expect(signal.catalyst_stock_code).toBe("VCB");
    });

    it("should set catalyst_direction via builder", () => {
      const signal = createUrgentNewsBuilder()
        .setHeadline("Fed rate decision shocks market")
        .setSource("reuters")
        .setSeverity("high")
        .setCatalystDirection("bearish")
        .build();

      expect(signal.catalyst_direction).toBe("bearish");
    });

    it("should set time_to_price_move via builder", () => {
      const signal = createUrgentNewsBuilder()
        .setHeadline("Flash crash detected")
        .setSource("vnexpress")
        .setSeverity("critical")
        .setTimeToPriceMove(1)
        .build();

      expect(signal.time_to_price_move).toBe(1);
    });

    it("should build with all three context fields via builder", () => {
      const signal = createUrgentNewsBuilder()
        .setHeadline("Emergency SBV intervention")
        .setSource("cafef")
        .setSeverity("critical")
        .setCatalystStockCode("TCB")
        .setCatalystDirection("bullish")
        .setTimeToPriceMove(6)
        .build();

      expect(signal.catalyst_stock_code).toBe("TCB");
      expect(signal.catalyst_direction).toBe("bullish");
      expect(signal.time_to_price_move).toBe(6);
    });

    it("should build without context fields (fields remain undefined)", () => {
      const signal = createUrgentNewsBuilder()
        .setHeadline("Market update")
        .setSource("vnexpress")
        .setSeverity("low")
        .build();

      expect(signal.catalyst_stock_code).toBeUndefined();
      expect(signal.catalyst_direction).toBeUndefined();
      expect(signal.time_to_price_move).toBeUndefined();
    });
  });
});
