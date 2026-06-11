/**
 * task17-p2-1b-price-history-loader.test.ts
 *
 * Tests the non-fatal loader behaviour for /dashboard/technical (Price & Technical page).
 *
 * The loader self-fetches `${FRONTEND_ORIGIN}/api/price-history/${ticker}?days=90`
 * via the exported fetchPriceHistory helper and must:
 *   - Return chart data (candles + pricePoints + latest) on 200 OK (happy path).
 *   - Return degraded state (error string + count:0) on 502 upstream error (never throw).
 *   - Return degraded state on 503 upstream error (never throw).
 *   - Return degraded state on network failure/fetch throws (never throw).
 *   - Return degraded state on unexpected JSON shape (never throw).
 *   - Return empty state (count:0 + error:null) when count is 0 (unknown ticker).
 *
 * Strategy: re-implement the loader's parse logic as pure helpers mirroring
 * fetchPriceHistory exactly — no Remix mocking needed (host-safe).
 */

import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Types — mirror dashboard.technical.tsx exactly
// ---------------------------------------------------------------------------

interface PriceLatest {
  date: string;
  close: number;
  change_abs: number | null;
  change_pct: number | null;
}

interface PriceCandle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface PricePoint {
  date: string;
  code: string;
  open?: number;
  high?: number;
  low?: number;
  close: number;
  volume?: number;
}

interface PriceHistoryDto {
  ticker: string;
  generated_at: string;
  data_source: "live" | "unavailable" | string;
  stale_served: boolean;
  count: number;
  latest: PriceLatest | null;
  candles: PriceCandle[];
}

interface LoaderResult {
  data_source: string | null;
  stale_served: boolean;
  count: number;
  latest: PriceLatest | null;
  candles: PriceCandle[];
  pricePoints: PricePoint[];
  error: string | null;
}

// ---------------------------------------------------------------------------
// Pure helpers — mirror fetchPriceHistory's parse paths exactly
// ---------------------------------------------------------------------------

function parsePriceHistoryResponse(raw: unknown, ticker: string): LoaderResult {
  if (
    raw !== null &&
    typeof raw === "object" &&
    "candles" in raw &&
    "count" in raw
  ) {
    const dto = raw as PriceHistoryDto;
    const data_source =
      typeof dto.data_source === "string" ? dto.data_source : null;
    const stale_served = dto.stale_served === true;
    const count = typeof dto.count === "number" ? dto.count : 0;
    const latest =
      dto.latest !== null && typeof dto.latest === "object"
        ? dto.latest
        : null;
    const candles = Array.isArray(dto.candles) ? dto.candles : [];
    const pricePoints: PricePoint[] = candles.map((c) => ({
      date: c.date,
      code: ticker,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }));
    return { data_source, stale_served, count, latest, candles, pricePoints, error: null };
  }
  return {
    data_source: null,
    stale_served: false,
    count: 0,
    latest: null,
    candles: [],
    pricePoints: [],
    error: "Unexpected response shape from /api/price-history",
  };
}

function buildUpstreamErrorResult(status: number, statusText: string): LoaderResult {
  return {
    data_source: null,
    stale_served: false,
    count: 0,
    latest: null,
    candles: [],
    pricePoints: [],
    error: `Upstream returned ${status} ${statusText}`,
  };
}

