/**
 * Task 1086 — financial_reports row count trend detection
 *
 * Covers:
 *   AC-1: D-10 emits row_count_drop WARNING when financial_reports count decreases
 *   AC-2: D-10 does NOT emit row_count_drop when count stays same or increases
 *   AC-3: D-10 still emits row_count_snapshot (info) alongside drop finding
 *   AC-4: First audit (no previous state) — no drop finding emitted
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";

// ── Test DB helper ──────────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS market_prices (
      code        TEXT PRIMARY KEY,
      price       REAL,
      change_amt  REAL,
      change_pct  REAL,
      volume      REAL,
      updated_at  TEXT
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id                    TEXT PRIMARY KEY,
      triggered_at          TEXT NOT NULL,
      severity              TEXT NOT NULL DEFAULT 'warning',
      signals_json          TEXT,
      affected_actions_json TEXT,
      analysis_ids_json     TEXT,
      message               TEXT,
      read                  INTEGER NOT NULL DEFAULT 0,
      resolved_at           TEXT,
      resolution_notes      TEXT,
      notified_telegram     INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS rag_analyses (
      id                 TEXT PRIMARY KEY,
      created_at         TEXT NOT NULL,
      level              TEXT NOT NULL,
      source_url         TEXT,
      source_title       TEXT,
      sentiment          TEXT,
      impact_score       REAL,
      impact_direction   TEXT,
      data_env TEXT
);

    CREATE TABLE IF NOT EXISTS financial_reports (
      id                TEXT PRIMARY KEY,
      code              TEXT NOT NULL,
      created_at        TEXT NOT NULL,
      validation_status TEXT DEFAULT 'pending',
      validation_notes  TEXT
    );

    CREATE TABLE IF NOT EXISTS agent_feedback (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      agent       TEXT NOT NULL,
      category    TEXT NOT NULL,
      title       TEXT NOT NULL,
      detail      TEXT NOT NULL DEFAULT '',
      priority    TEXT NOT NULL DEFAULT 'medium',
      status      TEXT NOT NULL DEFAULT 'new',
      created_at  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_feedback_status ON agent_feedback(status);
    CREATE INDEX IF NOT EXISTS idx_feedback_agent  ON agent_feedback(agent);

    CREATE TABLE IF NOT EXISTS system_logs (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp    TEXT NOT NULL DEFAULT (datetime('now')),
      level        TEXT NOT NULL,
      source       TEXT NOT NULL,
      message      TEXT NOT NULL,
      details_json TEXT,
      resolved     INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS watchlist (
      code TEXT PRIMARY KEY,
      exchange TEXT NOT NULL DEFAULT 'HOSE'
    );

    CREATE TABLE IF NOT EXISTS commodity_prices_history (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      source           TEXT NOT NULL,
      brent_crude_usd  REAL NOT NULL DEFAULT 0,
      gold_usd_per_oz  REAL NOT NULL DEFAULT 0,
      usd_vnd_rate     REAL NOT NULL DEFAULT 0,
      fetched_at       TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sbv_rates_history (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      source               TEXT NOT NULL,
      overnight_rate_pct   REAL NOT NULL DEFAULT 0,
      refinancing_rate_pct REAL NOT NULL DEFAULT 0,
      usd_vnd_official     REAL NOT NULL DEFAULT 0,
      fetched_at           TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS market_prices_history (
      code       TEXT NOT NULL,
      price      REAL NOT NULL,
      volume     REAL NOT NULL,
      fetched_at TEXT NOT NULL,
      exchange   TEXT DEFAULT 'HOSE',
      PRIMARY KEY (code, fetched_at)
    );
    CREATE INDEX IF NOT EXISTS idx_mph_code_fetched
      ON market_prices_history(code, fetched_at DESC);

    CREATE TABLE IF NOT EXISTS audit_state (
      id                    INTEGER PRIMARY KEY CHECK (id = 1),
      last_daily_audit_at   TEXT,
      last_weekly_audit_at  TEXT,
      last_daily_findings   TEXT,
      last_weekly_findings  TEXT
    );
  `);

  return db;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("Task 1086 — financial_reports row count trend detection", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
  });

  afterEach(() => {
    db.close();
  });

  it("AC-1: emits row_count_drop WARNING when financial_reports count decreases", async () => {
    // Seed 5 financial_reports rows
    for (let i = 1; i <= 5; i++) {
      db.prepare(
        "INSERT INTO financial_reports (id, code, created_at) VALUES (?, ?, datetime('now'))",
      ).run(`fr-${i}`, "VCB");
    }

    // Simulate previous audit that saw 5 rows
    const previousFindings = [
      {
        table: "financial_reports",
        check: "row_count_snapshot",
        severity: "info",
        rowsAffected: 5,
        action: "none",
        detail: "financial_reports has 5 rows",
      },
    ];
    db.prepare(
      "INSERT INTO audit_state (id, last_daily_audit_at, last_daily_findings) VALUES (1, datetime('now', '-1 day'), ?)",
    ).run(JSON.stringify(previousFindings));

    // Delete 2 rows to simulate disappearance
    db.prepare("DELETE FROM financial_reports WHERE id IN ('fr-1', 'fr-2')").run();

    const { runDailyAudit } = await import("../scheduler/news-analysis/dataAuditJob.js");
    const findings = await runDailyAudit(db, async () => {});

    // Should have a row_count_drop finding for financial_reports
    const dropFinding = findings.find(
      (f) => f.check === "row_count_drop" && f.table === "financial_reports",
    );
    expect(dropFinding).toBeDefined();
    expect(dropFinding!.severity).toBe("warning");
    expect(dropFinding!.action).toBe("escalated");
    expect(dropFinding!.rowsAffected).toBe(2); // dropped by 2
    expect(dropFinding!.detail).toContain("5");
    expect(dropFinding!.detail).toContain("3");
  });

  it("AC-2: does NOT emit row_count_drop when count stays same or increases", async () => {
    // Seed 3 financial_reports rows
    for (let i = 1; i <= 3; i++) {
      db.prepare(
        "INSERT INTO financial_reports (id, code, created_at) VALUES (?, ?, datetime('now'))",
      ).run(`fr-${i}`, "FPT");
    }

    // Previous audit saw 2 rows (count increased from 2 to 3)
    const previousFindings = [
      {
        table: "financial_reports",
        check: "row_count_snapshot",
        severity: "info",
        rowsAffected: 2,
        action: "none",
        detail: "financial_reports has 2 rows",
      },
    ];
    db.prepare(
      "INSERT INTO audit_state (id, last_daily_audit_at, last_daily_findings) VALUES (1, datetime('now', '-1 day'), ?)",
    ).run(JSON.stringify(previousFindings));

    const { runDailyAudit } = await import("../scheduler/news-analysis/dataAuditJob.js");
    const findings = await runDailyAudit(db, async () => {});

    // No row_count_drop finding
    const dropFinding = findings.find(
      (f) => f.check === "row_count_drop" && f.table === "financial_reports",
    );
    expect(dropFinding).toBeUndefined();

    // But still has the snapshot
    const snapshot = findings.find(
      (f) => f.check === "row_count_snapshot" && f.table === "financial_reports",
    );
    expect(snapshot).toBeDefined();
    expect(snapshot!.rowsAffected).toBe(3);
  });

  it("AC-3: snapshot still emitted alongside drop finding", async () => {
    // Seed 1 row
    db.prepare(
      "INSERT INTO financial_reports (id, code, created_at) VALUES ('fr-1', 'VNM', datetime('now'))",
    ).run();

    // Previous audit saw 3 rows
    const previousFindings = [
      {
        table: "financial_reports",
        check: "row_count_snapshot",
        severity: "info",
        rowsAffected: 3,
        action: "none",
        detail: "financial_reports has 3 rows",
      },
    ];
    db.prepare(
      "INSERT INTO audit_state (id, last_daily_audit_at, last_daily_findings) VALUES (1, datetime('now', '-1 day'), ?)",
    ).run(JSON.stringify(previousFindings));

    const { runDailyAudit } = await import("../scheduler/news-analysis/dataAuditJob.js");
    const findings = await runDailyAudit(db, async () => {});

    // Both drop and snapshot findings present
    const dropFinding = findings.find(
      (f) => f.check === "row_count_drop" && f.table === "financial_reports",
    );
    const snapshot = findings.find(
      (f) => f.check === "row_count_snapshot" && f.table === "financial_reports",
    );

    expect(dropFinding).toBeDefined();
    expect(snapshot).toBeDefined();
    expect(snapshot!.rowsAffected).toBe(1);
    expect(dropFinding!.rowsAffected).toBe(2); // dropped by 2
  });

  it("AC-4: first audit (no previous state) — no drop finding emitted", async () => {
    // Seed 2 rows, but no previous audit_state
    db.prepare(
      "INSERT INTO financial_reports (id, code, created_at) VALUES ('fr-1', 'VCB', datetime('now'))",
    ).run();
    db.prepare(
      "INSERT INTO financial_reports (id, code, created_at) VALUES ('fr-2', 'FPT', datetime('now'))",
    ).run();

    const { runDailyAudit } = await import("../scheduler/news-analysis/dataAuditJob.js");
    const findings = await runDailyAudit(db, async () => {});

    // No drop finding (no previous baseline)
    const dropFinding = findings.find(
      (f) => f.check === "row_count_drop" && f.table === "financial_reports",
    );
    expect(dropFinding).toBeUndefined();

    // But snapshot exists
    const snapshot = findings.find(
      (f) => f.check === "row_count_snapshot" && f.table === "financial_reports",
    );
    expect(snapshot).toBeDefined();
    expect(snapshot!.rowsAffected).toBe(2);
  });
});
