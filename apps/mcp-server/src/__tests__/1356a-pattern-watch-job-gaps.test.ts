Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1356a — patternWatchJob gap-fill tests (PWJ-1 through PWJ-8)
 *
 *   PWJ-1: empty watchlist → early return, no DB query for stock data, no Telegram
 *   PWJ-2: single stock, insufficient recent data (< 3 rows) → skip, no alert
 *   PWJ-3: single stock, sufficient recent but insufficient historical (< 10 rows) → skip, no alert
 *   PWJ-4: pattern match fires → sendTelegramBug called with stock code in message
 *   PWJ-5: no profile similarity (window avg differs > 2) → no match, logger.debug called
 *   PWJ-6: per-stock error catch → job continues, no rethrow (silent inner catch)
 *   PWJ-7: multiple stocks both match → one combined Telegram message, matches === 2
 *   PWJ-8: alert message content check → "PATTERN WATCH" + disclaimer + parseMode: ""
 *
 * Mock strategy: mock.module() at file top level with mutable factory variables.
 * Dynamic import of the job inside each test picks up the current mock state.
 *
 * DB mock: call-count-per-code distinguishes recent (1st call) from historical (2nd call).
 *
 * Layer: tests — no real SQLite, no real Telegram, in-memory isolation.
 */

import { describe, it, expect, mock, afterAll } from "bun:test";

// ─────────────────────────────────────────────────────────────────────────────
// Real-module captures — imported BEFORE any mock.module() call so they hold
// genuine implementations. Used in teardown to repair the module registry.
// ─────────────────────────────────────────────────────────────────────────────
import { getDb as _realGetDb } from "../infrastructure/db/schema.js";
import { sendTelegramBug as _realSendTelegramBug } from "../infrastructure/notifiers/telegram.js";
import { logger as _realLogger } from "../infrastructure/logger.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// Freeze references before any mock.module() can mutate live bindings
const _frozenGetDb = _realGetDb;
const _frozenSendTelegramBug = _realSendTelegramBug;

// ─────────────────────────────────────────────────────────────────────────────
// Top-level mutable mock factories
//
// mock.module() is worker-scoped and permanent. Per-test behaviour is controlled
// by updating these variables, not by re-calling mock.module().
// ─────────────────────────────────────────────────────────────────────────────

type PriceRow = { price: number; volume: number; change_pct: number; fetched_at: string };
type WatchlistRow = { code: string; domain: string };

// Mutable state for watchlist and price data
let _watchlistRows: WatchlistRow[] = [];
let _recentRowsMap: Record<string, PriceRow[]> = {};
let _historicalRowsMap: Record<string, PriceRow[]> = {};

// Telegram capture
let _sendTelegramBugCalls: Array<[string, unknown]> = [];
let _sendTelegramBugImpl: (msg: string, opts: unknown) => Promise<void> = async (msg, opts) => {
  _sendTelegramBugCalls.push([msg, opts]);
};

// Logger capture
let _loggerInfoCalls: Array<[string, unknown]> = [];
let _loggerErrorCalls: Array<[string, unknown]> = [];
let _loggerDebugCalls: Array<[string, unknown]> = [];

// DB factory — call-count-per-code: 1st call = recent, 2nd call = historical
let _getDbImpl: () => unknown = () => {
  const queryCallCount: Record<string, number> = {};
  return {
    prepare: (_sql: string) => ({
      all: () => _watchlistRows,
    }),
    query: (_sql: string) => ({
      all: (code: string) => {
        queryCallCount[code] = (queryCallCount[code] ?? 0) + 1;
        return queryCallCount[code] === 1
          ? (_recentRowsMap[code] ?? [])
          : (_historicalRowsMap[code] ?? []);
      },
    }),
  };
};

mock.module("../infrastructure/db/schema.js", () => ({
  getDb: () => _getDbImpl(),
}));

mock.module("../infrastructure/notifiers/telegram.js", () => ({
  sendTelegramBug: (msg: string, opts: unknown) => _sendTelegramBugImpl(msg, opts),
}));

mock.module("../infrastructure/logger.js", () => ({
  logger: {
    info: (msg: string, meta?: unknown) => { _loggerInfoCalls.push([msg, meta]); },
    error: (msg: string, meta?: unknown) => { _loggerErrorCalls.push([msg, meta]); },
    debug: (msg: string, meta?: unknown) => { _loggerDebugCalls.push([msg, meta]); },
    warn: (_msg: string, _meta?: unknown) => {},
  },
}));

// ─────────────────────────────────────────────────────────────────────────────
// Fixture helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Generate N price rows with uniform change_pct and fixed price. */
function makeRows(n: number, changePct: number, price: number): PriceRow[] {
  return Array.from({ length: n }, (_, idx) => ({
    price,
    volume: 100000,
    change_pct: changePct,
    fetched_at: `2025-10-${String(idx + 1).padStart(2, "0")} 10:00:00`,
  }));
}

