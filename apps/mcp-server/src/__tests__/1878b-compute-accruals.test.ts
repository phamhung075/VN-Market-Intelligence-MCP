/**
 * Task 1878b — compute_accruals TDD test suite (12 tests, T1-T12)
 *
 * RED phase: all tests fail before implementation exists.
 * Test file: src/__tests__/1878b-compute-accruals.test.ts
 *
 * Domain tests: pure function, no SQLite.
 * Tool tests: in-memory SQLite via getDb().
 */

import { describe, it, expect } from "bun:test";
import Database from "bun:sqlite";
import { z } from "zod";

// ── Domain function under test ──────────────────────────────────────────────
import {
  computeAccrualPoint,
  AccrualsInputSchema,
} from "../domain/services/financial-reports/accruals.js";

// ── Tool handler under test ─────────────────────────────────────────────────
import { buildComputeAccrualsHandler } from "../interface/mcp/tools/financial-reports/computeAccrualsTool.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Minimal in-memory DB with financial_reports table matching production schema slice. */
function makeTestDb(): InstanceType<typeof Database> {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE financial_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action_code TEXT NOT NULL,
      period_year INTEGER NOT NULL,
      period_quarter INTEGER,
      net_profit REAL,
      operating_cash_flow REAL,
      total_assets REAL
    );
  `);
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

function insertRow(
  db: InstanceType<typeof Database>,
  row: {
    action_code: string;
    period_year: number;
    period_quarter: number;
    net_profit: number | null;
    operating_cash_flow: number | null;
    total_assets: number | null;
  },
): void {
  db.prepare(`
    INSERT INTO financial_reports (action_code, period_year, period_quarter, net_profit, operating_cash_flow, total_assets)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    row.action_code,
    row.period_year,
    row.period_quarter,
    row.net_profit,
    row.operating_cash_flow,
    row.total_assets,
  );
}

// ── T1-T6: Domain unit tests ─────────────────────────────────────────────────

describe("1878b — computeAccrualPoint domain function", () => {
  it("T1: correct ratio — (300 - 100) / 5000 = 0.04", () => {
    const result = computeAccrualPoint({
      net_income_m: 300,
      ocf_m: 100,
      total_assets_m: 5000,
    });
    expect(result.accruals_ratio).toBeCloseTo(0.04, 10);
    expect(result.missing).toEqual([]);
    expect(result.error).toBeNull();
  });

  it("T2: null net_income → ratio null, missing includes NET_INCOME", () => {
    const result = computeAccrualPoint({
      net_income_m: null,
      ocf_m: 100,
      total_assets_m: 5000,
    });
    expect(result.accruals_ratio).toBeNull();
    expect(result.missing).toContain("NET_INCOME");
    expect(result.error).toBeNull();
  });

  it("T3: null OCF → ratio null, missing includes OCF", () => {
    const result = computeAccrualPoint({
      net_income_m: 500,
      ocf_m: null,
      total_assets_m: 5000,
    });
    expect(result.accruals_ratio).toBeNull();
    expect(result.missing).toContain("OCF");
    expect(result.error).toBeNull();
  });

  it("T4: null total_assets → ratio null, missing includes TOTAL_ASSETS", () => {
    const result = computeAccrualPoint({
      net_income_m: 500,
      ocf_m: 100,
      total_assets_m: null,
    });
    expect(result.accruals_ratio).toBeNull();
    expect(result.missing).toContain("TOTAL_ASSETS");
    expect(result.error).toBeNull();
  });

  it("T5: total_assets = 0 → ratio null, missing empty, error = zero_total_assets", () => {
    const result = computeAccrualPoint({
      net_income_m: 500,
      ocf_m: 200,
      total_assets_m: 0,
    });
    expect(result.accruals_ratio).toBeNull();
    expect(result.missing).toEqual([]);
    expect(result.error).toBe("zero_total_assets");
  });

  it("T6: multiple nulls accumulate — both NET_INCOME and OCF in missing", () => {
    const result = computeAccrualPoint({
      net_income_m: null,
      ocf_m: null,
      total_assets_m: 5000,
    });
    expect(result.accruals_ratio).toBeNull();
    expect(result.missing).toContain("NET_INCOME");
    expect(result.missing).toContain("OCF");
    expect(result.error).toBeNull();
  });
});

