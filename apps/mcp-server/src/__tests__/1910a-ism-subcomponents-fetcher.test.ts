/**
 * Task 1910a — ISM Sub-Component Fetcher Integration Tests
 *
 * Tests for fetchFredIsmSubcomponents + parseFredIsmJson + buildFredIsmUrl.
 * Uses in-memory DB and mock HTTP client to avoid real network calls.
 *
 * 8 tests:
 *   T1 — URL builder: correct series_id + api_key in query string
 *   T2 — JSON parse: valid response → rows extracted
 *   T3 — JSON parse: "." values skipped
 *   T4 — JSON parse: empty/malformed response → null
 *   T5 — Fetcher: missing FRED_API_KEY → returns null
 *   T6 — Fetcher: all 4 series inserted into fred_series_daily
 *   T7 — Idempotency: second call with same data → 0 new rows (INSERT OR IGNORE)
 *   T8 — Fetcher: HTTP error → series in failed[] list
 */

import { Database } from "bun:sqlite";
import { describe, it, expect } from "bun:test";
import {
  buildFredIsmUrl,
  parseFredIsmJson,
  fetchFredIsmSubcomponents,
  ISM_SERIES,
  type IsmSeriesId,
} from "../infrastructure/fetchers/fredIsmSubcomponents.js";

// ---------------------------------------------------------------------------
// In-memory DB factory
// ---------------------------------------------------------------------------

function makeTestDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS fred_series_daily (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      series     TEXT NOT NULL,
      date       TEXT NOT NULL,
      value      REAL NOT NULL,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(series, date) ON CONFLICT IGNORE
    );
    CREATE INDEX IF NOT EXISTS idx_fred_series_date
      ON fred_series_daily(series, date);
  `);
  return db;
}

// ---------------------------------------------------------------------------
// Mock HTTP client factory
// ---------------------------------------------------------------------------

function makeMockResponse(seriesId: string, value: string, date: string): string {
  return JSON.stringify({
    observations: [
      { date, value },
      { date: "2025-03-01", value: "." }, // FRED missing-data placeholder
    ],
  });
}

function makeHttpClientWithData(
  responseMap: Partial<Record<IsmSeriesId, string>>,
  shouldFail?: IsmSeriesId[],
) {
  return {
    async get(url: string): Promise<string> {
      for (const [seriesId, body] of Object.entries(responseMap) as Array<[IsmSeriesId, string]>) {
        if (url.includes(`series_id=${seriesId}`)) {
          if (shouldFail && shouldFail.includes(seriesId)) {
            throw new Error(`HTTP 503 Service Unavailable`);
          }
          return body;
        }
      }
      throw new Error(`HTTP 404 Not Found`);
    },
  };
}

const NOOP_SLEEP = async (_ms: number): Promise<void> => {};

// ---------------------------------------------------------------------------
// T1 — URL builder
// ---------------------------------------------------------------------------

describe("T1 — buildFredIsmUrl: correct query string", () => {
  it("includes series_id in URL", () => {
    const url = buildFredIsmUrl("NAPMNO", "testkey123");
    expect(url).toContain("series_id=NAPMNO");
  });

  it("includes api_key in URL", () => {
    const url = buildFredIsmUrl("NAPMEMP", "mykey456");
    expect(url).toContain("api_key=mykey456");
  });

  it("includes file_type=json and sort_order=desc", () => {
    const url = buildFredIsmUrl("NAPMPI", "key");
    expect(url).toContain("file_type=json");
    expect(url).toContain("sort_order=desc");
    expect(url).toContain("limit=3");
  });

  it("uses FRED REST base endpoint", () => {
    const url = buildFredIsmUrl("NAPMBI", "key");
    expect(url).toContain("api.stlouisfed.org/fred/series/observations");
  });
});

// ---------------------------------------------------------------------------
// T2 — JSON parse: valid response
// ---------------------------------------------------------------------------

describe("T2 — parseFredIsmJson: valid response extracts rows", () => {
  it("parses a single observation", () => {
    const body = JSON.stringify({
      observations: [{ date: "2026-04-01", value: "57.2" }],
    });
    const rows = parseFredIsmJson(body, "NAPMNO");
    expect(rows).not.toBeNull();
    expect(rows!.length).toBe(1);
    expect(rows![0]).toEqual({ date: "2026-04-01", value: 57.2 });
  });

  it("parses multiple observations", () => {
    const body = JSON.stringify({
      observations: [
        { date: "2026-04-01", value: "57.2" },
        { date: "2026-03-01", value: "54.1" },
      ],
    });
    const rows = parseFredIsmJson(body, "NAPMEMP");
    expect(rows!.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// T3 — JSON parse: "." values skipped
// ---------------------------------------------------------------------------

describe('T3 — parseFredIsmJson: "." values skipped', () => {
  it('skips "." placeholder values', () => {
    const body = JSON.stringify({
      observations: [
        { date: "2026-04-01", value: "57.2" },
        { date: "2026-03-01", value: "." },
        { date: "2026-02-01", value: "53.8" },
      ],
    });
    const rows = parseFredIsmJson(body, "NAPMPI");
    expect(rows!.length).toBe(2);
    // "." row should be absent
    expect(rows!.every((r) => r.value !== null && !isNaN(r.value))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T4 — JSON parse: invalid input → null
// ---------------------------------------------------------------------------

describe("T4 — parseFredIsmJson: malformed/empty → null", () => {
  it("returns null for invalid JSON", () => {
    const rows = parseFredIsmJson("not-json", "NAPMNO");
    expect(rows).toBeNull();
  });

  it("returns null for response with no observations array", () => {
    const body = JSON.stringify({ error: "series not found" });
    const rows = parseFredIsmJson(body, "NAPMBI");
    expect(rows).toBeNull();
  });

  it("returns null when all observations are '.'", () => {
    const body = JSON.stringify({
      observations: [{ date: "2026-04-01", value: "." }],
    });
    const rows = parseFredIsmJson(body, "NAPMNO");
    expect(rows).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T5 — Missing FRED_API_KEY → returns null
// ---------------------------------------------------------------------------

describe("T5 — fetchFredIsmSubcomponents: missing API key → null", () => {
  it("returns null when FRED_API_KEY is absent (no env var set in test)", async () => {
    const db = makeTestDb();
    // Pass a client that would succeed if called — but should not be called
    const clientCalled: string[] = [];
    const mockClient = {
      async get(url: string): Promise<string> {
        clientCalled.push(url);
        return JSON.stringify({ observations: [] });
      },
    };

    // Temporarily unset FRED_API_KEY for this test
    const savedKey = process.env["FRED_API_KEY"];
    const savedBunKey = (typeof Bun !== "undefined") ? Bun.env.FRED_API_KEY : undefined;
    delete process.env["FRED_API_KEY"];
    if (typeof Bun !== "undefined") {
      // Can't delete Bun.env easily, so just override
      (Bun.env as Record<string, string | undefined>)["FRED_API_KEY"] = undefined as unknown as string;
    }

    const result = await fetchFredIsmSubcomponents(mockClient, db, NOOP_SLEEP);
    expect(result).toBeNull();
    expect(clientCalled.length).toBe(0);

    // Restore
    if (savedKey !== undefined) process.env["FRED_API_KEY"] = savedKey;
    if (typeof Bun !== "undefined" && savedBunKey !== undefined) {
      (Bun.env as Record<string, string | undefined>)["FRED_API_KEY"] = savedBunKey;
    }
  });
});

// ---------------------------------------------------------------------------
// T6 — Fetcher: all 4 series inserted
// ---------------------------------------------------------------------------

describe("T6 — fetchFredIsmSubcomponents: all 4 series inserted", () => {
  it("inserts rows for all 4 ISM series into fred_series_daily", async () => {
    const db = makeTestDb();

    const responseMap: Record<IsmSeriesId, string> = {
      NAPMNO: makeMockResponse("NAPMNO", "57.2", "2026-04-01"),
      NAPMEMP: makeMockResponse("NAPMEMP", "50.3", "2026-04-01"),
      NAPMPI: makeMockResponse("NAPMPI", "62.4", "2026-04-01"),
      NAPMBI: makeMockResponse("NAPMBI", "48.1", "2026-04-01"),
    };
    const mockClient = makeHttpClientWithData(responseMap);

    // Override FRED_API_KEY for this test
    const savedKey = process.env["FRED_API_KEY"];
    process.env["FRED_API_KEY"] = "test_api_key";
    if (typeof Bun !== "undefined") {
      (Bun.env as Record<string, string | undefined>)["FRED_API_KEY"] = "test_api_key";
    }

    const result = await fetchFredIsmSubcomponents(mockClient, db, NOOP_SLEEP);

    // Restore
    if (savedKey !== undefined) process.env["FRED_API_KEY"] = savedKey;
    else delete process.env["FRED_API_KEY"];
    if (typeof Bun !== "undefined") {
      (Bun.env as Record<string, string | undefined>)["FRED_API_KEY"] = savedKey;
    }

    expect(result).not.toBeNull();
    expect(result!.failed).toHaveLength(0);

    // Verify all 4 series are in DB
    for (const seriesId of ISM_SERIES) {
      const row = db
        .prepare<{ cnt: number }, [string]>(
          `SELECT COUNT(*) AS cnt FROM fred_series_daily WHERE series = ?`,
        )
        .get(seriesId);
      expect(row!.cnt).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// T7 — Idempotency: second call → 0 new rows
// ---------------------------------------------------------------------------

describe("T7 — idempotency: INSERT OR IGNORE on repeated call", () => {
  it("returns 0 new rows on second call with same data", async () => {
    const db = makeTestDb();

    const responseMap: Record<IsmSeriesId, string> = {
      NAPMNO: makeMockResponse("NAPMNO", "57.2", "2026-04-01"),
      NAPMEMP: makeMockResponse("NAPMEMP", "50.3", "2026-04-01"),
      NAPMPI: makeMockResponse("NAPMPI", "62.4", "2026-04-01"),
      NAPMBI: makeMockResponse("NAPMBI", "48.1", "2026-04-01"),
    };
    const mockClient = makeHttpClientWithData(responseMap);

    const savedKey = process.env["FRED_API_KEY"];
    process.env["FRED_API_KEY"] = "test_api_key";
    if (typeof Bun !== "undefined") {
      (Bun.env as Record<string, string | undefined>)["FRED_API_KEY"] = "test_api_key";
    }

    // First call
    await fetchFredIsmSubcomponents(mockClient, db, NOOP_SLEEP);

    // Second call with same mock data
    const result2 = await fetchFredIsmSubcomponents(mockClient, db, NOOP_SLEEP);

    // Restore
    if (savedKey !== undefined) process.env["FRED_API_KEY"] = savedKey;
    else delete process.env["FRED_API_KEY"];
    if (typeof Bun !== "undefined") {
      (Bun.env as Record<string, string | undefined>)["FRED_API_KEY"] = savedKey;
    }

    expect(result2).not.toBeNull();
    // All series should report 0 new rows (idempotent)
    for (const seriesId of ISM_SERIES) {
      expect(result2!.inserted[seriesId]).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// T8 — HTTP error → series in failed list
// ---------------------------------------------------------------------------

describe("T8 — HTTP error handling: failed series reported", () => {
  it("adds failing series to failed[] and continues with others", async () => {
    const db = makeTestDb();

    // NAPMNO will fail; others succeed
    const responseMap: Record<IsmSeriesId, string> = {
      NAPMNO: makeMockResponse("NAPMNO", "57.2", "2026-04-01"),
      NAPMEMP: makeMockResponse("NAPMEMP", "50.3", "2026-04-01"),
      NAPMPI: makeMockResponse("NAPMPI", "62.4", "2026-04-01"),
      NAPMBI: makeMockResponse("NAPMBI", "48.1", "2026-04-01"),
    };
    const mockClient = makeHttpClientWithData(responseMap, ["NAPMNO"]);

    const savedKey = process.env["FRED_API_KEY"];
    process.env["FRED_API_KEY"] = "test_api_key";
    if (typeof Bun !== "undefined") {
      (Bun.env as Record<string, string | undefined>)["FRED_API_KEY"] = "test_api_key";
    }

    const result = await fetchFredIsmSubcomponents(mockClient, db, NOOP_SLEEP);

    // Restore
    if (savedKey !== undefined) process.env["FRED_API_KEY"] = savedKey;
    else delete process.env["FRED_API_KEY"];
    if (typeof Bun !== "undefined") {
      (Bun.env as Record<string, string | undefined>)["FRED_API_KEY"] = savedKey;
    }

    expect(result).not.toBeNull();
    expect(result!.failed).toContain("NAPMNO");
    // Other series still inserted
    expect(result!.inserted["NAPMEMP"]).toBeGreaterThan(0);
    expect(result!.inserted["NAPMPI"]).toBeGreaterThan(0);
    expect(result!.inserted["NAPMBI"]).toBeGreaterThan(0);
  });
});
