Bun.env["DB_PATH"] = ":memory:";

/**
 * Tests for vnstock balance sheet + cash flow store (Gap 5)
 * TDD: failing first, then implement
 */

import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { tmpdir } from "os";
import { join } from "path";

// We test the store functions directly with an in-memory DB
// by overriding DB_PATH before importing

const testDbPath = join(tmpdir(), `vnstock-3stmt-test-${Date.now()}.db`);
Bun.env["DB_PATH"] = testDbPath;

// Import after setting env.
// Use absolute-path+query-bust to bypass Bun mock.module cache poison from 1466
// (which stubs vnstockStore.js with no-op functions).
const { initDatabase, closeDb } = await import("../infrastructure/db/schema.js");
const _vnstockRealMod = await import(
  Bun.resolveSync("../infrastructure/db/vnstockStore.js", import.meta.dir) + "?isolate=vnstock3stmt"
);
const { storeBalanceSheet, getLatestBalanceSheet, storeCashFlow, getLatestCashFlow } = _vnstockRealMod;

describe("vnstock balance sheet store", () => {
  beforeEach(async () => {
    closeDb();           // drop stale handle
    await initDatabase(); // fresh DB + schema
  });

  it("stores and retrieves balance sheet for a stock", () => {
    const bs = {
      code: "FPT",
      yearReport: 2025,
      quarter: 4,
      totalAssets: 88141.99,
      totalLiabilities: 44393.95,
      totalEquity: 43748.04,
      cash: 10522.11,
      shortTermDebt: 19169.70,
      longTermDebt: 1903.79,
      receivables: 14402.02,
      inventory: 2193.77,
      source: "vnstock" as const,
      fetchedAt: "2026-04-03T10:00:00.000Z",
    };

    storeBalanceSheet(bs);
    const retrieved = getLatestBalanceSheet("FPT");
    expect(retrieved).not.toBeNull();
    expect(retrieved!.code).toBe("FPT");
    expect(retrieved!.yearReport).toBe(2025);
    expect(retrieved!.quarter).toBe(4);
    expect(retrieved!.totalAssets).toBeCloseTo(88141.99, 1);
    expect(retrieved!.cash).toBeCloseTo(10522.11, 1);
  });

  it("returns null for unknown stock", () => {
    const result = getLatestBalanceSheet("UNKNOWN_XYZ");
    expect(result).toBeNull();
  });

  it("upserts on duplicate code+year+quarter", () => {
    const bs1 = {
      code: "VCB",
      yearReport: 2025,
      quarter: 4,
      totalAssets: 2442279.17,
      totalLiabilities: 2217720.44,
      totalEquity: 224558.73,
      cash: 15542.77,
      shortTermDebt: 0,
      longTermDebt: 27101.22,
      receivables: 0,
      inventory: 0,
      source: "vnstock" as const,
      fetchedAt: "2026-04-03T10:00:00.000Z",
    };
    storeBalanceSheet(bs1);

    const bs2 = { ...bs1, totalAssets: 2500000.00 };
    storeBalanceSheet(bs2);

    const retrieved = getLatestBalanceSheet("VCB");
    expect(retrieved!.totalAssets).toBeCloseTo(2500000.00, 1);
  });

  it("retrieves most recent quarter when multiple quarters stored", () => {
    const base = {
      code: "VNM",
      totalAssets: 30000,
      totalLiabilities: 10000,
      totalEquity: 20000,
      cash: 5000,
      shortTermDebt: 2000,
      longTermDebt: 1000,
      receivables: 3000,
      inventory: 1500,
      source: "vnstock" as const,
      fetchedAt: "2026-04-03T10:00:00.000Z",
    };
    storeBalanceSheet({ ...base, yearReport: 2024, quarter: 4 });
    storeBalanceSheet({ ...base, yearReport: 2025, quarter: 1, totalAssets: 31000 });
    storeBalanceSheet({ ...base, yearReport: 2025, quarter: 4, totalAssets: 35000 });

    const retrieved = getLatestBalanceSheet("VNM");
    expect(retrieved!.yearReport).toBe(2025);
    expect(retrieved!.quarter).toBe(4);
    expect(retrieved!.totalAssets).toBeCloseTo(35000, 1);
  });

  it("stores source and fetchedAt correctly", () => {
    const bs = {
      code: "VEA",
      yearReport: 2025,
      quarter: 2,
      totalAssets: 15000,
      totalLiabilities: 5000,
      totalEquity: 10000,
      cash: 2000,
      shortTermDebt: 1000,
      longTermDebt: 500,
      receivables: 800,
      inventory: 600,
      source: "vnstock" as const,
      fetchedAt: "2026-04-03T08:30:00.000Z",
    };
    const testStart = new Date();
    storeBalanceSheet(bs);
    const retrieved = getLatestBalanceSheet("VEA");
    expect(retrieved!.source).toBe("vnstock");
    // Fix 1 (FIX-VNSTOCK-FUNDAMENTALS-CRASH-SPIKE): fetched_at is now set by
    // SQLite's datetime('now') at write time, not by the Python-supplied fetchedAt.
    // Use a time-range assertion instead of exact equality.
    const storedAt = new Date(retrieved!.fetchedAt.replace(" ", "T") + "Z");
    expect(storedAt.getTime()).toBeGreaterThanOrEqual(testStart.getTime() - 1000);
    expect(storedAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });
});

describe("vnstock cash flow store", () => {
  beforeEach(async () => {
    closeDb();           // drop stale handle
    await initDatabase(); // fresh DB + schema
  });

  it("stores and retrieves cash flow for a stock", () => {
    const cf = {
      code: "FPT",
      yearReport: 2025,
      quarter: 4,
      operatingCashFlow: 4108.45,
      investingCashFlow: -3293.49,
      financingCashFlow: -51.15,
      netCashFlow: 763.81,
      source: "vnstock" as const,
      fetchedAt: "2026-04-03T10:00:00.000Z",
    };

    storeCashFlow(cf);
    const retrieved = getLatestCashFlow("FPT");
    expect(retrieved).not.toBeNull();
    expect(retrieved!.code).toBe("FPT");
    expect(retrieved!.operatingCashFlow).toBeCloseTo(4108.45, 1);
    expect(retrieved!.investingCashFlow).toBeCloseTo(-3293.49, 1);
    expect(retrieved!.netCashFlow).toBeCloseTo(763.81, 1);
  });

  it("returns null for unknown stock", () => {
    const result = getLatestCashFlow("UNKNOWN_XYZ");
    expect(result).toBeNull();
  });

  it("upserts on duplicate code+year+quarter", () => {
    const cf1 = {
      code: "VCB",
      yearReport: 2025,
      quarter: 4,
      operatingCashFlow: 9947.26,
      investingCashFlow: -660.77,
      financingCashFlow: -3776.80,
      netCashFlow: 5509.70,
      source: "vnstock" as const,
      fetchedAt: "2026-04-03T10:00:00.000Z",
    };
    storeCashFlow(cf1);
    const cf2 = { ...cf1, operatingCashFlow: 12000.00 };
    storeCashFlow(cf2);

    const retrieved = getLatestCashFlow("VCB");
    expect(retrieved!.operatingCashFlow).toBeCloseTo(12000.00, 1);
  });

  it("retrieves most recent quarter when multiple stored", () => {
    const base = {
      code: "VNM",
      operatingCashFlow: 1000,
      investingCashFlow: -500,
      financingCashFlow: -200,
      netCashFlow: 300,
      source: "vnstock" as const,
      fetchedAt: "2026-04-03T10:00:00.000Z",
    };
    storeCashFlow({ ...base, yearReport: 2024, quarter: 4 });
    storeCashFlow({ ...base, yearReport: 2025, quarter: 1, netCashFlow: 400 });
    storeCashFlow({ ...base, yearReport: 2025, quarter: 4, netCashFlow: 600 });

    const retrieved = getLatestCashFlow("VNM");
    expect(retrieved!.yearReport).toBe(2025);
    expect(retrieved!.quarter).toBe(4);
    expect(retrieved!.netCashFlow).toBeCloseTo(600, 1);
  });

  it("stores financing cash flow correctly (negative values)", () => {
    const cf = {
      code: "VEA",
      yearReport: 2025,
      quarter: 2,
      operatingCashFlow: 500,
      investingCashFlow: -800,
      financingCashFlow: -300,
      netCashFlow: -600,
      source: "vnstock" as const,
      fetchedAt: "2026-04-03T10:00:00.000Z",
    };
    storeCashFlow(cf);
    const retrieved = getLatestCashFlow("VEA");
    expect(retrieved!.financingCashFlow).toBeCloseTo(-300, 1);
    expect(retrieved!.netCashFlow).toBeCloseTo(-600, 1);
  });
});

afterAll(() => {
  closeDb();
  // Restore DB_PATH to :memory: so subsequent test files in the same Bun worker
  // are not contaminated by the temp-file path set at module load (line 17).
  Bun.env["DB_PATH"] = ":memory:";
});
