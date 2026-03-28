/**
 * Task 025 — Yahoo Finance Commodity Fetcher
 *
 * Tests for fetchYahooFinancePrices() and storeCommoditySnapshot()
 * in src/infrastructure/fetchers/yahooFinance.ts.
 *
 * All HTTP calls are mocked — no real network traffic.
 * DB tests use an in-memory SQLite via DB_PATH=:memory:.
 *
 * Test IDs: YF-01 through YF-12
 */

import { Database } from "bun:sqlite";
import { describe, it, expect } from "bun:test";
import {
  fetchYahooFinancePrices,
  storeCommoditySnapshot,
  type CommoditySnapshot,
  type HttpClient,
} from "../infrastructure/fetchers/yahooFinance.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";

// ---------------------------------------------------------------------------
// Mock HTML builders
// ---------------------------------------------------------------------------

/**
 * Builds minimal Yahoo Finance HTML containing fin-streamer elements
 * for the requested symbols.
 */
function buildYahooHtml(
  symbols: Record<string, string | null>,
): string {
  const elements = Object.entries(symbols)
    .map(([symbol, value]) => {
      if (value === null) return ""; // simulate missing element
      return `<fin-streamer data-symbol="${symbol}" data-field="regularMarketPrice" value="${value}">${value}</fin-streamer>`;
    })
    .join("\n");

  return `<!DOCTYPE html><html><body>${elements}</body></html>`;
}

/**
 * Builds Yahoo Finance HTML using only text content (no value attribute)
 * to test the text fallback path.
 */
function buildYahooHtmlTextOnly(
  symbols: Record<string, string>,
): string {
  const elements = Object.entries(symbols)
    .map(
      ([symbol, value]) =>
        `<fin-streamer data-symbol="${symbol}" data-field="regularMarketPrice">${value}</fin-streamer>`,
    )
    .join("\n");

  return `<!DOCTYPE html><html><body>${elements}</body></html>`;
}

/** Creates a mock HttpClient that always returns the provided HTML body. */
function mockClient(html: string): HttpClient {
  return {
    async get(_url: string): Promise<string> {
      return html;
    },
  };
}

/** Creates a mock HttpClient that always throws a network error. */
function failingClient(): HttpClient {
  return {
    async get(_url: string): Promise<string> {
      throw new Error("Network timeout");
    },
  };
}

// ---------------------------------------------------------------------------
// Standard mock responses
// ---------------------------------------------------------------------------

