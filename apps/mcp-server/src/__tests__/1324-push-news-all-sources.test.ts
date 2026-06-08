Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1325 — TDD test for Task 1324 (push-news: all 9 VPS sources wired into pollNews)
 *
 * Tests confirm that when all 9 VPS sources (cafef, vnexpress, vneconomy,
 * vietstock, vietnambiz, vnbusiness, tuoitre, nhandan, nld) are provided as
 * fetchers, pollNews calls each one and stores results in rag_analyses.
 *
 * Pattern mirrors src/__tests__/102-job-news-poll.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import type { SourceFetchers } from "../application/usecases/pollNews.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test DB setup
// ─────────────────────────────────────────────────────────────────────────────

let testDb: Database;

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
      user_note             TEXT
    );
  `);
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock RssItem factory
// ─────────────────────────────────────────────────────────────────────────────

function makeRssItem(url: string, source: string, title = "Test article") {
  return {
    title,
    url,
    publishedAt: new Date().toISOString(),
    content: "Nội dung về thị trường chứng khoán Việt Nam và ngân hàng VCB.",
    source,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("push-news: all 9 VPS sources wired into pollNews", () => {
  beforeEach(() => {
    testDb = setupTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  it("accepts vietstock items via fetcher injection", async () => {
    const { pollNews } = await import("../application/usecases/pollNews.js");

    const result = await pollNews({
      fetchers: {
        cafef: async () => [],
        vnexpress: async () => [],
        reuters: async () => [],
        vneconomy: async () => [],
        tradingeconomics: async () => [],
        vietstock: async () => [makeRssItem("https://vietstock.vn/a1", "vietstock", "Vietstock bai viet 1")],
      },
      db: testDb,
      ragRetriever: async () => [],
      watchlist: [],
    });

    expect(result.inserted).toBeGreaterThanOrEqual(1);
    expect(result.errors).toBe(0);

    const rows = testDb.prepare("SELECT COUNT(*) as cnt FROM rag_analyses").get() as { cnt: number };
    expect(rows.cnt).toBeGreaterThanOrEqual(1);
  });

  it("accepts vietnambiz items via fetcher injection", async () => {
    const { pollNews } = await import("../application/usecases/pollNews.js");

    const result = await pollNews({
      fetchers: {
        cafef: async () => [],
        vnexpress: async () => [],
        reuters: async () => [],
        vneconomy: async () => [],
        tradingeconomics: async () => [],
        vietnambiz: async () => [makeRssItem("https://vietnambiz.vn/a1", "vietnambiz", "Vietnambiz bai viet 1")],
      },
      db: testDb,
      ragRetriever: async () => [],
      watchlist: [],
    });

    expect(result.inserted).toBeGreaterThanOrEqual(1);
    expect(result.errors).toBe(0);
  });

  it("accepts vnbusiness items via fetcher injection", async () => {
    const { pollNews } = await import("../application/usecases/pollNews.js");

    const result = await pollNews({
      fetchers: {
        cafef: async () => [],
        vnexpress: async () => [],
        reuters: async () => [],
        vneconomy: async () => [],
        tradingeconomics: async () => [],
        vnbusiness: async () => [makeRssItem("https://vnbusiness.vn/a1", "vnbusiness", "VnBusiness bai viet 1")],
      },
      db: testDb,
      ragRetriever: async () => [],
      watchlist: [],
    });

    expect(result.inserted).toBeGreaterThanOrEqual(1);
    expect(result.errors).toBe(0);
  });

  it("accepts tuoitre items via fetcher injection", async () => {
    const { pollNews } = await import("../application/usecases/pollNews.js");

    const result = await pollNews({
      fetchers: {
        cafef: async () => [],
        vnexpress: async () => [],
        reuters: async () => [],
        vneconomy: async () => [],
        tradingeconomics: async () => [],
        tuoitre: async () => [makeRssItem("https://tuoitre.vn/a1", "tuoitre", "Tuoi Tre kinh doanh 1")],
      },
      db: testDb,
      ragRetriever: async () => [],
      watchlist: [],
    });

    expect(result.inserted).toBeGreaterThanOrEqual(1);
    expect(result.errors).toBe(0);
  });

  it("accepts nhandan items via fetcher injection", async () => {
    const { pollNews } = await import("../application/usecases/pollNews.js");

    const result = await pollNews({
      fetchers: {
        cafef: async () => [],
        vnexpress: async () => [],
        reuters: async () => [],
        vneconomy: async () => [],
        tradingeconomics: async () => [],
        nhandan: async () => [makeRssItem("https://nhandan.vn/a1", "nhandan", "Nhan Dan kinh te 1")],
      },
      db: testDb,
      ragRetriever: async () => [],
      watchlist: [],
    });

    expect(result.inserted).toBeGreaterThanOrEqual(1);
    expect(result.errors).toBe(0);
  });

  it("accepts nld items via fetcher injection", async () => {
    const { pollNews } = await import("../application/usecases/pollNews.js");

    const result = await pollNews({
      fetchers: {
        cafef: async () => [],
        vnexpress: async () => [],
        reuters: async () => [],
        vneconomy: async () => [],
        tradingeconomics: async () => [],
        nld: async () => [makeRssItem("https://nld.com.vn/a1", "nld", "NLD tai chinh 1")],
      },
      db: testDb,
      ragRetriever: async () => [],
      watchlist: [],
    });

    expect(result.inserted).toBeGreaterThanOrEqual(1);
    expect(result.errors).toBe(0);
  });

  it("inserts items from all 9 sources in a single pollNews call", async () => {
    const { pollNews } = await import("../application/usecases/pollNews.js");

    const result = await pollNews({
      fetchers: {
        cafef:            async () => [makeRssItem("https://cafef.vn/all-9-a1",      "cafef",      "CafeF all-9")],
        vnexpress:        async () => [makeRssItem("https://vnexpress.net/all-9-a1",  "vnexpress",  "VnExpress all-9")],
        reuters:          async () => [makeRssItem("https://reuters.com/all-9-a1",    "reuters",    "Reuters all-9")],
        vneconomy:        async () => [makeRssItem("https://vneconomy.vn/all-9-a1",  "vneconomy",  "VnEconomy all-9")],
        tradingeconomics: async () => [makeRssItem("https://tradingeconomics.com/a1", "tradingeconomics", "TE all-9")],
        vietstock:        async () => [makeRssItem("https://vietstock.vn/all-9-a1",  "vietstock",  "Vietstock all-9")],
        vietnambiz:       async () => [makeRssItem("https://vietnambiz.vn/all-9-a1", "vietnambiz", "Vietnambiz all-9")],
        vnbusiness:       async () => [makeRssItem("https://vnbusiness.vn/all-9-a1", "vnbusiness", "VnBusiness all-9")],
        tuoitre:          async () => [makeRssItem("https://tuoitre.vn/all-9-a1",   "tuoitre",    "TuoiTre all-9")],
        nhandan:          async () => [makeRssItem("https://nhandan.vn/all-9-a1",   "nhandan",    "NhanDan all-9")],
        nld:              async () => [makeRssItem("https://nld.com.vn/all-9-a1",   "nld",        "NLD all-9")],
      },
      db: testDb,
      ragRetriever: async () => [],
      watchlist: [],
    });

    // 11 items from 11 distinct fetchers (9 VPS + reuters + tradingeconomics)
    expect(result.fetched).toBe(11);
    expect(result.inserted).toBe(11);
    expect(result.errors).toBe(0);

    const rows = testDb.prepare("SELECT COUNT(*) as cnt FROM rag_analyses").get() as { cnt: number };
    expect(rows.cnt).toBe(11);
  });

  it("does not invoke undefined fetchers for absent VPS-only sources", async () => {
    const { pollNews } = await import("../application/usecases/pollNews.js");

    // Only cafef provided — VPS-only sources omitted (undefined)
    // pollNews must not throw even when 6 VPS keys are absent
    const result = await pollNews({
      fetchers: {
        cafef:    async () => [makeRssItem("https://cafef.vn/absent-test", "cafef", "CafeF absent test")],
        vnexpress: async () => [],
        reuters:  async () => [],
        vneconomy: async () => [],
        tradingeconomics: async () => [],
        // vietstock, vietnambiz, vnbusiness, tuoitre, nhandan, nld: NOT provided
      },
      db: testDb,
      ragRetriever: async () => [],
      watchlist: [],
    });

    expect(result.inserted).toBeGreaterThanOrEqual(1);
    expect(result.errors).toBe(0);
  });

  // ── TC-2: Regression — existing cafef + vnexpress still work ────────────

  it("regression: cafef and vnexpress items still processed correctly", async () => {
    const { pollNews } = await import("../application/usecases/pollNews.js");

    const result = await pollNews({
      fetchers: {
        cafef:    async () => [
          makeRssItem("https://cafef.vn/reg-a1", "cafef", "CafeF regression 1"),
          makeRssItem("https://cafef.vn/reg-a2", "cafef", "CafeF regression 2"),
        ],
        vnexpress: async () => [makeRssItem("https://vnexpress.net/reg-a1", "vnexpress", "VnExpress regression 1")],
        reuters:  async () => [],
        vneconomy: async () => [],
        tradingeconomics: async () => [],
      },
      db: testDb,
      ragRetriever: async () => [],
      watchlist: [],
    });

    expect(result.inserted).toBeGreaterThanOrEqual(1);
    expect(result.errors).toBe(0);
    expect(result.fetched).toBe(3);
  });

  // ── TC-3: Unknown source key — no crash ─────────────────────────────────

  it("unknown source key does not crash pollNews", async () => {
    const { pollNews } = await import("../application/usecases/pollNews.js");

    // Simulate an unknown/future source key from VPS using the index signature
    const fetchers: SourceFetchers = {
      cafef: async () => [],
      vnexpress: async () => [],
      reuters: async () => [],
      vneconomy: async () => [],
      tradingeconomics: async () => [],
      xyz: async () => [makeRssItem("https://xyz.example.com/a1", "xyz", "Unknown source article")],
    };

    let threw = false;
    try {
      await pollNews({
        fetchers,
        db: testDb,
        ragRetriever: async () => [],
        watchlist: [],
      });
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
  });
});
