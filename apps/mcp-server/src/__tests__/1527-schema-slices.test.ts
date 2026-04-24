/**
 * Task 1527 — Schema decomposition: slice files existence + daily_ohlcv merge
 *
 * TDD RED phase: these tests define the contract for Sprint 209.
 *
 * Verifies:
 *  1. Each schema slice file exists and exports an `init*Tables` function
 *  2. daily_ohlcv has the FULL merged column set (base + foreign flow) — no duplicate DDL
 *  3. initDatabase() still works after refactor (backward compat)
 *  4. getDb/initDatabase/closeDb remain importable from schema.js (38+ callers)
 *  5. All existing tables still created after decomposition
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";

Bun.env["DB_PATH"] = ":memory:";

import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function tableExists(name: string): boolean {
  const db = getDb();
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
    .get(name) as { name: string } | undefined;
  return row?.name === name;
}

function getColumns(table: string): string[] {
  const db = getDb();
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return cols.map(c => c.name);
}

// ── Setup ─────────────────────────────────────────────────────────────────────

describe("Task 1527 — Schema slice decomposition", () => {
  beforeAll(async () => {
    closeDb();
    await initDatabase();
  });

  afterAll(() => {
    closeDb();
  });

  // ── 1. Slice files: import check ──────────────────────────────────────────

  it("schema-market-data slice exports initMarketDataTables", async () => {
    const mod = await import("../infrastructure/db/schema-market-data.js");
    expect(typeof mod.initMarketDataTables).toBe("function");
  });

  it("schema-financial-reports slice exports initFinancialReportsTables", async () => {
    const mod = await import("../infrastructure/db/schema-financial-reports.js");
    expect(typeof mod.initFinancialReportsTables).toBe("function");
  });

  it("schema-news slice exports initNewsTables", async () => {
    const mod = await import("../infrastructure/db/schema-news.js");
    expect(typeof mod.initNewsTables).toBe("function");
  });

  it("schema-alerts slice exports initAlertsTables", async () => {
    const mod = await import("../infrastructure/db/schema-alerts.js");
    expect(typeof mod.initAlertsTables).toBe("function");
  });

  it("schema-portfolio slice exports initPortfolioTables", async () => {
    const mod = await import("../infrastructure/db/schema-portfolio.js");
    expect(typeof mod.initPortfolioTables).toBe("function");
  });

  it("schema-briefings slice exports initBriefingsTables", async () => {
    const mod = await import("../infrastructure/db/schema-briefings.js");
    expect(typeof mod.initBriefingsTables).toBe("function");
  });

  it("schema-macro slice exports initMacroTables", async () => {
    const mod = await import("../infrastructure/db/schema-macro.js");
    expect(typeof mod.initMacroTables).toBe("function");
  });

  it("schema-system slice exports initSystemTables", async () => {
    const mod = await import("../infrastructure/db/schema-system.js");
    expect(typeof mod.initSystemTables).toBe("function");
  });

  // ── 2. daily_ohlcv merged column set ─────────────────────────────────────
  // CRITICAL: must have ALL columns from both DDL definitions in original schema.ts

  it("daily_ohlcv has base columns (code, date, open, high, low, close, volume, updated_at)", () => {
    const cols = getColumns("daily_ohlcv");
    expect(cols).toContain("code");
    expect(cols).toContain("date");
    expect(cols).toContain("open");
    expect(cols).toContain("high");
    expect(cols).toContain("low");
    expect(cols).toContain("close");
    expect(cols).toContain("volume");
    expect(cols).toContain("updated_at");
  });

  it("daily_ohlcv has foreign flow columns (foreign_buy_vol, foreign_sell_vol, foreign_net_vol, put_through_vol)", () => {
    const cols = getColumns("daily_ohlcv");
    expect(cols).toContain("foreign_buy_vol");
    expect(cols).toContain("foreign_sell_vol");
    expect(cols).toContain("foreign_net_vol");
    expect(cols).toContain("put_through_vol");
  });

  it("daily_ohlcv has exactly one definition (no duplicate table error)", () => {
    // If daily_ohlcv had duplicate CREATE TABLE (not IF NOT EXISTS), it would error
    // The fact that initDatabase() completed in beforeAll() without throwing proves this
    expect(tableExists("daily_ohlcv")).toBe(true);
  });

  // ── 3. Backward compat: schema.js still exports the three functions ───────

  it("schema.js still exports getDb", async () => {
    const mod = await import("../infrastructure/db/schema.js");
    expect(typeof mod.getDb).toBe("function");
  });

  it("schema.js still exports initDatabase", async () => {
    const mod = await import("../infrastructure/db/schema.js");
    expect(typeof mod.initDatabase).toBe("function");
  });

  it("schema.js still exports closeDb", async () => {
    const mod = await import("../infrastructure/db/schema.js");
    expect(typeof mod.closeDb).toBe("function");
  });

  it("schema.js still exports ensureCustomAlertRulesTable", async () => {
    const mod = await import("../infrastructure/db/schema.js");
    expect(typeof mod.ensureCustomAlertRulesTable).toBe("function");
  });

  it("schema.js still exports migrateForeignFlowColumns", async () => {
    const mod = await import("../infrastructure/db/schema.js");
    expect(typeof mod.migrateForeignFlowColumns).toBe("function");
  });

  // ── 4. All tables still exist after decomposition ─────────────────────────

  // Market data
  it("market_prices table exists", () => expect(tableExists("market_prices")).toBe(true));
  it("market_prices_history table exists", () => expect(tableExists("market_prices_history")).toBe(true));
  it("daily_ohlcv table exists", () => expect(tableExists("daily_ohlcv")).toBe(true));
  it("ohlcv_backfill_queue table exists", () => expect(tableExists("ohlcv_backfill_queue")).toBe(true));

  // Financial reports
  it("financial_reports table exists", () => expect(tableExists("financial_reports")).toBe(true));
  it("pdf_extracted_text table exists", () => expect(tableExists("pdf_extracted_text")).toBe(true));
  it("bctc_vps_queue table exists", () => expect(tableExists("bctc_vps_queue")).toBe(true));

  // News / cascade
  it("rag_analyses table exists", () => expect(tableExists("rag_analyses")).toBe(true));
  it("market_messages table exists", () => expect(tableExists("market_messages")).toBe(true));
  it("cascade_rule_hits table exists", () => expect(tableExists("cascade_rule_hits")).toBe(true));
  it("mention_velocity table exists", () => expect(tableExists("mention_velocity")).toBe(true));
  it("reputation_scores table exists", () => expect(tableExists("reputation_scores")).toBe(true));

  // Alerts
  it("alerts table exists", () => expect(tableExists("alerts")).toBe(true));
  it("alert_mutes table exists", () => expect(tableExists("alert_mutes")).toBe(true));
  it("custom_alert_rules table exists", () => expect(tableExists("custom_alert_rules")).toBe(true));
  it("price_alerts table exists", () => expect(tableExists("price_alerts")).toBe(true));
  it("watchlist table exists", () => expect(tableExists("watchlist")).toBe(true));

  // Portfolio
  it("positions table exists", () => expect(tableExists("positions")).toBe(true));
  it("portfolio_pnl_snapshots table exists", () => expect(tableExists("portfolio_pnl_snapshots")).toBe(true));
  it("portfolio_targets table exists", () => expect(tableExists("portfolio_targets")).toBe(true));

  // Briefings
  it("briefing_log table exists", () => expect(tableExists("briefing_log")).toBe(true));
  it("market_summaries table exists", () => expect(tableExists("market_summaries")).toBe(true));

  // Macro
  it("macro_indicators table exists", () => expect(tableExists("macro_indicators")).toBe(true));
  it("commodity_prices table exists", () => expect(tableExists("commodity_prices")).toBe(true));
  it("commodity_prices_history table exists", () => expect(tableExists("commodity_prices_history")).toBe(true));
  it("sbv_rates table exists", () => expect(tableExists("sbv_rates")).toBe(true));
  it("sbv_rates_history table exists", () => expect(tableExists("sbv_rates_history")).toBe(true));
  it("prediction_markets table exists", () => expect(tableExists("prediction_markets")).toBe(true));
  it("prediction_signals table exists", () => expect(tableExists("prediction_signals")).toBe(true));
  it("tracked_indicators table exists", () => expect(tableExists("tracked_indicators")).toBe(true));
  it("trade_exposures table exists", () => expect(tableExists("trade_exposures")).toBe(true));

  // System
  it("cron_job_runs table exists", () => expect(tableExists("cron_job_runs")).toBe(true));
  it("agent_signals table exists", () => expect(tableExists("agent_signals")).toBe(true));
  it("agent_feedback table exists", () => expect(tableExists("agent_feedback")).toBe(true));
  it("agent_work_log table exists", () => expect(tableExists("agent_work_log")).toBe(true));
  it("evidence_fragments table exists", () => expect(tableExists("evidence_fragments")).toBe(true));
  it("evidence_scores table exists", () => expect(tableExists("evidence_scores")).toBe(true));
  it("evidence_likelihood_ratios table exists", () => expect(tableExists("evidence_likelihood_ratios")).toBe(true));
  it("prediction_claims table exists", () => expect(tableExists("prediction_claims")).toBe(true));
  it("calibration_snapshots table exists", () => expect(tableExists("calibration_snapshots")).toBe(true));
  it("system_logs table exists", () => expect(tableExists("system_logs")).toBe(true));
  it("system_changelog table exists", () => expect(tableExists("system_changelog")).toBe(true));
  it("audit_state table exists", () => expect(tableExists("audit_state")).toBe(true));
  it("ask_queue table exists", () => expect(tableExists("ask_queue")).toBe(true));
  it("user_requests table exists", () => expect(tableExists("user_requests")).toBe(true));
  it("telegram_reports table exists", () => expect(tableExists("telegram_reports")).toBe(true));
  it("vps_push_log table exists", () => expect(tableExists("vps_push_log")).toBe(true));
  it("scheduler_locks table exists", () => expect(tableExists("scheduler_locks")).toBe(true));
  it("kinhdich_readings table exists", () => expect(tableExists("kinhdich_readings")).toBe(true));
  it("hexagram_transitions table exists", () => expect(tableExists("hexagram_transitions")).toBe(true));
  it("insider_transactions table exists", () => expect(tableExists("insider_transactions")).toBe(true));
  it("broker_sanctions table exists", () => expect(tableExists("broker_sanctions")).toBe(true));
  it("bond_maturity table exists", () => expect(tableExists("bond_maturity")).toBe(true));
  it("pharma_events table exists", () => expect(tableExists("pharma_events")).toBe(true));
  it("vnstock_financials table exists", () => expect(tableExists("vnstock_financials")).toBe(true));
  it("vnstock_trading_stats table exists", () => expect(tableExists("vnstock_trading_stats")).toBe(true));
  it("vnstock_events table exists", () => expect(tableExists("vnstock_events")).toBe(true));
  it("vnstock_officers table exists", () => expect(tableExists("vnstock_officers")).toBe(true));
  it("vnstock_shareholders table exists", () => expect(tableExists("vnstock_shareholders")).toBe(true));
  it("vnstock_fetch_log table exists", () => expect(tableExists("vnstock_fetch_log")).toBe(true));
  it("vnstock_balance_sheet table exists", () => expect(tableExists("vnstock_balance_sheet")).toBe(true));
  it("vnstock_cash_flow table exists", () => expect(tableExists("vnstock_cash_flow")).toBe(true));
});
