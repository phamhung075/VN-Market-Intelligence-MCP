import { describe, it, expect } from "bun:test";
import {
  ChainCatalystFindingDataSchema,
  PriceConfirmationFindingDataSchema,
  UrgentNewsFindingDataSchema,
  type ChainCatalystFindingData,
  type PriceConfirmationFindingData,
  type UrgentNewsFindingData,
} from "../domain/signals/signalTypes";

describe("1293a: Signal Type Safety", () => {
  describe("ChainCatalystFindingData", () => {
    it("should accept complete payload with all 7 fields", () => {
      const payload = {
        event_type: "credit_policy",
        direction: "bullish",
        confidence: 0.75,
        affected_stocks: ["VNM", "BID"],
        affected_sectors: ["FMCG", "Finance"],
        headline: "Central bank cuts rates",
        source: "cafef",
      };
      const result = ChainCatalystFindingDataSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.event_type).toBe("credit_policy");
        expect(result.data.confidence).toBe(0.75);
      }
    });

    it("should reject missing event_type", () => {
      const payload = {
        direction: "bullish",
        confidence: 0.75,
        affected_stocks: ["VNM"],
        affected_sectors: ["FMCG"],
        headline: "Test headline",
        source: "cafef",
      };
      const result = ChainCatalystFindingDataSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("should reject undefined confidence", () => {
      const payload = {
        event_type: "macro",
        direction: "bullish",
        confidence: undefined,
        affected_stocks: ["VNM"],
        affected_sectors: ["FMCG"],
        headline: "Test headline",
        source: "cafef",
      };
      const result = ChainCatalystFindingDataSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("should reject confidence outside [0, 1]", () => {
      const payload = {
        event_type: "earnings",
        direction: "bullish",
        confidence: 1.5,
        affected_stocks: ["VNM"],
        affected_sectors: ["FMCG"],
        headline: "Test headline",
        source: "cafef",
      };
      const result = ChainCatalystFindingDataSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("should reject invalid event_type", () => {
      const payload = {
        event_type: "unknown_type",
        direction: "bullish",
        confidence: 0.75,
        affected_stocks: ["VNM"],
        affected_sectors: ["FMCG"],
        headline: "Test headline",
        source: "cafef",
      };
      const result = ChainCatalystFindingDataSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("should reject empty affected_stocks array", () => {
      const payload = {
        event_type: "credit_policy",
        direction: "bullish",
        confidence: 0.75,
        affected_stocks: [],
        affected_sectors: ["FMCG"],
        headline: "Test headline",
        source: "cafef",
      };
      const result = ChainCatalystFindingDataSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("should reject empty headline string", () => {
      const payload = {
        event_type: "trade_war",
        direction: "bearish",
        confidence: 0.6,
        affected_stocks: ["VNM"],
        affected_sectors: ["FMCG"],
        headline: "",
        source: "vnexpress",
      };
      const result = ChainCatalystFindingDataSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("should accept all valid event_type enum values", () => {
      const eventTypes = [
        "credit_policy",
        "trade_war",
        "earnings",
        "macro",
        "legal",
        "crisis",
        "sector_event",
      ] as const;

      eventTypes.forEach((eventType) => {
        const payload = {
          event_type: eventType,
          direction: "bullish",
          confidence: 0.5,
          affected_stocks: ["VNM"],
          affected_sectors: ["FMCG"],
          headline: "Test headline",
          source: "cafef",
        };
        const result = ChainCatalystFindingDataSchema.safeParse(payload);
        expect(result.success).toBe(true);
      });
    });

    it("should accept all valid direction enum values", () => {
      const directions = ["bullish", "bearish", "neutral"] as const;

      directions.forEach((direction) => {
        const payload = {
          event_type: "macro",
          direction: direction,
          confidence: 0.5,
          affected_stocks: ["VNM"],
          affected_sectors: ["FMCG"],
          headline: "Test headline",
          source: "cafef",
        };
        const result = ChainCatalystFindingDataSchema.safeParse(payload);
        expect(result.success).toBe(true);
      });
    });
  });

  describe("PriceConfirmationFindingData", () => {
    it("should accept complete payload with all 5 fields", () => {
      const payload = {
        price_change_pct: 2.5,
        volume_ratio: 1.8,
        confirms_direction: true,
        fully_priced: false,
        confidence: 0.85,
      };
      const result = PriceConfirmationFindingDataSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.price_change_pct).toBe(2.5);
        expect(result.data.volume_ratio).toBe(1.8);
        expect(result.data.confidence).toBe(0.85);
      }
    });

    it("should reject missing price_change_pct", () => {
      const payload = {
        volume_ratio: 1.8,
        confirms_direction: true,
        fully_priced: false,
        confidence: 0.85,
      };
      const result = PriceConfirmationFindingDataSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("should reject missing volume_ratio", () => {
      const payload = {
        price_change_pct: 2.5,
        confirms_direction: true,
        fully_priced: false,
        confidence: 0.85,
      };
      const result = PriceConfirmationFindingDataSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("should reject undefined confidence", () => {
      const payload = {
        price_change_pct: 2.5,
        volume_ratio: 1.8,
        confirms_direction: true,
        fully_priced: false,
        confidence: undefined,
      };
      const result = PriceConfirmationFindingDataSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("should reject confidence outside [0, 1]", () => {
      const payload = {
        price_change_pct: 2.5,
        volume_ratio: 1.8,
        confirms_direction: true,
        fully_priced: false,
        confidence: -0.1,
      };
      const result = PriceConfirmationFindingDataSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("should reject negative volume_ratio", () => {
      const payload = {
        price_change_pct: 2.5,
        volume_ratio: -1.5,
        confirms_direction: true,
        fully_priced: false,
        confidence: 0.85,
      };
      const result = PriceConfirmationFindingDataSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("should accept zero volume_ratio", () => {
      const payload = {
        price_change_pct: 0,
        volume_ratio: 0,
        confirms_direction: false,
        fully_priced: true,
        confidence: 0.5,
      };
      const result = PriceConfirmationFindingDataSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it("should reject non-boolean confirms_direction", () => {
      const payload = {
        price_change_pct: 2.5,
        volume_ratio: 1.8,
        confirms_direction: "true",
        fully_priced: false,
        confidence: 0.85,
      };
      const result = PriceConfirmationFindingDataSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  describe("UrgentNewsFindingData", () => {
    it("should accept complete payload with all 3 fields", () => {
      const payload = {
        headline: "Market crash detected",
        source: "reuters",
        severity: "critical",
      };
      const result = UrgentNewsFindingDataSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.headline).toBe("Market crash detected");
        expect(result.data.severity).toBe("critical");
      }
    });

    it("should reject missing headline", () => {
      const payload = {
        source: "reuters",
        severity: "high",
      };
      const result = UrgentNewsFindingDataSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("should reject missing source", () => {
      const payload = {
        headline: "Market event",
        severity: "high",
      };
      const result = UrgentNewsFindingDataSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("should reject missing severity", () => {
      const payload = {
        headline: "Market event",
        source: "reuters",
      };
      const result = UrgentNewsFindingDataSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("should reject invalid severity value", () => {
      const payload = {
        headline: "Market event",
        source: "reuters",
        severity: "urgent",
      };
      const result = UrgentNewsFindingDataSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("should accept all valid severity enum values", () => {
      const severities = ["low", "medium", "high", "critical"] as const;

      severities.forEach((severity) => {
        const payload = {
          headline: "Market event",
          source: "reuters",
          severity: severity,
        };
        const result = UrgentNewsFindingDataSchema.safeParse(payload);
        expect(result.success).toBe(true);
      });
    });

    it("should reject empty headline string", () => {
      const payload = {
        headline: "",
        source: "reuters",
        severity: "high",
      };
      const result = UrgentNewsFindingDataSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("should reject empty source string", () => {
      const payload = {
        headline: "Market event",
        source: "",
        severity: "high",
      };
      const result = UrgentNewsFindingDataSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  describe("Type guard integration", () => {
    it("should allow TypeScript compile-time type checking for ChainCatalystFindingData", () => {
      const payload: ChainCatalystFindingData = {
        event_type: "credit_policy",
        direction: "bullish",
        confidence: 0.75,
        affected_stocks: ["VNM"],
        affected_sectors: ["FMCG"],
        headline: "Test headline",
        source: "cafef",
      };
      expect(payload.event_type).toBe("credit_policy");
    });

    it("should allow TypeScript compile-time type checking for PriceConfirmationFindingData", () => {
      const payload: PriceConfirmationFindingData = {
        price_change_pct: 2.5,
        volume_ratio: 1.8,
        confirms_direction: true,
        fully_priced: false,
        confidence: 0.85,
      };
      expect(payload.confidence).toBe(0.85);
    });

    it("should allow TypeScript compile-time type checking for UrgentNewsFindingData", () => {
      const payload: UrgentNewsFindingData = {
        headline: "Test",
        source: "reuters",
        severity: "high",
      };
      expect(payload.severity).toBe("high");
    });
  });
});
