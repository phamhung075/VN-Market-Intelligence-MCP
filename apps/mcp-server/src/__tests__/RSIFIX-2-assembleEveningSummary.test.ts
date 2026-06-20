Bun.env["DB_PATH"] = ":memory:";

/**
 * RSIFIX-2 — assembleEveningSummary.ts: async computeTaFn loop tests
 *
 * Verifies that the for...of + await pattern in Step 4 correctly handles:
 *   T1: async computeTaFn (returns Promise<TaSignal>) → included in taSummary
 *   T2: async computeTaFn returning null → not in taSummary
 *   T3: async computeTaFn throwing per-ticker → other tickers processed
 *   T4: sync computeTaFn (legacy mocks) still works via Promise.resolve
 *
 * Layer: tests — in-memory SQLite; no HTTP, no Telegram sends.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

import {
  assembleEveningSummary,
} from "../application/usecases/assembleEveningSummary.js";
import type { TaSignal } from "../application/usecases/assembleBriefing.js";

// ─────────────────────────────────────────────────────────────────────────────
// DB helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildDb(): Database {
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
      exchange    TEXT
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
      data_env     TEXT
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
  `);
  return db;
}

function seedWatchlist(db: Database, code: string): void {
  db.prepare(
    `INSERT OR IGNORE INTO watchlist (code, exchange, domain, added_at)
     VALUES (?, 'HOSE', 'banking', datetime('now'))`,
  ).run(code);
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared test state
// ─────────────────────────────────────────────────────────────────────────────

let tmpDir: string;

// ─────────────────────────────────────────────────────────────────────────────
// T1: async computeTaFn (returns Promise<TaSignal>) → included in taSummary
// ─────────────────────────────────────────────────────────────────────────────

describe("RSIFIX-2 ES-T1: async computeTaFn → taSummary populated", () => {
  beforeEach(() => {
    tmpDir = join("/tmp", `rsifix2-es-t1-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });
  afterEach(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("Promise-returning computeTaFn: rsi14=27.6 oversold → in taSummary", async () => {
    const db = buildDb();
    seedWatchlist(db, "NVL");

    // Async mock simulating Go engine result for NVL
    const mockTaFn = async (code: string, _db: Database): Promise<TaSignal | null> =>
      Promise.resolve({
        code,
        rsi14: 27.6,
        rsiStatus: "oversold" as const,
        ma20: 48000,
        priceVsMa20: "below" as const,
        currentPrice: 45000,
      });

    const summary = await assembleEveningSummary({
      db,
      reportsDir: tmpDir,
      computeTaFn: mockTaFn,
    });

    expect(Array.isArray(summary.taSummary)).toBe(true);
    const signal = summary.taSummary.find((s) => s.code === "NVL");
    expect(signal).toBeDefined();
    expect(signal?.rsi14).toBeCloseTo(27.6, 1);
    expect(signal?.rsiStatus).toBe("oversold");

    db.close();
  });

  it("multiple tickers with async mock → all signals collected in taSummary", async () => {
    const db = buildDb();
    seedWatchlist(db, "NVL");
    seedWatchlist(db, "VNM");

    const rsiValues: Record<string, number> = { NVL: 27.6, VNM: 72.4 };

    const mockTaFn = async (code: string, _db: Database): Promise<TaSignal | null> =>
      Promise.resolve({
        code,
        rsi14: rsiValues[code] ?? 50,
        rsiStatus: (rsiValues[code] ?? 50) > 70
          ? "overbought" as const
          : "oversold" as const,
        ma20: 50000,
        priceVsMa20: "neutral" as const,
        currentPrice: 50000,
      });

    const summary = await assembleEveningSummary({
      db,
      reportsDir: tmpDir,
      computeTaFn: mockTaFn,
    });

    expect(summary.taSummary.length).toBe(2);
    const nvlSignal = summary.taSummary.find((s) => s.code === "NVL");
    const vnmSignal = summary.taSummary.find((s) => s.code === "VNM");
    expect(nvlSignal?.rsi14).toBeCloseTo(27.6, 1);
    expect(vnmSignal?.rsi14).toBeCloseTo(72.4, 1);

    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T2: async mock returning null → ticker absent from taSummary
// ─────────────────────────────────────────────────────────────────────────────

describe("RSIFIX-2 ES-T2: async mock returning null → not in taSummary", () => {
  beforeEach(() => {
    tmpDir = join("/tmp", `rsifix2-es-t2-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });
  afterEach(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("async mock returning null → taSummary is empty", async () => {
    const db = buildDb();
    seedWatchlist(db, "NVL");

    const nullMock = async (_code: string, _db: Database): Promise<TaSignal | null> =>
      Promise.resolve(null);

    const summary = await assembleEveningSummary({
      db,
      reportsDir: tmpDir,
      computeTaFn: nullMock,
    });

    expect(Array.isArray(summary.taSummary)).toBe(true);
    expect(summary.taSummary.length).toBe(0);

    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T3: async mock throwing per-ticker → other tickers still processed
// ─────────────────────────────────────────────────────────────────────────────

describe("RSIFIX-2 ES-T3: async mock throws for one ticker → others still processed", () => {
  beforeEach(() => {
    tmpDir = join("/tmp", `rsifix2-es-t3-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });
  afterEach(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("NVL throws, VNM returns signal → VNM in taSummary, NVL absent", async () => {
    const db = buildDb();
    seedWatchlist(db, "NVL");
    seedWatchlist(db, "VNM");

    const partialMock = async (code: string, _db: Database): Promise<TaSignal | null> => {
      if (code === "NVL") throw new Error("Go service timeout for NVL");
      return {
        code,
        rsi14: 29.1,
        rsiStatus: "oversold" as const,
        ma20: 55000,
        priceVsMa20: "below" as const,
        currentPrice: 53000,
      };
    };

    const summary = await assembleEveningSummary({
      db,
      reportsDir: tmpDir,
      computeTaFn: partialMock,
    });

    expect(summary.taSummary.length).toBe(1);
    expect(summary.taSummary[0]!.code).toBe("VNM");

    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T4: sync computeTaFn (legacy mock) still works via Promise.resolve
// ─────────────────────────────────────────────────────────────────────────────

describe("RSIFIX-2 ES-T4: sync computeTaFn (legacy mocks) still accepted", () => {
  beforeEach(() => {
    tmpDir = join("/tmp", `rsifix2-es-t4-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });
  afterEach(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("sync mock returning TaSignal → loop handles it via Promise.resolve", async () => {
    const db = buildDb();
    seedWatchlist(db, "MWG");

    // Sync mock (legacy pattern) — must still work post-RSIFIX-2
    const syncMock = (code: string, _db: Database): TaSignal | null => ({
      code,
      rsi14: 71.5,
      rsiStatus: "overbought" as const,
      ma20: 80000,
      priceVsMa20: "above" as const,
      currentPrice: 82000,
    });

    const summary = await assembleEveningSummary({
      db,
      reportsDir: tmpDir,
      computeTaFn: syncMock,
    });

    expect(summary.taSummary.length).toBe(1);
    expect(summary.taSummary[0]!.code).toBe("MWG");
    expect(summary.taSummary[0]!.rsi14).toBeCloseTo(71.5, 1);

    db.close();
  });

  it("sync mock returning null → taSummary empty", async () => {
    const db = buildDb();
    seedWatchlist(db, "MWG");

    const syncNullMock = (_code: string, _db: Database): TaSignal | null => null;

    const summary = await assembleEveningSummary({
      db,
      reportsDir: tmpDir,
      computeTaFn: syncNullMock,
    });

    expect(summary.taSummary.length).toBe(0);

    db.close();
  });
});