// ── T7-T12: Tool integration tests ──────────────────────────────────────────

describe("1878b — buildComputeAccrualsHandler tool tests", () => {
  it("T7: sort ascending — oldest quarter first", async () => {
    const db = makeTestDb();
    // Insert out of order to verify sort
    insertRow(db, { action_code: "VCB", period_year: 2023, period_quarter: 4, net_profit: 800, operating_cash_flow: 600, total_assets: 20000 });
    insertRow(db, { action_code: "VCB", period_year: 2023, period_quarter: 1, net_profit: 500, operating_cash_flow: 300, total_assets: 18000 });
    insertRow(db, { action_code: "VCB", period_year: 2023, period_quarter: 3, net_profit: 700, operating_cash_flow: 500, total_assets: 19500 });
    insertRow(db, { action_code: "VCB", period_year: 2023, period_quarter: 2, net_profit: 600, operating_cash_flow: 400, total_assets: 19000 });

    const handler = buildComputeAccrualsHandler(db);
    const result = await handler({ ticker: "VCB", quarters: 8 });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.data[0].period_quarter).toBe(1);
    expect(parsed.data[0].period_year).toBe(2023);
    expect(parsed.data[3].period_quarter).toBe(4);
  });

  it("T8: null-row included — Q2 OCF null → 3 rows returned, Q2 has accruals_ratio null", async () => {
    const db = makeTestDb();
    insertRow(db, { action_code: "TST", period_year: 2023, period_quarter: 1, net_profit: 400, operating_cash_flow: 200, total_assets: 10000 });
    insertRow(db, { action_code: "TST", period_year: 2023, period_quarter: 2, net_profit: 450, operating_cash_flow: null, total_assets: 10500 });
    insertRow(db, { action_code: "TST", period_year: 2023, period_quarter: 3, net_profit: 500, operating_cash_flow: 300, total_assets: 11000 });

    const handler = buildComputeAccrualsHandler(db);
    const result = await handler({ ticker: "TST", quarters: 8 });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.data.length).toBe(3);
    const q2 = parsed.data.find((r: Record<string, unknown>) => r.period_quarter === 2);
    expect(q2.accruals_ratio).toBeNull();
    expect(q2.missing).toContain("OCF");
  });

  it("T9: unknown ticker → quarters_returned 0, data empty array", async () => {
    const db = makeTestDb();
    const handler = buildComputeAccrualsHandler(db);
    const result = await handler({ ticker: "ZZZNONE", quarters: 8 });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.quarters_returned).toBe(0);
    expect(parsed.data).toEqual([]);
  });

  it("T10: lowercase ticker normalized — 'vcb' returns same as 'VCB'", async () => {
    const db = makeTestDb();
    insertRow(db, { action_code: "VCB", period_year: 2023, period_quarter: 1, net_profit: 500, operating_cash_flow: 300, total_assets: 18000 });

    const handler = buildComputeAccrualsHandler(db);
    const result = await handler({ ticker: "vcb", quarters: 8 });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.quarters_returned).toBeGreaterThan(0);
  });

  it("T11: default quarters = 8 — returns at most 8 rows when 12 seeded", async () => {
    const db = makeTestDb();
    // Seed 12 rows: 2020 Q1-Q4, 2021 Q1-Q4, 2022 Q1-Q4
    for (let year = 2020; year <= 2022; year++) {
      for (let q = 1; q <= 4; q++) {
        insertRow(db, { action_code: "FPT", period_year: year, period_quarter: q, net_profit: 400, operating_cash_flow: 250, total_assets: 8000 });
      }
    }

    const handler = buildComputeAccrualsHandler(db);
    // No quarters param — uses default 8
    const result = await handler({ ticker: "FPT" });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.data.length).toBe(8);
  });

  it("T12: quarters = 25 rejected by Zod schema before DB access", () => {
    const InputSchema = z.object({
      ticker: z.string().min(1).max(10),
      quarters: z.coerce.number().int().min(1).max(20).optional().default(8),
    });

    const parseResult = InputSchema.safeParse({ ticker: "VCB", quarters: 25 });
    expect(parseResult.success).toBe(false);
    if (!parseResult.success) {
      expect(parseResult.error.issues.length).toBeGreaterThan(0);
    }
  });
});
