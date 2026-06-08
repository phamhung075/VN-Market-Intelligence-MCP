/**
 * Task 1345c — Polymarket Staleness Guard
 *
 * Tests for:
 *   1. checkStaleness() helper — 3 cases
 *   2. runPredictionMarketPoll() integration — 4 cases
 *
 * All tests use in-memory SQLite injected via opts.db.
 * staleThresholdHours = 0 is used to force stale state without waiting.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import Database from "bun:sqlite";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";
import {
  checkStaleness,
  runPredictionMarketPoll,
  _resetStalenessAlertCooldown,
} from "../scheduler/macro/predictionMarketJob.js";

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Create a minimal in-memory DB with the prediction_markets table. */
function createTestDb(): Database {
  const db = new Database(":memory:");
  db.run(`
    CREATE TABLE IF NOT EXISTS prediction_markets (
      id TEXT PRIMARY KEY,
      question TEXT NOT NULL,
      end_date TEXT NOT NULL,
      yes_price REAL NOT NULL DEFAULT 0.5,
      no_price REAL NOT NULL DEFAULT 0.5,
      volume_24h REAL NOT NULL DEFAULT 0,
      volume_total REAL NOT NULL DEFAULT 0,
      liquidity REAL NOT NULL DEFAULT 0,
      last_trade_price REAL NOT NULL DEFAULT 0.5,
      unique_wallets INTEGER NOT NULL DEFAULT 0,
      tags TEXT NOT NULL DEFAULT '[]',
      fetched_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS prediction_signals (
      id TEXT PRIMARY KEY,
      market_id TEXT NOT NULL,
      signal_type TEXT NOT NULL,
      severity TEXT NOT NULL,
      yes_price_prev REAL,
      yes_price_curr REAL NOT NULL,
      volume_24h REAL NOT NULL,
      unique_wallets INTEGER NOT NULL,
      confidence REAL NOT NULL,
      mapped_sectors TEXT NOT NULL DEFAULT '[]',
      mapped_stocks TEXT NOT NULL DEFAULT '[]',
      reasoning TEXT NOT NULL,
      detected_at TEXT NOT NULL
    )
  `);
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

/** Insert a row with a given fetched_at ISO 8601 timestamp. */
function insertMarketRow(db: Database, fetchedAt: string): void {
  db.run(
    `INSERT INTO prediction_markets
      (id, question, end_date, yes_price, no_price, volume_24h, volume_total,
       liquidity, last_trade_price, unique_wallets, tags, fetched_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      "mkt-1",
      "Will oil price exceed $100?",
      "2026-12-31T00:00:00.000Z",
      0.6,
      0.4,
      75000,
      500000,
      20000,
      0.6,
      25,
      '["oil","energy"]',
      fetchedAt,
      fetchedAt,
    ],
  );
}

// ─── checkStaleness tests ─────────────────────────────────────────────────────

describe("Task 1345c — checkStaleness()", () => {
  it("returns { isStale: true, ageHours: Infinity } when table empty", () => {
    const db = createTestDb();
    const result = checkStaleness(db, 24);
    expect(result.isStale).toBe(true);
    expect(result.ageHours).toBe(Infinity);
    db.close();
  });

  it("returns { isStale: false } when fetched_at is recent (within threshold)", () => {
    const db = createTestDb();
    // fetched_at = 1 minute ago — well within 24h threshold
    const recentTimestamp = new Date(Date.now() - 60 * 1000).toISOString();
    insertMarketRow(db, recentTimestamp);

    const result = checkStaleness(db, 24);
    expect(result.isStale).toBe(false);
    expect(result.ageHours).toBeGreaterThanOrEqual(0);
    expect(result.ageHours).toBeLessThan(1);
    db.close();
  });

  it("returns { isStale: true } when fetched_at is older than threshold", () => {
    const db = createTestDb();
    // fetched_at = 26 days ago (matches the real bug: 2026-04-01 data)
    const staleTimestamp = new Date(
      Date.now() - 26 * 24 * 3600 * 1000,
    ).toISOString();
    insertMarketRow(db, staleTimestamp);

    const result = checkStaleness(db, 24);
    expect(result.isStale).toBe(true);
    expect(result.ageHours).toBeGreaterThan(24);
    db.close();
  });
});

// ─── runPredictionMarketPoll staleness integration tests ──────────────────────

describe("Task 1345c — runPredictionMarketPoll() staleness guard", () => {
  let db: Database;
  const telegramMessages: string[] = [];

  beforeEach(() => {
    db = createTestDb();
    telegramMessages.length = 0;
    _resetStalenessAlertCooldown();
  });

  afterEach(() => {
    db.close();
  });

  it("skips detectPredictionSignals when data is stale", async () => {
    // Insert a market row with fetched_at = 30 days ago
    const staleTimestamp = new Date(
      Date.now() - 30 * 24 * 3600 * 1000,
    ).toISOString();
    insertMarketRow(db, staleTimestamp);

    let signalDetectorCalled = false;

    // fetchFn returns the stale cached market (simulates fetchPolymarkets
    // failure + fallback path: returns existing cached rows with old fetched_at)
    await runPredictionMarketPoll({
      enabled: true,
      db,
      staleThresholdHours: 0, // threshold=0 → any data is stale
      fetchFn: async () => [
        {
          id: "mkt-1",
          question: "Will oil price exceed $100?",
          endDate: "2026-12-31T00:00:00.000Z",
          yesPrice: 0.6,
          noPrice: 0.4,
          volume24h: 75000,
          volumeTotal: 500000,
          liquidity: 20000,
          lastTradePrice: 0.6,
          uniqueWalletsCount: 25,
          tags: ["oil", "energy"],
          fetchedAt: staleTimestamp,
        },
      ],
      telegramFn: async (_msg: string) => {
        telegramMessages.push(_msg);
      },
      _signalDetectorSpy: () => {
        signalDetectorCalled = true;
        return [];
      },
    });

    expect(signalDetectorCalled).toBe(false);
  });

  it("sends Telegram bug alert when data is stale", async () => {
    const staleTimestamp = new Date(
      Date.now() - 30 * 24 * 3600 * 1000,
    ).toISOString();
    insertMarketRow(db, staleTimestamp);

    const staleMarket = {
      id: "mkt-1",
      question: "Will oil price exceed $100?",
      endDate: "2026-12-31T00:00:00.000Z",
      yesPrice: 0.6,
      noPrice: 0.4,
      volume24h: 75000,
      volumeTotal: 500000,
      liquidity: 20000,
      lastTradePrice: 0.6,
      uniqueWalletsCount: 25,
      tags: ["oil", "energy"],
      fetchedAt: staleTimestamp,
    };

    await runPredictionMarketPoll({
      enabled: true,
      db,
      staleThresholdHours: 0,
      fetchFn: async () => [staleMarket],
      telegramFn: async (msg: string) => {
        telegramMessages.push(msg);
      },
    });

    const bugAlerts = telegramMessages.filter((m) =>
      m.toLowerCase().includes("stale"),
    );
    expect(bugAlerts.length).toBeGreaterThanOrEqual(1);
    // Alert must include ageHours for ops debugging
    expect(bugAlerts[0]).toMatch(/\d+/); // contains some number (age)
  });

  it("does NOT repeat staleness alert within 24h cooldown", async () => {
    const staleTimestamp = new Date(
      Date.now() - 30 * 24 * 3600 * 1000,
    ).toISOString();
    insertMarketRow(db, staleTimestamp);

    const staleMarketForCooldown = {
      id: "mkt-1",
      question: "Will oil price exceed $100?",
      endDate: "2026-12-31T00:00:00.000Z",
      yesPrice: 0.6,
      noPrice: 0.4,
      volume24h: 75000,
      volumeTotal: 500000,
      liquidity: 20000,
      lastTradePrice: 0.6,
      uniqueWalletsCount: 25,
      tags: ["oil", "energy"],
      fetchedAt: staleTimestamp,
    };

    const opts = {
      enabled: true,
      db,
      staleThresholdHours: 0,
      fetchFn: async () => [staleMarketForCooldown],
      telegramFn: async (msg: string) => {
        telegramMessages.push(msg);
      },
    };

    // First call → alert fires
    await runPredictionMarketPoll(opts);
    const countAfterFirst = telegramMessages.filter((m) =>
      m.toLowerCase().includes("stale"),
    ).length;
    expect(countAfterFirst).toBe(1);

    // Second call immediately after → cooldown active → no new alert
    await runPredictionMarketPoll(opts);
    const countAfterSecond = telegramMessages.filter((m) =>
      m.toLowerCase().includes("stale"),
    ).length;
    expect(countAfterSecond).toBe(1); // still 1, not 2
  });

  it("processes signals normally when data is fresh", async () => {
    // fetched_at = 1 minute ago
    const freshTimestamp = new Date(Date.now() - 60 * 1000).toISOString();
    insertMarketRow(db, freshTimestamp);

    let signalDetectorCalled = false;

    await runPredictionMarketPoll({
      enabled: true,
      db,
      staleThresholdHours: 24,
      fetchFn: async () => [
        {
          id: "mkt-1",
          question: "Will oil price exceed $100?",
          endDate: "2026-12-31T00:00:00.000Z",
          yesPrice: 0.6,
          noPrice: 0.4,
          volume24h: 75000,
          volumeTotal: 500000,
          liquidity: 20000,
          lastTradePrice: 0.6,
          uniqueWalletsCount: 25,
          tags: ["oil", "energy"],
          fetchedAt: freshTimestamp,
        },
      ],
      telegramFn: async (_msg: string) => {
        telegramMessages.push(_msg);
      },
      _signalDetectorSpy: () => {
        signalDetectorCalled = true;
        return [];
      },
    });

    expect(signalDetectorCalled).toBe(true);
  });
});
