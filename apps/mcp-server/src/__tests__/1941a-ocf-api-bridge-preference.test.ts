/**
 * Task 1941a — cashFlow tool uses operating_cash_flow (API bridge) over operating_cf (OCR)
 *
 * Root cause (2026-05-17 FA cycle): cashFlowTool.ts reads `operating_cf` (OCR/PDF column)
 * which is corrupted for VCB (1.23e15) and FPT (10M vs 4k). The API-bridge column
 * `operating_cash_flow` (written by bridgeOCFToFinancialReports) contains correct
 * vnstock-sourced values. The tool must prefer the API bridge when available.
 *
 * Tests:
 *   T1 — API bridge present + OCR corrupted → tool returns API value, ocf_source=api_bridge
 *   T2 — API bridge NULL, OCR present → tool falls back to OCR, ocf_source=ocr
 *   T3 — VCB-realistic: OCR=1.23e15, API=9947260, NI=8633783 → ratio ≈ 1.15 (passes guard)
 *   T4 — FPT-realistic: OCR=10189002, API=4108450, NI=20225 → ratio=203 suppressed (NI itself corrupted, but OCF is now correct)
 *   T5 — Both NULL → operating_cf=null returned, ratio=null
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
  operating_cash_flow: number | null; // API-bridge column (Task 1878a)
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
       net_profit, operating_cf, investing_cf, financing_cf, capex, free_cash_flow,
       operating_cash_flow)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    row.operating_cash_flow,
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("1941a — cashFlow tool prefers operating_cash_flow (API bridge) over operating_cf (OCR)", () => {
  // T1 — API bridge present, OCR corrupted → must use API value
  it("T1: API bridge (10000) preferred over corrupted OCR (999999999)", async () => {
    const db = makeTestDb();
    insertRow(db, {
      action_code: "TST",
      period_year: 2025,
      period_quarter: 1,
      net_profit: 8000,
      operating_cf: 999999999, // corrupted OCR value
      investing_cf: -1000,
      financing_cf: -500,
      capex: -200,
      free_cash_flow: 999999799,
      operating_cash_flow: 10000, // correct API bridge value
    });

    const handler = buildGetCashFlowHandler(db);
    const result = await handler({ ticker: "TST", period: "Q1", year: 2025 });
    const envelope = JSON.parse(result.content[0].text);

    expect(envelope.found).toBe(true);
    // Must use API bridge value, not OCR
    expect(envelope.operating_cf).toBeCloseTo(10000, 1);
    // OCF/NI = 10000/8000 = 1.25 — passes guard
    expect(envelope.ocf_ni_ratio).toBeCloseTo(1.25, 5);
    expect(envelope.ocf_ni_ratio_raw).toBeCloseTo(1.25, 5);
    expect(envelope.ocf_ni_suppressed).toBe(false);
    // Source field indicates API bridge was used
    expect(envelope.ocf_source).toBe("api_bridge");
  });

  // T2 — API bridge NULL, OCR present → fallback to OCR
  it("T2: NULL API bridge falls back to OCR value", async () => {
    const db = makeTestDb();
    insertRow(db, {
      action_code: "OCR",
      period_year: 2025,
      period_quarter: 2,
      net_profit: 5000,
      operating_cf: 6000, // plausible OCR value
      investing_cf: -1000,
      financing_cf: -500,
      capex: -200,
      free_cash_flow: 5800,
      operating_cash_flow: null, // no API bridge
    });

    const handler = buildGetCashFlowHandler(db);
    const result = await handler({ ticker: "OCR", period: "Q2", year: 2025 });
    const envelope = JSON.parse(result.content[0].text);

    expect(envelope.found).toBe(true);
    expect(envelope.operating_cf).toBeCloseTo(6000, 1);
    expect(envelope.ocf_ni_ratio).toBeCloseTo(1.2, 5);
    expect(envelope.ocf_ni_suppressed).toBe(false);
    expect(envelope.ocf_source).toBe("ocr");
  });

  // T3 — VCB realistic: OCR=1.23e15 (corrupted), API=9947260, NI=8633783 → ratio ≈ 1.15
  it("T3: VCB-realistic — API bridge rescues OCF, ratio ≈ 1.15 passes guard", async () => {
    const db = makeTestDb();
    insertRow(db, {
      action_code: "VCB",
      period_year: 2025,
      period_quarter: 4,
      net_profit: 8633783,
      operating_cf: 1227360422140131, // real corrupted value from DB
      investing_cf: 0,
      financing_cf: 0,
      capex: 544489,
      free_cash_flow: 1227360422684620,
      operating_cash_flow: 9947260, // real API bridge value
    });

    const handler = buildGetCashFlowHandler(db);
    const result = await handler({ ticker: "VCB", period: "Q4", year: 2025 });
    const envelope = JSON.parse(result.content[0].text);

    expect(envelope.found).toBe(true);
    // API bridge value returned
    expect(envelope.operating_cf).toBeCloseTo(9947260, -1);
    // Ratio = 9947260 / 8633783 ≈ 1.152
    expect(envelope.ocf_ni_ratio).toBeCloseTo(9947260 / 8633783, 4);
    expect(envelope.ocf_ni_ratio_raw).toBeCloseTo(9947260 / 8633783, 4);
    expect(envelope.ocf_ni_suppressed).toBe(false);
    expect(envelope.ocf_source).toBe("api_bridge");
  });

  // T4 — FPT realistic: OCR=10189002 (unit-mismatch), API=4108450, NI=20225 (NI itself corrupted separately)
  //      ratio = 4108450/20225 ≈ 203 — still suppressed (NI is wrong, not OCF's fault)
  //      but NOT because OCF is corrupted — OCF is now correct from API bridge
  it("T4: FPT-realistic — API bridge used; ratio still suppressed (NI extraction bug separate)", async () => {
    const db = makeTestDb();
    insertRow(db, {
      action_code: "FPT",
      period_year: 2025,
      period_quarter: 4,
      net_profit: 20225, // wrong: OCR extracted revenue as NI
      operating_cf: 10189002.966546, // real corrupted OCR value
      investing_cf: -11659617.669215,
      financing_cf: -36890984.8276,
      capex: 0,
      free_cash_flow: 10189002.966546,
      operating_cash_flow: 4108450, // correct API bridge value
    });

    const handler = buildGetCashFlowHandler(db);
    const result = await handler({ ticker: "FPT", period: "Q4", year: 2025 });
    const envelope = JSON.parse(result.content[0].text);

    expect(envelope.found).toBe(true);
    // API bridge used for OCF
    expect(envelope.operating_cf).toBeCloseTo(4108450, -1);
    expect(envelope.ocf_source).toBe("api_bridge");
    // NI=20225 is still corrupted — ratio = 4108450/20225 ≈ 203 — suppressed
    expect(envelope.ocf_ni_ratio).toBeNull();
    expect(envelope.ocf_ni_ratio_raw).toBeCloseTo(4108450 / 20225, 0);
    expect(envelope.ocf_ni_suppressed).toBe(true);
  });

  // T5 — Both columns NULL → operating_cf=null, ratio=null
  it("T5: both operating_cf and operating_cash_flow NULL → operating_cf=null, ratio=null", async () => {
    const db = makeTestDb();
    insertRow(db, {
      action_code: "NUL",
      period_year: 2025,
      period_quarter: 1,
      net_profit: 5000,
      operating_cf: null,
      investing_cf: null,
      financing_cf: null,
      capex: null,
      free_cash_flow: null,
      operating_cash_flow: null,
    });

    const handler = buildGetCashFlowHandler(db);
    const result = await handler({ ticker: "NUL", period: "Q1", year: 2025 });
    const envelope = JSON.parse(result.content[0].text);

    expect(envelope.found).toBe(true);
    expect(envelope.operating_cf).toBeNull();
    expect(envelope.ocf_ni_ratio).toBeNull();
    expect(envelope.ocf_ni_ratio_raw).toBeNull();
    expect(envelope.ocf_ni_suppressed).toBe(false);
  });
});
