/**
 * Task 1423b — FRED API Fetcher for Fed Funds Rate
 *
 * Tests for fetchFedFundsRate() in src/infrastructure/fetchers/fredApi.ts.
 *
 * Endpoint: https://fred.stlouisfed.org/graph/fredgraph.csv?id=FEDFUNDS
 * CSV format: DATE,VALUE header + rows — last row = most recent value.
 *
 * All HTTP calls are mocked — no real network traffic.
 * DB tests use an in-memory SQLite via local Database instances.
 *
 * Test IDs: FRED-01 through FRED-06
 */

import { Database } from "bun:sqlite";
import { describe, it, expect } from "bun:test";
import {
  fetchFedFundsRate,
  type FredHttpClient,
} from "../infrastructure/fetchers/fredApi.js";

// ---------------------------------------------------------------------------
// In-memory DB factory
// ---------------------------------------------------------------------------

function makeTestDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE tracked_indicators (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      indicator    TEXT NOT NULL,
      value        REAL NOT NULL,
      unit         TEXT NOT NULL DEFAULT '',
      source       TEXT NOT NULL DEFAULT '',
      extracted_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

// ---------------------------------------------------------------------------
// Mock CSV builders
// ---------------------------------------------------------------------------

/** Builds a valid FRED CSV response with a given last-row rate value. */
function buildFredCsv(rate: number): string {
  return [
    "DATE,VALUE",
    "2024-01-01,5.33",
    "2024-02-01,5.33",
    "2025-01-01,4.33",
    `2025-03-01,${rate}`,
  ].join("\n");
}

/** CSV with only a header row — no data rows. */
const EMPTY_CSV = "DATE,VALUE\n";

/** Completely malformed response (not a CSV). */
const MALFORMED_RESPONSE = "<html><body>error</body></html>";

// ---------------------------------------------------------------------------
// Mock HTTP client factories
// ---------------------------------------------------------------------------

function mockClient(csvBody: string): FredHttpClient {
  return {
    async get(_url: string): Promise<string> {
      return csvBody;
    },
  };
}

function failingClient(errorMsg = "Network timeout"): FredHttpClient {
  return {
    async get(_url: string): Promise<string> {
      throw new Error(errorMsg);
    },
  };
}

function httpErrorClient(status = 500): FredHttpClient {
  return {
    async get(_url: string): Promise<string> {
      throw new Error(`HTTP ${status} Internal Server Error`);
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Task 1423b — FRED API Fed Funds Rate Fetcher", () => {
  // ── FRED-01: Valid CSV → correct rate parsed and stored ─────────────────
  it("FRED-01: parses last CSV row and stores fed_funds_rate in tracked_indicators", async () => {
    const db = makeTestDb();
    const rate = await fetchFedFundsRate(mockClient(buildFredCsv(4.33)), db);

    expect(rate).toBeCloseTo(4.33, 2);

    const row = db
      .query<{ indicator: string; value: number; unit: string; source: string }, []>(
        "SELECT indicator, value, unit, source FROM tracked_indicators WHERE indicator = 'fed_funds_rate' LIMIT 1",
      )
      .get();

    expect(row).not.toBeNull();
    expect(row!.indicator).toBe("fed_funds_rate");
    expect(row!.value).toBeCloseTo(4.33, 2);
    expect(row!.unit).toBe("%");
    expect(row!.source).toBe("fred");

    db.close();
  });

  // ── FRED-02: HTTP 500 error → returns null, no throw ───────────────────
  it("FRED-02: returns null on HTTP 500 and does not throw", async () => {
    const db = makeTestDb();
    let threw = false;
    let result: number | null = null;

    try {
      result = await fetchFedFundsRate(httpErrorClient(500), db);
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(result).toBeNull();

    // Nothing stored in DB on error
    const count = db
      .query<{ cnt: number }, []>(
        "SELECT COUNT(*) as cnt FROM tracked_indicators WHERE indicator = 'fed_funds_rate'",
      )
      .get();
    expect(count!.cnt).toBe(0);

    db.close();
  });

  // ── FRED-03: Network timeout → returns null, no throw ──────────────────
  it("FRED-03: returns null on network timeout and does not throw", async () => {
    const db = makeTestDb();
    let threw = false;
    let result: number | null = null;

    try {
      result = await fetchFedFundsRate(failingClient("Network timeout"), db);
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(result).toBeNull();

    db.close();
  });

  // ── FRED-04: CSV has header but no data rows → returns null ────────────
  it("FRED-04: returns null when CSV contains header but no data rows", async () => {
    const db = makeTestDb();
    const result = await fetchFedFundsRate(mockClient(EMPTY_CSV), db);

    expect(result).toBeNull();

    const count = db
      .query<{ cnt: number }, []>(
        "SELECT COUNT(*) as cnt FROM tracked_indicators WHERE indicator = 'fed_funds_rate'",
      )
      .get();
    expect(count!.cnt).toBe(0);

    db.close();
  });

  // ── FRED-05: Malformed non-CSV response → returns null ─────────────────
  it("FRED-05: returns null when response is not a valid CSV", async () => {
    const db = makeTestDb();
    const result = await fetchFedFundsRate(mockClient(MALFORMED_RESPONSE), db);

    expect(result).toBeNull();

    db.close();
  });

  // ── FRED-06: Realistic rate value stored correctly ──────────────────────
  it("FRED-06: stores realistic Fed Funds Rate value (5.33) with correct metadata", async () => {
    const db = makeTestDb();
    const rate = await fetchFedFundsRate(mockClient(buildFredCsv(5.33)), db);

    expect(rate).toBeCloseTo(5.33, 2);

    const row = db
      .query<{ value: number; source: string; unit: string }, []>(
        "SELECT value, source, unit FROM tracked_indicators WHERE indicator = 'fed_funds_rate' ORDER BY id DESC LIMIT 1",
      )
      .get();

    expect(row).not.toBeNull();
    expect(row!.value).toBeCloseTo(5.33, 2);
    expect(row!.source).toBe("fred");
    expect(row!.unit).toBe("%");

    db.close();
  });
});
