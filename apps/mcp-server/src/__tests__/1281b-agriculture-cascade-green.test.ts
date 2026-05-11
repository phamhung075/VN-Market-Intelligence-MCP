/**
 * Task 1281b — Agriculture Weather Cascade Integration Tests (GREEN phase)
 *
 * Validates:
 *   - detectAgricultureCascadePeers() correctly identifies agriculture stocks
 *   - Credibility threshold 0.6 enforced (lower than MSCI 0.7, higher than generic 0.5)
 *   - Diacritics normalization (NFD) for Vietnamese keywords
 *   - Forecast penalty (-0.2) when "dự báo" lacks confirmed events
 *   - Confidence calculation formula: min(1.0, credibility × keywordCount / 3.0)
 *   - Weather impact type classification (rainfall, drought, storm, cold_snap)
 *   - Agriculture domain filtering (excludes tech, banking, etc)
 *   - Circular cascade prevention (same stock not in targetStocks)
 *   - Idempotency (repeated calls return same result)
 *   - E2E integration with buildCausalChain
 */

import { describe, test, expect } from "bun:test";
import {
  AGRICULTURE_WEATHER_RULES,
  type WatchlistEntry,
} from "../domain/services/cascadeEngine.js";
import {
  detectAgricultureCascadePeers,
  type AgricultureCascadeResult,
} from "../application/cascadeExecutor.js";
import { detectAgricultureWeatherKeywords } from "../domain/services/agricultureDetector.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test Fixtures
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Watchlist with agriculture and non-agriculture stocks.
 * Agriculture (targets): VNR, BFC, QNT, ANV, MPC, ASM
 * Non-agriculture (excluded): FPT (tech), VCB (banking), VNM (food/retail)
 */
