/**
 * Task 1855a — Suppress false pollNews 0-items alert when VPS push pipeline is active
 *
 * Context:
 *   - Two news pipelines: VPS push (primary, healthy) and scheduled job (secondary, intentionally stubbed)
 *   - The scheduled job fetchers all return [] by design (Tasks 1228 + 1843)
 *   - The "all sources dark" alert fires every cycle, creating false Telegram noise
 *
 * Fix: when vpsNewsLastPushTs is provided and recent (within VPS_NEWS_STALE_MS = 2h),
 *   suppress the all-sources-dark alert — the [] results from stubbed fetchers are expected.
 *
 * Acceptance criteria:
 *   AC-1: No alert when VPS push pipeline recently delivered items (vpsNewsLastPushTs < 2h ago)
 *   AC-2: Alert STILL fires when BOTH pipelines are dark (vpsNewsLastPushTs null OR stale > 2h)
 *   AC-3: Existing cooldown behaviour unaffected (vpsNewsLastPushTs not provided → old behaviour)
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { pollNews, _resetAllDarkAlert } from "../application/usecases/pollNews.js";
import { initDatabase } from "../infrastructure/db/schema.js";

const VPS_NEWS_STALE_MS = 2 * 60 * 60 * 1000; // 2 hours

function makeDb(): Database {
  const db = new Database(":memory:");
  initDatabase(db);
  return db;
}

const allEmptyFetchers = {
  cafef:            async () => [],
  vnexpress:        async () => [],
  vneconomy:        async () => [],
  reuters:          async () => [],
  tradingeconomics: async () => [],
  teChromiumNews:   async () => [],
};

describe("Task 1855a — suppress false all-sources-dark alert when VPS push is healthy", () => {
  beforeEach(() => {
    _resetAllDarkAlert();
  });

  it("AC-1a: no alert when VPS push delivered items recently (1 min ago)", async () => {
    const db = makeDb();
    const bugAlerts: string[] = [];
    const onAllSourcesDark = async (msg: string) => { bugAlerts.push(msg); };

    const now = Date.now();

    await pollNews({
      db,
      fetchers: allEmptyFetchers,
      onAllSourcesDark,
      nowMs: () => now,
      // VPS push was healthy 1 minute ago
      vpsNewsLastPushTs: new Date(now - 60_000),
    });

    expect(bugAlerts.length).toBe(0); // suppressed — VPS push is healthy
  });

  it("AC-1b: no alert when VPS push delivered items exactly at the stale boundary (2h - 1ms ago)", async () => {
    const db = makeDb();
    const bugAlerts: string[] = [];
    const onAllSourcesDark = async (msg: string) => { bugAlerts.push(msg); };

    const now = Date.now();

    await pollNews({
      db,
      fetchers: allEmptyFetchers,
      onAllSourcesDark,
      nowMs: () => now,
      // One millisecond inside the 2h window
      vpsNewsLastPushTs: new Date(now - (VPS_NEWS_STALE_MS - 1)),
    });

    expect(bugAlerts.length).toBe(0); // still within window — suppressed
  });

  it("AC-2a: alert fires when vpsNewsLastPushTs is null (VPS pipeline never pushed)", async () => {
    const db = makeDb();
    const bugAlerts: string[] = [];
    const onAllSourcesDark = async (msg: string) => { bugAlerts.push(msg); };

    const now = Date.now();

    await pollNews({
      db,
      fetchers: allEmptyFetchers,
      onAllSourcesDark,
      nowMs: () => now,
      vpsNewsLastPushTs: null,
    });

    expect(bugAlerts.length).toBe(1); // both pipelines dark → real outage
  });

  it("AC-2b: alert fires when VPS push is stale (> 2h ago)", async () => {
    const db = makeDb();
    const bugAlerts: string[] = [];
    const onAllSourcesDark = async (msg: string) => { bugAlerts.push(msg); };

    const now = Date.now();

    await pollNews({
      db,
      fetchers: allEmptyFetchers,
      onAllSourcesDark,
      nowMs: () => now,
      // VPS push was 2h + 1ms ago — stale
      vpsNewsLastPushTs: new Date(now - (VPS_NEWS_STALE_MS + 1)),
    });

    expect(bugAlerts.length).toBe(1); // both pipelines dark → real outage
  });

  it("AC-3: backward-compat — no vpsNewsLastPushTs provided → old behaviour (alert fires)", async () => {
    const db = makeDb();
    const bugAlerts: string[] = [];
    const onAllSourcesDark = async (msg: string) => { bugAlerts.push(msg); };

    const now = Date.now();

    await pollNews({
      db,
      fetchers: allEmptyFetchers,
      onAllSourcesDark,
      nowMs: () => now,
      // vpsNewsLastPushTs NOT provided → undefined
    });

    expect(bugAlerts.length).toBe(1); // old behaviour unchanged
  });

  it("AC-1c: alert suppressed even if fetched items > 0 when VPS push healthy (normal operation)", async () => {
    // When items ARE fetched, the all-dark condition never triggers regardless.
    // This test verifies the check does not accidentally suppress real data cases.
    const db = makeDb();
    const bugAlerts: string[] = [];
    const onAllSourcesDark = async (msg: string) => { bugAlerts.push(msg); };

    const now = Date.now();

    await pollNews({
      db,
      fetchers: {
        cafef: async () => [{
          title: "CafeF test article về chứng khoán Việt Nam VCB ngân hàng",
          url: "https://cafef.vn/1855a-test",
          publishedAt: new Date().toISOString(),
          content: "Nội dung về thị trường chứng khoán Việt Nam và ngân hàng VCB.",
          source: "cafef",
        }],
        vnexpress:        async () => [],
        vneconomy:        async () => [],
        reuters:          async () => [],
        tradingeconomics: async () => [],
        teChromiumNews:   async () => [],
      },
      onAllSourcesDark,
      nowMs: () => now,
      vpsNewsLastPushTs: new Date(now - 60_000),
      ragRetriever: async () => [],
      ragInsert: async () => {},   // skip real LanceDB embedding
      watchlist: [],
    });

    expect(bugAlerts.length).toBe(0); // items found → dark condition never triggered
  });
});
