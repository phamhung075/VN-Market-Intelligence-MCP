/**
 * Task 1898b — RSS degradation regression-shape guards
 *
 * Suite A (RSS-REG-01..06): each of the 5 new VPS-push sources (nhandan, nld,
 *   vietnambiz, vietstock, vnbusiness) inserts at least 1 row into rag_analyses
 *   when pollNews is called with an injected fetcher. RSS-REG-06 asserts
 *   globalSourceTracker health is "ok" for a source that returned items.
 * Suite B (RSS-REG-07..08): zero-items path and partial-recovery path.
 */

// DB_PATH set to :memory: before any import that triggers getDb()
Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mock } from "bun:test";
import { Database } from "bun:sqlite";
import type { RssItem } from "../infrastructure/fetchers/rss.js";

mock.module("../infrastructure/rag/retriever.js", () => ({
  searchContext: async () => [],
  insertAnalysis: async () => {},
}));

import { pollNews, _resetAllDarkAlert } from "../application/usecases/pollNews.js";
import { globalSourceTracker, _resetGlobalSourceTracker } from "../interface/mcp/tools/news-analysis/sourceHealthTools.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ─────────────────────────────────────────────────────────────────────────────
// DB setup
// ─────────────────────────────────────────────────────────────────────────────

function setupTestDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code TEXT PRIMARY KEY, company_name TEXT, exchange TEXT NOT NULL DEFAULT 'HOSE',
      domain TEXT NOT NULL DEFAULT 'other', notes TEXT,
      added_at TEXT NOT NULL DEFAULT (datetime('now')),
      alert_drop_pct REAL NOT NULL DEFAULT -3, alert_rise_pct REAL NOT NULL DEFAULT 5,
      alert_impact_min REAL NOT NULL DEFAULT 7, alert_report_new INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS market_prices (
      code TEXT PRIMARY KEY, price REAL, change_amt REAL, change_pct REAL, volume REAL, updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS rag_analyses (
      id TEXT PRIMARY KEY, created_at TEXT NOT NULL, level TEXT NOT NULL,
      source_url TEXT, source_title TEXT, source_type TEXT, published_at TEXT,
      sentiment TEXT, impact_score REAL, impact_direction TEXT, confidence REAL,
      time_horizon TEXT, summary TEXT, reasoning TEXT, affected_countries TEXT,
      affected_domains TEXT, affected_actions TEXT, parent_ids TEXT, tags TEXT, embedding_text TEXT
    );
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY, triggered_at TEXT NOT NULL, severity TEXT NOT NULL,
      signals_json TEXT, affected_actions_json TEXT, analysis_ids_json TEXT,
      message TEXT, read INTEGER NOT NULL DEFAULT 0, user_note TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_rag_source_url
      ON rag_analyses (source_url) WHERE source_url IS NOT NULL AND source_url != '';
  `);
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Stub local-default fetchers — prevents real HTTP calls in tests. */
const NOOP_LOCAL: Record<string, () => Promise<RssItem[]>> = {
  cafef:          async () => [],
  vnexpress:      async () => [],
  vneconomy:      async () => [],
  teChromiumNews: async () => [],
};

function makeVpsItem(source: string, urlSuffix: string): RssItem {
  return {
    title:       `${source} tăng mạnh — thị trường tích cực`,
    content:     "",
    url:         `https://${source}.vn/article-${urlSuffix}`,
    publishedAt: new Date().toISOString(),
    source,
  };
}

function rowCount(db: Database): number {
  return (db.prepare("SELECT COUNT(*) as n FROM rag_analyses").get() as { n: number }).n;
}

