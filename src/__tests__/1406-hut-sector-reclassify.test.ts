import { describe, it, expect } from "bun:test";
import { getSectorPeers, getStockProfile } from "../domain/services/sectorPeers.js";

describe("Task 1406 — HUT sector reclassification", () => {
  it("HUT is NOT in real_estate peer list", () => {
    const peers = getSectorPeers("real_estate", new Set(), Infinity);
    const codes = peers.map((p) => p.code);
    expect(codes).not.toContain("HUT");
  });

  it("HUT IS in construction peer list", () => {
    const peers = getSectorPeers("construction", new Set(), Infinity);
    expect(peers).toContainEqual({ code: "HUT", exchange: "HNX" });
  });

  it("getStockProfile('HUT') returns domain=construction", () => {
    const profile = getStockProfile("HUT");
    expect(profile).not.toBeNull();
    expect(profile!.domain).toBe("construction");
    expect(profile!.exchange).toBe("HNX");
  });
});
