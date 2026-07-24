/**
 * Task 1832b — pollNews active-source filter
 *
 * Tests:
 *   AC-1: When all sources are CB-down (5+ failures), onAllSourcesDark is NOT called
 *         even though allItems = []
 *   AC-2: When 1 source is active (not down, not disabled) and returns 0 items,
 *         onAllSourcesDark IS called
 *   AC-3: When newsapi is the only active source (configured) and returns 0,
 *         onAllSourcesDark IS called (re-verified via active=1 path)
 *   AC-4: When newsapi is disabled and all other sources are CB-down,
 *         onAllSourcesDark is NOT called
 *   AC-5: darkMsg contains "(active: N/M)" for N > 0 case
 *
 * Design notes:
 *   - pollNews auto-injects `teChromiumNews` (always) and `newsapi` when reuters
 *     is stale (reutersLastPushTs=null). Tests must account for these.
 *   - In test env: isNewsapiConfigured()=false → newsapi→recordDisabled → not active.
 *   - Passing `reutersLastPushTs: new Date()` prevents the newsapi auto-inject.
 *   - `teChromiumNews` display name = "Trading Economics News".
 *   - sleepMs is injected as a no-op to avoid the 2-second Chromium retry delay.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { pollNews, _resetAllDarkAlert } from "../application/usecases/pollNews.js";
import { initDatabase } from "../infrastructure/db/schema.js";
import { globalSourceTracker } from "../infrastructure/observability/sourceHealthRegistry.js";

const DOWN_THRESHOLD = 5;
const noopSleep = async (_ms: number): Promise<void> => { /* no-op for tests */ };

function makeDb(): Database {
  const db = new Database(":memory:");
  initDatabase(db);
  return db;
}

/** Drive a source to CB-open (5+ consecutive failures). */
function driveDown(displayName: string): void {
  for (let i = 0; i < DOWN_THRESHOLD; i++) {
    globalSourceTracker.recordFailure(displayName, "simulated failure");
  }
}

/** Reset a source to ok state by recording a success. */
function resetSource(displayName: string): void {
  globalSourceTracker.recordSuccess(displayName);
}

/** All display names that may be active in a default pollNews call. */
const ALL_DISPLAY_NAMES = [
  "Reuters RSS",
  "CafeF RSS",
  "VnExpress RSS",
  "VnEconomy RSS",
  "Trading Economics",        // tradingeconomics RSS key
  "Trading Economics News",   // teChromiumNews key (always auto-injected)
  "newsapi",                  // newsapi key (auto-injected when reuters stale)
];

/** Shared empty fetchers for the 5 primary VN sources. */
const emptyVnFetchers = {
  reuters: async () => [],
  cafef: async () => [],
  vnexpress: async () => [],
  vneconomy: async () => [],
  tradingeconomics: async () => [],
  teChromiumNews: async () => [],
} as const;

