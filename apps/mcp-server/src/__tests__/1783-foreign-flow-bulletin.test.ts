/**
 * Task 1783 — TDD: Morning bulletin foreign flow section fixes
 *
 * BUG-1: Stale guard — all-zero top-5 entries must render
 *         "Khối ngoại: Dữ liệu không khả dụng (pipeline tạm dừng)"
 *         instead of zero-value lines.
 *
 * BUG-2: Sort — when real data exists, top-5 must be sorted by
 *         |net_flow| descending (biggest movers first).
 *
 * Layer: tests — exercises formatForeignFlowSection only (pure function).
 * No DB, no HTTP, no Telegram sends.
 */

import { describe, it, expect } from "bun:test";
import { formatForeignFlowSection } from "../scheduler/briefings/eveningSummaryJob.js";

// ─────────────────────────────────────────────────────────────────────────────
// BUG-1: Stale guard
// ─────────────────────────────────────────────────────────────────────────────

describe("1783 BUG-1 — stale guard: all-zero entries renders unavailable message", () => {
  it("returns unavailable indicator when all foreignNetVol, foreignBuyVol, foreignSellVol are 0", () => {
    const movers = [
      { code: "ACB", foreignNetVol: 0, foreignBuyVol: 0, foreignSellVol: 0 },
      { code: "BID", foreignNetVol: 0, foreignBuyVol: 0, foreignSellVol: 0 },
      { code: "CTG", foreignNetVol: 0, foreignBuyVol: 0, foreignSellVol: 0 },
      { code: "MBB", foreignNetVol: 0, foreignBuyVol: 0, foreignSellVol: 0 },
      { code: "VCB", foreignNetVol: 0, foreignBuyVol: 0, foreignSellVol: 0 },
    ];
    const lines = formatForeignFlowSection(movers);
    // Must not render zero-value lines
    expect(lines.join("\n")).not.toContain("0.000k");
    // Must render the unavailability indicator
    expect(lines.join("\n")).toContain("Dữ liệu không khả dụng");
  });

  it("returns unavailable indicator when all entries are zero (single entry)", () => {
    const movers = [
      { code: "VCB", foreignNetVol: 0, foreignBuyVol: 0, foreignSellVol: 0 },
    ];
    const lines = formatForeignFlowSection(movers);
    expect(lines.join("\n")).toContain("Dữ liệu không khả dụng");
  });

  it("returns empty array for empty input (unchanged behaviour)", () => {
    const lines = formatForeignFlowSection([]);
    expect(lines).toHaveLength(0);
  });

  it("renders normally when at least one entry has non-zero net flow", () => {
    const movers = [
      { code: "VCB", foreignNetVol: 500000, foreignBuyVol: 600000, foreignSellVol: 100000 },
      { code: "ACB", foreignNetVol: 0, foreignBuyVol: 0, foreignSellVol: 0 },
    ];
    const lines = formatForeignFlowSection(movers);
    // Should NOT trigger stale guard — one real entry exists
    expect(lines.join("\n")).not.toContain("Dữ liệu không khả dụng");
    expect(lines.join("\n")).toContain("VCB");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BUG-2: Sort by |net_flow| descending
// ─────────────────────────────────────────────────────────────────────────────

describe("1783 BUG-2 — sort: real data sorted by |net_flow| descending", () => {
  it("renders highest |net_flow| first when movers are unsorted", () => {
    const movers = [
      { code: "ACB", foreignNetVol: 100000,  foreignBuyVol: 200000, foreignSellVol: 100000 },
      { code: "VCB", foreignNetVol: 900000,  foreignBuyVol: 1000000, foreignSellVol: 100000 },
      { code: "HPG", foreignNetVol: -500000, foreignBuyVol: 100000, foreignSellVol: 600000 },
    ];
    const lines = formatForeignFlowSection(movers);
    const text = lines.join("\n");
    // VCB (|net|=900k) must appear before HPG (|net|=500k) which must appear before ACB (|net|=100k)
    const vcbIdx = text.indexOf("VCB");
    const hpgIdx = text.indexOf("HPG");
    const acbIdx = text.indexOf("ACB");
    expect(vcbIdx).toBeGreaterThanOrEqual(0);
    expect(hpgIdx).toBeGreaterThanOrEqual(0);
    expect(acbIdx).toBeGreaterThanOrEqual(0);
    expect(vcbIdx).toBeLessThan(hpgIdx);
    expect(hpgIdx).toBeLessThan(acbIdx);
  });

  it("renders negative |net_flow| before smaller positive when abs is larger", () => {
    const movers = [
      { code: "BID", foreignNetVol: 50000,   foreignBuyVol: 100000, foreignSellVol: 50000 },
      { code: "MSN", foreignNetVol: -700000,  foreignBuyVol: 50000,  foreignSellVol: 750000 },
    ];
    const lines = formatForeignFlowSection(movers);
    const text = lines.join("\n");
    const msnIdx = text.indexOf("MSN");
    const bidIdx = text.indexOf("BID");
    expect(msnIdx).toBeLessThan(bidIdx);
  });

  it("renders mua ròng for positive net flow and bán ròng for negative", () => {
    const movers = [
      { code: "VCB", foreignNetVol: 500000,  foreignBuyVol: 600000, foreignSellVol: 100000 },
      { code: "HPG", foreignNetVol: -300000, foreignBuyVol: 50000,  foreignSellVol: 350000 },
    ];
    const lines = formatForeignFlowSection(movers);
    const text = lines.join("\n");
    expect(text).toContain("VCB");
    expect(text).toContain("mua ròng");
    expect(text).toContain("HPG");
    expect(text).toContain("bán ròng");
  });
});
