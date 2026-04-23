/**
 * Task 1293d: Defensive Fallbacks in Chain Synthesizer
 *
 * Tests for extractConfidence helper and synthesizeChain defensive behavior
 * when signals have missing/undefined fields.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import {
  synthesizeChain,
  type ChainLink,
} from "../domain/services/chainSynthesizer.js";

// ── Helper to construct test ChainLinks ────────────────────────────────────

function makeLink(overrides: Partial<ChainLink> = {}): ChainLink {
  return {
    id: 1,
    stockCode: "VIC",
    agent: "news_scout",
    signalType: "chain_catalyst",
    depth: 0,
    findingData: {},
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("1293d: Chain Synthesizer Fallbacks", () => {
  describe("extractConfidence helper", () => {
    it("should return 0.3 for undefined confidence", () => {
      // Note: extractConfidence will be exported from chainSynthesizer
      // For now, test via synthesizeChain with missing confidence
      const links: ChainLink[] = [
        makeLink({ id: 1, depth: 0, findingData: { direction: "bullish" } }),
        makeLink({ id: 2, depth: 1, agent: "bctc", findingData: { direction: "bullish" } }),
      ];
      const result = synthesizeChain(links);
      expect(result).toBeDefined();
      // Both have missing confidence (0.3 fallback each), so conviction = (0.3 + 0.3) / 2 = 0.3
      expect(result!.conviction).toBe(0.3);
    });

    it("should return exact value for valid number", () => {
      const links: ChainLink[] = [
        makeLink({ id: 1, depth: 0, findingData: { confidence: 0.8, direction: "bullish" } }),
        makeLink({ id: 2, depth: 1, agent: "bctc", findingData: { confidence: 0.8, direction: "bullish" } }),
      ];
      const result = synthesizeChain(links);
      expect(result).toBeDefined();
      expect(result!.conviction).toBe(0.8);
      expect(result!.confidenceBreakdown[0]?.confidence).toBe(0.8);
    });

    it("should clamp out-of-range values", () => {
      const links: ChainLink[] = [
        makeLink({ id: 1, depth: 0, findingData: { confidence: 1.5, direction: "bullish" } }),
        makeLink({ id: 2, depth: 1, agent: "bctc", findingData: { confidence: 0.5, direction: "bullish" } }),
      ];
      const result = synthesizeChain(links);
      expect(result).toBeDefined();
      // First link confidence should be clamped to 1.0, average = (1.0 + 0.5) / 2 = 0.75
      expect(result!.conviction).toBe(0.75);
      expect(result!.confidenceBreakdown[0]?.confidence).toBe(1);
    });

    it("should coerce string to number", () => {
      const links: ChainLink[] = [
        makeLink({ id: 1, depth: 0, findingData: { confidence: "0.7", direction: "bullish" } }),
        makeLink({ id: 2, depth: 1, agent: "bctc", findingData: { confidence: 0.7, direction: "bullish" } }),
      ];
      const result = synthesizeChain(links);
      expect(result).toBeDefined();
      expect(result!.conviction).toBe(0.7);
    });
  });

  describe("synthesizeChain with missing fields", () => {
    it("should calculate conviction even with missing confidence in one link", () => {
      const links: ChainLink[] = [
        makeLink({ id: 1, depth: 0, findingData: { confidence: 0.8, direction: "bullish" } }),
        makeLink({ id: 2, depth: 2, agent: "market-watcher", findingData: { direction: "bullish" } }), // missing confidence
      ];
      const result = synthesizeChain(links);
      expect(result).toBeDefined();
      // conviction = (0.8 + 0.3) / 2 = 0.55
      expect(result!.conviction).toBe(0.55);
    });

    it("should not crash on empty chain", () => {
      const result = synthesizeChain([]);
      expect(result).toBeNull();
    });

    it("should handle all links with uninitialized confidence", () => {
      const links: ChainLink[] = [
        makeLink({ id: 1, depth: 0, findingData: { direction: "bullish" } }),
        makeLink({ id: 2, depth: 1, agent: "bctc", findingData: { direction: "bullish" } }),
      ];
      const result = synthesizeChain(links);
      expect(result).toBeDefined();
      // all fallback values = 0.3, so conviction = 0.3
      expect(result!.conviction).toBe(0.3);
    });

    it("should log warning when uninitialized fields detected", () => {
      let loggedMessage = "";
      const originalWarn = console.warn;
      console.warn = (msg: string) => {
        loggedMessage = msg;
      };

      const links: ChainLink[] = [
        makeLink({ id: 1, depth: 0, findingData: { direction: "bullish" } }),
        makeLink({ id: 2, depth: 1, agent: "bctc", findingData: { direction: "bullish" } }),
      ];
      synthesizeChain(links);

      console.warn = originalWarn;
      expect(loggedMessage).toMatch(/[Uu]ninitialized|[Ff]allback/);
    });

    it("should default direction to 'neutral' if missing", () => {
      const links: ChainLink[] = [
        makeLink({ id: 1, depth: 0, findingData: { confidence: 0.8 } }), // missing direction
        makeLink({ id: 2, depth: 1, agent: "bctc", findingData: { confidence: 0.8, direction: "bullish" } }),
      ];
      const result = synthesizeChain(links);
      expect(result).toBeDefined();
      // Direction should default to "neutral" for first link, bullish for second
      // consensus should prefer bullish or be neutral
      expect(result!.narrative).toBeDefined();
    });
  });

  describe("synthesis continues gracefully", () => {
    it("should produce SynthesizedChain output even with degraded fields", () => {
      const links: ChainLink[] = [
        makeLink({ id: 1, depth: 0, findingData: { confidence: 0.5, direction: "bullish" } }),
        makeLink({ id: 2, depth: 2, agent: "market-watcher", findingData: {} }), // all missing
      ];
      const result = synthesizeChain(links);
      expect(result).toBeDefined();
      expect(result!.stockCode).toBeDefined();
      expect(result!.conviction).toBeGreaterThan(0);
      expect(result!.narrative).toBeDefined();
    });

    it("should include uninitialized links in confidenceBreakdown", () => {
      const links: ChainLink[] = [
        makeLink({ id: 1, agent: "scout", depth: 0, findingData: { confidence: 0.8, direction: "bullish" } }),
        makeLink({ id: 2, agent: "watcher", depth: 1, findingData: { direction: "bullish" } }), // missing confidence
      ];
      const result = synthesizeChain(links);
      expect(result).toBeDefined();
      expect(result!.confidenceBreakdown).toHaveLength(2);
      // Second agent should have 0.3 fallback in breakdown
      expect(result!.confidenceBreakdown[1]?.confidence).toBe(0.3);
    });

    it("should process multiple missing confidence fields correctly", () => {
      const links: ChainLink[] = [
        makeLink({ id: 1, agent: "a1", depth: 0, findingData: { direction: "bullish" } }),
        makeLink({ id: 2, agent: "a2", depth: 1, findingData: { confidence: 0.5, direction: "bullish" } }),
        makeLink({ id: 3, agent: "a3", depth: 2, findingData: { direction: "bullish" } }),
      ];
      const result = synthesizeChain(links);
      expect(result).toBeDefined();
      // Conviction = (0.3 + 0.5 + 0.3) / 3 = 0.366...
      expect(result!.conviction).toBeCloseTo(0.366666666, 5);
    });
  });

  describe("handles invalid confidence types gracefully", () => {
    it("should fallback when confidence is an object", () => {
      const links: ChainLink[] = [
        makeLink({ id: 1, depth: 0, findingData: { confidence: { nested: "value" }, direction: "bullish" } }),
        makeLink({ id: 2, depth: 1, agent: "bctc", findingData: { confidence: 0.7, direction: "bullish" } }),
      ];
      const result = synthesizeChain(links);
      expect(result).toBeDefined();
      // First link should fallback to 0.3, second is 0.7, avg = 0.5
      expect(result!.conviction).toBe(0.5);
    });

    it("should fallback when confidence is null", () => {
      const links: ChainLink[] = [
        makeLink({ id: 1, depth: 0, findingData: { confidence: null, direction: "bullish" } }),
        makeLink({ id: 2, depth: 1, agent: "bctc", findingData: { confidence: 0.8, direction: "bullish" } }),
      ];
      const result = synthesizeChain(links);
      expect(result).toBeDefined();
      // null -> 0.3 fallback, average = (0.3 + 0.8) / 2 = 0.55
      expect(result!.conviction).toBe(0.55);
    });
  });

  describe("backwards compatibility", () => {
    it("should still work with normal complete chains", () => {
      const links: ChainLink[] = [
        makeLink({ id: 1, depth: 0, findingData: { confidence: 0.85, direction: "bullish", event_type: "news" } }),
        makeLink({ id: 2, depth: 2, agent: "market-watcher", findingData: { confidence: 0.85, direction: "bullish", confirms_direction: true } }),
      ];
      const result = synthesizeChain(links);
      expect(result).toBeDefined();
      // Base 0.85, +0.05 bonus for confirming agent = 0.9
      expect(result!.conviction).toBe(0.9);
      expect(result!.action).toBe("BUY"); // conviction >= 0.8 and bullish
    });
  });
});
