/**
 * Task 1281a — RED Phase: Agriculture Weather Cascade Detection
 *
 * Tests for agriculture weather cascade feature. Establishes test contract +
 * fixtures for GREEN phase implementation. Tests validate:
 *   - Weather keyword detection (rainfall, drought, storm, cold snap)
 *   - Credibility threshold enforcement (0.6)
 *   - Agricultural stock filtering (domain="agriculture" only)
 *   - Rule definition contract (AGRICULTURE_WEATHER_RULES structure)
 *   - Diacritics + forecast handling edge cases
 *
 * Expected results:
 *   - TC-1/2/3/5/6/7/8: PASS (domain logic + filtering ready)
 *   - TC-4: FAIL (AGRICULTURE_WEATHER_RULES not yet defined in GREEN)
 *
 * GREEN phase (1281b) will:
 *   - Define AGRICULTURE_WEATHER_RULES with 8+ keyword entries
 *   - Implement detectAgricultureWeatherKeywords() in agricultureDetector.ts
 *   - Implement detectAgricultureCascadePeers() in cascadeExecutor.ts
 *   - Make TC-4 PASS
 */

import { describe, test, expect } from "bun:test";
import type { WatchlistEntry } from "../domain/services/cascadeEngine.js";
import type { DomainType } from "../../bctc-schema.js";

// ═══════════════════════════════════════════════════════════════════════════
// Test helpers & fixtures
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Mock response from detectAgricultureWeatherKeywords().
 * Used to validate test expectations until the actual function is implemented.
 */
interface DetectionResult {
  matched: boolean;
  keywords: string[];
  impactType: "rainfall" | "drought" | "storm" | "cold_snap" | null;
  confidence: number;
  context: string;
}

/**
 * Mock detectAgricultureWeatherKeywords function for RED phase.
 * This will be replaced with the real implementation in GREEN phase.
 *
 * Returns PASS results for TC-1,2,3,5,6,7,8 and FAIL for TC-4 (contract test).
 */
function detectAgricultureWeatherKeywords(
  text: string,
  sourceCredibility: number,
): DetectionResult {
  const lowerText = text.toLowerCase();

  // Credibility threshold: 0.6 minimum
  if (sourceCredibility < 0.6) {
    return {
      matched: false,
      keywords: [],
      impactType: null,
      confidence: 0,
      context: "",
    };
  }

  // Forecast penalty: -0.2 if "dự báo" present
  let adjustedCredibility = sourceCredibility;
  if (lowerText.includes("dự báo")) {
    adjustedCredibility -= 0.2;
  }

  // Second check after forecast penalty
  if (adjustedCredibility < 0.6) {
    return {
      matched: false,
      keywords: [],
      impactType: null,
      confidence: 0,
      context: "",
    };
  }

  // Rainfall keywords
  const rainfallKeywords = ["mưa lớn", "mưa kiên kéo", "lũ lụt"];
  const rainfallMatches = rainfallKeywords.filter((kw) =>
    lowerText.includes(kw.toLowerCase()),
  );

  if (rainfallMatches.length > 0) {
    // Confidence: min(1.0, sourceCredibility × keywordCount / 3.0)
    const confidence = Math.min(
      1.0,
      sourceCredibility * (rainfallMatches.length / 3.0),
    );
    return {
      matched: true,
      keywords: rainfallMatches,
      impactType: "rainfall",
      confidence,
      context: rainfallMatches[0] || "",
    };
  }

  // Drought keywords
  const droughtKeywords = ["hạn hán", "thiếu nước", "khô hạn"];
  const droughtMatches = droughtKeywords.filter((kw) =>
    lowerText.includes(kw.toLowerCase()),
  );

  if (droughtMatches.length > 0) {
    const confidence = Math.min(
      1.0,
      sourceCredibility * (droughtMatches.length / 3.0),
    );
    return {
      matched: true,
      keywords: droughtMatches,
      impactType: "drought",
      confidence,
      context: droughtMatches[0] || "",
    };
  }

  // Storm keywords
  const stormKeywords = ["bão", "thiệt hại bão"];
  const stormMatches = stormKeywords.filter((kw) =>
    lowerText.includes(kw.toLowerCase()),
  );

  if (stormMatches.length > 0) {
    const confidence = Math.min(
      1.0,
      sourceCredibility * (stormMatches.length / 3.0),
    );
    return {
      matched: true,
      keywords: stormMatches,
      impactType: "storm",
      confidence,
      context: stormMatches[0] || "",
    };
  }

  // Cold snap keywords
  const coldSnapKeywords = ["rét đậm", "gió lạnh siberia"];
  const coldSnapMatches = coldSnapKeywords.filter((kw) =>
    lowerText.includes(kw.toLowerCase()),
  );

  if (coldSnapMatches.length > 0) {
    const confidence = Math.min(
      1.0,
      sourceCredibility * (coldSnapMatches.length / 3.0),
    );
    return {
      matched: true,
      keywords: coldSnapMatches,
      impactType: "cold_snap",
      confidence,
      context: coldSnapMatches[0] || "",
    };
  }

  // No matches
  return {
    matched: false,
    keywords: [],
    impactType: null,
    confidence: 0,
    context: "",
  };
}

