// DEPRECATED: G5 Phase 2. Moved from domain/services/. Delete after G5 verification passes.
Bun.env["DB_PATH"] = ":memory:"; // isolation — must be first line

/**
 * Task 1302 + 1303 — Technical Indicators Domain Service + MCP Handler TDD
 *
 * Tests:
 *   - Pure math functions in `src/domain/services/technicalIndicators.ts`
 *   - MCP handler integration via in-memory SQLite DB (Task 1303)
 *
 * No I/O beyond in-memory SQLite in integration describe block.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  computeMA,
  computeRSI,
  computeMACD,
  computeBollingerBands,
  computeAllIndicators,
  type DailyCandle,
} from "./technicalIndicators.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Generate N candles with linearly increasing prices starting at `start`. */
function risingCandles(n: number, start = 100, step = 1): DailyCandle[] {
  return Array.from({ length: n }, (_, i) => ({
    day: `2026-01-${String(i + 1).padStart(2, "0")}`,
    close: start + i * step,
  }));
}

/** Generate N candles with linearly decreasing prices starting at `start`. */
function fallingCandles(n: number, start = 200, step = 1): DailyCandle[] {
  return Array.from({ length: n }, (_, i) => ({
    day: `2026-01-${String(i + 1).padStart(2, "0")}`,
    close: start - i * step,
  }));
}

