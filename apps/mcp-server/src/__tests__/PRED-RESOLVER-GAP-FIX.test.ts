/**
 * PRED-RESOLVER-GAP-FIX — Prediction Producer↔Resolver Contract Tests
 *
 * Three-leg fix:
 *   LEG-1 (RESOLVER): nearest-trading-day OHLCV match — weekend/holiday resolution_dates
 *          resolve against the prior/next available bar instead of being stranded.
 *   LEG-2 (PRODUCER): addTradingDays() skips weekends/holidays so resolution_date lands
 *          on a trading day at creation time.
 *   LEG-3 (NEUTRAL-BAND): neutral claims with creation_price resolve via
 *          |actual - creation| / creation < NEUTRAL_BAND_PCT → HIT; else MISS.
 *          Neutral claims with creation_price=NULL are marked is_excluded=1.
 *
 * HARD INVARIANT tested: no terminal path may leave resolution_outcome NULL
 * once resolved_at is stamped, unless is_excluded=1.
 *
 * All tests use an in-memory SQLite database — no production DB access.
 *
 * @module __tests__/PRED-RESOLVER-GAP-FIX
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import {
  runPredictionResolution,
  evaluateOutcome,
  getClosePriceNearestTradingDay,
} from "../scheduler/macro/predictionResolutionJob.js";
import { addTradingDays } from "../interface/mcp/tools/macro/evidenceTools.js";
import { NEUTRAL_BAND_PCT } from "../domain/services/alertThresholds.js";
import { isVnTradingDay } from "../domain/services/vnTradingCalendar.js";

// ─────────────────────────────────────────────────────────────────────────────
// Schema helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS prediction_claims (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      stock              TEXT    NOT NULL,
      agent_id           TEXT    NOT NULL,
      claim_text         TEXT    NOT NULL,
      direction          TEXT    NOT NULL CHECK(direction IN ('bullish','bearish','neutral')),
      target_price       REAL,
      resolution_date    TEXT    NOT NULL,
      confidence         REAL    NOT NULL CHECK(confidence BETWEEN 0.0 AND 1.0),
      resolution_outcome INTEGER CHECK(resolution_outcome IN (NULL, 0, 1)),
      actual_price       REAL,
      brier_score        REAL,
      created_at         TEXT    NOT NULL DEFAULT (datetime('now')),
      resolved_at        TEXT,
      creation_price     REAL,
      is_excluded        INTEGER NOT NULL DEFAULT 0,
      UNIQUE(stock, claim_text, resolution_date)
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code       TEXT    NOT NULL,
      date       TEXT    NOT NULL,
      open       REAL    NOT NULL,
      high       REAL    NOT NULL,
      low        REAL    NOT NULL,
      close      REAL    NOT NULL,
      volume     REAL    NOT NULL DEFAULT 0,
      updated_at TEXT    NOT NULL,
      PRIMARY KEY (code, date)
    )
  `);
  return db;
}

function insertOhlcv(db: Database, code: string, date: string, close: number): void {
  db.prepare(
    `INSERT OR REPLACE INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
  ).run(code, date, close, close, close, close, 10000);
}

function insertClaim(
  db: Database,
  opts: {
    stock: string;
    direction: "bullish" | "bearish" | "neutral";
    targetPrice: number | null;
    creationPrice: number | null;
    confidence: number;
    resolutionDate: string;
  },
): number {
  const result = db
    .prepare(
      `INSERT INTO prediction_claims
        (stock, agent_id, claim_text, direction, target_price, creation_price,
         confidence, resolution_date)
       VALUES (?, 'test-agent', ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      opts.stock,
      `${opts.stock}-${opts.direction}-${opts.resolutionDate}`,
      opts.direction,
      opts.targetPrice,
      opts.creationPrice,
      opts.confidence,
      opts.resolutionDate,
    );
  return result.lastInsertRowid as number;
}

function getClaim(db: Database, id: number) {
  return db
    .prepare("SELECT * FROM prediction_claims WHERE id=?")
    .get(id) as {
    resolution_outcome: number | null;
    actual_price: number | null;
    brier_score: number | null;
    resolved_at: string | null;
    is_excluded: number;
  };
}

/** Returns a past Monday (always a weekday) N weeks ago as YYYY-MM-DD */
function pastMonday(weeksAgo: number): string {
  const d = new Date();
  // Rewind to last Monday
  const dayOfWeek = d.getUTCDay(); // 0=Sun, 1=Mon...
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  d.setUTCDate(d.getUTCDate() - daysToMonday - weeksAgo * 7);
  return d.toISOString().slice(0, 10);
}

