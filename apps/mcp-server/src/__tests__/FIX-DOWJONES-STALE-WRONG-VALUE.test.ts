/**
 * FIX-DOWJONES-STALE-WRONG-VALUE — dow_jones served 23750 vs real DJIA ~42k
 *
 * Root cause (verified at source against the live named-volume DB,
 * 2026-07-25): tracked_indicators had dow_jones rows written by the
 * regex-based news-mining path (source='tradingeconomics' — actually the
 * MarketWatch/Google-News RSS fallback feeds, still tagged "tradingeconomics"
 * for compat) oscillating 10604 → 23750 → 23807 → 48221 → 76848 within one
 * week (last write 2026-04-13). The live `get_system_status` MCP tool's
 * "Auto-tracked Indicators" section ran its OWN raw, unguarded "latest row
 * per indicator" query (no staleness check, no plausibility check) and was
 * observed serving `dow_jones  23750  (49 data points)` as if current — the
 * exact value + magnitude flagged in report 3237.
 *
 * Fix (3 layers):
 *   1. indicatorPlausibility.ts — generic, shared plausibility-band gate
 *      (write-time, fail CLOSED) used by every tracked_indicators writer.
 *   2. commodityTracker.ts — retired the unreliable dow_jones news-mining
 *      regex; yahooFinance.ts now mirrors a live Yahoo ^DJI fetch instead
 *      (single source of truth), gated through (1) before write.
 *   3. systemTools.ts get_system_status — "Auto-tracked Indicators" now uses
 *      the staleness-aware listTrackedIndicatorsFromDb() (already proven in
 *      DSI-MACRO-PHANTOM-STALE-GUARD) instead of its own unguarded query, so
 *      a stale row is labelled [STALE] rather than presented as current.
 *
 * Tests:
 *   G-1..G-4: indicatorPlausibility — dow_jones band accept/reject
 *   G-5:      commodityTracker — dow_jones news-mining pattern is retired
 *   G-6:      commodityTracker — sibling patterns (gold) still work (no regression)
 *   G-7:      yahooFinance.fetchDowJonesIndex — parses ^DJI regularMarketPrice
 *   G-8:      yahooFinance.storeDowJonesIndex — writes a plausible value
 *   G-9:      yahooFinance.storeDowJonesIndex — REJECTS an out-of-band value,
 *             fail CLOSED (no row written, no throw)
 *   G-10:     yahooFinance.storeDowJonesIndex — repeated calls dedup to 1 row
 *   G-11:     systemTools get_system_status — stale dow_jones row is tagged [STALE]
 *   G-12:     systemTools get_system_status — fresh row is NOT tagged [STALE]
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import {
  extractAndStoreIndicators,
} from "../infrastructure/db/commodityTracker.js";
import { isPlausibleIndicatorValue } from "../infrastructure/db/indicatorPlausibility.js";
import {
  fetchDowJonesIndex,
  storeDowJonesIndex,
  type HttpClient,
} from "../infrastructure/fetchers/yahooFinance.js";
import { getSystemStatus } from "../interface/mcp/tools/system/systemTools.js";

// ─────────────────────────────────────────────────────────────────────────────
// G-1..G-4: indicatorPlausibility — dow_jones band
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-DOWJONES-STALE-WRONG-VALUE — indicatorPlausibility band", () => {
  it("G-1: rejects the historical phantom value 23750 (real DJIA ~42k)", () => {
    expect(isPlausibleIndicatorValue("dow_jones", 23750)).toBe(false);
  });

  it("G-2: rejects the other observed garbage magnitudes (10604, 76848)", () => {
    expect(isPlausibleIndicatorValue("dow_jones", 10604)).toBe(false);
    expect(isPlausibleIndicatorValue("dow_jones", 76848)).toBe(false);
  });

  it("G-3: accepts a plausible current-regime DJIA level (~42000)", () => {
    expect(isPlausibleIndicatorValue("dow_jones", 42000)).toBe(true);
  });

  it("G-4: an indicator with no configured band is always plausible (no gate)", () => {
    expect(isPlausibleIndicatorValue("some_unknown_indicator", 999999999)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// G-5..G-6: commodityTracker — news-mining pattern retired, siblings unaffected
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-DOWJONES-STALE-WRONG-VALUE — commodityTracker news-mining retirement", () => {
  beforeEach(async () => {
    closeDb();
    await initDatabase();
    getDb().exec(`DELETE FROM tracked_indicators`);
  });

  it("G-5: 'Dow jones hit 23,750 points today' no longer extracts/stores dow_jones", () => {
    const out = extractAndStoreIndicators(
      "Wall Street slid as the Dow jones hit 23,750 points today amid recession fears.",
      "tradingeconomics",
    );
    expect(out.find((e) => e.indicator === "dow_jones")).toBeUndefined();

    const rows = getDb()
      .query<{ cnt: number }, []>(
        `SELECT COUNT(*) as cnt FROM tracked_indicators WHERE indicator = 'dow_jones'`,
      )
      .get();
    expect(rows?.cnt).toBe(0);
  });

  it("G-6: sibling extraction (gold) is unaffected by the dow_jones pattern removal", () => {
    const out = extractAndStoreIndicators(
      "Gold hit $2,400/oz this morning amid risk-off flows.",
      "reuters",
    );
    expect(out.find((e) => e.indicator === "gold_usd_oz")?.value).toBe(2400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// G-7: yahooFinance.fetchDowJonesIndex
// ─────────────────────────────────────────────────────────────────────────────

function buildYahooJsonResponse(price: number): string {
  return JSON.stringify({
    chart: { result: [{ meta: { regularMarketPrice: price, symbol: "^DJI" } }], error: null },
  });
}

function symbolAwareClient(responses: Record<string, string | Error>): HttpClient {
  return {
    async get(url: string): Promise<string> {
      for (const [symbol, response] of Object.entries(responses)) {
        if (url.includes(symbol)) {
          if (response instanceof Error) throw response;
          return response;
        }
      }
      throw new Error(`No mock for URL: ${url}`);
    },
  };
}

describe("FIX-DOWJONES-STALE-WRONG-VALUE — yahooFinance.fetchDowJonesIndex", () => {
  it("G-7: parses regularMarketPrice from the ^DJI chart API payload", async () => {
    const client = symbolAwareClient({ "%5EDJI": buildYahooJsonResponse(42150.75) });
    const result = await fetchDowJonesIndex(client);
    expect(result).toBeCloseTo(42150.75, 2);
  });

  it("G-7b: returns null on fetch failure (never throws)", async () => {
    const client = symbolAwareClient({ "%5EDJI": new Error("network timeout") });
    const result = await fetchDowJonesIndex(client);
    expect(result).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// G-8..G-10: yahooFinance.storeDowJonesIndex — write-time fail-closed gate
// ─────────────────────────────────────────────────────────────────────────────

function makeTrackedIndicatorsDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE tracked_indicators (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      indicator TEXT NOT NULL,
      value REAL NOT NULL,
      unit TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT '',
      extracted_at TEXT NOT NULL
    );
  `);
  return db;
}

describe("FIX-DOWJONES-STALE-WRONG-VALUE — yahooFinance.storeDowJonesIndex", () => {
  it("G-8: writes a plausible value into tracked_indicators (source='yahoo')", () => {
    const db = makeTrackedIndicatorsDb();
    const written = storeDowJonesIndex(42150, "2026-07-25T02:00:00.000Z", db);
    expect(written).toBe(true);

    const row = db
      .query<{ value: number; source: string }, []>(
        `SELECT value, source FROM tracked_indicators WHERE indicator = 'dow_jones'`,
      )
      .get();
    expect(row?.value).toBe(42150);
    expect(row?.source).toBe("yahoo");
    db.close();
  });

  it("G-9: REJECTS an out-of-band synthetic value — fail CLOSED, no row written, no throw", () => {
    const db = makeTrackedIndicatorsDb();

    expect(() => storeDowJonesIndex(23750, "2026-07-25T02:00:00.000Z", db)).not.toThrow();
    const written = storeDowJonesIndex(23750, "2026-07-25T02:00:00.000Z", db);
    expect(written).toBe(false);

    const rows = db
      .query<{ cnt: number }, []>(
        `SELECT COUNT(*) as cnt FROM tracked_indicators WHERE indicator = 'dow_jones'`,
      )
      .get();
    expect(rows?.cnt).toBe(0);
    db.close();
  });

  it("G-9b: also rejects an absurdly high synthetic out-of-band value", () => {
    const db = makeTrackedIndicatorsDb();
    const written = storeDowJonesIndex(999999, "2026-07-25T02:00:00.000Z", db);
    expect(written).toBe(false);
    db.close();
  });

  it("G-10: repeated calls dedup to exactly 1 dow_jones/yahoo row (latest wins)", () => {
    const db = makeTrackedIndicatorsDb();
    storeDowJonesIndex(41800, "2026-07-25T01:00:00.000Z", db);
    storeDowJonesIndex(42150, "2026-07-25T02:00:00.000Z", db);
    storeDowJonesIndex(42300, "2026-07-25T03:00:00.000Z", db);

    const rows = db
      .query<{ cnt: number }, []>(
        `SELECT COUNT(*) as cnt FROM tracked_indicators WHERE indicator = 'dow_jones' AND source = 'yahoo'`,
      )
      .get();
    expect(rows?.cnt).toBe(1);

    const latest = db
      .query<{ value: number }, []>(
        `SELECT value FROM tracked_indicators WHERE indicator = 'dow_jones' AND source = 'yahoo'`,
      )
      .get();
    expect(latest?.value).toBe(42300);
    db.close();
  });

  it("G-10b: null fetch result is a no-op (no row written)", () => {
    const db = makeTrackedIndicatorsDb();
    const written = storeDowJonesIndex(null, "2026-07-25T02:00:00.000Z", db);
    expect(written).toBe(false);
    const rows = db
      .query<{ cnt: number }, []>(`SELECT COUNT(*) as cnt FROM tracked_indicators`)
      .get();
    expect(rows?.cnt).toBe(0);
    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// G-11..G-12: systemTools get_system_status — [STALE] annotation
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-DOWJONES-STALE-WRONG-VALUE — get_system_status Auto-tracked Indicators", () => {
  beforeEach(async () => {
    closeDb();
    await initDatabase();
    getDb().exec(`DELETE FROM tracked_indicators`);
  });

  it("G-11: a stale dow_jones row (>4h old) is shown WITH a [STALE] tag, not as bare 'current'", async () => {
    const db = getDb();
    const staleAt = new Date(Date.now() - 6 * 3600_000).toISOString(); // 6h old
    db.prepare(
      `INSERT INTO tracked_indicators (indicator, value, unit, source, extracted_at)
       VALUES ('dow_jones', 23750, 'points', 'tradingeconomics', ?)`,
    ).run(staleAt);

    const result = await getSystemStatus({ includeErrors: true, errorLines: 5 });
    const section = result.slice(result.indexOf("--- Auto-tracked Indicators ---"));
    const line = section.split("\n").find((l) => l.includes("dow_jones"));

    expect(line).toBeDefined();
    expect(line).toContain("[STALE]");
  });

  it("G-12: a fresh dow_jones row (<4h old) is shown WITHOUT a [STALE] tag", async () => {
    const db = getDb();
    const freshAt = new Date(Date.now() - 1 * 3600_000).toISOString(); // 1h old
    db.prepare(
      `INSERT INTO tracked_indicators (indicator, value, unit, source, extracted_at)
       VALUES ('dow_jones', 42150, 'points', 'yahoo', ?)`,
    ).run(freshAt);

    const result = await getSystemStatus({ includeErrors: true, errorLines: 5 });
    const section = result.slice(result.indexOf("--- Auto-tracked Indicators ---"));
    const line = section.split("\n").find((l) => l.includes("dow_jones"));

    expect(line).toBeDefined();
    expect(line).not.toContain("[STALE]");
  });
});

afterAll(() => {
  closeDb();
});