/**
 * Build a 20-row historical fixture that triggers a pattern match at i=9.
 *
 * Loop condition: i < historical.length - 10 → for 20 rows, i goes 0..9.
 * At i=9:
 *   window = historical.slice(9, 14)  → rows 9..13: change_pct=1.0, price=100
 *   windowAvgChange = 1.0 — matches currentAvgChange=1.0 (diff=0 < 2) ✓
 *   afterWindow = historical.slice(0, 9) → rows 0..8
 *   afterWindow.length = 9 >= 3 ✓
 *   startPrice = historical[9].price = 100
 *   maxAfter = max of rows 0..8 prices
 *   One row at index 1 has price=106 → maxMove = 6% >= 5 ✓  → fires alert
 */
function makeMatchHistorical(code: string): PriceRow[] {
  const rows: PriceRow[] = [];
  for (let i = 0; i < 20; i++) {
    let price = 100;
    // Row index 1 in the afterWindow range (rows 0..8): set to 106 to trigger maxMove >= 5
    if (i === 1) price = 106;
    rows.push({
      price,
      volume: 100000,
      change_pct: 1.0,
      fetched_at: `2025-10-${String(i + 1).padStart(2, "0")} 10:00:00`,
    });
  }
  // Annotate with code in fetched_at comment (unused, just for clarity)
  void code;
  return rows;
}

