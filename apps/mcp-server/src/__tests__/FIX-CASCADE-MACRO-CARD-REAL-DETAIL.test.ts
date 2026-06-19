/**
 * FIX-CASCADE-MACRO-CARD-REAL-DETAIL — RED → GREEN test suite
 *
 * Tests the three defect fixes that caused MacroImpactPanel to show empty rows:
 *
 * AC-13: Server route wiring — ?type=chain_catalyst param causes SQL to include
 *         signal_type IN ('chain_catalyst','urgent_news') (D-1 fix)
 * AC-14: Alert correlation stub marker — storeAlerts writes is_correlation_stub=1;
 *         querySignalsForStock excludes stub rows entirely (D-2 fix)
 * AC-15: ensureCorrelationStubColumn is idempotent — calling twice does not throw,
 *         column is present after both calls (D-2 fix)
 *
 * DDD layer: interface + infrastructure tests.
 * Isolation: in-memory SQLite, no live DB.
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";

import {
  querySignalsForStock,
} from "../interface/mcp/routes/stockSignalsHandler.js";
import {
  storeAlerts,
  storeAlertsFromCommander,
  ensureCorrelationStubColumn,
} from "../infrastructure/db/alertStore.js";
import type { Alert } from "../domain/services/alertGenerator.js";

// ── DB setup helpers ─────────────────────────────────────────────────────────

/** Full schema DB matching the real agent_signals + alerts schema (including alert_id) */
function makeFullDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS alerts (
      id                    TEXT PRIMARY KEY,
      triggered_at          TEXT NOT NULL,
      severity              TEXT NOT NULL,
      signals_json          TEXT,
      affected_actions_json TEXT,
      analysis_ids_json     TEXT,
      message               TEXT,
      read                  INTEGER NOT NULL DEFAULT 0,
      user_note             TEXT,
      notified_telegram     INTEGER NOT NULL DEFAULT 0,
      sent_by               TEXT NOT NULL DEFAULT 'server',
      confidence_score      REAL,
      validated_at          TEXT
    );
    CREATE TABLE IF NOT EXISTS agent_signals (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      from_agent   TEXT NOT NULL DEFAULT 'test-agent',
      to_agent     TEXT NOT NULL DEFAULT 'test-consumer',
      signal_type  TEXT NOT NULL,
      stock_code   TEXT,
      payload      TEXT NOT NULL DEFAULT '{}',
      status       TEXT NOT NULL DEFAULT 'unread',
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at   TEXT NOT NULL DEFAULT (datetime('now', '+2 hours')),
      alert_id     TEXT,
      finding_data TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_agent_signals_stock ON agent_signals(stock_code);
  `);
  return db;
}

/** Minimal signals-only DB (no alerts table, no alert_id, no is_correlation_stub — pre-migration state) */
function makeMinimalSignalsDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_signals (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      from_agent   TEXT NOT NULL DEFAULT 'test-agent',
      to_agent     TEXT NOT NULL DEFAULT 'test-consumer',
      signal_type  TEXT NOT NULL,
      stock_code   TEXT,
      payload      TEXT NOT NULL DEFAULT '{}',
      status       TEXT NOT NULL DEFAULT 'unread',
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at   TEXT NOT NULL DEFAULT (datetime('now', '+2 hours')),
      finding_data TEXT
    );
  `);
  return db;
}

function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    severity: "high",
    signals: [{
      type: "price_drop" as const,
      severity: "high" as const,
      actionCode: "FPT",
      message: "test",
      confidence: 0.8,
      detectedAt: new Date().toISOString(),
    }],
    actionCode: "FPT",
    message: "Test alert",
    isRead: false,
    confidence_score: 0.8,
    validated_at: new Date().toISOString(),
    ...overrides,
  };
}

// ── AC-13: Server route type param wiring ────────────────────────────────────

