Bun.env["DB_PATH"] = ":memory:";
import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ─────────────────────────────────────────────────────────────────────────────
// Minimal in-memory schema helper (matches schema.ts CREATE TABLE statements)
// ─────────────────────────────────────────────────────────────────────────────

function buildTestDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS prediction_markets (
      id               TEXT PRIMARY KEY,
      question         TEXT NOT NULL,
      end_date         TEXT NOT NULL DEFAULT '',
      yes_price        REAL NOT NULL DEFAULT 0,
      no_price         REAL NOT NULL DEFAULT 0,
      volume_24h       REAL NOT NULL DEFAULT 0,
      volume_total     REAL NOT NULL DEFAULT 0,
      liquidity        REAL NOT NULL DEFAULT 0,
      last_trade_price REAL NOT NULL DEFAULT 0,
      unique_wallets   INTEGER NOT NULL DEFAULT 0,
      tags             TEXT NOT NULL DEFAULT '[]',
      fetched_at       TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS prediction_signals (
      id              TEXT PRIMARY KEY,
      market_id       TEXT NOT NULL,
      signal_type     TEXT NOT NULL,
      severity        TEXT NOT NULL,
      yes_price_prev  REAL,
      yes_price_curr  REAL NOT NULL,
      volume_24h      REAL NOT NULL DEFAULT 0,
      unique_wallets  INTEGER NOT NULL DEFAULT 0,
      confidence      REAL NOT NULL,
      mapped_sectors  TEXT NOT NULL DEFAULT '[]',
      mapped_stocks   TEXT NOT NULL DEFAULT '[]',
      reasoning       TEXT NOT NULL,
      detected_at     TEXT NOT NULL
    );
  `);

  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

describe("Task 1209 — Polymarket staleness fix", () => {
  // ── freshness query: updated_at vs fetched_at ─────────────────────────────

  it("dataFreshnessTools: MAX(updated_at) is fresher than MAX(fetched_at) when API returns stale timestamps", () => {
    const db = buildTestDb();

    const oldFetchedAt = new Date(Date.now() - 12 * 24 * 3600 * 1000).toISOString();
    const freshUpdatedAt = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 min ago

    db.prepare(`
      INSERT OR REPLACE INTO prediction_markets
        (id, question, end_date, yes_price, no_price, volume_24h, volume_total,
         liquidity, last_trade_price, unique_wallets, tags, fetched_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "test-market-1",
      "Will VN30 rise above 1300 by end of 2025?",
      "2025-12-31",
      0.6, 0.4, 5000, 50000, 1000, 0.6, 50, "[]",
      oldFetchedAt,
      freshUpdatedAt,
    );

    // The freshness query used by dataFreshnessTools should use updated_at
    const updatedAtRow = db.prepare<{ ts: string }, []>(
      "SELECT MAX(updated_at) AS ts FROM prediction_markets"
    ).get();

    const fetchedAtRow = db.prepare<{ ts: string }, []>(
      "SELECT MAX(fetched_at) AS ts FROM prediction_markets"
    ).get();

    // updated_at (5 min ago) should be much newer than fetched_at (12 days ago)
    const updatedAge = (Date.now() - new Date(updatedAtRow!.ts).getTime()) / (1000 * 3600);
    const fetchedAge = (Date.now() - new Date(fetchedAtRow!.ts).getTime()) / (1000 * 3600);

    expect(updatedAge).toBeLessThan(1);    // < 1 hour — "Tot" (fresh)
    expect(fetchedAge).toBeGreaterThan(100); // > 100 hours — "Rat cu" (stale)

    db.close();
  });

  // ── dataFreshnessTools query definition check ─────────────────────────────

  it("DATA_SOURCES definition for prediction_markets uses MAX(updated_at)", async () => {
    // Import the module and inspect its private DATA_SOURCES definition
    // by running the getDataFreshness function with a controlled DB
    const { getDataFreshness } = await import("../interface/mcp/tools/market-data/dataFreshnessTools.js");

    const db = buildTestDb();

    // Insert one market with old fetched_at but fresh updated_at
    const oldFetchedAt = new Date(Date.now() - 12 * 24 * 3600_000).toISOString();
    const freshUpdatedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 min

    db.prepare(`
      INSERT OR REPLACE INTO prediction_markets
        (id, question, end_date, yes_price, no_price, volume_24h, volume_total,
         liquidity, last_trade_price, unique_wallets, tags, fetched_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "pm-fresh",
      "Market question",
      "2026-01-01",
      0.5, 0.5, 1000, 10000, 500, 0.5, 20, "[]",
      oldFetchedAt,
      freshUpdatedAt,
    );

    const report = await getDataFreshness(db);

    // The "Dự đoán (Poly)" row should say "Tốt" (< 1h) because updated_at is 10 min ago
    // NOT "Rất cũ" which would show with fetched_at (12 days ago)
    expect(report).toContain("Tốt");
    expect(report).not.toMatch(/Rất cũ.*Dự đoán|Dự đoán.*Rất cũ/);

    db.close();
  });

  // ── predictionMarketJob: disabled flag ────────────────────────────────────

  it("runPredictionMarketPoll: returns immediately when disabled", async () => {
    const { runPredictionMarketPoll } = await import("../scheduler/macro/predictionMarketJob.js");
    const db = buildTestDb();

    let fetchCalled = false;
    await runPredictionMarketPoll({
      enabled: false,
      db,
      fetchFn: async () => {
        fetchCalled = true;
        return [];
      },
    });

    expect(fetchCalled).toBe(false);
    db.close();
  });

  // ── predictionMarketJob: updated_at is refreshed on each poll ────────────

  it("runPredictionMarketPoll: updated_at is refreshed even when API returns same fetchedAt", async () => {
    const { runPredictionMarketPoll } = await import("../scheduler/macro/predictionMarketJob.js");
    const db = buildTestDb();

    const staleTimestamp = new Date(Date.now() - 12 * 24 * 3600_000).toISOString();

    // Pre-seed a market with stale timestamps
    db.prepare(`
      INSERT OR REPLACE INTO prediction_markets
        (id, question, end_date, yes_price, no_price, volume_24h, volume_total,
         liquidity, last_trade_price, unique_wallets, tags, fetched_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "market-stale",
      "Will inflation fall?",
      "2025-12-31",
      0.55, 0.45, 10000, 100000, 5000, 0.55, 100, "[]",
      staleTimestamp,
      staleTimestamp,
    );

    const beforePoll = Date.now();

    // Run poll — API returns market with old fetchedAt (same as stored)
    await runPredictionMarketPoll({
      enabled: true,
      db,
      fetchFn: async () => [
        {
          id: "market-stale",
          question: "Will inflation fall?",
          endDate: "2025-12-31",
          yesPrice: 0.55,
          noPrice: 0.45,
          volume24h: 10000,
          volumeTotal: 100000,
          liquidity: 5000,
          lastTradePrice: 0.55,
          uniqueWalletsCount: 100,
          tags: [],
          fetchedAt: staleTimestamp, // API still returns old fetchedAt
        },
      ],
      telegramFn: async () => {},
    });

    const afterRow = db.prepare<{ updated_at: string }, [string]>(
      "SELECT updated_at FROM prediction_markets WHERE id = ?"
    ).get("market-stale");

    // updated_at must be newer than the stale timestamp
    const afterMs = new Date(afterRow!.updated_at).getTime();
    expect(afterMs).toBeGreaterThanOrEqual(beforePoll);
    expect(afterRow!.updated_at).not.toBe(staleTimestamp);

    db.close();
  });
});
