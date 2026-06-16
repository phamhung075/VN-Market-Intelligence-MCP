/**
 * ERRAUDIT-W2-client-cluster-c.test.ts
 *
 * Tests for the 4 Cluster C non-fatal client functions in client.ts after
 * migration to safeFetch / safeFetchOrNull with 10s deadline.
 *
 * Functions under test:
 *   - fetchKinhDichReadingNonFatal(code) → KinhDichReading | null
 *   - fetchWatchlistPrices(tickers) → Record<string, WatchlistTileData>
 *   - fetchCascadeSignals(code, limit?) → AgentSignal[]
 *   - fetchAccuracyDigest(days?) → AccuracyDigestStats | null
 *
 * Contract preserved after migration:
 *   - fetchKinhDichReadingNonFatal: null on any failure (was null, still null)
 *   - fetchWatchlistPrices: {} on any failure (was {}, still {})
 *   - fetchCascadeSignals: [] on any failure (was [], still [])
 *   - fetchAccuracyDigest: null on any failure (was null, still null)
 *
 * New behaviour after migration:
 *   - All 4 functions have an AbortController deadline (10s)
 *   - All 4 log a structured console.error on any failure path
 *   - fetchCascadeSignals/fetchAccuracyDigest no longer call apiGet — they call
 *     fetch directly via safeFetchOrNull (no double-deadline)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchKinhDichReadingNonFatal,
  fetchWatchlistPrices,
  fetchCascadeSignals,
  fetchAccuracyDigest,
} from "~/lib/api/client";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// KinhDichReading extends KinhDichMarket; fields: stock, actionNote, overallReading
// KinhDichMarket has market-level fields; use a generic object shape for the mock
const KD_READING = {
  stock: "VNM",
  hexagram: 1,
  hexagramName: "Kiền",
  interpretation: "Mạnh mẽ, thuận lợi",
};

const WATCHLIST_QUOTES_SHAPE = {
  quotes: {
    VNM: { ticker: "VNM", close: 55000, changePct: 1.5, direction: "up", signalCount: 3 },
    FPT: { ticker: "FPT", close: 120000, changePct: -0.5, direction: "down", signalCount: 1 },
  },
};

const WATCHLIST_ARRAY_SHAPE = [
  { ticker: "VNM", close: 55000, changePct: 1.5, direction: "up", signalCount: 3 },
  { ticker: "FPT", close: 120000, changePct: -0.5, direction: "down", signalCount: 1 },
];

const CASCADE_RESPONSE = {
  signals: [
    {
      id: 1,
      stock_code: "HPG",
      signal_type: "chain_catalyst",
      direction: "BULLISH",
      confidence_score: 75,
      detail: "Macro catalyst for HPG",
      created_at: "2026-06-16T00:00:00Z",
    },
  ],
};

// AccuracyDigestStats shape: totalResolved, totalCorrect, overallRate, bySignalType[], etc.
const ACCURACY_DIGEST = {
  totalResolved: 100,
  totalCorrect: 72,
  overallRate: 0.72,
  bySignalType: [],
  newStocksCount: 5,
  neutralOnlyRows: 3,
  generatedAt: "2026-06-16T00:00:00Z",
};

const originalFetch = global.fetch;

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  global.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// fetchKinhDichReadingNonFatal
// ---------------------------------------------------------------------------

describe("fetchKinhDichReadingNonFatal — migrated to safeFetchOrNull", () => {
  it("returns reading on 200 success", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(KD_READING), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const result = await fetchKinhDichReadingNonFatal("VNM");

    expect(result).not.toBeNull();
    // KinhDichReading has 'stock' field (not 'code')
    expect(result?.stock).toBe("VNM");
  });

  it("returns null on 503 (non-fatal)", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response("Service Unavailable", { status: 503 })
    );

    const result = await fetchKinhDichReadingNonFatal("VNM");

    expect(result).toBeNull();
  });

  it("returns null on network error (non-fatal)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await fetchKinhDichReadingNonFatal("VNM");

    expect(result).toBeNull();
  });

  it("returns null on AbortError (deadline exceeded — non-fatal)", async () => {
    const abortErr = new DOMException("aborted", "AbortError");
    global.fetch = vi.fn().mockRejectedValue(abortErr);

    const result = await fetchKinhDichReadingNonFatal("VNM");

    expect(result).toBeNull();
  });

  it("encodes code in URL (no injection)", async () => {
    let capturedUrl = "";
    global.fetch = vi.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve(
        new Response(JSON.stringify(KD_READING), { status: 200 })
      );
    });

    await fetchKinhDichReadingNonFatal("VNM/special");

    expect(capturedUrl).toContain(encodeURIComponent("VNM/special"));
  });

  it("passes AbortSignal to fetch (deadline wired)", async () => {
    let capturedSignal: AbortSignal | undefined | null;
    global.fetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      capturedSignal = init?.signal;
      return Promise.resolve(
        new Response(JSON.stringify(KD_READING), { status: 200 })
      );
    });

    await fetchKinhDichReadingNonFatal("VNM");

    expect(capturedSignal instanceof AbortSignal).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// fetchWatchlistPrices
// ---------------------------------------------------------------------------

describe("fetchWatchlistPrices — migrated to safeFetch", () => {
  it("returns empty {} immediately when tickers array is empty", async () => {
    global.fetch = vi.fn();

    const result = await fetchWatchlistPrices([]);

    expect(result).toEqual({});
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("parses Shape 1 (quotes map) correctly", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(WATCHLIST_QUOTES_SHAPE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const result = await fetchWatchlistPrices(["VNM", "FPT"]);

    expect(result["VNM"]).toBeDefined();
    expect(result["VNM"].close).toBe(55000);
    expect(result["VNM"].direction).toBe("up");
    expect(result["FPT"]).toBeDefined();
  });

  it("parses Shape 2 (flat array) correctly", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(WATCHLIST_ARRAY_SHAPE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const result = await fetchWatchlistPrices(["VNM", "FPT"]);

    expect(result["VNM"]).toBeDefined();
    expect(result["VNM"].close).toBe(55000);
    expect(result["FPT"]).toBeDefined();
  });

  it("returns {} on 502 (non-fatal — degrade gracefully)", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "bad gateway" }), { status: 502 })
    );

    const result = await fetchWatchlistPrices(["VNM"]);

    expect(result).toEqual({});
  });

  it("returns {} on network error (non-fatal)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await fetchWatchlistPrices(["VNM"]);

    expect(result).toEqual({});
  });

  it("returns {} on AbortError / deadline (non-fatal)", async () => {
    const abortErr = new DOMException("aborted", "AbortError");
    global.fetch = vi.fn().mockRejectedValue(abortErr);

    const result = await fetchWatchlistPrices(["VNM"]);

    expect(result).toEqual({});
  });

  it("encodes tickers in URL", async () => {
    let capturedUrl = "";
    global.fetch = vi.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve(
        new Response(JSON.stringify(WATCHLIST_QUOTES_SHAPE), { status: 200 })
      );
    });

    await fetchWatchlistPrices(["VNM", "FPT"]);

    expect(capturedUrl).toContain("tickers=");
    expect(capturedUrl).toContain("VNM");
  });

  it("passes AbortSignal to fetch (deadline wired)", async () => {
    let capturedSignal: AbortSignal | undefined | null;
    global.fetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      capturedSignal = init?.signal;
      return Promise.resolve(
        new Response(JSON.stringify(WATCHLIST_QUOTES_SHAPE), { status: 200 })
      );
    });

    await fetchWatchlistPrices(["VNM"]);

    expect(capturedSignal instanceof AbortSignal).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// fetchCascadeSignals
// ---------------------------------------------------------------------------

describe("fetchCascadeSignals — migrated to safeFetchOrNull (replaces apiGet)", () => {
  it("returns AgentSignal[] on 200 success", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(CASCADE_RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const result = await fetchCascadeSignals("HPG");

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(1);
    expect(result[0].stockCode).toBe("HPG");
    expect(result[0].signalType).toBe("chain_catalyst");
  });

  it("returns [] on 503 (non-fatal)", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response("Service Unavailable", { status: 503 })
    );

    const result = await fetchCascadeSignals("HPG");

    expect(result).toEqual([]);
  });

  it("returns [] on network error (non-fatal)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await fetchCascadeSignals("HPG");

    expect(result).toEqual([]);
  });

  it("returns [] on AbortError (non-fatal)", async () => {
    const abortErr = new DOMException("aborted", "AbortError");
    global.fetch = vi.fn().mockRejectedValue(abortErr);

    const result = await fetchCascadeSignals("HPG");

    expect(result).toEqual([]);
  });

  it("returns [] when signals key is absent in response", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ other: "data" }), { status: 200 })
    );

    const result = await fetchCascadeSignals("HPG");

    expect(result).toEqual([]);
  });

  it("uses type=chain_catalyst in query", async () => {
    let capturedUrl = "";
    global.fetch = vi.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve(
        new Response(JSON.stringify(CASCADE_RESPONSE), { status: 200 })
      );
    });

    await fetchCascadeSignals("HPG", 5);

    expect(capturedUrl).toContain("type=chain_catalyst");
    expect(capturedUrl).toContain("limit=5");
  });

  it("passes AbortSignal to fetch (deadline wired)", async () => {
    let capturedSignal: AbortSignal | undefined | null;
    global.fetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      capturedSignal = init?.signal;
      return Promise.resolve(
        new Response(JSON.stringify(CASCADE_RESPONSE), { status: 200 })
      );
    });

    await fetchCascadeSignals("HPG");

    expect(capturedSignal instanceof AbortSignal).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// fetchAccuracyDigest
// ---------------------------------------------------------------------------

describe("fetchAccuracyDigest — migrated to safeFetchOrNull (replaces apiGet)", () => {
  it("returns AccuracyDigestStats on 200 success", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(ACCURACY_DIGEST), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const result = await fetchAccuracyDigest();

    expect(result).not.toBeNull();
    expect(result).toMatchObject({ totalResolved: expect.any(Number) });
  });

  it("returns null on 503 (non-fatal)", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response("Service Unavailable", { status: 503 })
    );

    const result = await fetchAccuracyDigest();

    expect(result).toBeNull();
  });

  it("returns null on network error (non-fatal)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await fetchAccuracyDigest();

    expect(result).toBeNull();
  });

  it("returns null on AbortError (non-fatal)", async () => {
    const abortErr = new DOMException("aborted", "AbortError");
    global.fetch = vi.fn().mockRejectedValue(abortErr);

    const result = await fetchAccuracyDigest();

    expect(result).toBeNull();
  });

  it("returns null on bad JSON shape (non-object)", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response("null", { status: 200 })
    );

    const result = await fetchAccuracyDigest();

    expect(result).toBeNull();
  });

  it("uses days param in query URL", async () => {
    let capturedUrl = "";
    global.fetch = vi.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve(
        new Response(JSON.stringify(ACCURACY_DIGEST), { status: 200 })
      );
    });

    await fetchAccuracyDigest(14);

    expect(capturedUrl).toContain("days=14");
  });

  it("passes AbortSignal to fetch (deadline wired)", async () => {
    let capturedSignal: AbortSignal | undefined | null;
    global.fetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      capturedSignal = init?.signal;
      return Promise.resolve(
        new Response(JSON.stringify(ACCURACY_DIGEST), { status: 200 })
      );
    });

    await fetchAccuracyDigest(30);

    expect(capturedSignal instanceof AbortSignal).toBe(true);
  });
});