/** Reset all per-test capture arrays and state. */
function resetCaptures() {
  _sendTelegramBugCalls = [];
  _loggerInfoCalls = [];
  _loggerErrorCalls = [];
  _loggerDebugCalls = [];
  _watchlistRows = [];
  _recentRowsMap = {};
  _historicalRowsMap = {};
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1356a — patternWatchJob gap tests", () => {

  it("PWJ-1: empty watchlist → early return, no Telegram, no logger.info", async () => {
    resetCaptures();
    _watchlistRows = [];

    const { runPatternWatch } = await import("../scheduler/news-analysis/patternWatchJob.js");
    await expect(runPatternWatch()).resolves.toBeUndefined();

    expect(_sendTelegramBugCalls.length).toBe(0);
    expect(_loggerInfoCalls.length).toBe(0);
  });

  it("PWJ-2: single stock, insufficient recent data (< 3 rows) → skip, no alert", async () => {
    resetCaptures();
    _watchlistRows = [{ code: "VCB", domain: "banking" }];
    _recentRowsMap["VCB"] = makeRows(2, 1.0, 100);  // only 2 rows — below the 3-row threshold
    _historicalRowsMap["VCB"] = makeRows(15, 1.0, 100); // sufficient, but never reached

    const { runPatternWatch } = await import("../scheduler/news-analysis/patternWatchJob.js");
    await expect(runPatternWatch()).resolves.toBeUndefined();

    expect(_sendTelegramBugCalls.length).toBe(0);
    expect(_loggerInfoCalls.length).toBe(0);
  });

  it("PWJ-3: single stock, insufficient historical (< 10 rows) → skip, no alert", async () => {
    resetCaptures();
    _watchlistRows = [{ code: "VCB", domain: "banking" }];
    _recentRowsMap["VCB"] = makeRows(5, 1.0, 100); // sufficient recent
    _historicalRowsMap["VCB"] = makeRows(8, 1.0, 100); // only 8 historical — below 10-row threshold

    const { runPatternWatch } = await import("../scheduler/news-analysis/patternWatchJob.js");
    await expect(runPatternWatch()).resolves.toBeUndefined();

    expect(_sendTelegramBugCalls.length).toBe(0);
    expect(_loggerInfoCalls.length).toBe(0);
  });

  it("PWJ-4: pattern match fires → sendTelegramBug called, message contains stock code", async () => {
    resetCaptures();
    _watchlistRows = [{ code: "VCB", domain: "banking" }];
    // recent: 5 rows, change_pct=1.0 → currentAvgChange=1.0
    _recentRowsMap["VCB"] = makeRows(5, 1.0, 100);
    // historical: 20 rows, window at i=9 matches profile, afterWindow row has price=106
    _historicalRowsMap["VCB"] = makeMatchHistorical("VCB");

    const { runPatternWatch } = await import("../scheduler/news-analysis/patternWatchJob.js");
    await expect(runPatternWatch()).resolves.toBeUndefined();

    expect(_sendTelegramBugCalls.length).toBe(1);
    const [message] = _sendTelegramBugCalls[0]!;
    expect(message).toContain("VCB");
    // Direction arrow must appear
    expect(message).toMatch(/[↑↓]/);
    // logger.info called with matches=1
    const infoEntry = _loggerInfoCalls.find(([msg]) =>
      typeof msg === "string" && msg.includes("[patternWatch] sent weekly pattern alert"),
    );
    expect(infoEntry).toBeDefined();
    const meta = infoEntry![1] as { matches: number };
    expect(meta.matches).toBe(1);
  });

  it("PWJ-5: no profile similarity (all windows differ > 2) → no match, logger.debug called", async () => {
    resetCaptures();
    _watchlistRows = [{ code: "VCB", domain: "banking" }];
    // recent: change_pct=5.0 → currentAvgChange=5.0
    _recentRowsMap["VCB"] = makeRows(5, 5.0, 100);
    // historical: all change_pct=-5.0 → windowAvgChange=-5.0, diff=10 > 2 → never similar
    _historicalRowsMap["VCB"] = makeRows(20, -5.0, 100);

    const { runPatternWatch } = await import("../scheduler/news-analysis/patternWatchJob.js");
    await expect(runPatternWatch()).resolves.toBeUndefined();

    expect(_sendTelegramBugCalls.length).toBe(0);
    const debugEntry = _loggerDebugCalls.find(([msg]) =>
      typeof msg === "string" && msg.includes("[patternWatch] no matching patterns found"),
    );
    expect(debugEntry).toBeDefined();
  });

  it("PWJ-6: per-stock error catch → job continues, other stock matches, no rethrow", async () => {
    resetCaptures();
    _watchlistRows = [
      { code: "ERR", domain: "error" },
      { code: "VCB", domain: "banking" },
    ];

    // Override _getDbImpl for this test: ERR throws on query, VCB uses normal fixture
    _recentRowsMap["VCB"] = makeRows(5, 1.0, 100);
    _historicalRowsMap["VCB"] = makeMatchHistorical("VCB");

    // Use a custom DB that throws for ERR's first query call
    const prevGetDbImpl = _getDbImpl;
    _getDbImpl = () => {
      const queryCallCount: Record<string, number> = {};
      return {
        prepare: (_sql: string) => ({
          all: () => _watchlistRows,
        }),
        query: (_sql: string) => ({
          all: (code: string) => {
            if (code === "ERR") throw new Error("DB error for ERR");
            queryCallCount[code] = (queryCallCount[code] ?? 0) + 1;
            return queryCallCount[code] === 1
              ? (_recentRowsMap[code] ?? [])
              : (_historicalRowsMap[code] ?? []);
          },
        }),
      };
    };

    const { runPatternWatch } = await import("../scheduler/news-analysis/patternWatchJob.js");
    await expect(runPatternWatch()).resolves.toBeUndefined();

    // VCB matched → one Telegram call
    expect(_sendTelegramBugCalls.length).toBe(1);
    const [message] = _sendTelegramBugCalls[0]!;
    expect(message).toContain("VCB");
    // Inner catch is silent — no logger.error call
    expect(_loggerErrorCalls.length).toBe(0);

    // Restore
    _getDbImpl = prevGetDbImpl;
  });

  it("PWJ-7: multiple stocks both match → one combined Telegram message, matches === 2", async () => {
    resetCaptures();
    _watchlistRows = [
      { code: "VCB", domain: "banking" },
      { code: "HPG", domain: "steel" },
    ];
    _recentRowsMap["VCB"] = makeRows(5, 1.0, 100);
    _historicalRowsMap["VCB"] = makeMatchHistorical("VCB");
    _recentRowsMap["HPG"] = makeRows(5, 1.0, 100);
    _historicalRowsMap["HPG"] = makeMatchHistorical("HPG");

    const { runPatternWatch } = await import("../scheduler/news-analysis/patternWatchJob.js");
    await expect(runPatternWatch()).resolves.toBeUndefined();

    // One combined message
    expect(_sendTelegramBugCalls.length).toBe(1);
    const [message] = _sendTelegramBugCalls[0]!;
    expect(message).toContain("VCB");
    expect(message).toContain("HPG");
    // logger.info meta matches === 2
    const infoEntry = _loggerInfoCalls.find(([msg]) =>
      typeof msg === "string" && msg.includes("[patternWatch] sent weekly pattern alert"),
    );
    expect(infoEntry).toBeDefined();
    const meta = infoEntry![1] as { matches: number };
    expect(meta.matches).toBe(2);
  });

  it("PWJ-8: alert message contains PATTERN WATCH header, disclaimer, and parseMode: \"\"", async () => {
    resetCaptures();
    _watchlistRows = [{ code: "VCB", domain: "banking" }];
    _recentRowsMap["VCB"] = makeRows(5, 1.0, 100);
    _historicalRowsMap["VCB"] = makeMatchHistorical("VCB");

    const { runPatternWatch } = await import("../scheduler/news-analysis/patternWatchJob.js");
    await expect(runPatternWatch()).resolves.toBeUndefined();

    expect(_sendTelegramBugCalls.length).toBe(1);
    const [message, opts] = _sendTelegramBugCalls[0]!;
    // Header check
    expect(message).toContain("PATTERN WATCH");
    // Disclaimer check
    expect(message).toContain("không phải khuyến nghị đầu tư");
    // parseMode must be empty string
    expect(opts).toEqual({ parseMode: "" });
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// Teardown — restore mocked modules to real implementations
//
// mock.module() in Bun 1.x is worker-scoped and permanent. Re-register the
// real implementations captured at file top-level so worker-siblings see
// genuine modules rather than our test stubs.
// ─────────────────────────────────────────────────────────────────────────────
afterAll(() => {
  mock.module("../infrastructure/db/schema.js", () => ({
    getDb: _frozenGetDb,
  }));
  mock.module("../infrastructure/notifiers/telegram.js", () => ({
    sendTelegramBug: _frozenSendTelegramBug,
  }));
  mock.module("../infrastructure/logger.js", () => ({
    logger: _realLogger,
  }));
});
