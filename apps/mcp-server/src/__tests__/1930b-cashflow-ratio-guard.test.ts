/**
 * Task 1930b — cashFlow OCF/NI ratio plausibility guard
 *
 * Tests the three new fields on CashFlowFound:
 *   ocf_ni_ratio        — guarded value (null when |raw| > 20)
 *   ocf_ni_ratio_raw    — unguarded value (null only if not computable)
 *   ocf_ni_suppressed   — true when raw exists but exceeded the limit
 *
 * RED first: these assertions must FAIL before production code changes,
 * then PASS after.
 */

import { describe, it, expect } from "bun:test";
import Database from "bun:sqlite";

import { buildGetCashFlowHandler } from "../interface/mcp/tools/financial-reports/cashFlowTool.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

interface SeedRow {
  action_code: string;
  period_year: number;
  period_quarter: number;
  net_profit: number | null;
  operating_cf: number | null;
  investing_cf: number | null;
  financing_cf: number | null;
  capex: number | null;
  free_cash_flow: number | null;
}

function makeTestDb(): InstanceType<typeof Database> {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS financial_reports (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      action_code           TEXT    NOT NULL,
      period_year           INTEGER NOT NULL,
      period_quarter        INTEGER,
      net_profit            REAL,
      operating_cf          REAL,
      investing_cf          REAL,
      financing_cf          REAL,
      capex                 REAL,
      free_cash_flow        REAL,
      operating_cash_flow   REAL,
      net_profit_api_bridge REAL,
      inventory             REAL,
      current_assets        REAL,
      cash                  REAL
    );
  `);
  return db;
}

function insertRow(db: InstanceType<typeof Database>, row: SeedRow): void {
  db.prepare(`
    INSERT INTO financial_reports
      (action_code, period_year, period_quarter,
       net_profit, operating_cf, investing_cf, financing_cf, capex, free_cash_flow)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.action_code,
    row.period_year,
    row.period_quarter,
    row.net_profit,
    row.operating_cf,
    row.investing_cf,
    row.financing_cf,
    row.capex,
    row.free_cash_flow,
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("1930b — cashFlow OCF/NI ratio plausibility guard", () => {
  // T1 — Normal plausible ratio (OCF=1500, NI=1000) → ratio passes
  it("T1: normal plausible ratio (1.5) passes guard", async () => {
    const db = makeTestDb();
    insertRow(db, {
      action_code: "TST",
      period_year: 2025,
      period_quarter: 1,
      net_profit: 1000,
      operating_cf: 1500,
      investing_cf: -500,
      financing_cf: -200,
      capex: -300,
      free_cash_flow: 1200,
    });

    const handler = buildGetCashFlowHandler(db);
    const result = await handler({ ticker: "TST", period: "Q1", year: 2025 });
    const envelope = JSON.parse(result.content[0].text);

    expect(envelope.found).toBe(true);
    expect(envelope.ocf_ni_ratio).toBeCloseTo(1.5, 10);
    expect(envelope.ocf_ni_ratio_raw).toBeCloseTo(1.5, 10);
    expect(envelope.ocf_ni_suppressed).toBe(false);
  });

  // T2 — FPT-like implausible (OCF=5040000, NI=10000) → raw=504, suppressed
  it("T2: FPT-like implausible (raw=504) is suppressed", async () => {
    const db = makeTestDb();
    insertRow(db, {
      action_code: "FPT",
      period_year: 2025,
      period_quarter: 1,
      net_profit: 10000,
      operating_cf: 5040000,
      investing_cf: -100000,
      financing_cf: -50000,
      capex: -80000,
      free_cash_flow: 4960000,
    });

    const handler = buildGetCashFlowHandler(db);
    const result = await handler({ ticker: "FPT", period: "Q1", year: 2025 });
    const envelope = JSON.parse(result.content[0].text);

    expect(envelope.found).toBe(true);
    expect(envelope.ocf_ni_ratio).toBeNull();
    expect(envelope.ocf_ni_ratio_raw).toBeCloseTo(504, 1);
    expect(envelope.ocf_ni_suppressed).toBe(true);
  });

  // T3 — VCB-like extreme (OCF=142000000, NI=1) → raw≈1.42e8, suppressed
  it("T3: VCB-like extreme (raw≈1.42e8) is suppressed", async () => {
    const db = makeTestDb();
    insertRow(db, {
      action_code: "VCB",
      period_year: 2025,
      period_quarter: 1,
      net_profit: 1,
      operating_cf: 142000000,
      investing_cf: -1000000,
      financing_cf: -500000,
      capex: -800000,
      free_cash_flow: 141200000,
    });

    const handler = buildGetCashFlowHandler(db);
    const result = await handler({ ticker: "VCB", period: "Q1", year: 2025 });
    const envelope = JSON.parse(result.content[0].text);

    expect(envelope.found).toBe(true);
    expect(envelope.ocf_ni_ratio).toBeNull();
    expect(envelope.ocf_ni_ratio_raw).toBeCloseTo(1.42e8, -3);
    expect(envelope.ocf_ni_suppressed).toBe(true);
  });

  // T4 — Negative implausible (OCF=-25000, NI=1000) → raw=-25, suppressed
  it("T4: negative implausible (raw=-25) is suppressed (abs > 20)", async () => {
    const db = makeTestDb();
    insertRow(db, {
      action_code: "NEG",
      period_year: 2025,
      period_quarter: 2,
      net_profit: 1000,
      operating_cf: -25000,
      investing_cf: -500,
      financing_cf: -200,
      capex: -300,
      free_cash_flow: -25300,
    });

    const handler = buildGetCashFlowHandler(db);
    const result = await handler({ ticker: "NEG", period: "Q2", year: 2025 });
    const envelope = JSON.parse(result.content[0].text);

    expect(envelope.found).toBe(true);
    expect(envelope.ocf_ni_ratio).toBeNull();
    expect(envelope.ocf_ni_ratio_raw).toBeCloseTo(-25, 1);
    expect(envelope.ocf_ni_suppressed).toBe(true);
  });

  // T5 — Exactly at limit (OCF=20000, NI=1000) → raw=20.0, passes (> not >=)
  it("T5: exactly at limit (raw=20.0) passes guard (strictly greater required)", async () => {
    const db = makeTestDb();
    insertRow(db, {
      action_code: "LIM",
      period_year: 2025,
      period_quarter: 3,
      net_profit: 1000,
      operating_cf: 20000,
      investing_cf: -500,
      financing_cf: -200,
      capex: -300,
      free_cash_flow: 19700,
    });

    const handler = buildGetCashFlowHandler(db);
    const result = await handler({ ticker: "LIM", period: "Q3", year: 2025 });
    const envelope = JSON.parse(result.content[0].text);

    expect(envelope.found).toBe(true);
    expect(envelope.ocf_ni_ratio).toBeCloseTo(20.0, 10);
    expect(envelope.ocf_ni_ratio_raw).toBeCloseTo(20.0, 10);
    expect(envelope.ocf_ni_suppressed).toBe(false);
  });

  // T6 — net_profit = 0 → both null, not suppressed (unavailable, not suppressed)
  it("T6: net_profit=0 → both ratio fields null, suppressed=false", async () => {
    const db = makeTestDb();
    insertRow(db, {
      action_code: "ZNP",
      period_year: 2025,
      period_quarter: 1,
      net_profit: 0,
      operating_cf: 5000,
      investing_cf: -500,
      financing_cf: -200,
      capex: -300,
      free_cash_flow: 4700,
    });

    const handler = buildGetCashFlowHandler(db);
    const result = await handler({ ticker: "ZNP", period: "Q1", year: 2025 });
    const envelope = JSON.parse(result.content[0].text);

    expect(envelope.found).toBe(true);
    expect(envelope.ocf_ni_ratio).toBeNull();
    expect(envelope.ocf_ni_ratio_raw).toBeNull();
    expect(envelope.ocf_ni_suppressed).toBe(false);
  });

  // T7 — net_profit = NULL in DB → both null, not suppressed
  it("T7: net_profit=NULL in DB → both ratio fields null, suppressed=false", async () => {
    const db = makeTestDb();
    insertRow(db, {
      action_code: "NNP",
      period_year: 2025,
      period_quarter: 1,
      net_profit: null,
      operating_cf: 7000,
      investing_cf: -200,
      financing_cf: -100,
      capex: -150,
      free_cash_flow: 6850,
    });

    const handler = buildGetCashFlowHandler(db);
    const result = await handler({ ticker: "NNP", period: "Q1", year: 2025 });
    const envelope = JSON.parse(result.content[0].text);

    expect(envelope.found).toBe(true);
    expect(envelope.ocf_ni_ratio).toBeNull();
    expect(envelope.ocf_ni_ratio_raw).toBeNull();
    expect(envelope.ocf_ni_suppressed).toBe(false);
  });
});
