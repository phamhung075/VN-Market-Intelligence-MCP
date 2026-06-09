/**
 * Task 1343a — Watchlist Restore + Q4 2025 Backfill
 *
 * Tests for seedWatchlist() and backfillBctcQ4() against an in-memory SQLite DB.
 *
 * Acceptance criteria:
 *   - watchlist table has exactly 34 rows after seed (HPG 1416c, high-vol 1876a-A6, PLX 1946a)
 *   - All 26 tickers have exchange and domain filled
 *   - Alert thresholds match Sprint 054 defaults (dropPct=-3, risePct=5, impactScore=5)
 *   - seedWatchlist is idempotent (calling twice still yields 34 rows)
 *   - backfillBctcQ4 enqueues all watchlist tickers missing Q4 2025 financial_reports
 *   - backfillBctcQ4 skips tickers that already have a Q4 2025 financial_report row
 *   - backfillBctcQ4 is idempotent (calling twice keeps same queue count)
 *   - All enqueued queue entries have status='pending' and attempts=0
 *   - sector distribution: 13 distinct domains covered (incl. chemicals/retail from 1876a-A6)
 *   - HOSE / UPCOM / HNX exchanges present in seed data (VNH=HNX added 1876a-A6)
 *   - validateSeedTickers warns when seeded tickers have no market_prices row
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  seedWatchlist,
  backfillBctcQ4,
  validateSeedTickers,
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

  it("WATCHLIST_SEED contains exactly 34 entries (HPG added 1416c, 7 high-vol 1876a-A6, PLX 1946a)", () => {
    expect(WATCHLIST_SEED).toHaveLength(34);
  });

  it("WATCHLIST_SEED covers 13 expected sectors (agriculture 1787, machinery JANITOR-012, chemicals/retail/real_estate high-vol 1876a-A6)", () => {
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
    // agriculture restored: GVR (Vietnam Rubber Group) correctly classified here (task 1787)
    expect(domains).toContain("agriculture");
    // machinery: DAG = Da Nang Rubber Group — industrial/machinery (JANITOR-012)
    expect(domains).toContain("machinery");
    // high-vol additions (Task 1876a-A6): chemicals + retail sectors
    expect(domains).toContain("chemicals");
    expect(domains).toContain("retail");
    expect(domains.size).toBe(13);
  });

  it("WATCHLIST_SEED has HOSE, UPCOM, and HNX entries (VNH=HNX added Task 1876a-A6)", () => {
    const exchanges = new Set(WATCHLIST_SEED.map((e) => e.exchange));
    expect(exchanges).toContain("HOSE");
    expect(exchanges).toContain("UPCOM");
    // VNH (HNX real_estate, high-vol) added in Task 1876a-A6
    expect(exchanges).toContain("HNX");
  });

  // ── seedWatchlist ──────────────────────────────────────────────────────────

  it("seedWatchlist inserts exactly 34 rows into watchlist (HPG 1416c, 7 high-vol 1876a-A6, PLX 1946a)", () => {
    seedWatchlist(db);
    const { cnt } = db.prepare("SELECT COUNT(*) AS cnt FROM watchlist").get() as { cnt: number };
    expect(cnt).toBe(34);
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

    expect(rows).toHaveLength(34);
    for (const row of rows) {
      expect(row.exchange).toBeTruthy();
      expect(row.domain).toBeTruthy();
      expect(row.domain).not.toBe("other");
    }
  });

  it("seedWatchlist is idempotent: calling twice still yields 34 rows", () => {
    seedWatchlist(db);
    seedWatchlist(db);
    const { cnt } = db.prepare("SELECT COUNT(*) AS cnt FROM watchlist").get() as { cnt: number };
    expect(cnt).toBe(34);
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
    expect(codes).toContain("DHG");   // pharma
    // Invalid tickers removed: VDC, BDI, DLC, JSH, SIS
    expect(codes).not.toContain("VDC");
    expect(codes).not.toContain("BDI");
    expect(codes).not.toContain("DLC");
    expect(codes).not.toContain("JSH");
    expect(codes).not.toContain("SIS");
  });

  // ── backfillBctcQ4 ─────────────────────────────────────────────────────────

  it("backfillBctcQ4 enqueues all 34 tickers when none have Q4 2025 reports (HPG 1416c, high-vol 1876a-A6, PLX 1946a)", () => {
    seedWatchlist(db);
    backfillBctcQ4(db);

    const { cnt } = db
      .prepare("SELECT COUNT(*) AS cnt FROM bctc_vps_queue WHERE period_year = 2025 AND period_quarter = 'Q4'")
      .get() as { cnt: number };
    expect(cnt).toBe(34);
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
    // 34 watchlist - 2 already have reports = 32 enqueued (HPG 1416c, high-vol 1876a-A6, PLX 1946a)
    expect(cnt).toBe(32);

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
    expect(cnt).toBe(34);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateSeedTickers
// ─────────────────────────────────────────────────────────────────────────────

describe("Task stale-tickers — validateSeedTickers startup check", () => {
  let db: Database;

  beforeEach(() => {
    // Minimal schema: watchlist + market_prices
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE watchlist (
        code TEXT PRIMARY KEY,
        exchange TEXT NOT NULL,
        domain TEXT NOT NULL DEFAULT 'other',
        notes TEXT,
        added_at TEXT NOT NULL DEFAULT (datetime('now')),
        alert_drop_pct REAL NOT NULL DEFAULT -3,
        alert_rise_pct REAL NOT NULL DEFAULT 5,
        alert_impact_min REAL NOT NULL DEFAULT 7,
        alert_report_new INTEGER NOT NULL DEFAULT 1
      )
    `);
    db.exec(`
      CREATE TABLE IF NOT EXISTS market_prices (
        code TEXT PRIMARY KEY,
        price REAL,
        change_pct REAL,
        volume INTEGER,
        updated_at TEXT,
        exchange TEXT
      )
    `);
  });

  it("does not warn when all seeded tickers have market_prices rows", () => {
    seedWatchlist(db);
    // Insert a market_prices row for every seeded ticker
    for (const entry of WATCHLIST_SEED) {
      db.prepare(
        "INSERT INTO market_prices (code, price, change_pct, volume, updated_at, exchange) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(entry.code, 50000, 0, 1000000, new Date().toISOString(), entry.exchange);
    }
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => warnings.push(String(args[0]));
    validateSeedTickers(db);
    console.warn = original;

    expect(warnings.length).toBe(0);
  });

  it("warns when seeded tickers have no market_prices data", () => {
    seedWatchlist(db);
    // No market_prices rows inserted — all 25 are missing
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => warnings.push(String(args[0]));
    validateSeedTickers(db);
    console.warn = original;

    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("34 seeded ticker(s) have no market_prices data");
    expect(warnings[0]).toContain("possible delisted/inactive");
  });

  it("warns only for the specific tickers missing prices (partial case)", () => {
    seedWatchlist(db);
    // Only VCB and FPT have prices
    for (const code of ["VCB", "FPT"]) {
      db.prepare(
        "INSERT INTO market_prices (code, price, change_pct, volume, updated_at, exchange) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(code, 50000, 0, 1000000, new Date().toISOString(), "HOSE");
    }
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => warnings.push(String(args[0]));
    validateSeedTickers(db);
    console.warn = original;

    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("32 seeded ticker(s) have no market_prices data");
    expect(warnings[0]).not.toContain("VCB");
    expect(warnings[0]).not.toContain("FPT");
  });
});
