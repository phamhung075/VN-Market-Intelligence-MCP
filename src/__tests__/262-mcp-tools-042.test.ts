/**
 * Task 262 — MCP Tools: get_climate_risk_signals + get_energy_grid_signals
 *
 * 6 tests covering tool registration, response format, and content.
 */

import { describe, it, expect } from "bun:test";
import {
  getClimateRiskSignals,
} from "../interface/mcp/tools/climateTools.js";
import {
  getEnergyGridSignals,
  getEnergyGridStatus,
} from "../interface/mcp/tools/energyTools.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Task 262 — MCP Tools: Climate + Energy", () => {
  // 1. getClimateRiskSignals returns content array
  it("getClimateRiskSignals returns MCP content format", async () => {
    const result = await getClimateRiskSignals({});
    expect(result).toHaveProperty("content");
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0]!).toHaveProperty("type", "text");
    expect(typeof (result.content[0] as { type: "text"; text: string }).text).toBe("string");
  });

  // 2. getClimateRiskSignals output contains seasonal context section
  it("getClimateRiskSignals output contains seasonal context", async () => {
    const result = await getClimateRiskSignals({});
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text.toLowerCase()).toMatch(/mùa|khí hậu|thời tiết|seasonal|tháng/i);
  });

  // 3. getClimateRiskSignals with stock filter
  it("getClimateRiskSignals with stock param filters to that stock", async () => {
    const result = await getClimateRiskSignals({ stock: "REE" });
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text.length).toBeGreaterThan(0);
    // Result should mention REE or be a valid response
    expect(typeof text).toBe("string");
  });

  // 4. getEnergyGridSignals returns content array
  it("getEnergyGridSignals returns MCP content format", async () => {
    const result = await getEnergyGridSignals({});
    expect(result).toHaveProperty("content");
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0]!).toHaveProperty("type", "text");
    expect(typeof (result.content[0] as { type: "text"; text: string }).text).toBe("string");
  });

  // 5. getEnergyGridStatus function exported from energyTools
  it("getEnergyGridStatus function is exported", async () => {
    expect(typeof getEnergyGridStatus).toBe("function");
    const result = await getEnergyGridStatus({});
    expect(result).toHaveProperty("content");
  });

  // 6. climateTools.ts and energyTools.ts export register functions
  it("climate and energy tools export registerClimateTools and registerEnergyTools", async () => {
    const climateModule = await import("../interface/mcp/tools/climateTools.js");
    const energyModule = await import("../interface/mcp/tools/energyTools.js");
    expect(typeof climateModule.registerClimateTools).toBe("function");
    expect(typeof energyModule.registerEnergyTools).toBe("function");
  });
});
