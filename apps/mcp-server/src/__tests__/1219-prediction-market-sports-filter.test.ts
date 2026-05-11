// src/__tests__/1219-prediction-market-sports-filter.test.ts
Bun.env["DB_PATH"] = ":memory:";
import { describe, it, expect } from "bun:test";
import { mapPredictionToVn, isSportsOrEntertainmentMarket } from "../domain/services/predictionCascadeMapper.js";

describe("Task 1219 — Prediction market: exclude sports/entertainment", () => {
  // ── isSportsOrEntertainmentMarket filter function ────────────────────────
  it("identifies World Cup as sports market", () => {
    expect(isSportsOrEntertainmentMarket("Will Brazil win the 2026 World Cup?")).toBe(true);
  });

  it("identifies Super Bowl as sports market", () => {
    expect(isSportsOrEntertainmentMarket("Who will win Super Bowl LIX?")).toBe(true);
  });

  it("identifies Oscar as entertainment market", () => {
    expect(isSportsOrEntertainmentMarket("Will Oppenheimer win Best Picture at the Oscars?")).toBe(true);
  });

  it("identifies NBA as sports market", () => {
    expect(isSportsOrEntertainmentMarket("Will the Lakers win the NBA championship?")).toBe(true);
  });

  it("identifies FIFA as sports market", () => {
    expect(isSportsOrEntertainmentMarket("FIFA World Cup winner 2026?")).toBe(true);
  });

  it("identifies Grammy as entertainment market", () => {
    expect(isSportsOrEntertainmentMarket("Grammy Award Best Album 2025?")).toBe(true);
  });

  it("identifies UEFA Champions League as sports", () => {
    expect(isSportsOrEntertainmentMarket("Champions League final winner?")).toBe(true);
  });

  it("identifies NFL as sports", () => {
    expect(isSportsOrEntertainmentMarket("NFL season MVP prediction?")).toBe(true);
  });

  it("identifies boxing match as sports", () => {
    expect(isSportsOrEntertainmentMarket("Will Fury beat Usyk in boxing rematch?")).toBe(true);
  });

  it("identifies Olympic Games as sports", () => {
    expect(isSportsOrEntertainmentMarket("Which country will win the most medals at the Olympics?")).toBe(true);
  });

  it("identifies Academy Awards as entertainment", () => {
    expect(isSportsOrEntertainmentMarket("Academy Awards Best Director 2025?")).toBe(true);
  });

  // ── Non-sports/entertainment markets are NOT filtered ────────────────────
  it("does NOT filter Fed rate cut markets", () => {
    expect(isSportsOrEntertainmentMarket("Will the Fed cut rates in December 2024?")).toBe(false);
  });

  it("does NOT filter Vietnam GDP markets", () => {
    expect(isSportsOrEntertainmentMarket("Will Vietnam GDP growth exceed 7% in 2025?")).toBe(false);
  });

  it("does NOT filter oil price markets", () => {
    expect(isSportsOrEntertainmentMarket("Will Brent crude exceed $100 by year end?")).toBe(false);
  });

  it("does NOT filter election/political markets", () => {
    expect(isSportsOrEntertainmentMarket("Will US impose new tariffs on China in 2025?")).toBe(false);
  });

  it("does NOT filter crypto markets", () => {
    expect(isSportsOrEntertainmentMarket("Will Bitcoin reach $100k by December?")).toBe(false);
  });

  // ── mapPredictionToVn returns empty array for sports/entertainment ────────
  it("mapPredictionToVn returns [] for World Cup question", () => {
    const result = mapPredictionToVn("Will Argentina win the World Cup in 2026?", ["football", "soccer"]);
    expect(result).toEqual([]);
  });

  it("mapPredictionToVn returns [] for Oscar question", () => {
    const result = mapPredictionToVn("Who will win Best Actor at the Oscars?", ["oscar", "movies"]);
    expect(result).toEqual([]);
  });

  it("mapPredictionToVn returns [] for Super Bowl question", () => {
    const result = mapPredictionToVn("Super Bowl LIX winner prediction", ["nfl", "football"]);
    expect(result).toEqual([]);
  });

  // ── mapPredictionToVn still works for financial markets ──────────────────
  it("mapPredictionToVn returns mappings for Fed rate cut", () => {
    const result = mapPredictionToVn("Will the Fed cut rates in 2024?", []);
    expect(result.length).toBeGreaterThan(0);
  });

  it("mapPredictionToVn returns mappings for oil price surge", () => {
    const result = mapPredictionToVn("Will oil prices surge above $100?", []);
    expect(result.length).toBeGreaterThan(0);
  });

  // ── Case insensitivity ────────────────────────────────────────────────────
  it("filters 'WORLD CUP' uppercase", () => {
    expect(isSportsOrEntertainmentMarket("WORLD CUP 2026 winner?")).toBe(true);
  });
});
