/**
 * FU-BCTC-TOOL-PARAMS — get_cash_flow quarters param series
 *
 * Tests:
 *   T1  quarters=1 (explicit) → same single-period shape as before (backward compat)
 *   T2  quarters omitted → same single-period shape (backward compat)
 *   T3  quarters=N returns ≤N periods as `periods[]` array, newest-first ordering
 *   T4  quarters=N when DB has fewer than N rows → returns all available (quarters_returned < N)
 *   T5  quarters=1 via period/year pin + quarters=4 → quarters ignored, single period (period pin precedence)
 *   T6  series top-level fields = latest period data (backward compat when quarters ≥ 2)
 *   T7  WC scalar fields (wc_inventory, wc_current_assets, wc_cash) present per period
 *   T8  vnstock fallback path: quarters=N returns series from vnstock_cash_flow
 *   T9  quarters=N, found=false when no data at all (cold DB)
 *   T10 single-period (quarters=1): no `periods` key, no `quarters_requested` key
 */

import { describe, it, expect } from "bun:test";
import Database from "bun:sqlite";

import { buildGetCashFlowHandler } from "../interface/mcp/tools/financial-reports/cashFlowTool.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

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
      net_profit_api_bridge REAL,
      inventory             REAL,
      current_assets        REAL,
      cash                  REAL
    );
    CREATE TABLE vnstock_cash_flow (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      code             TEXT    NOT NULL,
      year_report      INTEGER NOT NULL,
      quarter          INTEGER NOT NULL,
      operating_cf_bn  REAL,
      investing_cf_bn  REAL,
      financing_cf_bn  REAL,
      net_cf_bn        REAL,
      source           TEXT    NOT NULL DEFAULT 'vnstock',
      fetched_at       TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(code, year_report, quarter, source)
    );
    CREATE TABLE vnstock_financials (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      code             TEXT    NOT NULL,
      year_report      INTEGER NOT NULL,
      quarter          INTEGER NOT NULL,
      net_profit_bn    REAL,
      source           TEXT    NOT NULL DEFAULT 'vnstock',
      fetched_at       TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(code, year_report, quarter, source)
    );
  `);
  return db;
}

interface FrSeedRow {
  action_code: string;
  period_year: number;
  period_quarter: number;
  net_profit?: number | null;
  operating_cf?: number | null;
  investing_cf?: number | null;
  financing_cf?: number | null;
  capex?: number | null;
  free_cash_flow?: number | null;
  operating_cash_flow?: number | null;
  net_profit_api_bridge?: number | null;
  inventory?: number | null;
  current_assets?: number | null;
  cash?: number | null;
}

function insertFrRow(db: InstanceType<typeof Database>, row: FrSeedRow): void {
  db.prepare(`
    INSERT INTO financial_reports
      (action_code, period_year, period_quarter,
       net_profit, operating_cf, investing_cf, financing_cf, capex, free_cash_flow,
       operating_cash_flow, net_profit_api_bridge, inventory, current_assets, cash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.action_code,
    row.period_year,
    row.period_quarter,
    row.net_profit ?? null,
    row.operating_cf ?? null,
    row.investing_cf ?? null,
    row.financing_cf ?? null,
    row.capex ?? null,
    row.free_cash_flow ?? null,
    row.operating_cash_flow ?? null,
    row.net_profit_api_bridge ?? null,
    row.inventory ?? null,
    row.current_assets ?? null,
    row.cash ?? null,
  );
}

