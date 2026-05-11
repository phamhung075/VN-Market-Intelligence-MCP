/**
 * Task 1287 — Fix cascade rule drift: R09/R11 in predictionCascadeMapper
 *
 * Root cause: the SPORTS_ENTERTAINMENT_KEYWORDS list contains "nfl" (without
 * trailing space).  The substring "nfl" appears inside "co**nfl**ict" and
 * "i**nfl**ation", so isSportsOrEntertainmentMarket() returns true for those
 * inputs and mapPredictionToVn() short-circuits to [].
 *
 * Fix: add a trailing space to "nfl" → "nfl " (matching only standalone word).
 *
 * Layer: domain/services
 */

import { describe, it, expect } from "bun:test";
import {
  mapPredictionToVn,
  isSportsOrEntertainmentMarket,
  type CascadeMapping,
} from "../domain/services/predictionCascadeMapper.js";

function findRule(results: CascadeMapping[], ruleId: string): CascadeMapping | undefined {
  return results.find((r) => r.ruleId === ruleId);
}

describe("Task 1287 — R09/R11 cascade rule drift fix", () => {
  // ── Sports filter false-positive regression ──────────────────────────────

  it("isSportsOrEntertainmentMarket does NOT flag 'conflict' as sports", () => {
    expect(isSportsOrEntertainmentMarket("armed conflict escalates in the Middle East war")).toBe(false);
  });

  it("isSportsOrEntertainmentMarket does NOT flag 'inflation' as sports", () => {
    expect(isSportsOrEntertainmentMarket("US inflation rises to 4.5% CPI data")).toBe(false);
  });

  it("isSportsOrEntertainmentMarket does NOT flag 'chiến tranh' text as sports", () => {
    expect(isSportsOrEntertainmentMarket("chiến tranh bùng nổ tại khu vực")).toBe(false);
  });

  it("isSportsOrEntertainmentMarket does NOT flag 'lạm phát' text as sports", () => {
    expect(isSportsOrEntertainmentMarket("lạm phát tại Việt Nam tăng cao")).toBe(false);
  });

  // ── R09: War / armed conflict ────────────────────────────────────────────

  it("R09 fires for 'armed conflict escalates in the Middle East war'", () => {
    const results = mapPredictionToVn("armed conflict escalates in the Middle East war", []);
    const r09 = findRule(results, "R09");
    expect(r09).toBeDefined();
    expect(r09!.sectors).toContain("aviation");
    expect(r09!.matchedKeywords.length).toBeGreaterThan(0);
  });

  it("R09 fires for 'chiến tranh bùng nổ tại khu vực' (Vietnamese)", () => {
    const results = mapPredictionToVn("chiến tranh bùng nổ tại khu vực", []);
    const r09 = findRule(results, "R09");
    expect(r09).toBeDefined();
  });

  it("R09 direction is bearish", () => {
    const results = mapPredictionToVn("war breaks out in the region", []);
    const r09 = findRule(results, "R09");
    expect(r09).toBeDefined();
    expect(r09!.direction).toBe("bearish");
  });

  // ── R11: Inflation ───────────────────────────────────────────────────────

  it("R11 fires for 'US inflation rises to 4.5% CPI data'", () => {
    const results = mapPredictionToVn("US inflation rises to 4.5% CPI data", []);
    const r11 = findRule(results, "R11");
    expect(r11).toBeDefined();
    expect(r11!.sectors).toContain("banking");
    expect(r11!.matchedKeywords.length).toBeGreaterThan(0);
  });

  it("R11 fires for 'lạm phát tại Việt Nam tăng cao' (Vietnamese)", () => {
    const results = mapPredictionToVn("lạm phát tại Việt Nam tăng cao", []);
    const r11 = findRule(results, "R11");
    expect(r11).toBeDefined();
  });

  it("R11 direction is neutral", () => {
    const results = mapPredictionToVn("inflation stays elevated CPI high", []);
    const r11 = findRule(results, "R11");
    expect(r11).toBeDefined();
    expect(r11!.direction).toBe("neutral");
  });

  // ── Multi-rule simultaneous fire (regression from suite 165) ────────────

  it("R01, R03 and R11 all fire on rich text", () => {
    const text = "Fed rate cut expected while oil prices rise and inflation stays elevated";
    const results = mapPredictionToVn(text, []);
    const ids = results.map((r) => r.ruleId);
    expect(ids).toContain("R01");
    expect(ids).toContain("R03");
    expect(ids).toContain("R11");
  });

  // ── Sanity: real NFL-related text still triggers the filter ──────────────

  it("isSportsOrEntertainmentMarket still flags genuine NFL text", () => {
    expect(isSportsOrEntertainmentMarket("nfl super bowl winner 2025")).toBe(true);
  });

  it("isSportsOrEntertainmentMarket flags 'nba finals' text", () => {
    expect(isSportsOrEntertainmentMarket("who wins the nba finals this year")).toBe(true);
  });
});
