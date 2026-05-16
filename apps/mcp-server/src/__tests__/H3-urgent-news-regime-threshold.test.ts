/**
 * H3 Verification — urgent_news regime-based confidence threshold
 *
 * Covers monetary-policy regime vocabulary (TIGHTENING | NEUTRAL | EASING)
 * aligned with get_macro_snapshot Global Liquidity classification.
 *
 *   TIGHTENING regime: urgent_news requires confidence >= 0.60
 *   NEUTRAL    regime: urgent_news requires confidence >= 0.55
 *   EASING     regime: urgent_news requires confidence >= 0.50
 *   No regime field   → treated as NEUTRAL (0.55 threshold)
 *   Non-urgent_news signals are NOT subject to regime thresholds
 *   Confidence at exact boundary passes (inclusive)
 */

import { describe, it, expect } from "bun:test";
import {
  checkRegimeConfidenceThreshold,
  type RegimeThresholdInput,
} from "../domain/services/regimeConfidenceThreshold.js";

describe("H3 — urgent_news regime confidence threshold", () => {
  // ── TIGHTENING regime ────────────────────────────────────────────────────────

  describe("TIGHTENING regime (threshold=0.60)", () => {
    it("blocks urgent_news with confidence=0.59 under TIGHTENING", () => {
      const input: RegimeThresholdInput = {
        signal_type: "urgent_news",
        confidence: 0.59,
        regime: "TIGHTENING",
      };
      const result = checkRegimeConfidenceThreshold(input);
      expect(result.pass).toBe(false);
      if (result.pass) throw new Error("expected pass=false");
      expect(result.reason).toContain("0.59");
      expect(result.reason).toContain("0.60");
    });

    it("passes urgent_news with confidence=0.60 under TIGHTENING (exact boundary)", () => {
      const input: RegimeThresholdInput = {
        signal_type: "urgent_news",
        confidence: 0.60,
        regime: "TIGHTENING",
      };
      const result = checkRegimeConfidenceThreshold(input);
      expect(result.pass).toBe(true);
    });

    it("passes urgent_news with confidence=0.85 under TIGHTENING", () => {
      const input: RegimeThresholdInput = {
        signal_type: "urgent_news",
        confidence: 0.85,
        regime: "TIGHTENING",
      };
      const result = checkRegimeConfidenceThreshold(input);
      expect(result.pass).toBe(true);
    });
  });

  // ── NEUTRAL regime ───────────────────────────────────────────────────────────

  describe("NEUTRAL regime (threshold=0.55)", () => {
    it("blocks urgent_news with confidence=0.54 under NEUTRAL", () => {
      const input: RegimeThresholdInput = {
        signal_type: "urgent_news",
        confidence: 0.54,
        regime: "NEUTRAL",
      };
      const result = checkRegimeConfidenceThreshold(input);
      expect(result.pass).toBe(false);
      if (result.pass) throw new Error("expected pass=false");
      expect(result.reason).toContain("0.54");
      expect(result.reason).toContain("0.55");
    });

    it("passes urgent_news with confidence=0.55 under NEUTRAL (exact boundary)", () => {
      const input: RegimeThresholdInput = {
        signal_type: "urgent_news",
        confidence: 0.55,
        regime: "NEUTRAL",
      };
      const result = checkRegimeConfidenceThreshold(input);
      expect(result.pass).toBe(true);
    });

    it("passes urgent_news with confidence=0.85 under NEUTRAL", () => {
      const input: RegimeThresholdInput = {
        signal_type: "urgent_news",
        confidence: 0.85,
        regime: "NEUTRAL",
      };
      const result = checkRegimeConfidenceThreshold(input);
      expect(result.pass).toBe(true);
    });
  });

  // ── EASING regime ────────────────────────────────────────────────────────────

  describe("EASING regime (threshold=0.50)", () => {
    it("blocks urgent_news with confidence=0.49 under EASING", () => {
      const input: RegimeThresholdInput = {
        signal_type: "urgent_news",
        confidence: 0.49,
        regime: "EASING",
      };
      const result = checkRegimeConfidenceThreshold(input);
      expect(result.pass).toBe(false);
      if (result.pass) throw new Error("expected pass=false");
      expect(result.reason).toContain("0.50");
    });

    it("passes urgent_news with confidence=0.50 under EASING (exact boundary)", () => {
      const input: RegimeThresholdInput = {
        signal_type: "urgent_news",
        confidence: 0.50,
        regime: "EASING",
      };
      const result = checkRegimeConfidenceThreshold(input);
      expect(result.pass).toBe(true);
    });

    it("passes urgent_news with confidence=0.75 under EASING", () => {
      const input: RegimeThresholdInput = {
        signal_type: "urgent_news",
        confidence: 0.75,
        regime: "EASING",
      };
      const result = checkRegimeConfidenceThreshold(input);
      expect(result.pass).toBe(true);
    });
  });

  // ── Missing regime → NEUTRAL (0.55 threshold) ───────────────────────────────

  describe("Missing regime falls back to NEUTRAL (0.55)", () => {
    it("blocks urgent_news with confidence=0.54 when regime is undefined", () => {
      const input: RegimeThresholdInput = {
        signal_type: "urgent_news",
        confidence: 0.54,
        regime: undefined,
      };
      const result = checkRegimeConfidenceThreshold(input);
      expect(result.pass).toBe(false);
    });

    it("passes urgent_news with confidence=0.55 when regime is undefined", () => {
      const input: RegimeThresholdInput = {
        signal_type: "urgent_news",
        confidence: 0.55,
        regime: undefined,
      };
      const result = checkRegimeConfidenceThreshold(input);
      expect(result.pass).toBe(true);
    });
  });

  // ── Non-urgent_news signals bypass regime check ──────────────────────────────

  describe("Non-urgent_news signals bypass regime threshold", () => {
    it("chain_catalyst passes regardless of low confidence", () => {
      const input: RegimeThresholdInput = {
        signal_type: "chain_catalyst",
        confidence: 0.10,
        regime: "TIGHTENING",
      };
      const result = checkRegimeConfidenceThreshold(input);
      expect(result.pass).toBe(true);
    });

    it("price_anomaly passes regardless of low confidence", () => {
      const input: RegimeThresholdInput = {
        signal_type: "price_anomaly",
        confidence: 0.10,
        regime: "NEUTRAL",
      };
      const result = checkRegimeConfidenceThreshold(input);
      expect(result.pass).toBe(true);
    });

    it("cross_validate passes regardless of low confidence", () => {
      const input: RegimeThresholdInput = {
        signal_type: "cross_validate",
        confidence: 0.10,
        regime: "EASING",
      };
      const result = checkRegimeConfidenceThreshold(input);
      expect(result.pass).toBe(true);
    });
  });

  // ── urgent_news with no confidence field → passes (backwards compat) ─────────

  describe("urgent_news without confidence field", () => {
    it("passes when no confidence is provided (field absent)", () => {
      const input: RegimeThresholdInput = {
        signal_type: "urgent_news",
        confidence: undefined,
        regime: "NEUTRAL",
      };
      const result = checkRegimeConfidenceThreshold(input);
      // No confidence supplied → cannot enforce threshold → pass through
      // (schema validation catches missing required fields separately)
      expect(result.pass).toBe(true);
    });
  });
});