function insertVcfRow(
  db: InstanceType<typeof Database>,
  row: { code: string; year_report: number; quarter: number; operating_cf_bn: number | null },
): void {
  db.prepare(`
    INSERT INTO vnstock_cash_flow
      (code, year_report, quarter, operating_cf_bn, fetched_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).run(row.code, row.year_report, row.quarter, row.operating_cf_bn);
}

// Seed 4 quarters of FPT data (Q2/2025 through Q1/2026), newest first.
function seedFourFPTQuarters(db: InstanceType<typeof Database>): void {
  insertFrRow(db, {
    action_code: "FPT", period_year: 2026, period_quarter: 1,
    operating_cash_flow: 4000, net_profit_api_bridge: 2800,
    investing_cf: -500, financing_cf: -200, capex: -300, free_cash_flow: 3700,
    inventory: 500, current_assets: 8000, cash: 3000,
  });
  insertFrRow(db, {
    action_code: "FPT", period_year: 2025, period_quarter: 4,
    operating_cash_flow: 3800, net_profit_api_bridge: 2600,
    investing_cf: -600, financing_cf: -250, capex: -350, free_cash_flow: 3450,
    inventory: 480, current_assets: 7800, cash: 2900,
  });
  insertFrRow(db, {
    action_code: "FPT", period_year: 2025, period_quarter: 3,
    operating_cash_flow: 3500, net_profit_api_bridge: 2400,
    investing_cf: -400, financing_cf: -180, capex: -280, free_cash_flow: 3220,
    inventory: 460, current_assets: 7500, cash: 2700,
  });
  insertFrRow(db, {
    action_code: "FPT", period_year: 2025, period_quarter: 2,
    operating_cash_flow: 3200, net_profit_api_bridge: 2200,
    investing_cf: -350, financing_cf: -150, capex: -250, free_cash_flow: 2950,
    inventory: 440, current_assets: 7200, cash: 2500,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("FU-BCTC-TOOL-PARAMS — get_cash_flow quarters series", () => {

  // T1: quarters=1 (explicit) → single-period shape, backward compat
  it("T1: quarters=1 explicit → single-period shape (found, no periods[])", async () => {
    const db = makeTestDb();
    seedFourFPTQuarters(db);

    const handler = buildGetCashFlowHandler(db);
    const result = await handler({ ticker: "FPT", quarters: 1 });
    const envelope = JSON.parse(result.content[0].text);

    expect(envelope.found).toBe(true);
    expect(envelope.source_tier).toBe(1);
    // backward compat: no periods array when quarters=1
    expect(envelope.periods).toBeUndefined();
    expect(envelope.quarters_requested).toBeUndefined();
    expect(envelope.quarters_returned).toBeUndefined();
    // latest period = Q1/2026
    expect(envelope.period).toBe("Q1/2026");
    expect(envelope.operating_cf).toBe(4000);
  });

  // T2: quarters omitted → same single-period shape
  it("T2: quarters omitted → same single-period shape (backward compat)", async () => {
    const db = makeTestDb();
    seedFourFPTQuarters(db);

    const handler = buildGetCashFlowHandler(db);
    const result = await handler({ ticker: "FPT" });
    const envelope = JSON.parse(result.content[0].text);

    expect(envelope.found).toBe(true);
    expect(envelope.periods).toBeUndefined();
    expect(envelope.period).toBe("Q1/2026");
    expect(envelope.operating_cf).toBe(4000);
  });

  // T3: quarters=4 → returns 4 periods, newest-first ordering
  it("T3: quarters=4 → periods[] of length 4, ordered newest-first", async () => {
    const db = makeTestDb();
    seedFourFPTQuarters(db);

    const handler = buildGetCashFlowHandler(db);
    const result = await handler({ ticker: "FPT", quarters: 4 });
    const envelope = JSON.parse(result.content[0].text);

    expect(envelope.found).toBe(true);
    expect(envelope.quarters_requested).toBe(4);
    expect(envelope.quarters_returned).toBe(4);
    expect(Array.isArray(envelope.periods)).toBe(true);
    expect(envelope.periods).toHaveLength(4);

    // newest-first: Q1/2026 → Q4/2025 → Q3/2025 → Q2/2025
    expect(envelope.periods[0].period).toBe("Q1/2026");
    expect(envelope.periods[1].period).toBe("Q4/2025");
    expect(envelope.periods[2].period).toBe("Q3/2025");
    expect(envelope.periods[3].period).toBe("Q2/2025");
  });

  // T4: quarters=8 but only 4 rows → quarters_returned=4 (≤ N)
  it("T4: quarters=8 but only 4 rows → quarters_returned=4", async () => {
    const db = makeTestDb();
    seedFourFPTQuarters(db);

    const handler = buildGetCashFlowHandler(db);
    const result = await handler({ ticker: "FPT", quarters: 8 });
    const envelope = JSON.parse(result.content[0].text);

    expect(envelope.found).toBe(true);
    expect(envelope.quarters_requested).toBe(8);
    expect(envelope.quarters_returned).toBe(4);
    expect(envelope.periods).toHaveLength(4);
  });

  // T5: period/year pin → quarters ignored, returns single-period
  it("T5: period+year pin supplied → quarters=4 ignored, single period returned", async () => {
    const db = makeTestDb();
    seedFourFPTQuarters(db);

    const handler = buildGetCashFlowHandler(db);
    const result = await handler({ ticker: "FPT", period: "Q4", year: 2025, quarters: 4 });
    const envelope = JSON.parse(result.content[0].text);

    expect(envelope.found).toBe(true);
    // pinned to Q4/2025
    expect(envelope.period).toBe("Q4/2025");
    // no series (quarters was ignored)
    expect(envelope.periods).toBeUndefined();
    expect(envelope.quarters_requested).toBeUndefined();
  });

  // T6: series top-level fields = latest period data
  it("T6: top-level fields = latest period (quarters=3 series)", async () => {
    const db = makeTestDb();
    seedFourFPTQuarters(db);

    const handler = buildGetCashFlowHandler(db);
    const result = await handler({ ticker: "FPT", quarters: 3 });
    const envelope = JSON.parse(result.content[0].text);

    expect(envelope.found).toBe(true);
    expect(envelope.periods).toHaveLength(3);

    // top-level = latest (Q1/2026, operating_cash_flow=4000)
    expect(envelope.period).toBe("Q1/2026");
    expect(envelope.operating_cf).toBe(4000);

    // periods[0] = same as top-level
    expect(envelope.periods[0].period).toBe("Q1/2026");
    expect(envelope.periods[0].operating_cf).toBe(4000);
  });

  // T7: WC scalar fields present per period (wc_inventory, wc_current_assets, wc_cash)
  it("T7: wc_inventory / wc_current_assets / wc_cash present and correct per period", async () => {
    const db = makeTestDb();
    seedFourFPTQuarters(db);

    const handler = buildGetCashFlowHandler(db);
    const result = await handler({ ticker: "FPT", quarters: 2 });
    const envelope = JSON.parse(result.content[0].text);

    // top-level WC = latest (Q1/2026)
    expect(envelope.wc_inventory).toBe(500);
    expect(envelope.wc_current_assets).toBe(8000);
    expect(envelope.wc_cash).toBe(3000);

    // periods[0] = Q1/2026
    expect(envelope.periods[0].wc_inventory).toBe(500);
    expect(envelope.periods[0].wc_current_assets).toBe(8000);
    expect(envelope.periods[0].wc_cash).toBe(3000);

    // periods[1] = Q4/2025
    expect(envelope.periods[1].wc_inventory).toBe(480);
    expect(envelope.periods[1].wc_current_assets).toBe(7800);
    expect(envelope.periods[1].wc_cash).toBe(2900);
  });

  // T8: vnstock fallback path with quarters=3
  it("T8: vnstock fallback path: quarters=3 returns series from vnstock_cash_flow", async () => {
    const db = makeTestDb();
    // No financial_reports rows → triggers fallback path
    insertVcfRow(db, { code: "HPG", year_report: 2026, quarter: 1, operating_cf_bn: 4000 });
    insertVcfRow(db, { code: "HPG", year_report: 2025, quarter: 4, operating_cf_bn: 3500 });
    insertVcfRow(db, { code: "HPG", year_report: 2025, quarter: 3, operating_cf_bn: 3000 });

    const handler = buildGetCashFlowHandler(db);
    const result = await handler({ ticker: "HPG", quarters: 3 });
    const envelope = JSON.parse(result.content[0].text);

    expect(envelope.found).toBe(true);
    expect(envelope.data_source).toBe("vnstock_direct");
    expect(envelope.quarters_requested).toBe(3);
    expect(envelope.quarters_returned).toBe(3);
    expect(envelope.periods).toHaveLength(3);

    // newest-first: Q1/2026 → Q4/2025 → Q3/2025
    expect(envelope.periods[0].period).toBe("Q1/2026");
    expect(envelope.periods[0].operating_cf).toBe(4_000_000); // × 1000
    expect(envelope.periods[1].period).toBe("Q4/2025");
    expect(envelope.periods[2].period).toBe("Q3/2025");
  });

  // T9: cold DB (no rows at all) with quarters=4 → found=false, loading=true
  it("T9: cold DB with quarters=4 → found=false, loading=true", async () => {
    const db = makeTestDb();
    // completely empty DB

    const handler = buildGetCashFlowHandler(db);
    const result = await handler({ ticker: "NONE", quarters: 4 });
    const envelope = JSON.parse(result.content[0].text);

    expect(envelope.found).toBe(false);
    expect(envelope.loading).toBe(true);
    expect(envelope.periods).toBeUndefined();
  });

  // T10: single-period (quarters=1): no `periods`, no `quarters_requested` keys in JSON
  it("T10: quarters=1 → no periods/quarters_requested/quarters_returned keys in JSON", async () => {
    const db = makeTestDb();
    insertFrRow(db, {
      action_code: "VCB", period_year: 2025, period_quarter: 3,
      operating_cash_flow: 9000, net_profit_api_bridge: 7000,
    });

    const handler = buildGetCashFlowHandler(db);
    const result = await handler({ ticker: "VCB", quarters: 1 });
    const json = result.content[0].text;
    const envelope = JSON.parse(json);

    expect(envelope.found).toBe(true);
    // these keys MUST NOT appear in single-period response
    expect("periods" in envelope).toBe(false);
    expect("quarters_requested" in envelope).toBe(false);
    expect("quarters_returned" in envelope).toBe(false);
  });
});
