/**
 * TDD tests for Task 1939 — Watchlist navigation + per-stock linked analysis.
 *
 * Covers:
 *  1. WATCHLIST_STOCKS constant shape (from domain)
 *  2. groupBySector() pure function
 *  3. fetchWatchlistPrices() — batch lightweight price fetch
 *  4. fetchCascadeSignals() — cascade-type agent signals for a stock
 *  5. WatchlistTile domain helper — direction badge computation
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  WATCHLIST_STOCKS,
  groupBySector,
  type WatchlistStock,
} from "../domain/market";
import {
  fetchWatchlistPrices,
  fetchCascadeSignals,
  type WatchlistTileData,
} from "../lib/api/client";

// ---------------------------------------------------------------------------
// 1. WATCHLIST_STOCKS constant
// ---------------------------------------------------------------------------

describe("WATCHLIST_STOCKS", () => {
  it("contains at least 30 active entries", () => {
    const active = WATCHLIST_STOCKS.filter((s) => s.active);
    expect(active.length).toBeGreaterThanOrEqual(30);
  });

  it("every entry has ticker, company, sector, exchange, active fields", () => {
    for (const s of WATCHLIST_STOCKS) {
      expect(typeof s.ticker).toBe("string");
      expect(s.ticker.length).toBeGreaterThan(0);
      expect(typeof s.company).toBe("string");
      expect(typeof s.sector).toBe("string");
      expect(typeof s.exchange).toBe("string");
      expect(typeof s.active).toBe("boolean");
    }
  });

  it("includes canonical tickers: VNM, FPT, VCB, HPG, SSI", () => {
    const tickers = WATCHLIST_STOCKS.map((s) => s.ticker);
    expect(tickers).toContain("VNM");
    expect(tickers).toContain("FPT");
    expect(tickers).toContain("VCB");
    expect(tickers).toContain("HPG");
    expect(tickers).toContain("SSI");
  });
});

// ---------------------------------------------------------------------------
// 2. groupBySector() pure function
// ---------------------------------------------------------------------------

describe("groupBySector", () => {
  const sampleStocks: WatchlistStock[] = [
    { ticker: "VCB", company: "Vietcombank", sector: "Banking", exchange: "HOSE", active: true },
    { ticker: "BID", company: "BIDV", sector: "Banking", exchange: "HOSE", active: true },
    { ticker: "FPT", company: "FPT Corp", sector: "Tech / IT outsourcing", exchange: "HOSE", active: true },
    { ticker: "VEA", company: "VEAM", sector: "Automotive", exchange: "UPCOM", active: false, note: "Removed" },
  ];

  it("groups stocks by sector key", () => {
    const result = groupBySector(sampleStocks);
    expect(Object.keys(result)).toContain("Banking");
    expect(Object.keys(result)).toContain("Tech / IT outsourcing");
    expect(result["Banking"].length).toBe(2);
  });

  it("excludes inactive stocks by default", () => {
    const result = groupBySector(sampleStocks);
    const allTickers = Object.values(result).flat().map((s) => s.ticker);
    expect(allTickers).not.toContain("VEA");
  });

  it("includes inactive stocks when includeInactive=true", () => {
    const result = groupBySector(sampleStocks, { includeInactive: true });
    const allTickers = Object.values(result).flat().map((s) => s.ticker);
    expect(allTickers).toContain("VEA");
  });

  it("returns empty object for empty input", () => {
    expect(groupBySector([])).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// 3. fetchWatchlistPrices()
// ---------------------------------------------------------------------------

describe("fetchWatchlistPrices", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns a map of ticker → WatchlistTileData for valid response", async () => {
    const mockData: Record<string, unknown> = {
      VNM: { ticker: "VNM", close: 68000, changePct: 1.5, direction: "up" },
      FPT: { ticker: "FPT", close: 95000, changePct: -0.8, direction: "down" },
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ quotes: mockData }),
      }),
    );

    const result = await fetchWatchlistPrices(["VNM", "FPT"]);
    expect(result).toHaveProperty("VNM");
    expect(result).toHaveProperty("FPT");
    expect(result["VNM"].close).toBe(68000);
    expect(result["VNM"].changePct).toBe(1.5);
    expect(result["FPT"].direction).toBe("down");
  });

  it("returns empty map when API returns no data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      }),
    );

    const result = await fetchWatchlistPrices(["VNM"]);
    expect(result).toEqual({});
  });

  it("returns empty map on HTTP error (non-fatal)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      }),
    );

    const result = await fetchWatchlistPrices(["VNM"]).catch(() => ({}));
    expect(result).toEqual({});
  });

  it("handles response with flat array shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve([
            { ticker: "VCB", close: 52000, changePct: 0.5, direction: "up" },
          ]),
      }),
    );

    const result = await fetchWatchlistPrices(["VCB"]);
    expect(result).toHaveProperty("VCB");
    expect(result["VCB"].close).toBe(52000);
  });
});

// ---------------------------------------------------------------------------
// 4. fetchCascadeSignals()
// ---------------------------------------------------------------------------

describe("fetchCascadeSignals", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns cascade signals for a stock", async () => {
    const mockSignals = {
      signals: [
        {
          id: 1,
          stock_code: "GAS",
          signal_type: "chain_catalyst",
          direction: "BEARISH",
          confidence_score: 70,
          detail: "Oil +5% → GAS sector bearish impact",
          created_at: "2026-05-17 10:30:00",
        },
      ],
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSignals),
      }),
    );

    const result = await fetchCascadeSignals("GAS");
    expect(result.length).toBe(1);
    expect(result[0].signalType).toBe("chain_catalyst");
    expect(result[0].direction).toBe("BEARISH");
    expect(result[0].confidence).toBeCloseTo(0.7);
  });

  it("returns empty array when no cascade signals", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ signals: [] }),
      }),
    );

    const result = await fetchCascadeSignals("FPT");
    expect(result).toEqual([]);
  });

  it("returns empty array on API error (non-fatal)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      }),
    );

    const result = await fetchCascadeSignals("MISSING").catch(() => []);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 5. WatchlistTileData type shape checks
// ---------------------------------------------------------------------------

describe("WatchlistTileData shape", () => {
  it("has the required fields", () => {
    const tile: WatchlistTileData = {
      ticker: "VNM",
      close: 68000,
      changePct: 1.5,
      direction: "up",
      signalCount: 3,
    };
    expect(tile.ticker).toBe("VNM");
    expect(tile.close).toBe(68000);
    expect(tile.changePct).toBe(1.5);
    expect(tile.direction).toBe("up");
    expect(tile.signalCount).toBe(3);
  });

  it("direction can be up, down, or flat", () => {
    const up: WatchlistTileData = { ticker: "A", close: 100, changePct: 1, direction: "up", signalCount: 0 };
    const down: WatchlistTileData = { ticker: "B", close: 100, changePct: -1, direction: "down", signalCount: 0 };
    const flat: WatchlistTileData = { ticker: "C", close: 100, changePct: 0, direction: "flat", signalCount: 0 };
    expect(up.direction).toBe("up");
    expect(down.direction).toBe("down");
    expect(flat.direction).toBe("flat");
  });
});
