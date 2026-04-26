/**
 * Task 1343a — Watchlist Restore + Q4 2025 Backfill
 *
 * Tests for seedWatchlist() and backfillBctcQ4() against an in-memory SQLite DB.
 *
 * Acceptance criteria:
 *   - watchlist table has exactly 30 rows after seed
 *   - All 30 tickers have exchange and domain filled
 *   - Alert thresholds match Sprint 054 defaults (dropPct=-3, risePct=5, impactScore=5)
 *   - seedWatchlist is idempotent (calling twice still yields 30 rows)
 *   - backfillBctcQ4 enqueues all watchlist tickers missing Q4 2025 financial_reports
 *   - backfillBctcQ4 skips tickers that already have a Q4 2025 financial_report row
 *   - backfillBctcQ4 is idempotent (calling twice keeps same queue count)
 *   - All enqueued queue entries have status='pending' and attempts=0
 *   - sector distribution: 10 distinct domains covered
 *   - HOSE / HNX / UPCOM exchanges present in seed data
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  seedWatchlist,
  backfillBctcQ4,
  WATCHLIST_SEED,
} from "../infrastructure/db/seedWatchlist.js";

// ─────────────────────────────────────────────────────────────────────────────
// Minimal DDL — mirrors production schema for the two tables under test
// ─────────────────────────────────────────────────────────────────────────────

function createTestDb(): Database {
  const db = new Database(":memory:");

  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code             TEXT PRIMARY KEY,
      exchange         TEXT NOT NULL,
      domain           TEXT NOT NULL DEFAULT 'other',
      notes            TEXT,
      added_at         TEXT NOT NULL DEFAULT (datetime('now')),
      alert_drop_pct   REAL NOT NULL DEFAULT -3,
      alert_rise_pct   REAL NOT NULL DEFAULT 5,
      alert_impact_min REAL NOT NULL DEFAULT 7,
      alert_report_new INTEGER NOT NULL DEFAULT 1
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS financial_reports (
      id           TEXT PRIMARY KEY,
      action_code  TEXT NOT NULL,
      period_year  INTEGER NOT NULL,
      period_type  TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS bctc_vps_queue (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      action_code    TEXT    NOT NULL,
      period_year    INTEGER NOT NULL,
      period_quarter TEXT    NOT NULL,
      status         TEXT    NOT NULL DEFAULT 'pending',
      source_url     TEXT,
      attempts       INTEGER NOT NULL DEFAULT 0,
      last_attempt   TEXT,
      created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(action_code, period_year, period_quarter)
    )
  `);

  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1343a — Watchlist Restore + Q4 2025 Backfill", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
  });

  // ── WATCHLIST_SEED constant ────────────────────────────────────────────────

  it("WATCHLIST_SEED contains exactly 30 entries", () => {
    expect(WATCHLIST_SEED).toHaveLength(30);
  });

  it("WATCHLIST_SEED covers all 10 expected sectors", () => {
    const domains = new Set(WATCHLIST_SEED.map((e) => e.domain));
    expect(domains).toContain("oil_gas");
    expect(domains).toContain("banking");
    expect(domains).toContain("real_estate");
    expect(domains).toContain("steel");
    expect(domains).toContain("aviation");
    expect(domains).toContain("tech");
    expect(domains).toContain("securities");
    expect(domains).toContain("pharma");
    expect(domains).toContain("utilities");
    expect(domains).toContain("agriculture");
    expect(domains.size).toBe(10);
  });

  it("WATCHLIST_SEED has HOSE, HNX and UPCOM entries", () => {
    const exchanges = new Set(WATCHLIST_SEED.map((e) => e.exchange));
    expect(exchanges).toContain("HOSE");
    expect(exchanges).toContain("HNX");
    expect(exchanges).toContain("UPCOM");
  });

  // ── seedWatchlist ──────────────────────────────────────────────────────────

  it("seedWatchlist inserts exactly 30 rows into watchlist", () => {
    seedWatchlist(db);
    const { cnt } = db.prepare("SELECT COUNT(*) AS cnt FROM watchlist").get() as { cnt: number };
    expect(cnt).toBe(30);
  });

  it("seedWatchlist sets default thresholds: drop=-3, rise=5, impact=5", () => {
    seedWatchlist(db);
    const rows = db
      .prepare("SELECT alert_drop_pct, alert_rise_pct, alert_impact_min FROM watchlist")
      .all() as { alert_drop_pct: number; alert_rise_pct: number; alert_impact_min: number }[];

    for (const row of rows) {
      expect(row.alert_drop_pct).toBe(-3);
      expect(row.alert_rise_pct).toBe(5);
      expect(row.alert_impact_min).toBe(5);
    }
  });

  it("seedWatchlist sets exchange and domain on every row", () => {
    seedWatchlist(db);
    const rows = db
      .prepare("SELECT code, exchange, domain FROM watchlist")
      .all() as { code: string; exchange: string; domain: string }[];

    expect(rows).toHaveLength(30);
    for (const row of rows) {
      expect(row.exchange).toBeTruthy();
      expect(row.domain).toBeTruthy();
      expect(row.domain).not.toBe("other");
    }
  });

  it("seedWatchlist is idempotent: calling twice still yields 30 rows", () => {
    seedWatchlist(db);
    seedWatchlist(db);
    const { cnt } = db.prepare("SELECT COUNT(*) AS cnt FROM watchlist").get() as { cnt: number };
    expect(cnt).toBe(30);
  });

  it("seedWatchlist includes expected tickers from each sector", () => {
    seedWatchlist(db);
    const codes = new Set(
      (db.prepare("SELECT code FROM watchlist").all() as { code: string }[]).map((r) => r.code),
    );

    // Spot-check one per sector
    expect(codes).toContain("GAS");   // oil_gas
    expect(codes).toContain("VCB");   // banking
    expect(codes).toContain("VIC");   // real_estate
    expect(codes).toContain("HSG");   // steel
    expect(codes).toContain("HVN");   // aviation
    expect(codes).toContain("FPT");   // tech
    expect(codes).toContain("SSI");   // securities
    expect(codes).toContain("POW");   // utilities
    expect(codes).toContain("BDI");   // agriculture
  });

  // ── backfillBctcQ4 ─────────────────────────────────────────────────────────

  it("backfillBctcQ4 enqueues all 30 tickers when none have Q4 2025 reports", () => {
    seedWatchlist(db);
    backfillBctcQ4(db);

    const { cnt } = db
      .prepare("SELECT COUNT(*) AS cnt FROM bctc_vps_queue WHERE period_year = 2025 AND period_quarter = 'Q4'")
      .get() as { cnt: number };
    expect(cnt).toBe(30);
  });

  it("backfillBctcQ4 skips tickers that already have a Q4 2025 financial_report", () => {
    seedWatchlist(db);

    // Pre-populate FPT and VCB as already having Q4 2025 reports
    db.prepare(
      "INSERT INTO financial_reports (id, action_code, period_year, period_type) VALUES (?, ?, ?, ?)",
    ).run("fpt-2025-q4", "FPT", 2025, "Q4");
    db.prepare(
      "INSERT INTO financial_reports (id, action_code, period_year, period_type) VALUES (?, ?, ?, ?)",
    ).run("vcb-2025-q4", "VCB", 2025, "Q4");

    backfillBctcQ4(db);

    const { cnt } = db
      .prepare("SELECT COUNT(*) AS cnt FROM bctc_vps_queue WHERE period_year = 2025 AND period_quarter = 'Q4'")
      .get() as { cnt: number };
    // 30 watchlist - 2 already have reports = 28 enqueued
    expect(cnt).toBe(28);

    // FPT and VCB must NOT be in the queue
    const fptRow = db
      .prepare("SELECT * FROM bctc_vps_queue WHERE action_code = 'FPT' AND period_quarter = 'Q4'")
      .get();
    expect(fptRow).toBeNull();

    const vcbRow = db
      .prepare("SELECT * FROM bctc_vps_queue WHERE action_code = 'VCB' AND period_quarter = 'Q4'")
      .get();
    expect(vcbRow).toBeNull();
  });

  it("backfillBctcQ4 sets status=pending and attempts=0 on all enqueued rows", () => {
    seedWatchlist(db);
    backfillBctcQ4(db);

    const rows = db
      .prepare("SELECT status, attempts FROM bctc_vps_queue WHERE period_year = 2025 AND period_quarter = 'Q4'")
      .all() as { status: string; attempts: number }[];

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.status).toBe("pending");
      expect(row.attempts).toBe(0);
    }
  });

  it("backfillBctcQ4 is idempotent: calling twice keeps same queue count", () => {
    seedWatchlist(db);
    backfillBctcQ4(db);
    backfillBctcQ4(db);

    const { cnt } = db
      .prepare("SELECT COUNT(*) AS cnt FROM bctc_vps_queue WHERE period_year = 2025 AND period_quarter = 'Q4'")
      .get() as { cnt: number };
    expect(cnt).toBe(30);
  });
});
