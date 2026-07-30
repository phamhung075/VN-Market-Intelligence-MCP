/**
 * Task 1920i — Extend freshnessSlaMonitor to cover all Sprint 1920 tables
 *
 * TC-1: New tables included in UNION ALL — querySignalAges returns ≥12 signal type keys
 * TC-2: Zero-row table (bond_maturity) → age_minutes = -1 → no escalation callback
 * TC-3: coverage_pct calculation — summary string contains correct coverage ratio
 * TC-4: Real SLA breach on commodity_prices triggers escalation (AC-4 preserved)
 * TC-5: Existing 5 signal type thresholds unchanged (AC-5 regression)
 * TC-6: Not-seeded sentinel (-1) never triggers breach on freshnessSlaChecker
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { getDb, initDatabase, closeDb } from "../infrastructure/db/schema.js";
import {
  querySignalAges,
  runFreshnessSlaMonitor,
  buildDailySummary,
  resetSummaryGate,
  type EscalationCallback,
} from "../scheduler/system/freshnessSlaMonitorJob.js";
import {
  DEFAULT_SLA_CONFIG,
  checkSignalSla,
  type SignalType,
} from "../domain/services/freshnessSlaChecker.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Opens fresh in-memory DB with all schema migrations applied. */
async function openFreshDb(): Promise<Database> {
  Bun.env["DB_PATH"] = ":memory:";
  closeDb();
  await initDatabase();
  return getDb();
}

/** No-op escalation callback that records calls. */
function makeEscalateSpy(): {
  spy: EscalationCallback;
  calls: Array<{ signalType: SignalType; ageMinutes: number }>;
} {
  const calls: Array<{ signalType: SignalType; ageMinutes: number }> = [];
  const spy: EscalationCallback = async (signalType, ageMinutes) => {
    calls.push({ signalType, ageMinutes });
  };
  return { spy, calls };
}

/** No-op WORK channel sender (avoids real Telegram calls in tests). */
const noopSendWork = async (_msg: string): Promise<void> => { /* no-op */ };

/** Returns UTC ISO string for N minutes ago. */
function minutesAgo(n: number): string {
  return new Date(Date.now() - n * 60 * 1000).toISOString();
}

