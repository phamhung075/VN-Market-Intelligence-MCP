/**
 * DPI-FU-A — EFFR Staleness Fail-Loud Alert Tests
 *
 * Covers `checkAndAlertEffrStaleness` exported from macroIndicatorRefreshJob.ts.
 *
 * Root cause context:
 *   FRED (fred.stlouisfed.org) is unreachable from inside the Docker container
 *   (connection timeout). `fetchFredEffrIorb` returns null on every daily run;
 *   the fetcher uses INSERT OR IGNORE so the max(date) in fred_series_daily
 *   for EFFR never advances. This function detects that staleness and alerts
 *   the WORK channel — fail-loud instead of silent WARN log.
 *
 * Tests:
 *   T1 — fresh EFFR (within 96h) → no alert
 *   T2 — stale EFFR (>96h) → alert fired with expected message
 *   T3 — no EFFR rows at all → alert fired (never fetched)
 *   T4 — DB query error → no throw, function is non-fatal
 *
 * @module __tests__/DPI-FU-A-effr-staleness-alert
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { checkAndAlertEffrStaleness, EFFR_STALE_BOUND_MS } from "../scheduler/macro/macroIndicatorRefreshJob.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ── DDL ────────────────────────────────────────────────────────────────────────

function buildDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS fred_series_daily (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      series     TEXT NOT NULL,
      date       TEXT NOT NULL,
      value      REAL NOT NULL,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (series, date)
    );
  `);
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function insertEffrRow(db: Database, date: string, value = 4.33): void {
  db.prepare(
    `INSERT OR IGNORE INTO fred_series_daily (series, date, value) VALUES ('EFFR', ?, ?)`
  ).run(date, value);
}

function dateMinusDays(daysAgo: number): string {
  const d = new Date(Date.now() - daysAgo * 86_400_000);
  return d.toISOString().slice(0, 10);
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("DPI-FU-A — checkAndAlertEffrStaleness: fail-loud on EFFR staleness", () => {
  let db: Database;
  const alerts: string[] = [];
  let sendWorkFn: (msg: string) => Promise<unknown>;

  beforeEach(() => {
    db = buildDb();
    alerts.length = 0;
    sendWorkFn = async (msg: string) => { alerts.push(msg); };
  });

  afterEach(() => {
    db.close();
  });

  // T1: fresh EFFR — no alert
  it("T1: EFFR within 96h staleness bound → no alert sent", async () => {
    // Insert a row from 1 day ago (well within 96h)
    insertEffrRow(db, dateMinusDays(1));

    const nowMs = Date.now();
    await checkAndAlertEffrStaleness(db, nowMs, sendWorkFn);

    expect(alerts.length).toBe(0);
  });

  // T1b: EFFR from 3 days ago (within 96h = 4 days) → no alert
  it("T1b: EFFR 3 days old (within 96h / 4 days) → no alert", async () => {
    // 3 days = 72h < 96h → fresh
    insertEffrRow(db, dateMinusDays(3));

    const nowMs = Date.now();
    await checkAndAlertEffrStaleness(db, nowMs, sendWorkFn);

    expect(alerts.length).toBe(0);
  });

  // T2: stale EFFR (>96h) → alert fired
  it("T2: EFFR older than 96h → alert fired to WORK channel", async () => {
    // Insert a row from 5 days ago (>96h = >4 days)
    const staleDate = dateMinusDays(5);
    insertEffrRow(db, staleDate);

    const nowMs = Date.now();
    await checkAndAlertEffrStaleness(db, nowMs, sendWorkFn);

    expect(alerts.length).toBe(1);
    expect(alerts[0]).toContain("DPI-FU-A");
    expect(alerts[0]).toContain("EFFR STALE ALERT");
    expect(alerts[0]).toContain(staleDate);
    expect(alerts[0]).toContain("fred.stlouisfed.org");
  });

  // T2b: 16 days stale (current production state ~2026-05-14 → 2026-05-30)
  it("T2b: EFFR 16 days stale (production scenario) → alert contains day count", async () => {
    const staleDate = dateMinusDays(16);
    insertEffrRow(db, staleDate);

    const nowMs = Date.now();
    await checkAndAlertEffrStaleness(db, nowMs, sendWorkFn);

    expect(alerts.length).toBe(1);
    // Alert should mention the stale date
    expect(alerts[0]).toContain(staleDate);
    // Alert should mention "d ago" (days ago label)
    expect(alerts[0]).toMatch(/\d+\.\d+d ago/);
  });

  // T3: no EFFR rows at all → alert fired
  it("T3: no EFFR rows in fred_series_daily → alert fired (never fetched)", async () => {
    // Empty table — no rows inserted

    const nowMs = Date.now();
    await checkAndAlertEffrStaleness(db, nowMs, sendWorkFn);

    expect(alerts.length).toBe(1);
    expect(alerts[0]).toContain("DPI-FU-A");
    expect(alerts[0]).toContain("zero EFFR rows");
  });

  // T4: DB query error → non-fatal, no throw
  it("T4: DB query error → function does not throw (non-fatal)", async () => {
    // Use a closed DB to cause a query error
    db.close();
    const closedDb = db; // already closed

    await expect(
      checkAndAlertEffrStaleness(closedDb, Date.now(), sendWorkFn)
    ).resolves.toBeUndefined();
  });

  // T5: EFFR 97h stale (just over 96h boundary) → alert
  it("T5: EFFR 97h stale (just over 96h) → alert fired", async () => {
    const nowMs = Date.now();
    // Insert a row 97h ago
    const staleMs = nowMs - (EFFR_STALE_BOUND_MS + 60 * 60 * 1000); // 97h ago
    const staleDate = new Date(staleMs).toISOString().slice(0, 10);
    insertEffrRow(db, staleDate);

    await checkAndAlertEffrStaleness(db, nowMs, sendWorkFn);

    expect(alerts.length).toBe(1);
    expect(alerts[0]).toContain("EFFR STALE ALERT");
  });
});
