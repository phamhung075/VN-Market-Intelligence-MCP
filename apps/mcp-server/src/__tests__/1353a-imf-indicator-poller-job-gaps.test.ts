/**
 * TASK_1353a — imfIndicatorPollerJob gap-fill tests
 *
 * Covers paths not reached by 1296b-imf-integration.test.ts:
 *   1–2. fetchFn returns [] → early-throw path → success:false
 *   3–5. Happy path: storeFn + classifyFn wired correctly, indicator_count correct
 *   6.   fetchFn throws → outer catch absorbs, success:false
 *   7.   storeFn throws → outer catch absorbs, success:false
 *   8.   classifyFn throws → outer catch absorbs, success:false
 *
 * Prerequisite: runImfIndicatorPollerJob must accept optional DI overload
 * (fetchFn / storeFn / classifyFn). See TASK_1353.md risk flag.
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect } from "bun:test";
import { runImfIndicatorPollerJob } from "../scheduler/market-data/imfIndicatorPollerJob.js";
import type { ImfIndicator, ImfClassificationInput, ImfClassificationOutput } from "../domain/models/imfIndicators.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ── Shared helpers ────────────────────────────────────────────────────────────

function makeIndicator(overrides: Partial<ImfIndicator> = {}): ImfIndicator {
  return {
    code: "NGDP_RPCH",
    name: "Global GDP Growth (%)",
    value: 3.1,
    publishedAt: "2026-01-01T00:00:00Z",
    ageInDays: 5,
    previousValue: 3.0,
    yoyChange: 0.1,
    source: "imf_api",
    confidence: 0.95,
    ...overrides,
  };
}

function stubClassify(): ImfClassificationOutput {
  return {
    sentiment: 0.4,
    confidence: 0.80,
    classification: "imf_bullish",
    reasoning: "Stub reasoning",
    sectorImpacts: [],
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Task 1353a — imfIndicatorPollerJob gap tests", () => {

  // ---------------------------------------------------------------------------
  describe("fetchFn returns [] — early-exit path", () => {

    it("test 1: returns success:false when fetchFn returns empty array", async () => {
      const result = await runImfIndicatorPollerJob({
        fetchFn: async () => [],
        storeFn: async () => { throw new Error("storeFn must not be called"); },
        classifyFn: () => { throw new Error("classifyFn must not be called"); },
      });

      expect(result.success).toBe(false);
      expect(result.indicator_count).toBe(0);
    });

    it("test 2: error message equals circuit-breaker string when fetchFn returns []", async () => {
      const result = await runImfIndicatorPollerJob({
        fetchFn: async () => [],
        storeFn: async () => {},
        classifyFn: () => stubClassify(),
      });

      expect(result.error).toBe("IMF circuit breaker open or API unreachable");
    });
  });

  // ---------------------------------------------------------------------------
  describe("Happy path — storeFn and classifyFn wired correctly", () => {

    it("test 3: storeFn is called with the indicators from fetchFn", async () => {
      const ind = makeIndicator();
      let storedArgs: ImfIndicator[] | undefined;

      await runImfIndicatorPollerJob({
        fetchFn: async () => [ind],
        storeFn: async (indicators) => { storedArgs = indicators; },
        classifyFn: () => stubClassify(),
      });

      expect(storedArgs).toEqual([ind]);
    });

    it("test 4: indicator_count equals number of indicators returned by fetchFn", async () => {
      const indicators = [makeIndicator(), makeIndicator({ code: "PCPI_EM" }), makeIndicator({ code: "POILAPSP" })];

      const result = await runImfIndicatorPollerJob({
        fetchFn: async () => indicators,
        storeFn: async () => {},
        classifyFn: () => stubClassify(),
      });

      expect(result.success).toBe(true);
      expect(result.indicator_count).toBe(3);
    });

    it("test 5: result.sentiment deep-equals the object returned by classifyFn", async () => {
      const ind = makeIndicator();
      const expected = stubClassify();

      let capturedInput: ImfClassificationInput | undefined;
      const result = await runImfIndicatorPollerJob({
        fetchFn: async () => [ind],
        storeFn: async () => {},
        classifyFn: (input) => {
          capturedInput = input;
          return expected;
        },
      });

      expect(result.success).toBe(true);
      expect(result.sentiment).toEqual(expected);
      // classifyFn receives the indicators and the hardcoded baseline
      expect(capturedInput?.indicators).toEqual([ind]);
      expect(capturedInput?.historicalBaseline).toBe(3.0);
    });
  });

  // ---------------------------------------------------------------------------
  describe("Error absorption — outer catch path", () => {

    it("test 6: fetchFn throws → success:false, error captured, does not re-throw", async () => {
      const result = await runImfIndicatorPollerJob({
        fetchFn: async () => { throw new Error("network timeout"); },
        storeFn: async () => {},
        classifyFn: () => stubClassify(),
      });

      expect(result.success).toBe(false);
      expect(result.indicator_count).toBe(0);
      expect(result.error).toBe("network timeout");
    });

    it("test 7: storeFn throws → success:false, error equals storeFn message", async () => {
      const result = await runImfIndicatorPollerJob({
        fetchFn: async () => [makeIndicator()],
        storeFn: async () => { throw new Error("DB write failed"); },
        classifyFn: () => stubClassify(),
      });

      expect(result.success).toBe(false);
      expect(result.indicator_count).toBe(0);
      expect(result.error).toBe("DB write failed");
    });

    it("test 8: classifyFn throws → success:false, error equals classifyFn message", async () => {
      const result = await runImfIndicatorPollerJob({
        fetchFn: async () => [makeIndicator()],
        storeFn: async () => {},
        classifyFn: () => { throw new Error("classify explosion"); },
      });

      expect(result.success).toBe(false);
      expect(result.indicator_count).toBe(0);
      expect(result.error).toBe("classify explosion");
    });
  });
});
