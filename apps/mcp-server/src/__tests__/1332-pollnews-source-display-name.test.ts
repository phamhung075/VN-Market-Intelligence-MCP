Bun.env["DB_PATH"] = ":memory:";
import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { _resetGlobalSourceTracker } from "../interface/mcp/tools/news-analysis/sourceHealthTools.js";

// ── Helper: build minimal DB with all tables pollNews needs ──────────────────

function buildPollNewsTestDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = OFF"); // relax FKs for test isolation

  // Minimal schema — only tables that pollNews / its helpers touch
  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code TEXT PRIMARY KEY,
      company_name TEXT,
      exchange TEXT NOT NULL DEFAULT 'HOSE',
      domain TEXT NOT NULL DEFAULT 'other',
      notes TEXT,
      added_at TEXT NOT NULL DEFAULT (datetime('now')),
      alert_drop_pct REAL NOT NULL DEFAULT -3,
      alert_rise_pct REAL NOT NULL DEFAULT 5,
      alert_impact_min REAL NOT NULL DEFAULT 7,
      alert_report_new INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS rag_analyses (
      id                 TEXT PRIMARY KEY,
      created_at         TEXT NOT NULL DEFAULT (datetime('now')),
      level              TEXT NOT NULL DEFAULT 'action',
      source_url         TEXT UNIQUE,
      source_title       TEXT,
      source_type        TEXT DEFAULT 'news',
      published_at       TEXT,
      sentiment          TEXT DEFAULT 'neutral',
      impact_score       REAL DEFAULT 0,
      impact_direction   TEXT DEFAULT 'neutral',
      confidence         REAL DEFAULT 0,
      time_horizon       TEXT DEFAULT 'short',
      summary            TEXT,
      reasoning          TEXT,
      affected_countries TEXT DEFAULT '[]',
      affected_domains   TEXT DEFAULT '[]',
      affected_actions   TEXT DEFAULT '[]',
      parent_ids         TEXT DEFAULT '[]',
      tags               TEXT DEFAULT '[]',
      embedding_text     TEXT
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      action_code TEXT NOT NULL,
      alert_type TEXT NOT NULL,
      severity TEXT NOT NULL,
      message TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0,
      is_notified INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tracked_indicators (
      name TEXT NOT NULL,
      value REAL NOT NULL,
      unit TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (name, fetched_at)
    );
  `);

  return db;
}

beforeEach(() => {
  _resetGlobalSourceTracker();
});

describe("Task 1332 — pollNews SOURCE_DISPLAY_NAMES: health tracked under display name", () => {
  beforeEach(() => {
    const { _resetGlobalSourceTracker } = require("../interface/mcp/tools/news-analysis/sourceHealthTools.js");
    _resetGlobalSourceTracker();
  });

  // TC-1: when reuters fetcher succeeds, globalSourceTracker records success under "Reuters RSS"
  // 30 000 ms timeout — TC-1 always runs first and triggers RAG embedding
  // model cold-start (~400 MB load, ~8-12 s). Subsequent TCs are warm.
  it("TC-1: pollNews with reuters returning items → records success under 'Reuters RSS'", async () => {
    const { pollNews } = await import("../application/usecases/pollNews.js");
    const { globalSourceTracker } = await import(
      "../interface/mcp/tools/news-analysis/sourceHealthTools.js"
    );

    const db = buildPollNewsTestDb();

    // Seed some prior failures under the display name so we can confirm reset
    globalSourceTracker.recordFailure("Reuters RSS", "prior failure");
    globalSourceTracker.recordFailure("Reuters RSS", "prior failure");
    const failuresBefore = globalSourceTracker.getHealth("Reuters RSS").consecutiveFailures;
    expect(failuresBefore).toBeGreaterThanOrEqual(2);

    await pollNews({
      db,
      watchlist: [],
      ragRetriever: async () => [],
      sleepMs: async () => {},
      fetchers: {
        reuters: async () => [{
          title: "Vietnam economy news",
          content: "nội dung tin tức Việt Nam",
          source: "reuters",
          url: "https://reuters.com/vn-test-1332-1",
          publishedAt: new Date().toISOString(),
        }],
        cafef: async () => [],
        vnexpress: async () => [],
        vneconomy: async () => [],
        tradingeconomics: async () => [],
        teChromiumNews: async () => [],
      },
    });

    const reutersHealth = globalSourceTracker.getHealth("Reuters RSS");
    // After fix: Reuters returned items → recorded under "Reuters RSS" → status ok
    expect(reutersHealth.status).toBe("ok");
    expect(reutersHealth.consecutiveFailures).toBe(0);

    db.close();
  }, 30_000);

  // TC-2: when cafef fetcher returns empty array, globalSourceTracker records failure under "CafeF RSS"
  it("TC-2: pollNews with cafef returning [] → incrementes consecutiveFailures under 'CafeF RSS'", async () => {
    const { pollNews } = await import("../application/usecases/pollNews.js");
    const { globalSourceTracker } = await import(
      "../interface/mcp/tools/news-analysis/sourceHealthTools.js"
    );

    const db = buildPollNewsTestDb();

    // Snapshot failures before poll
    const failuresBefore = globalSourceTracker.getHealth("CafeF RSS").consecutiveFailures;

    await pollNews({
      db,
      watchlist: [],
      ragRetriever: async () => [],
      sleepMs: async () => {},
      fetchers: {
        reuters: async () => [],
        cafef: async () => [], // empty — triggers recordFailure path
        vnexpress: async () => [],
        vneconomy: async () => [],
        tradingeconomics: async () => [],
        teChromiumNews: async () => [],
      },
    });

    const cafefHealth = globalSourceTracker.getHealth("CafeF RSS");
    // After fix: CafeF returned empty → recorded under "CafeF RSS" → failures incremented
    expect(cafefHealth.consecutiveFailures).toBeGreaterThan(failuresBefore);

    db.close();
  });

  // TC-3: raw key "reuters" bucket must NOT be written — verify display name used exclusively
  // Delta assertion: snapshot the raw bucket state before poll, confirm no change after.
  // Pre-fix: pollNews calls recordSuccess("reuters") → raw bucket changes (test fails)
  // Post-fix: pollNews calls recordSuccess("Reuters RSS") → raw bucket unchanged (test passes)
  it("TC-3: pollNews never writes to raw key 'reuters' bucket — display name used exclusively", async () => {
    const { pollNews } = await import("../application/usecases/pollNews.js");
    const { globalSourceTracker } = await import(
      "../interface/mcp/tools/news-analysis/sourceHealthTools.js"
    );

    const db = buildPollNewsTestDb();

    // Seed the raw "reuters" bucket with a known failure so we can detect if it changes
    globalSourceTracker.recordFailure("reuters", "sentinel-failure");
    const rawFailuresBefore = globalSourceTracker.getHealth("reuters").consecutiveFailures;
    // Ensure sentinel is set
    expect(rawFailuresBefore).toBeGreaterThan(0);

    await pollNews({
      db,
      watchlist: [],
      ragRetriever: async () => [],
      sleepMs: async () => {},
      fetchers: {
        reuters: async () => [{
          title: "Vietnam economy news",
          content: "nội dung tin tức Việt Nam",
          source: "reuters",
          url: "https://reuters.com/vn-test-1332-3",
          publishedAt: new Date().toISOString(),
        }],
        cafef: async () => [],
        vnexpress: async () => [],
        vneconomy: async () => [],
        tradingeconomics: async () => [],
        teChromiumNews: async () => [],
      },
    });

    // After fix: raw "reuters" bucket is NOT written — sentinel failure count preserved
    // Pre-fix: pollNews calls recordSuccess("reuters") → resets consecutiveFailures to 0 → test fails
    const rawAfter = globalSourceTracker.getHealth("reuters");
    expect(rawAfter.consecutiveFailures).toBe(rawFailuresBefore);

    db.close();
  });

  // TC-4: unknown fetcher key passthrough — key with no mapping uses raw key unchanged
  it("TC-4: pollNews with unknown fetcher key uses raw key as fallback display name", async () => {
    const { pollNews } = await import("../application/usecases/pollNews.js");
    const { globalSourceTracker } = await import(
      "../interface/mcp/tools/news-analysis/sourceHealthTools.js"
    );

    const db = buildPollNewsTestDb();

    const failuresBefore = globalSourceTracker.getHealth("unknown_source_xyz").consecutiveFailures;

    await pollNews({
      db,
      watchlist: [],
      ragRetriever: async () => [],
      sleepMs: async () => {},
      fetchers: {
        reuters: async () => [],
        cafef: async () => [],
        vnexpress: async () => [],
        vneconomy: async () => [],
        tradingeconomics: async () => [],
        teChromiumNews: async () => [],
        // "unknown_source_xyz" has no entry in SOURCE_DISPLAY_NAMES
        // so it should fall back to the raw key
        unknown_source_xyz: async () => [{
          title: "Vietnam economy news",
          content: "nội dung tin tức Việt Nam",
          source: "unknown_source_xyz",
          url: "https://example.com/vn-test-1332-4",
          publishedAt: new Date().toISOString(),
        }],
      },
    });

    // After fix: unknown key falls back to raw name — records success under "unknown_source_xyz"
    const unknownHealth = globalSourceTracker.getHealth("unknown_source_xyz");
    expect(unknownHealth.status).toBe("ok");
    expect(unknownHealth.consecutiveFailures).toBe(0);

    db.close();
  });
});
