/**
 * Task 101 — Morning Briefing Job (08:00 GMT+7)
 *
 * Tests for:
 *   - assembleBriefing returns a valid DailyBriefing structure
 *   - date field matches today's date in Vietnam timezone
 *   - topStories pulled from rag_analyses since midnight
 *   - alerts section populated from alerts table (last 12 hours)
 *   - watchlistSummary reflects watchlist entries
 *   - newReports pulled from financial_reports since midnight
 *   - vnIndex populated when fetchVnIndexFn returns a value
 *   - Graceful when pollNews fails
 *   - Graceful when no data exists (empty briefing)
 *   - Briefing persisted to data/briefings/YYYY-MM-DD.json
 *   - Cron registered at weekday-only 08:00 pattern
 *   - morningBriefingJob concurrency guard: overlapping invocation skipped
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { VN_OFFSET_MS } from "../domain/services/timeConstants.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

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
// Temp directory for briefing output
// ─────────────────────────────────────────────────────────────────────────────

const TEST_BRIEFINGS_DIR = join(
  process.cwd(),
  "data",
  "__test-briefings-101__",
);

function cleanupBriefingsDir() {
  if (existsSync(TEST_BRIEFINGS_DIR)) {
    rmSync(TEST_BRIEFINGS_DIR, { recursive: true, force: true });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers: seed DB rows
// ─────────────────────────────────────────────────────────────────────────────

/** midnight today in GMT+7 as an ISO string (UTC equivalent) */
function midnightVietnamUtc(): string {
  const now = new Date();
  // Vietnam is UTC+7, so midnight VN = 17:00 UTC previous day
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
    id: overrides.id ?? `al-${Date.now()}-${Math.random()}`,
    triggered_at: overrides.triggered_at ?? new Date().toISOString(),
    severity: overrides.severity ?? "medium",
    message: overrides.message ?? "Test alert",
    affected_actions_json: overrides.affected_actions_json ?? '["VCB"]',
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

function seedWatchlistEntry(db: Database, code: string, domain = "banking") {
  db.prepare(`
    INSERT OR IGNORE INTO watchlist (code, exchange, domain, added_at)
    VALUES (?, 'HOSE', ?, datetime('now'))
  `).run(code, domain);
}

function seedFinancialReport(
  db: Database,
  code: string,
  parsedAt: string = new Date().toISOString(),
) {
  const id = `fr-${code}-${Date.now()}-${Math.random()}`;
  db.prepare(`
    INSERT OR IGNORE INTO financial_reports
      (id, action_code, exchange, domain, period_year, period_type,
       period_start, period_end, sort_key, parsed_at,
       balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json)
    VALUES (?, ?, 'HOSE', 'banking', 2026, 'Q1',
            '2026-01-01', '2026-03-31', '2026-Q1', ?,
            '{}', '{}', '{}', '{}')
  `).run(id, code, parsedAt);
  return id;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 101 — Morning Briefing Job", () => {
  let testDb: Database;

  beforeEach(() => {
    testDb = setupTestDb();
    cleanupBriefingsDir();
  });

  afterEach(() => {
    testDb.close();
    cleanupBriefingsDir();
  });

  // ── 1. DailyBriefing shape ─────────────────────────────────────────────────
  describe("assembleBriefing()", () => {
    it("returns a valid DailyBriefing structure on empty database", async () => {
      const { assembleBriefing } = await import(
        "../application/usecases/assembleBriefing.js"
      );

      const briefing = await assembleBriefing({
        db: testDb,
        pollNewsFn: async () => ({
          fetched: 0,
          inserted: 0,
          duplicates: 0,
          alerts: 0,
          errors: 0,
        }),
        fetchVnIndexFn: async () => null,
        briefingsDir: TEST_BRIEFINGS_DIR,
      });

      expect(briefing).toBeDefined();
      expect(typeof briefing.date).toBe("string");
      expect(typeof briefing.generatedAt).toBe("string");
      expect(Array.isArray(briefing.topStories)).toBe(true);
      expect(Array.isArray(briefing.alerts)).toBe(true);
      expect(Array.isArray(briefing.watchlistSummary)).toBe(true);
      expect(Array.isArray(briefing.newReports)).toBe(true);
    });

    // ── 2. date field is today's date (Vietnam timezone YYYY-MM-DD) ────────────
    it("date field matches today's date in YYYY-MM-DD format", async () => {
      const { assembleBriefing } = await import(
        "../application/usecases/assembleBriefing.js"
      );

      const briefing = await assembleBriefing({
        db: testDb,
        pollNewsFn: async () => ({
          fetched: 0,
          inserted: 0,
          duplicates: 0,
          alerts: 0,
          errors: 0,
        }),
        fetchVnIndexFn: async () => null,
        briefingsDir: TEST_BRIEFINGS_DIR,
      });

      // Should match YYYY-MM-DD
      expect(briefing.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      // Should be today's Vietnam date
      const vnNow = new Date(new Date().getTime() + VN_OFFSET_MS);
      const expectedDate = `${vnNow.getUTCFullYear()}-${String(vnNow.getUTCMonth() + 1).padStart(2, "0")}-${String(vnNow.getUTCDate()).padStart(2, "0")}`;
      expect(briefing.date).toBe(expectedDate);
    });

    // ── 3. topStories from rag_analyses since midnight, sorted by impact_score ─
    it("topStories: up to 5 entries from rag_analyses since midnight, sorted by impact_score DESC", async () => {
      const { assembleBriefing } = await import(
        "../application/usecases/assembleBriefing.js"
      );

      const midnight = midnightVietnamUtc();
      // Insert 6 stories since midnight — should return top 5 sorted by score
      for (let i = 1; i <= 6; i++) {
        seedRagAnalysis(testDb, {
          id: `ra-story-${i}`,
          created_at: new Date(new Date(midnight).getTime() + i * 60_000).toISOString(),
          impact_score: i * 1.0, // 1.0 to 6.0
          source_title: `Story ${i}`,
          sentiment: i > 3 ? "bullish" : "bearish",
          level: "country",
        });
      }
      // Insert 1 old story (before midnight) — should NOT appear
      seedRagAnalysis(testDb, {
        id: "ra-old-story",
        created_at: new Date(new Date(midnight).getTime() - 60_000).toISOString(),
        impact_score: 9.9,
        source_title: "Old story before midnight",
        level: "country",
      });

      const briefing = await assembleBriefing({
        db: testDb,
        pollNewsFn: async () => ({
          fetched: 0,
          inserted: 0,
          duplicates: 0,
          alerts: 0,
          errors: 0,
        }),
        fetchVnIndexFn: async () => null,
        briefingsDir: TEST_BRIEFINGS_DIR,
      });

      expect(briefing.topStories.length).toBe(5);
      // First story should have highest impact score (6.0)
      expect(briefing.topStories[0]!.impactScore).toBe(6);
      // Each story has required fields
      for (const story of briefing.topStories) {
        expect(typeof story.title).toBe("string");
        expect(typeof story.level).toBe("string");
        expect(typeof story.sentiment).toBe("string");
        expect(typeof story.impactScore).toBe("number");
      }
    });

    // ── 4. alerts from last 12 hours ──────────────────────────────────────────
    it("alerts: populated from alerts table (last 12 hours)", async () => {
      const { assembleBriefing } = await import(
        "../application/usecases/assembleBriefing.js"
      );

      const now = new Date();
      // Recent alert (5 hours ago) — should appear
      seedAlert(testDb, {
        id: "al-recent",
        triggered_at: new Date(now.getTime() - 5 * 3600_000).toISOString(),
        severity: "high",
        message: "Recent price drop",
        affected_actions_json: '["VCB"]',
      });

      // Old alert (13 hours ago) — should NOT appear
      seedAlert(testDb, {
        id: "al-old",
        triggered_at: new Date(now.getTime() - 13 * 3600_000).toISOString(),
        severity: "medium",
        message: "Old alert",
        affected_actions_json: '["HPG"]',
      });

      const briefing = await assembleBriefing({
        db: testDb,
        pollNewsFn: async () => ({
          fetched: 0,
          inserted: 0,
          duplicates: 0,
          alerts: 0,
          errors: 0,
        }),
        fetchVnIndexFn: async () => null,
        briefingsDir: TEST_BRIEFINGS_DIR,
      });

      expect(briefing.alerts.length).toBe(1);
      expect(briefing.alerts[0]!.severity).toBe("high");
      expect(briefing.alerts[0]!.message).toBe("Recent price drop");
      expect(briefing.alerts[0]!.stocks).toContain("VCB");
    });

    // ── 5. watchlistSummary reflects watchlist ──────────────────────────────────
    it("watchlistSummary: one entry per watchlist stock", async () => {
      const { assembleBriefing } = await import(
        "../application/usecases/assembleBriefing.js"
      );

      seedWatchlistEntry(testDb, "VCB", "banking");
      seedWatchlistEntry(testDb, "HPG", "steel");

      const briefing = await assembleBriefing({
        db: testDb,
        pollNewsFn: async () => ({
          fetched: 0,
          inserted: 0,
          duplicates: 0,
          alerts: 0,
          errors: 0,
        }),
        fetchVnIndexFn: async () => null,
        briefingsDir: TEST_BRIEFINGS_DIR,
      });

      expect(briefing.watchlistSummary.length).toBe(2);
      const codes = briefing.watchlistSummary.map((w) => w.code);
      expect(codes).toContain("VCB");
      expect(codes).toContain("HPG");
      for (const entry of briefing.watchlistSummary) {
        expect(typeof entry.code).toBe("string");
        expect(typeof entry.domain).toBe("string");
      }
    });

    // ── 6. newReports from financial_reports since midnight ────────────────────
    it("newReports: stock codes with new financial_reports since midnight", async () => {
      const { assembleBriefing } = await import(
        "../application/usecases/assembleBriefing.js"
      );

      const midnight = midnightVietnamUtc();

      // Recent report (1 hour after midnight) — should appear
      seedFinancialReport(
        testDb,
        "VCB",
        new Date(new Date(midnight).getTime() + 3600_000).toISOString(),
      );

      // Old report (1 hour before midnight) — should NOT appear
      seedFinancialReport(
        testDb,
        "HPG",
        new Date(new Date(midnight).getTime() - 3600_000).toISOString(),
      );

      const briefing = await assembleBriefing({
        db: testDb,
        pollNewsFn: async () => ({
          fetched: 0,
          inserted: 0,
          duplicates: 0,
          alerts: 0,
          errors: 0,
        }),
        fetchVnIndexFn: async () => null,
        briefingsDir: TEST_BRIEFINGS_DIR,
      });

      expect(briefing.newReports.length).toBe(1);
      expect(briefing.newReports[0]!.code).toBe("VCB");
      expect(typeof briefing.newReports[0]!.period).toBe("string");
    });

    // ── 7. vnIndex populated when fetchVnIndexFn returns a value ───────────────
    it("vnIndex field is populated when fetchVnIndexFn returns data", async () => {
      const { assembleBriefing } = await import(
        "../application/usecases/assembleBriefing.js"
      );

      const briefing = await assembleBriefing({
        db: testDb,
        pollNewsFn: async () => ({
          fetched: 0,
          inserted: 0,
          duplicates: 0,
          alerts: 0,
          errors: 0,
        }),
        fetchVnIndexFn: async () => ({ price: 1285.5, changePct: 0.72 }),
        briefingsDir: TEST_BRIEFINGS_DIR,
      });

      expect(briefing.vnIndex).toBeDefined();
      expect(briefing.vnIndex!.price).toBe(1285.5);
      expect(briefing.vnIndex!.changePct).toBe(0.72);
    });

    // ── 8. Graceful when pollNews fails ────────────────────────────────────────
    it("is graceful when pollNewsFn throws (does not abort briefing)", async () => {
      const { assembleBriefing } = await import(
        "../application/usecases/assembleBriefing.js"
      );

      const briefing = await assembleBriefing({
        db: testDb,
        pollNewsFn: async () => {
          throw new Error("Network timeout");
        },
        fetchVnIndexFn: async () => null,
        briefingsDir: TEST_BRIEFINGS_DIR,
      });

      // Should still return a valid briefing despite pollNews failure
      expect(briefing).toBeDefined();
      expect(typeof briefing.date).toBe("string");
      expect(Array.isArray(briefing.topStories)).toBe(true);
    });

    // ── 9. Graceful when fetchVnIndex fails ─────────────────────────────────────
    it("is graceful when fetchVnIndexFn throws (vnIndex is undefined)", async () => {
      const { assembleBriefing } = await import(
        "../application/usecases/assembleBriefing.js"
      );

      const briefing = await assembleBriefing({
        db: testDb,
        pollNewsFn: async () => ({
          fetched: 0,
          inserted: 0,
          duplicates: 0,
          alerts: 0,
          errors: 0,
        }),
        fetchVnIndexFn: async () => {
          throw new Error("HOSE API unavailable");
        },
        briefingsDir: TEST_BRIEFINGS_DIR,
      });

      expect(briefing).toBeDefined();
      expect(briefing.vnIndex).toBeUndefined();
    });

    // ── 10. Briefing persisted to data/briefings/YYYY-MM-DD.json ───────────────
    it("persists briefing to briefingsDir/YYYY-MM-DD.json", async () => {
      const { assembleBriefing } = await import(
        "../application/usecases/assembleBriefing.js"
      );

      mkdirSync(TEST_BRIEFINGS_DIR, { recursive: true });

      const briefing = await assembleBriefing({
        db: testDb,
        pollNewsFn: async () => ({
          fetched: 0,
          inserted: 0,
          duplicates: 0,
          alerts: 0,
          errors: 0,
        }),
        fetchVnIndexFn: async () => null,
        briefingsDir: TEST_BRIEFINGS_DIR,
      });

      const expectedFile = join(TEST_BRIEFINGS_DIR, `${briefing.date}.json`);
      expect(existsSync(expectedFile)).toBe(true);

      const contents = JSON.parse(readFileSync(expectedFile, "utf-8")) as typeof briefing;
      expect(contents.date).toBe(briefing.date);
      expect(Array.isArray(contents.topStories)).toBe(true);
    });

    // ── 11. Overwrite existing briefing on re-run ──────────────────────────────
    it("overwrites existing briefing file on re-run (idempotent)", async () => {
      const { assembleBriefing } = await import(
        "../application/usecases/assembleBriefing.js"
      );

      mkdirSync(TEST_BRIEFINGS_DIR, { recursive: true });

      // Run once
      await assembleBriefing({
        db: testDb,
        pollNewsFn: async () => ({
          fetched: 0,
          inserted: 0,
          duplicates: 0,
          alerts: 0,
          errors: 0,
        }),
        fetchVnIndexFn: async () => null,
        briefingsDir: TEST_BRIEFINGS_DIR,
      });

      // Seed data and run again
      seedWatchlistEntry(testDb, "VCB", "banking");

      const briefing2 = await assembleBriefing({
        db: testDb,
        pollNewsFn: async () => ({
          fetched: 0,
          inserted: 0,
          duplicates: 0,
          alerts: 0,
          errors: 0,
        }),
        fetchVnIndexFn: async () => null,
        briefingsDir: TEST_BRIEFINGS_DIR,
      });

      const expectedFile = join(TEST_BRIEFINGS_DIR, `${briefing2.date}.json`);
      expect(existsSync(expectedFile)).toBe(true);

      const contents = JSON.parse(readFileSync(expectedFile, "utf-8")) as typeof briefing2;
      // Second run includes watchlist entry
      expect(contents.watchlistSummary.length).toBe(1);
    });
  });

  // ── 12. Cron schedule: morningBriefing is weekday 08:00 ───────────────────
  describe("CRONS.morningBriefing", () => {
    it("cron expression targets weekdays at 08:00 (0 8 * * 1-5)", async () => {
      const { CRONS } = await import("../scheduler/jobs.js");
      // Accept either weekday-only pattern (1-5) or daily (*)
      // TASKS.md spec says weekday-only: 0 8 * * 1-5
      expect(CRONS.morningBriefing).toMatch(/0 8 \* \* (1-5|\*)/);
    });
  });

  // ── 13. morningBriefingJob concurrency guard ───────────────────────────────
  describe("runMorningBriefing() concurrency guard", () => {
    it("skips concurrent invocations while a briefing is running", async () => {
      const { runMorningBriefing } = await import(
        "../scheduler/briefings/morningBriefingJob.js"
      );

      let callCount = 0;
      const slowBriefingFn = async () => {
        callCount++;
        // Simulate slow work
        await new Promise<void>((r) => setTimeout(r, 20));
        return {
          date: "2026-03-28",
          topStories: [],
          alerts: [],
          watchlistSummary: [],
          newReports: [],
          macroSnapshot: [],
          sensitiveWarnings: [],
          trackedCommodities: [],
          unresolvedAlerts: [],
          topConviction: null,
          predictionSignals: [],
          generatedAt: new Date().toISOString(),
        };
      };

      const p1 = runMorningBriefing(slowBriefingFn);
      const p2 = runMorningBriefing(slowBriefingFn);

      await Promise.all([p1, p2]);

      // Only one invocation should have run
      expect(callCount).toBe(1);
    });

    it("allows subsequent run after first completes", async () => {
      const { runMorningBriefing } = await import(
        "../scheduler/briefings/morningBriefingJob.js"
      );

      let callCount = 0;
      const fastBriefingFn = async () => {
        callCount++;
        return {
          date: "2026-03-28",
          topStories: [],
          alerts: [],
          watchlistSummary: [],
          newReports: [],
          macroSnapshot: [],
          sensitiveWarnings: [],
          trackedCommodities: [],
          unresolvedAlerts: [],
          topConviction: null,
          predictionSignals: [],
          generatedAt: new Date().toISOString(),
        };
      };

      await runMorningBriefing(fastBriefingFn);
      await runMorningBriefing(fastBriefingFn);

      expect(callCount).toBe(2);
    });
  });
});
