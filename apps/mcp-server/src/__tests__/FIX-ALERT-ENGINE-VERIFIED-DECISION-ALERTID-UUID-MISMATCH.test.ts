/**
 * FIX-ALERT-ENGINE-VERIFIED-DECISION-ALERTID-UUID-MISMATCH
 *
 * Root cause: taAlertScanJob and bbAlertScanJob used crypto.randomUUID() for
 * alert.id. storeAlerts() propagates alert.id into agent_signals.alert_id, so
 * the UUID could never resolve to an alerts row (alerts.id uses semantic keys).
 * Result: 220+ orphan agent_signals rows with signal_type='verified_decision'
 * carrying UUID alert_ids, growing +96/day.
 *
 * Fix: both scan jobs now derive a semantic id:
 *   `alert-${code}-${alertType}-${daySlot}` (same format as alerts.id).
 *
 * Tests (inject deps — no real HTTP, no real Telegram, no real external I/O):
 *   TC-1: taAlertScanJob produces alert.id matching semantic format (NOT UUID)
 *   TC-2: taAlertScanJob agent_signals.alert_id equals the semantic id → resolves
 *   TC-3: bbAlertScanJob produces alert.id matching semantic format (NOT UUID)
 *   TC-4: bbAlertScanJob agent_signals.alert_id equals the semantic id → resolves
 *   TC-5: semantic id is NOT UUID-shaped (regression guard)
 *
 * @module __tests__/FIX-ALERT-ENGINE-VERIFIED-DECISION-ALERTID-UUID-MISMATCH
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { runTaAlertScan } from "../scheduler/market-data/taAlertScanJob.js";
import { runBbAlertScan } from "../scheduler/alerts/bbAlertScanJob.js";
import type { ComputeTAResponse } from "../infrastructure/microservices/clients.js";

// ── Regex constants ────────────────────────────────────────────────────────────

/** Semantic alert id format used by both scan jobs and alerts.id. */
const SEMANTIC_ID_RE = /^alert-[A-Z0-9]+-[a-z_]+-\d{4}-\d{2}-\d{2}$/;

/** UUID v4 shape — must NOT match after the fix. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ── DB builder ────────────────────────────────────────────────────────────────

/**
 * Minimal in-memory DB with alerts + agent_signals tables
 * (including alert_id + is_correlation_stub columns required by storeAlerts).
 */
function buildDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code TEXT PRIMARY KEY,
      exchange TEXT NOT NULL DEFAULT 'HOSE'
    );

    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code TEXT NOT NULL,
      date TEXT NOT NULL,
      open REAL NOT NULL DEFAULT 0,
      high REAL NOT NULL DEFAULT 0,
      low  REAL NOT NULL DEFAULT 0,
      close REAL NOT NULL,
      volume REAL NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (code, date)
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      triggered_at TEXT NOT NULL,
      severity TEXT NOT NULL,
      signals_json TEXT NOT NULL,
      affected_actions_json TEXT NOT NULL,
      analysis_ids_json TEXT,
      message TEXT,
      read INTEGER NOT NULL DEFAULT 0,
      user_note TEXT,
      sent_by TEXT,
      confidence_score REAL,
      validated_at TEXT,
      fingerprint TEXT UNIQUE,
      notified_telegram INTEGER NOT NULL DEFAULT 0,
      outcome TEXT,
      outcome_at TEXT,
      outcome_detail TEXT
    );

    CREATE TABLE IF NOT EXISTS agent_signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_agent TEXT NOT NULL,
      to_agent TEXT NOT NULL,
      signal_type TEXT NOT NULL,
      stock_code TEXT,
      payload TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'unread',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      alert_id TEXT,
      is_correlation_stub INTEGER DEFAULT 0,
      confidence_score REAL
    );
  `);
  return db;
}

/** Seed the watchlist with one ticker and enough daily_ohlcv candles. */
function seedTicker(db: Database, code: string): void {
  db.prepare("INSERT OR IGNORE INTO watchlist (code) VALUES (?)").run(code);
  // 40 candles well above MIN_CANDLES=35, dated within the last 60 days so the
  // CANDLE_SQL filter (date >= date('now', '-60 days')) picks them up.
  // Prices ramp steadily upward so an RSI-overbought stub and BB-breakout-up stub
  // both trigger; volume=1_000_000 clears the MIN_DAILY_VOLUME_FOR_ALERTS=100k floor.
  const today = new Date();
  for (let i = 0; i < 40; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - (39 - i)); // oldest candle = 39 days ago, newest = today
    const date = d.toISOString().slice(0, 10);
    const close = 80 + i * 2; // 80..158, steadily rising
    db.prepare(
      `INSERT OR IGNORE INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(code, date, close, close, close, close, 1_000_000, datetime());
  }
}

