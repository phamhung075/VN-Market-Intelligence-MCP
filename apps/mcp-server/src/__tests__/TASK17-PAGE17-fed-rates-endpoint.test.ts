/**
 * TASK17-PAGE17 — GET /api/fed-rates
 *
 * US Fed EFFR/IORB liquidity spread time-series endpoint.
 * Pure-function unit tests on in-code fixture data.
 * Does NOT hit the real DB — all data seeded into in-memory SQLite via
 * initDatabase() (same pattern as TASK17-PAGE16).
 *
 * AC-a: handler builds correct payload shape from a fixture samples array
 *        (series length === sampleCount, each row has spread === round(effr-iorb,4)).
 * AC-b: series length === sampleCount and each series row has spread === round(effr-iorb,4).
 * AC-c: empty samples → honest empty-state (asOf null, sampleCount 0, series []), NOT a throw.
 * AC-d: trend30d passes through from the domain fn.
 * AC-e: with a ≥30-sample fixture where spreads are ~flat, trend30d === "stable".
 *
 * DDD layer: interface + infrastructure tested together at the handler seam.
 * Isolation: in-memory SQLite, reset per test via initDatabase().
 */

// Must be set before importing schema module
Bun.env["DB_PATH"] = ":memory:";
if (Bun.env["DB_PATH"] !== ":memory:") {
  throw new Error(`[TASK17-PAGE17] DB_PATH must be ':memory:', got: ${Bun.env["DB_PATH"]}`);
}

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import {
  handleGetFedRates,
  handleGetFedRatesHttp,
  roundDp,
  type FedRatesResponse,
  type FedRateSeriesRow,
} from "../interface/mcp/routes/fedRatesHandler.js";

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  closeDb();
  await initDatabase();
});
afterEach(() => {
  closeDb();
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeMockRes() {
  const mock = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: "",
    writeHead(status: number, headers?: Record<string, string>) {
      this.statusCode = status;
      if (headers) Object.assign(this.headers, headers);
    },
    end(data: string) {
      this.body = data;
    },
  };
  return mock;
}

function makeFakeReq(
  url: string = "/api/fed-rates",
  method: string = "GET",
): import("node:http").IncomingMessage {
  return { url, method } as import("node:http").IncomingMessage;
}

/**
 * Insert a single fred_series_daily row.
 */
function insertFredRow(opts: {
  series: "EFFR" | "IORB";
  date: string;
  value: number;
  fetched_at?: string;
}): void {
  const db = getDb();
  const fetched_at = opts.fetched_at ?? "2026-06-09T12:00:00.000Z";
  db.prepare(
    `INSERT OR IGNORE INTO fred_series_daily (series, date, value, fetched_at)
     VALUES (?, ?, ?, ?)`,
  ).run(opts.series, opts.date, opts.value, fetched_at);
}

/**
 * Seed N paired EFFR+IORB rows at a fixed small spread (~flat).
 * Dates are placed WITHIN the 180-day lookback window (counting back from today).
 * effr = 5.33, iorb = 5.40 → spread = -0.07 for all rows (flat/stable).
 *
 * @param n  Number of paired rows (days).
 */
function seedFlatSamples(n: number): void {
  for (let i = 0; i < n; i++) {
    // Place rows starting from (n-1) days ago back to today, all within 180-day window.
    const base = new Date();
    base.setUTCDate(base.getUTCDate() - (n - 1 - i));
    const date = base.toISOString().slice(0, 10);
    insertFredRow({ series: "EFFR", date, value: 5.33 });
    insertFredRow({ series: "IORB", date, value: 5.40 });
  }
}

/**
 * Seed a small realistic fixture corpus (3 paired rows).
 * EFFR and IORB values chosen so spread is non-trivially computable.
 */
function seedSmallFixture(): void {
  // Row 1
  insertFredRow({ series: "EFFR", date: "2026-03-01", value: 4.33 });
  insertFredRow({ series: "IORB", date: "2026-03-01", value: 4.40 });
  // Row 2
  insertFredRow({ series: "EFFR", date: "2026-03-02", value: 4.32 });
  insertFredRow({ series: "IORB", date: "2026-03-02", value: 4.40 });
  // Row 3 — latest
  insertFredRow({ series: "EFFR", date: "2026-03-03", value: 4.30 });
  insertFredRow({ series: "IORB", date: "2026-03-03", value: 4.40 });
}

// ─────────────────────────────────────────────────────────────────────────────
// roundDp helper
// ─────────────────────────────────────────────────────────────────────────────

describe("roundDp", () => {
  it("rounds to 4 decimal places", () => {
    expect(roundDp(0.123456789, 4)).toBe(0.1235);
  });

  it("exact value passes through unchanged", () => {
    expect(roundDp(-0.03, 4)).toBe(-0.03);
  });

  it("rounds 0 correctly", () => {
    expect(roundDp(0, 4)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-a + AC-b: handleGetFedRates — payload shape and series integrity
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK17-PAGE17 — handleGetFedRates payload shape (AC-a, AC-b)", () => {
  it("AC-a: response envelope has all required top-level fields", () => {
    seedSmallFixture();
    const body = handleGetFedRates(getDb());
    expect(typeof body.generatedAt).toBe("string");
    expect(typeof body.asOf === "string" || body.asOf === null).toBe(true);
    expect(typeof body.effr === "number" || body.effr === null).toBe(true);
    expect(typeof body.iorb === "number" || body.iorb === null).toBe(true);
    expect(typeof body.spread === "number" || body.spread === null).toBe(true);
    expect(typeof body.trend30d === "string" || body.trend30d === null).toBe(true);
    expect(typeof body.sampleCount).toBe("number");
    expect(Array.isArray(body.series)).toBe(true);
  });

  it("AC-a: asOf matches latest date in fixture", () => {
    seedSmallFixture();
    const body = handleGetFedRates(getDb());
    expect(body.asOf).toBe("2026-03-03");
  });

  it("AC-a: effr and iorb match latest row values", () => {
    seedSmallFixture();
    const body = handleGetFedRates(getDb());
    expect(body.effr).toBe(4.30);
    expect(body.iorb).toBe(4.40);
  });

  it("AC-b: series length === sampleCount", () => {
    seedSmallFixture();
    const body = handleGetFedRates(getDb());
    expect(body.series).toHaveLength(body.sampleCount);
    expect(body.sampleCount).toBe(3);
  });

  it("AC-b: series ordered ascending by date", () => {
    seedSmallFixture();
    const body = handleGetFedRates(getDb());
    expect(body.series[0]!.date).toBe("2026-03-01");
    expect(body.series[2]!.date).toBe("2026-03-03");
  });

  it("AC-b: each series row has spread === round(effr-iorb, 4)", () => {
    seedSmallFixture();
    const body = handleGetFedRates(getDb());
    for (const row of body.series) {
      const expected = roundDp(row.effr - row.iorb, 4);
      expect(row.spread).toBe(expected);
    }
  });

  it("AC-b: series row has date, effr, iorb, spread fields", () => {
    seedSmallFixture();
    const body = handleGetFedRates(getDb());
    const row = body.series[0]!;
    expect("date" in row).toBe(true);
    expect("effr" in row).toBe(true);
    expect("iorb" in row).toBe(true);
    expect("spread" in row).toBe(true);
  });

  it("AC-b: spread rounded to 4dp (precision check)", () => {
    // effr=4.333333, iorb=4.400000 → effr-iorb=-0.0666666... → rounded 4dp = -0.0667
    insertFredRow({ series: "EFFR", date: "2026-04-01", value: 4.333333 });
    insertFredRow({ series: "IORB", date: "2026-04-01", value: 4.4 });
    const body = handleGetFedRates(getDb());
    expect(body.series[0]!.spread).toBe(-0.0667);
  });

  it("AC-a: generatedAt is a valid ISO 8601 string", () => {
    seedSmallFixture();
    const body = handleGetFedRates(getDb());
    expect(body.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-c: empty samples → honest empty-state
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK17-PAGE17 — empty-state (AC-c)", () => {
  it("AC-c: empty table → 200 status code", () => {
    const res = makeMockRes();
    handleGetFedRatesHttp(
      makeFakeReq(),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    expect(res.statusCode).toBe(200);
  });

  it("AC-c: empty table → asOf null", () => {
    const body = handleGetFedRates(getDb());
    expect(body.asOf).toBeNull();
  });

  it("AC-c: empty table → effr null", () => {
    const body = handleGetFedRates(getDb());
    expect(body.effr).toBeNull();
  });

  it("AC-c: empty table → iorb null", () => {
    const body = handleGetFedRates(getDb());
    expect(body.iorb).toBeNull();
  });

  it("AC-c: empty table → spread null", () => {
    const body = handleGetFedRates(getDb());
    expect(body.spread).toBeNull();
  });

  it("AC-c: empty table → trend30d null", () => {
    const body = handleGetFedRates(getDb());
    expect(body.trend30d).toBeNull();
  });

  it("AC-c: empty table → sampleCount 0", () => {
    const body = handleGetFedRates(getDb());
    expect(body.sampleCount).toBe(0);
  });

  it("AC-c: empty table → series is empty array", () => {
    const body = handleGetFedRates(getDb());
    expect(body.series).toHaveLength(0);
  });

  it("AC-c: empty table does NOT throw InsufficientDataError", () => {
    // This is the key safety guarantee: empty case returns 200, not 500
    expect(() => handleGetFedRates(getDb())).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-d: trend30d passes through from the domain fn
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK17-PAGE17 — trend30d pass-through (AC-d)", () => {
  it("AC-d: trend30d is null when fewer than 30 paired samples exist", () => {
    // Seed only 3 rows — domain fn returns trend30d=null for < 30 samples
    seedSmallFixture();
    const body = handleGetFedRates(getDb());
    expect(body.trend30d).toBeNull();
  });

  it("AC-d: trend30d is non-null string when ≥30 samples present", () => {
    seedFlatSamples(35);
    const body = handleGetFedRates(getDb());
    expect(typeof body.trend30d).toBe("string");
    const validTrends = ["widening", "narrowing", "stable"];
    expect(validTrends.includes(body.trend30d as string)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-e: ≥30 flat-spread fixture → trend30d === "stable"
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK17-PAGE17 — stable trend (AC-e)", () => {
  it("AC-e: 35 flat-spread samples → trend30d === 'stable'", () => {
    // All spreads are -0.07 (flat) → OLS slope ≈ 0 → "stable"
    seedFlatSamples(35);
    const body = handleGetFedRates(getDb());
    expect(body.trend30d).toBe("stable");
  });

  it("AC-e: sampleCount = 35 for 35-row fixture", () => {
    seedFlatSamples(35);
    const body = handleGetFedRates(getDb());
    expect(body.sampleCount).toBe(35);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// HTTP handler: method guard
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK17-PAGE17 — HTTP handler method guard", () => {
  it("405 on POST", () => {
    const res = makeMockRes();
    handleGetFedRatesHttp(
      makeFakeReq("/api/fed-rates", "POST"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    expect(res.statusCode).toBe(405);
  });

  it("200 on GET", () => {
    const res = makeMockRes();
    handleGetFedRatesHttp(
      makeFakeReq("/api/fed-rates", "GET"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    expect(res.statusCode).toBe(200);
  });

  it("Content-Type: application/json on 200", () => {
    const res = makeMockRes();
    handleGetFedRatesHttp(
      makeFakeReq(),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    expect(res.headers["Content-Type"]).toBe("application/json");
  });

  it("response body is valid JSON", () => {
    seedSmallFixture();
    const res = makeMockRes();
    handleGetFedRatesHttp(
      makeFakeReq(),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    expect(() => JSON.parse(res.body)).not.toThrow();
  });
});
