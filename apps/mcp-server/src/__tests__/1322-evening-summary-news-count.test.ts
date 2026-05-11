/**
 * Task 1322 — Evening Summary: newsCount diagnostic field
 * Task 1323 — Evening Summary Formatter: show "(N tin tức hôm nay)"
 *
 * Acceptance criteria:
 *   AC-1: newsCount = 3 when 3 rag_analyses rows exist since midnight VN time
 *   AC-2: newsCount = 0 when no rows since midnight VN time
 *   AC-3: Telegram message includes "(3 tin tức hôm nay)" when count > 0
 *   AC-4: Telegram message shows "Không có tin tức hôm nay" when count = 0
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { VN_OFFSET_MS } from "../domain/services/timeConstants.js";
import {
  assembleEveningSummary,
} from "../application/usecases/assembleEveningSummary.js";
import type { EveningSummary } from "../application/usecases/assembleEveningSummary.js";
import { runEveningSummary, resetEveningSummaryGuard } from "../scheduler/briefings/eveningSummaryJob.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
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

function setupTestDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
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
      user_note             TEXT
    );
  `);
  return db;
}

function seedRagAnalysis(
  db: Database,
  overrides: {
    id?: string;
    created_at?: string;
    impact_score?: number;
    level?: string;
    source_title?: string;
  } = {},
) {
  const row = {
    id: overrides.id ?? `ra-${Date.now()}-${Math.random()}`,
    created_at: overrides.created_at ?? new Date().toISOString(),
    level: overrides.level ?? "country",
    source_title: overrides.source_title ?? "Test story",
    impact_score: overrides.impact_score ?? 7.5,
  };
  db.prepare(`
    INSERT OR IGNORE INTO rag_analyses
      (id, created_at, level, source_title, impact_score)
    VALUES (?, ?, ?, ?, ?)
  `).run(row.id, row.created_at, row.level, row.source_title, row.impact_score);
}

const TEST_REPORTS_DIR = join(process.cwd(), "data", "__test-evening-1322__");

function cleanupReportsDir() {
  if (existsSync(TEST_REPORTS_DIR)) {
    rmSync(TEST_REPORTS_DIR, { recursive: true, force: true });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1322 — EveningSummary.newsCount field", () => {
  let db: Database;

  beforeEach(() => {
    db = setupTestDb();
    mkdirSync(TEST_REPORTS_DIR, { recursive: true });
  });

  afterEach(() => {
    db.close();
    cleanupReportsDir();
  });

  // ── AC-1: newsCount = 3 when 3 rag_analyses rows exist since midnight ────────
  it("AC-1: newsCount = 3 when 3 rag_analyses rows exist since midnight VN time", async () => {
    const midnight = midnightVietnamUtc();
    const after = new Date(new Date(midnight).getTime() + 60_000).toISOString();

    seedRagAnalysis(db, { id: "ra-1", created_at: after });
    seedRagAnalysis(db, { id: "ra-2", created_at: after });
    seedRagAnalysis(db, { id: "ra-3", created_at: after });

    // Insert one row BEFORE midnight — must NOT be counted
    const before = new Date(new Date(midnight).getTime() - 60_000).toISOString();
    seedRagAnalysis(db, { id: "ra-old", created_at: before });

    const summary = await assembleEveningSummary({
      db,
      reportsDir: TEST_REPORTS_DIR,
      getPnlFn: async () => null,
    });

    expect(typeof summary.newsCount).toBe("number");
    expect(summary.newsCount).toBe(3);
  });

  // ── AC-2: newsCount = 0 when no rows since midnight ─────────────────────────
  it("AC-2: newsCount = 0 when no rag_analyses rows exist since midnight VN time", async () => {
    const midnight = midnightVietnamUtc();
    const before = new Date(new Date(midnight).getTime() - 60_000).toISOString();

    seedRagAnalysis(db, { id: "ra-old-only", created_at: before });

    const summary = await assembleEveningSummary({
      db,
      reportsDir: TEST_REPORTS_DIR,
      getPnlFn: async () => null,
    });

    expect(summary.newsCount).toBe(0);
  });
});

describe("Task 1323 — eveningSummaryJob formatter: tin tức hôm nay", () => {
  beforeEach(() => {
    resetEveningSummaryGuard();
  });

  // ── AC-3: message includes "(3 tin tức hôm nay)" when count > 0 ─────────────
  it("AC-3: Telegram message includes '(3 tin tức hôm nay)' when newsCount = 3", async () => {
    const calls: Array<{ message: string; opts: unknown }> = [];

    const summaryFn = async (): Promise<EveningSummary> => ({
      date: todayVietnam(),
      topAlerts: [],
      topStories: [
        { title: "Story A", level: "country", sentiment: "bullish", impactScore: 8 },
      ],
      watchlistMovers: [],
      predictionSignals: [],
      predictionDiag: { stored: 0 },
      taDiag: { tickersWithSignal: 0, tickersBelowThreshold: 0, ohlcvRowsMin: 0, ohlcvRowsMax: 0 },
      taSummary: [],
      newsCount: 3,
      generatedAt: new Date().toISOString(),
    });

    const sendFn = async (message: string, opts: unknown) => {
      calls.push({ message, opts });
    };

    await runEveningSummary(summaryFn, sendFn);

    expect(calls.length).toBe(1);
    expect(calls[0]!.message).toContain("(3 tin tức hôm nay)");
  });

  // ── AC-4 (updated Task 1386): newsCount=0 → no filler line emitted ──────────
  it("AC-4: Telegram message omits news filler when newsCount = 0", async () => {
    const calls: Array<{ message: string; opts: unknown }> = [];

    const summaryFn = async (): Promise<EveningSummary> => ({
      date: todayVietnam(),
      topAlerts: [
        { severity: "warning", message: "Test alert", stocks: [] },
      ],
      topStories: [],
      watchlistMovers: [],
      predictionSignals: [],
      predictionDiag: { stored: 0 },
      taDiag: { tickersWithSignal: 0, tickersBelowThreshold: 0, ohlcvRowsMin: 0, ohlcvRowsMax: 0 },
      taSummary: [],
      newsCount: 0,
      generatedAt: new Date().toISOString(),
    });

    const sendFn = async (message: string, opts: unknown) => {
      calls.push({ message, opts });
    };

    await runEveningSummary(summaryFn, sendFn);

    expect(calls.length).toBe(1);
    expect(calls[0]!.message).not.toContain("Không có tin tức hôm nay");
  });
});
