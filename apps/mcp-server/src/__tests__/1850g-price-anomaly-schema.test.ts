/**
 * Task 1850g: PriceAnomalyFindingDataSchema — market-watcher payload compatibility
 *
 * RED tests: verify the schema accepts what market-watcher actually sends
 * (move_pct, move_sigma, price_change_pct + optional regime/fx fields)
 * and does NOT require ref_price or window_days.
 */

import { describe, it, expect } from "bun:test";
import { PriceAnomalyFindingDataSchema } from "../domain/signals/signalTypes";
import { validateSignalPayload } from "../interface/mcp/tools/news-analysis/agentSignalTools";

describe("1850g: PriceAnomalyFindingDataSchema — market-watcher compat", () => {
  describe("AC-1: schema accepts the payload market-watcher sends", () => {
    it("should accept payload with move_pct + move_sigma only (no ref_price/window_days)", () => {
      const payload = {
        move_pct: 3.5,
        move_sigma: 2.1,
      };
      const result = PriceAnomalyFindingDataSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it("should accept payload with price_change_pct as extra field", () => {
      const payload = {
        move_pct: 3.5,
        move_sigma: 2.1,
        price_change_pct: 3.5,
      };
      const result = PriceAnomalyFindingDataSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it("should accept payload with regime and adjusted_threshold (flow doc fields)", () => {
      const payload = {
        move_pct: -2.8,
        move_sigma: 1.9,
        price_change_pct: -2.8,
        regime: "TIGHTENING",
        adjusted_threshold: "1.5σ",
        fx_pressure: false,
        pe_compression_risk: true,
      };
      const result = PriceAnomalyFindingDataSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it("should accept payload with optional ref_price provided", () => {
      const payload = {
        move_pct: 4.2,
        move_sigma: 2.5,
        ref_price: 85000,
      };
      const result = PriceAnomalyFindingDataSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it("should accept payload with optional window_days provided", () => {
      const payload = {
        move_pct: 4.2,
        move_sigma: 2.5,
        window_days: 30,
      };
      const result = PriceAnomalyFindingDataSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it("should accept full payload with all optional fields", () => {
      const payload = {
        move_pct: 3.5,
        move_sigma: 2.1,
        ref_price: 90000,
        window_days: 30,
        price_change_pct: 3.5,
        regime: "NEUTRAL",
        adjusted_threshold: "2.0σ",
        fx_pressure: false,
        pe_compression_risk: false,
      };
      const result = PriceAnomalyFindingDataSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });
  });

  describe("AC-4: no required fields agents cannot provide", () => {
    it("should NOT require ref_price — omitting it must pass", () => {
      const payload = { move_pct: 2.0, move_sigma: 1.5 };
      const result = PriceAnomalyFindingDataSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it("should NOT require window_days — omitting it must pass", () => {
      const payload = { move_pct: 2.0, move_sigma: 1.5 };
      const result = PriceAnomalyFindingDataSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it("should still require move_pct", () => {
      const payload = { move_sigma: 1.5 };
      const result = PriceAnomalyFindingDataSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("should still require move_sigma", () => {
      const payload = { move_pct: 2.0 };
      const result = PriceAnomalyFindingDataSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  describe("AC-1: validateSignalPayload('price_anomaly', ...) accepts market-watcher payload", () => {
    it("should return valid=true for minimal market-watcher payload", () => {
      const payload = {
        move_pct: -3.2,
        move_sigma: 2.3,
        price_change_pct: -3.2,
        regime: "TIGHTENING",
        adjusted_threshold: "1.5σ",
        fx_pressure: true,
        pe_compression_risk: false,
      };
      const result = validateSignalPayload("price_anomaly", payload);
      expect(result.valid).toBe(true);
    });

    it("should return valid=false for completely empty payload", () => {
      const result = validateSignalPayload("price_anomaly", {});
      expect(result.valid).toBe(false);
    });

    it("should return valid=false when move_pct missing", () => {
      const payload = { move_sigma: 2.0 };
      const result = validateSignalPayload("price_anomaly", payload);
      expect(result.valid).toBe(false);
    });
  });

  describe("AC-3: backward compat — schema still validates numeric types", () => {
    it("should reject move_pct as string", () => {
      const payload = { move_pct: "3.5", move_sigma: 2.1 };
      const result = PriceAnomalyFindingDataSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("should reject move_sigma as string", () => {
      const payload = { move_pct: 3.5, move_sigma: "2.1" };
      const result = PriceAnomalyFindingDataSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("should reject window_days as float when provided", () => {
      const payload = { move_pct: 3.5, move_sigma: 2.1, window_days: 30.5 };
      const result = PriceAnomalyFindingDataSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("should reject window_days as zero or negative when provided", () => {
      const payload = { move_pct: 3.5, move_sigma: 2.1, window_days: 0 };
      const result = PriceAnomalyFindingDataSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });
});
