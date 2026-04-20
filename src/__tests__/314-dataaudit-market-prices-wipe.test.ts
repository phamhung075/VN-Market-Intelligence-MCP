/**
 * Task 314 — dataAuditJob must NOT wipe the live market_prices snapshot.
 *
 * Regression for the 2026-04-07 outage where D-1 blanket-deleted every row
 * with price=0 or NULL. The VPS proxy legitimately pushes price=0 for halted
 * or illiquid tickers during a trading session, so the entire snapshot was
 * wiped and /price + get_watchlist returned N/A until the next day.
 *
 * Acceptance Criteria (TASKS.md Sprint 051 task 314):
 *   1. Mix of price=0 and price>0 rows, run audit, assert price>0 rows survive.
 *   2. D-1 must NOT delete recent zero-price rows (only >1 day old stragglers).
 *   3. findings[] must report rowsAffected for BOTH D-1 (zero_price_rows) and
 *      D-2 (stale_price_rows) separately.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";

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
      id               TEXT PRIMARY KEY,
      created_at       TEXT NOT NULL,
      level            TEXT NOT NULL,
      source_url       TEXT,
      source_title     TEXT,
      sentiment        TEXT,
      impact_score     REAL,
      impact_direction TEXT
    );
    CREATE TABLE IF NOT EXISTS financial_reports (
      id                TEXT PRIMARY KEY,
      code              TEXT NOT NULL,
      created_at        TEXT NOT NULL,
      validation_status TEXT DEFAULT 'pending',
      validation_notes  TEXT
    );
    CREATE TABLE IF NOT EXISTS agent_feedback (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      agent      TEXT NOT NULL,
      category   TEXT NOT NULL,
      title      TEXT NOT NULL,
      detail     TEXT NOT NULL DEFAULT '',
      priority   TEXT NOT NULL DEFAULT 'medium',
      status     TEXT NOT NULL DEFAULT 'new',
      created_at TEXT NOT NULL
    );
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
      code     TEXT PRIMARY KEY,
      exchange TEXT NOT NULL DEFAULT 'HOSE'
    );
    CREATE TABLE IF NOT EXISTS commodity_prices_history (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      source          TEXT NOT NULL,
      brent_crude_usd REAL NOT NULL DEFAULT 0,
      gold_usd_per_oz REAL NOT NULL DEFAULT 0,
      usd_vnd_rate    REAL NOT NULL DEFAULT 0,
      fetched_at      TEXT NOT NULL
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
  `);
  return db;
}

describe("Task 314 — dataAuditJob must not wipe live market_prices snapshot", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
  });

  afterEach(() => {
    db.close();
  });

  it("preserves live snapshot: recent price>0 rows and recent price=0 rows survive", async () => {
    // Recent legitimate snapshot rows (just pushed by VPS proxy this session)
    db.prepare(
      "INSERT INTO market_prices (code, price, updated_at) VALUES (?, ?, datetime('now'))"
    ).run("VNM", 72000);
    db.prepare(
      "INSERT INTO market_prices (code, price, updated_at) VALUES (?, ?, datetime('now'))"
    ).run("FPT", 145000);
    // Halted/illiquid ticker — VPS proxy legitimately pushed price=0 today.
    db.prepare(
      "INSERT INTO market_prices (code, price, updated_at) VALUES (?, ?, datetime('now'))"
    ).run("HALT", 0);
    // NULL price (same story — don't wipe mid-session)
    db.prepare(
      "INSERT INTO market_prices (code, price, updated_at) VALUES (?, ?, datetime('now'))"
    ).run("NULP", null);
    // Stale zero-price straggler (never overwritten in >1 day) — should be deleted
    db.prepare(
      "INSERT INTO market_prices (code, price, updated_at) VALUES (?, ?, datetime('now','-2 days'))"
    ).run("STALE0", 0);

    const { runDailyAudit } = await import("../scheduler/news-analysis/dataAuditJob.js");
    const findings = await runDailyAudit(db, async () => { /* telegram no-op */ });

    const remaining = db
      .query<{ code: string }, []>("SELECT code FROM market_prices ORDER BY code")
      .all()
      .map((r) => r.code);

    // AC-1: all recent rows survived. Only the stale straggler was deleted.
    expect(remaining).toEqual(["FPT", "HALT", "NULP", "VNM"]);
  });

  it("reports rowsAffected separately for D-1 (zero_price_rows) and D-2 (stale_price_rows)", async () => {
    // 1 stale zero-price row → D-1 should delete
    db.prepare(
      "INSERT INTO market_prices (code, price, updated_at) VALUES (?, ?, datetime('now','-2 days'))"
    ).run("ZERO_STALE", 0);
    // 2 rows older than 3 days → D-2 should delete
    db.prepare(
      "INSERT INTO market_prices (code, price, updated_at) VALUES (?, ?, datetime('now','-5 days'))"
    ).run("OLD1", 50000);
    db.prepare(
      "INSERT INTO market_prices (code, price, updated_at) VALUES (?, ?, datetime('now','-10 days'))"
    ).run("OLD2", 60000);
    // 1 fresh row survives both
    db.prepare(
      "INSERT INTO market_prices (code, price, updated_at) VALUES (?, ?, datetime('now'))"
    ).run("FRESH", 70000);

    const { runDailyAudit } = await import("../scheduler/news-analysis/dataAuditJob.js");
    const findings = await runDailyAudit(db, async () => { /* telegram no-op */ });

    const d1 = findings.find((f) => f.check === "zero_price_rows");
    const d2 = findings.find((f) => f.check === "stale_price_rows");

    expect(d1).toBeDefined();
    expect(d1!.table).toBe("market_prices");
    expect(d1!.rowsAffected).toBe(1);
    expect(d1!.action).toBe("auto_cleaned");

    expect(d2).toBeDefined();
    expect(d2!.table).toBe("market_prices");
    // Note: ZERO_STALE (-2 days) was already deleted by D-1, so D-2 only sees OLD1+OLD2
    expect(d2!.rowsAffected).toBe(2);
    expect(d2!.action).toBe("auto_cleaned");

    // Fresh row survives
    const remaining = db
      .query<{ code: string }, []>("SELECT code FROM market_prices")
      .all()
      .map((r) => r.code);
    expect(remaining).toEqual(["FRESH"]);
  });

  it("does not delete anything when snapshot is fully fresh (no false-positive wipe)", async () => {
    for (const code of ["VNM", "FPT", "VCB", "VEA", "HPG"]) {
      db.prepare(
        "INSERT INTO market_prices (code, price, updated_at) VALUES (?, ?, datetime('now'))"
      ).run(code, 10000);
    }

    const { runDailyAudit } = await import("../scheduler/news-analysis/dataAuditJob.js");
    const findings = await runDailyAudit(db, async () => { /* telegram no-op */ });

    const d1 = findings.find((f) => f.check === "zero_price_rows");
    const d2 = findings.find((f) => f.check === "stale_price_rows");
    expect(d1!.rowsAffected).toBe(0);
    expect(d1!.action).toBe("none");
    expect(d2!.rowsAffected).toBe(0);
    expect(d2!.action).toBe("none");

    const count = db
      .query<{ n: number }, []>("SELECT COUNT(*) as n FROM market_prices")
      .get()!.n;
    expect(count).toBe(5);
  });
});
