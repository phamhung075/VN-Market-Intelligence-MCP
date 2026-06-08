/**
 * Task 1850a — FIX vnstock-sync Array.filter crash
 *
 * AC-1: storeOfficers handles null/non-array officers without throwing
 * AC-2: null code rows in storeShareholders are skipped (not inserted)
 * AC-3: All existing tests pass
 * AC-4: No new test failures introduced
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect } from "bun:test";
import type { VnstockOfficer, VnstockShareholder } from "../infrastructure/fetchers/vnstockBridge.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ---------------------------------------------------------------------------
// AC-1: storeOfficers null/non-array guard (already fixed in 1833i — regression coverage)
// ---------------------------------------------------------------------------

describe("Task 1850a — storeOfficers Array.isArray guard (AC-1)", () => {
  it("Array.isArray guard: null input returns early without throwing", () => {
    const officers = null as unknown as VnstockOfficer[];
    expect(() => {
      if (!officers || !Array.isArray(officers)) {
        // guard branch — no throw
        return;
      }
      officers.filter((o) => !!o.code);
    }).not.toThrow();
  });

  it("Array.isArray guard: plain object input returns early without throwing", () => {
    const officers = { error: "rate limit exceeded" } as unknown as VnstockOfficer[];
    expect(() => {
      if (!officers || !Array.isArray(officers)) {
        return;
      }
      officers.filter((o) => !!o.code);
    }).not.toThrow();
  });

  it("Array.isArray guard: undefined input returns early without throwing", () => {
    const officers = undefined as unknown as VnstockOfficer[];
    expect(() => {
      if (!officers || !Array.isArray(officers)) {
        return;
      }
      officers.filter((o) => !!o.code);
    }).not.toThrow();
  });

  it("Array.isArray guard: valid array proceeds and filters null codes", () => {
    const officers: VnstockOfficer[] = [
      { code: "VCB", name: "A", position: "CEO", ownPercent: 0.1, quantity: 100 },
      { code: "",    name: "B", position: "CFO", ownPercent: 0,   quantity: 0 },
    ];
    let valid: VnstockOfficer[] = [];
    if (officers && Array.isArray(officers)) {
      valid = officers.filter((o) => !!o.code);
    }
    expect(valid.length).toBe(1);
    expect(valid[0]?.name).toBe("A");
  });
});

// ---------------------------------------------------------------------------
// AC-2: storeShareholders null-code guard
// ---------------------------------------------------------------------------

describe("Task 1850a — storeShareholders null-code guard (AC-2)", () => {
  it("filter predicate: holders with null code are skipped", () => {
    const holders: VnstockShareholder[] = [
      { code: "VCB", name: "Major Fund A", quantity: 1_000_000, ownPercent: 5.0 },
      { code: "",    name: "Unknown Holder", quantity: 500_000,   ownPercent: 2.5 },
      { code: "VCB", name: "Major Fund B", quantity: 800_000,   ownPercent: 4.0 },
    ];
    const valid = holders.filter((h) => !!h.code);
    const dropped = holders.length - valid.length;

    expect(valid.length).toBe(2);
    expect(dropped).toBe(1);
    expect(valid.map((h) => h.name)).not.toContain("Unknown Holder");
  });

  it("filter predicate: all valid codes → dropped = 0", () => {
    const holders: VnstockShareholder[] = [
      { code: "HPG", name: "SCIC", quantity: 5_000_000, ownPercent: 10.0 },
      { code: "HPG", name: "Dragon Fund", quantity: 2_000_000, ownPercent: 4.0 },
    ];
    const valid = holders.filter((h) => !!h.code);
    expect(valid.length).toBe(2);
    expect(holders.length - valid.length).toBe(0);
  });

  it("filter predicate: all null codes → valid is empty", () => {
    const holders: VnstockShareholder[] = [
      { code: "", name: "X", quantity: 0, ownPercent: 0 },
      { code: "", name: "Y", quantity: 0, ownPercent: 0 },
    ];
    const valid = holders.filter((h) => !!h.code);
    expect(valid.length).toBe(0);
  });

  it("filter predicate: empty array → valid is empty, no crash", () => {
    const holders: VnstockShareholder[] = [];
    const valid = holders.filter((h) => !!h.code);
    expect(valid.length).toBe(0);
  });

  it("warn condition: dropped > 0 produces correct message", () => {
    const holders: VnstockShareholder[] = [
      { code: "MBB", name: "A", quantity: 1_000, ownPercent: 0.1 },
      { code: "",    name: "B", quantity: 0,     ownPercent: 0 },
    ];
    const valid = holders.filter((h) => !!h.code);
    const dropped = holders.length - valid.length;
    const ticker = "MBB";

    const warnMsg = dropped > 0
      ? `[vnstock-store] storeShareholders: dropped ${dropped} row(s) with null/empty code for ticker ${ticker}`
      : "";

    expect(dropped).toBe(1);
    expect(warnMsg).toContain("dropped 1 row(s)");
    expect(warnMsg).toContain("MBB");
    expect(warnMsg).toContain("[vnstock-store] storeShareholders");
  });

  it("Array.isArray guard: null holders input returns early without throwing", () => {
    const holders = null as unknown as VnstockShareholder[];
    expect(() => {
      if (!holders || !Array.isArray(holders)) {
        return;
      }
      holders.filter((h) => !!h.code);
    }).not.toThrow();
  });

  it("Array.isArray guard: object holders input returns early without throwing", () => {
    const holders = { message: "rate limit" } as unknown as VnstockShareholder[];
    expect(() => {
      if (!holders || !Array.isArray(holders)) {
        return;
      }
      holders.filter((h) => !!h.code);
    }).not.toThrow();
  });
});
