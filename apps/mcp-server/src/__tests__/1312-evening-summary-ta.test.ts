/**
 * Task 1313 — TDD: TA Close-of-Day Signals in Evening Summary
 *
 * Tests cover all acceptance criteria from REQ-097 / TECH-097:
 *   AC-1: overbought ticker → taSummary includes it
 *   AC-2: neutral ticker → not in taSummary display section
 *   AC-3: all neutral → no TA section in Telegram message
 *   AC-4: computeTaFn error per-ticker → other tickers still processed
 *   AC-5: empty watchlist → taSummary empty, no TA section
 *   AC-6: taSummary field always present in JSON output (even when empty)
 *
 * RED PHASE: Before production changes, all ACs fail because:
 *   - taSummary field does not exist on EveningSummary
 *   - assembleEveningSummary does not accept computeTaFn option
 *   - eveningSummaryJob does not render TA section
 *
 * Layer: tests — uses in-memory SQLite; no HTTP, no Telegram sends.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  assembleEveningSummary,
} from "../application/usecases/assembleEveningSummary.js";
import type { TaSignal } from "../application/usecases/assembleBriefing.js";
import {
  runEveningSummary,
  resetEveningSummaryGuard,
} from "../scheduler/briefings/eveningSummaryJob.js";
import type { EveningSummary } from "../application/usecases/assembleEveningSummary.js";

// ─────────────────────────────────────────────────────────────────────────────
// Minimal in-memory DB setup
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
      exchange    TEXT
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
      impact_score       REAL,
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
// Shared tmp dir
// ─────────────────────────────────────────────────────────────────────────────

let tmpDir: string;

// ─────────────────────────────────────────────────────────────────────────────
// AC-1: overbought ticker → taSummary includes it
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-1: assembleEveningSummary — overbought ticker included in taSummary", () => {
  beforeEach(() => {
    tmpDir = join("/tmp", `evening-ta-test-ac1-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });
  afterEach(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("includes overbought VCB signal in taSummary", async () => {
    const db = setupTestDb();
    seedWatchlist(db, "VCB");

    const mockTaFn = (code: string, _db: Database): TaSignal | null => ({
      code,
      rsi14: 74.2,
      rsiStatus: "overbought",
      ma20: 90000,
      priceVsMa20: "above",
      currentPrice: 92000,
    });

    const summary = await assembleEveningSummary({
      db,
      reportsDir: tmpDir,
      computeTaFn: mockTaFn,
    });

    expect(Array.isArray(summary.taSummary)).toBe(true);
    expect(summary.taSummary.length).toBe(1);
    expect(summary.taSummary[0]!.code).toBe("VCB");
    expect(summary.taSummary[0]!.rsiStatus).toBe("overbought");
    expect(summary.taSummary[0]!.rsi14).toBeCloseTo(74.2, 1);

    db.close();
  });

  it("includes multiple non-null signals from multiple watchlist tickers", async () => {
    const db = setupTestDb();
    seedWatchlist(db, "VCB");
    seedWatchlist(db, "HPG");

    const mockTaFn = (code: string, _db: Database): TaSignal | null => ({
      code,
      rsi14: 74.2,
      rsiStatus: "overbought",
      ma20: 90000,
      priceVsMa20: "above",
      currentPrice: 92000,
    });

    const summary = await assembleEveningSummary({
      db,
      reportsDir: tmpDir,
      computeTaFn: mockTaFn,
    });

    expect(summary.taSummary.length).toBe(2);
    const codes = summary.taSummary.map((s) => s.code);
    expect(codes).toContain("VCB");
    expect(codes).toContain("HPG");

    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-2: neutral ticker → not rendered in Telegram TA section
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-2: eveningSummaryJob — neutral ticker not in Telegram TA section", () => {
  beforeEach(() => {
    resetEveningSummaryGuard();
    tmpDir = join("/tmp", `evening-ta-test-ac2-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });
  afterEach(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("Telegram message does not show neutral ticker in TA section", async () => {
    const neutralSummary: EveningSummary = {
      date: "2026-04-15",
      topAlerts: [],
      topStories: [],
      watchlistMovers: [],
      predictionSignals: [],
      predictionDiag: { stored: 0 },
      taDiag: { tickersWithSignal: 0, tickersBelowThreshold: 0, ohlcvRowsMin: 0, ohlcvRowsMax: 0 },
      newsCount: 0,
      generatedAt: new Date().toISOString(),
      taSummary: [
        {
          code: "VCB",
          rsi14: 74.2,
          rsiStatus: "overbought",
          ma20: 90000,
          priceVsMa20: "above",
          currentPrice: 92000,
        },
        {
          code: "HPG",
          rsi14: 55.0,
          rsiStatus: "neutral",
          ma20: 100,
          priceVsMa20: "neutral",
          currentPrice: 100,
        },
      ],
    };

    let capturedMessage = "";
    const sendFn = async (msg: string, _opts: unknown): Promise<void> => {
      capturedMessage = msg;
    };

    await runEveningSummary(async () => neutralSummary, sendFn);

    // TA section present (VCB is non-neutral)
    expect(capturedMessage).toContain("TA tín hiệu đóng cửa");
    // VCB should appear
    expect(capturedMessage).toContain("VCB");
    // HPG (neutral) should NOT appear in the TA section lines
    // The TA section should not contain HPG
    const taSection = capturedMessage.split("TA tín hiệu đóng cửa")[1] ?? "";
    expect(taSection).not.toContain("HPG");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-3: all neutral → no TA section in Telegram message
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-3: eveningSummaryJob — all neutral → no TA section in Telegram", () => {
  beforeEach(() => {
    resetEveningSummaryGuard();
  });

  it("omits TA section when all taSummary entries are neutral", async () => {
    const allNeutralSummary: EveningSummary = {
      date: "2026-04-15",
      topAlerts: [
        {
          severity: "info",
          message: "Test alert",
          stocks: [],
        },
      ],
      topStories: [],
      watchlistMovers: [],
      predictionSignals: [],
      predictionDiag: { stored: 0 },
      taDiag: { tickersWithSignal: 0, tickersBelowThreshold: 0, ohlcvRowsMin: 0, ohlcvRowsMax: 0 },
      newsCount: 0,
      generatedAt: new Date().toISOString(),
      taSummary: [
        {
          code: "VCB",
          rsi14: 55.0,
          rsiStatus: "neutral",
          ma20: 90000,
          priceVsMa20: "neutral",
          currentPrice: 90000,
        },
        {
          code: "HPG",
          rsi14: 48.0,
          rsiStatus: "neutral",
          ma20: 100,
          priceVsMa20: "neutral",
          currentPrice: 100,
        },
      ],
    };

    let capturedMessage = "";
    const sendFn = async (msg: string, _opts: unknown): Promise<void> => {
      capturedMessage = msg;
    };

    await runEveningSummary(async () => allNeutralSummary, sendFn);

    expect(capturedMessage).not.toContain("TA tín hiệu đóng cửa");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-4: computeTaFn error per-ticker → other tickers still processed
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-4: assembleEveningSummary — per-ticker error does not abort other tickers", () => {
  beforeEach(() => {
    tmpDir = join("/tmp", `evening-ta-test-ac4-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });
  afterEach(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("processes HPG even when VCB throws", async () => {
    const db = setupTestDb();
    seedWatchlist(db, "VCB");
    seedWatchlist(db, "HPG");

    const partialErrorFn = (code: string, _db: Database): TaSignal | null => {
      if (code === "VCB") throw new Error("simulated DB failure for VCB");
      return {
        code,
        rsi14: 27.8,
        rsiStatus: "oversold",
        ma20: 50000,
        priceVsMa20: "below",
        currentPrice: 48000,
      };
    };

    const summary = await assembleEveningSummary({
      db,
      reportsDir: tmpDir,
      computeTaFn: partialErrorFn,
    });

    // VCB threw so it is absent; HPG succeeded
    expect(summary.taSummary.length).toBe(1);
    expect(summary.taSummary[0]!.code).toBe("HPG");
    expect(summary.taSummary[0]!.rsiStatus).toBe("oversold");

    db.close();
  });

  it("returns taSummary: [] when all tickers throw", async () => {
    const db = setupTestDb();
    seedWatchlist(db, "VCB");
    seedWatchlist(db, "HPG");

    const alwaysThrows = (_code: string, _db: Database): TaSignal | null => {
      throw new Error("DB error");
    };

    const summary = await assembleEveningSummary({
      db,
      reportsDir: tmpDir,
      computeTaFn: alwaysThrows,
    });

    expect(Array.isArray(summary.taSummary)).toBe(true);
    expect(summary.taSummary.length).toBe(0);

    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-5: empty watchlist → taSummary empty, no TA section
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-5: assembleEveningSummary — empty watchlist produces taSummary: []", () => {
  beforeEach(() => {
    resetEveningSummaryGuard();
    tmpDir = join("/tmp", `evening-ta-test-ac5-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });
  afterEach(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns taSummary: [] when watchlist is empty", async () => {
    const db = setupTestDb();
    // No watchlist entries

    const mockTaFn = (code: string, _db: Database): TaSignal | null => ({
      code,
      rsi14: 74.2,
      rsiStatus: "overbought",
      ma20: 90000,
      priceVsMa20: "above",
      currentPrice: 92000,
    });

    const summary = await assembleEveningSummary({
      db,
      reportsDir: tmpDir,
      computeTaFn: mockTaFn,
    });

    expect(Array.isArray(summary.taSummary)).toBe(true);
    expect(summary.taSummary.length).toBe(0);

    db.close();
  });

  it("Telegram message has no TA section when taSummary is empty", async () => {
    const emptySummary: EveningSummary = {
      date: "2026-04-15",
      topAlerts: [{ severity: "info", message: "Test", stocks: [] }],
      topStories: [],
      watchlistMovers: [],
      predictionSignals: [],
      predictionDiag: { stored: 0 },
      taDiag: { tickersWithSignal: 0, tickersBelowThreshold: 0, ohlcvRowsMin: 0, ohlcvRowsMax: 0 },
      newsCount: 0,
      generatedAt: new Date().toISOString(),
      taSummary: [],
    };

    let capturedMessage = "";
    const sendFn = async (msg: string, _opts: unknown): Promise<void> => {
      capturedMessage = msg;
    };

    await runEveningSummary(async () => emptySummary, sendFn);

    expect(capturedMessage).not.toContain("TA tín hiệu đóng cửa");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-6: taSummary field always present in persisted JSON output
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-6: assembleEveningSummary — taSummary always present in JSON output", () => {
  beforeEach(() => {
    tmpDir = join("/tmp", `evening-ta-test-ac6-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });
  afterEach(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("persisted JSON has taSummary key when watchlist is empty", async () => {
    const db = setupTestDb();

    const summary = await assembleEveningSummary({
      db,
      reportsDir: tmpDir,
    });

    // Verify in-memory object
    expect("taSummary" in summary).toBe(true);
    expect(Array.isArray(summary.taSummary)).toBe(true);

    // Verify persisted JSON
    const files = (await import("node:fs")).readdirSync(tmpDir);
    const jsonFile = files.find((f) => f.endsWith("-evening.json"));
    expect(jsonFile).toBeTruthy();
    const parsed = JSON.parse(readFileSync(join(tmpDir, jsonFile!), "utf-8")) as Record<string, unknown>;
    expect("taSummary" in parsed).toBe(true);
    expect(Array.isArray(parsed["taSummary"])).toBe(true);

    db.close();
  });

  it("persisted JSON has taSummary with signal data when ticker is non-null", async () => {
    const db = setupTestDb();
    seedWatchlist(db, "VCB");

    const mockTaFn = (code: string, _db: Database): TaSignal | null => ({
      code,
      rsi14: 74.2,
      rsiStatus: "overbought",
      ma20: 90000,
      priceVsMa20: "above",
      currentPrice: 92000,
    });

    const summary = await assembleEveningSummary({
      db,
      reportsDir: tmpDir,
      computeTaFn: mockTaFn,
    });

    // Verify in-memory object
    expect(summary.taSummary.length).toBe(1);

    // Verify persisted JSON contains taSummary
    const files = (await import("node:fs")).readdirSync(tmpDir);
    const jsonFile = files.find((f) => f.endsWith("-evening.json"));
    expect(jsonFile).toBeTruthy();
    const parsed = JSON.parse(readFileSync(join(tmpDir, jsonFile!), "utf-8")) as Record<string, unknown>;
    expect(Array.isArray(parsed["taSummary"])).toBe(true);
    const taSummaryArr = parsed["taSummary"] as Array<{ code: string }>;
    expect(taSummaryArr.length).toBe(1);
    expect(taSummaryArr[0]!.code).toBe("VCB");

    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Additional: Telegram message formatting correctness
// ─────────────────────────────────────────────────────────────────────────────

describe("Telegram TA section formatting — quá mua / quá bán / MA20 labels", () => {
  beforeEach(() => {
    resetEveningSummaryGuard();
  });

  it("shows quá mua label for overbought ticker", async () => {
    const summary: EveningSummary = {
      date: "2026-04-15",
      topAlerts: [],
      topStories: [],
      watchlistMovers: [],
      predictionSignals: [],
      predictionDiag: { stored: 0 },
      taDiag: { tickersWithSignal: 0, tickersBelowThreshold: 0, ohlcvRowsMin: 0, ohlcvRowsMax: 0 },
      newsCount: 0,
      generatedAt: new Date().toISOString(),
      taSummary: [
        {
          code: "VCB",
          rsi14: 74.2,
          rsiStatus: "overbought",
          ma20: 90000,
          priceVsMa20: "above",
          currentPrice: 92000,
        },
      ],
    };

    let capturedMessage = "";
    await runEveningSummary(async () => summary, async (msg, _opts) => { capturedMessage = msg; });

    expect(capturedMessage).toContain("TA tín hiệu đóng cửa");
    expect(capturedMessage).toContain("VCB");
    expect(capturedMessage).toContain("RSI=74.2");
    expect(capturedMessage).toContain("quá mua");
    expect(capturedMessage).toContain("giá trên MA20");
  });

  it("shows quá bán label for oversold ticker", async () => {
    const summary: EveningSummary = {
      date: "2026-04-15",
      topAlerts: [],
      topStories: [],
      watchlistMovers: [],
      predictionSignals: [],
      predictionDiag: { stored: 0 },
      taDiag: { tickersWithSignal: 0, tickersBelowThreshold: 0, ohlcvRowsMin: 0, ohlcvRowsMax: 0 },
      newsCount: 0,
      generatedAt: new Date().toISOString(),
      taSummary: [
        {
          code: "HPG",
          rsi14: 27.8,
          rsiStatus: "oversold",
          ma20: null,
          priceVsMa20: "neutral",
          currentPrice: 48000,
        },
      ],
    };

    let capturedMessage = "";
    await runEveningSummary(async () => summary, async (msg, _opts) => { capturedMessage = msg; });

    expect(capturedMessage).toContain("TA tín hiệu đóng cửa");
    expect(capturedMessage).toContain("HPG");
    expect(capturedMessage).toContain("RSI=27.8");
    expect(capturedMessage).toContain("quá bán");
    expect(capturedMessage).not.toContain("giá trên MA20");
    expect(capturedMessage).not.toContain("giá dưới MA20");
  });

  it("neutral-RSI ticker excluded from TA section even when priceVsMa20 is below (Task 1429 RSI-only filter)", async () => {
    // Task 1429: filter changed from `rsiStatus!==neutral || priceVsMa20!==neutral`
    // to `rsiStatus!==neutral`. MA20 position still displayed as context per ticker
    // line when ticker IS shown — but neutral-RSI tickers are now excluded entirely.
    const summary: EveningSummary = {
      date: "2026-04-15",
      topAlerts: [],
      topStories: [],
      watchlistMovers: [],
      predictionSignals: [],
      predictionDiag: { stored: 0 },
      taDiag: { tickersWithSignal: 0, tickersBelowThreshold: 0, ohlcvRowsMin: 0, ohlcvRowsMax: 0 },
      newsCount: 0,
      generatedAt: new Date().toISOString(),
      taSummary: [
        {
          code: "FPT",
          rsi14: 55.0,
          rsiStatus: "neutral",
          ma20: 120000,
          priceVsMa20: "below",
          currentPrice: 115000,
        },
      ],
    };

    let capturedMessage = "";
    await runEveningSummary(async () => summary, async (msg, _opts) => { capturedMessage = msg; });

    // Neutral RSI → entire TA section absent (new RSI-only filter)
    expect(capturedMessage).not.toContain("TA tín hiệu đóng cửa");
    expect(capturedMessage).not.toContain("FPT");
  });

  it("caps TA section at 5 tickers", async () => {
    const taSummary: TaSignal[] = ["T1","T2","T3","T4","T5","T6"].map((code) => ({
      code,
      rsi14: 72.0,
      rsiStatus: "overbought" as const,
      ma20: 100,
      priceVsMa20: "above" as const,
      currentPrice: 110,
    }));

    const summary: EveningSummary = {
      date: "2026-04-15",
      topAlerts: [],
      topStories: [],
      watchlistMovers: [],
      predictionSignals: [],
      predictionDiag: { stored: 0 },
      taDiag: { tickersWithSignal: 0, tickersBelowThreshold: 0, ohlcvRowsMin: 0, ohlcvRowsMax: 0 },
      newsCount: 0,
      generatedAt: new Date().toISOString(),
      taSummary,
    };

    let capturedMessage = "";
    await runEveningSummary(async () => summary, async (msg, _opts) => { capturedMessage = msg; });

    // T6 is the 6th ticker — should be capped out
    expect(capturedMessage).toContain("T1");
    expect(capturedMessage).toContain("T5");
    expect(capturedMessage).not.toContain("T6");
  });
});
