/**
 * Tests for sectorValuationComparator domain service (Gap 7)
 * TDD: failing first, then implement
 */

import { describe, it, expect } from "bun:test";
import { compareToSector } from "../domain/services/sectorValuationComparator.js";

describe("sectorValuationComparator", () => {
  const sectorPeers = [
    { code: "VCB", pe: 12.0, pb: 2.0, roe: 18.0 },
    { code: "BID", pe: 10.0, pb: 1.5, roe: 15.0 },
    { code: "CTG", pe: 9.0, pb: 1.3, roe: 14.0 },
    { code: "MBB", pe: 7.0, pb: 1.2, roe: 16.0 },
    { code: "ACB", pe: 8.0, pb: 1.8, roe: 22.0 },
  ];
  // Median PE = 9 (sorted: 7, 8, 9, 10, 12)
  // Median PB = 1.5 (sorted: 1.2, 1.3, 1.5, 1.8, 2.0)
  // Median ROE = 16 (sorted: 14, 15, 16, 18, 22)

  it("classifies stock with PE > 115% of median as premium", () => {
    // Median PE = 9, premium threshold = 9 * 1.15 = 10.35
    const target = { code: "HDB", pe: 12.0, pb: 1.5, roe: 16.0 };
    const result = compareToSector(target, sectorPeers);
    expect(result.peVsSector).toBe("premium");
    expect(result.sectorMedianPe).toBeCloseTo(9.0, 1);
  });

  it("classifies stock with PE < 85% of median as discount", () => {
    // Median PE = 9, discount threshold = 9 * 0.85 = 7.65
    const target = { code: "SHB", pe: 6.0, pb: 1.5, roe: 15.0 };
    const result = compareToSector(target, sectorPeers);
    expect(result.peVsSector).toBe("discount");
  });

  it("classifies stock within ±15% of median PE as inline", () => {
    // Median PE = 9, inline range: [7.65, 10.35]
    const target = { code: "TPB", pe: 9.5, pb: 1.5, roe: 16.0 };
    const result = compareToSector(target, sectorPeers);
    expect(result.peVsSector).toBe("inline");
  });

  it("classifies PB premium correctly", () => {
    // Median PB = 1.5, premium: > 1.5 * 1.15 = 1.725
    const target = { code: "VCB", pe: 9.0, pb: 2.5, roe: 18.0 };
    const result = compareToSector(target, sectorPeers);
    expect(result.pbVsSector).toBe("premium");
    expect(result.sectorMedianPb).toBeCloseTo(1.5, 1);
  });

  it("classifies PB discount correctly", () => {
    // Median PB = 1.5, discount: < 1.5 * 0.85 = 1.275
    const target = { code: "SSB", pe: 9.0, pb: 1.0, roe: 12.0 };
    const result = compareToSector(target, sectorPeers);
    expect(result.pbVsSector).toBe("discount");
  });

  it("classifies PB inline within ±15%", () => {
    // Median PB = 1.5, inline: [1.275, 1.725]
    const target = { code: "TCB", pe: 9.0, pb: 1.6, roe: 17.0 };
    const result = compareToSector(target, sectorPeers);
    expect(result.pbVsSector).toBe("inline");
  });

  it("returns correct ROE and sector median ROE", () => {
    const target = { code: "VPB", pe: 8.0, pb: 1.4, roe: 20.0 };
    const result = compareToSector(target, sectorPeers);
    expect(result.roe).toBeCloseTo(20.0, 1);
    expect(result.sectorMedianRoe).toBeCloseTo(16.0, 1);
  });

  it("handles even-length peer list (median = average of two middle values)", () => {
    // 4 peers: sorted PE [7, 9, 12, 14] → median = (9+12)/2 = 10.5
    const peers = [
      { code: "A", pe: 14.0, pb: 2.0, roe: 15.0 },
      { code: "B", pe: 7.0, pb: 1.2, roe: 12.0 },
      { code: "C", pe: 9.0, pb: 1.5, roe: 18.0 },
      { code: "D", pe: 12.0, pb: 1.8, roe: 20.0 },
    ];
    const target = { code: "T", pe: 10.5, pb: 1.5, roe: 16.0 };
    const result = compareToSector(target, peers);
    expect(result.sectorMedianPe).toBeCloseTo(10.5, 1);
    expect(result.peVsSector).toBe("inline");
  });

  it("returns target code in result", () => {
    const target = { code: "VNM", pe: 18.0, pb: 3.0, roe: 25.0 };
    const result = compareToSector(target, sectorPeers);
    expect(result.code).toBe("VNM");
    expect(result.pe).toBeCloseTo(18.0, 1);
    expect(result.pb).toBeCloseTo(3.0, 1);
  });

  it("handles single-peer list (target is inline of itself)", () => {
    const peers = [{ code: "VCB", pe: 10.0, pb: 2.0, roe: 18.0 }];
    const target = { code: "BID", pe: 10.0, pb: 2.0, roe: 18.0 };
    const result = compareToSector(target, peers);
    expect(result.peVsSector).toBe("inline");
    expect(result.sectorMedianPe).toBeCloseTo(10.0, 1);
  });
});