function sourceUrl(db: Database): string {
  return (db.prepare("SELECT source_url FROM rag_analyses LIMIT 1").get() as { source_url: string }).source_url;
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite A — VPS-push source recovery guard (RSS-REG-01..06)
// ─────────────────────────────────────────────────────────────────────────────

describe("1898b — Suite A: VPS-push source recovery guard", () => {
  let db: Database;
  beforeEach(() => { db = setupTestDb(); _resetAllDarkAlert(); });
  afterEach(() => { db.close(); });

  it("RSS-REG-01: nhandan item inserts row; source_url contains 'nhandan'", async () => {
    await pollNews({ db, fetchers: { ...NOOP_LOCAL, nhandan: async () => [makeVpsItem("nhandan", "r1")] }, watchlist: [] });
    expect(rowCount(db)).toBeGreaterThanOrEqual(1);
    expect(sourceUrl(db)).toContain("nhandan");
  });

  it("RSS-REG-02: nld item inserts row; source_url contains 'nld'", async () => {
    await pollNews({ db, fetchers: { ...NOOP_LOCAL, nld: async () => [makeVpsItem("nld", "r2")] }, watchlist: [] });
    expect(rowCount(db)).toBeGreaterThanOrEqual(1);
    expect(sourceUrl(db)).toContain("nld");
  });

  it("RSS-REG-03: vietnambiz item inserts row; source_url contains 'vietnambiz'", async () => {
    await pollNews({ db, fetchers: { ...NOOP_LOCAL, vietnambiz: async () => [makeVpsItem("vietnambiz", "r3")] }, watchlist: [] });
    expect(rowCount(db)).toBeGreaterThanOrEqual(1);
    expect(sourceUrl(db)).toContain("vietnambiz");
  });

  it("RSS-REG-04: vietstock item inserts row; source_url contains 'vietstock'", async () => {
    await pollNews({ db, fetchers: { ...NOOP_LOCAL, vietstock: async () => [makeVpsItem("vietstock", "r4")] }, watchlist: [] });
    expect(rowCount(db)).toBeGreaterThanOrEqual(1);
    expect(sourceUrl(db)).toContain("vietstock");
  });

  it("RSS-REG-05: vnbusiness item inserts row; source_url contains 'vnbusiness'", async () => {
    await pollNews({ db, fetchers: { ...NOOP_LOCAL, vnbusiness: async () => [makeVpsItem("vnbusiness", "r5")] }, watchlist: [] });
    expect(rowCount(db)).toBeGreaterThanOrEqual(1);
    expect(sourceUrl(db)).toContain("vnbusiness");
  });

  it("RSS-REG-06: globalSourceTracker health is 'ok' for source that returned items", async () => {
    _resetGlobalSourceTracker();
    await pollNews({ db, fetchers: { ...NOOP_LOCAL, nhandan: async () => [makeVpsItem("nhandan", "r6")] }, watchlist: [] });
    const health = globalSourceTracker.getAllHealth().find((h) => h.source === "nhandan");
    expect(health).toBeDefined();
    expect(health!.status).toBe("ok");
    expect(health!.consecutiveFailures).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite B — Empty-source and partial-recovery guards (RSS-REG-07..08)
// ─────────────────────────────────────────────────────────────────────────────

describe("1898b — Suite B: empty-source and partial-recovery guards", () => {
  let db: Database;
  const darkMessages: string[] = [];
  beforeEach(() => { db = setupTestDb(); darkMessages.length = 0; _resetAllDarkAlert(); });
  afterEach(() => { db.close(); });

  it("RSS-REG-07: all fetchers return [] triggers all-sources-dark callback", async () => {
    await pollNews({
      db,
      fetchers: { ...NOOP_LOCAL },
      watchlist: [],
      onAllSourcesDark: async (msg) => { darkMessages.push(msg); },
      vpsNewsLastPushTs: null,
    });
    expect(darkMessages.length).toBeGreaterThanOrEqual(1);
    const combined = darkMessages.join(" ");
    expect(
      combined.includes("0 items") || combined.includes("All news sources returned 0 items"),
    ).toBe(true);
  });

  it("RSS-REG-08: cafef returns [] but vnbusiness returns 1 item — rag_analyses count = 1", async () => {
    await pollNews({
      db,
      fetchers: { ...NOOP_LOCAL, vnbusiness: async () => [makeVpsItem("vnbusiness", "r8")] },
      watchlist: [],
      onAllSourcesDark: async () => {},
    });
    expect(rowCount(db)).toBe(1);
  });
});
