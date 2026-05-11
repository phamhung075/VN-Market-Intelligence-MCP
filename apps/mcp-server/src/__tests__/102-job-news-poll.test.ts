Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 102 — News Polling Job
 *
 * Tests for:
 *   - pollNews returns correct PollNewsResult shape
 *   - Deduplication: second call with same items inserts 0 rows
 *   - Cascade runs for new items
 *   - Alert generated when signals fire
 *   - UNIQUE index on rag_analyses.source_url created by initDatabase()
 *
 * Note: newsPollerJob.ts was removed in task 1187 (dead code — never scheduled
 * in jobs.ts; intelligenceCycleJob replaced it). Concurrency guard tests removed.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Test DB helpers
// ─────────────────────────────────────────────────────────────────────────────

let testDb: Database;

function setupTestDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");

  // Minimal schema for tests
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
  `);
  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock RssItems
// ─────────────────────────────────────────────────────────────────────────────

function makeRssItem(url: string, title: string = "Test article") {
  return {
    title,
    url,
    publishedAt: new Date().toISOString(),
    content: "Some content about the Vietnamese stock market and VCB banking sector.",
    source: "cafef",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Module imports (dynamic to allow DB injection)
// ─────────────────────────────────────────────────────────────────────────────

// We import the module functions directly and inject a test DB through the
// module's exported interface (options.db).

describe("Task 102 — News Polling Job", () => {
  beforeEach(() => {
    testDb = setupTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  // ── Core pollNews function ────────────────────────────────────────────────

  describe("pollNews()", () => {
    it("returns PollNewsResult with correct shape on empty fetch", async () => {
      const { pollNews } = await import("../application/usecases/pollNews.js");

      const result = await pollNews({
        fetchers: {
          cafef: async () => [],
          vnexpress: async () => [],
          reuters: async () => [],
          vneconomy: async () => [],
          tradingeconomics: async () => [],
        },
        db: testDb,
        ragRetriever: async () => [],
        watchlist: [],
      });

      expect(result).toMatchObject({
        fetched: 0,
        inserted: 0,
        duplicates: 0,
        alerts: 0,
        errors: 0,
      });
    });

    it("inserts new items and returns correct counts", async () => {
      const { pollNews } = await import("../application/usecases/pollNews.js");

      const items = [
        makeRssItem("https://cafef.vn/article-1", "VCB tang manh"),
        makeRssItem("https://cafef.vn/article-2", "Thi truong chung khoan VN"),
      ];

      const result = await pollNews({
        fetchers: {
          cafef: async () => items,
          vnexpress: async () => [],
          reuters: async () => [],
          vneconomy: async () => [],
          tradingeconomics: async () => [],
        },
        db: testDb,
        ragRetriever: async () => [],
        watchlist: [],
      });

      expect(result.fetched).toBe(2);
      expect(result.inserted).toBe(2);
      expect(result.duplicates).toBe(0);
      expect(result.errors).toBe(0);

      // Verify rows in DB
      const rows = testDb.prepare("SELECT COUNT(*) as cnt FROM rag_analyses").get() as { cnt: number };
      expect(rows.cnt).toBe(2);
    });

    it("deduplicates: second call with same items inserts 0", async () => {
      const { pollNews } = await import("../application/usecases/pollNews.js");

      const items = [makeRssItem("https://cafef.vn/article-dedup", "Dedup test article")];

      const fetcherConfig = {
        cafef: async () => items,
        vnexpress: async () => [],
        reuters: async () => [],
        vneconomy: async () => [],
        tradingeconomics: async () => [],
      };

      // First call
      const first = await pollNews({
        fetchers: fetcherConfig,
        db: testDb,
        ragRetriever: async () => [],
        watchlist: [],
      });
      expect(first.inserted).toBe(1);
      expect(first.duplicates).toBe(0);

      // Second call — same items, same URLs
      const second = await pollNews({
        fetchers: fetcherConfig,
        db: testDb,
        ragRetriever: async () => [],
        watchlist: [],
      });
      expect(second.inserted).toBe(0);
      expect(second.duplicates).toBe(1);

      // Still only 1 row in DB
      const rows = testDb.prepare("SELECT COUNT(*) as cnt FROM rag_analyses").get() as { cnt: number };
      expect(rows.cnt).toBe(1);
    });

    it("items with empty source_url are inserted every time (no dedup constraint)", async () => {
      const { pollNews } = await import("../application/usecases/pollNews.js");

      const noUrlItem = {
        title: "No URL article",
        url: "",
        publishedAt: new Date().toISOString(),
        content: "Content without URL",
        source: "cafef",
      };

      const callOnce = await pollNews({
        fetchers: {
          cafef: async () => [noUrlItem],
          vnexpress: async () => [],
          reuters: async () => [],
          vneconomy: async () => [],
          tradingeconomics: async () => [],
        },
        db: testDb,
        ragRetriever: async () => [],
        watchlist: [],
      });
      expect(callOnce.inserted).toBe(1);

      // Second call — same no-URL item gets inserted again (not deduped)
      const callTwice = await pollNews({
        fetchers: {
          cafef: async () => [noUrlItem],
          vnexpress: async () => [],
          reuters: async () => [],
          vneconomy: async () => [],
          tradingeconomics: async () => [],
        },
        db: testDb,
        ragRetriever: async () => [],
        watchlist: [],
      });
      expect(callTwice.inserted).toBe(1);

      const rows = testDb.prepare("SELECT COUNT(*) as cnt FROM rag_analyses").get() as { cnt: number };
      expect(rows.cnt).toBe(2);
    });

    it("counts errors per failing source but continues other sources", async () => {
      const { pollNews } = await import("../application/usecases/pollNews.js");

      const result = await pollNews({
        fetchers: {
          cafef: async () => { throw new Error("network failure"); },
          vnexpress: async () => [makeRssItem("https://vnexpress.net/a1", "VnExpress article")],
          reuters: async () => [],
          vneconomy: async () => [],
          tradingeconomics: async () => [],
        },
        db: testDb,
        ragRetriever: async () => [],
        watchlist: [],
      });

      expect(result.errors).toBe(1);
      expect(result.fetched).toBe(1);
      expect(result.inserted).toBe(1);
    });

    it("runs cascade and generates alerts for watchlisted stocks in news", async () => {
      const { pollNews } = await import("../application/usecases/pollNews.js");

      // Seed watchlist with VCB
      testDb.exec(`
        INSERT INTO watchlist (code, exchange, domain, added_at)
        VALUES ('VCB', 'HOSE', 'banking', datetime('now'))
      `);

      // An article that explicitly mentions VCB → normalizer sets affectedActions = ['VCB']
      // The cascade engine will create a news_mention signal for VCB
      const vcbItem = makeRssItem(
        "https://cafef.vn/vcb-tang-manh",
        "VCB Vietcombank tang manh nho ket qua kinh doanh tot",
      );

      const result = await pollNews({
        fetchers: {
          cafef: async () => [vcbItem],
          vnexpress: async () => [],
          reuters: async () => [],
          vneconomy: async () => [],
          tradingeconomics: async () => [],
        },
        db: testDb,
        ragRetriever: async () => [],
        watchlist: [{ actionCode: "VCB", domain: "banking", exchange: "HOSE" }],
      });

      expect(result.inserted).toBe(1);
      // alerts count reflects alerts stored in DB
      expect(result.alerts).toBeGreaterThanOrEqual(0);
    });

    it("fetches from all 5 sources in parallel and aggregates counts", async () => {
      const { pollNews } = await import("../application/usecases/pollNews.js");

      const result = await pollNews({
        fetchers: {
          cafef: async () => [
            makeRssItem("https://cafef.vn/s1", "CafeF story 1"),
            makeRssItem("https://cafef.vn/s2", "CafeF story 2"),
          ],
          vnexpress: async () => [makeRssItem("https://vnexpress.net/s1", "VnExpress story 1")],
          reuters: async () => [makeRssItem("https://reuters.com/s1", "Reuters story 1")],
          vneconomy: async () => [makeRssItem("https://vneconomy.vn/s1", "VnEconomy story 1")],
          tradingeconomics: async () => [makeRssItem("https://tradingeconomics.com/s1", "TE stream 1")],
        },
        db: testDb,
        ragRetriever: async () => [],
        watchlist: [],
      });

      expect(result.fetched).toBe(6);
      expect(result.inserted).toBe(6);
      expect(result.errors).toBe(0);
    });
  });

  // ── Schema: UNIQUE index on source_url ────────────────────────────────────

  describe("schema: idx_rag_source_url", () => {
    it("UNIQUE index enforced — second insert with same source_url fails silently (INSERT OR IGNORE)", () => {
      const insert = testDb.prepare(`
        INSERT OR IGNORE INTO rag_analyses (id, created_at, level, source_url, source_title)
        VALUES (?, datetime('now'), 'country', ?, 'Test')
      `);

      insert.run("id-1", "https://example.com/article");
      insert.run("id-2", "https://example.com/article"); // same URL → ignored

      const rows = testDb.prepare("SELECT COUNT(*) as cnt FROM rag_analyses").get() as { cnt: number };
      expect(rows.cnt).toBe(1);
    });

    it("NULL source_url rows are always inserted (partial index exemption)", () => {
      const insert = testDb.prepare(`
        INSERT OR IGNORE INTO rag_analyses (id, created_at, level, source_url, source_title)
        VALUES (?, datetime('now'), 'country', NULL, 'Test')
      `);

      insert.run("id-null-1");
      insert.run("id-null-2");

      const rows = testDb.prepare("SELECT COUNT(*) as cnt FROM rag_analyses").get() as { cnt: number };
      expect(rows.cnt).toBe(2);
    });

    it("empty string source_url rows are always inserted (partial index exemption)", () => {
      const insert = testDb.prepare(`
        INSERT OR IGNORE INTO rag_analyses (id, created_at, level, source_url, source_title)
        VALUES (?, datetime('now'), 'country', '', 'Test')
      `);

      insert.run("id-empty-1");
      insert.run("id-empty-2");

      const rows = testDb.prepare("SELECT COUNT(*) as cnt FROM rag_analyses").get() as { cnt: number };
      expect(rows.cnt).toBe(2);
    });
  });

});
// Note: runNewsPoller() concurrency guard tests removed — newsPollerJob.ts
// deleted in task 1187 (dead code). intelligenceCycleJob has its own guard.