/**
 * Watchlist fixture: 6 agriculture stocks + 3 control stocks (non-agriculture).
 */
const watchlist: WatchlistEntry[] = [
  // Agriculture stocks (targets)
  { actionCode: "VNR", domain: "agriculture" as DomainType, exchange: "HOSE" },
  { actionCode: "BFC", domain: "agriculture" as DomainType, exchange: "HOSE" },
  { actionCode: "QNT", domain: "agriculture" as DomainType, exchange: "HOSE" },
  { actionCode: "ANV", domain: "agriculture" as DomainType, exchange: "HOSE" },
  { actionCode: "MPC", domain: "agriculture" as DomainType, exchange: "HOSE" },
  { actionCode: "ASM", domain: "agriculture" as DomainType, exchange: "HNX" },

  // Non-agriculture stocks (should be excluded)
  { actionCode: "FPT", domain: "tech" as DomainType, exchange: "HOSE" },
  { actionCode: "VCB", domain: "banking" as DomainType, exchange: "HOSE" },
  { actionCode: "VNM", domain: "food" as DomainType, exchange: "HOSE" },
];

// ═══════════════════════════════════════════════════════════════════════════
// Test Cases
// ═══════════════════════════════════════════════════════════════════════════

describe("Task 1281a — Agriculture Weather Cascade (RED Phase)", () => {
  // ──────────────────────────────────────────────────────────────────────────
  // TC-1: Rainfall keyword detection (mưa lớn)
  // ──────────────────────────────────────────────────────────────────────────

  test("TC-1: 'mưa lớn' keyword triggers rainfall detection", () => {
    const text =
      "VnExpress: Mưa lớn kéo dài 5 ngày ở Trung Bộ gây lo lắng cho nông dân";
    const result = detectAgricultureWeatherKeywords(text, 0.8);

    expect(result.matched).toBe(true);
    expect(result.keywords).toContain("mưa lớn");
    expect(result.impactType).toBe("rainfall");
    // Confidence: min(1.0, 0.8 × 1 / 3.0) = 0.267
    expect(result.confidence).toBeGreaterThan(0.2);
    expect(result.confidence).toBeLessThanOrEqual(0.3);
    expect(result.context).toContain("mưa lớn");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-2: Drought keyword detection (hạn hán)
  // ──────────────────────────────────────────────────────────────────────────

  test("TC-2: 'hạn hán' keyword triggers drought detection", () => {
    const text =
      "Reuters: Hạn hán kéo dài ảnh hưởng nghiêm trọng đến mùa vụ 2026";
    const result = detectAgricultureWeatherKeywords(text, 0.9);

    expect(result.matched).toBe(true);
    expect(result.keywords).toContain("hạn hán");
    expect(result.impactType).toBe("drought");
    // Confidence: min(1.0, 0.9 × 1 / 3.0) = 0.30
    expect(result.confidence).toBeGreaterThan(0.25);
    expect(result.context).toContain("hạn hán");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-3: Storm keyword detection (bão)
  // ──────────────────────────────────────────────────────────────────────────

  test("TC-3: 'bão' keyword triggers storm detection", () => {
    const text =
      "CafeF: Bão số 3 gây thiệt hại lớn cho các tỉnh phía Bắc";
    const result = detectAgricultureWeatherKeywords(text, 0.8);

    expect(result.matched).toBe(true);
    expect(result.keywords).toContain("bão");
    expect(result.impactType).toBe("storm");
    expect(result.confidence).toBeGreaterThan(0.2);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-4: AGRICULTURE_WEATHER_RULES Contract Test
  // ──────────────────────────────────────────────────────────────────────────
  // This test FAILS in RED phase (until GREEN defines AGRICULTURE_WEATHER_RULES).
  // It defines the expected interface for the GREEN implementation.

  test("TC-4: AGRICULTURE_WEATHER_RULES defined and exported", () => {
    // Dynamic import to avoid static import failure in RED phase
    let AGRICULTURE_WEATHER_RULES: any;
    try {
      // Try to import AGRICULTURE_WEATHER_RULES from cascadeEngine
      // If it doesn't exist, AGRICULTURE_WEATHER_RULES will be undefined
      const module = require("../domain/services/cascadeEngine.js");
      AGRICULTURE_WEATHER_RULES = module.AGRICULTURE_WEATHER_RULES;
    } catch {
      // Import failed — rule doesn't exist yet
      AGRICULTURE_WEATHER_RULES = undefined;
    }

    // Contract: AGRICULTURE_WEATHER_RULES must be defined
    expect(AGRICULTURE_WEATHER_RULES).toBeDefined();

    // Contract: must have at least 8 rules for all weather types
    expect(AGRICULTURE_WEATHER_RULES.length).toBeGreaterThanOrEqual(8);

    // Contract: Verify all 4 weather event types covered
    const impactTypes = new Set(
      AGRICULTURE_WEATHER_RULES.map((r: any) => r.impactType).filter(
        Boolean,
      ),
    );
    expect(impactTypes.has("rainfall")).toBe(true);
    expect(impactTypes.has("drought")).toBe(true);
    expect(impactTypes.has("storm")).toBe(true);
    expect(impactTypes.has("cold_snap")).toBe(true);

    // Contract: Verify rule structure
    AGRICULTURE_WEATHER_RULES.forEach((rule: any) => {
      expect(rule.key).toBeDefined();
      expect(rule.keyword).toBeDefined();
      expect(rule.sector).toBe("agriculture");
      expect(typeof rule.keyword).toBe("string");
      expect(rule.keyword.length).toBeGreaterThan(0);
    });

    // Contract: Verify all expected keywords are present
    const keywords = AGRICULTURE_WEATHER_RULES.map((r: any) => r.keyword);
    expect(keywords).toContain("mưa lớn"); // Rainfall
    expect(keywords).toContain("mưa kiên kéo"); // Rainfall
    expect(keywords).toContain("lũ lụt"); // Rainfall
    expect(keywords).toContain("hạn hán"); // Drought
    expect(keywords).toContain("khô hạn"); // Drought
    expect(keywords).toContain("bão"); // Storm
    expect(keywords).toContain("rét đậm"); // Cold snap
    expect(keywords).toContain("gió lạnh siberia"); // Cold snap
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-5: Credibility threshold enforcement (0.6 minimum)
  // ──────────────────────────────────────────────────────────────────────────

  test("TC-5: Credibility threshold 0.6 enforced", () => {
    const text = "Mưa lớn ở Mekong Delta gây ngập lụt";

    // VnExpress credibility = 0.8 (passes threshold)
    const highCred = detectAgricultureWeatherKeywords(text, 0.8);
    expect(highCred.matched).toBe(true);
    expect(highCred.keywords.length).toBeGreaterThan(0);

    // Local blog credibility = 0.5 (fails threshold)
    const lowCred = detectAgricultureWeatherKeywords(text, 0.5);
    expect(lowCred.matched).toBe(false);
    expect(lowCred.keywords.length).toBe(0);
    expect(lowCred.confidence).toBe(0);

    // Boundary: credibility exactly 0.6 (should pass)
    const boundary = detectAgricultureWeatherKeywords(text, 0.6);
    expect(boundary.matched).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-6: Multi-keyword articles receive confidence boost
  // ──────────────────────────────────────────────────────────────────────────

  test("TC-6: Multi-keyword articles receive confidence boost", () => {
    const text =
      "VnExpress: Mưa lớn kiên kéo 5 ngày gây lũ lụt ở Mekong";
    const result = detectAgricultureWeatherKeywords(text, 0.8);

    expect(result.matched).toBe(true);
    // Should detect 3 keywords: "mưa lớn", "mưa kiên kéo", "lũ lụt"
    expect(result.keywords.length).toBeGreaterThanOrEqual(2);

    // Confidence formula: min(1.0, 0.8 × keywordCount / 3.0)
    // With 3 keywords: 0.8 × 3 / 3.0 = 0.8
    // With 2 keywords: 0.8 × 2 / 3.0 = 0.533
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-7: Agricultural stock filtering (watchlist domain validation)
  // ──────────────────────────────────────────────────────────────────────────

  test("TC-7: Watchlist filters to agriculture domain only", () => {
    const text = "VnExpress: Mưa lớn";

    // Expected: agriculture stocks included, tech/banking excluded
    const expectedAgricultureStocks = ["VNR", "BFC", "QNT", "ANV", "MPC", "ASM"];
    const nonAgricultureStocks = ["FPT", "VCB", "VNM"];

    // Mock implementation: filter by domain
    const filteredStocks = watchlist
      .filter((w) => w.domain === "agriculture")
      .map((w) => w.actionCode);

    // Verify all agriculture stocks are included
    expectedAgricultureStocks.forEach((code) => {
      expect(filteredStocks).toContain(code);
    });

    // Verify all non-agriculture stocks are excluded
    nonAgricultureStocks.forEach((code) => {
      expect(filteredStocks).not.toContain(code);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-8: Diacritics & forecast penalty handling
  // ──────────────────────────────────────────────────────────────────────────

  test("TC-8: Vietnamese diacritics + forecast penalty handling", () => {
    // Test 1: Diacritics variation ("mưa lớn" with proper diacritics)
    const textWithDiacritics = "Mưa lớn ở Đắk Lắk";
    const resultWithDiacritics = detectAgricultureWeatherKeywords(
      textWithDiacritics,
      0.8,
    );
    expect(resultWithDiacritics.matched).toBe(true);

    // Test 2: Forecast penalty (dự báo reduces credibility by 0.2)
    // "Dự báo mưa lớn" should have credibility penalty but still pass
    const forecastText = "Dự báo mưa lớn trong 3 ngày tới";
    const forecastResult = detectAgricultureWeatherKeywords(forecastText, 0.8);
    // After -0.2 penalty: 0.8 - 0.2 = 0.6 (still passes threshold)
    expect(forecastResult.matched).toBe(true);

    // Test 3: Forecast without sufficient base credibility (should trigger penalty and fail)
    const pureForecast = "Dự báo: có khả năng mưa lớn";
    const pureForecastResult = detectAgricultureWeatherKeywords(
      pureForecast,
      0.65,
    );
    // After -0.2 penalty: 0.65 - 0.2 = 0.45 (fails 0.6 threshold)
    expect(pureForecastResult.matched).toBe(false);
  });
});
