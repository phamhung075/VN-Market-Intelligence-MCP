Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 105 — Evening Summary Job (22:00 GMT+7)
 *
 * Tests for:
 *   - assembleEveningSummary returns a valid EveningSummary structure on empty DB
 *   - date field matches today's date in Vietnam timezone
 *   - topStories pulled from rag_analyses since midnight (impact_score DESC, limit 5)
 *   - topAlerts populated from alerts table (last 24h, severity sorted DESC)
 *   - alertsSummary / topAlerts counts by severity
 *   - watchlistMovers from watchlist + market_prices join (|changePct| >= 1.0)
 *   - Summary persisted to correct file path (reports/YYYY-MM-DD-evening.json)
 *   - Cron registered at 0 22 * * 1-5 pattern in CRONS object
 *   - Concurrency guard: overlapping invocation is skipped
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { VN_OFFSET_MS } from "../domain/services/timeConstants.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test DB helpers
// ─────────────────────────────────────────────────────────────────────────────

function setupTestDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code              TEXT PRIMARY KEY,
      company_name      TEXT,
      exchange          TEXT NOT NULL DEFAULT 'HOSE',
      domain            TEXT NOT NULL DEFAULT 'other',
      notes             TEXT,
      added_at          TEXT NOT NULL DEFAULT (datetime('now')),
      alert_drop_pct    REAL NOT NULL DEFAULT -3,
      alert_rise_pct    REAL NOT NULL DEFAULT 5,
      alert_impact_min  REAL NOT NULL DEFAULT 7,
      alert_report_new  INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS market_prices (
      code        TEXT PRIMARY KEY,
      price       REAL,
      change_amt  REAL,
      change_pct  REAL,
      volume      REAL,
      updated_at  TEXT
    );

    CREATE TABLE IF NOT EXISTS rag_analyses (
      id                 TEXT PRIMARY KEY,
      created_at         TEXT NOT NULL,
      level              TEXT NOT NULL,
      source_url         TEXT,
      source_title       TEXT,
      source_type        TEXT,
      published_at       TEXT,
      sentiment          TEXT,
      impact_score       REAL,
      impact_direction   TEXT,
      confidence         REAL,
      time_horizon       TEXT,
      summary            TEXT,
      reasoning          TEXT,
      affected_countries TEXT,
      affected_domains   TEXT,
      affected_actions   TEXT,
      parent_ids         TEXT,
      tags               TEXT,
      embedding_text     TEXT
    );

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
      resolved_at           TEXT,
      resolution_notes      TEXT,
      sent_by               TEXT NOT NULL DEFAULT 'server',
      confidence_score      REAL,
      validated_at          TEXT
    );

    CREATE TABLE IF NOT EXISTS financial_reports (
      id              TEXT PRIMARY KEY,
      action_code     TEXT NOT NULL,
      company_name    TEXT,
      exchange        TEXT,
      domain          TEXT,
      period_year     INTEGER,
      period_type     TEXT,
      period_start    TEXT,
      period_end      TEXT,
      sort_key        TEXT,
      ssc_url         TEXT,
      parsed_at       TEXT,
      balance_sheet_json  TEXT DEFAULT '{}',
      income_stmt_json    TEXT DEFAULT '{}',
      cash_flow_json      TEXT DEFAULT '{}',
      ratios_json         TEXT DEFAULT '{}'
    );
  `);

  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// Temp output directory
// ─────────────────────────────────────────────────────────────────────────────

const TEST_REPORTS_DIR = join(process.cwd(), "data", "__test-evening-105__");

function cleanupReportsDir() {
  if (existsSync(TEST_REPORTS_DIR)) {
    rmSync(TEST_REPORTS_DIR, { recursive: true, force: true });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers: midnight Vietnam time
// ─────────────────────────────────────────────────────────────────────────────

function midnightVietnamUtc(): string {
  const now = new Date();
  const vnNow = new Date(now.getTime() + VN_OFFSET_MS);
  const midnight = new Date(
    Date.UTC(
      vnNow.getUTCFullYear(),
      vnNow.getUTCMonth(),
      vnNow.getUTCDate(),
      0,
      0,
      0,
      0,
    ) -
      VN_OFFSET_MS,
  );
  return midnight.toISOString();
}

function todayVietnam(): string {
  const vnNow = new Date(new Date().getTime() + VN_OFFSET_MS);
  const y = vnNow.getUTCFullYear();
  const m = String(vnNow.getUTCMonth() + 1).padStart(2, "0");
  const d = String(vnNow.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers: seed rows
// ─────────────────────────────────────────────────────────────────────────────

function seedRagAnalysis(
  db: Database,
  overrides: Partial<{
    id: string;
    created_at: string;
    impact_score: number;
    level: string;
    source_title: string;
    sentiment: string;
  }> = {},
) {
  const row = {
    id: overrides.id ?? `ra-${Date.now()}-${Math.random()}`,
    created_at: overrides.created_at ?? new Date().toISOString(),
    level: overrides.level ?? "country",
    source_title: overrides.source_title ?? "Test story",
    sentiment: overrides.sentiment ?? "bullish",
    impact_score: overrides.impact_score ?? 7.5,
  };
  db.prepare(`
    INSERT OR IGNORE INTO rag_analyses
      (id, created_at, level, source_title, sentiment, impact_score)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(row.id, row.created_at, row.level, row.source_title, row.sentiment, row.impact_score);
  return row;
}

