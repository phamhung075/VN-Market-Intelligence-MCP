Bun.env["DB_PATH"] = ":memory:";
import { describe, it, expect } from "bun:test";
import { SourceHealthTracker } from "../domain/services/sourceHealthTracker.js";

// ── Helper: build minimal DB with all tables pollNews needs ──────────────────

import { Database } from "bun:sqlite";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

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

  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

describe("Task 1227 — Source health table not updating on transient fetch failure", () => {
  // ── SourceHealthTracker domain logic ─────────────────────────────────────

  it("recordSuccess: status becomes ok, consecutiveFailures resets to 0", () => {
    const tracker = new SourceHealthTracker();
    tracker.recordFailure("Reuters RSS", "timeout");
    tracker.recordFailure("Reuters RSS", "timeout");
    tracker.recordSuccess("Reuters RSS");

    const h = tracker.getHealth("Reuters RSS");
    expect(h.status).toBe("ok");
    expect(h.consecutiveFailures).toBe(0);
    expect(h.lastErrorMessage).toBeNull();
  });

  it("recordFailure: increments consecutiveFailures and sets degraded after 1 failure", () => {
    const tracker = new SourceHealthTracker();
    tracker.recordFailure("Reuters RSS", "empty result — no items returned");

    const h = tracker.getHealth("Reuters RSS");
    expect(h.status).toBe("degraded");
    expect(h.consecutiveFailures).toBe(1);
    expect(h.lastErrorMessage).toBe("empty result — no items returned");
  });

  it("recordFailure: status becomes down after 5 consecutive failures", () => {
    const tracker = new SourceHealthTracker();
    for (let i = 0; i < 5; i++) {
      tracker.recordFailure("Reuters RSS", "timeout");
    }
    const h = tracker.getHealth("Reuters RSS");
    expect(h.status).toBe("down");
    expect(h.consecutiveFailures).toBe(5);
  });

  it("recordFailure preserves lastSuccessAt from previous success", () => {
    const tracker = new SourceHealthTracker();
    tracker.recordSuccess("Reuters RSS");
    const successTime = tracker.getHealth("Reuters RSS").lastSuccessAt;
    tracker.recordFailure("Reuters RSS", "network error");

    const h = tracker.getHealth("Reuters RSS");
    expect(h.lastSuccessAt).toBe(successTime);
    expect(h.consecutiveFailures).toBe(1);
  });

  // ── pollNews empty-result → recordFailure behavior ────────────────────────

  it("pollNews: calls recordFailure on globalSourceTracker when Reuters returns empty array", async () => {
    const { pollNews } = await import("../application/usecases/pollNews.js");
    const { globalSourceTracker } = await import(
      "../interface/mcp/tools/news-analysis/sourceHealthTools.js"
    );

    const db = buildPollNewsTestDb();

    // Snapshot failures/successes before poll
    const failuresBefore = globalSourceTracker.getHealth("Reuters RSS").consecutiveFailures;

    await pollNews({
      db,
      watchlist: [], // empty watchlist — skip cascade
      fetchers: {
        reuters: async () => [],  // empty — simulates silent geo-block
        cafef: async () => [{
          title: "VN market news",
          content: "content",
          source: "cafef",
          url: "https://cafef.vn/unique-1",
          publishedAt: new Date().toISOString(),
        }],
        vnexpress: async () => [],
        vneconomy: async () => [],
        tradingeconomics: async () => [],
      },
    });

    const reutersHealth = globalSourceTracker.getHealth("Reuters RSS");

    // Reuters returned empty → consecutiveFailures should have incremented
    expect(reutersHealth.consecutiveFailures).toBeGreaterThan(failuresBefore);
    expect(reutersHealth.lastErrorMessage).toContain("empty");
    // Status should be degraded (not ok) since we had at least 1 failure
    expect(reutersHealth.status).not.toBe("ok");

    db.close();
  });

  it("pollNews: calls recordSuccess when Reuters returns items (no regression)", async () => {
    const { pollNews } = await import("../application/usecases/pollNews.js");
    const { globalSourceTracker } = await import(
      "../interface/mcp/tools/news-analysis/sourceHealthTools.js"
    );

    const db = buildPollNewsTestDb();

    // Seed some prior failures so we can confirm success resets them.
    // NOTE: globalSourceTracker is a singleton — may have residual failures
    // from other tests; capture current count and add 2 more.
    const failuresBefore = globalSourceTracker.getHealth("Reuters RSS").consecutiveFailures;
    globalSourceTracker.recordFailure("Reuters RSS", "prior failure");
    globalSourceTracker.recordFailure("Reuters RSS", "prior failure");
    expect(globalSourceTracker.getHealth("Reuters RSS").consecutiveFailures).toBe(failuresBefore + 2);

    await pollNews({
      db,
      watchlist: [],
      fetchers: {
        reuters: async () => [{
          title: "Vietnam economy news",
          content: "content from google news",
          source: "reuters",
          url: "https://news.google.com/vn-test-1",
          publishedAt: new Date().toISOString(),
        }],
        cafef: async () => [],
        vnexpress: async () => [],
        vneconomy: async () => [],
        tradingeconomics: async () => [],
      },
    });

    const reutersHealth = globalSourceTracker.getHealth("Reuters RSS");
    // Reuters returned items → should be ok with 0 failures
    expect(reutersHealth.status).toBe("ok");
    expect(reutersHealth.consecutiveFailures).toBe(0);

    db.close();
  });

  // ── Status classification after empty-result failure ─────────────────────

  it("source health shows degraded after one empty-result recordFailure", () => {
    const tracker = new SourceHealthTracker();
    tracker.recordFailure("Reuters RSS", "empty result — no items returned");

    const h = tracker.getHealth("Reuters RSS");
    expect(h.status).toBe("degraded");
    expect(h.consecutiveFailures).toBe(1);
  });

  it("source health shows ok when fetcher returns items after empty run", () => {
    const tracker = new SourceHealthTracker();
    tracker.recordFailure("Reuters RSS", "empty result — no items returned");
    tracker.recordSuccess("Reuters RSS");

    const h = tracker.getHealth("Reuters RSS");
    expect(h.status).toBe("ok");
    expect(h.consecutiveFailures).toBe(0);
  });
});