describe("Task 1832b — pollNews active-source filter", () => {
  beforeEach(() => {
    _resetAllDarkAlert();
    // Reset all known sources to ok so tests start from clean state
    for (const name of ALL_DISPLAY_NAMES) {
      resetSource(name);
    }
  });

  afterEach(() => {
    // Restore all sources to ok state so accumulated driveDown() calls do not
    // pollute globalSourceTracker for test files that run after this file in
    // the full suite. The tracker is a globalThis singleton that persists
    // across test files within the same bun process.
    for (const name of ALL_DISPLAY_NAMES) {
      resetSource(name);
    }
  });

  it("AC-1: all sources CB-down → onAllSourcesDark NOT called even with 0 items", async () => {
    const db = makeDb();
    const bugAlerts: string[] = [];
    const onAllSourcesDark = async (msg: string) => { bugAlerts.push(msg); };

    // Drive all sources (including teChromiumNews) to CB-open
    driveDown("Reuters RSS");
    driveDown("CafeF RSS");
    driveDown("VnExpress RSS");
    driveDown("VnEconomy RSS");
    driveDown("Trading Economics");
    driveDown("Trading Economics News");
    // newsapi: in test env isNewsapiConfigured()=false → recordDisabled → not active
    // Inject newsapi stub to prevent auto-fallback error; also pass fresh
    // reutersLastPushTs to suppress the "reuters stale" log but still let
    // newsapi come in via explicit injection.

    await pollNews({
      db,
      fetchers: {
        ...emptyVnFetchers,
        newsapi: async () => [],
      },
      onAllSourcesDark,
      // Prevent auto reuters-stale newsapi inject (newsapi still comes in via fetchers above)
      reutersLastPushTs: new Date(),
      sleepMs: noopSleep,
    });

    expect(bugAlerts.length).toBe(0);
  });

  it("AC-2: 1 source active (cafef, not down) returns 0 → onAllSourcesDark IS called", async () => {
    const db = makeDb();
    const bugAlerts: string[] = [];
    const onAllSourcesDark = async (msg: string) => { bugAlerts.push(msg); };

    // Drive all sources down except cafef
    driveDown("Reuters RSS");
    driveDown("VnExpress RSS");
    driveDown("VnEconomy RSS");
    driveDown("Trading Economics");
    driveDown("Trading Economics News");
    // cafef left at ok (reset in beforeEach)

    await pollNews({
      db,
      fetchers: {
        ...emptyVnFetchers,
        newsapi: async () => [],
      },
      onAllSourcesDark,
      reutersLastPushTs: new Date(),
      sleepMs: noopSleep,
    });

    expect(bugAlerts.length).toBe(1);
  });

  it("AC-3: single active non-disabled source returns 0 → onAllSourcesDark IS called", async () => {
    // Verifies the active=1 path fires the alert. Uses vneconomy as the active source.
    const db = makeDb();
    const bugAlerts: string[] = [];
    const onAllSourcesDark = async (msg: string) => { bugAlerts.push(msg); };

    driveDown("Reuters RSS");
    driveDown("CafeF RSS");
    driveDown("VnExpress RSS");
    driveDown("Trading Economics");
    driveDown("Trading Economics News");
    // vneconomy is active (reset in beforeEach)

    await pollNews({
      db,
      fetchers: {
        ...emptyVnFetchers,
        newsapi: async () => [],
      },
      onAllSourcesDark,
      reutersLastPushTs: new Date(),
      sleepMs: noopSleep,
    });

    expect(bugAlerts.length).toBe(1);
  });

  it("AC-4: newsapi disabled + all other sources CB-down → onAllSourcesDark NOT called", async () => {
    const db = makeDb();
    const bugAlerts: string[] = [];
    const onAllSourcesDark = async (msg: string) => { bugAlerts.push(msg); };

    // Drive every non-stub source to CB-open
    driveDown("Reuters RSS");
    driveDown("CafeF RSS");
    driveDown("VnExpress RSS");
    driveDown("VnEconomy RSS");
    driveDown("Trading Economics");
    driveDown("Trading Economics News");
    // newsapi: isNewsapiConfigured()=false in test env → recordDisabled → not active

    await pollNews({
      db,
      fetchers: {
        ...emptyVnFetchers,
        newsapi: async () => [],
      },
      onAllSourcesDark,
      reutersLastPushTs: new Date(),
      sleepMs: noopSleep,
    });

    expect(bugAlerts.length).toBe(0);
  });

  it("AC-5: darkMsg contains '(active: N/M)' when N > 0", async () => {
    const db = makeDb();
    const bugAlerts: string[] = [];
    const onAllSourcesDark = async (msg: string) => { bugAlerts.push(msg); };

    // Leave only cafef active
    driveDown("Reuters RSS");
    driveDown("VnExpress RSS");
    driveDown("VnEconomy RSS");
    driveDown("Trading Economics");
    driveDown("Trading Economics News");

    await pollNews({
      db,
      fetchers: {
        ...emptyVnFetchers,
        newsapi: async () => [],
      },
      onAllSourcesDark,
      reutersLastPushTs: new Date(),
      sleepMs: noopSleep,
    });

    expect(bugAlerts.length).toBe(1);
    expect(bugAlerts[0]).toMatch(/\(active: \d+\/\d+\)/);
  });
});
