Bun.env["DB_PATH"] = ":memory:";

/**
 * FIX-POLLNEWS-COUNTER-CONSERVATION
 *
 * Incident: dev-mcp-server news-ingestion-stall investigation (2026-07-28,
 * coordination_session=e3a3f331-f086-4c43-bd81-f40de22ef599, signal
 * sys-20260728T134549-4b19). Router observed live cycles where
 * fetched - duplicates - inserted != 0 (e.g. fetched:70 duplicates:60
 * inserted:0 -> 10 unaccounted) and asked "name exactly which code path
 * drops the unaccounted items."
 *
 * ROOT CAUSE (confirmed by code read, pollNews.ts Step 1c ~L951-960): the
 * VN-relevance pre-filter (Task 1247, isVnRelevant) runs BEFORE the
 * dedup/insert loop. `fetched` is set to `allItems.length` (pre-filter),
 * but `inserted`/`duplicates` only accumulate over `relevantItems`
 * (post-filter). The discarded `irrelevantCount` was logged ONLY at
 * `logger.debug` (invisible at production info level) and was NEVER part
 * of the returned PollNewsResult or the "cycle complete" info log — so the
 * printed counters looked like they did not conserve their own inputs,
 * even though internally every relevant item is fully accounted for
 * (verified: the loop always does exactly one of inserted++/duplicates++,
 * no third silent-drop path exists).
 *
 * This is NOT a data-loss bug — no VN-relevant article is silently
 * dropped. It IS a genuine observability gap: the conservation identity
 * `fetched === inserted + duplicates + irrelevant` was unverifiable from
 * the logged/returned counters alone. This fix surfaces `irrelevant` as a
 * first-class PollNewsResult field + log field so the identity is always
 * checkable without needing debug-level logs.
 *
 * Live-DB corroboration performed separately during this investigation
 * (docker exec bun:sqlite readonly probe against the running container)
 * confirmed rag_analyses received genuine continuous inserts all day
 * (e.g. 126 rows in the trailing 3h, latest row ~2 min before the signal
 * fired) — the "6.5h stall since 07:15:02Z" claim was independently
 * traced to system-auditor's C-06 check reading market_messages.sent_at
 * (an unrelated outbound MARKET-briefing-post log) and mislabeling it
 * "news" — already tracked by FIX-AUDITOR-C06-OFFMARKET-RECALIBRATE et al.
 * (out of dev-mcp-server zone; reported, not fixed here).
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";

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
  `);
  return db;
}

function makeVnItem(url: string, title = "VCB tang manh phien chieu") {
  return {
    title,
    url,
    publishedAt: new Date().toISOString(),
    content: "Thi truong chung khoan Viet Nam tang diem.",
    source: "cafef", // VN_SOURCE_IDS member -> always relevant
  };
}

/** Non-VN source + content with zero VN signal -> isVnRelevant() === false. */
function makeIrrelevantItem(url: string, title = "US retail sales miss expectations") {
  return {
    title,
    url,
    publishedAt: new Date().toISOString(),
    content: "Consumer spending in America slows amid rate hikes.",
    source: "tradingeconomics", // not in VN_SOURCE_IDS, no VN keyword/ticker in text
  };
}

describe("FIX-POLLNEWS-COUNTER-CONSERVATION", () => {
  beforeEach(() => {
    testDb = setupTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  it("reports irrelevant count for items dropped by the VN-relevance pre-filter", async () => {
    const { pollNews } = await import("../application/usecases/pollNews.js");

    const result = await pollNews({
      fetchers: {
        cafef: async () => [makeVnItem("https://cafef.vn/irrelevant-fix-1", "CC-1 CafeF story")],
        vnexpress: async () => [],
        vneconomy: async () => [],
        teChromiumNews: async () => [],
        tradingeconomics: async () => [
          makeIrrelevantItem("https://tradingeconomics.com/irrelevant-fix-1", "CC-1 TE story A"),
          makeIrrelevantItem("https://tradingeconomics.com/irrelevant-fix-2", "CC-1 TE story B"),
        ],
      },
      db: testDb,
      ragRetriever: async () => [],
      watchlist: [],
    });

    expect(result.fetched).toBe(3);
    expect(result.inserted).toBe(1);
    expect(result.duplicates).toBe(0);
    expect(result.irrelevant).toBe(2);

    // The conservation identity the incident brief asked to reconcile:
    // every fetched item is exactly one of inserted / duplicate / irrelevant.
    expect(result.inserted + result.duplicates + (result.irrelevant ?? 0)).toBe(result.fetched);
  });

  it("conserves counters when all items are VN-relevant (irrelevant=0, non-regression)", async () => {
    const { pollNews } = await import("../application/usecases/pollNews.js");

    const result = await pollNews({
      fetchers: {
        cafef: async () => [
          makeVnItem("https://cafef.vn/irrelevant-fix-3", "CC-2 CafeF story one"),
          makeVnItem("https://cafef.vn/irrelevant-fix-4", "CC-2 CafeF story two"),
        ],
        vnexpress: async () => [],
        vneconomy: async () => [],
        teChromiumNews: async () => [],
        tradingeconomics: async () => [],
      },
      db: testDb,
      ragRetriever: async () => [],
      watchlist: [],
    });

    expect(result.fetched).toBe(2);
    expect(result.inserted).toBe(2);
    expect(result.irrelevant).toBe(0);
    expect(result.inserted + result.duplicates + (result.irrelevant ?? 0)).toBe(result.fetched);
  });

  it("conserves counters across fetched/duplicate/irrelevant on a mixed re-poll cycle", async () => {
    const { pollNews } = await import("../application/usecases/pollNews.js");

    const fetchersForCycle = () => ({
      cafef: async () => [makeVnItem("https://cafef.vn/irrelevant-fix-5", "CC-3 CafeF story")],
      vnexpress: async () => [],
      vneconomy: async () => [],
      teChromiumNews: async () => [],
      tradingeconomics: async () => [
        makeIrrelevantItem("https://tradingeconomics.com/irrelevant-fix-3", "CC-3 TE story"),
      ],
    });

    // First cycle: 1 new VN item inserted, 1 irrelevant item dropped.
    const first = await pollNews({
      fetchers: fetchersForCycle(),
      db: testDb,
      ragRetriever: async () => [],
      watchlist: [],
    });
    expect(first.inserted).toBe(1);
    expect(first.irrelevant).toBe(1);

    // Second cycle: same items re-pushed (mirrors the live VPS re-push
    // pattern from the NEWS-INGEST-1 precedent) -> the VN item is now a
    // genuine duplicate; the irrelevant item is dropped again pre-dedup.
    const second = await pollNews({
      fetchers: fetchersForCycle(),
      db: testDb,
      ragRetriever: async () => [],
      watchlist: [],
    });

    expect(second.fetched).toBe(2);
    expect(second.inserted).toBe(0);
    expect(second.duplicates).toBe(1);
    expect(second.irrelevant).toBe(1);
    expect(second.inserted + second.duplicates + (second.irrelevant ?? 0)).toBe(second.fetched);
  });
});