function seedAlert(
  db: Database,
  overrides: Partial<{
    id: string;
    triggered_at: string;
    severity: string;
    message: string;
    affected_actions_json: string;
  }> = {},
) {
  const row = {
    id: overrides.id ?? `alert-${Date.now()}-${Math.random()}`,
    triggered_at: overrides.triggered_at ?? new Date().toISOString(),
    severity: overrides.severity ?? "info",
    message: overrides.message ?? "Test alert",
    affected_actions_json: overrides.affected_actions_json ?? "[]",
  };
  db.prepare(`
    INSERT OR IGNORE INTO alerts
      (id, triggered_at, severity, message, affected_actions_json)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    row.id,
    row.triggered_at,
    row.severity,
    row.message,
    row.affected_actions_json,
  );
  return row;
}

function seedWatchlist(db: Database, code: string, exchange = "HOSE") {
  db.prepare(`
    INSERT OR IGNORE INTO watchlist (code, exchange, domain, added_at)
    VALUES (?, ?, 'banking', ?)
  `).run(code, exchange, new Date().toISOString());
}

function seedMarketPrice(
  db: Database,
  code: string,
  price: number,
  changePct: number,
) {
  db.prepare(`
    INSERT OR REPLACE INTO market_prices (code, price, change_pct, updated_at)
    VALUES (?, ?, ?, ?)
  `).run(code, price, changePct, new Date().toISOString());
}

// ─────────────────────────────────────────────────────────────────────────────
// Import under test
// ─────────────────────────────────────────────────────────────────────────────

import { assembleEveningSummary } from "../application/usecases/assembleEveningSummary.js";
import type { EveningSummary } from "../application/usecases/assembleEveningSummary.js";
import { CRONS } from "../scheduler/jobs.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 105 — Evening Summary Job", () => {
  let db: Database;

  beforeEach(() => {
    db = setupTestDb();
    mkdirSync(TEST_REPORTS_DIR, { recursive: true });
  });

  afterEach(() => {
    db.close();
    cleanupReportsDir();
  });

  // ── Test 1: Valid structure on empty DB ────────────────────────────────────
  it("returns a valid EveningSummary structure on empty DB", async () => {
    const summary = await assembleEveningSummary({
      db,
      reportsDir: TEST_REPORTS_DIR,
    });

    expect(summary).toBeDefined();
    expect(typeof summary.date).toBe("string");
    expect(summary.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Array.isArray(summary.topStories)).toBe(true);
    expect(Array.isArray(summary.topAlerts)).toBe(true);
    expect(Array.isArray(summary.watchlistMovers)).toBe(true);
    expect(typeof summary.generatedAt).toBe("string");
    expect(summary.topStories.length).toBe(0);
    expect(summary.topAlerts.length).toBe(0);
    expect(summary.watchlistMovers.length).toBe(0);
  });

  // ── Test 2: date matches Vietnam timezone ──────────────────────────────────
  it("date field matches today in Vietnam timezone", async () => {
    const summary = await assembleEveningSummary({
      db,
      reportsDir: TEST_REPORTS_DIR,
    });

    const expected = todayVietnam();
    expect(summary.date).toBe(expected);
  });

  // ── Test 3: topStories populated from rag_analyses ────────────────────────
  it("topStories populated from rag_analyses since midnight, sorted by impact_score DESC", async () => {
    const midnight = midnightVietnamUtc();

    // Insert 3 stories today (after midnight)
    const after = new Date(new Date(midnight).getTime() + 60_000).toISOString();
    seedRagAnalysis(db, { id: "ra-1", created_at: after, impact_score: 9.0, source_title: "High impact" });
    seedRagAnalysis(db, { id: "ra-2", created_at: after, impact_score: 5.0, source_title: "Medium impact" });
    seedRagAnalysis(db, { id: "ra-3", created_at: after, impact_score: 7.0, source_title: "Good impact" });

    // Insert 1 story BEFORE midnight (should be excluded)
    const before = new Date(new Date(midnight).getTime() - 60_000).toISOString();
    seedRagAnalysis(db, { id: "ra-old", created_at: before, impact_score: 10.0, source_title: "Old story" });

    const summary = await assembleEveningSummary({ db, reportsDir: TEST_REPORTS_DIR });

    expect(summary.topStories.length).toBe(3);
    expect(summary.topStories[0]!.title).toBe("High impact");
    expect(summary.topStories[0]!.impactScore).toBe(9.0);
    expect(summary.topStories[1]!.impactScore).toBe(7.0);
    expect(summary.topStories[2]!.impactScore).toBe(5.0);
  });

  // ── Test 4: topStories capped at 5 ────────────────────────────────────────
  it("topStories capped at 5 entries", async () => {
    const after = new Date(Date.now() + 1000).toISOString();
    for (let i = 1; i <= 8; i++) {
      seedRagAnalysis(db, {
        id: `ra-many-${i}`,
        created_at: after,
        impact_score: i,
        source_title: `Story ${i}`,
      });
    }

    const summary = await assembleEveningSummary({ db, reportsDir: TEST_REPORTS_DIR });
    expect(summary.topStories.length).toBeLessThanOrEqual(5);
  });

  // ── Test 5: topAlerts counts by severity ──────────────────────────────────
  it("topAlerts populated from last 24h, sorted severity DESC (critical > warning > info)", async () => {
    const recent = new Date(Date.now() - 3600_000).toISOString(); // 1 hour ago

    seedAlert(db, { id: "al-1", triggered_at: recent, severity: "info", message: "Info alert" });
    seedAlert(db, { id: "al-2", triggered_at: recent, severity: "critical", message: "Critical alert" });
    seedAlert(db, { id: "al-3", triggered_at: recent, severity: "warning", message: "Warning alert" });

    // Alert older than 24h — should NOT appear
    const old = new Date(Date.now() - 25 * 3600_000).toISOString();
    seedAlert(db, { id: "al-old", triggered_at: old, severity: "critical", message: "Old alert" });

    const summary = await assembleEveningSummary({ db, reportsDir: TEST_REPORTS_DIR });

    expect(summary.topAlerts.length).toBe(3);
    // First alert should be critical (highest severity)
    expect(summary.topAlerts[0]!.severity).toBe("critical");
    // Last should be info
    expect(summary.topAlerts[summary.topAlerts.length - 1]!.severity).toBe("info");
  });

  // ── Test 6: topAlerts capped at 5 ────────────────────────────────────────
  it("topAlerts capped at 5 entries", async () => {
    const recent = new Date(Date.now() - 1800_000).toISOString();
    for (let i = 1; i <= 8; i++) {
      seedAlert(db, {
        id: `al-cap-${i}`,
        triggered_at: recent,
        severity: "warning",
        message: `Alert ${i}`,
      });
    }

    const summary = await assembleEveningSummary({ db, reportsDir: TEST_REPORTS_DIR });
    expect(summary.topAlerts.length).toBeLessThanOrEqual(5);
  });

  // ── Test 7: watchlistMovers — only |changePct| >= 1.0 ─────────────────────
  it("watchlistMovers includes only stocks with |changePct| >= 1.0", async () => {
    seedWatchlist(db, "VCB");
    seedWatchlist(db, "TCB");
    seedWatchlist(db, "ACB");

    seedMarketPrice(db, "VCB", 90000, 2.5);   // included (>= 1.0)
    seedMarketPrice(db, "TCB", 45000, -1.5);  // included (abs >= 1.0)
    seedMarketPrice(db, "ACB", 22000, 0.5);   // excluded (abs < 1.0)

    const summary = await assembleEveningSummary({ db, reportsDir: TEST_REPORTS_DIR });

    const codes = summary.watchlistMovers.map((m) => m.code);
    expect(codes).toContain("VCB");
    expect(codes).toContain("TCB");
    expect(codes).not.toContain("ACB");
  });

  // ── Test 8: watchlistMovers sorted by |changePct| DESC ────────────────────
  it("watchlistMovers sorted by |changePct| DESC", async () => {
    seedWatchlist(db, "VCB");
    seedWatchlist(db, "TCB");

    seedMarketPrice(db, "VCB", 90000, 1.5);
    seedMarketPrice(db, "TCB", 45000, 3.0);

    const summary = await assembleEveningSummary({ db, reportsDir: TEST_REPORTS_DIR });

    expect(summary.watchlistMovers[0]!.code).toBe("TCB");
    expect(summary.watchlistMovers[1]!.code).toBe("VCB");
  });

  // ── Test 9: Summary persisted to correct file path ────────────────────────
  it("persists summary to reports/YYYY-MM-DD-evening.json", async () => {
    const summary = await assembleEveningSummary({
      db,
      reportsDir: TEST_REPORTS_DIR,
    });

    const expectedPath = join(TEST_REPORTS_DIR, `${summary.date}-evening.json`);
    expect(existsSync(expectedPath)).toBe(true);

    const content = JSON.parse(readFileSync(expectedPath, "utf-8")) as EveningSummary;
    expect(content.date).toBe(summary.date);
    expect(content.generatedAt).toBe(summary.generatedAt);
  });

  // ── Test 10: Cron registered at 30 22 * * 1-5 (rescheduled by task 1186) ─
  it("CRONS.eveningSummary is registered at weekday 22:30 pattern", () => {
    // Rescheduled from 22:00 → 22:30 (task 1186) to avoid race with
    // intelligenceCycleJob which fires at 22:00 and takes ~2 minutes.
    const pattern = CRONS.eveningSummary;
    expect(typeof pattern).toBe("string");
    // Accept both daily (30 22 * * *) and weekday (30 22 * * 1-5) patterns.
    expect(pattern).toMatch(/^30 22 \* \* /);
  });

  // ── Test 11: Concurrency guard ────────────────────────────────────────────
  it("concurrency guard skips second invocation if first is still running", async () => {
    // Import the job module
    const { runEveningSummary } = await import(
      "../scheduler/briefings/eveningSummaryJob.js"
    );

    let callCount = 0;

    // Simulate slow summary function to hold the lock
    const slowSummary = () =>
      new Promise<EveningSummary>((resolve) => {
        callCount++;
        setTimeout(() => {
          resolve({
            date: todayVietnam(),
            topAlerts: [],
            topStories: [],
            watchlistMovers: [],
            predictionSignals: [],
            predictionDiag: { stored: 0 },
            taDiag: { tickersWithSignal: 0, tickersBelowThreshold: 0, ohlcvRowsMin: 0, ohlcvRowsMax: 0 },
            taSummary: [],
            newsCount: 0,
            generatedAt: new Date().toISOString(),
          });
        }, 50);
      });

    // Start two concurrent invocations
    const p1 = runEveningSummary(slowSummary);
    const p2 = runEveningSummary(slowSummary);

    await Promise.all([p1, p2]);

    // Only one invocation should have executed (concurrency guard skips second)
    expect(callCount).toBe(1);
  });

  // ── Test 12: topStory structure fields ────────────────────────────────────
  it("topStory items have required fields", async () => {
    const after = new Date(Date.now() + 1000).toISOString();
    seedRagAnalysis(db, {
      id: "ra-struct",
      created_at: after,
      impact_score: 8.0,
      source_title: "Structure test",
      sentiment: "bullish",
      level: "domain",
    });

    const summary = await assembleEveningSummary({ db, reportsDir: TEST_REPORTS_DIR });

    expect(summary.topStories.length).toBeGreaterThan(0);
    const story = summary.topStories[0]!;
    expect(typeof story.title).toBe("string");
    expect(typeof story.level).toBe("string");
    expect(typeof story.sentiment).toBe("string");
    expect(typeof story.impactScore).toBe("number");
  });

  // ── Test 13: topAlert structure fields ────────────────────────────────────
  it("topAlert items have required fields", async () => {
    const recent = new Date(Date.now() - 1800_000).toISOString();
    seedAlert(db, {
      id: "al-struct",
      triggered_at: recent,
      severity: "warning",
      message: "Test warning",
      affected_actions_json: JSON.stringify([{ code: "VCB", expectedImpact: "up", confidence: 0.8 }]),
    });

    const summary = await assembleEveningSummary({ db, reportsDir: TEST_REPORTS_DIR });

    expect(summary.topAlerts.length).toBeGreaterThan(0);
    const alert = summary.topAlerts[0]!;
    expect(typeof alert.severity).toBe("string");
    expect(typeof alert.message).toBe("string");
    expect(Array.isArray(alert.stocks)).toBe(true);
  });

  // ── Test 14: WatchlistMover structure fields ──────────────────────────────
  it("watchlistMover items have required fields", async () => {
    seedWatchlist(db, "GAS", "HOSE");
    seedMarketPrice(db, "GAS", 80000, -2.0);

    const summary = await assembleEveningSummary({ db, reportsDir: TEST_REPORTS_DIR });

    expect(summary.watchlistMovers.length).toBeGreaterThan(0);
    const mover = summary.watchlistMovers[0]!;
    expect(typeof mover.code).toBe("string");
    expect(typeof mover.changePct).toBe("number");
    expect(typeof mover.price).toBe("number");
    expect(typeof mover.exchange).toBe("string");
  });
});
