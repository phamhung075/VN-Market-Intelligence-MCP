/**
 * 1341a: ChainCatalyst context fields
 *
 * Verifies that ChainCatalystFindingData and ChainCatalystBuilder support the
 * three optional cascade-enrichment traceability fields introduced in task 1341a:
 *   - catalyst_stock_code?: string (min 2 chars)
 *   - catalyst_direction?: "bullish" | "bearish" | "neutral"
 *   - time_to_price_move?: number (>= 0)
 */

import { describe, it, expect } from "bun:test";
import { ChainCatalystFindingDataSchema } from "../domain/signals/signalTypes";
import { createChainCatalystBuilder } from "../domain/signals/signalBuilders";

// Helper: minimal valid base payload
const basePayload = {
  event_type: "credit_policy" as const,
  direction: "bullish" as const,
  confidence: 0.8,
  affected_stocks: ["VCB"],
  affected_sectors: ["Banking"],
  headline: "Rate cut announced",
  source: "cafef",
};

describe("1341a: ChainCatalyst catalyst context fields", () => {
  describe("ChainCatalystFindingDataSchema — optional fields accepted", () => {
    it("should accept payload without context fields (backward compat)", () => {
      const result = ChainCatalystFindingDataSchema.safeParse(basePayload);
      expect(result.success).toBe(true);
    });

    it("should accept catalyst_stock_code as optional string", () => {
      const result = ChainCatalystFindingDataSchema.safeParse({
        ...basePayload,
        catalyst_stock_code: "VCB",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.catalyst_stock_code).toBe("VCB");
      }
    });

    it("should accept catalyst_direction bullish", () => {
      const result = ChainCatalystFindingDataSchema.safeParse({
        ...basePayload,
        catalyst_direction: "bullish",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.catalyst_direction).toBe("bullish");
      }
    });

    it("should accept catalyst_direction bearish", () => {
      const result = ChainCatalystFindingDataSchema.safeParse({
        ...basePayload,
        catalyst_direction: "bearish",
      });
      expect(result.success).toBe(true);
    });

    it("should accept catalyst_direction neutral", () => {
      const result = ChainCatalystFindingDataSchema.safeParse({
        ...basePayload,
        catalyst_direction: "neutral",
      });
      expect(result.success).toBe(true);
    });

    it("should accept time_to_price_move >= 0", () => {
      const result = ChainCatalystFindingDataSchema.safeParse({
        ...basePayload,
        time_to_price_move: 4,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.time_to_price_move).toBe(4);
      }
    });

    it("should accept time_to_price_move = 0", () => {
      const result = ChainCatalystFindingDataSchema.safeParse({
        ...basePayload,
        time_to_price_move: 0,
      });
      expect(result.success).toBe(true);
    });

    it("should accept all three context fields together", () => {
      const result = ChainCatalystFindingDataSchema.safeParse({
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
      const result = ChainCatalystFindingDataSchema.safeParse({
        ...basePayload,
        catalyst_stock_code: "V",
      });
      expect(result.success).toBe(false);
    });

    it("should reject invalid catalyst_direction value", () => {
      const result = ChainCatalystFindingDataSchema.safeParse({
        ...basePayload,
        catalyst_direction: "upward",
      });
      expect(result.success).toBe(false);
    });

    it("should reject time_to_price_move < 0", () => {
      const result = ChainCatalystFindingDataSchema.safeParse({
        ...basePayload,
        time_to_price_move: -1,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("ChainCatalystBuilder — new setter methods", () => {
    it("should set catalyst_stock_code via builder", () => {
      const signal = createChainCatalystBuilder()
        .setEventType("earnings")
        .setDirection("bullish")
        .setConfidence(0.9)
        .addStock("HPG")
        .addSector("Steel")
        .setHeadline("HPG Q1 earnings beat")
        .setSource("cafef")
        .setCatalystStockCode("HPG")
        .build();

      expect(signal.catalyst_stock_code).toBe("HPG");
    });

    it("should set catalyst_direction via builder", () => {
      const signal = createChainCatalystBuilder()
        .setEventType("macro")
        .setDirection("bearish")
        .setConfidence(0.7)
        .addStock("VCB")
        .addSector("Banking")
        .setHeadline("Fed raises rates")
        .setSource("reuters")
        .setCatalystDirection("bearish")
        .build();

      expect(signal.catalyst_direction).toBe("bearish");
    });

    it("should set time_to_price_move via builder", () => {
      const signal = createChainCatalystBuilder()
        .setEventType("trade_war")
        .setDirection("neutral")
        .setConfidence(0.6)
        .addStock("VNM")
        .addSector("FMCG")
        .setHeadline("Tariff update")
        .setSource("vnexpress")
        .setTimeToPriceMove(3)
        .build();

      expect(signal.time_to_price_move).toBe(3);
    });

    it("should build with all three context fields via builder", () => {
      const signal = createChainCatalystBuilder()
        .setEventType("credit_policy")
        .setDirection("bullish")
        .setConfidence(0.85)
        .addStock("TCB")
        .addSector("Banking")
        .setHeadline("SBV cuts reserve ratio")
        .setSource("cafef")
        .setCatalystStockCode("TCB")
        .setCatalystDirection("bullish")
        .setTimeToPriceMove(6)
        .build();

      expect(signal.catalyst_stock_code).toBe("TCB");
      expect(signal.catalyst_direction).toBe("bullish");
      expect(signal.time_to_price_move).toBe(6);
    });

    it("should build without context fields (fields remain undefined)", () => {
      const signal = createChainCatalystBuilder()
        .setEventType("sector_event")
        .setDirection("neutral")
        .setConfidence(0.5)
        .addStock("FPT")
        .addSector("Technology")
        .setHeadline("Tech sector review")
        .setSource("vnexpress")
        .build();

      expect(signal.catalyst_stock_code).toBeUndefined();
      expect(signal.catalyst_direction).toBeUndefined();
      expect(signal.time_to_price_move).toBeUndefined();
    });
  });
});
