/**
 * Task 1840a — RAG wiring: pollNews → insertAnalysis
 *
 * Tests:
 *   AC-1: pollNews calls ragInsert dep once for each successfully stored article
 *   AC-2: pollNews does NOT throw when ragInsert dep throws (non-fatal)
 *   AC-3: ragInsert receives correct article content (title, summary, tags with source)
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { pollNews, _resetAllDarkAlert } from "../application/usecases/pollNews.js";
import { initDatabase } from "../infrastructure/db/schema.js";
import type { RssItem } from "../infrastructure/fetchers/rss.js";
// G5b (P2-F): AnalysisInput moved to ragHttpClient.ts (canonical HTTP boundary)
import type { AnalysisInput } from "../infrastructure/rag/ragHttpClient.js";

function makeDb(): Database {
  const db = new Database(":memory:");
  initDatabase(db);
  return db;
}

const noopSleep = async (_ms: number): Promise<void> => {};

/** A minimal VPS-style news item that will pass vnRelevanceFilter. */
function makeNewsItem(overrides: Partial<RssItem> = {}): RssItem {
  return {
    title: "VCB tăng trưởng lợi nhuận quý 1",
    url: `https://cafef.vn/vcb-tang-truong-${Date.now()}.htm`,
    publishedAt: new Date().toISOString(),
    source: "cafef",
    content: "Ngân hàng VCB ghi nhận lợi nhuận trước thuế tăng 15% so với cùng kỳ.",
    ...overrides,
  };
}

/** Stub all default fetchers to empty so only injected items are processed. */
const emptyFetchers = {
  cafef: async () => [] as RssItem[],
  vnexpress: async () => [] as RssItem[],
  vneconomy: async () => [] as RssItem[],
  teChromiumNews: async () => [] as RssItem[],
};

describe("Task 1840a — pollNews RAG wiring", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
    _resetAllDarkAlert();
  });

  afterEach(() => {
    db.close();
  });

  it("AC-1: calls ragInsert once per successfully inserted article", async () => {
    const calls: AnalysisInput[] = [];
    const ragInsert = async (entry: AnalysisInput): Promise<void> => {
      calls.push(entry);
    };

    const item = makeNewsItem();
    await pollNews({
      db,
      fetchers: { ...emptyFetchers, cafef: async () => [item] },
      ragInsert,
      watchlist: [],
      sleepMs: noopSleep,
      reutersLastPushTs: new Date(), // prevent newsapi auto-inject
    });

    expect(calls.length).toBe(1);
  });

  it("AC-2: does NOT throw when ragInsert throws", async () => {
    const ragInsert = async (_entry: AnalysisInput): Promise<void> => {
      throw new Error("LanceDB unavailable");
    };

    const item = makeNewsItem({ url: `https://cafef.vn/test-nonfatal-${Date.now()}.htm` });

    // Must not throw — non-fatal
    await expect(
      pollNews({
        db,
        fetchers: { ...emptyFetchers, cafef: async () => [item] },
        ragInsert,
        watchlist: [],
        sleepMs: noopSleep,
        reutersLastPushTs: new Date(),
      }),
    ).resolves.toBeDefined();
  });

  it("AC-3: ragInsert receives article title, summary, and tags including source", async () => {
    const calls: AnalysisInput[] = [];
    const ragInsert = async (entry: AnalysisInput): Promise<void> => {
      calls.push(entry);
    };

    const item = makeNewsItem({
      url: `https://cafef.vn/vcb-detail-${Date.now()}.htm`,
      title: "VCB tăng trưởng lợi nhuận quý 1",
      source: "cafef",
    });

    await pollNews({
      db,
      fetchers: { ...emptyFetchers, cafef: async () => [item] },
      ragInsert,
      watchlist: [],
      sleepMs: noopSleep,
      reutersLastPushTs: new Date(),
    });

    expect(calls.length).toBeGreaterThan(0);
    const inserted = calls[0]!;
    // title must be set to the article headline
    expect(inserted.title.length).toBeGreaterThan(0);
    // summary must be non-empty
    expect(inserted.summary.length).toBeGreaterThan(0);
    // tags must include the source name
    expect(inserted.tags).toContain("cafef");
    // tags must include the "news" marker
    expect(inserted.tags).toContain("news");
  });
});
