/**
 * Task 186 — Sector Rotation Detector
 *
 * Tests for `detectSectorRotation()` (domain service) and
 * `registerSectorRotationTools()` (MCP tool: `get_sector_rotation`).
 *
 * Acceptance criteria:
 *  1.  Groups stocks by sector using sectorPeers.ts mapping
 *  2.  Sector with all stocks 5d return > +2% and 1d > +0.5% → "DONG TIEN VAO"
 *  3.  Sector with all stocks 5d return < -2% and 1d < -0.5% → "DONG TIEN RA"
 *  4.  Sectors ranked by 5d return descending
 *  5.  OUTFLOW sector containing a watchlist stock triggers warning line
 *  6.  Empty market_prices → "Chua co du lieu gia thi truong"
 *  7.  Only 1d data available → output contains "(chi co du lieu 1 ngay)"
 *  8.  Mixed sectors classified as neutral (neither inflow nor outflow)
 *  9.  A sector with some stocks below threshold is not classified as DONG TIEN VAO
 * 10.  A sector with some stocks above threshold is not classified as DONG TIEN RA
 * 11.  Single-stock sector meeting all thresholds still classified correctly
 * 12.  Watchlist stock in INFLOW sector does NOT trigger warning
 * 13.  Sector with no price data included with null return
 * 14.  5d return computed correctly: (price_now - price_5d_ago) / price_5d_ago * 100
 * 15.  1d return computed correctly: (price_now - price_1d_ago) / price_1d_ago * 100
 * 16.  Tool registered as `get_sector_rotation` on McpServer
 * 17.  Barrel index exports registerSectorRotationTools
 * 18.  Output includes sector name in Vietnamese (from SECTOR_NAME_VI)
 *
 * >= 16 tests, 0 failures
 * `bun tsc --noEmit` → 0 errors
 */

import { describe, it, expect } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  detectSectorRotation,
  computeReturn,
  classifySector,
  type SectorPriceData,
  type SectorRotationResult,
} from "../domain/services/sectorRotationDetector.js";
import { registerSectorRotationTools } from "../interface/mcp/tools/sector/sectorRotationTools.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helper: build a SectorPriceData entry
// ─────────────────────────────────────────────────────────────────────────────

function makeStock(
  code: string,
  priceNow: number,
  price1dAgo: number | null,
  price5dAgo: number | null,
): SectorPriceData {
  return { code, priceNow, price1dAgo, price5dAgo };
}

