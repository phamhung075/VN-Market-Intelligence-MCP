Bun.env["DB_PATH"] = ":memory:";
/**
 * Task 125 — E2E Daily Briefing Flow
 *
 * End-to-end tests covering the full daily briefing pipeline:
 *   - Full pipeline: pollNews → seed rag_analyses + alerts → assembleBriefing
 *   - DailyBriefing output structure validation (all required fields)
 *   - Macro data block (from task 024 Trading Economics — storeMacroIndicators)
 *   - VN-Index snapshot included when fetchVnIndexFn returns data
 *   - Top stories from rag_analyses populated and sorted correctly
 *   - Alerts populated from alerts table (last 12 hours)
 *   - Watchlist summary with price data
 *   - New financial reports since midnight
 *   - Empty watchlist scenario (graceful — watchlistSummary is [])
 *   - All fetchers fail (graceful degradation — briefing still returns valid structure)
 *   - Evening summary flow: assembleEveningSummary produces valid EveningSummary
 *   - Evening summary movers reflect market_prices changes
 *   - runMorningBriefing + runEveningSummary concurrency guards both prevent double-fire
 *   - Briefing persisted to file
 *   - Evening summary persisted to file
 *
 * Architecture: all HTTP fetchers are mocked — no real network calls are made.
 * SQLite is in-memory — no disk writes except to controlled temp directories.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { VN_OFFSET_MS } from "../domain/services/timeConstants.js";

// ─────────────────────────────────────────────────────────────────────────────
// Imports under test
// ─────────────────────────────────────────────────────────────────────────────

import {
  assembleBriefing,
  type DailyBriefing,
} from "../application/usecases/assembleBriefing.js";
import {
  assembleEveningSummary,
  type EveningSummary,
} from "../application/usecases/assembleEveningSummary.js";
import { pollNews } from "../application/usecases/pollNews.js";
import {
  storeMacroIndicators,
  type MacroIndicators,
} from "../infrastructure/fetchers/tradingEconomics.js";

// ─────────────────────────────────────────────────────────────────────────────
// Schema helpers — full schema matching production (no production DB touches)
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
      embedding_text     TEXT,
      data_env TEXT
);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_rag_source_url
      ON rag_analyses(source_url)
      WHERE source_url IS NOT NULL AND source_url != '';

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

    CREATE TABLE IF NOT EXISTS macro_indicators (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      country       TEXT NOT NULL,
      cpi           REAL,
      gdp_growth    REAL,
      interest_rate REAL,
      fetched_at    TEXT NOT NULL,
      UNIQUE(country)
    );

    CREATE TABLE IF NOT EXISTS positions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      code        TEXT NOT NULL,
      shares      INTEGER NOT NULL,
      avg_price   REAL NOT NULL,
      opened_at   TEXT NOT NULL DEFAULT (datetime('now')),
      closed_at   TEXT,
      notes       TEXT,
      UNIQUE(code)
    );

    CREATE TABLE IF NOT EXISTS insider_transactions (
      id                  TEXT PRIMARY KEY,
      code                TEXT NOT NULL,
      insider_name        TEXT NOT NULL,
      position            TEXT NOT NULL,
      type                TEXT NOT NULL,
      registered_volume   INTEGER NOT NULL DEFAULT 0,
      executed_volume     INTEGER NOT NULL DEFAULT 0,
      price               REAL NOT NULL DEFAULT 0,
      from_date           TEXT NOT NULL,
      to_date             TEXT NOT NULL,
      fetched_at          TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vnstock_trading_stats (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      code                  TEXT NOT NULL,
      date                  TEXT NOT NULL DEFAULT '1970-01-01',
      foreign_room          INTEGER,
      foreign_volume        INTEGER,
      current_holding_ratio REAL,
      max_holding_ratio     REAL,
      avg_volume_2w         INTEGER,
      high_52w              REAL,
      low_52w               REAL,
      pct_from_high_52w     REAL,
      pct_from_low_52w      REAL,
      fetched_at            TEXT NOT NULL,
      created_at            TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(code, date)
    );

    CREATE TABLE IF NOT EXISTS evidence_scores (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      stock          TEXT NOT NULL,
      score_date     TEXT NOT NULL,
      bullish_score  REAL NOT NULL DEFAULT 0.0,
      bearish_score  REAL NOT NULL DEFAULT 0.0,
      neutral_score  REAL NOT NULL DEFAULT 0.0,
      fragment_count INTEGER NOT NULL DEFAULT 0,
      computed_at    TEXT NOT NULL,
      UNIQUE(stock, score_date)
    );
  `);

  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// Temp output directories
// ─────────────────────────────────────────────────────────────────────────────

const TEST_BRIEFINGS_DIR = join(process.cwd(), "data", "__test-briefings-125__");
const TEST_REPORTS_DIR = join(process.cwd(), "data", "__test-reports-125__");

function cleanupDirs() {
  for (const dir of [TEST_BRIEFINGS_DIR, TEST_REPORTS_DIR]) {
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Time helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Returns midnight today in Vietnam timezone (UTC+7) as an ISO 8601 UTC string. */
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

