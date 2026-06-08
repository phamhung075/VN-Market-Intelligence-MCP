/**
 * 1337-infra-db-cb-fixes.test.ts
 *
 * Tests for three infrastructure fixes:
 *   Issue 1: hour_bucket idempotent migration in tracked_indicators
 *   Issue 2: foreignFlow circuit breaker resetTimeoutMs = 300_000
 *   Issue 3: Polymarket CLOB fetch bypasses circuit breaker
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ─────────────────────────────────────────────────────────────────────────────
// Issue 1 — hour_bucket idempotent migration
// ─────────────────────────────────────────────────────────────────────────────

describe("Issue 1 — tracked_indicators hour_bucket idempotent migration", () => {
  it("runs initMacroTables on a DB that already has tracked_indicators WITHOUT hour_bucket without throwing", async () => {
    // Simulate an existing production DB that was created before hour_bucket was added.
    // We create the table manually without hour_bucket, then call initMacroTables.
    // Without the migration guard this throws: "table tracked_indicators already has column hour_bucket"
    // With the migration guard the ALTER is swallowed and the function completes.
    const { initMacroTables } = await import("../infrastructure/db/schema-macro.js");
    const db = new Database(":memory:");
    initNewsTables(db);
    initMarketDataTables(db);
    initSystemTables(db);

    // Create the table WITHOUT hour_bucket (old schema)
    db.exec(`
      CREATE TABLE tracked_indicators (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        indicator    TEXT NOT NULL,
        value        REAL NOT NULL,
        unit         TEXT NOT NULL DEFAULT '',
        source       TEXT NOT NULL DEFAULT '',
        extracted_at TEXT NOT NULL
      )
    `);

    // Now call initMacroTables — must NOT throw
    expect(() => initMacroTables(db)).not.toThrow();

    // Verify hour_bucket column now exists
    const cols = db.prepare("PRAGMA table_info(tracked_indicators)").all() as Array<{ name: string }>;
    const hasHourBucket = cols.some((c) => c.name === "hour_bucket");
    expect(hasHourBucket).toBe(true);

    db.close();
  });

  it("runs initMacroTables on a fresh DB (no pre-existing tracked_indicators table) without throwing", async () => {
    const { initMacroTables } = await import("../infrastructure/db/schema-macro.js");
    const db = new Database(":memory:");
    initNewsTables(db);
    initMarketDataTables(db);
    initSystemTables(db);
    expect(() => initMacroTables(db)).not.toThrow();
    db.close();
  });

  it("runs initMacroTables twice on the same DB (fully idempotent) without throwing", async () => {
    const { initMacroTables } = await import("../infrastructure/db/schema-macro.js");
    const db = new Database(":memory:");
    initNewsTables(db);
    initMarketDataTables(db);
    initSystemTables(db);
    initMacroTables(db);
    // Second call must be safe (CREATE IF NOT EXISTS + catch on ALTER)
    expect(() => initMacroTables(db)).not.toThrow();
    db.close();
  });

  it("trigger trg_tracked_ind_hour_bucket populates hour_bucket on insert", async () => {
    const { initMacroTables } = await import("../infrastructure/db/schema-macro.js");
    const db = new Database(":memory:");
    initNewsTables(db);
    initMarketDataTables(db);
    initSystemTables(db);
    initMacroTables(db);

    db.exec(`
      INSERT INTO tracked_indicators (indicator, value, source, extracted_at)
      VALUES ('CPI_VN', 3.5, 'imf', '2026-04-26T09:30:00')
    `);

    const row = db.prepare("SELECT hour_bucket FROM tracked_indicators WHERE indicator = 'CPI_VN'").get() as { hour_bucket: string };
    expect(row.hour_bucket).toBe("2026-04-26T09:00:00");
    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Issue 2 — foreignFlow circuit breaker reset timeout
// ─────────────────────────────────────────────────────────────────────────────

describe("Issue 2 — foreignFlow circuit breaker resetTimeoutMs", () => {
  it("foreignFlow breaker has resetTimeoutMs of 600_000 (10 minutes, Task 1407 backoff increase)", async () => {
    const { breakers } = await import("../infrastructure/circuitBreakerRegistry.js");
    // Task 1407: resetTimeoutMs increased from 5 min (300_000) to 10 min (600_000) to
    // reduce HALF_OPEN probe thrash. Off-hours failures are prevented by the market-hours
    // gate in foreignFlowFetcherJob.ts. This test was previously asserting 300_000.
    const cb = breakers.foreignFlow as unknown as { config: { resetTimeoutMs: number } };
    expect(cb.config.resetTimeoutMs).toBe(600_000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Issue 3 — Polymarket CLOB fetch bypasses circuit breaker
//
// The fix splits the default fetch function into two paths:
//   - CLOB: raw fetch() — not circuit-breaker-wrapped (errors are non-fatal)
//   - Gamma: breakers.polymarket.execute(...) — CB-protected
//
// We test this by reading the source of defaultFetchFn structure indirectly:
// inject a gammaFetchFn that goes through the CB manually, and verify that
// the exported fetchPolymarkets signature exposes a separate clobFetchFn
// (or equivalent) that does not increment the CB on failure.
// ─────────────────────────────────────────────────────────────────────────────

describe("Issue 3 — Polymarket CLOB fetch bypasses circuit breaker", () => {
  // Reset the shared polymarket circuit breaker after this suite runs so it
  // doesn't bleed open state into other test files (e.g. 164-polymarket-fetcher).
  afterAll(async () => {
    const { resetAllBreakers } = await import("../infrastructure/circuitBreakerRegistry.js");
    resetAllBreakers();
  });

  it("fetchPolymarkets exports a separate clobFetchFn parameter for CLOB-only injection", async () => {
    // After the fix, fetchPolymarkets accepts an optional clobFetchFn parameter.
    // A CLOB failure through clobFetchFn must NOT increment the polymarket CB.
    const { breakers, resetAllBreakers } = await import("../infrastructure/circuitBreakerRegistry.js");
    const { fetchPolymarkets } = await import("../infrastructure/fetchers/polymarket.js");

    resetAllBreakers();

    const config = {
      enabled: true,
      pollingIntervalMinutes: 30,
      clobApiUrl: "https://clob.polymarket.com",
      gammaApiUrl: "https://gamma-api.polymarket.com",
      maxMarketsPerPoll: 5,
      rateLimitDelayMs: 0,
      relevantKeywords: ["vietnam"],
      curatedMarketIds: [],
      probabilityShiftPct: 5,
      volumeSpikeThresholdUsd: 50000,
      minUniqueWallets: 10,
      whaleTradeThresholdUsd: 10000,
      staleThresholdHours: 24,
    };

    // clobFetchFn throws 403 — must NOT touch the circuit breaker
    const clobFetchFn = async (_url: string): Promise<string> => {
      throw new Error("HTTP 403 from CLOB endpoint");
    };

    // gammaFetchFn succeeds — Gamma is the real source
    const gammaFetchFn = async (_url: string): Promise<string> => JSON.stringify([]);

    // The fixed signature: fetchPolymarkets(config, gammaFetchFn, clobFetchFn)
    await fetchPolymarkets(config, gammaFetchFn, clobFetchFn);

    // CB must remain closed — CLOB 403 did not count against the polymarket breaker
    expect(breakers.polymarket.stats.state).toBe("closed");
    expect(breakers.polymarket.stats.failures).toBe(0);
  });

  it("a Gamma failure via the CB-wrapped gammaFetchFn DOES open the polymarket circuit breaker", async () => {
    const { breakers, resetAllBreakers } = await import("../infrastructure/circuitBreakerRegistry.js");
    const { fetchPolymarkets } = await import("../infrastructure/fetchers/polymarket.js");

    resetAllBreakers();

    const config = {
      enabled: true,
      pollingIntervalMinutes: 30,
      clobApiUrl: "https://clob.polymarket.com",
      gammaApiUrl: "https://gamma-api.polymarket.com",
      maxMarketsPerPoll: 5,
      rateLimitDelayMs: 0,
      relevantKeywords: ["vietnam"],
      curatedMarketIds: [],
      probabilityShiftPct: 5,
      volumeSpikeThresholdUsd: 50000,
      minUniqueWallets: 10,
      whaleTradeThresholdUsd: 10000,
      staleThresholdHours: 24,
    };

    // gammaFetchFn that always throws — goes through CB
    const gammaFetchFn = async (_url: string): Promise<string> => {
      // This goes through breakers.polymarket.execute inside fetchPolymarkets
      throw new Error("Gamma network error");
    };

    const clobFetchFn = async (_url: string): Promise<string> => JSON.stringify([]);

    // Threshold is 5 — trip after 5 Gamma failures
    for (let i = 0; i < 5; i++) {
      await fetchPolymarkets(config, gammaFetchFn, clobFetchFn);
    }

    expect(breakers.polymarket.stats.state).toBe("open");
  });
});
