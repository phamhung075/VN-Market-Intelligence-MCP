Bun.env["DB_PATH"] = ":memory:";
/**
 * Task 1354 — TDD: predictionDiag block + medium-severity fallback
 *
 * Tests cover all acceptance criteria from REQ-120 / TECH-120:
 *   AC-1: high + critical signals pass through untouched (medium excluded when high/critical exist)
 *   AC-2: no high/critical → fallback includes up to 3 medium signals (capped)
 *   AC-3: empty signals → predictionSignals: [], predictionDiag.stored: 0
 *   AC-4: mixed severity (2 high + 2 medium + 1 low) → high only, predictionDiag.stored: 5
 *   AC-5: getPredictionSignalsFn throws → predictionSignals: [], predictionDiag.stored: 0, no crash
 *
 * RED PHASE (before task 1355):
 *   All 5 tests fail because:
 *   - AssembleEveningSummaryOptions has no getPredictionSignalsFn field (task 1355 adds it)
 *   - EveningSummary has no predictionDiag field (task 1355 adds it)
 *   - Step 5 has no medium fallback logic (task 1355 implements it)
 *
 * @ts-expect-error lines mark intentional TDD red-state type gaps that task 1355 resolves.
 *
 * Pattern: uses getPredictionSignalsFn injection (no mock.module).
 * Reference: src/__tests__/1318-prediction-signals-evening.test.ts
 *
 * Layer: tests — uses in-memory SQLite; no real HTTP, no Telegram sends.
 */

import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

import { assembleEveningSummary } from "../application/usecases/assembleEveningSummary.js";
import type { BriefingPredictionSignal } from "../infrastructure/db/predictionStore.js";
import * as loggerModule from "../infrastructure/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Minimal in-memory DB — same schema as 1318 test
// ─────────────────────────────────────────────────────────────────────────────

function setupTestDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");

  db.exec(`
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

    CREATE TABLE IF NOT EXISTS market_prices (
      code        TEXT PRIMARY KEY,
      price       REAL,
      change_amt  REAL,
      change_pct  REAL,
      volume      REAL,
      updated_at  TEXT,
      exchange    TEXT DEFAULT 'HOSE'
    );

    CREATE TABLE IF NOT EXISTS rag_analyses (
      id                 TEXT PRIMARY KEY,
      created_at         TEXT NOT NULL,
      level              TEXT NOT NULL,
      source_url         TEXT,
      source_title       TEXT,
      source_type        TEXT,
      published_at       TEXT,
      sentiment          TEXT,
      impact_score       REAL
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

    CREATE TABLE IF NOT EXISTS prediction_markets (
      id               TEXT PRIMARY KEY,
      question         TEXT NOT NULL,
      end_date         TEXT NOT NULL,
      yes_price        REAL NOT NULL DEFAULT 0,
      no_price         REAL NOT NULL DEFAULT 0,
      volume_24h       REAL NOT NULL DEFAULT 0,
      volume_total     REAL NOT NULL DEFAULT 0,
      liquidity        REAL NOT NULL DEFAULT 0,
      last_trade_price REAL NOT NULL DEFAULT 0,
      unique_wallets   INTEGER NOT NULL DEFAULT 0,
      tags             TEXT NOT NULL DEFAULT '[]',
      fetched_at       TEXT NOT NULL,
      updated_at       TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS prediction_signals (
      id              TEXT PRIMARY KEY,
      market_id       TEXT NOT NULL,
      signal_type     TEXT NOT NULL,
      severity        TEXT NOT NULL,
      yes_price_prev  REAL,
      yes_price_curr  REAL NOT NULL DEFAULT 0,
      volume_24h      REAL NOT NULL DEFAULT 0,
      unique_wallets  INTEGER NOT NULL DEFAULT 0,
      confidence      REAL NOT NULL DEFAULT 0,
      mapped_sectors  TEXT NOT NULL DEFAULT '[]',
      mapped_stocks   TEXT NOT NULL DEFAULT '[]',
      reasoning       TEXT NOT NULL DEFAULT '',
      detected_at     TEXT NOT NULL
    );
  `);

  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// Signal factory helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeSignal(
  id: string,
  severity: "low" | "medium" | "high" | "critical",
  overrides: Partial<BriefingPredictionSignal> = {},
): BriefingPredictionSignal {
  return {
    marketId: `market-${id}`,
    question: `Test question for ${id}`,
    signalType: "probability_shift",
    severity,
    yesPriceCurr: 0.65,
    confidence: 0.8,
    reasoning: `Test reasoning for ${id}`,
    detectedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared tmp dir
// ─────────────────────────────────────────────────────────────────────────────

let tmpDir: string;

// ─────────────────────────────────────────────────────────────────────────────
// AC-1: high + critical signals pass through untouched
// Medium signals also present but excluded when high/critical exist
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-1: high/critical signals pass through — medium excluded when high/critical exist", () => {
  beforeEach(() => {
    tmpDir = join("/tmp", `pred-fallback-ac1-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });
  afterEach(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns only high+critical signals (length 2), excludes medium — predictionDiag.stored === 3", async () => {
    const db = setupTestDb();

    const highSignal = makeSignal("high-001", "high");
    const criticalSignal = makeSignal("critical-001", "critical");
    const mediumSignal = makeSignal("medium-001", "medium");

    const summary = await assembleEveningSummary({
      db,
      reportsDir: tmpDir,
      getPredictionSignalsFn: () =>
        Promise.resolve([highSignal, criticalSignal, mediumSignal]),
    });

    // High + critical must be present
    expect(summary.predictionSignals.length).toBe(2);
    const severities = summary.predictionSignals.map((s) => s.severity);
    expect(severities).toContain("high");
    expect(severities).toContain("critical");
    expect(severities).not.toContain("medium");

    expect(summary.predictionDiag.stored).toBe(3);

    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-2: no high/critical → fallback includes up to 3 medium signals
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-2: medium-severity fallback — up to 3 signals when no high/critical", () => {
  beforeEach(() => {
    tmpDir = join("/tmp", `pred-fallback-ac2-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });
  afterEach(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns 3 medium signals (capped from 4) — predictionDiag.stored === 4", async () => {
    const db = setupTestDb();

    const signals = [
      makeSignal("med-001", "medium"),
      makeSignal("med-002", "medium"),
      makeSignal("med-003", "medium"),
      makeSignal("med-004", "medium"),
    ];

    const summary = await assembleEveningSummary({
      db,
      reportsDir: tmpDir,
      getPredictionSignalsFn: () => Promise.resolve(signals),
    });

    // Capped at 3 medium signals
    expect(summary.predictionSignals.length).toBe(3);
    for (const s of summary.predictionSignals) {
      expect(s.severity).toBe("medium");
    }

    expect(summary.predictionDiag.stored).toBe(4);

    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-3: empty signals → predictionSignals: [], predictionDiag.stored: 0
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-3: empty signals — predictionSignals: [], predictionDiag.stored: 0", () => {
  beforeEach(() => {
    tmpDir = join("/tmp", `pred-fallback-ac3-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });
  afterEach(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty predictionSignals and stored 0 when no signals of any kind", async () => {
    const db = setupTestDb();

    const summary = await assembleEveningSummary({
      db,
      reportsDir: tmpDir,
      getPredictionSignalsFn: () => Promise.resolve([]),
    });

    expect(Array.isArray(summary.predictionSignals)).toBe(true);
    expect(summary.predictionSignals.length).toBe(0);
    expect(summary.predictionDiag.stored).toBe(0);

    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-4: mixed severity → high pass, medium excluded (high/critical takes priority)
// 5 signals: 2 high + 2 medium + 1 low → predictionSignals length 2, stored 5
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-4: mixed severity — high takes priority, predictionDiag.stored reflects all 5", () => {
  beforeEach(() => {
    tmpDir = join("/tmp", `pred-fallback-ac4-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });
  afterEach(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns 2 high signals only — medium and low excluded — predictionDiag.stored === 5", async () => {
    const db = setupTestDb();

    const signals = [
      makeSignal("high-a", "high"),
      makeSignal("high-b", "high"),
      makeSignal("med-a", "medium"),
      makeSignal("med-b", "medium"),
      makeSignal("low-a", "low"),
    ];

    const summary = await assembleEveningSummary({
      db,
      reportsDir: tmpDir,
      getPredictionSignalsFn: () => Promise.resolve(signals),
    });

    // Only the 2 high signals should be present
    expect(summary.predictionSignals.length).toBe(2);
    for (const s of summary.predictionSignals) {
      expect(s.severity).toBe("high");
    }

    expect(summary.predictionDiag.stored).toBe(5);

    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-5: getPredictionSignalsFn throws → no crash, predictionSignals: [], stored: 0
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-5: getPredictionSignalsFn throws — error swallowed, logger.warn called", () => {
  beforeEach(() => {
    tmpDir = join("/tmp", `pred-fallback-ac5-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });
  afterEach(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("does not throw, returns predictionSignals: [] and predictionDiag.stored: 0", async () => {
    const db = setupTestDb();

    let threwError = false;
    let summary;
    try {
      summary = await assembleEveningSummary({
        db,
        reportsDir: tmpDir,
        getPredictionSignalsFn: () => {
          throw new Error("simulated prediction fetch failure");
        },
      });
    } catch {
      threwError = true;
    }

    expect(threwError).toBe(false);
    expect(summary).toBeDefined();
    expect(Array.isArray(summary!.predictionSignals)).toBe(true);
    expect(summary!.predictionSignals.length).toBe(0);
    expect(summary!.predictionDiag.stored).toBe(0);

    db.close();
  });

  it("calls logger.warn with message containing 'prediction' when fn throws", async () => {
    const db = setupTestDb();

    const warnSpy = spyOn(loggerModule.logger, "warn");

    await assembleEveningSummary({
      db,
      reportsDir: tmpDir,
      getPredictionSignalsFn: () => {
        throw new Error("simulated prediction fetch failure for warn check");
      },
    });

    const predictionWarnCalls = warnSpy.mock.calls.filter((args) => {
      const firstArg = args[0];
      return typeof firstArg === "string" && firstArg.includes("prediction");
    });

    expect(predictionWarnCalls.length).toBeGreaterThanOrEqual(1);

    warnSpy.mockRestore();
    db.close();
  });
});
