/**
 * Task 1890a-A — get_cash_flow TDD test suite
 *
 * 3 test cases per AC:
 *   (a) Happy path — all 6 fields returned, source_tier=1 constant verified
 *   (b) Missing quarter / no-row-found — returns found:false envelope
 *   (c) Zero net_profit division guard — ocf_ni_ratio returns null
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
    CREATE TABLE financial_reports (
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
      net_profit_api_bridge REAL
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

describe("1890a-A — get_cash_flow tool", () => {
  // ── (a) Happy path ────────────────────────────────────────────────────────

  it("(a) happy path — all 6 fields returned; source_tier=1; ocf_ni_ratio correct", async () => {
    const db = makeTestDb();
    insertRow(db, {
      action_code: "VCB",
      period_year: 2025,
      period_quarter: 1,
      net_profit: 10000,
      operating_cf: 15000,
      investing_cf: -5000,
      financing_cf: -2000,
      capex: -3000,
      free_cash_flow: 12000,
    });

    const handler = buildGetCashFlowHandler(db);
    const result = await handler({ ticker: "VCB", period: "Q1", year: 2025 });
    const envelope = JSON.parse(result.content[0].text);

    // source_tier constant
    expect(envelope.source_tier).toBe(1);

    // found flag
    expect(envelope.found).toBe(true);

    // identifier fields
    expect(envelope.code).toBe("VCB");
    expect(envelope.period).toBe("Q1/2025");

    // all 6 financial fields present
    expect(envelope.operating_cf).toBe(15000);
    expect(envelope.investing_cf).toBe(-5000);
    expect(envelope.financing_cf).toBe(-2000);
    expect(envelope.capex).toBe(-3000);
    expect(envelope.free_cash_flow).toBe(12000);

    // ocf_ni_ratio = 15000 / 10000 = 1.5
    expect(envelope.ocf_ni_ratio).toBeCloseTo(1.5, 10);
  });

  // ── (b) No-row-found ──────────────────────────────────────────────────────

  it("(b) missing quarter — returns found:false envelope with code + period", async () => {
    const db = makeTestDb();
    // Seed Q1 only; request Q4 → no match
    insertRow(db, {
      action_code: "ACB",
      period_year: 2025,
      period_quarter: 1,
      net_profit: 8000,
      operating_cf: 9000,
      investing_cf: -1000,
      financing_cf: -500,
      capex: -800,
      free_cash_flow: 8200,
    });

    const handler = buildGetCashFlowHandler(db);
    const result = await handler({ ticker: "ACB", period: "Q4", year: 2025 });
    const envelope = JSON.parse(result.content[0].text);

    expect(envelope.source_tier).toBe(1);
    expect(envelope.found).toBe(false);
    expect(envelope.code).toBe("ACB");
    // period label uses requested values even when not found
    expect(envelope.period).toBe("Q4/2025");
  });

  it("(b) unknown ticker — returns found:false", async () => {
    const db = makeTestDb();
    const handler = buildGetCashFlowHandler(db);
    const result = await handler({ ticker: "ZZZNONE" });
    const envelope = JSON.parse(result.content[0].text);

    expect(envelope.source_tier).toBe(1);
    expect(envelope.found).toBe(false);
    expect(envelope.code).toBe("ZZZNONE");
  });

  // ── (c) Zero net_profit division guard ───────────────────────────────────

  it("(c) zero net_profit — ocf_ni_ratio is null (no division by zero)", async () => {
    const db = makeTestDb();
    insertRow(db, {
      action_code: "MBB",
      period_year: 2025,
      period_quarter: 2,
      net_profit: 0,        // division guard: must yield null ratio
      operating_cf: 5000,
      investing_cf: -1000,
      financing_cf: -500,
      capex: -800,
      free_cash_flow: 4200,
    });

    const handler = buildGetCashFlowHandler(db);
    const result = await handler({ ticker: "MBB", period: "Q2", year: 2025 });
    const envelope = JSON.parse(result.content[0].text);

    expect(envelope.found).toBe(true);
    expect(envelope.ocf_ni_ratio).toBeNull();

    // other fields unaffected
    expect(envelope.operating_cf).toBe(5000);
    expect(envelope.free_cash_flow).toBe(4200);
  });

  it("(c) null net_profit — ocf_ni_ratio is null", async () => {
    const db = makeTestDb();
    insertRow(db, {
      action_code: "CTG",
      period_year: 2025,
      period_quarter: 1,
      net_profit: null,
      operating_cf: 7000,
      investing_cf: -2000,
      financing_cf: -1000,
      capex: -1500,
      free_cash_flow: 5500,
    });

    const handler = buildGetCashFlowHandler(db);
    const result = await handler({ ticker: "CTG", period: "Q1", year: 2025 });
    const envelope = JSON.parse(result.content[0].text);

    expect(envelope.found).toBe(true);
    expect(envelope.ocf_ni_ratio).toBeNull();
    expect(envelope.operating_cf).toBe(7000);
  });
});