function datetime(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

/** Fixed "now" for deterministic daySlot comparisons. */
const FIXED_NOW = new Date("2026-06-25T08:00:00.000Z");
const FIXED_DAY = "2026-06-25";

// ── TA scan compute stub ───────────────────────────────────────────────────────

/** Returns RSI=80 (overbought → alertType='ta_overbought'). */
function makeRsiOverboughtFn(): (code: string, closes: number[]) => Promise<ComputeTAResponse> {
  return async (code: string, _closes: number[]): Promise<ComputeTAResponse> => ({
    code,
    trend: "TANG" as const,
    rsi: 80,
    candlesAvailable: 40,
  });
}

/** Returns BB20 with upper=100, lower=50 and we'll set close>100 to trigger breakout_up. */
function makeBbBreakoutUpFn(): (code: string, closes: number[]) => Promise<ComputeTAResponse> {
  return async (code: string, _closes: number[]): Promise<ComputeTAResponse> => ({
    code,
    trend: "TANG" as const,
    rsi: 55,
    candlesAvailable: 40,
    bb: { upper: 100, middle: 75, lower: 50 },
  });
}

// ── TC-1 + TC-2: taAlertScanJob semantic id ───────────────────────────────────

describe("FIX-ALERT-ENGINE-VERIFIED-DECISION-ALERTID-UUID-MISMATCH TC-1/2 — taAlertScanJob", () => {
  it("TC-1: taAlertScanJob alert.id matches semantic format (not UUID)", async () => {
    const db = buildDb();
    seedTicker(db, "VCB");

    const result = await runTaAlertScan({
      db,
      computeFn: makeRsiOverboughtFn(),
      nowFn: () => FIXED_NOW,
    });

    expect(result.fired).toBe(1);

    const alertRow = db
      .prepare<{ id: string }, []>("SELECT id FROM alerts LIMIT 1")
      .get();

    expect(alertRow).not.toBeNull();
    const id = alertRow!.id;

    // Must match semantic format
    expect(SEMANTIC_ID_RE.test(id)).toBe(true);
    // Expected exact value
    expect(id).toBe(`alert-VCB-ta_overbought-${FIXED_DAY}`);
  });

  it("TC-2: taAlertScanJob agent_signals.alert_id equals semantic alert.id → resolves to alerts row", async () => {
    const db = buildDb();
    seedTicker(db, "HPG");

    await runTaAlertScan({
      db,
      computeFn: makeRsiOverboughtFn(),
      nowFn: () => FIXED_NOW,
    });

    const signalRow = db
      .prepare<{ alert_id: string; signal_type: string }, []>(
        "SELECT alert_id, signal_type FROM agent_signals WHERE signal_type = 'verified_decision' LIMIT 1",
      )
      .get();

    expect(signalRow).not.toBeNull();
    const alertId = signalRow!.alert_id;

    // alert_id must be semantic
    expect(SEMANTIC_ID_RE.test(alertId)).toBe(true);
    expect(alertId).toBe(`alert-HPG-ta_overbought-${FIXED_DAY}`);

    // alert_id MUST resolve to an alerts row (no orphan)
    const alertRow = db
      .prepare<{ id: string }, [string]>("SELECT id FROM alerts WHERE id = ? LIMIT 1")
      .get(alertId);
    expect(alertRow).not.toBeNull();
    expect(alertRow!.id).toBe(alertId);
  });
});

// ── TC-3 + TC-4: bbAlertScanJob semantic id ───────────────────────────────────

describe("FIX-ALERT-ENGINE-VERIFIED-DECISION-ALERTID-UUID-MISMATCH TC-3/4 — bbAlertScanJob", () => {
  it("TC-3: bbAlertScanJob alert.id matches semantic format (not UUID)", async () => {
    const db = buildDb();
    // seedTicker provides 40 candles with close up to 158; makeBbBreakoutUpFn returns
    // upper=100 so any positive close triggers the breakout_up path.
    seedTicker(db, "FPT");

    const result = await runBbAlertScan({
      db,
      computeFn: makeBbBreakoutUpFn(),
      nowFn: () => FIXED_NOW,
    });

    expect(result.fired).toBe(1);

    const alertRow = db
      .prepare<{ id: string }, []>("SELECT id FROM alerts LIMIT 1")
      .get();

    expect(alertRow).not.toBeNull();
    const id = alertRow!.id;

    expect(SEMANTIC_ID_RE.test(id)).toBe(true);
    expect(id).toBe(`alert-FPT-ta_bb_breakout_up-${FIXED_DAY}`);
  });

  it("TC-4: bbAlertScanJob agent_signals.alert_id equals semantic alert.id → resolves to alerts row", async () => {
    const db = buildDb();
    seedTicker(db, "MWG");

    await runBbAlertScan({
      db,
      computeFn: makeBbBreakoutUpFn(),
      nowFn: () => FIXED_NOW,
    });

    const signalRow = db
      .prepare<{ alert_id: string }, []>(
        "SELECT alert_id FROM agent_signals WHERE signal_type = 'verified_decision' LIMIT 1",
      )
      .get();

    expect(signalRow).not.toBeNull();
    const alertId = signalRow!.alert_id;

    expect(SEMANTIC_ID_RE.test(alertId)).toBe(true);
    expect(alertId).toBe(`alert-MWG-ta_bb_breakout_up-${FIXED_DAY}`);

    // Must resolve to an alerts row — no orphan
    const alertRow = db
      .prepare<{ id: string }, [string]>("SELECT id FROM alerts WHERE id = ? LIMIT 1")
      .get(alertId);
    expect(alertRow).not.toBeNull();
    expect(alertRow!.id).toBe(alertId);
  });
});

// ── TC-5: regression guard — id is NOT UUID-shaped ────────────────────────────

describe("FIX-ALERT-ENGINE-VERIFIED-DECISION-ALERTID-UUID-MISMATCH TC-5 — regression guard", () => {
  it("TC-5: neither taAlertScanJob nor bbAlertScanJob emits a UUID-shaped alert_id", async () => {
    const taDb = buildDb();
    seedTicker(taDb, "VIC");

    await runTaAlertScan({
      db: taDb,
      computeFn: makeRsiOverboughtFn(),
      nowFn: () => FIXED_NOW,
    });

    const taSignal = taDb
      .prepare<{ alert_id: string }, []>(
        "SELECT alert_id FROM agent_signals WHERE signal_type = 'verified_decision' LIMIT 1",
      )
      .get();

    expect(taSignal).not.toBeNull();
    // Must NOT be UUID-shaped
    expect(UUID_RE.test(taSignal!.alert_id)).toBe(false);

    const bbDb = buildDb();
    seedTicker(bbDb, "VHM");

    await runBbAlertScan({
      db: bbDb,
      computeFn: makeBbBreakoutUpFn(),
      nowFn: () => FIXED_NOW,
    });

    const bbSignal = bbDb
      .prepare<{ alert_id: string }, []>(
        "SELECT alert_id FROM agent_signals WHERE signal_type = 'verified_decision' LIMIT 1",
      )
      .get();

    expect(bbSignal).not.toBeNull();
    expect(UUID_RE.test(bbSignal!.alert_id)).toBe(false);
  });
});
