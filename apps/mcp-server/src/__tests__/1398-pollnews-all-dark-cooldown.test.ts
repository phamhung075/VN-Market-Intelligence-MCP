/**
 * Task 1398 — pollNews all-sources-dark DB-backed cooldown
 *
 * Tests:
 *   (a) Second invocation within 4h cooldown → alert suppressed (no second send)
 *   (b) Second invocation after 4h cooldown → alert fires again
 *
 * Existing test-7 in 1345a-reuters-fallback.test.ts covers the base case
 * (first call fires, second immediate call does not). These two tests add the
 * cross-cycle DB-backed dimension: the cooldown persists through the `db`
 * injection so it survives process restarts.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { pollNews, _resetAllDarkAlert } from "../application/usecases/pollNews.js";

const ALL_DARK_COOLDOWN_MS = 4 * 60 * 60 * 1000;

function makeDb(): Database {
  const { Database: BunDatabase } = require("bun:sqlite");
  const db: Database = new BunDatabase(":memory:");
  const { initDatabase } = require("../infrastructure/db/schema.js");
  initDatabase(db);
  return db;
}

const allEmptyFetchers = {
  reuters: async () => [],
  cafef: async () => [],
  vnexpress: async () => [],
  vneconomy: async () => [],
  tradingeconomics: async () => [],
};

describe("Task 1398 — pollNews all-sources-dark DB-backed cooldown", () => {
  beforeEach(() => {
    _resetAllDarkAlert();
  });

  it("(a) second invocation within 4h cooldown → alert suppressed", async () => {
    const db = makeDb();
    const bugAlerts: string[] = [];
    const onAllSourcesDark = async (msg: string) => { bugAlerts.push(msg); };

    const now = Date.now();

    // First call at T=0 → fires
    await pollNews({
      db,
      fetchers: allEmptyFetchers,
      onAllSourcesDark,
      nowMs: () => now,
    });
    expect(bugAlerts.length).toBe(1);

    // Second call at T+30min (within 4h window) — module var reset but DB row exists
    _resetAllDarkAlert(); // simulate process restart (clears module-level var)
    await pollNews({
      db,
      fetchers: allEmptyFetchers,
      onAllSourcesDark,
      nowMs: () => now + 30 * 60 * 1000,
    });
    expect(bugAlerts.length).toBe(1); // still 1 — suppressed by DB cooldown
  });

  it("(b) second invocation after 4h cooldown → alert fires again", async () => {
    const db = makeDb();
    const bugAlerts: string[] = [];
    const onAllSourcesDark = async (msg: string) => { bugAlerts.push(msg); };

    const now = Date.now();

    // First call at T=0 → fires
    await pollNews({
      db,
      fetchers: allEmptyFetchers,
      onAllSourcesDark,
      nowMs: () => now,
    });
    expect(bugAlerts.length).toBe(1);

    // Second call at T+4h+1min (past 4h window) — fires again
    _resetAllDarkAlert(); // simulate process restart
    await pollNews({
      db,
      fetchers: allEmptyFetchers,
      onAllSourcesDark,
      nowMs: () => now + ALL_DARK_COOLDOWN_MS + 60_000,
    });
    expect(bugAlerts.length).toBe(2); // fired again after cooldown expired
  });
});
