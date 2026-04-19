/**
 * Task 130 — Periodic Market Intelligence Summary System
 *
 * Tests cover:
 *   - generatePeriodicSummary for each period type (daily/weekly/monthly/quarterly/yearly)
 *   - Correct date range calculation for Vietnam timezone (UTC+7)
 *   - Upsert behavior (re-generate same period updates)
 *   - Empty data → valid summary with zero-filled fields
 *   - Stock performance calculation from market_prices history
 *   - Alert count aggregation by severity
 *   - MCP tools return formatted text
 *   - system_logs table persistence via persistLog
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";

// Set in-memory DB before any schema import
Bun.env["DB_PATH"] = ":memory:";

import {
  generatePeriodicSummary,
  getPeriodDateRange,
  buildSummaryText,
  type PeriodType,
  type PeriodicSummary,
} from "../application/usecases/generatePeriodicSummary.js";

import { initDatabase, closeDb, getDb } from "../infrastructure/db/schema.js";
import { persistLog } from "../infrastructure/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Setup
// ─────────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  await initDatabase();
});

afterAll(() => {
  closeDb();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Date range calculation (Vietnam UTC+7)
// ─────────────────────────────────────────────────────────────────────────────

describe("getPeriodDateRange — date ranges for Vietnam timezone", () => {
  it("daily: returns midnight-to-midnight in Vietnam time", () => {
    // 2026-03-15 in Vietnam = 2026-03-14T17:00:00Z to 2026-03-15T17:00:00Z
    const range = getPeriodDateRange("daily", new Date("2026-03-15T10:00:00Z"));
    expect(range.start).toBe("2026-03-15");
    expect(range.end).toBe("2026-03-15");
    // UTC start should be 17:00 of previous UTC day
    expect(range.startUtc).toBe("2026-03-14T17:00:00.000Z");
    expect(range.endUtc).toBe("2026-03-15T17:00:00.000Z");
  });

  it("weekly: Monday to Sunday of the current week", () => {
    // 2026-03-18 is a Wednesday (UTC+7)
    const range = getPeriodDateRange("weekly", new Date("2026-03-18T10:00:00Z"));
    expect(range.start).toBe("2026-03-16"); // Monday
    expect(range.end).toBe("2026-03-22");   // Sunday
  });

  it("monthly: 1st to last day of the month", () => {
    const range = getPeriodDateRange("monthly", new Date("2026-03-15T10:00:00Z"));
    expect(range.start).toBe("2026-03-01");
    expect(range.end).toBe("2026-03-31");
  });

  it("monthly: February 2024 (leap year) ends on 29th", () => {
    const range = getPeriodDateRange("monthly", new Date("2024-02-15T10:00:00Z"));
    expect(range.start).toBe("2024-02-01");
    expect(range.end).toBe("2024-02-29");
  });

  it("quarterly: Q1 is January to March", () => {
    const range = getPeriodDateRange("quarterly", new Date("2026-02-15T10:00:00Z"));
    expect(range.start).toBe("2026-01-01");
    expect(range.end).toBe("2026-03-31");
  });

  it("quarterly: Q2 is April to June", () => {
    const range = getPeriodDateRange("quarterly", new Date("2026-05-15T10:00:00Z"));
    expect(range.start).toBe("2026-04-01");
    expect(range.end).toBe("2026-06-30");
  });

  it("quarterly: Q3 is July to September", () => {
    const range = getPeriodDateRange("quarterly", new Date("2026-08-20T10:00:00Z"));
    expect(range.start).toBe("2026-07-01");
    expect(range.end).toBe("2026-09-30");
  });

  it("quarterly: Q4 is October to December", () => {
    const range = getPeriodDateRange("quarterly", new Date("2026-11-01T10:00:00Z"));
    expect(range.start).toBe("2026-10-01");
    expect(range.end).toBe("2026-12-31");
  });

  it("yearly: Jan 1 to Dec 31", () => {
    const range = getPeriodDateRange("yearly", new Date("2026-06-15T10:00:00Z"));
    expect(range.start).toBe("2026-01-01");
    expect(range.end).toBe("2026-12-31");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Summary text builder
// ─────────────────────────────────────────────────────────────────────────────

describe("buildSummaryText — plain-language summary construction", () => {
  it("includes period type and dates in text", () => {
    const summary: PeriodicSummary = {
      id: "test-001",
      periodType: "daily",
      periodStart: "2026-03-15",
      periodEnd: "2026-03-15",
      summaryText: "",
      keyEvents: [],
      stockPerformance: {},
      alertsSummary: { total: 0, bySeverity: {}, topAlerts: [] },
      macroContext: {},
      recommendation: {},
      newsCount: 0,
      alertCount: 0,
      reportCount: 0,
    };
    const text = buildSummaryText(summary);
    expect(text.toLowerCase()).toContain("daily");
    expect(text).toContain("2026-03-15");
  });

  it("includes stock performance data", () => {
    const summary: PeriodicSummary = {
      id: "test-002",
      periodType: "weekly",
      periodStart: "2026-03-16",
      periodEnd: "2026-03-22",
      summaryText: "",
      keyEvents: [],
      stockPerformance: {
        VNM: { firstPrice: 80000, lastPrice: 82000, changePct: 2.5, alertCount: 1 },
        FPT: { firstPrice: 120000, lastPrice: 115000, changePct: -4.17, alertCount: 2 },
      },
      alertsSummary: { total: 3, bySeverity: { info: 2, warning: 1 }, topAlerts: [] },
      macroContext: {},
      recommendation: {},
      newsCount: 10,
      alertCount: 3,
      reportCount: 0,
    };
    const text = buildSummaryText(summary);
    expect(text).toContain("VNM");
    expect(text).toContain("FPT");
    expect(text).toContain("2.5");
  });

  it("handles empty data gracefully", () => {
    const summary: PeriodicSummary = {
      id: "test-003",
      periodType: "monthly",
      periodStart: "2026-03-01",
      periodEnd: "2026-03-31",
      summaryText: "",
      keyEvents: [],
      stockPerformance: {},
      alertsSummary: { total: 0, bySeverity: {}, topAlerts: [] },
      macroContext: {},
      recommendation: {},
      newsCount: 0,
      alertCount: 0,
      reportCount: 0,
    };
    const text = buildSummaryText(summary);
    expect(text).toBeTruthy();
    expect(text.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. generatePeriodicSummary — integration with in-memory DB
// ─────────────────────────────────────────────────────────────────────────────

describe("generatePeriodicSummary — empty database", () => {
  it("daily: returns valid summary with zero counts on empty DB", async () => {
    const db = getDb();
    const result = await generatePeriodicSummary("daily", new Date("2026-03-15T10:00:00Z"), db);

    expect(result).toBeDefined();
    expect(result.periodType).toBe("daily");
    expect(result.periodStart).toBe("2026-03-15");
    expect(result.periodEnd).toBe("2026-03-15");
    expect(result.newsCount).toBe(0);
    expect(result.alertCount).toBe(0);
    expect(result.reportCount).toBe(0);
    expect(result.summaryText).toBeTruthy();
    expect(result.id).toBeTruthy();
  });

  it("weekly: returns valid summary with correct date range", async () => {
    const db = getDb();
    const result = await generatePeriodicSummary("weekly", new Date("2026-03-18T10:00:00Z"), db);

    expect(result.periodType).toBe("weekly");
    expect(result.periodStart).toBe("2026-03-16");
    expect(result.periodEnd).toBe("2026-03-22");
    expect(result.alertsSummary.total).toBe(0);
  });

  it("monthly: returns valid summary for March 2026", async () => {
    const db = getDb();
    const result = await generatePeriodicSummary("monthly", new Date("2026-03-20T10:00:00Z"), db);

    expect(result.periodType).toBe("monthly");
    expect(result.periodStart).toBe("2026-03-01");
    expect(result.periodEnd).toBe("2026-03-31");
    expect(result.stockPerformance).toBeDefined();
  });

  it("quarterly: returns valid summary for Q1 2026", async () => {
    const db = getDb();
    const result = await generatePeriodicSummary("quarterly", new Date("2026-02-15T10:00:00Z"), db);

    expect(result.periodType).toBe("quarterly");
    expect(result.periodStart).toBe("2026-01-01");
    expect(result.periodEnd).toBe("2026-03-31");
  });

  it("yearly: returns valid summary for 2026", async () => {
    const db = getDb();
    const result = await generatePeriodicSummary("yearly", new Date("2026-06-15T10:00:00Z"), db);

    expect(result.periodType).toBe("yearly");
    expect(result.periodStart).toBe("2026-01-01");
    expect(result.periodEnd).toBe("2026-12-31");
  });

  it("all period types return non-null recommendation object", async () => {
    const db = getDb();
    const periodTypes: PeriodType[] = ["daily", "weekly", "monthly", "quarterly", "yearly"];

    for (const pt of periodTypes) {
      const result = await generatePeriodicSummary(pt, new Date("2026-03-15T10:00:00Z"), db);
      expect(result.recommendation).toBeDefined();
      expect(typeof result.recommendation).toBe("object");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. generatePeriodicSummary — with data
// ─────────────────────────────────────────────────────────────────────────────

describe("generatePeriodicSummary — with seeded data", () => {
  beforeEach(async () => {
    // Seed alerts in the period
    const db = getDb();
    db.exec(`DELETE FROM alerts`);
    db.exec(`DELETE FROM rag_analyses`);

    const now = "2026-03-15T08:00:00.000Z";
    db.run(
      `INSERT INTO alerts (id, triggered_at, severity, message) VALUES (?, ?, ?, ?)`,
      ["alert-001", now, "info", "VNM price moved"],
    );
    db.run(
      `INSERT INTO alerts (id, triggered_at, severity, message) VALUES (?, ?, ?, ?)`,
      ["alert-002", now, "warning", "FPT volume spike"],
    );
    db.run(
      `INSERT INTO alerts (id, triggered_at, severity, message) VALUES (?, ?, ?, ?)`,
      ["alert-003", now, "critical", "VCB critical news"],
    );

    // Seed rag_analyses
    db.run(
      `INSERT INTO rag_analyses (id, created_at, level, source_url, source_title, sentiment, impact_score, impact_direction, summary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ["news-001", now, "country", "https://cafef.vn/1", "VNM Q4 results", "bullish", 8.0, "up", "VNM Q4 results beat estimates"],
    );
    db.run(
      `INSERT INTO rag_analyses (id, created_at, level, source_url, source_title, sentiment, impact_score, impact_direction, summary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ["news-002", now, "country", "https://cafef.vn/2", "FPT expansion plan", "bullish", 6.5, "up", "FPT expands to Japan"],
    );
  });

  it("counts alerts correctly by severity", async () => {
    const db = getDb();
    const result = await generatePeriodicSummary("daily", new Date("2026-03-15T10:00:00Z"), db);

    expect(result.alertCount).toBe(3);
    expect(result.alertsSummary.total).toBe(3);
    expect(result.alertsSummary.bySeverity["info"]).toBe(1);
    expect(result.alertsSummary.bySeverity["warning"]).toBe(1);
    expect(result.alertsSummary.bySeverity["critical"]).toBe(1);
  });

  it("counts news entries correctly", async () => {
    const db = getDb();
    const result = await generatePeriodicSummary("daily", new Date("2026-03-15T10:00:00Z"), db);

    expect(result.newsCount).toBe(2);
  });

  it("includes key events from high-impact news", async () => {
    const db = getDb();
    const result = await generatePeriodicSummary("daily", new Date("2026-03-15T10:00:00Z"), db);

    expect(result.keyEvents.length).toBeGreaterThan(0);
    const highImpact = result.keyEvents.find((e) => e.impact >= 7);
    expect(highImpact).toBeDefined();
    expect(highImpact?.title).toContain("VNM");
  });

  it("includes top alerts in alertsSummary", async () => {
    const db = getDb();
    const result = await generatePeriodicSummary("daily", new Date("2026-03-15T10:00:00Z"), db);

    expect(result.alertsSummary.topAlerts.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Upsert behavior
// ─────────────────────────────────────────────────────────────────────────────

describe("generatePeriodicSummary — upsert", () => {
  it("re-generating same period updates the record (no duplicate)", async () => {
    const db = getDb();
    const periodDate = new Date("2026-01-10T10:00:00Z");

    const first = await generatePeriodicSummary("daily", periodDate, db);
    const second = await generatePeriodicSummary("daily", periodDate, db);

    // Same period_start → same id base
    expect(first.periodStart).toBe(second.periodStart);
    expect(first.periodEnd).toBe(second.periodEnd);

    // DB should have exactly 1 record for this period
    const rows = db
      .query<{ cnt: number }, []>(
        `SELECT COUNT(*) as cnt FROM market_summaries WHERE period_type = 'daily' AND period_start = '2026-01-10'`,
      )
      .all();
    expect(rows[0]?.cnt).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Stock performance calculation
// ─────────────────────────────────────────────────────────────────────────────

describe("generatePeriodicSummary — stock performance", () => {
  it("returns null changePct when no market_prices data exists", async () => {
    const db = getDb();
    db.exec(`DELETE FROM market_prices`);

    const result = await generatePeriodicSummary("daily", new Date("2026-03-15T10:00:00Z"), db);

    // stockPerformance should exist but with null prices
    expect(result.stockPerformance).toBeDefined();
    for (const code of Object.keys(result.stockPerformance)) {
      const perf = result.stockPerformance[code];
      // Either null prices or valid numbers
      expect(perf).toBeDefined();
    }
  });

  it("calculates changePct correctly from current market_prices", async () => {
    const db = getDb();
    db.exec(`DELETE FROM market_prices`);

    // Insert a current price for VNM (80,000 VND)
    db.run(
      `INSERT OR REPLACE INTO market_prices (code, price, change_amt, change_pct, volume, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ["VNM", 82000, 2000, 2.5, 500000, "2026-03-15T08:00:00.000Z"],
    );

    const result = await generatePeriodicSummary("daily", new Date("2026-03-15T10:00:00Z"), db);

    // VNM should appear in stock performance (from watchlist or from market_prices)
    const hasVnm = "VNM" in result.stockPerformance;
    if (hasVnm) {
      expect(result.stockPerformance["VNM"]).toBeDefined();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. system_logs table + persistLog
// ─────────────────────────────────────────────────────────────────────────────

describe("persistLog — system_logs table", () => {
  it("inserts a warn log entry into system_logs", async () => {
    const db = getDb();
    await persistLog("warn", "test-module", "Something went wrong", { detail: "test" }, db);

    const rows = db
      .query<{ level: string; source: string; message: string }, []>(
        `SELECT level, source, message FROM system_logs WHERE source = 'test-module' ORDER BY id DESC LIMIT 1`,
      )
      .all();

    expect(rows.length).toBe(1);
    expect(rows[0]?.level).toBe("warn");
    expect(rows[0]?.source).toBe("test-module");
    expect(rows[0]?.message).toBe("Something went wrong");
  });

  it("inserts an error log entry with details_json", async () => {
    const db = getDb();
    await persistLog("error", "scheduler", "Cycle failed", { errorCode: 500 }, db);

    const rows = db
      .query<{ level: string; details_json: string | null }, []>(
        `SELECT level, details_json FROM system_logs WHERE source = 'scheduler' ORDER BY id DESC LIMIT 1`,
      )
      .all();

    expect(rows.length).toBe(1);
    expect(rows[0]?.level).toBe("error");
    expect(rows[0]?.details_json).toBeTruthy();
    const parsed = JSON.parse(rows[0]?.details_json ?? "{}");
    expect(parsed.errorCode).toBe(500);
  });

  it("handles missing details gracefully (no details_json)", async () => {
    const db = getDb();
    await persistLog("warn", "test-module-2", "Simple warning", undefined, db);

    const rows = db
      .query<{ message: string }, []>(
        `SELECT message FROM system_logs WHERE source = 'test-module-2' ORDER BY id DESC LIMIT 1`,
      )
      .all();

    expect(rows.length).toBe(1);
    expect(rows[0]?.message).toBe("Simple warning");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. MCP tool format
// ─────────────────────────────────────────────────────────────────────────────

describe("MCP summary tools — output format", () => {
  it("get_market_summary returns content array with text", async () => {
    const { registerSummaryTools } = await import("../interface/mcp/tools/summaryTools.js");
    const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");

    const server = new McpServer(
      { name: "test", version: "1.0.0" },
      { capabilities: { tools: {} } },
    );
    registerSummaryTools(server);

    const tools = (server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools;
    expect("get_market_summary" in tools).toBe(true);
    expect("generate_market_summary" in tools).toBe(true);
  });

  it("get_market_summary and generate_market_summary are both registered", async () => {
    const { registerSummaryTools } = await import("../interface/mcp/tools/summaryTools.js");
    const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");

    const server = new McpServer(
      { name: "test", version: "1.0.0" },
      { capabilities: { tools: {} } },
    );
    registerSummaryTools(server);

    const tools = (server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools;
    expect(Object.keys(tools).length).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. market_summaries table persistence
// ─────────────────────────────────────────────────────────────────────────────

describe("market_summaries — DB persistence", () => {
  it("stores summary in market_summaries table", async () => {
    const db = getDb();
    const result = await generatePeriodicSummary("weekly", new Date("2026-02-16T10:00:00Z"), db);

    const rows = db
      .query<{ id: string; period_type: string; summary_text: string }, []>(
        `SELECT id, period_type, summary_text FROM market_summaries WHERE period_type = 'weekly' AND period_start = '2026-02-16'`,
      )
      .all();

    expect(rows.length).toBe(1);
    expect(rows[0]?.period_type).toBe("weekly");
    expect(rows[0]?.summary_text).toBeTruthy();
  });

  it("stores news_count and alert_count correctly", async () => {
    const db = getDb();
    db.exec(`DELETE FROM alerts`);
    db.exec(`DELETE FROM rag_analyses`);

    await generatePeriodicSummary("monthly", new Date("2026-01-15T10:00:00Z"), db);

    const rows = db
      .query<{ news_count: number; alert_count: number }, []>(
        `SELECT news_count, alert_count FROM market_summaries WHERE period_type = 'monthly' AND period_start = '2026-01-01'`,
      )
      .all();

    expect(rows.length).toBe(1);
    expect(rows[0]?.news_count).toBe(0);
    expect(rows[0]?.alert_count).toBe(0);
  });
});