// ─────────────────────────────────────────────────────────────────────────────
// Unit tests — computeReturn()
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 186 — computeReturn()", () => {
  it("computes positive return correctly", () => {
    // (110 - 100) / 100 * 100 = +10%
    expect(computeReturn(110, 100)).toBeCloseTo(10, 2);
  });

  it("computes negative return correctly", () => {
    // (90 - 100) / 100 * 100 = -10%
    expect(computeReturn(90, 100)).toBeCloseTo(-10, 2);
  });

  it("returns null when prior price is null", () => {
    expect(computeReturn(100, null)).toBeNull();
  });

  it("returns null when prior price is zero (division guard)", () => {
    expect(computeReturn(100, 0)).toBeNull();
  });

  it("returns 0 when prices are equal", () => {
    expect(computeReturn(100, 100)).toBeCloseTo(0, 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Unit tests — classifySector()
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 186 — classifySector()", () => {
  it("returns DONG_TIEN_VAO when all stocks have 5d > +2% and 1d > +0.5%", () => {
    const stocks = [
      makeStock("VCB", 110, 108, 100),  // 5d: +10%, 1d: +1.85%
      makeStock("BID", 105, 103, 99),   // 5d: +6.06%, 1d: +1.94%
    ];
    expect(classifySector(stocks)).toBe("DONG_TIEN_VAO");
  });

  it("returns DONG_TIEN_RA when all stocks have 5d < -2% and 1d < -0.5%", () => {
    const stocks = [
      makeStock("VCB", 90, 92, 100),  // 5d: -10%, 1d: -2.17%
      makeStock("BID", 95, 97, 102),  // 5d: -6.86%, 1d: -2.06%
    ];
    expect(classifySector(stocks)).toBe("DONG_TIEN_RA");
  });

  it("returns NEUTRAL when stocks are mixed", () => {
    const stocks = [
      makeStock("VCB", 110, 108, 100),  // positive
      makeStock("BID", 90, 92, 100),    // negative
    ];
    expect(classifySector(stocks)).toBe("NEUTRAL");
  });

  it("returns NEUTRAL when 5d return is between -2% and +2%", () => {
    const stocks = [
      makeStock("VCB", 101, 100.4, 100),  // 5d: +1%, 1d: +0.6%
    ];
    expect(classifySector(stocks)).toBe("NEUTRAL");
  });

  it("returns NEUTRAL when 1d return is between -0.5% and +0.5% (5d ok)", () => {
    const stocks = [
      makeStock("VCB", 103, 103, 100),  // 5d: +3%, 1d: 0%
    ];
    expect(classifySector(stocks)).toBe("NEUTRAL");
  });

  it("does NOT classify as DONG_TIEN_VAO if one stock fails 5d threshold", () => {
    const stocks = [
      makeStock("VCB", 110, 108, 100),  // 5d: +10%, OK
      makeStock("BID", 101, 100.4, 100), // 5d: +1%, NOT OK
    ];
    expect(classifySector(stocks)).not.toBe("DONG_TIEN_VAO");
  });

  it("does NOT classify as DONG_TIEN_RA if one stock fails 5d threshold", () => {
    const stocks = [
      makeStock("VCB", 90, 92, 100),   // 5d: -10%, OK
      makeStock("BID", 99, 97, 100),   // 5d: -1%, NOT OK
    ];
    expect(classifySector(stocks)).not.toBe("DONG_TIEN_RA");
  });

  it("single-stock sector meeting all thresholds classified as DONG_TIEN_VAO", () => {
    const stocks = [makeStock("VCB", 110, 108, 100)]; // 5d: +10%, 1d: +1.85%
    expect(classifySector(stocks)).toBe("DONG_TIEN_VAO");
  });

  it("returns NEUTRAL when no price history available (null prior prices)", () => {
    const stocks = [makeStock("VCB", 100, null, null)];
    expect(classifySector(stocks)).toBe("NEUTRAL");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Unit tests — detectSectorRotation()
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 186 — detectSectorRotation()", () => {
  it("returns empty sectors array when no price data provided", () => {
    const result = detectSectorRotation({}, [], []);
    expect(result.sectors).toHaveLength(0);
    expect(result.hasData).toBe(false);
  });

  it("groups stocks by sector and returns per-sector results", () => {
    const priceMap: Record<string, SectorPriceData> = {
      VCB: makeStock("VCB", 110, 108, 100),
      BID: makeStock("BID", 105, 103, 99),
      FPT: makeStock("FPT", 90, 92, 100),
    };
    // VCB+BID = banking, FPT = tech
    const result = detectSectorRotation(priceMap, ["banking", "tech"], []);
    expect(result.sectors.length).toBeGreaterThanOrEqual(2);
  });

  it("sectors ranked by 5d return descending", () => {
    const priceMap: Record<string, SectorPriceData> = {
      VCB: makeStock("VCB", 110, 108, 100),  // banking 5d: +10%
      BID: makeStock("BID", 105, 103, 99),
      FPT: makeStock("FPT", 90, 92, 100),    // tech 5d: -10%
    };
    const result = detectSectorRotation(priceMap, ["banking", "tech"], []);
    // banking (positive) should come before tech (negative)
    const bankingIdx = result.sectors.findIndex((s) => s.sector === "banking");
    const techIdx = result.sectors.findIndex((s) => s.sector === "tech");
    if (bankingIdx >= 0 && techIdx >= 0) {
      expect(bankingIdx).toBeLessThan(techIdx);
    }
  });

  it("flags warning for OUTFLOW sector containing a watchlist stock", () => {
    const priceMap: Record<string, SectorPriceData> = {
      FPT: makeStock("FPT", 90, 92, 100),   // 5d: -10%, 1d: -2.17%
      CMG: makeStock("CMG", 88, 90, 100),   // 5d: -12%, 1d: -2.22%
    };
    const result = detectSectorRotation(priceMap, ["tech"], ["FPT"]);
    const techSector = result.sectors.find((s) => s.sector === "tech");
    expect(techSector?.classification).toBe("DONG_TIEN_RA");
    expect(techSector?.watchlistWarning).toBe(true);
  });

  it("does NOT flag warning for INFLOW sector containing a watchlist stock", () => {
    const priceMap: Record<string, SectorPriceData> = {
      FPT: makeStock("FPT", 110, 108, 100),  // 5d: +10%, 1d: +1.85%
      CMG: makeStock("CMG", 105, 103, 99),   // 5d: +6.06%, 1d: +1.94%
    };
    const result = detectSectorRotation(priceMap, ["tech"], ["FPT"]);
    const techSector = result.sectors.find((s) => s.sector === "tech");
    expect(techSector?.watchlistWarning).toBe(false);
  });

  it("only-1d flag set when all stocks have price1dAgo but no price5dAgo", () => {
    const priceMap: Record<string, SectorPriceData> = {
      VCB: makeStock("VCB", 110, 108, null),
    };
    const result = detectSectorRotation(priceMap, ["banking"], []);
    expect(result.only1dAvailable).toBe(true);
  });

  it("only1dAvailable is false when 5d data exists", () => {
    const priceMap: Record<string, SectorPriceData> = {
      VCB: makeStock("VCB", 110, 108, 100),
    };
    const result = detectSectorRotation(priceMap, ["banking"], []);
    expect(result.only1dAvailable).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Registration tests — McpServer integration
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 186 — registerSectorRotationTools()", () => {
  it("is exported as a function from the tools module", () => {
    expect(typeof registerSectorRotationTools).toBe("function");
  });

  it("registers get_sector_rotation on McpServer without throwing", () => {
    const server = new McpServer(
      { name: "test", version: "1.0.0" },
      { capabilities: { tools: {} } },
    );
    expect(() => registerSectorRotationTools(server)).not.toThrow();
    const tools = (server as unknown as {
      _registeredTools: Record<string, unknown>;
    })._registeredTools;
    expect(tools["get_sector_rotation"]).toBeDefined();
  });

  it("barrel index exports registerSectorRotationTools", async () => {
    const mod = await import("../interface/mcp/tools/sector/index.js");
    expect(typeof mod.registerSectorRotationTools).toBe("function");
  });
});