/** Returns a past Saturday (always a weekend) N weeks ago as YYYY-MM-DD */
function pastSaturday(weeksAgo: number): string {
  const d = new Date();
  const dayOfWeek = d.getUTCDay();
  const daysToSaturday = dayOfWeek === 6 ? 0 : (6 - dayOfWeek + 7) % 7;
  d.setUTCDate(d.getUTCDate() - daysToSaturday - weeksAgo * 7);
  return d.toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// LEG-1: RESOLVER — nearest-trading-day OHLCV match
// ─────────────────────────────────────────────────────────────────────────────

describe("LEG-1: Resolver — nearest-trading-day OHLCV match", () => {
  it("getClosePriceNearestTradingDay: returns prior-bar close when exact date missing (weekend resolution_date)", () => {
    const db = makeDb();
    const saturday = pastSaturday(2);
    // Insert bar for Friday (day before Saturday)
    const friday = new Date(saturday + "T00:00:00Z");
    friday.setUTCDate(friday.getUTCDate() - 1);
    const fridayStr = friday.toISOString().slice(0, 10);

    insertOhlcv(db, "VIC", fridayStr, 55000);

    const result = getClosePriceNearestTradingDay(db, "VIC", saturday);
    expect(result).toBe(55000);
  });

  it("getClosePriceNearestTradingDay: exact trading-day match still works", () => {
    const db = makeDb();
    const monday = pastMonday(2);
    insertOhlcv(db, "VCB", monday, 88000);

    const result = getClosePriceNearestTradingDay(db, "VCB", monday);
    expect(result).toBe(88000);
  });

  it("getClosePriceNearestTradingDay: falls back to next bar when no prior bar exists", () => {
    const db = makeDb();
    const saturday = pastSaturday(2);
    // Only insert bar for the Monday after
    const monday = new Date(saturday + "T00:00:00Z");
    monday.setUTCDate(monday.getUTCDate() + 2);
    const mondayStr = monday.toISOString().slice(0, 10);
    insertOhlcv(db, "HPG", mondayStr, 30000);

    const result = getClosePriceNearestTradingDay(db, "HPG", saturday);
    expect(result).toBe(30000);
  });

  it("getClosePriceNearestTradingDay: returns null when no bar within lookforward window", () => {
    const db = makeDb(); // empty DB
    const result = getClosePriceNearestTradingDay(db, "FPT", "2026-05-16");
    expect(result).toBeNull();
  });

  it("weekend-landing resolution_date resolves via runPredictionResolution (end-to-end)", async () => {
    // id 6/7 live case: resolution_date = Saturday, bar exists on Friday
    const db = makeDb();
    const saturday = pastSaturday(2);
    const friday = new Date(saturday + "T00:00:00Z");
    friday.setUTCDate(friday.getUTCDate() - 1);
    const fridayStr = friday.toISOString().slice(0, 10);

    const id = insertClaim(db, {
      stock: "VIC",
      direction: "bullish",
      targetPrice: 50000,
      creationPrice: 45000,
      confidence: 0.7,
      resolutionDate: saturday, // weekend — no exact bar
    });
    insertOhlcv(db, "VIC", fridayStr, 55000); // 55000 >= 50000 → HIT

    const result = await runPredictionResolution(db);

    expect(result.resolved).toBe(1);
    const row = getClaim(db, id);
    expect(row.resolution_outcome).toBe(1);
    expect(row.actual_price).toBe(55000);
    expect(row.resolved_at).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LEG-2: PRODUCER — addTradingDays skips weekends/holidays
// ─────────────────────────────────────────────────────────────────────────────

describe("LEG-2: Producer — addTradingDays always lands on a trading day", () => {
  it("addTradingDays(5) from a Monday lands on a trading day", () => {
    const monday = pastMonday(4); // a past Monday
    const result = addTradingDays(monday, 5);
    const tradingInfo = isVnTradingDay(result);
    // Should land on the following Monday (5 trading days forward)
    expect(tradingInfo.is_trading_day).toBe(true);
  });

  it("addTradingDays(10) from any date lands on a trading day", () => {
    const start = pastMonday(6);
    const result = addTradingDays(start, 10);
    expect(isVnTradingDay(result).is_trading_day).toBe(true);
  });

  it("addTradingDays(20) from any date lands on a trading day", () => {
    const start = pastMonday(8);
    const result = addTradingDays(start, 20);
    expect(isVnTradingDay(result).is_trading_day).toBe(true);
  });

  it("addTradingDays never returns a Saturday", () => {
    // Test from Thursday — 1 trading day forward = Friday (not Saturday)
    const thursday = pastMonday(2);
    const thrDate = new Date(thursday + "T00:00:00Z");
    thrDate.setUTCDate(thrDate.getUTCDate() + 3); // Monday + 3 = Thursday
    const thuStr = thrDate.toISOString().slice(0, 10);
    const result = addTradingDays(thuStr, 1);
    const dayOfWeek = new Date(result + "T00:00:00Z").getUTCDay();
    expect(dayOfWeek).not.toBe(6); // not Saturday
    expect(dayOfWeek).not.toBe(0); // not Sunday
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LEG-3: NEUTRAL-BAND — evaluateOutcome and runPredictionResolution
// ─────────────────────────────────────────────────────────────────────────────

describe("LEG-3: Neutral-band rule", () => {
  describe("evaluateOutcome — neutral direction", () => {
    it("neutral with creation_price, move < NEUTRAL_BAND_PCT → HIT (1)", () => {
      // 1% move < 2% band → HIT
      const creationPrice = 100000;
      const actualPrice = 101000; // +1%
      expect(evaluateOutcome(actualPrice, "neutral", null, creationPrice)).toBe(1);
    });

    it("neutral with creation_price, move >= NEUTRAL_BAND_PCT → MISS (0)", () => {
      // 3% move >= 2% band → MISS
      const creationPrice = 100000;
      const actualPrice = 103000; // +3%
      expect(evaluateOutcome(actualPrice, "neutral", null, creationPrice)).toBe(0);
    });

    it("neutral with creation_price, downward move < band → HIT (absolute value)", () => {
      // -1% move → |−1%| < 2% → HIT
      const creationPrice = 100000;
      const actualPrice = 99000; // -1%
      expect(evaluateOutcome(actualPrice, "neutral", null, creationPrice)).toBe(1);
    });

    it("neutral with creation_price, downward move >= band → MISS", () => {
      // -2.5% → MISS
      const creationPrice = 100000;
      const actualPrice = 97500; // -2.5%
      expect(evaluateOutcome(actualPrice, "neutral", null, creationPrice)).toBe(0);
    });

    it("neutral with creation_price=NULL → 'excluded' sentinel", () => {
      expect(evaluateOutcome(105000, "neutral", null, null)).toBe("excluded");
    });

    it("NEUTRAL_BAND_PCT is 2.0 (config value, not hardcoded)", () => {
      // Verify the config constant is accessible and has the expected default
      expect(NEUTRAL_BAND_PCT).toBe(2.0);
    });
  });

  describe("evaluateOutcome — bullish/bearish unchanged", () => {
    it("bullish with target: actual >= target → 1", () => {
      expect(evaluateOutcome(110, "bullish", 100, 90)).toBe(1);
    });

    it("bullish with target: actual < target → 0", () => {
      expect(evaluateOutcome(90, "bullish", 100, 95)).toBe(0);
    });

    it("bearish with target: actual <= target → 1", () => {
      expect(evaluateOutcome(90, "bearish", 100, 110)).toBe(1);
    });

    it("bearish with target: actual > target → 0", () => {
      expect(evaluateOutcome(110, "bearish", 100, 90)).toBe(0);
    });

    it("bullish direction-only (no target): actual > creation → 1", () => {
      expect(evaluateOutcome(110, "bullish", null, 100)).toBe(1);
    });

    it("bearish direction-only (no target): actual < creation → 1", () => {
      expect(evaluateOutcome(90, "bearish", null, 100)).toBe(1);
    });
  });

  describe("runPredictionResolution — neutral-band end-to-end", () => {
    it("neutral claim within band: resolves outcome=1 (HIT)", async () => {
      const db = makeDb();
      const saturday = pastSaturday(2);
      const friday = new Date(saturday + "T00:00:00Z");
      friday.setUTCDate(friday.getUTCDate() - 1);
      const fridayStr = friday.toISOString().slice(0, 10);

      const creationPrice = 100000;
      const actualPrice = 101000; // +1% → within 2% band → HIT
      const id = insertClaim(db, {
        stock: "VNINDEX",
        direction: "neutral",
        targetPrice: null,
        creationPrice,
        confidence: 0.5,
        resolutionDate: fridayStr,
      });
      insertOhlcv(db, "VNINDEX", fridayStr, actualPrice);

      const result = await runPredictionResolution(db);

      expect(result.resolved).toBe(1);
      expect(result.excluded).toBe(0);
      const row = getClaim(db, id);
      expect(row.resolution_outcome).toBe(1);
      expect(row.actual_price).toBe(actualPrice);
    });

    it("neutral claim outside band: resolves outcome=0 (MISS)", async () => {
      const db = makeDb();
      const monday = pastMonday(2);
      const creationPrice = 100000;
      const actualPrice = 105000; // +5% → outside 2% band → MISS
      const id = insertClaim(db, {
        stock: "GAS",
        direction: "neutral",
        targetPrice: null,
        creationPrice,
        confidence: 0.5,
        resolutionDate: monday,
      });
      insertOhlcv(db, "GAS", monday, actualPrice);

      const result = await runPredictionResolution(db);

      expect(result.resolved).toBe(1);
      expect(result.excluded).toBe(0);
      const row = getClaim(db, id);
      expect(row.resolution_outcome).toBe(0);
    });

    it("neutral claim with creation_price=NULL: marks is_excluded=1 (legacy FPT case)", async () => {
      // Replicates id=1 (FPT, neutral, creation_price=NULL) from live evidence
      const db = makeDb();
      const monday = pastMonday(2);
      const id = insertClaim(db, {
        stock: "FPT",
        direction: "neutral",
        targetPrice: null,
        creationPrice: null, // legacy row — no baseline
        confidence: 0.5,
        resolutionDate: monday,
      });
      insertOhlcv(db, "FPT", monday, 95000);

      const result = await runPredictionResolution(db);

      expect(result.excluded).toBe(1);
      expect(result.resolved).toBe(0);
      const row = getClaim(db, id);
      // is_excluded=1 + resolved_at set — satisfies invariant
      expect(row.is_excluded).toBe(1);
      expect(row.resolved_at).not.toBeNull();
      // resolution_outcome stays NULL (excluded — not 0 or 1)
      // but is_excluded=1 satisfies the "explicit excluded status" branch of the invariant
      expect(row.resolution_outcome).toBeNull();
    });

    it("INVARIANT: is_excluded=1 claims not re-processed on subsequent runs", async () => {
      const db = makeDb();
      const monday = pastMonday(2);
      const id = insertClaim(db, {
        stock: "FPT",
        direction: "neutral",
        targetPrice: null,
        creationPrice: null,
        confidence: 0.5,
        resolutionDate: monday,
      });
      insertOhlcv(db, "FPT", monday, 95000);

      // First run — excludes the claim
      await runPredictionResolution(db);

      // Second run — should not re-process (is_excluded=1 filters it out)
      const result2 = await runPredictionResolution(db);
      expect(result2.excluded).toBe(0);
      expect(result2.resolved).toBe(0);
      expect(result2.skipped).toBe(0);

      // Row unchanged
      const row = getClaim(db, id);
      expect(row.is_excluded).toBe(1);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cross-cutting: HARD INVARIANT — no terminal path leaves resolution_outcome
// NULL once resolved_at is stamped, unless is_excluded=1
// ─────────────────────────────────────────────────────────────────────────────

describe("HARD INVARIANT: every resolved claim has outcome OR is_excluded=1", () => {
  it("bullish claim with OHLCV → resolution_outcome non-NULL after resolution", async () => {
    const db = makeDb();
    const monday = pastMonday(2);
    const id = insertClaim(db, {
      stock: "VCB",
      direction: "bullish",
      targetPrice: 80000,
      creationPrice: 75000,
      confidence: 0.7,
      resolutionDate: monday,
    });
    insertOhlcv(db, "VCB", monday, 85000);

    await runPredictionResolution(db);

    const row = getClaim(db, id);
    expect(row.resolved_at).not.toBeNull();
    // Invariant: if resolved_at is set, either resolution_outcome is non-null OR is_excluded=1
    const satisfiesInvariant =
      row.resolution_outcome !== null || row.is_excluded === 1;
    expect(satisfiesInvariant).toBe(true);
  });

  it("unresolvable claim (past retry window) → is_excluded=1 satisfies invariant", async () => {
    const db = makeDb();
    // 10 days ago, no OHLCV — past 5-day retry window
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
    const dateStr = tenDaysAgo.toISOString().slice(0, 10);

    const id = insertClaim(db, {
      stock: "MWG",
      direction: "bullish",
      targetPrice: 50000,
      creationPrice: 45000,
      confidence: 0.6,
      resolutionDate: dateStr,
    });
    // No OHLCV inserted

    await runPredictionResolution(db);

    const row = getClaim(db, id);
    expect(row.resolved_at).not.toBeNull();
    // is_excluded=1 satisfies the invariant for unresolvable claims
    expect(row.is_excluded).toBe(1);
  });

  it("neutral claim with creation_price=NULL → is_excluded=1 + resolved_at set", async () => {
    const db = makeDb();
    const monday = pastMonday(2);
    const id = insertClaim(db, {
      stock: "FPT",
      direction: "neutral",
      targetPrice: null,
      creationPrice: null,
      confidence: 0.5,
      resolutionDate: monday,
    });
    insertOhlcv(db, "FPT", monday, 90000);

    await runPredictionResolution(db);

    const row = getClaim(db, id);
    expect(row.resolved_at).not.toBeNull();
    expect(row.is_excluded).toBe(1);
    // Invariant satisfied via is_excluded=1
    const satisfiesInvariant =
      row.resolution_outcome !== null || row.is_excluded === 1;
    expect(satisfiesInvariant).toBe(true);
  });
});