/** Returns today's date in Vietnam timezone as YYYY-MM-DD. */
function todayVietnam(): string {
  const vnNow = new Date(new Date().getTime() + VN_OFFSET_MS);
  const y = vnNow.getUTCFullYear();
  const m = String(vnNow.getUTCMonth() + 1).padStart(2, "0");
  const d = String(vnNow.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed helpers
// ─────────────────────────────────────────────────────────────────────────────

function seedWatchlist(db: Database, code: string, exchange = "HOSE", domain = "banking") {
  db.prepare(`
    INSERT OR IGNORE INTO watchlist (code, exchange, domain, added_at)
    VALUES (?, ?, ?, datetime('now'))
  `).run(code, exchange, domain);
}

function seedMarketPrice(db: Database, code: string, price: number, changePct: number) {
  db.prepare(`
    INSERT OR REPLACE INTO market_prices (code, price, change_pct, updated_at)
    VALUES (?, ?, ?, datetime('now'))
  `).run(code, price, changePct);
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
    source_url: string;
  }> = {},
) {
  const row = {
    id: overrides.id ?? `ra-${Date.now()}-${Math.random()}`,
    created_at: overrides.created_at ?? new Date().toISOString(),
    level: overrides.level ?? "country",
    source_title: overrides.source_title ?? "Test story",
    sentiment: overrides.sentiment ?? "bullish",
    impact_score: overrides.impact_score ?? 7.5,
    source_url: overrides.source_url ?? null,
  };
  db.prepare(`
    INSERT OR IGNORE INTO rag_analyses
      (id, created_at, level, source_title, sentiment, impact_score, source_url)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.id,
    row.created_at,
    row.level,
    row.source_title,
    row.sentiment,
    row.impact_score,
    row.source_url,
  );
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
    severity: overrides.severity ?? "warning",
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

function seedFinancialReport(db: Database, code: string, parsedAt: string) {
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

function seedMacroIndicators(db: Database, indicators: Partial<MacroIndicators> = {}) {
  const data: MacroIndicators = {
    country: indicators.country ?? "vietnam",
    cpi: indicators.cpi ?? 3.8,
    gdpGrowth: indicators.gdpGrowth ?? 7.09,
    interestRate: indicators.interestRate ?? 4.5,
    fetchedAt: indicators.fetchedAt ?? new Date().toISOString(),
  };
  storeMacroIndicators(data, db);
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Null pollNews mock (no-op, returns empty result)
// ─────────────────────────────────────────────────────────────────────────────

const NO_OP_POLL = async () => ({
  fetched: 0,
  inserted: 0,
  duplicates: 0,
  alerts: 0,
  errors: 0,
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 125 — E2E Daily Briefing Flow", () => {
  let db: Database;

  beforeEach(() => {
    db = setupTestDb();
    cleanupDirs();
    mkdirSync(TEST_BRIEFINGS_DIR, { recursive: true });
    mkdirSync(TEST_REPORTS_DIR, { recursive: true });
  });

  afterEach(() => {
    db.close();
    cleanupDirs();
  });

  // ── Section 1: DailyBriefing structure ──────────────────────────────────────

  describe("DailyBriefing output structure", () => {
    it("assembleBriefing returns a valid DailyBriefing on empty DB", async () => {
      const briefing = await assembleBriefing({
        db,
        pollNewsFn: NO_OP_POLL,
        fetchVnIndexFn: async () => null,
        briefingsDir: TEST_BRIEFINGS_DIR,
      });

      expect(briefing).toBeDefined();
      expect(typeof briefing.date).toBe("string");
      expect(briefing.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof briefing.generatedAt).toBe("string");
      expect(Array.isArray(briefing.topStories)).toBe(true);
      expect(Array.isArray(briefing.alerts)).toBe(true);
      expect(Array.isArray(briefing.watchlistSummary)).toBe(true);
      expect(Array.isArray(briefing.newReports)).toBe(true);
    });

    it("date field is today in Vietnam timezone (YYYY-MM-DD)", async () => {
      const briefing = await assembleBriefing({
        db,
        pollNewsFn: NO_OP_POLL,
        fetchVnIndexFn: async () => null,
        briefingsDir: TEST_BRIEFINGS_DIR,
      });

      const expected = todayVietnam();
      expect(briefing.date).toBe(expected);
    });

    it("generatedAt is a valid ISO 8601 timestamp", async () => {
      const briefing = await assembleBriefing({
        db,
        pollNewsFn: NO_OP_POLL,
        fetchVnIndexFn: async () => null,
        briefingsDir: TEST_BRIEFINGS_DIR,
      });

      const parsed = new Date(briefing.generatedAt);
      expect(isNaN(parsed.getTime())).toBe(false);
    });
  });

  // ── Section 2: Full pipeline — pollNews feeds assembleBriefing ──────────────

  describe("Full E2E pipeline: pollNews → seed → assembleBriefing", () => {
    it("news items fetched by pollNews appear as topStories in the briefing", async () => {
      // Step 1: Run pollNews with mock fetchers to seed rag_analyses
      const midnight = midnightVietnamUtc();
      const afterMidnight = new Date(new Date(midnight).getTime() + 60_000).toISOString();

      // Pre-seed 3 rag_analyses entries as if pollNews ran successfully
      seedRagAnalysis(db, {
        id: "e2e-ra-1",
        created_at: afterMidnight,
        impact_score: 9.0,
        source_title: "Fed rate decision impacts VN market",
        sentiment: "bearish",
        level: "global",
      });
      seedRagAnalysis(db, {
        id: "e2e-ra-2",
        created_at: afterMidnight,
        impact_score: 7.5,
        source_title: "VCB reports strong Q1 2026 earnings",
        sentiment: "bullish",
        level: "action",
      });
      seedRagAnalysis(db, {
        id: "e2e-ra-3",
        created_at: afterMidnight,
        impact_score: 6.0,
        source_title: "Vietnam GDP growth accelerates to 7.09%",
        sentiment: "bullish",
        level: "country",
      });

      // Step 2: Assemble briefing using already-seeded data
      const briefing = await assembleBriefing({
        db,
        pollNewsFn: NO_OP_POLL,
        fetchVnIndexFn: async () => null,
        briefingsDir: TEST_BRIEFINGS_DIR,
      });

      expect(briefing.topStories.length).toBe(3);
      // Sorted by impact_score DESC
      expect(briefing.topStories[0]!.impactScore).toBe(9.0);
      expect(briefing.topStories[0]!.title).toBe("Fed rate decision impacts VN market");
      expect(briefing.topStories[1]!.impactScore).toBe(7.5);
      expect(briefing.topStories[2]!.impactScore).toBe(6.0);
    });

    it("pollNews + assembleBriefing full roundtrip inserts news then reads it back", async () => {
      // Run real pollNews with mock fetchers
      const mockRssItem = {
        title: "VN-Index gains 8.5 points on banking sector rally",
        url: "https://cafef.vn/e2e-test-125-article",
        publishedAt: new Date().toISOString(),
        content: "VCB TCB ACB banking sector strong earnings Vietnam market.",
        source: "cafef",
      };

      const pollResult = await pollNews({
        fetchers: {
          cafef: async () => [mockRssItem],
          vnexpress: async () => [],
          reuters: async () => [],
          vneconomy: async () => [],
          tradingeconomics: async () => [],
        },
        db,
        ragRetriever: async () => [],
        watchlist: [{ actionCode: "VCB", domain: "banking", exchange: "HOSE" }],
      });

      expect(pollResult.inserted).toBe(1);

      // Now assemble briefing — rag_analyses should include the newly inserted entry
      const briefing = await assembleBriefing({
        db,
        pollNewsFn: NO_OP_POLL, // Don't poll again — data already seeded
        fetchVnIndexFn: async () => ({ price: 1295.4, changePct: 0.65 }),
        briefingsDir: TEST_BRIEFINGS_DIR,
      });

      // The article inserted by pollNews must appear in topStories
      const titles = briefing.topStories.map((s) => s.title);
      expect(
        titles.some((t) => t.includes("VN-Index") || t.includes("banking")),
      ).toBe(true);
    });
  });

  // ── Section 3: topStories ──────────────────────────────────────────────────

  describe("topStories field", () => {
    it("up to 5 stories returned, sorted by impact_score DESC", async () => {
      const midnight = midnightVietnamUtc();
      const base = new Date(midnight).getTime();

      for (let i = 1; i <= 6; i++) {
        seedRagAnalysis(db, {
          id: `ts-ra-${i}`,
          created_at: new Date(base + i * 60_000).toISOString(),
          impact_score: i * 1.5,
          source_title: `Story priority ${i}`,
        });
      }

      const briefing = await assembleBriefing({
        db,
        pollNewsFn: NO_OP_POLL,
        fetchVnIndexFn: async () => null,
        briefingsDir: TEST_BRIEFINGS_DIR,
      });

      expect(briefing.topStories.length).toBe(5);
      // Highest score first
      expect(briefing.topStories[0]!.impactScore).toBe(9.0); // 6 * 1.5
    });

    it("stories before midnight are excluded", async () => {
      const midnight = midnightVietnamUtc();
      const before = new Date(new Date(midnight).getTime() - 60_000).toISOString();
      const after = new Date(new Date(midnight).getTime() + 60_000).toISOString();

      seedRagAnalysis(db, {
        id: "ts-before",
        created_at: before,
        impact_score: 10.0,
        source_title: "Old story must not appear",
      });
      seedRagAnalysis(db, {
        id: "ts-after",
        created_at: after,
        impact_score: 5.0,
        source_title: "Today story",
      });

      const briefing = await assembleBriefing({
        db,
        pollNewsFn: NO_OP_POLL,
        fetchVnIndexFn: async () => null,
        briefingsDir: TEST_BRIEFINGS_DIR,
      });

      expect(briefing.topStories.length).toBe(1);
      expect(briefing.topStories[0]!.title).toBe("Today story");
    });

    it("each topStory has required typed fields", async () => {
      const after = new Date(Date.now() + 1000).toISOString();
      seedRagAnalysis(db, {
        id: "ts-struct",
        created_at: after,
        impact_score: 8.0,
        source_title: "Structure check",
        sentiment: "neutral",
        level: "domain",
      });

      const briefing = await assembleBriefing({
        db,
        pollNewsFn: NO_OP_POLL,
        fetchVnIndexFn: async () => null,
        briefingsDir: TEST_BRIEFINGS_DIR,
      });

      const story = briefing.topStories[0];
      expect(story).toBeDefined();
      expect(typeof story!.title).toBe("string");
      expect(typeof story!.level).toBe("string");
      expect(typeof story!.sentiment).toBe("string");
      expect(typeof story!.impactScore).toBe("number");
    });
  });

  // ── Section 4: alerts field ──────────────────────────────────────────────────

  describe("alerts field", () => {
    it("alerts from last 12 hours are included", async () => {
      const fiveHoursAgo = new Date(Date.now() - 5 * 3600_000).toISOString();
      seedAlert(db, {
        id: "al-recent-125",
        triggered_at: fiveHoursAgo,
        severity: "critical",
        message: "VCB price dropped 6%",
        affected_actions_json: '["VCB"]',
      });

      const briefing = await assembleBriefing({
        db,
        pollNewsFn: NO_OP_POLL,
        fetchVnIndexFn: async () => null,
        briefingsDir: TEST_BRIEFINGS_DIR,
      });

      expect(briefing.alerts.length).toBe(1);
      expect(briefing.alerts[0]!.severity).toBe("critical");
      expect(briefing.alerts[0]!.message).toBe("VCB price dropped 6%");
      expect(briefing.alerts[0]!.stocks).toContain("VCB");
    });

    it("alerts older than 12 hours are excluded", async () => {
      const thirteenHoursAgo = new Date(Date.now() - 13 * 3600_000).toISOString();
      seedAlert(db, {
        id: "al-old-125",
        triggered_at: thirteenHoursAgo,
        severity: "warning",
        message: "Old alert excluded",
      });

      const briefing = await assembleBriefing({
        db,
        pollNewsFn: NO_OP_POLL,
        fetchVnIndexFn: async () => null,
        briefingsDir: TEST_BRIEFINGS_DIR,
      });

      expect(briefing.alerts.length).toBe(0);
    });

    it("affected_actions_json with object format { code } is parsed correctly", async () => {
      seedAlert(db, {
        id: "al-obj-format",
        triggered_at: new Date().toISOString(),
        severity: "warning",
        message: "Object-format stocks",
        affected_actions_json: JSON.stringify([
          { code: "TCB", expectedImpact: "down", confidence: 0.85 },
          { code: "HPG", expectedImpact: "up", confidence: 0.7 },
        ]),
      });

      const briefing = await assembleBriefing({
        db,
        pollNewsFn: NO_OP_POLL,
        fetchVnIndexFn: async () => null,
        briefingsDir: TEST_BRIEFINGS_DIR,
      });

      expect(briefing.alerts.length).toBe(1);
      expect(briefing.alerts[0]!.stocks).toContain("TCB");
      expect(briefing.alerts[0]!.stocks).toContain("HPG");
    });
  });

  // ── Section 5: watchlistSummary field ────────────────────────────────────────

  describe("watchlistSummary field", () => {
    it("one entry per watchlist stock, with price when available", async () => {
      seedWatchlist(db, "VCB", "HOSE", "banking");
      seedWatchlist(db, "HPG", "HOSE", "steel");
      seedMarketPrice(db, "VCB", 90000, 1.5);
      // HPG has no price entry

      const briefing = await assembleBriefing({
        db,
        pollNewsFn: NO_OP_POLL,
        fetchVnIndexFn: async () => null,
        briefingsDir: TEST_BRIEFINGS_DIR,
      });

      expect(briefing.watchlistSummary.length).toBe(2);

      const vcb = briefing.watchlistSummary.find((w) => w.code === "VCB");
      const hpg = briefing.watchlistSummary.find((w) => w.code === "HPG");

      expect(vcb).toBeDefined();
      expect(vcb!.price).toBe(90000);
      expect(vcb!.changePct).toBe(1.5);
      expect(vcb!.domain).toBe("banking");

      expect(hpg).toBeDefined();
      expect(hpg!.price).toBeUndefined();
      expect(hpg!.changePct).toBeUndefined();
    });

    it("empty watchlist scenario — watchlistSummary is []", async () => {
      // No watchlist seeds

      const briefing = await assembleBriefing({
        db,
        pollNewsFn: NO_OP_POLL,
        fetchVnIndexFn: async () => null,
        briefingsDir: TEST_BRIEFINGS_DIR,
      });

      expect(briefing.watchlistSummary).toEqual([]);
    });
  });

  // ── Section 6: newReports field ──────────────────────────────────────────────

  describe("newReports field", () => {
    it("new financial reports since midnight are included", async () => {
      const midnight = midnightVietnamUtc();
      const afterMidnight = new Date(new Date(midnight).getTime() + 3600_000).toISOString();

      seedFinancialReport(db, "VCB", afterMidnight);

      const briefing = await assembleBriefing({
        db,
        pollNewsFn: NO_OP_POLL,
        fetchVnIndexFn: async () => null,
        briefingsDir: TEST_BRIEFINGS_DIR,
      });

      expect(briefing.newReports.length).toBe(1);
      expect(briefing.newReports[0]!.code).toBe("VCB");
      expect(typeof briefing.newReports[0]!.period).toBe("string");
      expect(briefing.newReports[0]!.period).toContain("2026");
    });

    it("financial reports parsed before midnight are excluded", async () => {
      const midnight = midnightVietnamUtc();
      const beforeMidnight = new Date(new Date(midnight).getTime() - 3600_000).toISOString();

      seedFinancialReport(db, "TCB", beforeMidnight);

      const briefing = await assembleBriefing({
        db,
        pollNewsFn: NO_OP_POLL,
        fetchVnIndexFn: async () => null,
        briefingsDir: TEST_BRIEFINGS_DIR,
      });

      expect(briefing.newReports.length).toBe(0);
    });
  });

  // ── Section 7: VN-Index snapshot ─────────────────────────────────────────────

  describe("vnIndex field", () => {
    it("vnIndex is populated when fetchVnIndexFn returns data", async () => {
      const briefing = await assembleBriefing({
        db,
        pollNewsFn: NO_OP_POLL,
        fetchVnIndexFn: async () => ({ price: 1285.5, changePct: 0.72 }),
        briefingsDir: TEST_BRIEFINGS_DIR,
      });

      expect(briefing.vnIndex).toBeDefined();
      expect(briefing.vnIndex!.price).toBe(1285.5);
      expect(briefing.vnIndex!.changePct).toBe(0.72);
    });

    it("vnIndex is undefined when fetchVnIndexFn returns null", async () => {
      const briefing = await assembleBriefing({
        db,
        pollNewsFn: NO_OP_POLL,
        fetchVnIndexFn: async () => null,
        briefingsDir: TEST_BRIEFINGS_DIR,
      });

      expect(briefing.vnIndex).toBeUndefined();
    });
  });

  // ── Section 8: Macro indicators (Task 024 integration) ───────────────────────

  describe("macro indicators (Task 024 — Trading Economics)", () => {
    it("storeMacroIndicators persists data and it is readable from DB", () => {
      seedMacroIndicators(db, {
        country: "vietnam",
        cpi: 3.8,
        gdpGrowth: 7.09,
        interestRate: 4.5,
      });

      const row = db
        .prepare("SELECT * FROM macro_indicators WHERE country = 'vietnam'")
        .get() as {
          country: string;
          cpi: number | null;
          gdp_growth: number | null;
          interest_rate: number | null;
        } | null;

      expect(row).not.toBeNull();
      expect(row!.country).toBe("vietnam");
      expect(row!.cpi).toBe(3.8);
      expect(row!.gdp_growth).toBe(7.09);
      expect(row!.interest_rate).toBe(4.5);
    });

    it("storeMacroIndicators upserts on duplicate country (INSERT OR REPLACE)", () => {
      seedMacroIndicators(db, { cpi: 3.8, gdpGrowth: 7.09, interestRate: 4.5 });
      seedMacroIndicators(db, { cpi: 4.1, gdpGrowth: 6.5, interestRate: 4.0 }); // updated values

      const rows = db
        .prepare("SELECT * FROM macro_indicators WHERE country = 'vietnam'")
        .all() as Array<{ cpi: number }>;

      // Only one row for vietnam
      expect(rows.length).toBe(1);
      expect(rows[0]!.cpi).toBe(4.1); // Latest value
    });

    it("macro indicators survive the full briefing cycle (DB not wiped)", async () => {
      seedMacroIndicators(db, { cpi: 3.5, gdpGrowth: 7.0, interestRate: 4.5 });

      const briefing = await assembleBriefing({
        db,
        pollNewsFn: NO_OP_POLL,
        fetchVnIndexFn: async () => null,
        briefingsDir: TEST_BRIEFINGS_DIR,
      });

      // Briefing runs fine and macro_indicators table is not cleared
      expect(briefing).toBeDefined();

      const row = db
        .prepare("SELECT cpi FROM macro_indicators WHERE country = 'vietnam'")
        .get() as { cpi: number } | null;

      expect(row).not.toBeNull();
      expect(row!.cpi).toBe(3.5);
    });

    it("null macro fields are accepted (partial data from scraper)", () => {
      storeMacroIndicators(
        {
          country: "vietnam",
          cpi: null,
          gdpGrowth: null,
          interestRate: 4.5,
          fetchedAt: new Date().toISOString(),
        },
        db,
      );

      const row = db
        .prepare("SELECT * FROM macro_indicators WHERE country = 'vietnam'")
        .get() as { cpi: number | null; gdp_growth: number | null; interest_rate: number } | null;

      expect(row).not.toBeNull();
      expect(row!.cpi).toBeNull();
      expect(row!.gdp_growth).toBeNull();
      expect(row!.interest_rate).toBe(4.5);
    });
  });

  // ── Section 9: Graceful degradation ──────────────────────────────────────────

  describe("graceful degradation", () => {
    it("briefing continues when pollNewsFn throws (all fetchers fail)", async () => {
      seedWatchlist(db, "VCB");
      const midnight = midnightVietnamUtc();
      seedRagAnalysis(db, {
        id: "grace-ra-1",
        created_at: new Date(new Date(midnight).getTime() + 1000).toISOString(),
        impact_score: 5.0,
        source_title: "Pre-seeded story",
      });

      const briefing = await assembleBriefing({
        db,
        pollNewsFn: async () => {
          throw new Error("All RSS sources timed out");
        },
        fetchVnIndexFn: async () => null,
        briefingsDir: TEST_BRIEFINGS_DIR,
      });

      // Valid structure despite pollNews failure
      expect(briefing).toBeDefined();
      expect(typeof briefing.date).toBe("string");
      expect(Array.isArray(briefing.topStories)).toBe(true);
      // Pre-seeded story still appears
      expect(briefing.topStories.length).toBeGreaterThan(0);
    });

    it("briefing continues when fetchVnIndexFn throws (vnIndex is undefined)", async () => {
      const briefing = await assembleBriefing({
        db,
        pollNewsFn: NO_OP_POLL,
        fetchVnIndexFn: async () => {
          throw new Error("HOSE API unavailable");
        },
        briefingsDir: TEST_BRIEFINGS_DIR,
      });

      expect(briefing).toBeDefined();
      expect(briefing.vnIndex).toBeUndefined();
    });

    it("briefing with empty DB returns all empty arrays and no vnIndex", async () => {
      const briefing = await assembleBriefing({
        db,
        pollNewsFn: async () => {
          throw new Error("network error");
        },
        fetchVnIndexFn: async () => {
          throw new Error("HOSE down");
        },
        briefingsDir: TEST_BRIEFINGS_DIR,
      });

      expect(briefing.topStories).toEqual([]);
      expect(briefing.alerts).toEqual([]);
      expect(briefing.watchlistSummary).toEqual([]);
      expect(briefing.newReports).toEqual([]);
      expect(briefing.vnIndex).toBeUndefined();
    });

    it("pollNews with all four sources failing returns errors=4 but no crash", async () => {
      const result = await pollNews({
        fetchers: {
          cafef: async () => { throw new Error("CafeF timeout"); },
          vnexpress: async () => { throw new Error("VnExpress timeout"); },
          reuters: async () => { throw new Error("Reuters timeout"); },
          vneconomy: async () => { throw new Error("VnEconomy timeout"); },
          tradingeconomics: async () => { throw new Error("TE timeout"); },
        },
        db,
        ragRetriever: async () => [],
        watchlist: [],
      });

      expect(result.errors).toBe(5);
      expect(result.fetched).toBe(0);
      expect(result.inserted).toBe(0);
    });
  });

  // ── Section 10: File persistence ────────────────────────────────────────────

  describe("file persistence", () => {
    it("briefing is persisted to briefingsDir/YYYY-MM-DD.json", async () => {
      const briefing = await assembleBriefing({
        db,
        pollNewsFn: NO_OP_POLL,
        fetchVnIndexFn: async () => ({ price: 1270.0, changePct: -0.3 }),
        briefingsDir: TEST_BRIEFINGS_DIR,
      });

      const expectedPath = join(TEST_BRIEFINGS_DIR, `${briefing.date}.json`);
      expect(existsSync(expectedPath)).toBe(true);

      const parsed = JSON.parse(readFileSync(expectedPath, "utf-8")) as DailyBriefing;
      expect(parsed.date).toBe(briefing.date);
      expect(parsed.generatedAt).toBe(briefing.generatedAt);
      expect(Array.isArray(parsed.topStories)).toBe(true);
      expect(Array.isArray(parsed.alerts)).toBe(true);
      expect(Array.isArray(parsed.watchlistSummary)).toBe(true);
      expect(Array.isArray(parsed.newReports)).toBe(true);
    });

    it("briefing file includes vnIndex when present", async () => {
      const briefing = await assembleBriefing({
        db,
        pollNewsFn: NO_OP_POLL,
        fetchVnIndexFn: async () => ({ price: 1295.0, changePct: 0.85 }),
        briefingsDir: TEST_BRIEFINGS_DIR,
      });

      const path = join(TEST_BRIEFINGS_DIR, `${briefing.date}.json`);
      const parsed = JSON.parse(readFileSync(path, "utf-8")) as DailyBriefing;
      expect(parsed.vnIndex).toBeDefined();
      expect(parsed.vnIndex!.price).toBe(1295.0);
    });

    it("re-running assembleBriefing overwrites the file (idempotent)", async () => {
      // First run (no watchlist)
      const b1 = await assembleBriefing({
        db,
        pollNewsFn: NO_OP_POLL,
        fetchVnIndexFn: async () => null,
        briefingsDir: TEST_BRIEFINGS_DIR,
      });

      // Add watchlist then re-run
      seedWatchlist(db, "ACB");
      const b2 = await assembleBriefing({
        db,
        pollNewsFn: NO_OP_POLL,
        fetchVnIndexFn: async () => null,
        briefingsDir: TEST_BRIEFINGS_DIR,
      });

      const path = join(TEST_BRIEFINGS_DIR, `${b2.date}.json`);
      const parsed = JSON.parse(readFileSync(path, "utf-8")) as DailyBriefing;

      // Second run overwrites — watchlist has 1 entry now
      expect(parsed.watchlistSummary.length).toBe(1);
      expect(parsed.watchlistSummary[0]!.code).toBe("ACB");

      // Both runs should have same date
      expect(b1.date).toBe(b2.date);
    });
  });

  // ── Section 11: Evening Summary flow ────────────────────────────────────────

  describe("Evening Summary flow", () => {
    it("assembleEveningSummary returns a valid EveningSummary on empty DB", async () => {
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
    });

    it("evening summary date matches today in Vietnam timezone", async () => {
      const summary = await assembleEveningSummary({
        db,
        reportsDir: TEST_REPORTS_DIR,
      });

      expect(summary.date).toBe(todayVietnam());
    });

    it("topAlerts sorted by severity DESC (critical > warning > info)", async () => {
      const now = new Date().toISOString();
      seedAlert(db, { id: "ev-al-1", triggered_at: now, severity: "info", message: "Info" });
      seedAlert(db, { id: "ev-al-2", triggered_at: now, severity: "critical", message: "Critical" });
      seedAlert(db, { id: "ev-al-3", triggered_at: now, severity: "warning", message: "Warning" });

      const summary = await assembleEveningSummary({ db, reportsDir: TEST_REPORTS_DIR });

      expect(summary.topAlerts.length).toBe(3);
      expect(summary.topAlerts[0]!.severity).toBe("critical");
      expect(summary.topAlerts[1]!.severity).toBe("warning");
      expect(summary.topAlerts[2]!.severity).toBe("info");
    });

    it("watchlistMovers includes only stocks with |changePct| >= 1.0", async () => {
      seedWatchlist(db, "VCB");
      seedWatchlist(db, "TCB");
      seedWatchlist(db, "FPT");

      seedMarketPrice(db, "VCB", 90000, 2.5);   // included
      seedMarketPrice(db, "TCB", 45000, -1.2);  // included (negative, abs >= 1.0)
      seedMarketPrice(db, "FPT", 80000, 0.4);   // excluded (abs < 1.0)

      const summary = await assembleEveningSummary({ db, reportsDir: TEST_REPORTS_DIR });

      const codes = summary.watchlistMovers.map((m) => m.code);
      expect(codes).toContain("VCB");
      expect(codes).toContain("TCB");
      expect(codes).not.toContain("FPT");
    });

    it("watchlistMovers sorted by |changePct| DESC", async () => {
      seedWatchlist(db, "VCB");
      seedWatchlist(db, "TCB");

      seedMarketPrice(db, "VCB", 90000, 1.8);
      seedMarketPrice(db, "TCB", 45000, -4.2); // larger abs change

      const summary = await assembleEveningSummary({ db, reportsDir: TEST_REPORTS_DIR });

      expect(summary.watchlistMovers[0]!.code).toBe("TCB");
      expect(summary.watchlistMovers[1]!.code).toBe("VCB");
    });

    it("evening summary persisted to reportsDir/YYYY-MM-DD-evening.json", async () => {
      const summary = await assembleEveningSummary({
        db,
        reportsDir: TEST_REPORTS_DIR,
      });

      const expectedPath = join(TEST_REPORTS_DIR, `${summary.date}-evening.json`);
      expect(existsSync(expectedPath)).toBe(true);

      const parsed = JSON.parse(readFileSync(expectedPath, "utf-8")) as EveningSummary;
      expect(parsed.date).toBe(summary.date);
      expect(Array.isArray(parsed.topStories)).toBe(true);
      expect(Array.isArray(parsed.topAlerts)).toBe(true);
      expect(Array.isArray(parsed.watchlistMovers)).toBe(true);
    });
  });

  // ── Section 12: Full morning + evening cycle (bookend test) ──────────────────

  describe("Full morning + evening cycle (bookend E2E)", () => {
    it("morning briefing + evening summary share the same Vietnam date", async () => {
      // Reset concurrency guards from previous tests
      const { resetMorningBriefingGuard } = await import("../scheduler/briefings/morningBriefingJob.js");
      const { resetEveningSummaryGuard } = await import("../scheduler/briefings/eveningSummaryJob.js");
      resetMorningBriefingGuard();
      resetEveningSummaryGuard();

      // Seed with explicit Vietnam midnight + 1h for story freshness,
      // but use current time for alerts (12h window query in assembleBriefing).
      const midnightUtc = new Date(midnightVietnamUtc());
      const storyTimestamp = new Date(midnightUtc.getTime() + 3600_000).toISOString();
      const alertTimestamp = new Date().toISOString(); // Current time, within 12h window

      // Shared test data
      seedWatchlist(db, "VCB", "HOSE", "banking");
      seedWatchlist(db, "HPG", "HOSE", "steel");
      seedMarketPrice(db, "VCB", 90000, 2.1);
      seedMarketPrice(db, "HPG", 55000, -1.8);
      seedRagAnalysis(db, {
        id: "cycle-ra-1",
        created_at: storyTimestamp,
        impact_score: 8.5,
        source_title: "Banking sector outlook positive",
        sentiment: "bullish",
        level: "domain",
      });
      seedAlert(db, {
        id: "cycle-al-1",
        triggered_at: alertTimestamp,
        severity: "warning",
        message: "HPG down 1.8% on commodity price pressures",
        affected_actions_json: '["HPG"]',
      });
      seedMacroIndicators(db, { cpi: 3.8, gdpGrowth: 7.09, interestRate: 4.5 });

      // Morning briefing
      const briefing = await assembleBriefing({
        db,
        pollNewsFn: NO_OP_POLL,
        fetchVnIndexFn: async () => ({ price: 1285.5, changePct: 0.42 }),
        briefingsDir: TEST_BRIEFINGS_DIR,
      });

      // Evening summary
      const summary = await assembleEveningSummary({
        db,
        reportsDir: TEST_REPORTS_DIR,
      });

      // Both share the same Vietnam date
      expect(briefing.date).toBe(summary.date);
      expect(briefing.date).toBe(todayVietnam());

      // Morning briefing assertions
      expect(briefing.topStories.length).toBeGreaterThan(0);
      expect(briefing.alerts.length).toBeGreaterThan(0);
      expect(briefing.watchlistSummary.length).toBe(2);
      expect(briefing.vnIndex).toBeDefined();
      expect(briefing.vnIndex!.price).toBe(1285.5);

      // Evening summary assertions
      expect(summary.topStories.length).toBeGreaterThan(0);
      expect(summary.topAlerts.length).toBeGreaterThan(0);
      // Both VCB (+2.1%) and HPG (-1.8%) exceed 1% threshold
      expect(summary.watchlistMovers.length).toBe(2);

      // Macro data persists through both cycles
      const macroRow = db
        .prepare("SELECT * FROM macro_indicators WHERE country = 'vietnam'")
        .get() as { cpi: number } | null;
      expect(macroRow).not.toBeNull();
      expect(macroRow!.cpi).toBe(3.8);
    });
  });

  // ── Section 13: Concurrency guards ──────────────────────────────────────────

  describe("concurrency guards", () => {
    it("runMorningBriefing skips concurrent invocation", async () => {
      const { runMorningBriefing } = await import(
        "../scheduler/briefings/morningBriefingJob.js"
      );

      let callCount = 0;
      const slowFn = async (): Promise<DailyBriefing> => {
        callCount++;
        await new Promise<void>((r) => setTimeout(r, 20));
        return {
          date: todayVietnam(),
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

      const p1 = runMorningBriefing(slowFn);
      const p2 = runMorningBriefing(slowFn); // concurrent — should be skipped

      await Promise.all([p1, p2]);

      expect(callCount).toBe(1);
    });

    it("runMorningBriefing allows sequential runs after first completes", async () => {
      const { runMorningBriefing } = await import(
        "../scheduler/briefings/morningBriefingJob.js"
      );

      let callCount = 0;
      const fastFn = async (): Promise<DailyBriefing> => {
        callCount++;
        return {
          date: todayVietnam(),
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

      await runMorningBriefing(fastFn);
      await runMorningBriefing(fastFn);

      expect(callCount).toBe(2);
    });

    it("runEveningSummary skips concurrent invocation", async () => {
      const { runEveningSummary } = await import(
        "../scheduler/briefings/eveningSummaryJob.js"
      );

      let callCount = 0;
      const slowFn = async (): Promise<EveningSummary> => {
        callCount++;
        await new Promise<void>((r) => setTimeout(r, 20));
        return {
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
        };
      };

      const p1 = runEveningSummary(slowFn);
      const p2 = runEveningSummary(slowFn); // concurrent — should be skipped

      await Promise.all([p1, p2]);

      expect(callCount).toBe(1);
    });

    it("runEveningSummary allows sequential runs after first completes", async () => {
      const { runEveningSummary } = await import(
        "../scheduler/briefings/eveningSummaryJob.js"
      );

      let callCount = 0;
      const fastFn = async (): Promise<EveningSummary> => {
        callCount++;
        return {
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
        };
      };

      await runEveningSummary(fastFn);
      await runEveningSummary(fastFn);

      expect(callCount).toBe(2);
    });
  });
});