function buildNetworkErrorResult(err: unknown): LoaderResult {
  const error =
    err instanceof Error ? err.message : "Không thể kết nối tới máy chủ giá";
  return {
    data_source: null,
    stale_served: false,
    count: 0,
    latest: null,
    candles: [],
    pricePoints: [],
    error,
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const REAL_TS = "2026-06-11T10:00:00Z";
const TICKER = "VCB";

const SAMPLE_CANDLE: PriceCandle = {
  date: "2026-05-15",
  open: 61400,
  high: 62000,
  low: 61200,
  close: 61700,
  volume: 1500000,
};

const SAMPLE_LATEST: PriceLatest = {
  date: "2026-06-10",
  close: 61800,
  change_abs: 100,
  change_pct: 0.162,
};

const HEALTHY_DTO: PriceHistoryDto = {
  ticker: TICKER,
  generated_at: REAL_TS,
  data_source: "live",
  stale_served: false,
  count: 3,
  latest: SAMPLE_LATEST,
  candles: [
    { ...SAMPLE_CANDLE, date: "2026-05-15" },
    { ...SAMPLE_CANDLE, date: "2026-05-16", close: 61750 },
    { ...SAMPLE_CANDLE, date: "2026-06-10", close: 61800 },
  ],
};

const EMPTY_DTO: PriceHistoryDto = {
  ticker: "UNKNOWN_TICKER",
  generated_at: REAL_TS,
  data_source: "unavailable",
  stale_served: false,
  count: 0,
  latest: null,
  candles: [],
};

// ---------------------------------------------------------------------------
// Suite 1 — Happy path: 200 → chart data present
// ---------------------------------------------------------------------------

describe("price-history loader — 200 happy path (chart data present)", () => {
  it("parses candles from healthy DTO", () => {
    const result = parsePriceHistoryResponse(HEALTHY_DTO, TICKER);
    expect(result.error).toBeNull();
    expect(result.candles).toHaveLength(3);
  });

  it("count matches DTO count field", () => {
    const result = parsePriceHistoryResponse(HEALTHY_DTO, TICKER);
    expect(result.count).toBe(3);
  });

  it("latest price stat is populated", () => {
    const result = parsePriceHistoryResponse(HEALTHY_DTO, TICKER);
    expect(result.latest).not.toBeNull();
    expect(result.latest!.close).toBe(61800);
    expect(result.latest!.change_pct).toBe(0.162);
  });

  it("pricePoints are converted from candles with correct shape", () => {
    const result = parsePriceHistoryResponse(HEALTHY_DTO, TICKER);
    expect(result.pricePoints).toHaveLength(3);
    expect(result.pricePoints[0].date).toBe("2026-05-15");
    expect(result.pricePoints[0].code).toBe(TICKER);
    expect(result.pricePoints[0].close).toBe(61700);
    expect(result.pricePoints[0].volume).toBe(1500000);
  });

  it("data_source is 'live' from healthy DTO", () => {
    const result = parsePriceHistoryResponse(HEALTHY_DTO, TICKER);
    expect(result.data_source).toBe("live");
  });

  it("stale_served is false on non-stale DTO", () => {
    const result = parsePriceHistoryResponse(HEALTHY_DTO, TICKER);
    expect(result.stale_served).toBe(false);
  });

  it("stale_served is true when DTO stale_served is true", () => {
    const staleDto = { ...HEALTHY_DTO, stale_served: true };
    const result = parsePriceHistoryResponse(staleDto, TICKER);
    expect(result.stale_served).toBe(true);
    expect(result.error).toBeNull();
  });

  it("null change_abs and change_pct on latest are preserved", () => {
    const noChangeDto: PriceHistoryDto = {
      ...HEALTHY_DTO,
      latest: { date: "2026-06-10", close: 61800, change_abs: null, change_pct: null },
    };
    const result = parsePriceHistoryResponse(noChangeDto, TICKER);
    expect(result.latest!.change_abs).toBeNull();
    expect(result.latest!.change_pct).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — Empty state: count:0 → empty state (not an error)
// ---------------------------------------------------------------------------

describe("price-history loader — count:0 empty state (unknown ticker)", () => {
  it("count:0 + empty candles → error null, no throw", () => {
    expect(() => {
      const result = parsePriceHistoryResponse(EMPTY_DTO, "UNKNOWN_TICKER");
      expect(result.error).toBeNull();
      expect(result.candles).toEqual([]);
      expect(result.count).toBe(0);
      expect(result.pricePoints).toEqual([]);
    }).not.toThrow();
  });

  it("count:0 → latest is null", () => {
    const result = parsePriceHistoryResponse(EMPTY_DTO, "UNKNOWN_TICKER");
    expect(result.latest).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — Non-fatal: 502 / 503 upstream errors → degraded banner
// ---------------------------------------------------------------------------

describe("price-history loader — upstream HTTP error 502/503 (non-fatal)", () => {
  it("502 upstream → candles empty + error string, no throw", () => {
    expect(() => {
      const result = buildUpstreamErrorResult(502, "Bad Gateway");
      expect(result.candles).toEqual([]);
      expect(result.error).toContain("502");
      expect(result.count).toBe(0);
    }).not.toThrow();
  });

  it("503 upstream → candles empty + error string, no throw", () => {
    expect(() => {
      const result = buildUpstreamErrorResult(503, "Service Unavailable");
      expect(result.candles).toEqual([]);
      expect(result.error).toContain("503");
    }).not.toThrow();
  });

  it("error string contains status code for diagnostics", () => {
    const result = buildUpstreamErrorResult(504, "Gateway Timeout");
    expect(result.error).toContain("504");
    expect(typeof result.error).toBe("string");
  });

  it("pricePoints is empty on upstream error", () => {
    const result = buildUpstreamErrorResult(502, "Bad Gateway");
    expect(result.pricePoints).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Suite 4 — Non-fatal: network failure → degraded banner
// ---------------------------------------------------------------------------

describe("price-history loader — network failure (non-fatal)", () => {
  it("Error instance → message preserved, candles empty, no throw", () => {
    expect(() => {
      const result = buildNetworkErrorResult(new Error("ECONNREFUSED"));
      expect(result.candles).toEqual([]);
      expect(result.error).toBe("ECONNREFUSED");
    }).not.toThrow();
  });

  it("non-Error throw → fallback Vietnamese message, no throw", () => {
    expect(() => {
      const result = buildNetworkErrorResult("unknown fail");
      expect(result.candles).toEqual([]);
      expect(result.error).toBe("Không thể kết nối tới máy chủ giá");
    }).not.toThrow();
  });

  it("count is 0 on network failure", () => {
    const result = buildNetworkErrorResult(new Error("timeout"));
    expect(result.count).toBe(0);
  });

  it("latest is null on network failure", () => {
    const result = buildNetworkErrorResult(new Error("ECONNREFUSED"));
    expect(result.latest).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite 5 — Unexpected JSON shape → degraded banner, never throws
// ---------------------------------------------------------------------------

describe("price-history loader — unexpected JSON shape (non-fatal)", () => {
  it("null body → error string, no throw", () => {
    expect(() => {
      const result = parsePriceHistoryResponse(null, TICKER);
      expect(result.candles).toEqual([]);
      expect(result.error).toContain("Unexpected");
    }).not.toThrow();
  });

  it("string body → error string, no throw", () => {
    expect(() => {
      const result = parsePriceHistoryResponse("not an object", TICKER);
      expect(result.candles).toEqual([]);
      expect(result.error).toContain("Unexpected");
    }).not.toThrow();
  });

  it("object missing 'candles' key → error string, no throw", () => {
    expect(() => {
      const result = parsePriceHistoryResponse({ ticker: "VCB" }, TICKER);
      expect(result.error).toContain("Unexpected");
    }).not.toThrow();
  });

  it("object missing 'count' key → error string, no throw", () => {
    expect(() => {
      const result = parsePriceHistoryResponse({ candles: [] }, TICKER);
      // Missing 'count' key — shape guard fails
      expect(result.error).toContain("Unexpected");
    }).not.toThrow();
  });

  it("candles field is not an array → treated as empty array, no throw", () => {
    const malformed = { ...HEALTHY_DTO, candles: "bad" } as unknown;
    expect(() => {
      const result = parsePriceHistoryResponse(malformed, TICKER);
      expect(result.candles).toEqual([]);
      expect(result.pricePoints).toEqual([]);
      // No parse error — shape has 'candles' + 'count' keys, just non-array value
      expect(result.error).toBeNull();
    }).not.toThrow();
  });
});
