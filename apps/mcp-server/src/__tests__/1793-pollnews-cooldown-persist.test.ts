/**
 * Task 1793 — pollNews all-sources-dark 24h cooldown persists across restarts
 *
 * Bug: `_lastAllDarkAlertAt` is module-level and resets to 0 on container
 * restart. The DB-backed guard must carry the cooldown across restarts.
 *
 * Secondary bug: the DB INSERT used `strftime('now')` (SQLite wall clock)
 * but the cooldown comparison used the injected `nowMs` (test fake clock).
 * This mismatch made the DB row invisible to the cooldown check when `nowMs`
 * returned a future fake timestamp, because `dbLastMs` was real-clock (~0 diff
 * from real now) but `now` was fake-future — so `now - dbLastMs` was >> 24h
 * and the second alert fired anyway.
 *
 * Fix: INSERT stores `nowMs()` (or `Date.now()` in production) as the
 * `started_at` timestamp, ensuring the comparison and the stored value use
 * the same clock source.
 *
 * Tests:
 *   (a) Restart simulation with future nowMs — second call within 24h suppressed
 *   (b) Restart simulation with future nowMs — second call after 24h fires again
 *   (c) INSERT failure does NOT crash pollNews (best-effort guard)
 *   (d) Production path (no nowMs injection) — DB row persists and suppresses
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { pollNews, _resetAllDarkAlert } from "../application/usecases/pollNews.js";
import { initDatabase } from "../infrastructure/db/schema.js";

const ALL_DARK_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function makeDb(): Database {
  const db = new Database(":memory:");
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

describe("Task 1793 — pollNews 24h cooldown persists across restart simulation", () => {
  beforeEach(() => {
    _resetAllDarkAlert();
  });

  it("(a) restart simulation with future nowMs — second call within 24h suppressed", async () => {
    const db = makeDb();
    const bugAlerts: string[] = [];
    const onAllSourcesDark = async (msg: string) => {
      bugAlerts.push(msg);
    };

    // T=100h (arbitrary future, avoids sub-second DB precision edge cases)
    const baseNow = 100 * 60 * 60 * 1000;

    // First call at T=baseNow → alert fires, DB row inserted at baseNow
    await pollNews({
      db,
      fetchers: allEmptyFetchers,
      onAllSourcesDark,
      nowMs: () => baseNow,
    });
    expect(bugAlerts.length).toBe(1);

    // Simulate process restart: module-level var cleared
    _resetAllDarkAlert();

    // Second call at T=baseNow+30min (within 24h) — DB row must suppress the alert
    await pollNews({
      db,
      fetchers: allEmptyFetchers,
      onAllSourcesDark,
      nowMs: () => baseNow + 30 * 60 * 1000,
    });
    // Still 1 — DB-backed cooldown suppressed the second alert
    expect(bugAlerts.length).toBe(1);
  });

  it("(b) restart simulation with future nowMs — second call after 24h fires again", async () => {
    const db = makeDb();
    const bugAlerts: string[] = [];
    const onAllSourcesDark = async (msg: string) => {
      bugAlerts.push(msg);
    };

    const baseNow = 100 * 60 * 60 * 1000;

    // First call at T=baseNow → fires
    await pollNews({
      db,
      fetchers: allEmptyFetchers,
      onAllSourcesDark,
      nowMs: () => baseNow,
    });
    expect(bugAlerts.length).toBe(1);

    // Simulate restart
    _resetAllDarkAlert();

    // Second call at T=baseNow+24h+1min — past cooldown window, must fire again
    await pollNews({
      db,
      fetchers: allEmptyFetchers,
      onAllSourcesDark,
      nowMs: () => baseNow + ALL_DARK_COOLDOWN_MS + 60_000,
    });
    expect(bugAlerts.length).toBe(2);
  });

  it("(c) INSERT failure does not crash pollNews — best-effort guard", async () => {
    // Use a DB without cron_job_runs table to simulate legacy / schema mismatch
    const db = new Database(":memory:");
    db.exec(`CREATE TABLE IF NOT EXISTS rag_analyses (
      id TEXT PRIMARY KEY, created_at TEXT, level TEXT, source_url TEXT,
      source_title TEXT, source_type TEXT, published_at TEXT, sentiment TEXT,
      impact_score REAL, impact_direction TEXT, confidence REAL,
      time_horizon TEXT, summary TEXT, reasoning TEXT,
      affected_countries TEXT, affected_domains TEXT, affected_actions TEXT,
      parent_ids TEXT, tags TEXT, embedding_text TEXT,
      data_env TEXT
)`);
    db.exec(`CREATE TABLE IF NOT EXISTS watchlist (
      code TEXT PRIMARY KEY, domain TEXT, exchange TEXT
    )`);
    // cron_job_runs intentionally NOT created

    const bugAlerts: string[] = [];
    // Should not throw even when INSERT fails
    await expect(
      pollNews({
        db,
        fetchers: allEmptyFetchers,
        onAllSourcesDark: async (msg) => {
          bugAlerts.push(msg);
        },
        nowMs: () => Date.now(),
      }),
    ).resolves.toBeDefined();

    // Alert still fires (first time, no DB row to suppress it)
    expect(bugAlerts.length).toBe(1);
  });

  it("(e) DB errors are logged as warn — not silently swallowed", async () => {
    // Broken DB: cron_job_runs has wrong columns → SELECT and INSERT both throw.
    // The fix must log a warn instead of catch {} with no output.
    const db = new Database(":memory:");
    db.exec(`CREATE TABLE IF NOT EXISTS rag_analyses (
      id TEXT PRIMARY KEY, created_at TEXT, level TEXT, source_url TEXT,
      source_title TEXT, source_type TEXT, published_at TEXT, sentiment TEXT,
      impact_score REAL, impact_direction TEXT, confidence REAL,
      time_horizon TEXT, summary TEXT, reasoning TEXT,
      affected_countries TEXT, affected_domains TEXT, affected_actions TEXT,
      parent_ids TEXT, tags TEXT, embedding_text TEXT,
      data_env TEXT
)`);
    db.exec(`CREATE TABLE IF NOT EXISTS watchlist (code TEXT PRIMARY KEY, domain TEXT, exchange TEXT)`);
    // Create cron_job_runs with WRONG columns — no started_at, no status
    db.exec(`CREATE TABLE IF NOT EXISTS cron_job_runs (job_name TEXT PRIMARY KEY, bogus INTEGER)`);

    const warnLines: string[] = [];
    const origLog = console.log;
    console.log = (line: string) => {
      try { const parsed = JSON.parse(line); if (parsed.level === "warn") warnLines.push(line); } catch { /* ignore */ }
    };

    try {
      await pollNews({
        db,
        fetchers: allEmptyFetchers,
        onAllSourcesDark: async () => {},
        nowMs: () => Date.now(),
      });
    } finally {
      console.log = origLog;
    }

    // Both the SELECT and INSERT failures must have been logged as warn
    const hasSelectWarn = warnLines.some((l) => l.includes("pollNews") && l.includes("cooldown") && l.includes("SELECT"));
    const hasInsertWarn = warnLines.some((l) => l.includes("pollNews") && l.includes("cooldown") && l.includes("INSERT"));
    expect(hasSelectWarn).toBe(true);
    expect(hasInsertWarn).toBe(true);
  });

  it("(d) DB-backed timestamp uses nowMs clock, not SQLite wall clock", async () => {
    // This test verifies the fix: the stored timestamp must match the nowMs
    // value used in the cooldown comparison. If the INSERT used strftime('now')
    // (real clock) but comparison used fake nowMs, the cooldown would be wrong.
    const db = makeDb();
    const bugAlerts: string[] = [];

    // Far-future fake clock: 365 days ahead of real time.
    // If INSERT stored real clock, dbLastMs would be ~365 days in the past
    // relative to the fake 'now', so now - dbLastMs >> 4h → cooldown bypassed.
    const farFutureNow = Date.now() + 365 * 24 * 60 * 60 * 1000;

    // First call
    await pollNews({
      db,
      fetchers: allEmptyFetchers,
      onAllSourcesDark: async (msg) => {
        bugAlerts.push(msg);
      },
      nowMs: () => farFutureNow,
    });
    expect(bugAlerts.length).toBe(1);

    // Simulate restart — clears module-level var
    _resetAllDarkAlert();

    // Second call 1 minute later (still within 24h).
    // If INSERT stored real clock instead of farFutureNow, dbLastMs would be
    // ~365 days behind farFutureNow+1min → now-dbLastMs >> 24h → alert fires → BUG
    await pollNews({
      db,
      fetchers: allEmptyFetchers,
      onAllSourcesDark: async (msg) => {
        bugAlerts.push(msg);
      },
      nowMs: () => farFutureNow + 60_000,
    });
    // Must still be 1 — proves stored timestamp matches nowMs, not real clock
    expect(bugAlerts.length).toBe(1);
  });
});
