/**
 * Task 1288 — PollNewsResult shape mismatch
 *
 * Root cause: pollNews() increments `errors` for empty-result fetchers
 * (Task 1227 change). Test 102 expects `errors` to count only
 * thrown exceptions, not empty-array results.
 *
 * Fix contract:
 *   - `errors` counts sources that THREW an exception
 *   - `globalSourceTracker.recordFailure()` is still called for empty results
 *     (health-tracking concern, not error-counting concern)
 *   - Empty fetcher results do NOT increment `errors`
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

function buildDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code TEXT PRIMARY KEY,
      exchange TEXT NOT NULL DEFAULT 'HOSE',
      domain TEXT NOT NULL DEFAULT 'other',
      added_at TEXT NOT NULL DEFAULT (datetime('now')),
      alert_drop_pct REAL NOT NULL DEFAULT -3,
      alert_rise_pct REAL NOT NULL DEFAULT 5,
      alert_impact_min REAL NOT NULL DEFAULT 7,
      alert_report_new INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS rag_analyses (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      level TEXT NOT NULL,
      source_url TEXT,
      source_title TEXT,
      source_type TEXT,
      published_at TEXT,
      sentiment TEXT,
      impact_score REAL,
      impact_direction TEXT,
      confidence REAL,
      time_horizon TEXT,
      summary TEXT,
      reasoning TEXT,
      affected_countries TEXT,
      affected_domains TEXT,
      affected_actions TEXT,
      parent_ids TEXT,
      tags TEXT,
      embedding_text TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_rag_source_url
      ON rag_analyses(source_url)
      WHERE source_url IS NOT NULL AND source_url != '';

    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      triggered_at TEXT NOT NULL,
      severity TEXT NOT NULL,
      signals_json TEXT,
      affected_actions_json TEXT,
      analysis_ids_json TEXT,
      message TEXT,
      read INTEGER NOT NULL DEFAULT 0,
      user_note TEXT
    );
  `);
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

describe("Task 1288 — PollNewsResult shape: errors counts only thrown exceptions", () => {
  it("errors = 0 when all 5 fetchers return empty arrays", async () => {
    const { pollNews } = await import("../application/usecases/pollNews.js");
    const db = buildDb();

    const result = await pollNews({
      fetchers: {
        cafef: async () => [],
        vnexpress: async () => [],
        reuters: async () => [],
        vneconomy: async () => [],
        tradingeconomics: async () => [],
      },
      db,
      ragRetriever: async () => [],
      watchlist: [],
    });

    expect(result.errors).toBe(0);
    expect(result.fetched).toBe(0);
    expect(result.inserted).toBe(0);

    db.close();
  });

  it("errors = 0 when some fetchers return items and others return empty", async () => {
    const { pollNews } = await import("../application/usecases/pollNews.js");
    const db = buildDb();

    const result = await pollNews({
      fetchers: {
        cafef: async () => [
          { title: "Article 1", url: "https://cafef.vn/a1", publishedAt: new Date().toISOString(), content: "content", source: "cafef" },
          { title: "Article 2", url: "https://cafef.vn/a2", publishedAt: new Date().toISOString(), content: "content", source: "cafef" },
        ],
        vnexpress: async () => [],
        reuters: async () => [],
        vneconomy: async () => [],
        tradingeconomics: async () => [],
      },
      db,
      ragRetriever: async () => [],
      watchlist: [],
    });

    expect(result.errors).toBe(0);
    expect(result.fetched).toBe(2);

    db.close();
  });

  it("errors = 1 when exactly one fetcher throws, others succeed (with items or empty)", async () => {
    const { pollNews } = await import("../application/usecases/pollNews.js");
    const db = buildDb();

    const result = await pollNews({
      fetchers: {
        cafef: async () => { throw new Error("network failure"); },
        vnexpress: async () => [
          { title: "VnExpress article", url: "https://vnexpress.net/a1", publishedAt: new Date().toISOString(), content: "content", source: "vnexpress" },
        ],
        reuters: async () => [],
        vneconomy: async () => [],
        tradingeconomics: async () => [],
      },
      db,
      ragRetriever: async () => [],
      watchlist: [],
    });

    expect(result.errors).toBe(1);
    expect(result.fetched).toBe(1);

    db.close();
  });

  it("errors = N when N fetchers throw exceptions", async () => {
    const { pollNews } = await import("../application/usecases/pollNews.js");
    const db = buildDb();

    const result = await pollNews({
      fetchers: {
        cafef: async () => { throw new Error("cafef down"); },
        vnexpress: async () => { throw new Error("vnexpress down"); },
        reuters: async () => [],
        vneconomy: async () => [],
        tradingeconomics: async () => [],
      },
      db,
      ragRetriever: async () => [],
      watchlist: [],
    });

    expect(result.errors).toBe(2);
    expect(result.fetched).toBe(0);

    db.close();
  });
});
