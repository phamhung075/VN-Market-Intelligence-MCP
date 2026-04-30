// apps/mcp-server/src/__tests__/1787-gvr-sector-fix.test.ts
// Task 1787 — GVR must be classified as agriculture, not oil_gas

import { describe, it, expect } from "bun:test";
import { WATCHLIST_SEED } from "../infrastructure/db/seedWatchlist.js";

describe("Task 1787 — GVR sector classification", () => {
  const gvr = WATCHLIST_SEED.find((e) => e.code === "GVR");

  it("GVR entry exists in WATCHLIST_SEED", () => {
    expect(gvr).toBeDefined();
  });

  it("GVR domain is agriculture, not oil_gas", () => {
    expect(gvr?.domain).toBe("agriculture");
  });

  it("GVR is not classified as oil_gas", () => {
    expect(gvr?.domain).not.toBe("oil_gas");
  });

  it("GAS remains oil_gas (no collateral damage)", () => {
    const gas = WATCHLIST_SEED.find((e) => e.code === "GAS");
    expect(gas?.domain).toBe("oil_gas");
  });
});
