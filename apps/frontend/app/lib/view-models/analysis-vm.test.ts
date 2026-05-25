/**
 * Tests for analysis-vm.ts view model — P1-C (G12 streak task #3)
 * Uses hardcoded fixture data — no fetch mocking.
 */
import { describe, it, expect } from "vitest";
import { buildWatchlistTileVM } from "./analysis-vm";

describe("buildWatchlistTileVM", () => {
  it("tile with price returns hasPrice=true and formatted display", () => {
    const vm = buildWatchlistTileVM("VNM", 80000, 1.5, "up");
    expect(vm.ticker).toBe("VNM");
    expect(vm.hasPrice).toBe(true);
    expect(vm.priceDisplay).toBe("80.000"); // vi-VN locale
    expect(vm.changePctDisplay).toContain("%");
    expect(vm.changePctDisplay).toContain("↑");
  });

  it("tile without price returns hasPrice=false", () => {
    const vm = buildWatchlistTileVM("HPG", undefined, undefined, undefined);
    expect(vm.ticker).toBe("HPG");
    expect(vm.hasPrice).toBe(false);
    expect(vm.priceDisplay).toBe("Không có giá");
  });

  it("direction up returns upward arrow symbol and green class", () => {
    const vm = buildWatchlistTileVM("FPT", 100000, 2.0, "up");
    expect(vm.directionSymbol).toBe("↑");
    expect(vm.directionCls).toBe("text-green-400");
  });

  it("direction down returns downward arrow symbol and red class", () => {
    const vm = buildWatchlistTileVM("VCB", 90000, -0.5, "down");
    expect(vm.directionSymbol).toBe("↓");
    expect(vm.directionCls).toBe("text-red-400");
  });

  it("multi-formatter: both formatChangePct and formatDirectionArrow outputs present in view model", () => {
    // G2 analog: proves both formatters are composed correctly
    const vm = buildWatchlistTileVM("SSI", 25000, 3.2, "up");
    // formatChangePct output: formatted contains "+" and "%"
    expect(vm.changePctDisplay).toContain("+");
    expect(vm.changePctDisplay).toContain("%");
    // formatDirectionArrow output: direction symbol is correct
    expect(vm.directionSymbol).toBe("↑");
    // Both are reflected in the view model simultaneously
    expect(vm.hasPrice).toBe(true);
  });

  it("market-data-policy: view model output includes direction + delta, never bare snapshot", () => {
    // AC-4: named test for market-data policy end-to-end
    const vm = buildWatchlistTileVM("VIC", 50000, 1.5, "up");
    // changePctDisplay must include direction symbol AND % — never a bare number
    expect(vm.changePctDisplay).toContain("%");
    expect(vm.changePctDisplay).toMatch(/[↑↓—]/);
    // Raw float must not appear without context
    expect(vm.changePctDisplay).not.toMatch(/^\d+\.\d+$/);
  });
});