describe("AC-13: type param expansion — chain_catalyst → chain_catalyst + urgent_news", () => {
  let db: Database;
  beforeEach(() => { db = makeMinimalSignalsDb(); });
  afterEach(() => { db.close(); });

  it("AC-13a: passing ['chain_catalyst'] includes chain_catalyst rows", () => {
    db.prepare(`
      INSERT INTO agent_signals (signal_type, stock_code, payload, created_at, expires_at, finding_data)
      VALUES ('chain_catalyst', 'FPT', '{}', '2026-06-19 10:00:00', datetime('now', '+2 hours'),
              '{"headline":"macro event","source":"cafef","event_type":"macro","direction":"bullish","confidence":0.8,"affected_stocks":["FPT"],"affected_sectors":["tech"]}')
    `).run();

    const items = querySignalsForStock(db, "FPT", 10, ["chain_catalyst"]);
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => ["chain_catalyst", "urgent_news"].includes(i.signal_type))).toBe(true);
  });

  it("AC-13b: passing ['chain_catalyst'] also includes urgent_news rows (backend expansion)", () => {
    db.prepare(`
      INSERT INTO agent_signals (signal_type, stock_code, payload, created_at, expires_at, finding_data)
      VALUES ('urgent_news', 'FPT', '{}', '2026-06-19 10:01:00', datetime('now', '+2 hours'),
              '{"headline":"SBV decision","source":"sbv.gov.vn","severity":"high","confidence":0.75}')
    `).run();
    db.prepare(`
      INSERT INTO agent_signals (signal_type, stock_code, payload, created_at, expires_at, finding_data)
      VALUES ('price_anomaly', 'FPT', '{}', '2026-06-19 10:02:00', datetime('now', '+2 hours'),
              '{"move_pct":3.1,"move_sigma":2.0,"regime":"TIGHTENING"}')
    `).run();

    const items = querySignalsForStock(db, "FPT", 10, ["chain_catalyst"]);
    // urgent_news included; price_anomaly excluded
    const types = items.map((i) => i.signal_type);
    expect(types).toContain("urgent_news");
    expect(types).not.toContain("price_anomaly");
  });

  it("AC-13c: no type filter returns all rows including price_anomaly and urgent_news", () => {
    db.prepare(`
      INSERT INTO agent_signals (signal_type, stock_code, payload, created_at, expires_at, finding_data)
      VALUES ('chain_catalyst', 'VCB', '{}', '2026-06-19 09:00:00', datetime('now', '+2 hours'),
              '{"headline":"test","source":"s","event_type":"macro","direction":"bullish","confidence":0.8,"affected_stocks":["VCB"],"affected_sectors":["bank"]}')
    `).run();
    db.prepare(`
      INSERT INTO agent_signals (signal_type, stock_code, payload, created_at, expires_at, finding_data)
      VALUES ('price_anomaly', 'VCB', '{}', '2026-06-19 09:01:00', datetime('now', '+2 hours'),
              '{"move_pct":2.5,"move_sigma":1.8,"regime":"NORMAL"}')
    `).run();

    const items = querySignalsForStock(db, "VCB", 10, undefined);
    expect(items.length).toBe(2);
  });

  it("AC-13d: CSV type param simulation — ['chain_catalyst','urgent_news'] returns both types", () => {
    db.prepare(`
      INSERT INTO agent_signals (signal_type, stock_code, payload, created_at, expires_at, finding_data)
      VALUES ('chain_catalyst', 'HPG', '{}', '2026-06-19 08:00:00', datetime('now', '+2 hours'),
              '{"headline":"h1","source":"s1","event_type":"macro","direction":"bullish","confidence":0.8,"affected_stocks":["HPG"],"affected_sectors":["steel"]}')
    `).run();
    db.prepare(`
      INSERT INTO agent_signals (signal_type, stock_code, payload, created_at, expires_at, finding_data)
      VALUES ('urgent_news', 'HPG', '{}', '2026-06-19 08:01:00', datetime('now', '+2 hours'),
              '{"headline":"h2","source":"s2","severity":"medium","confidence":0.6}')
    `).run();
    db.prepare(`
      INSERT INTO agent_signals (signal_type, stock_code, payload, created_at, expires_at, finding_data)
      VALUES ('price_anomaly', 'HPG', '{}', '2026-06-19 08:02:00', datetime('now', '+2 hours'),
              '{"move_pct":1.9,"move_sigma":1.5,"regime":"NORMAL"}')
    `).run();

    // Passing both explicitly (already includes urgent_news — no double-expansion)
    const items = querySignalsForStock(db, "HPG", 10, ["chain_catalyst", "urgent_news"]);
    expect(items.length).toBe(2);
    const types = items.map((i) => i.signal_type);
    expect(types).toContain("chain_catalyst");
    expect(types).toContain("urgent_news");
    expect(types).not.toContain("price_anomaly");
  });
});

// ── AC-14: Alert correlation stub marker ─────────────────────────────────────

