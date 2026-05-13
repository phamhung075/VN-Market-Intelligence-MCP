/**
 * Task 183 — get_alert_accuracy MCP Tool
 *
 * Tests the retrospective alert accuracy scorer:
 *   - Queries alerts in the lookback period
 *   - Extracts predicted direction from signals_json
 *   - Looks up actual price change from market_prices_history
 *   - Scores: HIT (correct direction), MISS (wrong direction), UNKNOWN (no data)
 *
 * All tests use an in-memory SQLite database via DB_PATH=:memory:.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import {
  registerAlertAccuracyTool,
  formatAccuracyReport,
} from "../interface/mcp/tools/alerts/alertAccuracy.js";
import {
  classifyAlertType,
  scoreAlertOutcome,
} from "../domain/services/alertOutcomeScorer.js";
import type { PricePoint } from "../domain/services/alertOutcomeScorer.js";
import * as alertAccuracyModule from "../interface/mcp/tools/alerts/alertAccuracy.js";

// Type alias to keep AC-2 row construction readable
type AlertRowLike = Parameters<typeof formatAccuracyReport>[0][number];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — direct tool invocation (bypass SSE transport)
// ─────────────────────────────────────────────────────────────────────────────

async function callTool(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const registry = (server as unknown as {
    _registeredTools: Record<string, {
      handler: (args: Record<string, unknown>) => Promise<unknown>;
    }>;
  })._registeredTools;

  const entry = registry[toolName];
  if (!entry) throw new Error(`Tool "${toolName}" not registered`);
  return entry.handler(args) as Promise<{
    content: Array<{ type: string; text: string }>;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Setup
// ─────────────────────────────────────────────────────────────────────────────

let server: McpServer;

beforeAll(async () => {
  Bun.env["DB_PATH"] = ":memory:";
  await initDatabase();

  // Create market_prices_history table (normally created by hose.ts lazily)
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS market_prices_history (
      code       TEXT NOT NULL,
      price      REAL NOT NULL,
      volume     REAL NOT NULL DEFAULT 0,
      fetched_at TEXT NOT NULL,
      PRIMARY KEY (code, fetched_at)
    );
    CREATE INDEX IF NOT EXISTS idx_mph_code_fetched
      ON market_prices_history(code, fetched_at DESC);
  `);

  server = new McpServer(
    { name: "test", version: "0.0.1" },
    { capabilities: { tools: {} } },
  );
  registerAlertAccuracyTool(server);
});

afterAll(() => {
  closeDb();
});

beforeEach(() => {
  const db = getDb();
  db.exec("DELETE FROM alerts");
  db.exec("DELETE FROM market_prices_history");
});

// ─────────────────────────────────────────────────────────────────────────────
// Seed helpers
// ─────────────────────────────────────────────────────────────────────────────

function seedAlert(opts: {
  id: string;
  code: string;
  signalType: string;
  triggeredAt: string;
  severity?: string;
}): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO alerts (id, triggered_at, severity, signals_json, affected_actions_json, message, read)
    VALUES (?, ?, ?, ?, ?, ?, 0)
  `).run(
    opts.id,
    opts.triggeredAt,
    opts.severity ?? "medium",
    JSON.stringify([{ type: opts.signalType, actionCode: opts.code, severity: opts.severity ?? "medium", confidence: 0.8 }]),
    JSON.stringify([{ code: opts.code, expectedImpact: opts.signalType.includes("drop") ? "down" : "up", confidence: 0.8 }]),
    `${opts.code} ${opts.signalType} signal`,
  );
}

function seedPrice(code: string, price: number, fetchedAt: string): void {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO market_prices_history (code, price, volume, fetched_at)
    VALUES (?, ?, 0, ?)
  `).run(code, price, fetchedAt);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 183 — get_alert_accuracy MCP tool", () => {
  it("registers the tool without error", () => {
    const registry = (server as unknown as {
      _registeredTools: Record<string, unknown>;
    })._registeredTools;
    expect(registry["get_alert_accuracy"]).toBeTruthy();
  });

  it("returns 'no alerts' message when database is empty", async () => {
    const result = await callTool(server, "get_alert_accuracy", { days: 30 });
    expect(result.content[0]!.text).toContain("Không có dữ liệu");
  });

  it("scores a price_drop signal as HIT when price actually fell after alert", async () => {
    const alertTime = new Date(Date.now() - 5 * 86_400_000).toISOString(); // 5 days ago
    const priceAtAlert = new Date(
      new Date(alertTime).getTime() + 60_000,
    ).toISOString(); // 1 min after alert
    const priceAfter = new Date(
      new Date(alertTime).getTime() + 2 * 86_400_000,
    ).toISOString(); // 2 days later

    seedAlert({ id: "a1", code: "VNM", signalType: "price_drop", triggeredAt: alertTime });
    seedPrice("VNM", 70000, priceAtAlert);   // price at alert
    seedPrice("VNM", 65000, priceAfter);     // price 2 days later (fell = HIT)

    const result = await callTool(server, "get_alert_accuracy", { days: 30 });
    const text = result.content[0]!.text;
    expect(text).toContain("Hit:");
    // HIT count should be 1
    expect(text).toMatch(/Hit:\s*1/);
  });

  it("scores a price_drop signal as MISS when price actually rose after alert", async () => {
    const alertTime = new Date(Date.now() - 5 * 86_400_000).toISOString();
    const priceAtAlert = new Date(
      new Date(alertTime).getTime() + 60_000,
    ).toISOString();
    const priceAfter = new Date(
      new Date(alertTime).getTime() + 2 * 86_400_000,
    ).toISOString();

    seedAlert({ id: "a2", code: "FPT", signalType: "price_drop", triggeredAt: alertTime });
    seedPrice("FPT", 90000, priceAtAlert);   // price at alert
    seedPrice("FPT", 95000, priceAfter);     // price 2 days later (rose = MISS)

    const result = await callTool(server, "get_alert_accuracy", { days: 30 });
    const text = result.content[0]!.text;
    expect(text).toMatch(/Miss:\s*1/);
  });

  it("scores a price_surge signal as HIT when price actually rose after alert", async () => {
    const alertTime = new Date(Date.now() - 5 * 86_400_000).toISOString();
    const priceAtAlert = new Date(
      new Date(alertTime).getTime() + 60_000,
    ).toISOString();
    const priceAfter = new Date(
      new Date(alertTime).getTime() + 2 * 86_400_000,
    ).toISOString();

    seedAlert({ id: "a3", code: "VCB", signalType: "price_surge", triggeredAt: alertTime });
    seedPrice("VCB", 80000, priceAtAlert);
    seedPrice("VCB", 85000, priceAfter);     // rose = HIT for surge signal

    const result = await callTool(server, "get_alert_accuracy", { days: 30 });
    const text = result.content[0]!.text;
    expect(text).toMatch(/Hit:\s*1/);
  });

  it("scores as UNKNOWN when no price data is available", async () => {
    const alertTime = new Date(Date.now() - 5 * 86_400_000).toISOString();

    seedAlert({ id: "a4", code: "VEA", signalType: "price_drop", triggeredAt: alertTime });
    // No price data seeded

    const result = await callTool(server, "get_alert_accuracy", { days: 30 });
    const text = result.content[0]!.text;
    expect(text).toMatch(/Unknown:\s*1/);
  });

  it("filters by actionCode when provided", async () => {
    const alertTime = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const priceAtAlert = new Date(
      new Date(alertTime).getTime() + 60_000,
    ).toISOString();
    const priceAfter = new Date(
      new Date(alertTime).getTime() + 2 * 86_400_000,
    ).toISOString();

    seedAlert({ id: "b1", code: "VNM", signalType: "price_drop", triggeredAt: alertTime });
    seedAlert({ id: "b2", code: "FPT", signalType: "price_drop", triggeredAt: alertTime });
    seedPrice("VNM", 70000, priceAtAlert);
    seedPrice("VNM", 65000, priceAfter);
    seedPrice("FPT", 90000, priceAtAlert);
    seedPrice("FPT", 85000, priceAfter);

    const result = await callTool(server, "get_alert_accuracy", { days: 30, actionCode: "VNM" });
    const text = result.content[0]!.text;
    // Only VNM should be evaluated
    expect(text).toContain("VNM");
    expect(text).not.toContain("FPT");
  });

  it("respects the days lookback parameter", async () => {
    // Alert older than 7 days
    const oldAlertTime = new Date(Date.now() - 10 * 86_400_000).toISOString();
    seedAlert({ id: "c1", code: "VNM", signalType: "price_drop", triggeredAt: oldAlertTime });

    const result = await callTool(server, "get_alert_accuracy", { days: 7 });
    const text = result.content[0]!.text;
    // With 7-day lookback, the 10-day-old alert should not appear
    expect(text).toContain("Không có dữ liệu");
  });

  it("shows signal type breakdown in output", async () => {
    const alertTime = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const priceAtAlert = new Date(
      new Date(alertTime).getTime() + 60_000,
    ).toISOString();
    const priceAfter = new Date(
      new Date(alertTime).getTime() + 2 * 86_400_000,
    ).toISOString();

    seedAlert({ id: "d1", code: "VNM", signalType: "price_drop", triggeredAt: alertTime });
    seedAlert({ id: "d2", code: "FPT", signalType: "news_mention", triggeredAt: alertTime });
    seedPrice("VNM", 70000, priceAtAlert);
    seedPrice("VNM", 65000, priceAfter);     // VNM drop HIT
    // FPT has no price data => news_mention UNKNOWN

    const result = await callTool(server, "get_alert_accuracy", { days: 30 });
    const text = result.content[0]!.text;
    expect(text).toContain("price_drop");
  });

  it("shows worst performer stock section when there are misses", async () => {
    const alertTime = new Date(Date.now() - 4 * 86_400_000).toISOString();
    const priceAtAlert = new Date(
      new Date(alertTime).getTime() + 60_000,
    ).toISOString();
    const priceAfter = new Date(
      new Date(alertTime).getTime() + 2 * 86_400_000,
    ).toISOString();

    // VEA: 3 alerts all missed
    for (let i = 0; i < 3; i++) {
      const t = new Date(
        new Date(alertTime).getTime() + i * 3_600_000,
      ).toISOString();
      const p1 = new Date(new Date(t).getTime() + 60_000).toISOString();
      const p2 = new Date(new Date(t).getTime() + 2 * 86_400_000).toISOString();
      seedAlert({ id: `e${i}`, code: "VEA", signalType: "price_drop", triggeredAt: t });
      seedPrice("VEA", 50000 + i * 100, p1);
      seedPrice("VEA", 51000 + i * 100, p2); // rose = MISS for drop signal
    }

    const result = await callTool(server, "get_alert_accuracy", { days: 30 });
    const text = result.content[0]!.text;
    expect(text).toContain("VEA");
  });

  it("calculates correct percentage in summary line", async () => {
    // 2 HITs, 0 MISSes, 0 UNKNOWN
    const base = Date.now() - 5 * 86_400_000;
    for (let i = 0; i < 2; i++) {
      const alertTime = new Date(base + i * 3_600_000).toISOString();
      const p1 = new Date(base + i * 3_600_000 + 60_000).toISOString();
      const p2 = new Date(base + i * 3_600_000 + 2 * 86_400_000).toISOString();
      const code = i === 0 ? "VNM" : "FPT";
      seedAlert({ id: `f${i}`, code, signalType: "price_drop", triggeredAt: alertTime });
      seedPrice(code, 100000, p1);
      seedPrice(code, 90000, p2); // fell = HIT
    }

    const result = await callTool(server, "get_alert_accuracy", { days: 30 });
    const text = result.content[0]!.text;
    // Should show 100% accuracy (2 hits out of 2 total)
    expect(text).toContain("100%");
  });

  it("returns plain text (no JSON parse errors)", async () => {
    const result = await callTool(server, "get_alert_accuracy", { days: 30 });
    expect(result.content[0]!.type).toBe("text");
    expect(typeof result.content[0]!.text).toBe("string");
    expect(result.content[0]!.text.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-2 — intraday gate: calendarDaysElapsed must be >= 1 to use 1-12h window
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-2 — intraday fallback gated by calendarDaysElapsed", () => {
  function makeRow(opts: {
    id: string;
    code: string;
    signalType: string;
    triggeredAt: string;
    outcome?: string | null;
  }): AlertRowLike {
    return {
      id: opts.id,
      triggered_at: opts.triggeredAt,
      severity: "medium",
      signals_json: JSON.stringify([
        { type: opts.signalType, actionCode: opts.code, severity: "medium", confidence: 0.8 },
      ]),
      affected_actions_json: JSON.stringify([
        { code: opts.code, expectedImpact: "down", confidence: 0.8 },
      ]),
      outcome: opts.outcome ?? null,
      outcome_at: null,
      outcome_detail: null,
    };
  }

  beforeEach(() => {
    const db = getDb();
    db.exec("DELETE FROM market_prices_history");
  });

  it("AC-2a: same-calendar-day alert (elapsed=0) with intraday price drop → UNKNOWN (gate blocks)", () => {
    // calendarDaysElapsed = floor(30min / 86400000ms) = 0
    // Without gate: 5% intraday drop would score as HIT
    // With gate:    elapsed=0 blocks intraday window → UNKNOWN
    const now = Date.now();
    const alertTs = now - 30 * 60_000; // 30 min ago
    const triggeredAt = new Date(alertTs).toISOString();

    const db = getDb();
    // Price at alert time (+1 min)
    db.prepare(
      "INSERT OR REPLACE INTO market_prices_history (code, price, volume, fetched_at) VALUES (?, ?, 0, ?)",
    ).run("TSAC2A", 100000, new Date(alertTs + 60_000).toISOString());
    // Intraday price: +2h from alert, 5% drop (within 1-12h window)
    db.prepare(
      "INSERT OR REPLACE INTO market_prices_history (code, price, volume, fetched_at) VALUES (?, ?, 0, ?)",
    ).run("TSAC2A", 95000, new Date(alertTs + 2 * 3_600_000).toISOString());

    const rows: AlertRowLike[] = [
      makeRow({ id: "ac2a", code: "TSAC2A", signalType: "price_drop", triggeredAt }),
    ];
    const report = formatAccuracyReport(rows, 1);

    // Gate closed (elapsed=0) → no intraday fallback → UNKNOWN
    expect(report.unknowns).toBe(1);
    expect(report.hits).toBe(0);
    expect(report.misses).toBe(0);
  });

  it("AC-2b: next-calendar-day alert (elapsed=1) with intraday price drop → HIT (gate open)", () => {
    // calendarDaysElapsed = floor(25h / 24h) = 1
    // No 1-3 day window data; intraday 1-12h window has a 5% drop → HIT
    const now = Date.now();
    const alertTs = now - 25 * 3_600_000; // 25 hours ago
    const triggeredAt = new Date(alertTs).toISOString();

    const db = getDb();
    // Price at alert time (+1 min)
    db.prepare(
      "INSERT OR REPLACE INTO market_prices_history (code, price, volume, fetched_at) VALUES (?, ?, 0, ?)",
    ).run("TSAC2B", 100000, new Date(alertTs + 60_000).toISOString());
    // Intraday price: +2h from alert, 5% drop (within 1-12h window)
    db.prepare(
      "INSERT OR REPLACE INTO market_prices_history (code, price, volume, fetched_at) VALUES (?, ?, 0, ?)",
    ).run("TSAC2B", 95000, new Date(alertTs + 2 * 3_600_000).toISOString());

    const rows: AlertRowLike[] = [
      makeRow({ id: "ac2b", code: "TSAC2B", signalType: "price_drop", triggeredAt }),
    ];
    const report = formatAccuracyReport(rows, 30);

    // Gate open (elapsed=1) → intraday fallback → 5% drop for price_drop → HIT
    expect(report.hits).toBe(1);
    expect(report.unknowns).toBe(0);
  });

  it("AC-2c: calendarDaysElapsed math — 30min elapsed → 0", () => {
    const now = Date.now();
    const alertTs = now - 30 * 60_000;
    const elapsed = Math.floor((now - alertTs) / 86_400_000);
    expect(elapsed).toBe(0);
  });

  it("AC-2d: calendarDaysElapsed math — 25h elapsed → 1", () => {
    const now = Date.now();
    const alertTs = now - 25 * 3_600_000;
    const elapsed = Math.floor((now - alertTs) / 86_400_000);
    expect(elapsed).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-1 — NULL-outcome alert row uses domain scorer path
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-1 — NULL-outcome alert row uses domain scorer (scoreAlert deleted)", () => {
  beforeEach(() => {
    const db = getDb();
    db.exec("DELETE FROM market_prices_history");
  });

  it("AC-1a: scoreAlert is NOT an export of alertAccuracy module", () => {
    // Verify the local scoreAlert function was deleted — not reachable via exports
    expect((alertAccuracyModule as Record<string, unknown>)["scoreAlert"]).toBeUndefined();
  });

  it("AC-1b: NULL-outcome row with price drop — formatAccuracyReport matches direct scoreAlertOutcome call", () => {
    // Alert: price_drop, 5 days ago, outcome = NULL
    const now = Date.now();
    const alertTs = now - 5 * 86_400_000;
    const triggeredAt = new Date(alertTs).toISOString();
    const code = "TSAC1B";

    // Seed: alertPrice at +1min, windowPrice at +2days (5% drop)
    const alertPriceFetchedAt = new Date(alertTs + 60_000).toISOString();
    const windowPriceFetchedAt = new Date(alertTs + 2 * 86_400_000).toISOString();
    const alertPriceValue = 100_000;
    const windowPriceValue = 95_000;

    const db = getDb();
    db.prepare(
      "INSERT OR REPLACE INTO market_prices_history (code, price, volume, fetched_at) VALUES (?, ?, 0, ?)",
    ).run(code, alertPriceValue, alertPriceFetchedAt);
    db.prepare(
      "INSERT OR REPLACE INTO market_prices_history (code, price, volume, fetched_at) VALUES (?, ?, 0, ?)",
    ).run(code, windowPriceValue, windowPriceFetchedAt);

    // Build a NULL-outcome AlertRow (Path 2 will trigger)
    const row: AlertRowLike = {
      id: "ac1b",
      triggered_at: triggeredAt,
      severity: "medium",
      signals_json: JSON.stringify([
        { type: "price_drop", actionCode: code, severity: "medium", confidence: 0.8 },
      ]),
      affected_actions_json: JSON.stringify([{ code, expectedImpact: "down", confidence: 0.8 }]),
      outcome: null,
      outcome_at: null,
      outcome_detail: null,
    };

    // formatAccuracyReport result (Path 2 via domain scorer)
    const report = formatAccuracyReport([row], 30);

    // Direct domain scorer call with the same inputs
    const classification = classifyAlertType(row.signals_json, null);
    const calendarDaysElapsed = Math.floor((now - alertTs) / 86_400_000);
    const windowPrices: PricePoint[] = [{ price: windowPriceValue, fetchedAt: windowPriceFetchedAt }];
    const domainResult = scoreAlertOutcome(
      classification,
      alertPriceValue,
      windowPrices,
      calendarDaysElapsed,
    );

    // Map domain outcome to AccuracyResult (same mapping as Path 2)
    const expectedOutcome = domainResult.outcome.toUpperCase();
    const expectedHits = expectedOutcome === "HIT" ? 1 : 0;
    const expectedMisses = expectedOutcome === "MISS" ? 1 : 0;
    const expectedUnknowns = expectedOutcome !== "HIT" && expectedOutcome !== "MISS" ? 1 : 0;

    expect(report.hits).toBe(expectedHits);
    expect(report.misses).toBe(expectedMisses);
    expect(report.unknowns).toBe(expectedUnknowns);
    expect(report.total).toBe(1);

    // The 5% drop for price_drop should be a HIT (threshold -1.0% per AC-3)
    expect(report.hits).toBe(1);
    expect(report.misses).toBe(0);
  });

  it("AC-1c: NULL-outcome row with no price data — domain scorer returns UNKNOWN", () => {
    // Alert: price_drop, 5 days ago, outcome = NULL, no price data
    const alertTs = Date.now() - 5 * 86_400_000;
    const triggeredAt = new Date(alertTs).toISOString();
    const code = "TSAC1C";

    const row: AlertRowLike = {
      id: "ac1c",
      triggered_at: triggeredAt,
      severity: "medium",
      signals_json: JSON.stringify([
        { type: "price_drop", actionCode: code, severity: "medium", confidence: 0.8 },
      ]),
      affected_actions_json: JSON.stringify([{ code, expectedImpact: "down", confidence: 0.8 }]),
      outcome: null,
      outcome_at: null,
      outcome_detail: null,
    };

    const report = formatAccuracyReport([row], 30);

    // No price data → domain scorer returns unknown → UNKNOWN in report
    expect(report.unknowns).toBe(1);
    expect(report.hits).toBe(0);
    expect(report.misses).toBe(0);
  });
});
