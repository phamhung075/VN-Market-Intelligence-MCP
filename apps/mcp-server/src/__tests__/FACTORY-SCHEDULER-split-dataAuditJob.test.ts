/**
 * FACTORY-SCHEDULER-split-dataAuditJob
 *
 * dataAuditJob.ts (1300L) held runDailyChecks (D-1..D-11) and runWeeklyChecks
 * (W-1..W-7) as two giant inline functions. Split into one file per check
 * group under `news-analysis/audit-checks/`, with AuditFinding + shared
 * helpers moved to `dataAuditShared.ts`.
 *
 * This suite exercises a representative sample of the extracted check
 * functions DIRECTLY (not just through the runDailyAudit/runWeeklyAudit
 * composition, already covered end-to-end by 157/314/1862j) to demonstrate
 * the DoD's "individually testable" property: each check is a pure
 * `(db) => AuditFinding[]` (or async for W-7) function taking only a
 * bun:sqlite Database, with no dependency on the orchestrator.
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { checkZeroPriceRows } from "../scheduler/news-analysis/audit-checks/checkZeroPriceRows.js";
import { checkStaleAlerts } from "../scheduler/news-analysis/audit-checks/checkStaleAlerts.js";
import { checkIndicatorRanges } from "../scheduler/news-analysis/audit-checks/checkIndicatorRanges.js";
import { checkRowCountSnapshot } from "../scheduler/news-analysis/audit-checks/checkRowCountSnapshot.js";
import { checkDuplicatePriceHistory } from "../scheduler/news-analysis/audit-checks/checkDuplicatePriceHistory.js";
import { checkLancedbDrift } from "../scheduler/news-analysis/audit-checks/checkLancedbDrift.js";
import { checkToCategory, severityToPriority } from "../scheduler/news-analysis/dataAuditShared.js";

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS market_prices (
      code TEXT PRIMARY KEY, price REAL, updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY, triggered_at TEXT NOT NULL, read INTEGER NOT NULL DEFAULT 0,
      resolved_at TEXT, resolution_notes TEXT
    );
    CREATE TABLE IF NOT EXISTS agent_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT, agent TEXT NOT NULL, category TEXT NOT NULL,
      title TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', priority TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'new', created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS watchlist (code TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS rag_analyses (id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS financial_reports (id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS system_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT);
    CREATE TABLE IF NOT EXISTS audit_state (
      id INTEGER PRIMARY KEY CHECK (id = 1), last_daily_audit_at TEXT,
      last_weekly_audit_at TEXT, last_daily_findings TEXT, last_weekly_findings TEXT
    );
    CREATE TABLE IF NOT EXISTS market_prices_history (
      code TEXT NOT NULL, price REAL NOT NULL, volume REAL NOT NULL DEFAULT 0, fetched_at TEXT NOT NULL,
      PRIMARY KEY (code, fetched_at)
    );
    CREATE TABLE IF NOT EXISTS tracked_indicators (
      id INTEGER PRIMARY KEY AUTOINCREMENT, indicator TEXT NOT NULL, value REAL NOT NULL, fetched_at TEXT NOT NULL
    );
  `);
  return db;
}

describe("FACTORY-SCHEDULER-split-dataAuditJob — extracted checks are individually callable", () => {
  it("checkZeroPriceRows: deletes only stale (>1 day) zero/NULL price rows", () => {
    const db = makeDb();
    db.prepare("INSERT INTO market_prices (code, price, updated_at) VALUES ('AAA', 0, datetime('now','-2 days'))").run();
    db.prepare("INSERT INTO market_prices (code, price, updated_at) VALUES ('BBB', 0, datetime('now'))").run();
    db.prepare("INSERT INTO market_prices (code, price, updated_at) VALUES ('CCC', 25.5, datetime('now'))").run();

    const findings = checkZeroPriceRows(db);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.check).toBe("zero_price_rows");
    expect(findings[0]!.rowsAffected).toBe(1);
    expect(findings[0]!.action).toBe("auto_cleaned");

    const remaining = db.query<{ code: string }, []>("SELECT code FROM market_prices ORDER BY code").all().map((r) => r.code);
    expect(remaining).toEqual(["BBB", "CCC"]);
  });

  it("checkStaleAlerts: returns D-3 + D-4 findings in order, both isolated to alerts table", () => {
    const db = makeDb();
    db.prepare("INSERT INTO alerts (id, triggered_at, read) VALUES ('a1', datetime('now','-31 days'), 0)").run();
    db.prepare("INSERT INTO alerts (id, triggered_at, read, resolved_at) VALUES ('a2', datetime('now','-61 days'), 1, NULL)").run();

    const findings = checkStaleAlerts(db);
    expect(findings.map((f) => f.check)).toEqual(["stale_unread_alerts", "auto_expire_unresolved"]);
    expect(findings[0]!.rowsAffected).toBe(1);
    expect(findings[1]!.rowsAffected).toBe(1);
  });

  it("checkIndicatorRanges: flags an out-of-range indicator as critical + inserts agent_feedback", () => {
    const db = makeDb();
    db.prepare(
      "INSERT INTO tracked_indicators (indicator, value, fetched_at) VALUES ('brent_crude_usd', 5.0, datetime('now'))"
    ).run();

    const findings = checkIndicatorRanges(db);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.check).toBe("outlier_indicator_values");
    expect(findings[0]!.severity).toBe("critical");

    const feedback = db.query<{ cnt: number }, []>(
      "SELECT COUNT(*) as cnt FROM agent_feedback WHERE agent='data-auditor'"
    ).get();
    expect(feedback!.cnt).toBe(1);
  });

  it("checkRowCountSnapshot: emits one row_count_snapshot finding per SNAPSHOT_TABLE", () => {
    const db = makeDb();
    db.prepare("INSERT INTO watchlist (code) VALUES ('VNM')").run();

    const findings = checkRowCountSnapshot(db);
    const snapshotFindings = findings.filter((f) => f.check === "row_count_snapshot");
    // SNAPSHOT_TABLES = watchlist, market_prices, alerts, rag_analyses, financial_reports, agent_feedback, system_logs
    expect(snapshotFindings).toHaveLength(7);
    const watchlistFinding = snapshotFindings.find((f) => f.table === "watchlist");
    expect(watchlistFinding!.rowsAffected).toBe(1);
  });

  it("checkDuplicatePriceHistory: dedups intraday duplicates, keeping latest rowid per code/day", () => {
    const db = makeDb();
    const today = new Date().toISOString().slice(0, 10);
    db.prepare("INSERT INTO market_prices_history (code, price, fetched_at) VALUES ('VNM', 10, ? || 'T09:00:00')").run(today);
    db.prepare("INSERT INTO market_prices_history (code, price, fetched_at) VALUES ('VNM', 11, ? || 'T15:00:00')").run(today);

    const findings = checkDuplicatePriceHistory(db);
    expect(findings[0]!.check).toBe("duplicate_price_history");
    expect(findings[0]!.rowsAffected).toBe(1);

    const remaining = db.query<{ price: number }, []>("SELECT price FROM market_prices_history").all();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.price).toBe(11); // kept the later (higher rowid) row
  });

  it("checkLancedbDrift: is async and reports the delta between injected getCountFn and SQLite rag_analyses", async () => {
    const db = makeDb();
    db.prepare("INSERT INTO rag_analyses (id, created_at) VALUES ('r1', datetime('now'))").run();

    const findings = await checkLancedbDrift(db, async () => 250);
    expect(findings[0]!.check).toBe("lancedb_rag_count_drift");
    expect(findings[0]!.rowsAffected).toBe(249);
    expect(findings[0]!.action).toBe("flagged");
  });

  it("dataAuditShared: checkToCategory + severityToPriority pure mapping (no db argument at all)", () => {
    expect(checkToCategory("zero_price_rows")).toBe("data_extraction_error");
    expect(checkToCategory("orphan_alerts")).toBe("alert_quality");
    expect(severityToPriority("critical")).toBe("critical");
    expect(severityToPriority("warning")).toBe("medium");
    expect(severityToPriority("info")).toBe("low");
  });
});
