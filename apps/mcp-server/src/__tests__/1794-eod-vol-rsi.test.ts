/**
 * Task 1794 — TDD: EOD summaries Vol and RSI populated
 *
 * Covers:
 *   AC-1  formatMoversSection renders Vol when volume is provided
 *   AC-2  formatMoversSection renders RSI when rsi14 is provided
 *   AC-3  formatMoversSection renders both Vol and RSI together
 *   AC-4  formatMoversSection renders N/A when volume is undefined
 *   AC-5  formatMoversSection renders N/A when rsi14 is null
 *   AC-6  Vol formatted as human-readable (e.g. "7.0M", "1.2K")
 *   AC-7  RSI formatted to 1 decimal
 *   AC-8  Backward compat: old callers with only { code, changePct } still work
 *   AC-9  assembleEveningSummary populates volume on WatchlistMover from market_prices
 *   AC-10 assembleEveningSummary populates rsi14 on WatchlistMover from taSummary
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { formatMoversSection } from "../scheduler/briefings/eveningSummaryJob.js";
import { assembleEveningSummary } from "../application/usecases/assembleEveningSummary.js";
import type { TaSignal } from "../application/usecases/assembleBriefing.js";

// ─────────────────────────────────────────────────────────────────────────────
// AC-1: formatMoversSection renders Vol when volume is provided
// ─────────────────────────────────────────────────────────────────────────────
describe("AC-1: formatMoversSection renders Vol when volume provided", () => {
  it("shows Vol: 7.0M for volume 7_000_000", () => {
    const movers = [{ code: "VCB", changePct: 2.5, volume: 7_000_000 }];
    const result = formatMoversSection(movers).join("\n");
    expect(result).toContain("Vol: 7.0M");
  });

  it("shows Vol: 1.2M for volume 1_200_000", () => {
    const movers = [{ code: "FPT", changePct: 1.1, volume: 1_200_000 }];
    const result = formatMoversSection(movers).join("\n");
    expect(result).toContain("Vol: 1.2M");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-2: formatMoversSection renders RSI when rsi14 is provided
// ─────────────────────────────────────────────────────────────────────────────
describe("AC-2: formatMoversSection renders RSI when rsi14 provided", () => {
  it("shows RSI: 58.3 for rsi14 58.3", () => {
    const movers = [{ code: "VCB", changePct: 2.5, rsi14: 58.3 }];
    const result = formatMoversSection(movers).join("\n");
    expect(result).toContain("RSI: 58.3");
  });

  it("shows RSI: 72.0 for rsi14 72.0 (overbought)", () => {
    const movers = [{ code: "TCB", changePct: 3.0, rsi14: 72.0 }];
    const result = formatMoversSection(movers).join("\n");
    expect(result).toContain("RSI: 72.0");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-3: formatMoversSection renders both Vol and RSI together
// ─────────────────────────────────────────────────────────────────────────────
describe("AC-3: formatMoversSection renders Vol and RSI together", () => {
  it("single mover: both Vol and RSI appear on same ticker line", () => {
    const movers = [{ code: "VCB", changePct: 2.5, volume: 7_000_000, rsi14: 58.3 }];
    const result = formatMoversSection(movers).join("\n");
    expect(result).toContain("VCB");
    expect(result).toContain("Vol: 7.0M");
    expect(result).toContain("RSI: 58.3");
  });

  it("ticker line contains changePct, Vol, and RSI", () => {
    const movers = [{ code: "HPG", changePct: -2.1, volume: 3_500_000, rsi14: 28.5 }];
    const lines = formatMoversSection(movers);
    const hpgLine = lines.find((l) => l.includes("HPG"));
    expect(hpgLine).toBeDefined();
    expect(hpgLine).toContain("-2.10%");
    expect(hpgLine).toContain("Vol: 3.5M");
    expect(hpgLine).toContain("RSI: 28.5");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-4: formatMoversSection shows N/A when volume is undefined
// ─────────────────────────────────────────────────────────────────────────────
describe("AC-4: formatMoversSection shows N/A when volume is undefined", () => {
  it("no volume field → Vol: N/A", () => {
    const movers = [{ code: "VCB", changePct: 2.5 }];
    const result = formatMoversSection(movers).join("\n");
    expect(result).toContain("Vol: N/A");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-5: formatMoversSection shows N/A when rsi14 is null
// ─────────────────────────────────────────────────────────────────────────────
describe("AC-5: formatMoversSection shows N/A when rsi14 is null", () => {
  it("rsi14 null → RSI: N/A", () => {
    const movers = [{ code: "VCB", changePct: 2.5, rsi14: null }];
    const result = formatMoversSection(movers).join("\n");
    expect(result).toContain("RSI: N/A");
  });

  it("rsi14 undefined → RSI: N/A", () => {
    const movers = [{ code: "VCB", changePct: 2.5 }];
    const result = formatMoversSection(movers).join("\n");
    expect(result).toContain("RSI: N/A");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-6: Vol human-readable format
// ─────────────────────────────────────────────────────────────────────────────
describe("AC-6: Vol human-readable format", () => {
  it("500_000 → Vol: 500.0K", () => {
    const movers = [{ code: "AAA", changePct: 1.5, volume: 500_000 }];
    const result = formatMoversSection(movers).join("\n");
    expect(result).toContain("Vol: 500.0K");
  });

  it("1_000 → Vol: 1.0K", () => {
    const movers = [{ code: "BBB", changePct: 1.5, volume: 1_000 }];
    const result = formatMoversSection(movers).join("\n");
    expect(result).toContain("Vol: 1.0K");
  });

  it("10_000_000 → Vol: 10.0M", () => {
    const movers = [{ code: "CCC", changePct: 1.5, volume: 10_000_000 }];
    const result = formatMoversSection(movers).join("\n");
    expect(result).toContain("Vol: 10.0M");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-7: RSI formatted to 1 decimal
// ─────────────────────────────────────────────────────────────────────────────
describe("AC-7: RSI formatted to 1 decimal", () => {
  it("rsi14 63 → RSI: 63.0", () => {
    const movers = [{ code: "VCB", changePct: 1.5, rsi14: 63 }];
    const result = formatMoversSection(movers).join("\n");
    expect(result).toContain("RSI: 63.0");
  });

  it("rsi14 45.678 → RSI: 45.7 (1 dp rounding)", () => {
    const movers = [{ code: "VCB", changePct: 1.5, rsi14: 45.678 }];
    const result = formatMoversSection(movers).join("\n");
    expect(result).toContain("RSI: 45.7");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-8: Backward compat — old { code, changePct } callers still work
// ─────────────────────────────────────────────────────────────────────────────
describe("AC-8: backward compat — { code, changePct } only still works", () => {
  it("sector aggregation still works without volume/rsi14", () => {
    const movers = [
      { code: "VCB", changePct: 2.10 },
      { code: "TCB", changePct: 1.60 },
      { code: "FPT", changePct: 3.20 },
    ];
    const result = formatMoversSection(movers).join("\n");
    expect(result).toContain("Ngân hàng (+2 cp):");
    expect(result).toContain("VCB: +2.10%");
  });

  it("flat block still rendered without volume/rsi14", () => {
    const movers = [{ code: "VCB", changePct: 1.5 }];
    const result = formatMoversSection(movers).join("\n");
    expect(result).toContain("VCB: +1.50%");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers for integration tests (AC-9, AC-10)
// ─────────────────────────────────────────────────────────────────────────────

function setupIntegrationDb(): Database {
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
    CREATE TABLE IF NOT EXISTS market_prices_history (
      code       TEXT NOT NULL,
      price      REAL NOT NULL,
      volume     REAL NOT NULL,
      fetched_at TEXT NOT NULL,
      exchange   TEXT DEFAULT 'HOSE',
      PRIMARY KEY (code, fetched_at)
    );
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code    TEXT NOT NULL,
      date    TEXT NOT NULL,
      open    REAL,
      high    REAL,
      low     REAL,
      close   REAL,
      volume  REAL,
      updated_at TEXT NOT NULL DEFAULT '',
      foreign_buy_vol  REAL,
      foreign_sell_vol REAL,
      foreign_net_vol  REAL,
      PRIMARY KEY (code, date)
    );
    CREATE TABLE IF NOT EXISTS rag_analyses (
      id           TEXT PRIMARY KEY,
      created_at   TEXT NOT NULL,
      level        TEXT NOT NULL,
      source_title TEXT,
      sentiment    TEXT,
      impact_score REAL,
      data_env TEXT
);
    CREATE TABLE IF NOT EXISTS alerts (
      id                    TEXT PRIMARY KEY,
      triggered_at          TEXT NOT NULL,
      severity              TEXT NOT NULL,
      message               TEXT,
      affected_actions_json TEXT
    );
  `);
  return db;
}

function baseOpts(db: Database, taOverride?: (code: string, db: Database) => TaSignal | null) {
  return {
    db,
    reportsDir: "/tmp/__test-1794__",
    computeTaFn: taOverride ?? (() => null),
    getOhlcvRowCountFn: () => 0,
    fetchVnIndexFn: async () => null,
    getNewsCountFn: () => 0,
    getPredictionSignalsFn: async () => [],
    getPnlFn: async () => null,
  } as const;
}

// ─────────────────────────────────────────────────────────────────────────────
// AC-9: assembleEveningSummary populates volume from market_prices
// ─────────────────────────────────────────────────────────────────────────────
describe("AC-9: assembleEveningSummary populates volume from market_prices", () => {
  it("WatchlistMover.volume matches market_prices.volume for the ticker", async () => {
    const db = setupIntegrationDb();
    db.prepare(`INSERT INTO watchlist (code, exchange) VALUES ('VCB', 'HOSE')`).run();
    db.prepare(
      `INSERT INTO market_prices (code, price, change_pct, volume, updated_at, exchange)
       VALUES ('VCB', 85000, 2.5, 7000000, datetime('now'), 'HOSE')`,
    ).run();

    const summary = await assembleEveningSummary(baseOpts(db));
    const vcb = summary.watchlistMovers.find((m) => m.code === "VCB");
    expect(vcb).toBeDefined();
    expect(vcb!.volume).toBe(7_000_000);

    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-10: assembleEveningSummary populates rsi14 from taSummary
// ─────────────────────────────────────────────────────────────────────────────
describe("AC-10: assembleEveningSummary populates rsi14 from taSummary", () => {
  it("WatchlistMover.rsi14 is populated from computeTaFn result for the ticker", async () => {
    const db = setupIntegrationDb();
    db.prepare(`INSERT INTO watchlist (code, exchange) VALUES ('TCB', 'HOSE')`).run();
    db.prepare(
      `INSERT INTO market_prices (code, price, change_pct, volume, updated_at, exchange)
       VALUES ('TCB', 32000, 1.8, 5000000, datetime('now'), 'HOSE')`,
    ).run();

    const taFn = (code: string): TaSignal | null => {
      if (code === "TCB") {
        return {
          code: "TCB",
          rsi14: 58.3,
          rsiStatus: "neutral",
          ma20: 31000,
          priceVsMa20: "above",
          currentPrice: 32000,
        };
      }
      return null;
    };

    const summary = await assembleEveningSummary(baseOpts(db, taFn));
    const tcb = summary.watchlistMovers.find((m) => m.code === "TCB");
    expect(tcb).toBeDefined();
    expect(tcb!.rsi14).toBeCloseTo(58.3, 1);

    db.close();
  });

  it("WatchlistMover.rsi14 is null when computeTaFn returns null for ticker", async () => {
    const db = setupIntegrationDb();
    db.prepare(`INSERT INTO watchlist (code, exchange) VALUES ('HPG', 'HOSE')`).run();
    db.prepare(
      `INSERT INTO market_prices (code, price, change_pct, volume, updated_at, exchange)
       VALUES ('HPG', 26000, 2.0, 3000000, datetime('now'), 'HOSE')`,
    ).run();

    const summary = await assembleEveningSummary(baseOpts(db));
    const hpg = summary.watchlistMovers.find((m) => m.code === "HPG");
    expect(hpg).toBeDefined();
    expect(hpg!.rsi14).toBeNull();

    db.close();
  });
});