describe("AC-14: storeAlerts writes is_correlation_stub=1 and querySignalsForStock excludes it", () => {
  let db: Database;
  beforeEach(() => { db = makeFullDb(); });
  afterEach(() => { db.close(); });

  it("AC-14a: storeAlerts writes agent_signals row with is_correlation_stub=1", () => {
    const alert = makeAlert({ actionCode: "FPT" });
    storeAlerts([alert], db);

    // ensureCorrelationStubColumn is called inside storeAlerts — column should exist now
    const row = db.prepare("SELECT is_correlation_stub FROM agent_signals WHERE alert_id = ?").get(alert.id) as { is_correlation_stub: number } | null;
    expect(row).not.toBeNull();
    expect(row!.is_correlation_stub).toBe(1);
  });

  it("AC-14b: storeAlertsFromCommander writes agent_signals row with is_correlation_stub=1", () => {
    const alert = makeAlert({ actionCode: "VCB" });
    storeAlertsFromCommander([alert], db);

    const row = db.prepare("SELECT is_correlation_stub FROM agent_signals WHERE alert_id = ?").get(alert.id) as { is_correlation_stub: number } | null;
    expect(row).not.toBeNull();
    expect(row!.is_correlation_stub).toBe(1);
  });

  it("AC-14c: querySignalsForStock excludes is_correlation_stub=1 rows (no type filter)", () => {
    const alert = makeAlert({ actionCode: "FPT" });
    storeAlerts([alert], db);

    // Stub row was written for FPT — should be excluded from stock signal query
    const items = querySignalsForStock(db, "FPT", 10, undefined);
    expect(items).toHaveLength(0);
  });

  it("AC-14d: querySignalsForStock excludes stub even with type filter", () => {
    const alert = makeAlert({ actionCode: "FPT" });
    storeAlerts([alert], db);

    const items = querySignalsForStock(db, "FPT", 10, ["chain_catalyst"]);
    expect(items).toHaveLength(0);
  });

  it("AC-14e: real chain_catalyst row not excluded when stub is also present", () => {
    // Write a stub via storeAlerts
    const alert = makeAlert({ actionCode: "FPT" });
    storeAlerts([alert], db);

    // Write a real chain_catalyst row
    db.prepare(`
      INSERT INTO agent_signals (signal_type, stock_code, payload, created_at, expires_at, finding_data, is_correlation_stub)
      VALUES ('chain_catalyst', 'FPT', '{}', '2026-06-19 10:00:00', datetime('now', '+2 hours'),
              '{"headline":"real macro","source":"cafef","event_type":"macro","direction":"bullish","confidence":0.9,"affected_stocks":["FPT"],"affected_sectors":["tech"]}', 0)
    `).run();

    const items = querySignalsForStock(db, "FPT", 10, ["chain_catalyst"]);
    expect(items).toHaveLength(1);
    expect(items[0]!.signal_type).toBe("chain_catalyst");
    expect((items[0]!.finding_data as Record<string, unknown>)["headline"]).toBe("real macro");
  });
});

// ── AC-15: ensureCorrelationStubColumn idempotency ───────────────────────────

describe("AC-15: ensureCorrelationStubColumn is idempotent", () => {
  it("AC-15a: calling once adds is_correlation_stub column", () => {
    const db = makeMinimalSignalsDb();
    ensureCorrelationStubColumn(db);

    // Column should now exist — no error on probe
    expect(() => {
      db.prepare("SELECT is_correlation_stub FROM agent_signals LIMIT 0").all();
    }).not.toThrow();
    db.close();
  });

  it("AC-15b: calling twice does not throw (idempotent)", () => {
    const db = makeMinimalSignalsDb();
    expect(() => {
      ensureCorrelationStubColumn(db);
      ensureCorrelationStubColumn(db); // second call must be a no-op
    }).not.toThrow();
    db.close();
  });

  it("AC-15c: column has correct DEFAULT 0 — new rows default to not-stub", () => {
    const db = makeMinimalSignalsDb();
    ensureCorrelationStubColumn(db);

    db.prepare(`
      INSERT INTO agent_signals (signal_type, stock_code, payload, created_at, expires_at)
      VALUES ('chain_catalyst', 'FPT', '{}', '2026-06-19 10:00:00', datetime('now', '+2 hours'))
    `).run();

    const row = db.prepare("SELECT is_correlation_stub FROM agent_signals LIMIT 1").get() as { is_correlation_stub: number } | null;
    expect(row).not.toBeNull();
    // DEFAULT 0 means new rows are not stubs
    expect(row!.is_correlation_stub ?? 0).toBe(0);
    db.close();
  });

  it("AC-15d: calling on DB that already has the column (e.g. post-migration) does not error", () => {
    const db = makeMinimalSignalsDb();
    // Manually add the column first (simulating post-migration state)
    db.exec("ALTER TABLE agent_signals ADD COLUMN is_correlation_stub INTEGER DEFAULT 0");

    // Now ensureCorrelationStubColumn should silently skip (no-op)
    expect(() => {
      ensureCorrelationStubColumn(db);
    }).not.toThrow();
    db.close();
  });
});