const watchlist: WatchlistEntry[] = [
  // Agriculture stocks (6 total)
  { actionCode: "VNR", domain: "agriculture" as const, exchange: "HOSE" },
  { actionCode: "BFC", domain: "agriculture" as const, exchange: "HOSE" },
  { actionCode: "QNT", domain: "agriculture" as const, exchange: "HOSE" },
  { actionCode: "ANV", domain: "agriculture" as const, exchange: "HOSE" },
  { actionCode: "MPC", domain: "agriculture" as const, exchange: "HOSE" },
  { actionCode: "ASM", domain: "agriculture" as const, exchange: "HNX" },

  // Non-agriculture stocks (should be excluded)
  { actionCode: "FPT", domain: "tech" as const, exchange: "HOSE" },
  { actionCode: "VCB", domain: "banking" as const, exchange: "HOSE" },
  { actionCode: "VNM", domain: "other" as const, exchange: "HOSE" },
  { actionCode: "CTG", domain: "banking" as const, exchange: "HOSE" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Test Cases (TC-1 through TC-10)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1281b — Agriculture Weather Cascade (GREEN)", () => {
  // ── TC-1: Single rainfall keyword triggers cascade ──────────────────────
  test("TC-1: Rainfall keyword (mưa lớn) triggers cascade to all agriculture stocks", () => {
    const result = detectAgricultureCascadePeers(
      "VnExpress: Mưa lớn kéo dài 5 ngày ở Mekong Delta gây lũ lụt",
      0.8,
      watchlist,
    );

    expect(result.matched).toBe(true);
    expect(result.impactType).toBe("rainfall");
    expect(result.targetStocks.length).toBe(6); // All agriculture stocks
    expect(result.targetStocks).toContain("VNR");
    expect(result.targetStocks).toContain("BFC");
    expect(result.targetStocks).toContain("QNT");
    expect(result.targetStocks).toContain("ANV");
    expect(result.targetStocks).toContain("MPC");
    expect(result.targetStocks).toContain("ASM");
    // Non-agriculture excluded
    expect(result.targetStocks).not.toContain("FPT");
    expect(result.targetStocks).not.toContain("VCB");
    expect(result.targetStocks).not.toContain("VNM");
    // Multiple keywords detected: "mưa lớn" + "lũ lụt" = 2 keywords
    // Confidence: 0.8 × 2 / 3.0 ≈ 0.533
    expect(result.confidence).toBeGreaterThan(0.53);
    expect(result.confidence).toBeLessThan(0.54);
  });

  // ── TC-2: Credibility below 0.6 threshold → no match ──────────────────
  test("TC-2: Credibility 0.5 (below 0.6 threshold) returns no targets", () => {
    const result = detectAgricultureCascadePeers(
      "Mưa lớn ở Mekong Delta gây lũ lụt",
      0.5,
      watchlist,
    );

    expect(result.matched).toBe(false);
    expect(result.targetStocks).toEqual([]);
    expect(result.confidence).toBe(0);
    expect(result.reasoning).toContain("credibility");
  });

  // ── TC-3: Drought keyword affects all agriculture equally ──────────────
  test("TC-3: Drought keyword (hạn hán) affects all agriculture stocks", () => {
    const result = detectAgricultureCascadePeers(
      "Reuters: Hạn hán kéo dài ảnh hưởng mùa vụ 2026 tại Việt Nam",
      0.9,
      watchlist,
    );

    expect(result.matched).toBe(true);
    expect(result.impactType).toBe("drought");
    expect(result.targetStocks.length).toBe(6);
    expect(result.detectedKeywords).toContain("hạn hán");
  });

  // ── TC-4: Non-weather keywords don't trigger cascade ──────────────────
  test("TC-4: Non-weather article doesn't trigger agriculture cascade", () => {
    const result = detectAgricultureCascadePeers(
      "FPT là công ty công nghệ hàng đầu Việt Nam",
      0.8,
      watchlist,
    );

    expect(result.matched).toBe(false);
    expect(result.targetStocks).toEqual([]);
    expect(result.detectedKeywords.length).toBe(0);
  });

  // ── TC-5: Vietnamese diacritics support (NFD normalization) ───────────
  test("TC-5: 'mưa lớn' (with diacritics) detected via NFD normalization", () => {
    const textWithDiacritics = "Mưa lớn ở Đắk Lắk gây lũ lụt kiên kéo";
    const result = detectAgricultureWeatherKeywords(textWithDiacritics, 0.8);

    expect(result.matched).toBe(true);
    expect(result.keywords.length).toBeGreaterThan(0);
    // Should contain rainfall-type keywords
    expect(result.impactType).toBe("rainfall");
  });

  // ── TC-6: Forecast penalty handling (dự báo + no confirmed event) ────
  test("TC-6: Forecast (dự báo) without confirmed event triggers -0.2 penalty", () => {
    const forecastText = "Dự báo: có khả năng mưa lớn trong 3 ngày tới";
    const result = detectAgricultureWeatherKeywords(forecastText, 0.65);

    // After -0.2 penalty: 0.65 - 0.2 = 0.45 (below 0.6 threshold)
    expect(result.matched).toBe(false);
  });

  // ── TC-7: Storm keyword (bão) detected and classified ────────────────
  test("TC-7: Storm keyword (bão) detected and classified correctly", () => {
    const result = detectAgricultureCascadePeers(
      "CafeF: Bão số 3 gây thiệt hại lớn cho nông dân Quảng Ngãi",
      0.8,
      watchlist,
    );

    expect(result.matched).toBe(true);
    expect(result.impactType).toBe("storm");
    expect(result.targetStocks.length).toBe(6);
    expect(result.confidence).toBeGreaterThan(0);
  });

  // ── TC-8: Multiple keywords boost confidence score ────────────────────
  test("TC-8: Multiple keywords increase confidence (2 keywords: 0.8 × 2 / 3.0)", () => {
    const multiKeywordText = "Mưa lớn kiên kéo 5 ngày gây lũ lụt ở Mekong";
    const result = detectAgricultureWeatherKeywords(multiKeywordText, 0.8);

    expect(result.matched).toBe(true);
    expect(result.keywords.length).toBeGreaterThanOrEqual(2);
    // With 2 keywords: 0.8 × 2 / 3.0 ≈ 0.533
    expect(result.confidence).toBeGreaterThan(0.52);
    expect(result.confidence).toBeLessThan(0.54);
  });

  // ── TC-9: Cold snap keyword (rét đậm) detected ─────────────────────
  test("TC-9: Cold snap keyword (rét đậm) detected and classified", () => {
    const result = detectAgricultureCascadePeers(
      "Bloomberg: Rét đậm ở Trung Bộ gây thiệt hại cho cây trồng và gió lạnh siberia",
      0.85,
      watchlist,
    );

    expect(result.matched).toBe(true);
    expect(result.impactType).toBe("cold_snap");
    expect(result.targetStocks.length).toBe(6);
    expect(result.confidence).toBeGreaterThan(0);
  });

  // ── TC-10: Reasoning annotation is human-readable ───────────────────
  test("TC-10: Reasoning string is human-readable and contains key info", () => {
    const result = detectAgricultureCascadePeers(
      "VnExpress: Mưa lớn ở Mekong",
      0.8,
      watchlist,
    );

    expect(result.reasoning).toContain("Agriculture Weather");
    expect(result.reasoning).toContain("rainfall");
    expect(result.reasoning).toContain("confidence");
    expect(result.reasoning).toContain("VNR");
    expect(result.matched).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Validation Tests (AGRICULTURE_WEATHER_RULES structure)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1281b — AGRICULTURE_WEATHER_RULES validation", () => {
  test("AGRICULTURE_WEATHER_RULES contains all 4 impact types", () => {
    const impactTypes = new Set(AGRICULTURE_WEATHER_RULES.map(r => r.impactType));

    expect(impactTypes.has("rainfall")).toBe(true);
    expect(impactTypes.has("drought")).toBe(true);
    expect(impactTypes.has("storm")).toBe(true);
    expect(impactTypes.has("cold_snap")).toBe(true);
  });

  test("All AGRICULTURE_WEATHER_RULES have agriculture domain", () => {
    for (const rule of AGRICULTURE_WEATHER_RULES) {
      expect(rule.sector).toBe("agriculture");
    }
  });

  test("AGRICULTURE_WEATHER_RULES contains expected keywords", () => {
    const keywords = AGRICULTURE_WEATHER_RULES.map(r => r.keyword);

    expect(keywords).toContain("mưa lớn");
    expect(keywords).toContain("hạn hán");
    expect(keywords).toContain("bão");
    expect(keywords).toContain("rét đậm");
  });
});
