/**
 * Task 248 — Prediction Market Outcome Validation
 *
 * Tests:
 *   1. outcome 'confirmed' when mapped stock moves >2% in predicted direction
 *   2. outcome 'false_positive' when mapped stock moves >2% in opposite direction
 *   3. outcome 'neutral' when no significant price move
 *   4. get_prediction_accuracy returns correct precision per signal_type
 *   5. handles no prediction signals gracefully
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { runPredictionOutcomeCheck } from "../scheduler/macro/predictionOutcomeJob.js";

// ─── In-memory DB helpers ──────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS prediction_markets (
      id               TEXT PRIMARY KEY,
      question         TEXT NOT NULL,
      end_date         TEXT NOT NULL,
      yes_price        REAL NOT NULL,
      no_price         REAL NOT NULL,
      volume_24h       REAL NOT NULL DEFAULT 0,
      volume_total     REAL NOT NULL DEFAULT 0,
      liquidity        REAL NOT NULL DEFAULT 0,
      last_trade_price REAL NOT NULL DEFAULT 0,
      unique_wallets   INTEGER NOT NULL DEFAULT 0,
      tags             TEXT NOT NULL DEFAULT '[]',
      fetched_at       TEXT NOT NULL,
      updated_at       TEXT NOT NULL
    )
  `);

  db.exec(`
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
      detected_at     TEXT NOT NULL,
      outcome         TEXT,
      outcome_price_change REAL,
      FOREIGN KEY (market_id) REFERENCES prediction_markets(id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS market_prices_history (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      code       TEXT NOT NULL,
      price      REAL NOT NULL,
      recorded_at TEXT NOT NULL
    )
  `);

  return db;
}

function insertMarket(db: Database, id: string): void {
  db.exec(`
    INSERT OR REPLACE INTO prediction_markets
      (id, question, end_date, yes_price, no_price, volume_24h, volume_total,
       liquidity, last_trade_price, unique_wallets, tags, fetched_at, updated_at)
    VALUES
      ('${id}', 'Will VNM rise?', '2026-06-01', 0.65, 0.35, 100000, 500000,
       50000, 0.65, 50, '["vietnam"]', datetime('now'), datetime('now'))
  `);
}

function insertSignal(
  db: Database,
  opts: {
    id: string;
    marketId: string;
    signalType?: string;
    severity?: string;
    yesPricePrev?: number;
    yesPriceCurr?: number;
    mappedStocks?: string[];
    detectedAt?: string;
    outcome?: string | null;
  },
): void {
  const {
    id,
    marketId,
    signalType = "probability_shift",
    severity = "high",
    yesPricePrev = 0.5,
    yesPriceCurr = 0.65,
    mappedStocks = ["VNM"],
    detectedAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 24h ago
    outcome = null,
  } = opts;

  db.prepare(`
    INSERT OR REPLACE INTO prediction_signals
      (id, market_id, signal_type, severity, yes_price_prev, yes_price_curr,
       volume_24h, unique_wallets, confidence, mapped_sectors, mapped_stocks,
       reasoning, detected_at, outcome, outcome_price_change)
    VALUES
      (?, ?, ?, ?, ?, ?, 50000, 50, 0.8, '[]', ?, 'Test signal', ?, ?, NULL)
  `).run(
    id,
    marketId,
    signalType,
    severity,
    yesPricePrev,
    yesPriceCurr,
    JSON.stringify(mappedStocks),
    detectedAt,
    outcome,
  );
}

function insertPriceHistory(
  db: Database,
  code: string,
  price: number,
  recordedAt: string,
): void {
  db.prepare(
    `INSERT INTO market_prices_history (code, price, recorded_at) VALUES (?, ?, ?)`,
  ).run(code, price, recordedAt);
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("Task 248 — Prediction Market Outcome Validation", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
  });

  afterEach(() => {
    db.close();
  });

  // ── Test 1: confirmed outcome ───────────────────────────────────────────────
  it("records 'confirmed' when mapped stock moves >2% in predicted direction", async () => {
    insertMarket(db, "market-1");

    const signalTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24h ago
    const signalTimeIso = signalTime.toISOString();

    // Signal is probability_shift (bullish — yes price went up)
    insertSignal(db, {
      id: "sig-1",
      marketId: "market-1",
      signalType: "probability_shift",
      mappedStocks: ["VNM"],
      detectedAt: signalTimeIso,
    });

    // Price at signal time
    insertPriceHistory(db, "VNM", 100, signalTimeIso);

    // Price 48h after signal (+3% move = confirmed)
    const afterTime = new Date(
      signalTime.getTime() + 48 * 60 * 60 * 1000,
    ).toISOString();
    insertPriceHistory(db, "VNM", 103, afterTime);

    await runPredictionOutcomeCheck(db);

    const row = db
      .prepare(`SELECT outcome, outcome_price_change FROM prediction_signals WHERE id = 'sig-1'`)
      .get() as { outcome: string; outcome_price_change: number } | undefined;

    expect(row).toBeDefined();
    expect(row!.outcome).toBe("confirmed");
    expect(row!.outcome_price_change).toBeGreaterThan(2);
  });

  // ── Test 2: false_positive outcome ─────────────────────────────────────────
  it("records 'false_positive' when mapped stock moves >2% in opposite direction", async () => {
    insertMarket(db, "market-2");

    const signalTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const signalTimeIso = signalTime.toISOString();

    // Signal was bullish (probability_shift up)
    insertSignal(db, {
      id: "sig-2",
      marketId: "market-2",
      signalType: "probability_shift",
      yesPricePrev: 0.5,
      yesPriceCurr: 0.65,
      mappedStocks: ["FPT"],
      detectedAt: signalTimeIso,
    });

    // Price at signal time
    insertPriceHistory(db, "FPT", 100, signalTimeIso);

    // Price 48h after signal (-3% move = false positive)
    const afterTime = new Date(
      signalTime.getTime() + 48 * 60 * 60 * 1000,
    ).toISOString();
    insertPriceHistory(db, "FPT", 97, afterTime);

    await runPredictionOutcomeCheck(db);

    const row = db
      .prepare(`SELECT outcome, outcome_price_change FROM prediction_signals WHERE id = 'sig-2'`)
      .get() as { outcome: string; outcome_price_change: number } | undefined;

    expect(row).toBeDefined();
    expect(row!.outcome).toBe("false_positive");
    expect(row!.outcome_price_change).toBeLessThan(-2);
  });

  // ── Test 3: neutral outcome ─────────────────────────────────────────────────
  it("records 'neutral' when no significant price move", async () => {
    insertMarket(db, "market-3");

    const signalTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const signalTimeIso = signalTime.toISOString();

    insertSignal(db, {
      id: "sig-3",
      marketId: "market-3",
      signalType: "volume_spike",
      mappedStocks: ["VCB"],
      detectedAt: signalTimeIso,
    });

    // Price at signal time
    insertPriceHistory(db, "VCB", 100, signalTimeIso);

    // Price 48h after signal (+0.5% move = neutral)
    const afterTime = new Date(
      signalTime.getTime() + 48 * 60 * 60 * 1000,
    ).toISOString();
    insertPriceHistory(db, "VCB", 100.5, afterTime);

    await runPredictionOutcomeCheck(db);

    const row = db
      .prepare(`SELECT outcome FROM prediction_signals WHERE id = 'sig-3'`)
      .get() as { outcome: string } | undefined;

    expect(row).toBeDefined();
    expect(row!.outcome).toBe("neutral");
  });

  // ── Test 4: get_prediction_accuracy precision computation ───────────────────
  it("get_prediction_accuracy returns correct precision per signal_type", async () => {
    insertMarket(db, "market-acc");

    const signalTime = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    // 2 confirmed probability_shift + 1 false_positive = precision 0.67
    insertSignal(db, {
      id: "acc-1",
      marketId: "market-acc",
      signalType: "probability_shift",
      detectedAt: signalTime,
      outcome: "confirmed",
    });
    // Update outcome directly (simulating already-validated signals)
    db.exec(`UPDATE prediction_signals SET outcome = 'confirmed' WHERE id = 'acc-1'`);

    insertSignal(db, {
      id: "acc-2",
      marketId: "market-acc",
      signalType: "probability_shift",
      detectedAt: signalTime,
      outcome: "confirmed",
    });
    db.exec(`UPDATE prediction_signals SET outcome = 'confirmed' WHERE id = 'acc-2'`);

    insertSignal(db, {
      id: "acc-3",
      marketId: "market-acc",
      signalType: "probability_shift",
      detectedAt: signalTime,
      outcome: "false_positive",
    });
    db.exec(`UPDATE prediction_signals SET outcome = 'false_positive' WHERE id = 'acc-3'`);

    // 1 confirmed volume_spike = precision 1.0
    insertSignal(db, {
      id: "acc-4",
      marketId: "market-acc",
      signalType: "volume_spike",
      detectedAt: signalTime,
      outcome: "confirmed",
    });
    db.exec(`UPDATE prediction_signals SET outcome = 'confirmed' WHERE id = 'acc-4'`);

    const { computePredictionAccuracy } = await import(
      "../scheduler/macro/predictionOutcomeJob.js"
    );
    const result = computePredictionAccuracy(db, 30);

    expect(result.length).toBeGreaterThan(0);

    const probShift = result.find((r) => r.signalType === "probability_shift");
    expect(probShift).toBeDefined();
    expect(probShift!.total).toBe(3);
    expect(probShift!.confirmed).toBe(2);
    expect(probShift!.falsePositive).toBe(1);
    expect(probShift!.precision).toBeCloseTo(0.667, 2);

    const volSpike = result.find((r) => r.signalType === "volume_spike");
    expect(volSpike).toBeDefined();
    expect(volSpike!.total).toBe(1);
    expect(volSpike!.confirmed).toBe(1);
    expect(volSpike!.precision).toBe(1.0);
  });

  // ── Test 5: handles no prediction signals gracefully ───────────────────────
  it("handles no prediction signals gracefully", async () => {
    // Empty DB — no signals
    await expect(runPredictionOutcomeCheck(db)).resolves.toBeUndefined();

    const { computePredictionAccuracy } = await import(
      "../scheduler/macro/predictionOutcomeJob.js"
    );
    const result = computePredictionAccuracy(db, 30);
    expect(result).toEqual([]);
  });

  // ── Test 6: does not re-process already-validated signals ──────────────────
  it("does not overwrite signals that already have an outcome", async () => {
    insertMarket(db, "market-skip");

    const signalTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    insertSignal(db, {
      id: "sig-skip",
      marketId: "market-skip",
      signalType: "volume_spike",
      mappedStocks: ["VNM"],
      detectedAt: signalTime,
      outcome: "confirmed",
    });
    // Force outcome to confirmed before running
    db.exec(`UPDATE prediction_signals SET outcome = 'confirmed' WHERE id = 'sig-skip'`);

    // Add conflicting price data that would give false_positive
    insertPriceHistory(db, "VNM", 100, signalTime);
    const afterTime = new Date(
      new Date(signalTime).getTime() + 48 * 60 * 60 * 1000,
    ).toISOString();
    insertPriceHistory(db, "VNM", 90, afterTime);

    await runPredictionOutcomeCheck(db);

    const row = db
      .prepare(`SELECT outcome FROM prediction_signals WHERE id = 'sig-skip'`)
      .get() as { outcome: string } | undefined;

    // Should remain 'confirmed' — not overwritten
    expect(row!.outcome).toBe("confirmed");
  });
});
