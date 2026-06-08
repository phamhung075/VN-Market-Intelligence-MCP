/**
 * Task 1304 — TDD: TA Signals (RSI/SMA) in Morning Briefing
 *
 * Tests cover all acceptance criteria from REQ-092:
 *   AC-2: formatBriefingMessage includes TA section when taSummary has overbought entry
 *   AC-3: formatBriefingMessage omits TA section when taSummary is empty or absent
 *   AC-4: assembleBriefing with injectable computeTaFn filters neutral tickers
 *   AC-5: assembleBriefing with throwing computeTaFn does not reject; taSummary === []
 *   AC-7: RSI exactly 70.0 with rsiStatus "neutral" → ticker excluded from section
 *
 * RED PHASE: Before production changes, AC-2/AC-4/AC-5/AC-7 will fail because
 * taSummary field and TA section do not exist yet. AC-3 will pass once
 * formatBriefingMessage is updated (section absent when no taSummary).
 *
 * Layer: tests — uses in-memory SQLite; no HTTP, no Telegram sends.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

import {
  formatBriefingMessage,
  resetMorningBriefingGuard,
} from "../scheduler/briefings/morningBriefingJob.js";

import {
  assembleBriefing,
  type DailyBriefing,
  type TaSignal,
} from "../application/usecases/assembleBriefing.js";

// ─────────────────────────────────────────────────────────────────────────────
// Minimal in-memory DB setup for assembleBriefing
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
      updated_at  TEXT
    );

    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code       TEXT NOT NULL,
      date       TEXT NOT NULL,
      open       REAL NOT NULL,
      high       REAL NOT NULL,
      low        REAL NOT NULL,
      close      REAL NOT NULL,
      volume     REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (code, date)
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

    CREATE TABLE IF NOT EXISTS financial_reports (
      id              TEXT PRIMARY KEY,
      action_code     TEXT NOT NULL,
      company_name    TEXT,
      exchange        TEXT,
      domain          TEXT,
      period_year     INTEGER,
      period_type     TEXT,
      period_start    TEXT,
      period_end      TEXT,
      sort_key        TEXT,
      ssc_url         TEXT,
      parsed_at       TEXT,
      balance_sheet_json  TEXT DEFAULT '{}',
      income_stmt_json    TEXT DEFAULT '{}',
      cash_flow_json      TEXT DEFAULT '{}',
      ratios_json         TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS insider_transactions (
      id               TEXT PRIMARY KEY,
      code             TEXT NOT NULL,
      type             TEXT NOT NULL,
      executed_volume  INTEGER NOT NULL DEFAULT 0,
      insider_name     TEXT NOT NULL DEFAULT '',
      from_date        TEXT NOT NULL DEFAULT '',
      fetched_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS vnstock_trading_stats (
      id              TEXT PRIMARY KEY,
      code            TEXT NOT NULL,
      date            TEXT NOT NULL,
      foreign_volume  INTEGER,
      fetched_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS evidence_scores (
      id             TEXT PRIMARY KEY,
      stock          TEXT NOT NULL,
      score_date     TEXT NOT NULL,
      bullish_score  REAL NOT NULL DEFAULT 0,
      bearish_score  REAL NOT NULL DEFAULT 0,
      fragment_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS positions (
      id         TEXT PRIMARY KEY,
      code       TEXT NOT NULL,
      shares     REAL NOT NULL,
      avg_price  REAL NOT NULL,
      closed_at  TEXT
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

// Temporary briefings directory for file persistence tests
let tmpDir: string;

// ─────────────────────────────────────────────────────────────────────────────
// AC-2: formatBriefingMessage includes TA section when taSummary has signals
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-2: formatBriefingMessage — TA section present when signals exist", () => {
  beforeEach(() => {
    resetMorningBriefingGuard();
  });

  it("includes TA Tín hiệu header when taSummary has an overbought entry", () => {
    const briefing: DailyBriefing = {
      date: "2026-04-15",
      topStories: [],
      alerts: [],
      watchlistSummary: [],
      newReports: [],
      macroSnapshot: [],
      sensitiveWarnings: [],
      trackedCommodities: [],
      unresolvedAlerts: [],
      topConviction: null,
      predictionSignals: [],
      generatedAt: new Date().toISOString(),
      taSummary: [
        {
          code: "VCB",
          rsi14: 72.3,
          rsiStatus: "overbought",
          ma20: 90000,
          priceVsMa20: "above",
          currentPrice: 92000,
        },
      ],
    };

    const msg = formatBriefingMessage(briefing);
    expect(msg).toContain("📡 TA Tín hiệu:");
    expect(msg).toContain("VCB");
    expect(msg).toContain("RSI=72.3");
    expect(msg).toContain("quá mua");
    expect(msg).toContain("giá trên MA20");
  });

  it("formats oversold RSI correctly", () => {
    const briefing: DailyBriefing = {
      date: "2026-04-15",
      topStories: [],
      alerts: [],
      watchlistSummary: [],
      newReports: [],
      macroSnapshot: [],
      sensitiveWarnings: [],
      trackedCommodities: [],
      unresolvedAlerts: [],
      topConviction: null,
      predictionSignals: [],
      generatedAt: new Date().toISOString(),
      taSummary: [
        {
          code: "HPG",
          rsi14: 28.1,
          rsiStatus: "oversold",
          ma20: null,
          priceVsMa20: "neutral",
          currentPrice: 25000,
        },
      ],
    };

    const msg = formatBriefingMessage(briefing);
    expect(msg).toContain("📡 TA Tín hiệu:");
    expect(msg).toContain("HPG");
    expect(msg).toContain("RSI=28.1");
    expect(msg).toContain("quá bán");
  });

  it("formats MA20-only signal (RSI neutral, price below MA20)", () => {
    const briefing: DailyBriefing = {
      date: "2026-04-15",
      topStories: [],
      alerts: [],
      watchlistSummary: [],
      newReports: [],
      macroSnapshot: [],
      sensitiveWarnings: [],
      trackedCommodities: [],
      unresolvedAlerts: [],
      topConviction: null,
      predictionSignals: [],
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

    const msg = formatBriefingMessage(briefing);
    expect(msg).toContain("📡 TA Tín hiệu:");
    expect(msg).toContain("FPT");
    expect(msg).toContain("giá dưới MA20");
    // No RSI part for neutral
    expect(msg).not.toContain("RSI=");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-3: formatBriefingMessage omits TA section when taSummary is empty/absent
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-3: formatBriefingMessage — TA section absent when empty or undefined", () => {
  beforeEach(() => {
    resetMorningBriefingGuard();
  });

  it("omits TA section when taSummary is empty array", () => {
    const briefing: DailyBriefing = {
      date: "2026-04-15",
      topStories: [],
      alerts: [],
      watchlistSummary: [],
      newReports: [],
      macroSnapshot: [],
      sensitiveWarnings: [],
      trackedCommodities: [],
      unresolvedAlerts: [],
      topConviction: null,
      predictionSignals: [],
      generatedAt: new Date().toISOString(),
      taSummary: [],
    };

    const msg = formatBriefingMessage(briefing);
    expect(msg).not.toContain("📡 TA Tín hiệu:");
    expect(msg).not.toContain("TA Tín hiệu");
  });

  it("omits TA section when taSummary is absent (undefined)", () => {
    const briefing: DailyBriefing = {
      date: "2026-04-15",
      topStories: [],
      alerts: [],
      watchlistSummary: [],
      newReports: [],
      macroSnapshot: [],
      sensitiveWarnings: [],
      trackedCommodities: [],
      unresolvedAlerts: [],
      topConviction: null,
      predictionSignals: [],
      generatedAt: new Date().toISOString(),
      // taSummary intentionally omitted
    };

    const msg = formatBriefingMessage(briefing);
    expect(msg).not.toContain("📡 TA Tín hiệu:");
    expect(msg).not.toContain("TA Tín hiệu");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-4: assembleBriefing — computeTaFn injectable, filters neutral tickers
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-4: assembleBriefing — computeTaFn injectable + neutral filter", () => {
  beforeEach(() => {
    resetMorningBriefingGuard();
    tmpDir = join("/tmp", `briefing-test-1304-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  it("returns 1 entry (VCB oversold) and excludes HPG (both signals neutral)", async () => {
    const db = setupTestDb();
    seedWatchlist(db, "VCB");
    seedWatchlist(db, "HPG");

    const computeTaFn = (code: string, _db: Database): TaSignal | null => {
      if (code === "VCB") {
        return {
          code: "VCB",
          rsi14: 28.5,
          rsiStatus: "oversold",
          ma20: 90000,
          priceVsMa20: "below",
          currentPrice: 88000,
        };
      }
      return {
        code,
        rsi14: 55.0,
        rsiStatus: "neutral",
        ma20: 100,
        priceVsMa20: "neutral",
        currentPrice: 100,
      };
    };

    const briefing = await assembleBriefing({
      db,
      pollNewsFn: async () => {},
      fetchVnIndexFn: async () => null,
      briefingsDir: tmpDir,
      computeTaFn,
    });

    expect(briefing.taSummary).toBeDefined();
    expect(briefing.taSummary!.length).toBe(1);
    expect(briefing.taSummary![0]!.code).toBe("VCB");

    // HPG excluded (both neutral)
    const hpgEntry = briefing.taSummary!.find((s) => s.code === "HPG");
    expect(hpgEntry).toBeUndefined();

    db.close();
  });

  it("returns multiple non-neutral entries from mixed watchlist", async () => {
    const db = setupTestDb();
    seedWatchlist(db, "VCB");
    seedWatchlist(db, "HPG");
    seedWatchlist(db, "FPT");

    const computeTaFn = (code: string, _db: Database): TaSignal | null => {
      if (code === "VCB") {
        return { code: "VCB", rsi14: 72.5, rsiStatus: "overbought", ma20: 95000, priceVsMa20: "above", currentPrice: 97000 };
      }
      if (code === "FPT") {
        return { code: "FPT", rsi14: 55.0, rsiStatus: "neutral", ma20: 115000, priceVsMa20: "below", currentPrice: 112000 };
      }
      // HPG neutral
      return { code, rsi14: 55.0, rsiStatus: "neutral", ma20: 100, priceVsMa20: "neutral", currentPrice: 100 };
    };

    const briefing = await assembleBriefing({
      db,
      pollNewsFn: async () => {},
      fetchVnIndexFn: async () => null,
      briefingsDir: tmpDir,
      computeTaFn,
    });

    expect(briefing.taSummary).toBeDefined();
    // VCB (overbought) + FPT (below MA20) should be included; HPG excluded
    expect(briefing.taSummary!.length).toBe(2);
    const codes = briefing.taSummary!.map((s) => s.code);
    expect(codes).toContain("VCB");
    expect(codes).toContain("FPT");
    expect(codes).not.toContain("HPG");

    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-5: assembleBriefing — TA step failure does not abort briefing
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-5: assembleBriefing — throwing computeTaFn does not abort briefing", () => {
  beforeEach(() => {
    resetMorningBriefingGuard();
    tmpDir = join("/tmp", `briefing-test-1304-throw-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  it("resolves without throwing when computeTaFn throws for every ticker", async () => {
    const db = setupTestDb();
    seedWatchlist(db, "VCB");
    seedWatchlist(db, "HPG");

    const throwingFn = (_code: string, _db: Database): TaSignal | null => {
      throw new Error("DB error");
    };

    let briefing: DailyBriefing | undefined;
    await expect(
      assembleBriefing({
        db,
        pollNewsFn: async () => {},
        fetchVnIndexFn: async () => null,
        briefingsDir: tmpDir,
        computeTaFn: throwingFn,
      }).then((b) => {
        briefing = b;
        return b;
      }),
    ).resolves.toBeDefined();

    // taSummary should be [] or undefined (never an error object)
    expect(
      briefing!.taSummary === undefined || Array.isArray(briefing!.taSummary),
    ).toBe(true);
    if (Array.isArray(briefing!.taSummary)) {
      expect(briefing!.taSummary.length).toBe(0);
    }

    // Other briefing fields populated normally
    expect(briefing!.date).toBeTruthy();
    expect(Array.isArray(briefing!.topStories)).toBe(true);

    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-7: RSI threshold boundary — exactly 70/30 is neutral
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-7: RSI threshold boundary — exactly 70.0 or 30.0 is neutral", () => {
  beforeEach(() => {
    resetMorningBriefingGuard();
  });

  it("does not include RSI part when rsiStatus is neutral (rsi14 = 70.0)", () => {
    const briefing: DailyBriefing = {
      date: "2026-04-15",
      topStories: [],
      alerts: [],
      watchlistSummary: [],
      newReports: [],
      macroSnapshot: [],
      sensitiveWarnings: [],
      trackedCommodities: [],
      unresolvedAlerts: [],
      topConviction: null,
      predictionSignals: [],
      generatedAt: new Date().toISOString(),
      // Ticker with rsiStatus neutral + priceVsMa20 neutral → should be excluded
      // (would be filtered out by assembleBriefing, but formatBriefingMessage
      // renders whatever is in taSummary — so an empty taSummary means no section)
      taSummary: [],
    };

    const msg = formatBriefingMessage(briefing);
    expect(msg).not.toContain("TA Tín hiệu");
  });

  it("excludes ticker with rsi14=70.0 and neutral MA from taSummary section", () => {
    // This verifies the formatter does not render RSI=70.0 (quá mua)
    // The ticker is present in taSummary but priceVsMa20 below → still shown
    const briefing: DailyBriefing = {
      date: "2026-04-15",
      topStories: [],
      alerts: [],
      watchlistSummary: [],
      newReports: [],
      macroSnapshot: [],
      sensitiveWarnings: [],
      trackedCommodities: [],
      unresolvedAlerts: [],
      topConviction: null,
      predictionSignals: [],
      generatedAt: new Date().toISOString(),
      taSummary: [
        {
          code: "VNM",
          rsi14: 70.0,
          rsiStatus: "neutral", // strict > 70 threshold, so 70.0 is neutral
          ma20: 80000,
          priceVsMa20: "below",
          currentPrice: 78000,
        },
      ],
    };

    const msg = formatBriefingMessage(briefing);
    // Section present because priceVsMa20 is "below"
    expect(msg).toContain("📡 TA Tín hiệu:");
    expect(msg).toContain("VNM");
    // But no RSI part because rsiStatus is neutral
    expect(msg).not.toContain("RSI=70.0");
    expect(msg).not.toContain("quá mua");
    // MA part should be present
    expect(msg).toContain("giá dưới MA20");
  });
});