/** Generate N candles with flat price. */
function flatCandles(n: number, price = 100): DailyCandle[] {
  return Array.from({ length: n }, (_, i) => ({
    day: `2026-01-${String(i + 1).padStart(2, "0")}`,
    close: price,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// computeMA
// ─────────────────────────────────────────────────────────────────────────────

describe("computeMA", () => {
  it("returns correct MA for known array — MA(3) on [10,20,30,40,50] = 40.0", () => {
    const result = computeMA([10, 20, 30, 40, 50], 3);
    expect(result).toBe(40.0);
  });

  it("returns MA of last N values, not all values", () => {
    // MA(2) on [10,20,30,40,50] = (40+50)/2 = 45
    const result = computeMA([10, 20, 30, 40, 50], 2);
    expect(result).toBe(45.0);
  });

  it("returns null when prices.length < period", () => {
    const result = computeMA([10, 20], 3);
    expect(result).toBeNull();
  });

  it("returns null for empty array", () => {
    const result = computeMA([], 3);
    expect(result).toBeNull();
  });

  it("returns the price itself for period=1", () => {
    const result = computeMA([42, 55, 70], 1);
    expect(result).toBe(70);
  });

  it("returns exact value for period equal to array length", () => {
    // MA(5) on [10,20,30,40,50] = (10+20+30+40+50)/5 = 30
    const result = computeMA([10, 20, 30, 40, 50], 5);
    expect(result).toBe(30.0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeRSI
// ─────────────────────────────────────────────────────────────────────────────

describe("computeRSI", () => {
  it("returns 100 on all-rising prices (no losses)", () => {
    // 16 prices with period=3, all prices rise → no losses → RSI = 100
    const prices = Array.from({ length: 16 }, (_, i) => 10 + i);
    const result = computeRSI(prices, 3);
    expect(result).toBe(100);
  });

  it("returns 0 on all-falling prices (no gains)", () => {
    // 16 prices with period=3, all prices fall → no gains → RSI = 0
    const prices = Array.from({ length: 16 }, (_, i) => 200 - i);
    const result = computeRSI(prices, 3);
    expect(result).toBe(0);
  });

  it("returns value in [0, 100] range for mixed prices", () => {
    const prices = [10, 11, 9, 12, 8, 13, 11, 14, 10, 15, 12, 16, 11, 14, 13, 15];
    const result = computeRSI(prices, 14);
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThanOrEqual(0);
    expect(result!).toBeLessThanOrEqual(100);
  });

  it("returns null when fewer than period+1 prices", () => {
    // period=14, need 15 prices, but only 14 supplied
    const prices = Array.from({ length: 14 }, (_, i) => 10 + i);
    const result = computeRSI(prices, 14);
    expect(result).toBeNull();
  });

  it("returns null for empty array", () => {
    expect(computeRSI([], 14)).toBeNull();
  });

  it("defaults to period=14", () => {
    // 16 rising prices → RSI(14) = 100
    const prices = Array.from({ length: 16 }, (_, i) => 10 + i);
    const withDefault = computeRSI(prices);
    const withExplicit = computeRSI(prices, 14);
    expect(withDefault).toBe(withExplicit);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeMACD
// ─────────────────────────────────────────────────────────────────────────────

describe("computeMACD", () => {
  it("returns null when fewer than 34 prices (slow+signal-1 = 26+9-1 = 34)", () => {
    const prices = Array.from({ length: 33 }, (_, i) => 100 + i);
    const result = computeMACD(prices);
    expect(result).toBeNull();
  });

  it("returns null for empty array", () => {
    expect(computeMACD([])).toBeNull();
  });

  it("histogram equals macd - signal (arithmetic identity)", () => {
    const prices = risingCandles(55).map((c) => c.close);
    const result = computeMACD(prices);
    expect(result).not.toBeNull();
    expect(result!.histogram).toBeCloseTo(result!.macd - result!.signal, 8);
  });

  it("returns bullish histogram (> 0) for strongly uptrending prices", () => {
    // 55 prices rising steeply — fast EMA should exceed slow EMA
    const prices = Array.from({ length: 55 }, (_, i) => 100 + i * 5);
    const result = computeMACD(prices);
    expect(result).not.toBeNull();
    expect(result!.histogram).toBeGreaterThan(0);
  });

  it("returns bearish histogram (< 0) for strongly downtrending prices", () => {
    // 55 prices falling steeply — fast EMA should be below slow EMA
    const prices = Array.from({ length: 55 }, (_, i) => 500 - i * 5);
    const result = computeMACD(prices);
    expect(result).not.toBeNull();
    expect(result!.histogram).toBeLessThan(0);
  });

  it("defaults to fast=12, slow=26, signal=9", () => {
    const prices = risingCandles(55).map((c) => c.close);
    const withDefault = computeMACD(prices);
    const withExplicit = computeMACD(prices, 12, 26, 9);
    expect(withDefault).toEqual(withExplicit);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeBollingerBands
// ─────────────────────────────────────────────────────────────────────────────

describe("computeBollingerBands", () => {
  it("[10,20,30] period=3 → mid=20, upper≈36.33, lower≈3.67", () => {
    // population std dev of [10,20,30]:
    //   mean = 20, variance = ((10-20)^2 + (20-20)^2 + (30-20)^2) / 3
    //         = (100 + 0 + 100) / 3 = 66.67, std = 8.165
    //   upper = 20 + 2*8.165 = 36.33
    //   lower = 20 - 2*8.165 = 3.67
    const result = computeBollingerBands([10, 20, 30], 3, 2);
    expect(result).not.toBeNull();
    expect(result!.mid).toBeCloseTo(20, 5);
    expect(result!.upper).toBeCloseTo(36.33, 2);
    expect(result!.lower).toBeCloseTo(3.67, 2);
  });

  it("upper > mid > lower invariant always holds", () => {
    const prices = risingCandles(25).map((c) => c.close);
    const result = computeBollingerBands(prices, 20, 2);
    expect(result).not.toBeNull();
    expect(result!.upper).toBeGreaterThan(result!.mid);
    expect(result!.mid).toBeGreaterThan(result!.lower);
  });

  it("returns null when prices.length < period", () => {
    const result = computeBollingerBands([10, 20], 3);
    expect(result).toBeNull();
  });

  it("returns null for empty array", () => {
    expect(computeBollingerBands([], 20)).toBeNull();
  });

  it("mid equals SMA of last `period` prices", () => {
    // [10,20,30,40,50], period=3 → last 3 = [30,40,50], mean=40
    const result = computeBollingerBands([10, 20, 30, 40, 50], 3, 2);
    expect(result).not.toBeNull();
    expect(result!.mid).toBeCloseTo(40, 5);
  });

  it("defaults to period=20 and stdDevMultiplier=2", () => {
    const prices = risingCandles(25).map((c) => c.close);
    const withDefault = computeBollingerBands(prices);
    const withExplicit = computeBollingerBands(prices, 20, 2);
    expect(withDefault).toEqual(withExplicit);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeAllIndicators
// ─────────────────────────────────────────────────────────────────────────────

describe("computeAllIndicators", () => {
  it("returns all nulls for fewer than 15 candles", () => {
    const candles = risingCandles(10);
    const result = computeAllIndicators(candles);
    // With only 10 candles, none of the indicators can compute
    // MA5 needs 5 → can compute, MA20 needs 20 → null, MA50 needs 50 → null
    // RSI needs 15 → null (10 < 15)
    // MACD needs 34 → null
    // BB needs 20 → null
    expect(result.ma5).not.toBeNull(); // 10 >= 5, so MA5 computes
    expect(result.ma20).toBeNull();
    expect(result.ma50).toBeNull();
    expect(result.rsi14).toBeNull();
    expect(result.macd).toBeNull();
    expect(result.bb20).toBeNull();
  });

  it("returns MA5/RSI/BB for 20 candles; null MACD and MA50", () => {
    const candles = risingCandles(20);
    const result = computeAllIndicators(candles);
    expect(result.ma5).not.toBeNull();
    expect(result.ma20).not.toBeNull();
    expect(result.ma50).toBeNull();       // need 50, only 20
    expect(result.rsi14).not.toBeNull();  // need 15, have 20
    expect(result.macd).toBeNull();       // need 34, only 20
    expect(result.bb20).not.toBeNull();   // need 20, have exactly 20
  });

  it("returns all indicators for 55 candles", () => {
    const candles = risingCandles(55);
    const result = computeAllIndicators(candles);
    expect(result.ma5).not.toBeNull();
    expect(result.ma20).not.toBeNull();
    expect(result.ma50).not.toBeNull();
    expect(result.rsi14).not.toBeNull();
    expect(result.macd).not.toBeNull();
    expect(result.bb20).not.toBeNull();
    // RSI should be in valid range
    expect(result.rsi14!).toBeGreaterThanOrEqual(0);
    expect(result.rsi14!).toBeLessThanOrEqual(100);
    // BB invariant
    expect(result.bb20!.upper).toBeGreaterThan(result.bb20!.mid);
    expect(result.bb20!.mid).toBeGreaterThan(result.bb20!.lower);
    // MACD histogram identity
    expect(result.macd!.histogram).toBeCloseTo(
      result.macd!.line - result.macd!.signal, 8
    );
  });

  it("returns all nulls for empty candles array", () => {
    const result = computeAllIndicators([]);
    expect(result.ma5).toBeNull();
    expect(result.ma20).toBeNull();
    expect(result.ma50).toBeNull();
    expect(result.rsi14).toBeNull();
    expect(result.macd).toBeNull();
    expect(result.bb20).toBeNull();
  });

  it("MACD histogram on uptrending candles is positive", () => {
    const candles = risingCandles(55);
    const result = computeAllIndicators(candles);
    expect(result.macd).not.toBeNull();
    expect(result.macd!.histogram).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MCP handler integration (Task 1303)
// In-memory SQLite DB seeded with synthetic price rows.
// ─────────────────────────────────────────────────────────────────────────────

// ── In-memory DB helpers ────────────────────────────────────────────────────

function buildInMemoryDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE daily_ohlcv (
      code   TEXT NOT NULL,
      date   TEXT NOT NULL,
      open   REAL NOT NULL,
      high   REAL NOT NULL,
      low    REAL NOT NULL,
      close  REAL NOT NULL,
      volume REAL NOT NULL,
      PRIMARY KEY (code, date)
    );
    CREATE INDEX idx_ohlcv_code_date
      ON daily_ohlcv(code, date DESC);
  `);
  return db;
}

/**
 * Seed `n` daily OHLCV rows for `code`.
 * Task 1850a: migrated from market_prices_history to daily_ohlcv.
 * Prices rise linearly from 90000.
 */
function seedDailyRows(db: Database, code: string, n: number): void {
  const ins = db.prepare(
    "INSERT OR REPLACE INTO daily_ohlcv (code, date, open, high, low, close, volume) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  for (let i = n - 1; i >= 0; i--) {
    const price = 90000 + (n - 1 - i) * 100;
    const daysAgo = i;
    const d = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().slice(0, 10);
    ins.run(code, dateStr, price - 50, price + 50, price - 100, price, 1_000_000);
  }
}

// ── callTool helper (mirrors pattern in 178-price-history.test.ts) ──────────

async function callTool(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const tools = (server as unknown as {
    _registeredTools: Record<string, {
      callback?: (args: Record<string, unknown>) => Promise<unknown>;
      handler?: (args: Record<string, unknown>) => Promise<unknown>;
    }>;
  })._registeredTools;
  const tool = tools[toolName];
  if (!tool) throw new Error(`Tool not registered: ${toolName}`);
  const fn = tool.callback ?? tool.handler;
  if (!fn) throw new Error(`No callable found for tool: ${toolName}`);
  return fn(args) as Promise<{ content: Array<{ type: string; text: string }> }>;
}

describe("MCP handler integration", () => {
  let db: Database;
  let server: McpServer;

  beforeEach(() => {
    db = buildInMemoryDb();
    server = new McpServer(
      { name: "test-server", version: "1.0.0" },
      { capabilities: { tools: {} } },
    );
    const { registerTechnicalIndicatorTools } = require("../interface/mcp/tools/market-data/technicalIndicatorTools.js");
    registerTechnicalIndicatorTools(server, db);
  });

  afterEach(() => {
    db.close();
  });

  it("formats output with all 4 indicator blocks when DB has 55+ rows", async () => {
    seedDailyRows(db, "VCB", 55);
    const result = await callTool(server, "get_technical_indicators", {
      code: "VCB",
      days: 60,
    });
    const text = result.content[0]!.text;

    // Header
    expect(text).toContain("[VCB]");
    expect(text).toContain("Chỉ báo kỹ thuật");

    // MA block
    expect(text).toContain("MA5=");
    expect(text).toContain("MA20=");
    expect(text).toContain("MA50=");

    // RSI block
    expect(text).toContain("RSI(14):");

    // MACD block
    expect(text).toContain("MACD:");
    expect(text).toContain("Line=");
    expect(text).toContain("Signal=");
    expect(text).toContain("Hist=");

    // BB block
    expect(text).toContain("BB(20):");
    expect(text).toContain("Upper=");
    expect(text).toContain("Mid=");
    expect(text).toContain("Lower=");

    // Conclusion
    expect(text).toContain("Kết luận:");
    // Should contain a verdict
    const hasVerdict = text.includes("TANG") || text.includes("GIAM") || text.includes("TRUNG TINH");
    expect(hasVerdict).toBe(true);
  });

  it("returns insufficient-data message for 10-row DB (below 35 minimum)", async () => {
    seedDailyRows(db, "HPG", 10);
    const result = await callTool(server, "get_technical_indicators", {
      code: "HPG",
      days: 60,
    });
    const text = result.content[0]!.text;

    expect(text).toContain("[HPG] Không đủ dữ liệu kỹ thuật");
    expect(text).toContain("Tìm thấy 10 nến");
    expect(text).toContain("cần tối thiểu 35 cho MACD");
    // No crash — single content item with text
    expect(result.content).toHaveLength(1);
    expect(result.content[0]!.type).toBe("text");
  });

  it("ticker is uppercased automatically", async () => {
    seedDailyRows(db, "FPT", 40);
    const result = await callTool(server, "get_technical_indicators", {
      code: "fpt",
      days: 60,
    });
    const text = result.content[0]!.text;
    expect(text).toContain("[FPT]");
  });

  it("returns no-data message when ticker not found in DB", async () => {
    // DB is empty for UNKNOWN
    const result = await callTool(server, "get_technical_indicators", {
      code: "UNKNOWN",
      days: 60,
    });
    const text = result.content[0]!.text;
    // 0 candles < 35 — should return the insufficient data message
    expect(text).toContain("Không đủ dữ liệu kỹ thuật");
    expect(text).toContain("Tìm thấy 0 nến");
  });

  it("MACD block shows histogram sign matching bullish uptrend", async () => {
    // 55 strictly rising rows → MACD histogram should be positive (bullish)
    seedDailyRows(db, "VNM", 55);
    const result = await callTool(server, "get_technical_indicators", {
      code: "VNM",
      days: 60,
    });
    const text = result.content[0]!.text;
    // Histogram should be positive for uptrend — look for "Hist=+" pattern
    expect(text).toContain("TANG");
  });
});
