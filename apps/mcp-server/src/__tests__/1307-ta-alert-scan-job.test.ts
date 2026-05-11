// src/__tests__/1307-ta-alert-scan-job.test.ts
Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import type { ComputeTAResponse } from "../infrastructure/microservices/clients.js";

// ─────────────────────────────────────────────────────────────────────────────
// Minimal DDL (only tables touched by taAlertScanJob)
// ─────────────────────────────────────────────────────────────────────────────

function buildTestDb(): Database {
  const db = new Database(":memory:");

  db.run(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code TEXT PRIMARY KEY
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS market_prices_history (
      code TEXT,
      price REAL,
      fetched_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      triggered_at TEXT NOT NULL,
      severity TEXT NOT NULL,
      signals_json TEXT NOT NULL,
      affected_actions_json TEXT NOT NULL,
      analysis_ids_json TEXT,
      message TEXT NOT NULL,
      read INTEGER NOT NULL DEFAULT 0,
      user_note TEXT
    )
  `);

  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: controlled computeFn factories
// ─────────────────────────────────────────────────────────────────────────────

function makeComputeFn(rsi: number | null): (code: string) => Promise<ComputeTAResponse> {
  return async (code: string): Promise<ComputeTAResponse> => ({
    code,
    trend: "TREN_DUNG" as const,
    ...(rsi !== null ? { rsi } : {}),
  });
}

/** computeFn that always throws — used by AC-9's per-ticker override */
function makeThrowingComputeFn(): (code: string) => Promise<ComputeTAResponse> {
  return async (_code: string) => {
    throw new Error("Mock TA error for test");
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: count alert rows
// ─────────────────────────────────────────────────────────────────────────────

function countAlerts(db: Database): number {
  return (db.query<{ cnt: number }, []>("SELECT COUNT(*) AS cnt FROM alerts").get()?.cnt ?? 0);
}

function getAlerts(db: Database): Array<{ id: string; signals_json: string; affected_actions_json: string; message: string; severity: string }> {
  return db.query<{ id: string; signals_json: string; affected_actions_json: string; message: string; severity: string }, []>(
    "SELECT id, signals_json, affected_actions_json, message, severity FROM alerts"
  ).all();
}

// ─────────────────────────────────────────────────────────────────────────────
// Import the production function (will fail until implementation exists)
// ─────────────────────────────────────────────────────────────────────────────

import { runTaAlertScan } from "../scheduler/market-data/taAlertScanJob.js";

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1307 — taAlertScanJob: RSI overbought/oversold intraday alerts", () => {
  let db: Database;

  beforeEach(() => {
    db = buildTestDb();
  });

  // AC-1: Alert fires for overbought RSI
  it("AC-1: fires ta_overbought alert when RSI > 70", async () => {
    db.run("INSERT INTO watchlist (code) VALUES ('VCB')");

    const result = await runTaAlertScan({
      db,
      computeFn: makeComputeFn(74.2),
      nowFn: () => new Date("2026-04-15T03:00:00Z"),
    });

    expect(result).toEqual({ scanned: 1, fired: 1 });

    const alerts = getAlerts(db);
    expect(alerts.length).toBe(1);

    const alert = alerts[0]!;
    const signals = JSON.parse(alert.signals_json) as Array<{ type: string; actionCode: string; confidence: number }>;
    const actions = JSON.parse(alert.affected_actions_json) as Array<{ code: string }>;

    expect(signals[0]!.type).toBe("ta_overbought");
    expect(signals[0]!.actionCode).toBe("VCB");
    expect(signals[0]!.confidence).toBe(0.7);
    expect(actions[0]!.code).toBe("VCB");
    expect(alert.message).toContain("VCB");
    expect(alert.message).toContain("quá mua");
    expect(alert.message).toContain("74.2");
    expect(alert.severity).toBe("warning");
  });

  // AC-2: Alert fires for oversold RSI
  it("AC-2: fires ta_oversold alert when RSI < 30", async () => {
    db.run("INSERT INTO watchlist (code) VALUES ('VCB')");

    const result = await runTaAlertScan({
      db,
      computeFn: makeComputeFn(27.8),
      nowFn: () => new Date("2026-04-15T03:00:00Z"),
    });

    expect(result).toEqual({ scanned: 1, fired: 1 });

    const alerts = getAlerts(db);
    expect(alerts.length).toBe(1);

    const alert = alerts[0]!;
    const signals = JSON.parse(alert.signals_json) as Array<{ type: string }>;

    expect(signals[0]!.type).toBe("ta_oversold");
    expect(alert.message).toContain("quá bán");
    expect(alert.message).toContain("27.8");
  });

  // AC-3: No alert for neutral RSI (30–70 range)
  it("AC-3: no alert when RSI is neutral (55.0)", async () => {
    db.run("INSERT INTO watchlist (code) VALUES ('VCB')");

    const result = await runTaAlertScan({
      db,
      computeFn: makeComputeFn(55.0),
      nowFn: () => new Date("2026-04-15T03:00:00Z"),
    });

    expect(result).toEqual({ scanned: 1, fired: 0 });
    expect(countAlerts(db)).toBe(0);
  });

  // AC-4: No alert when RSI is null (insufficient history)
  it("AC-4: no alert when RSI is null (insufficient candle history)", async () => {
    db.run("INSERT INTO watchlist (code) VALUES ('VCB')");

    const result = await runTaAlertScan({
      db,
      computeFn: makeComputeFn(null),
      nowFn: () => new Date("2026-04-15T03:00:00Z"),
    });

    expect(result).toEqual({ scanned: 1, fired: 0 });
    expect(countAlerts(db)).toBe(0);
  });

  // AC-5: Cooldown suppresses second fire within 4 hours
  it("AC-5: cooldown suppresses second alert within 4 hours (T+30min)", async () => {
    db.run("INSERT INTO watchlist (code) VALUES ('VCB')");

    const t0 = new Date("2026-04-15T03:00:00Z");

    // First scan fires
    const first = await runTaAlertScan({
      db,
      computeFn: makeComputeFn(74.2),
      nowFn: () => t0,
    });
    expect(first).toEqual({ scanned: 1, fired: 1 });
    expect(countAlerts(db)).toBe(1);

    // Second scan at T+30min (within 4h cooldown) — must NOT fire
    const t30 = new Date("2026-04-15T03:30:00Z");
    const second = await runTaAlertScan({
      db,
      computeFn: makeComputeFn(74.2),
      nowFn: () => t30,
    });
    expect(second).toEqual({ scanned: 1, fired: 0 });
    // Still only 1 alert in DB
    expect(countAlerts(db)).toBe(1);
  });

  // AC-6: Cooldown lifts after 4 hours
  it("AC-6: cooldown does not suppress alert after 4 hours (T+5h)", async () => {
    db.run("INSERT INTO watchlist (code) VALUES ('VCB')");

    const t0 = new Date("2026-04-15T03:00:00Z");

    // First scan fires
    await runTaAlertScan({
      db,
      computeFn: makeComputeFn(74.2),
      nowFn: () => t0,
    });
    expect(countAlerts(db)).toBe(1);

    // Insert the first alert manually with a triggered_at 5h in the past
    // (we simulate the prior alert being old by manipulating the DB directly)
    // Actually the first alert was inserted with triggered_at = t0.toISOString()
    // We call the second scan with nowFn = T+5h, so the cooldown query checks:
    //   triggered_at >= datetime('now', '-4 hours')
    // The first alert's triggered_at = t0 = "2026-04-15T03:00:00Z"
    // nowFn = T+5h = "2026-04-15T08:00:00Z"
    // But the cooldown SQL uses datetime('now', '-4 hours') where 'now' is the SQLite clock.
    // The cooldown SQL is time-based using SQLite's 'now', not nowFn.
    // To properly test this, we need the implementation to use nowFn for the cooldown boundary.
    // Per TECH-094 the cooldown uses triggered_at >= datetime('now', '-4 hours') which is SQLite 'now'.
    // To make the test work, we manipulate the first alert's triggered_at to be 5h ago.

    // Update the first alert's triggered_at to be definitely outside the 4h window
    db.run("UPDATE alerts SET triggered_at = '2026-04-14T22:00:00Z'");

    const t5h = new Date("2026-04-15T03:00:00Z"); // nowFn is irrelevant here since cooldown uses SQLite 'now'
    const second = await runTaAlertScan({
      db,
      computeFn: makeComputeFn(74.2),
      nowFn: () => t5h,
    });
    expect(second).toEqual({ scanned: 1, fired: 1 });
    // Now 2 alerts in DB
    expect(countAlerts(db)).toBe(2);
  });

  // AC-7: Multi-ticker scan counts correctly
  it("AC-7: multi-ticker scan: 3 tickers, 2 overbought, 1 neutral → {scanned:3, fired:2}", async () => {
    db.run("INSERT INTO watchlist (code) VALUES ('VCB')");
    db.run("INSERT INTO watchlist (code) VALUES ('TCB')");
    db.run("INSERT INTO watchlist (code) VALUES ('HPG')");

    // We need per-ticker RSI control. The computeFn receives DailyCandle[] but not the code.
    // The test populates market_prices_history with distinct prices per code so we can distinguish them.
    // But since computeFn is injected and replaces real computation, we need a stateful approach.
    const rsiByCallOrder = [74.2, 71.5, 50.0]; // VCB→overbought, TCB→overbought, HPG→neutral
    let callIndex = 0;
    const perTickerComputeFn = async (code: string): Promise<ComputeTAResponse> => {
      const rsi = rsiByCallOrder[callIndex++] ?? null;
      return {
        code,
        trend: "TREN_DUNG" as const,
        ...(rsi !== null ? { rsi } : {}),
      };
    };

    const result = await runTaAlertScan({
      db,
      computeFn: perTickerComputeFn,
      nowFn: () => new Date("2026-04-15T03:00:00Z"),
    });

    expect(result).toEqual({ scanned: 3, fired: 2 });
    expect(countAlerts(db)).toBe(2);
  });

  // AC-8: Empty watchlist
  it("AC-8: empty watchlist returns {scanned:0, fired:0} with no DB writes", async () => {
    const result = await runTaAlertScan({
      db,
      computeFn: makeComputeFn(80.0),
      nowFn: () => new Date("2026-04-15T03:00:00Z"),
    });

    expect(result).toEqual({ scanned: 0, fired: 0 });
    expect(countAlerts(db)).toBe(0);
  });

  // AC-9: Per-ticker error does not abort scan
  it("AC-9: error on one ticker is caught; other tickers still processed", async () => {
    db.run("INSERT INTO watchlist (code) VALUES ('VCB')");
    db.run("INSERT INTO watchlist (code) VALUES ('TCB')");
    db.run("INSERT INTO watchlist (code) VALUES ('HPG')");

    // VCB=overbought (fires), TCB=throws, HPG=overbought (fires)
    const callOrder = [
      { rsi: 74.2, throws: false },
      { rsi: null, throws: true },
      { rsi: 75.0, throws: false },
    ];
    let callIdx = 0;
    const isolatedComputeFn = async (code: string): Promise<ComputeTAResponse> => {
      const spec = callOrder[callIdx++]!;
      if (spec.throws) {
        throw new Error("Mock TA computation failure for TCB");
      }
      return {
        code,
        trend: "TREN_DUNG" as const,
        ...(spec.rsi !== null ? { rsi: spec.rsi } : {}),
      };
    };

    const result = await runTaAlertScan({
      db,
      computeFn: isolatedComputeFn,
      nowFn: () => new Date("2026-04-15T03:00:00Z"),
    });

    // Per TECH-094 AC-9 note: errored tickers are counted in scanned
    expect(result.scanned).toBe(3);
    expect(result.fired).toBe(2);
    // VCB and HPG alerts fired; TCB error was caught silently
    expect(countAlerts(db)).toBe(2);
  });
});