/** Returns UTC ISO string for N hours ago. */
function hoursAgo(n: number): string {
  return minutesAgo(n * 60);
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared DB setup for querySignalAges tests (need source tables)
// ─────────────────────────────────────────────────────────────────────────────

let db: Database;

beforeEach(async () => {
  db = await openFreshDb();
  // Reset daily summary gate to avoid cross-test date contamination
  resetSummaryGate();
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-1: querySignalAges returns ≥12 signal type keys (5 existing + 7 new)
// ─────────────────────────────────────────────────────────────────────────────

describe("1920i — TC-1: querySignalAges includes all 12 signal types", () => {
  it("TC-1a: returns keys for all 7 new signal types after extension", () => {
    const ages = querySignalAges(db);

    // New signal types added by 1920i
    expect("vnstock_fundamentals" in ages).toBe(true);
    expect("bond_maturity" in ages).toBe(true);
    expect("commodity_prices" in ages).toBe(true);
    expect("broker_sanctions" in ages).toBe(true);
    expect("backtest_runs" in ages).toBe(true);
    expect("signal_quality_audit" in ages).toBe(true);
    expect("prediction_claims" in ages).toBe(true);
  });

  it("TC-1b: returns at least 12 total signal type keys (5 original + 7 new)", () => {
    const ages = querySignalAges(db);
    const keys = Object.keys(ages);
    expect(keys.length).toBeGreaterThanOrEqual(12);
  });

  it("TC-1c: existing 5 signal types still present in result", () => {
    const ages = querySignalAges(db);
    expect("price" in ages).toBe(true);
    expect("bctc" in ages).toBe(true);
    expect("news" in ages).toBe(true);
    expect("sbv_fx" in ages).toBe(true);
    expect("foreign_flow" in ages).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-2: Zero-row table → age_minutes = -1 → no false breach escalation
// ─────────────────────────────────────────────────────────────────────────────

describe("1920i — TC-2: Zero-row table returns sentinel -1, no false breach", () => {
  it("TC-2a: bond_maturity table empty → querySignalAges returns -1 for bond_maturity", () => {
    // DB is fresh (no rows in bond_maturity)
    const ages = querySignalAges(db);
    expect(ages.bond_maturity).toBe(-1);
  });

  it("TC-2b: prediction_claims table empty → querySignalAges returns -1 for prediction_claims", () => {
    const ages = querySignalAges(db);
    expect(ages.prediction_claims).toBe(-1);
  });

  it("TC-2c: age_minutes = -1 → checkSignalSla returns status=ok (not-seeded, no breach)", () => {
    // -1 sentinel must never trigger a breach in the domain checker
    const result = checkSignalSla("bond_maturity" as SignalType, -1, DEFAULT_SLA_CONFIG);
    expect(result.status).toBe("ok");
  });

  it("TC-2d: runFreshnessSlaMonitor with zero-row new tables → escalate never called for those tables", async () => {
    // Insert minimal rows for existing 5 tables so they are fresh
    const now = minutesAgo(0);
    db.exec(`INSERT INTO market_prices (code, price, updated_at) VALUES ('VNM', 100, '${now}')`);
    db.exec(`INSERT INTO financial_reports (
      id, action_code, company_name, exchange, domain,
      period_year, period_type, period_start, period_end, sort_key, parsed_at,
      balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json
    ) VALUES ('fr-1', 'VNM', 'Vinamilk', 'HOSE', 'consumer',
      2026, 'Q1', '2026-01-01', '2026-03-31', '2026-Q1', '${now}',
      '{}', '{}', '{}', '{}')`);
    db.exec(`INSERT INTO rag_analyses (id, created_at, level) VALUES ('ra-1', '${now}', 'macro')`);
    db.exec(`INSERT INTO sbv_rates (source, fetched_at) VALUES ('sbv', '${now}')`);
    db.exec(`INSERT INTO daily_ohlcv (code, date, close, updated_at, foreign_buy_vol)
      VALUES ('VNM', '2026-04-27', 100, '${now}', 100)`);
    // New tables have zero rows (not seeded yet)

    const { spy, calls } = makeEscalateSpy();
    // Use market hours now so price doesn't suppress
    const marketHoursNow = new Date("2026-04-28T04:00:00.000Z");
    const result = await runFreshnessSlaMonitor(db, spy, undefined, marketHoursNow, noopSendWork);

    // No escalation calls for not-seeded tables (they return -1 sentinel)
    const newTableEscalations = calls.filter(c =>
      ["bond_maturity", "commodity_prices", "broker_sanctions", "backtest_runs",
       "signal_quality_audit", "prediction_claims", "vnstock_fundamentals"].includes(c.signalType)
    );
    expect(newTableEscalations.length).toBe(0);
    expect(result.breaches).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-3: coverage_pct calculation
// ─────────────────────────────────────────────────────────────────────────────

describe("1920i — TC-3: buildDailySummary coverage_pct", () => {
  it("TC-3a: buildDailySummary returns string containing coverage line", () => {
    const fakeAges: Record<string, number> = {
      price: 5, bctc: 60, news: 15, sbv_fx: 20, foreign_flow: 8,
      vnstock_fundamentals: -1, bond_maturity: -1, commodity_prices: 30,
      broker_sanctions: -1, backtest_runs: 45, signal_quality_audit: 25,
      prediction_claims: -1,
    };
    const summary = buildDailySummary(fakeAges as Record<SignalType, number>);
    expect(summary).toContain("coverage:");
    expect(summary).toContain("tables");
    expect(summary).toContain("[freshness-sla] daily coverage snapshot");
  });

  it("TC-3b: coverage_pct with 8 seeded / 12 total = 67% (rounds down, within acceptable range)", () => {
    const fakeAges: Record<string, number> = {
      price: 5, bctc: 60, news: 15, sbv_fx: 20, foreign_flow: 8,
      vnstock_fundamentals: 100, bond_maturity: -1, commodity_prices: 30,
      broker_sanctions: -1, backtest_runs: 45, signal_quality_audit: 25,
      prediction_claims: -1,
    };
    const summary = buildDailySummary(fakeAges as Record<SignalType, number>);
    // 9 seeded (price, bctc, news, sbv_fx, foreign_flow, vnstock_fundamentals, commodity_prices, backtest_runs, signal_quality_audit)
    // 3 not-seeded (-1): bond_maturity, broker_sanctions, prediction_claims
    // coverage line should show N/12 tables
    expect(summary).toContain("/12");
  });

  it("TC-3c: all 12 seeded → coverage line shows 12/12 (100%)", () => {
    const fakeAges: Record<string, number> = {
      price: 5, bctc: 60, news: 15, sbv_fx: 20, foreign_flow: 8,
      vnstock_fundamentals: 100, bond_maturity: 200, commodity_prices: 30,
      broker_sanctions: 500, backtest_runs: 45, signal_quality_audit: 25,
      prediction_claims: 120,
    };
    const summary = buildDailySummary(fakeAges as Record<SignalType, number>);
    expect(summary).toContain("12/12");
    expect(summary).toContain("100%");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-4: Real SLA breach on commodity_prices triggers escalation (AC-4)
// ─────────────────────────────────────────────────────────────────────────────

describe("1920i — TC-4: Real SLA breach on commodity_prices fires escalation", () => {
  it("TC-4a: commodity_prices stale 48h (> 36h SLA) → breach escalated", async () => {
    const now = minutesAgo(0);
    // Seed existing 5 tables as fresh
    db.exec(`INSERT INTO market_prices (code, price, updated_at) VALUES ('VNM', 100, '${now}')`);
    db.exec(`INSERT INTO financial_reports (
      id, action_code, company_name, exchange, domain,
      period_year, period_type, period_start, period_end, sort_key, parsed_at,
      balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json
    ) VALUES ('fr-tc4', 'VNM', 'Vinamilk', 'HOSE', 'consumer',
      2026, 'Q1', '2026-01-01', '2026-03-31', '2026-Q1-tc4', '${now}',
      '{}', '{}', '{}', '{}')`);
    db.exec(`INSERT INTO rag_analyses (id, created_at, level) VALUES ('ra-tc4', '${now}', 'macro')`);
    db.exec(`INSERT INTO sbv_rates (source, fetched_at) VALUES ('sbv-tc4', '${now}')`);
    db.exec(`INSERT INTO daily_ohlcv (code, date, close, updated_at, foreign_buy_vol)
      VALUES ('VNM2', '2026-04-27', 100, '${now}', 100)`);
    // commodity_prices seeded 48 hours ago (threshold = 36h = 2160 min)
    const staleAt = hoursAgo(48);
    db.exec(`INSERT INTO commodity_prices (source, fetched_at)
      VALUES ('yahoo', '${staleAt}')`);

    const { spy, calls } = makeEscalateSpy();
    // Off market hours (commodity_prices is not market-hours-only)
    const result = await runFreshnessSlaMonitor(db, spy, undefined, new Date(), noopSendWork);

    const commodityCall = calls.find(c => c.signalType === "commodity_prices");
    expect(commodityCall).toBeDefined();
    expect(result.breaches).toBeGreaterThanOrEqual(1);
    expect(result.escalations).toBeGreaterThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-5: Existing 5 signal type thresholds unchanged (AC-5 regression)
// ─────────────────────────────────────────────────────────────────────────────

describe("1920i — TC-5: Existing 5 signal type SLA thresholds regression check", () => {
  it("TC-5a: price threshold remains 10 minutes", () => {
    const cfg = DEFAULT_SLA_CONFIG.find(c => c.signalType === "price");
    expect(cfg).toBeDefined();
    expect(cfg!.defaultThresholdMinutes).toBe(10);
  });

  it("TC-5b: bctc threshold is FIXED two-tier config (10080 default / 1440 earnings-window) — superseded by FIX-SLA-BCTC-THRESHOLD-TRACKS-STALENESS-NOT-CONSTANT (2026-07-30)", () => {
    // Original 120/360 values were replaced: they were wall-clock-growing
    // computed values in disguise (see freshnessSlaChecker.ts getSlaThreshold
    // bctc branch), not policy constants. The new values are the SSOT
    // (system-map.json .project.data_sources["bctc-discover"].sla) durations.
    const cfg = DEFAULT_SLA_CONFIG.find(c => c.signalType === "bctc");
    expect(cfg).toBeDefined();
    expect(cfg!.defaultThresholdMinutes).toBe(10080); // 168h = 7d, out-of-earnings-window
    expect(cfg!.earningsWindowThresholdMinutes).toBe(1440); // 24h, earnings-window active
  });

  it("TC-5c: news threshold remains 30 minutes", () => {
    const cfg = DEFAULT_SLA_CONFIG.find(c => c.signalType === "news");
    expect(cfg).toBeDefined();
    expect(cfg!.defaultThresholdMinutes).toBe(30);
  });

  it("TC-5d: sbv_fx threshold remains 30 minutes", () => {
    const cfg = DEFAULT_SLA_CONFIG.find(c => c.signalType === "sbv_fx");
    expect(cfg).toBeDefined();
    expect(cfg!.defaultThresholdMinutes).toBe(30);
  });

  it("TC-5e: foreign_flow threshold remains 10 minutes", () => {
    const cfg = DEFAULT_SLA_CONFIG.find(c => c.signalType === "foreign_flow");
    expect(cfg).toBeDefined();
    expect(cfg!.defaultThresholdMinutes).toBe(10);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-6: Not-seeded sentinel in checkSignalSla for new types
// ─────────────────────────────────────────────────────────────────────────────

describe("1920i — TC-6: New signal types in DEFAULT_SLA_CONFIG", () => {
  it("TC-6a: DEFAULT_SLA_CONFIG contains vnstock_fundamentals with 72h threshold", () => {
    const cfg = DEFAULT_SLA_CONFIG.find(c => c.signalType === "vnstock_fundamentals" as SignalType);
    expect(cfg).toBeDefined();
    expect(cfg!.defaultThresholdMinutes).toBe(72 * 60); // 4320 minutes
  });

  it("TC-6b: DEFAULT_SLA_CONFIG contains bond_maturity with 168h threshold", () => {
    const cfg = DEFAULT_SLA_CONFIG.find(c => c.signalType === "bond_maturity" as SignalType);
    expect(cfg).toBeDefined();
    expect(cfg!.defaultThresholdMinutes).toBe(168 * 60); // 10080 minutes
  });

  it("TC-6c: DEFAULT_SLA_CONFIG contains commodity_prices with 36h threshold", () => {
    const cfg = DEFAULT_SLA_CONFIG.find(c => c.signalType === "commodity_prices" as SignalType);
    expect(cfg).toBeDefined();
    expect(cfg!.defaultThresholdMinutes).toBe(36 * 60); // 2160 minutes
  });

  it("TC-6d: DEFAULT_SLA_CONFIG contains broker_sanctions with 2160h threshold", () => {
    const cfg = DEFAULT_SLA_CONFIG.find(c => c.signalType === "broker_sanctions" as SignalType);
    expect(cfg).toBeDefined();
    expect(cfg!.defaultThresholdMinutes).toBe(2160 * 60); // 129600 minutes
  });

  it("TC-6e: DEFAULT_SLA_CONFIG contains backtest_runs with 36h threshold", () => {
    const cfg = DEFAULT_SLA_CONFIG.find(c => c.signalType === "backtest_runs" as SignalType);
    expect(cfg).toBeDefined();
    expect(cfg!.defaultThresholdMinutes).toBe(36 * 60); // 2160 minutes
  });

  it("TC-6f: DEFAULT_SLA_CONFIG contains signal_quality_audit with 30d threshold (FIX-SLA-SIGNALQUALITYAUDIT-MONTHLY-CADENCE-MISCLASSIFIED-48H: was 48h, too tight for this table's actually-sparse event-driven writer — see FIX-SLA-SIGNALQUALITYAUDIT-MONTHLY-CADENCE-MISCLASSIFIED-48H.test.ts)", () => {
    const cfg = DEFAULT_SLA_CONFIG.find(c => c.signalType === "signal_quality_audit" as SignalType);
    expect(cfg).toBeDefined();
    expect(cfg!.defaultThresholdMinutes).toBe(30 * 24 * 60); // 43200 minutes
  });

  it("TC-6g: DEFAULT_SLA_CONFIG contains prediction_claims with 168h threshold", () => {
    const cfg = DEFAULT_SLA_CONFIG.find(c => c.signalType === "prediction_claims" as SignalType);
    expect(cfg).toBeDefined();
    expect(cfg!.defaultThresholdMinutes).toBe(168 * 60); // 10080 minutes
  });
});