const ALL_SYMBOLS_HTML = buildYahooHtml({
  "BZ=F": "82.50",
  "GC=F": "2341.80",
  "USDVND=X": "25100.00",
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Task 025 — Yahoo Finance Commodity Fetcher", () => {
  // ── YF-01: Successful parse of all 3 symbols ────────────────────────────
  it("YF-01: returns CommoditySnapshot with all 3 prices on valid HTML", async () => {
    const result = await fetchYahooFinancePrices(mockClient(ALL_SYMBOLS_HTML));

    expect(result).not.toBeNull();
    expect(result!.brentCrudeUSD).toBeCloseTo(82.5, 2);
    expect(result!.goldUSDPerOz).toBeCloseTo(2341.8, 1);
    expect(result!.usdVndRate).toBeCloseTo(25100.0, 0);
  });

  // ── YF-02: Brent crude parse failure → field=0, others still work ────────
  it("YF-02: sets brentCrudeUSD=0 when BZ=F element is missing, others succeed", async () => {
    const html = buildYahooHtml({
      "BZ=F": null,
      "GC=F": "2341.80",
      "USDVND=X": "25100.00",
    });

    const result = await fetchYahooFinancePrices(mockClient(html));

    expect(result).not.toBeNull();
    expect(result!.brentCrudeUSD).toBe(0);
    expect(result!.goldUSDPerOz).toBeCloseTo(2341.8, 1);
    expect(result!.usdVndRate).toBeCloseTo(25100.0, 0);
  });

  // ── YF-03: Gold parse failure → field=0 ─────────────────────────────────
  it("YF-03: sets goldUSDPerOz=0 when GC=F element is missing, others succeed", async () => {
    const html = buildYahooHtml({
      "BZ=F": "82.50",
      "GC=F": null,
      "USDVND=X": "25100.00",
    });

    const result = await fetchYahooFinancePrices(mockClient(html));

    expect(result).not.toBeNull();
    expect(result!.brentCrudeUSD).toBeCloseTo(82.5, 2);
    expect(result!.goldUSDPerOz).toBe(0);
    expect(result!.usdVndRate).toBeCloseTo(25100.0, 0);
  });

  // ── YF-04: USD/VND parse failure → field=0 ──────────────────────────────
  it("YF-04: sets usdVndRate=0 when USDVND=X element is missing, others succeed", async () => {
    const html = buildYahooHtml({
      "BZ=F": "82.50",
      "GC=F": "2341.80",
      "USDVND=X": null,
    });

    const result = await fetchYahooFinancePrices(mockClient(html));

    expect(result).not.toBeNull();
    expect(result!.brentCrudeUSD).toBeCloseTo(82.5, 2);
    expect(result!.goldUSDPerOz).toBeCloseTo(2341.8, 1);
    expect(result!.usdVndRate).toBe(0);
  });

  // ── YF-05: All 3 fail → returns null ────────────────────────────────────
  it("YF-05: returns null when all 3 symbols fail to parse", async () => {
    const html = buildYahooHtml({
      "BZ=F": null,
      "GC=F": null,
      "USDVND=X": null,
    });

    const result = await fetchYahooFinancePrices(mockClient(html));
    expect(result).toBeNull();
  });

  // ── YF-06: HTTP error → returns null, no throw ──────────────────────────
  it("YF-06: returns null on HTTP error and does not throw", async () => {
    const result = await fetchYahooFinancePrices(failingClient());
    expect(result).toBeNull();
  });

  // ── YF-07: Missing fin-streamer element (empty page) → field=0 ──────────
  it("YF-07: fields default to 0 when fin-streamer elements are absent from page", async () => {
    const emptyHtml = `<!DOCTYPE html><html><body><p>No data here</p></body></html>`;
    const result = await fetchYahooFinancePrices(mockClient(emptyHtml));
    // All fields are 0 → returns null because all failed
    expect(result).toBeNull();
  });

  // ── YF-08: Comma in price string → correct parse ─────────────────────────
  it("YF-08: correctly parses prices with US comma separators like '2,341.50'", async () => {
    const html = buildYahooHtml({
      "BZ=F": "82.50",
      "GC=F": "2,341.50",
      "USDVND=X": "25,100.00",
    });

    const result = await fetchYahooFinancePrices(mockClient(html));

    expect(result).not.toBeNull();
    expect(result!.goldUSDPerOz).toBeCloseTo(2341.5, 1);
    expect(result!.usdVndRate).toBeCloseTo(25100.0, 0);
  });

  // ── YF-09: storeCommoditySnapshot upsert semantics ──────────────────────
  it("YF-09: storeCommoditySnapshot upserts (INSERT OR REPLACE) into commodity_prices", () => {
    // Use a fully local in-memory DB — bypasses the singleton to ensure isolation
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE commodity_prices (
        source TEXT PRIMARY KEY,
        brent_crude_usd REAL NOT NULL DEFAULT 0,
        gold_usd_per_oz REAL NOT NULL DEFAULT 0,
        usd_vnd_rate REAL NOT NULL DEFAULT 0,
        fetched_at TEXT NOT NULL
      );
      CREATE TABLE commodity_prices_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL,
        brent_crude_usd REAL NOT NULL DEFAULT 0,
        gold_usd_per_oz REAL NOT NULL DEFAULT 0,
        usd_vnd_rate REAL NOT NULL DEFAULT 0,
        fetched_at TEXT NOT NULL
      );
    `);

    const snap1: CommoditySnapshot = {
      brentCrudeUSD: 80.0,
      goldUSDPerOz: 2300.0,
      usdVndRate: 25000.0,
      fetchedAt: "2026-03-28T08:00:00.000Z",
    };

    const snap2: CommoditySnapshot = {
      brentCrudeUSD: 85.0,
      goldUSDPerOz: 2400.0,
      usdVndRate: 25200.0,
      fetchedAt: "2026-03-28T09:00:00.000Z",
    };

    storeCommoditySnapshot(snap1, db);
    storeCommoditySnapshot(snap2, db);

    // Only one row in commodity_prices (source='yahoo'), latest value wins
    const row = db
      .query<
        { brent_crude_usd: number; gold_usd_per_oz: number; fetched_at: string },
        []
      >("SELECT brent_crude_usd, gold_usd_per_oz, fetched_at FROM commodity_prices WHERE source = 'yahoo'")
      .get();

    expect(row).not.toBeNull();
    expect(row!.brent_crude_usd).toBeCloseTo(85.0, 2);
    expect(row!.gold_usd_per_oz).toBeCloseTo(2400.0, 1);
    expect(row!.fetched_at).toBe("2026-03-28T09:00:00.000Z");

    db.close();
  });

  // ── YF-10: storeCommoditySnapshot history append ─────────────────────────
  it("YF-10: storeCommoditySnapshot appends each call to commodity_prices_history", () => {
    // Use a fully local in-memory DB — bypasses the singleton to ensure isolation
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE commodity_prices (
        source TEXT PRIMARY KEY,
        brent_crude_usd REAL NOT NULL DEFAULT 0,
        gold_usd_per_oz REAL NOT NULL DEFAULT 0,
        usd_vnd_rate REAL NOT NULL DEFAULT 0,
        fetched_at TEXT NOT NULL
      );
      CREATE TABLE commodity_prices_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL,
        brent_crude_usd REAL NOT NULL DEFAULT 0,
        gold_usd_per_oz REAL NOT NULL DEFAULT 0,
        usd_vnd_rate REAL NOT NULL DEFAULT 0,
        fetched_at TEXT NOT NULL
      );
    `);

    const snap1: CommoditySnapshot = {
      brentCrudeUSD: 80.0,
      goldUSDPerOz: 2300.0,
      usdVndRate: 25000.0,
      fetchedAt: "2026-03-28T08:00:00.000Z",
    };

    const snap2: CommoditySnapshot = {
      brentCrudeUSD: 85.0,
      goldUSDPerOz: 2400.0,
      usdVndRate: 25200.0,
      fetchedAt: "2026-03-28T09:00:00.000Z",
    };

    storeCommoditySnapshot(snap1, db);
    storeCommoditySnapshot(snap2, db);

    const count = db
      .query<{ cnt: number }, []>(
        "SELECT COUNT(*) as cnt FROM commodity_prices_history WHERE source = 'yahoo'",
      )
      .get();

    expect(count!.cnt).toBe(2);

    db.close();
  });

  // ── YF-11: barrel export check ───────────────────────────────────────────
  it("YF-11: fetchYahooFinancePrices and storeCommoditySnapshot are exported from barrel", async () => {
    const barrel = await import("../infrastructure/fetchers/index.js");
    expect(typeof barrel.fetchYahooFinancePrices).toBe("function");
    expect(typeof barrel.storeCommoditySnapshot).toBe("function");
  });

  // ── YF-12: fetchedAt is ISO 8601 ─────────────────────────────────────────
  it("YF-12: fetchedAt in returned CommoditySnapshot is a valid ISO 8601 timestamp", async () => {
    const result = await fetchYahooFinancePrices(mockClient(ALL_SYMBOLS_HTML));

    expect(result).not.toBeNull();
    const parsed = new Date(result!.fetchedAt);
    expect(Number.isNaN(parsed.getTime())).toBe(false);
    // Must contain T and Z (ISO 8601 UTC)
    expect(result!.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  // ── YF-13: value attribute takes priority over text content ──────────────
  it("YF-13: reads value attribute first, falls back to text content when attribute absent", async () => {
    // Text-only HTML (no value= attribute)
    const textHtml = buildYahooHtmlTextOnly({
      "BZ=F": "77.77",
      "GC=F": "2222.22",
      "USDVND=X": "24999.00",
    });

    const result = await fetchYahooFinancePrices(mockClient(textHtml));

    expect(result).not.toBeNull();
    expect(result!.brentCrudeUSD).toBeCloseTo(77.77, 2);
    expect(result!.goldUSDPerOz).toBeCloseTo(2222.22, 1);
    expect(result!.usdVndRate).toBeCloseTo(24999.0, 0);
  });
});
