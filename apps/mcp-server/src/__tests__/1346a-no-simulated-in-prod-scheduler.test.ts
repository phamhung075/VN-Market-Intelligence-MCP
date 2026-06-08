Bun.env["DB_PATH"] = ":memory:";
/**
 * Task 1346a — FIX: test stub must not run in production scheduler
 *
 * The bug: assembleEveningSummary used `await import("predictionStore.js")` for
 * getRecentPredictionSignals. Bun's mock.module (used in 1318 test) replaces the
 * module registry entry, causing the test stub to be returned by any subsequent
 * dynamic import in the same Bun process — including the production scheduler.
 *
 * Fix: replace the dynamic import with a static top-level import so mock.module
 * cannot intercept the production code path.
 *
 * Acceptance criterion:
 *   AC-1: assembleEveningSummary called without getPredictionSignalsFn never logs
 *         any message containing "simulated" (test stub is not wired into prod path).
 *   AC-2: assembleEveningSummary called without getPredictionSignalsFn uses the real
 *         getRecentPredictionSignals — returns [] from empty DB (not a thrown error).
 *
 * Layer: tests — in-memory SQLite, no real HTTP, no Telegram sends.
 */

import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

// Static import — mirrors what production code should do after the fix.
// If the fix is not applied (dynamic import still present), the dynamic import
// could be intercepted by mock.module from test 1318 in the same Bun process.
import { assembleEveningSummary } from "../application/usecases/assembleEveningSummary.js";
import * as loggerModule from "../infrastructure/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Minimal in-memory DB (mirrors 1318 setup)
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
      id           TEXT PRIMARY KEY,
      created_at   TEXT NOT NULL,
      level        TEXT NOT NULL,
      source_url   TEXT,
      source_title TEXT,
      source_type  TEXT,
      published_at TEXT,
      sentiment    TEXT,
      impact_score REAL,
      data_env TEXT
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

let tmpDir: string;

beforeEach(() => {
  tmpDir = join("/tmp", `1346a-no-simulated-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-1: no "simulated" string in any logger call when no getPredictionSignalsFn
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-1: assembleEveningSummary without getPredictionSignalsFn — no simulated stub", () => {
  it("never logs a message containing 'simulated' when getPredictionSignalsFn is not injected", async () => {
    const db = setupTestDb();

    const warnMessages: string[] = [];
    const errorMessages: string[] = [];

    const warnSpy = spyOn(loggerModule.logger, "warn").mockImplementation(
      (msg: unknown) => {
        if (typeof msg === "string") warnMessages.push(msg);
      },
    );
    const errorSpy = spyOn(loggerModule.logger, "error").mockImplementation(
      (msg: unknown) => {
        if (typeof msg === "string") errorMessages.push(msg);
      },
    );

    // Call WITHOUT getPredictionSignalsFn — this is the production code path.
    // Before the fix, this may invoke the mock.module stub from test 1318 which
    // throws "simulated getRecentPredictionSignals failure for AC-3".
    await assembleEveningSummary({ db, reportsDir: tmpDir });

    const allMessages = [...warnMessages, ...errorMessages];
    const simulatedMessages = allMessages.filter((m) =>
      m.toLowerCase().includes("simulated"),
    );

    expect(simulatedMessages).toHaveLength(0);

    warnSpy.mockRestore();
    errorSpy.mockRestore();
    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-2: without getPredictionSignalsFn, production path returns [] from empty DB
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-2: assembleEveningSummary without getPredictionSignalsFn — real impl, empty result", () => {
  it("returns predictionSignals: [] from real getRecentPredictionSignals on empty DB", async () => {
    const db = setupTestDb();

    // No getPredictionSignalsFn injected — must hit the real implementation.
    const summary = await assembleEveningSummary({ db, reportsDir: tmpDir });

    expect(Array.isArray(summary.predictionSignals)).toBe(true);
    expect(summary.predictionSignals).toHaveLength(0);
    // predictionDiag.stored must be 0 (real store, empty table)
    expect(summary.predictionDiag.stored).toBe(0);

    db.close();
  });

  it("does not throw when prediction_signals table exists but is empty", async () => {
    const db = setupTestDb();

    let threw = false;
    try {
      await assembleEveningSummary({ db, reportsDir: tmpDir });
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    db.close();
  });
});
