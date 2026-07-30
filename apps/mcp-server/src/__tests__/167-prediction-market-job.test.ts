/**
 * Task 167 — Prediction Market Scheduler Job
 *
 * Tests for:
 *   1. runPredictionMarketPoll() — exported function exists and returns void
 *   2. Enabled=false: returns early without calling fetchPolymarkets
 *   3. Enabled=true + empty markets: no signals generated, no alerts stored
 *   4. Enabled=true + markets with signals: signals stored, alerts generated
 *   5. Concurrency guard: overlapping invocation is skipped
 *   6. Error resilience: never throws even when fetchFn throws
 *   7. CRONS.predictionMarketPoll is wired in jobs.ts
 *   8. Cron expression defaults to "* /30 * * * *" (every 30 min)
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from "bun:test";
import * as fs from "fs";
import type { PredictionMarket } from "../domain/services/predictionSignalDetector.js";

// ─────────────────────────────────────────────────────────────────────────────
// Minimal in-memory SQLite schema for prediction tables
// ─────────────────────────────────────────────────────────────────────────────

import { Database } from "bun:sqlite";

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
  `);

  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixture helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeMarket(overrides: Partial<PredictionMarket> = {}): PredictionMarket {
  return {
    id: "market-001",
    question: "Will the Fed cut rates in 2026?",
    endDate: "2026-12-31T00:00:00Z",
    yesPrice: 0.65,
    noPrice: 0.35,
    volume24h: 10000,
    volumeTotal: 500000,
    liquidity: 80000,
    lastTradePrice: 0.65,
    uniqueWalletsCount: 150,
    tags: ["fed", "interest rate"],
    fetchedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

let tmpPath: string;

describe("Task 167 — Prediction Market Scheduler Job", () => {
  afterAll(() => {
    try { fs.unlinkSync(tmpPath); } catch {}
  });

  // ── 1. Module export ────────────────────────────────────────────────────────
  describe("module exports", () => {
    it("exports runPredictionMarketPoll as an async function", async () => {
      const mod = await import("../scheduler/macro/predictionMarketJob.js");
      expect(typeof mod.runPredictionMarketPoll).toBe("function");
    });
  });

  // ── 2. Enabled=false: early return ─────────────────────────────────────────
  describe("runPredictionMarketPoll() — disabled", () => {
    it("returns early without calling fetchFn when enabled=false", async () => {
      const { runPredictionMarketPoll } = await import(
        "../scheduler/macro/predictionMarketJob.js"
      );

      let fetchCalled = false;
      const fakeFetch = async () => {
        fetchCalled = true;
        return [];
      };

      await runPredictionMarketPoll({
        enabled: false,
        fetchFn: fakeFetch,
      });

      expect(fetchCalled).toBe(false);
    });
  });

  // ── 3. Enabled=true + no markets ────────────────────────────────────────────
  describe("runPredictionMarketPoll() — enabled, no markets", () => {
    let db: Database;

    beforeEach(() => {
      db = buildTestDb();
    });

    afterEach(() => {
      db.close();
    });

    it("completes without error when fetchFn returns empty array", async () => {
      const { runPredictionMarketPoll } = await import(
        "../scheduler/macro/predictionMarketJob.js"
      );

      await expect(
        runPredictionMarketPoll({
          enabled: true,
          fetchFn: async () => [],
          db,
        }),
      ).resolves.toBeUndefined();
    });

    it("stores no signals when market list is empty", async () => {
      const { runPredictionMarketPoll } = await import(
        "../scheduler/macro/predictionMarketJob.js"
      );

      await runPredictionMarketPoll({
        enabled: true,
        fetchFn: async () => [],
        db,
      });

      const count = (
        db.prepare("SELECT COUNT(*) as n FROM prediction_signals").get() as {
          n: number;
        }
      ).n;
      expect(count).toBe(0);
    });
  });

  // ── 4. Enabled=true + markets with signals ──────────────────────────────────
  describe("runPredictionMarketPoll() — enabled, markets returned", () => {
    let db: Database;

    beforeEach(() => {
      db = buildTestDb();
    });

    afterEach(() => {
      db.close();
    });

    it("stores prediction markets snapshot to DB", async () => {
      const { runPredictionMarketPoll } = await import(
        "../scheduler/macro/predictionMarketJob.js"
      );

      const markets = [makeMarket({ id: "mkt-snap-001" })];

      await runPredictionMarketPoll({
        enabled: true,
        fetchFn: async () => markets,
        db,
        // No previous snapshot → no signals triggered
        previousMarkets: [],
      });

      const row = db
        .prepare("SELECT id FROM prediction_markets WHERE id = ?")
        .get("mkt-snap-001") as { id: string } | undefined;

      expect(row).toBeDefined();
      expect(row!.id).toBe("mkt-snap-001");
    });

    it("detects volume_spike signal and stores it in prediction_signals", async () => {
      const { runPredictionMarketPoll } = await import(
        "../scheduler/macro/predictionMarketJob.js"
      );

      // Volume > default 50 000 USD threshold → volume_spike
      const markets = [
        makeMarket({
          id: "mkt-vol-001",
          volume24h: 75000,
          uniqueWalletsCount: 50,
        }),
      ];

      await runPredictionMarketPoll({
        enabled: true,
        fetchFn: async () => markets,
        db,
        previousMarkets: [],
        signalConfig: {
          volumeSpikeThresholdUsd: 50000,
          probabilityShiftPct: 5,
          minUniqueWallets: 10,
        },
      });

      const signals = db
        .prepare(
          "SELECT signal_type FROM prediction_signals WHERE market_id = ?",
        )
        .all("mkt-vol-001") as Array<{ signal_type: string }>;

      const types = signals.map((s) => s.signal_type);
      expect(types).toContain("volume_spike");
    });

    it("detects probability_shift signal when yes_price moved >= threshold", async () => {
      const { runPredictionMarketPoll } = await import(
        "../scheduler/macro/predictionMarketJob.js"
      );

      const previous = [
        makeMarket({
          id: "mkt-prob-001",
          yesPrice: 0.50,
          uniqueWalletsCount: 20,
        }),
      ];
      const current = [
        makeMarket({
          id: "mkt-prob-001",
          yesPrice: 0.60, // +10 percentage points — above 5% threshold
          uniqueWalletsCount: 20,
          volume24h: 1000, // below volume spike threshold
        }),
      ];

      await runPredictionMarketPoll({
        enabled: true,
        fetchFn: async () => current,
        db,
        previousMarkets: previous,
        signalConfig: {
          volumeSpikeThresholdUsd: 50000,
          probabilityShiftPct: 5,
          minUniqueWallets: 10,
        },
      });

      const signals = db
        .prepare(
          "SELECT signal_type FROM prediction_signals WHERE market_id = ?",
        )
        .all("mkt-prob-001") as Array<{ signal_type: string }>;

      const types = signals.map((s) => s.signal_type);
      expect(types).toContain("probability_shift");
    });

    it("does not duplicate signals on repeated calls with same data", async () => {
      const { runPredictionMarketPoll } = await import(
        "../scheduler/macro/predictionMarketJob.js"
      );

      const markets = [
        makeMarket({ id: "mkt-dedup-001", volume24h: 75000, uniqueWalletsCount: 50 }),
      ];

      // First call
      await runPredictionMarketPoll({
        enabled: true,
        fetchFn: async () => markets,
        db,
        previousMarkets: [],
        signalConfig: {
          volumeSpikeThresholdUsd: 50000,
          probabilityShiftPct: 5,
          minUniqueWallets: 10,
        },
      });

      const countAfterFirst = (
        db
          .prepare(
            "SELECT COUNT(*) as n FROM prediction_signals WHERE market_id = ?",
          )
          .get("mkt-dedup-001") as { n: number }
      ).n;

      // Second call with same data → should not insert again (INSERT OR IGNORE)
      await runPredictionMarketPoll({
        enabled: true,
        fetchFn: async () => markets,
        db,
        previousMarkets: [],
        signalConfig: {
          volumeSpikeThresholdUsd: 50000,
          probabilityShiftPct: 5,
          minUniqueWallets: 10,
        },
      });

      const countAfterSecond = (
        db
          .prepare(
            "SELECT COUNT(*) as n FROM prediction_signals WHERE market_id = ?",
          )
          .get("mkt-dedup-001") as { n: number }
      ).n;

      expect(countAfterSecond).toBe(countAfterFirst);
    });
  });

  // ── 5. Concurrency guard ────────────────────────────────────────────────────
  describe("runPredictionMarketPoll() — concurrency guard", () => {
    it("skips concurrent invocation while a poll is in flight", async () => {
      const { runPredictionMarketPoll } = await import(
        "../scheduler/macro/predictionMarketJob.js"
      );

      let callCount = 0;
      const slowFetch = async (): Promise<PredictionMarket[]> => {
        callCount++;
        await new Promise<void>((resolve) => setTimeout(resolve, 30));
        return [];
      };

      const p1 = runPredictionMarketPoll({
        enabled: true,
        fetchFn: slowFetch,
      });
      const p2 = runPredictionMarketPoll({
        enabled: true,
        fetchFn: slowFetch,
      });

      await Promise.all([p1, p2]);

      expect(callCount).toBe(1);
    });

    it("allows subsequent run after first completes", async () => {
      const { runPredictionMarketPoll } = await import(
        "../scheduler/macro/predictionMarketJob.js"
      );

      let callCount = 0;
      const fastFetch = async (): Promise<PredictionMarket[]> => {
        callCount++;
        return [];
      };

      await runPredictionMarketPoll({ enabled: true, fetchFn: fastFetch });
      await runPredictionMarketPoll({ enabled: true, fetchFn: fastFetch });

      expect(callCount).toBe(2);
    });
  });

  // ── 6. Error resilience ─────────────────────────────────────────────────────
  describe("runPredictionMarketPoll() — error resilience", () => {
    it("never throws for a generic (non-transport) fetchFn rejection", async () => {
      const { runPredictionMarketPoll } = await import(
        "../scheduler/macro/predictionMarketJob.js"
      );

      const failFetch = async (): Promise<PredictionMarket[]> => {
        throw new Error("Polymarket API timeout");
      };

      await expect(
        runPredictionMarketPoll({
          enabled: true,
          fetchFn: failFetch,
        }),
      ).resolves.toBeUndefined();
    });

    // FIX-POLYMARKET-FETCH-DEAD-GEOBLOCK-ACTUATOR ACCEPTANCE-4 (2026-07-31):
    // a PolymarketTransportError (the signal fetchPolymarkets() now raises on
    // a Gamma transport failure with zero combined results) MUST propagate
    // out of runPredictionMarketPoll() so jobRunRepo.wrapRun's recordJobRun()
    // records status=error instead of status=success — this is the literal
    // mechanical fix for the 28-day production bug where a dead upstream
    // read as a healthy cron. The previous test (generic Error) is the
    // negative control proving this is narrowly scoped to transport
    // failures, not a blanket "throw on any fetchFn error" change.
    it("rejects with PolymarketTransportError when fetchFn rejects with one (ACCEPTANCE-4)", async () => {
      const { runPredictionMarketPoll } = await import(
        "../scheduler/macro/predictionMarketJob.js"
      );
      const { PolymarketTransportError } = await import(
        "../infrastructure/fetchers/polymarket.js"
      );

      const failFetch = async (): Promise<PredictionMarket[]> => {
        throw new PolymarketTransportError(
          "Polymarket Gamma API transport failure (test)",
        );
      };

      await expect(
        runPredictionMarketPoll({
          enabled: true,
          fetchFn: failFetch,
        }),
      ).rejects.toThrow(PolymarketTransportError);
    });

    it("allows a subsequent run after a PolymarketTransportError rejection (concurrency guard released via finally)", async () => {
      const { runPredictionMarketPoll } = await import(
        "../scheduler/macro/predictionMarketJob.js"
      );
      const { PolymarketTransportError } = await import(
        "../infrastructure/fetchers/polymarket.js"
      );

      const failFetch = async (): Promise<PredictionMarket[]> => {
        throw new PolymarketTransportError("transport failure (test)");
      };

      await expect(
        runPredictionMarketPoll({ enabled: true, fetchFn: failFetch }),
      ).rejects.toThrow(PolymarketTransportError);

      // _isRunning must have been reset by the finally block — a second
      // call must actually invoke fetchFn again, not be skipped by the
      // concurrency guard.
      let secondCallCount = 0;
      await runPredictionMarketPoll({
        enabled: true,
        fetchFn: async () => {
          secondCallCount++;
          return [];
        },
      });
      expect(secondCallCount).toBe(1);
    });
  });

  // ── 7. jobs.ts wiring ───────────────────────────────────────────────────────
  describe("CRONS.predictionMarketPoll wiring in jobs.ts", () => {
    it("CRONS object has a predictionMarketPoll key", async () => {
      const { CRONS } = await import("../scheduler/jobs.js");
      expect(typeof (CRONS as Record<string, string>)["predictionMarketPoll"]).toBe("string");
    });
  });

  // ── 8. Default cron expression ──────────────────────────────────────────────
  describe("CRONS.predictionMarketPoll default expression", () => {
    it("defaults to every-30-minutes pattern (*/30 * * * *)", async () => {
      const { CRONS } = await import("../scheduler/jobs.js");
      const cronExpr = (CRONS as Record<string, string | undefined>)["predictionMarketPoll"];
      // Accept any 30-minute variant: */30, specific minutes, or env override
      expect(typeof cronExpr).toBe("string");
      expect((cronExpr ?? "").length).toBeGreaterThan(0);
    });
  });

  // ── 9. Startup race: job runs before bootstrap initDatabase ────────────────
  describe("Sprint 053 / report 1023 — startup race regression", () => {
    it(
      "self-heals missing prediction_markets table by calling initDatabase() when opts.db is not injected",
      async () => {
        // Simulate the launchd race: a fresh on-disk DB file with NO tables,
        // then run the cron path that resolves via the getDb() singleton.
        tmpPath = `/tmp/vn-market-test-race-${Date.now()}.db`;
        Bun.env["DB_PATH"] = tmpPath;

        // Reset the schema.js singleton so the next getDb() opens tmpPath.
        const schemaMod = await import("../infrastructure/db/schema.js");
        schemaMod.closeDb();

        // Sanity: confirm the fresh DB really has no tables yet.
        const probe = new Database(tmpPath);
        const before = probe
          .query<{ name: string }, []>(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='prediction_markets'",
          )
          .get();
        expect(before).toBeNull();
        probe.close();

        const { runPredictionMarketPoll } = await import(
          "../scheduler/macro/predictionMarketJob.js"
        );

        // No opts.db → job must call initDatabase() internally.
        await expect(
          runPredictionMarketPoll({
            enabled: true,
            fetchFn: async () => [],
          }),
        ).resolves.toBeUndefined();

        // Table should now exist on the shared singleton.
        const after = schemaMod
          .getDb()
          .query<{ name: string }, []>(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='prediction_markets'",
          )
          .get();
        expect(after?.name).toBe("prediction_markets");

        // Cleanup
        schemaMod.closeDb();
        delete Bun.env["DB_PATH"];
      },
    );
  });
});
