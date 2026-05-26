/**
 * 1934 — MacroPanel component tests (TDD — RED first).
 *
 * Covers:
 * - MacroData domain type has sources + summary fields
 * - parseMacroSources extracts per-source rows from the real API shape
 * - MacroSourceRow type covers ok/failed status
 */

import { describe, it, expect } from "vitest";
import type { MacroData, MacroSourceRow } from "~/domain/market";

// --------------------------------------------------------------------------
// parseMacroSources helper (pure function, exported from domain/market.ts)
// --------------------------------------------------------------------------
import { parseMacroSources } from "~/domain/market";

const REAL_API_SHAPE: MacroData = {
  fetchedAt: "2026-05-17T12:00:00Z",
  sources: {
    worldBank: { status: "ok", data: { gdp_growth: 6.8 }, latencyMs: 1200 },
    yahoo: { status: "ok", data: { sp500: 5200 }, latencyMs: 800 },
    fred: { status: "ok", data: { fed_funds_rate: 5.25 }, latencyMs: 950 },
    cnbc: { status: "ok", data: { dow_jones: 38000 }, latencyMs: 600 },
    tradingEconomics: { status: "ok", data: { vn_gdp: 6.5 }, latencyMs: 1500 },
    calendar: { status: "failed", error: "timeout", latencyMs: 5000 },
  },
  summary: { ok: 5, failed: 1, totalLatencyMs: 62700 },
};

describe("MacroData domain type", () => {
  it("accepts the real API shape with sources and summary", () => {
    const macro: MacroData = REAL_API_SHAPE;
    // TypeScript compile-time check — accessing typed fields
    expect(macro.fetchedAt).toBe("2026-05-17T12:00:00Z");
    expect(macro.sources).toBeDefined();
    expect(macro.summary).toBeDefined();
  });

  it("summary has ok, failed, totalLatencyMs counts", () => {
    const macro: MacroData = REAL_API_SHAPE;
    expect(macro.summary?.ok).toBe(5);
    expect(macro.summary?.failed).toBe(1);
    expect(macro.summary?.totalLatencyMs).toBe(62700);
  });

  it("sources keys map to per-source objects with status field", () => {
    const macro: MacroData = REAL_API_SHAPE;
    expect(macro.sources?.["worldBank"]?.status).toBe("ok");
    expect(macro.sources?.["calendar"]?.status).toBe("failed");
  });
});

describe("parseMacroSources", () => {
  it("returns empty array when macro is null", () => {
    expect(parseMacroSources(null)).toEqual([]);
  });

  it("returns empty array when macro has no sources", () => {
    const macro: MacroData = { fetchedAt: "2026-05-17T12:00:00Z" };
    expect(parseMacroSources(macro)).toEqual([]);
  });

  it("returns a row for each source key", () => {
    const rows = parseMacroSources(REAL_API_SHAPE);
    expect(rows).toHaveLength(6);
  });

  it("each row has name, status, latencyMs fields", () => {
    const rows = parseMacroSources(REAL_API_SHAPE);
    const worldBank = rows.find((r) => r.name === "worldBank");
    expect(worldBank).toBeDefined();
    expect(worldBank?.status).toBe("ok");
    expect(worldBank?.latencyMs).toBe(1200);
  });

  it("failed source has error field populated", () => {
    const rows = parseMacroSources(REAL_API_SHAPE);
    const calendar = rows.find((r) => r.name === "calendar");
    expect(calendar?.status).toBe("failed");
    expect(calendar?.error).toBe("timeout");
  });

  it("ok sources have no error field", () => {
    const rows = parseMacroSources(REAL_API_SHAPE);
    const fred = rows.find((r) => r.name === "fred");
    expect(fred?.error).toBeUndefined();
  });

  it("row satisfies MacroSourceRow type", () => {
    const rows: MacroSourceRow[] = parseMacroSources(REAL_API_SHAPE);
    expect(rows.length).toBeGreaterThan(0);
  });
});

// --------------------------------------------------------------------------
// MacroSnapshot signals — keyed-object contract (architect ruling 1d277bc7)
// --------------------------------------------------------------------------

import type { MacroSnapshot } from "~/domain/market";

describe("MacroSnapshot signals — keyed-object contract", () => {
  const REAL_SIGNALS_SHAPE: MacroSnapshot["signals"] = {
    "investment-clock": { tier: "RECOVERY", score: 65, phase: "EARLY_EXPANSION" },
    "oil": { impact: "NEUTRAL", priceUSD: 82.5, reasoning: "within normal band" },
    "gold": { direction: "BULLISH", priceUSD: 2350.0, reasoning: "above 2200" },
    "usdvnd": { direction: "NEUTRAL", rateVND: 24500, reasoning: "below 25500" },
    "carry": { regime: "NEUTRAL", carrySpread: -0.63 },
    "yield": { label: "FAIRLY_VALUED", spread: 2.87 },
  };

  it("signals is an object (not an array)", () => {
    expect(Array.isArray(REAL_SIGNALS_SHAPE)).toBe(false);
    expect(typeof REAL_SIGNALS_SHAPE).toBe("object");
  });

  it("Object.entries iterates over all 6 signal keys", () => {
    const entries = Object.entries(REAL_SIGNALS_SHAPE);
    expect(entries).toHaveLength(6);
  });

  it("each entry has the correct key and a MacroSignalEntry value", () => {
    const oil = REAL_SIGNALS_SHAPE["oil"];
    expect(oil?.impact).toBe("NEUTRAL");
    expect(oil?.priceUSD).toBe(82.5);
  });

  it("Object.values returns 6 MacroSignalEntry objects", () => {
    const values = Object.values(REAL_SIGNALS_SHAPE);
    expect(values).toHaveLength(6);
    expect(values.every((v) => typeof v === "object" && v !== null)).toBe(true);
  });
});
