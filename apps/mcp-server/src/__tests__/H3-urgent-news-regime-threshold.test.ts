/**
 * H3 Verification — urgent_news regime-based confidence threshold
 *
 * RED test: posted before implementation. Covers:
 *   - NEUTRAL regime: urgent_news requires confidence >= 0.60
 *   - BULL   regime: urgent_news requires confidence >= 0.50
 *   - BEAR   regime: urgent_news requires confidence >= 0.40
 *   - No regime field → treated as NEUTRAL (strictest threshold)
 *   - Non-urgent_news signals are NOT subject to regime thresholds
 *   - Confidence at exact boundary passes (inclusive)
 *
 * The enforcement lives in checkRegimeConfidenceThreshold() (domain layer)
 * and is called by post_agent_signal before DB storage.
 */

import { describe, it, expect } from "bun:test";
import {
  checkRegimeConfidenceThreshold,
  type RegimeThresholdInput,
} from "../domain/services/regimeConfidenceThreshold.js";

describe("H3 — urgent_news regime confidence threshold", () => {
  // ── NEUTRAL regime ───────────────────────────────────────────────────────────

  describe("NEUTRAL regime (threshold=0.60)", () => {
    it("blocks urgent_news with confidence=0.50 under NEUTRAL", () => {
      const input: RegimeThresholdInput = {
        signal_type: "urgent_news",
        confidence: 0.50,
        regime: "NEUTRAL",
      };
      const result = checkRegimeConfidenceThreshold(input);
      expect(result.pass).toBe(false);
      if (result.pass) throw new Error("expected pass=false");
      expect(result.reason).toContain("0.50");
      expect(result.reason).toContain("0.60");
    });

    it("blocks urgent_news with confidence=0.59 under NEUTRAL", () => {
      const input: RegimeThresholdInput = {
        signal_type: "urgent_news",
        confidence: 0.59,
        regime: "NEUTRAL",
      };
      const result = checkRegimeConfidenceThreshold(input);
      expect(result.pass).toBe(false);
    });

    it("passes urgent_news with confidence=0.60 under NEUTRAL (exact boundary)", () => {
      const input: RegimeThresholdInput = {
        signal_type: "urgent_news",
        confidence: 0.60,
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

  // ── BULL regime ──────────────────────────────────────────────────────────────

  describe("BULL regime (threshold=0.50)", () => {
    it("blocks urgent_news with confidence=0.49 under BULL", () => {
      const input: RegimeThresholdInput = {
        signal_type: "urgent_news",
        confidence: 0.49,
        regime: "BULL",
      };
      const result = checkRegimeConfidenceThreshold(input);
      expect(result.pass).toBe(false);
      if (result.pass) throw new Error("expected pass=false");
      expect(result.reason).toContain("0.50");
    });

    it("passes urgent_news with confidence=0.50 under BULL (exact boundary)", () => {
      const input: RegimeThresholdInput = {
        signal_type: "urgent_news",
        confidence: 0.50,
        regime: "BULL",
      };
      const result = checkRegimeConfidenceThreshold(input);
      expect(result.pass).toBe(true);
    });
  });

  // ── BEAR regime ──────────────────────────────────────────────────────────────

  describe("BEAR regime (threshold=0.40)", () => {
    it("blocks urgent_news with confidence=0.39 under BEAR", () => {
      const input: RegimeThresholdInput = {
        signal_type: "urgent_news",
        confidence: 0.39,
        regime: "BEAR",
      };
      const result = checkRegimeConfidenceThreshold(input);
      expect(result.pass).toBe(false);
      if (result.pass) throw new Error("expected pass=false");
      expect(result.reason).toContain("0.40");
    });

    it("passes urgent_news with confidence=0.40 under BEAR (exact boundary)", () => {
      const input: RegimeThresholdInput = {
        signal_type: "urgent_news",
        confidence: 0.40,
        regime: "BEAR",
      };
      const result = checkRegimeConfidenceThreshold(input);
      expect(result.pass).toBe(true);
    });

    it("passes urgent_news with confidence=0.50 under BEAR", () => {
      const input: RegimeThresholdInput = {
        signal_type: "urgent_news",
        confidence: 0.50,
        regime: "BEAR",
      };
      const result = checkRegimeConfidenceThreshold(input);
      expect(result.pass).toBe(true);
    });
  });

  // ── Missing regime → NEUTRAL (strictest) ────────────────────────────────────

  describe("Missing regime falls back to NEUTRAL", () => {
    it("blocks urgent_news with confidence=0.50 when regime is undefined", () => {
      const input: RegimeThresholdInput = {
        signal_type: "urgent_news",
        confidence: 0.50,
        regime: undefined,
      };
      const result = checkRegimeConfidenceThreshold(input);
      expect(result.pass).toBe(false);
    });

    it("passes urgent_news with confidence=0.60 when regime is undefined", () => {
      const input: RegimeThresholdInput = {
        signal_type: "urgent_news",
        confidence: 0.60,
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
        regime: "NEUTRAL",
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
        regime: "NEUTRAL",
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
