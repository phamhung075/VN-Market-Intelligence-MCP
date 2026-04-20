/**
 * Task 1018 — BCTC Overdue Check job (Slice 1: skeleton, no Telegram, no cron)
 *
 * Reads watchlist + financial_reports, classifies each stock for the current
 * statutory deadline, and inserts an alerts row when a filing is overdue by
 * more than `overdueDaysThreshold` days (default 3). Idempotent — re-running
 * the job for the same (stock, deadline, day) does NOT produce duplicate rows.
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";

import { runBctcOverdueCheck } from "../scheduler/financial-reports/bctcOverdueCheckJob.js";
import { readUnnotifiedAlerts } from "../infrastructure/db/alertStore.js";

function buildDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE watchlist (
      code     TEXT PRIMARY KEY,
      exchange TEXT NOT NULL DEFAULT 'HOSE',
      domain   TEXT NOT NULL DEFAULT 'general'
    );
    CREATE TABLE financial_reports (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      action_code     TEXT NOT NULL,
      period_year     INTEGER NOT NULL,
      period_quarter  INTEGER,
      published_at    TEXT
    );
    CREATE TABLE alerts (
      id                    TEXT PRIMARY KEY,
      triggered_at          TEXT NOT NULL,
      severity              TEXT NOT NULL,
      signals_json          TEXT,
      affected_actions_json TEXT,
      analysis_ids_json     TEXT,
      message               TEXT,
      read                  INTEGER NOT NULL DEFAULT 0,
      user_note             TEXT,
      notified_telegram     INTEGER NOT NULL DEFAULT 0
    );
  `);
  return db;
}

describe("runBctcOverdueCheck (Task 1018 slice 1)", () => {
  let db: Database;

  beforeEach(() => {
    db = buildDb();
  });

  it("inserts an alert for a stock 5 days overdue with no filing", async () => {
    db.run("INSERT INTO watchlist (code, domain) VALUES ('FPT', 'general')");

    // Q4-2025 deadline: 2026-03-31. today = 2026-04-05 → 5 days overdue
    const result = await runBctcOverdueCheck({
      db,
      now: new Date("2026-04-05T03:00:00Z"),
    });

    expect(result.alertsInserted).toBe(1);
    const rows = db
      .query<{ id: string; severity: string; message: string }, []>(
        "SELECT id, severity, message FROM alerts",
      )
      .all();
    expect(rows.length).toBe(1);
    expect(rows[0]!.severity).toBe("high");
    expect(rows[0]!.message).toContain("FPT");
    expect(rows[0]!.message).toContain("Q4-2025");
    // Batch alert — single id for all overdue tickers
    expect(rows[0]!.id).toMatch(/^bctc-overdue:batch:2025:Q4:/);
  });

  it("slice 2 wire-up: inserted alert flows through readUnnotifiedAlerts", async () => {
    db.run("INSERT INTO watchlist (code, domain) VALUES ('FPT', 'general')");

    await runBctcOverdueCheck({
      db,
      now: new Date("2026-04-05T03:00:00Z"),
    });

    // readUnnotifiedAlerts only returns severity IN ('high','critical') AND
    // notified_telegram = 0. The bctc-overdue alert MUST satisfy both so it
    // is dispatched by the existing Alert Commander pipeline.
    // Use a generous window — fixture date may be far in the past relative to
    // wall-clock now; wire-up correctness is what we're proving here.
    const unnotified = readUnnotifiedAlerts(60 * 24 * 365 * 100, db);
    expect(unnotified.length).toBe(1);
    expect(unnotified[0]!.id).toMatch(/^bctc-overdue:batch:2025:Q4:/);
  });

  it("does NOT alert when overdue by less than the threshold (default 3 days)", async () => {
    db.run("INSERT INTO watchlist (code, domain) VALUES ('VCB', 'banking')");

    // VCB banking → Q4-2025 deadline = 2026-04-15. today = 2026-04-16 → 1 day overdue
    const result = await runBctcOverdueCheck({
      db,
      now: new Date("2026-04-16T03:00:00Z"),
    });

    expect(result.alertsInserted).toBe(0);
    expect(db.query("SELECT COUNT(*) AS c FROM alerts").get()).toEqual({ c: 0 });
  });

  it("does NOT alert when the filing already exists (DA_NOP)", async () => {
    db.run("INSERT INTO watchlist (code, domain) VALUES ('VNM', 'general')");
    db.run(
      "INSERT INTO financial_reports (action_code, period_year, period_quarter, published_at) VALUES ('VNM', 2025, 4, '2026-03-15T00:00:00Z')",
    );

    const result = await runBctcOverdueCheck({
      db,
      now: new Date("2026-04-10T03:00:00Z"),
    });

    expect(result.alertsInserted).toBe(0);
  });

  it("is idempotent — running twice in the same UTC day does not duplicate alerts", async () => {
    db.run("INSERT INTO watchlist (code, domain) VALUES ('FPT', 'general')");

    const now = new Date("2026-04-05T03:00:00Z");
    const first = await runBctcOverdueCheck({ db, now });
    const second = await runBctcOverdueCheck({ db, now });

    expect(first.alertsInserted).toBe(1);
    expect(second.alertsInserted).toBe(0);
    expect(
      (db.query<{ c: number }, []>("SELECT COUNT(*) AS c FROM alerts").get())!.c,
    ).toBe(1);
  });

  it("batches multiple overdue tickers into ONE alert (anti-spam — user feedback 2026-04-10)", async () => {
    // Add 5 stocks to the watchlist, all general domain
    for (const code of ["FPT", "VCB", "HPG", "VNM", "SSI"]) {
      db.run(`INSERT INTO watchlist (code, domain) VALUES ('${code}', 'general')`);
    }
    // VNM has a filing → not overdue. Others do not.
    db.run(
      "INSERT INTO financial_reports (action_code, period_year, period_quarter, published_at) VALUES ('VNM', 2025, 4, '2026-03-15T00:00:00Z')",
    );

    const result = await runBctcOverdueCheck({
      db,
      now: new Date("2026-04-05T03:00:00Z"),
    });

    // 4 overdue (VNM has filing), but only 1 batch alert
    expect(result.overdueFound).toBe(4);
    expect(result.alertsInserted).toBe(1);

    const rows = db.query<{ id: string; message: string; affected_actions_json: string }, []>(
      "SELECT id, message, affected_actions_json FROM alerts",
    ).all();
    expect(rows.length).toBe(1);
    expect(rows[0]!.id).toMatch(/^bctc-overdue:batch:/);
    // Message should mention all 4 tickers
    expect(rows[0]!.message).toContain("4 stocks");
    for (const code of ["FPT", "HPG", "SSI"]) {
      expect(rows[0]!.message).toContain(code);
    }
    // affected_actions_json should have all 4
    const affected = JSON.parse(rows[0]!.affected_actions_json) as Array<{ code: string }>;
    expect(affected.length).toBe(4);
  });

  it("respects a custom overdueDaysThreshold", async () => {
    db.run("INSERT INTO watchlist (code, domain) VALUES ('FPT', 'general')");

    // 2 days overdue, threshold=1 → should alert
    const result = await runBctcOverdueCheck({
      db,
      now: new Date("2026-04-02T03:00:00Z"),
      overdueDaysThreshold: 1,
    });

    expect(result.alertsInserted).toBe(1);
  });

  it("Task 1467 — weekly dedup: same alert does NOT re-fire on a different day within the same 7-day window", async () => {
    db.run("INSERT INTO watchlist (code, domain) VALUES ('FPT', 'general')");

    // Day 1: alert fires (FPT overdue Q4-2025, now=2026-04-05 Sun)
    const day1 = new Date("2026-04-05T03:00:00Z");
    const first = await runBctcOverdueCheck({ db, now: day1 });
    expect(first.alertsInserted).toBe(1);

    // Day 2 (next day, same ISO week): alert must NOT fire again
    const day2 = new Date("2026-04-06T03:00:00Z");
    const second = await runBctcOverdueCheck({ db, now: day2 });
    expect(second.alertsInserted).toBe(0);

    // Only 1 alert row total
    expect(
      (db.query<{ c: number }, []>("SELECT COUNT(*) AS c FROM alerts").get())!.c,
    ).toBe(1);

    // Day 8 (next 7-day epoch): alert fires again
    const day8 = new Date("2026-04-12T03:00:00Z");
    const third = await runBctcOverdueCheck({ db, now: day8 });
    expect(third.alertsInserted).toBe(1);

    expect(
      (db.query<{ c: number }, []>("SELECT COUNT(*) AS c FROM alerts").get())!.c,
    ).toBe(2);
  });
});
