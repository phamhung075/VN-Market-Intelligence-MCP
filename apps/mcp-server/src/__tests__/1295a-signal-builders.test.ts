import { describe, it, expect } from "bun:test";
import {
  createChainCatalystBuilder,
  createPriceConfirmationBuilder,
  createUrgentNewsBuilder,
  createCrossValidateBuilder,
  type ChainCatalystBuilder,
  type PriceConfirmationBuilder,
  type UrgentNewsBuilder,
  type CrossValidateBuilder,
} from "../domain/signals/signalBuilders";

describe("1295a: Signal Builders", () => {
  describe("ChainCatalystBuilder", () => {
    it("should build complete ChainCatalyst signal with all 7 fields", () => {
      const signal = createChainCatalystBuilder()
        .setEventType("credit_policy")
        .setDirection("bullish")
        .setConfidence(0.85)
        .addStock("VNM")
        .addStock("BID")
        .addSector("FMCG")
        .addSector("Finance")
        .setHeadline("Central bank cuts rates")
        .setSource("cafef")
        .build();

      expect(signal.event_type).toBe("credit_policy");
      expect(signal.direction).toBe("bullish");
      expect(signal.confidence).toBe(0.85);
      expect(signal.affected_stocks).toContain("VNM");
      expect(signal.affected_stocks).toContain("BID");
      expect(signal.affected_sectors).toContain("FMCG");
      expect(signal.headline).toBe("Central bank cuts rates");
      expect(signal.source).toBe("cafef");
    });

    it("should throw error when missing event_type on build()", () => {
      const builder = createChainCatalystBuilder()
        .setDirection("bullish")
        .setConfidence(0.85)
        .addStock("VNM")
        .addSector("FMCG")
        .setHeadline("Test headline")
        .setSource("cafef");

      expect(() => builder.build()).toThrow();
    });

    it("should throw error when missing affected_stocks on build()", () => {
      const builder = createChainCatalystBuilder()
        .setEventType("credit_policy")
        .setDirection("bullish")
        .setConfidence(0.85)
        .addSector("FMCG")
        .setHeadline("Test headline")
        .setSource("cafef");

      expect(() => builder.build()).toThrow();
    });

    it("should throw error when missing headline on build()", () => {
      const builder = createChainCatalystBuilder()
        .setEventType("credit_policy")
        .setDirection("bullish")
        .setConfidence(0.85)
        .addStock("VNM")
        .addSector("FMCG")
        .setSource("cafef");

      expect(() => builder.build()).toThrow();
    });
  });

  describe("PriceConfirmationBuilder", () => {
    it("should build complete PriceConfirmation signal with all 5 fields", () => {
      const signal = createPriceConfirmationBuilder()
        .setPriceChangePct(2.5)
        .setVolumeRatio(1.8)
        .setConfirmsDirection(true)
        .setFullyPriced(false)
        .setConfidence(0.9)
        .build();

      expect(signal.price_change_pct).toBe(2.5);
      expect(signal.volume_ratio).toBe(1.8);
      expect(signal.confirms_direction).toBe(true);
      expect(signal.fully_priced).toBe(false);
      expect(signal.confidence).toBe(0.9);
    });

    it("should throw error when missing price_change_pct on build()", () => {
      const builder = createPriceConfirmationBuilder()
        .setVolumeRatio(1.8)
        .setConfirmsDirection(true)
        .setFullyPriced(false)
        .setConfidence(0.9);

      expect(() => builder.build()).toThrow();
    });

    it("should throw error when missing volume_ratio on build()", () => {
      const builder = createPriceConfirmationBuilder()
        .setPriceChangePct(2.5)
        .setConfirmsDirection(true)
        .setFullyPriced(false)
        .setConfidence(0.9);

      expect(() => builder.build()).toThrow();
    });

    it("should throw error when missing confidence on build()", () => {
      const builder = createPriceConfirmationBuilder()
        .setPriceChangePct(2.5)
        .setVolumeRatio(1.8)
        .setConfirmsDirection(true)
        .setFullyPriced(false);

      expect(() => builder.build()).toThrow();
    });
  });

  describe("UrgentNewsBuilder", () => {
    it("should build complete UrgentNews signal with all 3 fields", () => {
      const signal = createUrgentNewsBuilder()
        .setHeadline("Market crash detected")
        .setSource("reuters")
        .setSeverity("critical")
        .build();

      expect(signal.headline).toBe("Market crash detected");
      expect(signal.source).toBe("reuters");
      expect(signal.severity).toBe("critical");
    });

    it("should throw error when missing headline on build()", () => {
      const builder = createUrgentNewsBuilder()
        .setSource("reuters")
        .setSeverity("critical");

      expect(() => builder.build()).toThrow();
    });

    it("should throw error when missing source on build()", () => {
      const builder = createUrgentNewsBuilder()
        .setHeadline("Market crash detected")
        .setSeverity("critical");

      expect(() => builder.build()).toThrow();
    });

    it("should throw error when missing severity on build()", () => {
      const builder = createUrgentNewsBuilder()
        .setHeadline("Market crash detected")
        .setSource("reuters");

      expect(() => builder.build()).toThrow();
    });
  });

  describe("CrossValidateBuilder", () => {
    it("should build complete CrossValidate signal with all 3 fields", () => {
      const signal = createCrossValidateBuilder()
        .setDirection("bullish")
        .setConfidence(0.75)
        .setSummary("Price movement confirms catalyst signal direction")
        .build();

      expect(signal.direction).toBe("bullish");
      expect(signal.confidence).toBe(0.75);
      expect(signal.summary).toBe("Price movement confirms catalyst signal direction");
    });

    it("should throw error when missing direction on build()", () => {
      const builder = createCrossValidateBuilder()
        .setConfidence(0.75)
        .setSummary("Price movement confirms catalyst signal direction");

      expect(() => builder.build()).toThrow();
    });

    it("should throw error when missing confidence on build()", () => {
      const builder = createCrossValidateBuilder()
        .setDirection("bullish")
        .setSummary("Price movement confirms catalyst signal direction");

      expect(() => builder.build()).toThrow();
    });

    it("should throw error when missing summary on build()", () => {
      const builder = createCrossValidateBuilder()
        .setDirection("bullish")
        .setConfidence(0.75);

      expect(() => builder.build()).toThrow();
    });
  });
});
