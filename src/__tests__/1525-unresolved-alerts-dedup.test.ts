/**
 * TASK 209 — unresolved-alerts-dedup
 *
 * AC-a: 2 rows same message → 1 returned
 * AC-b: 2 rows different messages → 2 returned
 * AC-c: LIMIT 5 respected after dedup (seed 7 distinct messages → 5 returned)
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { assembleBriefing } from "../application/usecases/assembleBriefing.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const NOOP_OPTS = {
  pollNewsFn: async () => {},
  fetchVnIndexFn: async () => null,
  briefingsDir: "/tmp/briefings-test-1525",
};

function buildTestDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code              TEXT PRIMARY KEY,
      company_name      TEXT,
      exchange          TEXT NOT NULL DEFAULT 'HOSE',
      domain            TEXT NOT NULL DEFAULT 'general',
      notes             TEXT,
      added_at          TEXT NOT NULL DEFAULT (datetime('now')),
      alert_drop_pct    REAL NOT NULL DEFAULT -3,
      alert_rise_pct    REAL NOT NULL DEFAULT 5,
      alert_impact_min  REAL NOT NULL DEFAULT 7,
      alert_report_new  INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS financial_reports (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      action_code    TEXT NOT NULL,
      period_year    INTEGER NOT NULL,
      period_quarter INTEGER,
      period_type    TEXT NOT NULL DEFAULT 'Q1',
      parsed_at      TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS market_prices (
      code        TEXT PRIMARY KEY,
      price       REAL,
      change_amt  REAL,
      change_pct  REAL,
      volume      REAL,
      updated_at  TEXT
    );

    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code       TEXT NOT NULL,
      date       TEXT NOT NULL,
      open       REAL NOT NULL,
      high       REAL NOT NULL,
      low        REAL NOT NULL,
      close      REAL NOT NULL,
      volume     REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (code, date)
    );

    CREATE TABLE IF NOT EXISTS rag_analyses (
      id           TEXT PRIMARY KEY,
      created_at   TEXT NOT NULL,
      level        TEXT NOT NULL,
      source_title TEXT,
      sentiment    TEXT,
      impact_score REAL
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id                    TEXT PRIMARY KEY,
      triggered_at          TEXT NOT NULL,
      severity              TEXT NOT NULL,
      message               TEXT,
      affected_actions_json TEXT,
      read                  INTEGER NOT NULL DEFAULT 0,
      resolved_at           TEXT
    );

    CREATE TABLE IF NOT EXISTS insider_transactions (
      id               TEXT PRIMARY KEY,
      code             TEXT NOT NULL,
      type             TEXT NOT NULL,
      executed_volume  INTEGER NOT NULL DEFAULT 0,
      insider_name     TEXT NOT NULL DEFAULT '',
      from_date        TEXT NOT NULL DEFAULT '',
      fetched_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS vnstock_trading_stats (
      id              TEXT PRIMARY KEY,
      code            TEXT NOT NULL,
      date            TEXT NOT NULL,
      foreign_volume  INTEGER,
      fetched_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS evidence_scores (
      id             TEXT PRIMARY KEY,
      stock          TEXT NOT NULL,
      score_date     TEXT NOT NULL,
      bullish_score  REAL NOT NULL DEFAULT 0,
      bearish_score  REAL NOT NULL DEFAULT 0,
      fragment_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS positions (
      id         TEXT PRIMARY KEY,
      code       TEXT NOT NULL,
      shares     REAL NOT NULL,
      avg_price  REAL NOT NULL,
      closed_at  TEXT
    );
  `);
  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// AC-a: 2 rows same message → 1 returned
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-a: duplicate message deduplicated", () => {
  it("returns 1 alert when 2 rows share same message", async () => {
    const db = buildTestDb();
    db.exec(`
      INSERT INTO alerts (id, triggered_at, severity, message, affected_actions_json)
      VALUES
        ('a1', datetime('now', '-1 hour'), 'high', 'BCTC overdue: VNM Q1 2026', '["VNM"]'),
        ('a2', datetime('now', '-2 hours'), 'high', 'BCTC overdue: VNM Q1 2026', '["VNM"]');
    `);

    const result = await assembleBriefing({ db, ...NOOP_OPTS });
    const msgs = result.unresolvedAlerts.map((a) => a.message);
    expect(msgs.filter((m) => m === "BCTC overdue: VNM Q1 2026")).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-b: 2 rows different messages → 2 returned
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-b: distinct messages both returned", () => {
  it("returns 2 alerts when 2 rows have different messages", async () => {
    const db = buildTestDb();
    db.exec(`
      INSERT INTO alerts (id, triggered_at, severity, message, affected_actions_json)
      VALUES
        ('b1', datetime('now', '-1 hour'), 'critical', 'Stop-loss triggered: VNM', '["VNM"]'),
        ('b2', datetime('now', '-2 hours'), 'high',     'BCTC overdue: HPG Q4 2025', '["HPG"]');
    `);

    const result = await assembleBriefing({ db, ...NOOP_OPTS });
    expect(result.unresolvedAlerts).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-c: LIMIT 5 after dedup (7 distinct messages → 5 returned)
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-c: LIMIT 5 respected after dedup", () => {
  it("returns at most 5 alerts when 7 distinct high/critical messages exist", async () => {
    const db = buildTestDb();
    const rows = Array.from({ length: 7 }, (_, i) =>
      `('c${i}', datetime('now', '-${i + 1} hour'), 'high', 'Alert message ${i + 1}', NULL)`
    ).join(",\n");
    db.exec(`INSERT INTO alerts (id, triggered_at, severity, message, affected_actions_json) VALUES ${rows};`);

    const result = await assembleBriefing({ db, ...NOOP_OPTS });
    expect(result.unresolvedAlerts.length).toBeLessThanOrEqual(5);
  });
});
