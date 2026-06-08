Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1336 — TDD: news-pipeline rag_analyses insert
 * Task 1335 — fix(news-pipeline): extend VN_SOURCE_IDS + createdAt guard
 *
 * TC-1: pollNews with vietstock items inserts rows into rag_analyses (FAILS before fix)
 * TC-2: assembleEveningSummary returns topStories + newsCount=3 after pollNews (FAILS before fix)
 * TC-3: same URL pushed twice → exactly 1 row (FAILS before fix)
 * TC-4: empty rag_analyses → assembleEveningSummary returns 0/[] (PASSES before fix — baseline)
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { VN_OFFSET_MS } from "../domain/services/timeConstants.js";
import { pollNews } from "../application/usecases/pollNews.js";
import { assembleEveningSummary } from "../application/usecases/assembleEveningSummary.js";
import type { RssItem } from "../infrastructure/fetchers/rss.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function midnightVietnamAsUtc(): string {
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

function makeVpsItem(overrides: Partial<RssItem> = {}): RssItem {
  return {
    title:       overrides.title       ?? "VNDirect tăng mạnh phiên chiều",
    content:     overrides.content     ?? "",           // empty — typical VPS RSS summary
    url:         overrides.url         ?? `https://vietstock.vn/${Date.now()}`,
    publishedAt: overrides.publishedAt ?? new Date().toISOString(),
    source:      overrides.source      ?? "vietstock",
    ...overrides,
  };
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
      embedding_text     TEXT,
      data_env           TEXT,
      body_text          TEXT
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
    CREATE UNIQUE INDEX IF NOT EXISTS idx_rag_source_url
      ON rag_analyses (source_url)
      WHERE source_url IS NOT NULL AND source_url != '';
  `);
  return db;
}

const TEST_REPORTS_DIR = join(process.cwd(), "data", "__test-1335__");

function cleanupReportsDir() {
  if (existsSync(TEST_REPORTS_DIR)) {
    rmSync(TEST_REPORTS_DIR, { recursive: true, force: true });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TC-1: pollNews with vietstock items inserts rows into rag_analyses
// FAILS before fix: isVnRelevant({ source: "vietstock", content: "" }) returns false
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-1: pollNews with vietstock items inserts rows into rag_analyses", () => {
  let db: Database;

  beforeEach(() => {
    db = setupTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it("3 distinct vietstock items → rag_analyses COUNT = 3 with created_at >= midnight VN", async () => {
    const item1 = makeVpsItem({ url: "https://vietstock.vn/article-1", title: "VNDirect tăng mạnh phiên chiều" });
    const item2 = makeVpsItem({ url: "https://vietstock.vn/article-2", title: "HPG hồi phục sau áp lực bán" });
    const item3 = makeVpsItem({ url: "https://vietstock.vn/article-3", title: "VCB công bố kết quả kinh doanh quý 1" });

    // All network sources + RAG HTTP mocked to avoid CI sandbox latency
    await pollNews({
      db,
      ragInsert: async () => {},
      fetchers: {
        vietstock:         async () => [item1, item2, item3],
        cafef:             async () => [],
        vnexpress:         async () => [],
        vneconomy:         async () => [],
        reuters:           async () => [],
        tradingeconomics:  async () => [],
        teChromiumNews:    async () => [],
        newsapi:           async () => [],
      },
      watchlist: [],
    });

    const count = (db.prepare("SELECT COUNT(*) as n FROM rag_analyses").get() as { n: number }).n;
    expect(count).toBe(3);

    const midnight = midnightVietnamAsUtc();
    const recent = (db.prepare(
      "SELECT COUNT(*) as n FROM rag_analyses WHERE created_at >= ?",
    ).get(midnight) as { n: number }).n;
    expect(recent).toBe(3);
  // pollNews involves dynamic module loading; 15s guards Bun's 5s default
  }, 15_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-2: assembleEveningSummary returns topStories and newsCount = 3 after pollNews
// FAILS before fix: no rows in rag_analyses (TC-1 fails first)
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-2: assembleEveningSummary returns topStories and newsCount = 3 after pollNews", () => {
  let db: Database;

  beforeEach(() => {
    db = setupTestDb();
    mkdirSync(TEST_REPORTS_DIR, { recursive: true });
  });

  afterEach(() => {
    db.close();
    cleanupReportsDir();
  });

  it("topStories.length === 3 and newsCount === 3 after pollNews inserts 3 vietstock items", async () => {
    const item1 = makeVpsItem({ url: "https://vietstock.vn/tc2-article-1", title: "VNDirect tăng mạnh phiên chiều" });
    const item2 = makeVpsItem({ url: "https://vietstock.vn/tc2-article-2", title: "HPG hồi phục sau áp lực bán" });
    const item3 = makeVpsItem({ url: "https://vietstock.vn/tc2-article-3", title: "VCB công bố kết quả kinh doanh quý 1" });

    // All network sources + RAG HTTP mocked to avoid CI sandbox latency
    await pollNews({
      db,
      ragInsert: async () => {},
      fetchers: {
        vietstock:         async () => [item1, item2, item3],
        cafef:             async () => [],
        vnexpress:         async () => [],
        vneconomy:         async () => [],
        reuters:           async () => [],
        tradingeconomics:  async () => [],
        teChromiumNews:    async () => [],
        newsapi:           async () => [],
      },
      watchlist: [],
    });

    const summary = await assembleEveningSummary({
      db,
      reportsDir: TEST_REPORTS_DIR,
    });

    expect(summary.newsCount).toBe(3);
    expect(summary.topStories.length).toBe(3);
  // pollNews + assembleEveningSummary involve dynamic module loading; 15s guards Bun's 5s default
  }, 15_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-3: URL dedup — same URL pushed twice → exactly 1 row
// FAILS before fix: item never passes relevance filter, rag_analyses stays empty (count=0, not 1)
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-3: pushing the same URL twice inserts exactly 1 row (INSERT OR IGNORE)", () => {
  let db: Database;

  beforeEach(() => {
    db = setupTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it("duplicate URL vietstock item pushed twice → exactly 1 row in rag_analyses", async () => {
    const duplicateItem = makeVpsItem({ url: "https://vietstock.vn/dup-article" });

    const noopFetchers = {
      cafef:            async () => [] as RssItem[],
      vnexpress:        async () => [] as RssItem[],
      vneconomy:        async () => [] as RssItem[],
      reuters:          async () => [] as RssItem[],
      tradingeconomics: async () => [] as RssItem[],
    };

    // All network sources + RAG HTTP mocked to avoid CI sandbox latency
    const noopFetchersWithAll = {
      ...noopFetchers,
      teChromiumNews: async () => [] as RssItem[],
      newsapi: async () => [] as RssItem[],
    };
    await pollNews({
      db,
      ragInsert: async () => {},
      fetchers: { vietstock: async () => [duplicateItem], ...noopFetchersWithAll },
      watchlist: [],
    });
    await pollNews({
      db,
      ragInsert: async () => {},
      fetchers: { vietstock: async () => [duplicateItem], ...noopFetchersWithAll },
      watchlist: [],
    });

    const count = (db.prepare(
      "SELECT COUNT(*) as n FROM rag_analyses WHERE source_url = ?",
    ).get("https://vietstock.vn/dup-article") as { n: number }).n;
    expect(count).toBe(1);
  // TC-3 calls pollNews twice; 15s guards Bun's 5s default
  }, 15_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-4: empty rag_analyses → assembleEveningSummary returns newsCount=0, topStories=[]
// PASSES before fix (baseline sanity check)
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-4: assembleEveningSummary returns newsCount = 0 when rag_analyses is empty", () => {
  let db: Database;

  beforeEach(() => {
    db = setupTestDb();
    mkdirSync(TEST_REPORTS_DIR, { recursive: true });
  });

  afterEach(() => {
    db.close();
    cleanupReportsDir();
  });

  it("empty db → newsCount === 0 and topStories === []", async () => {
    const summary = await assembleEveningSummary({
      db,
      reportsDir: TEST_REPORTS_DIR,
    });

    expect(summary.newsCount).toBe(0);
    expect(summary.topStories).toEqual([]);
  });
});
