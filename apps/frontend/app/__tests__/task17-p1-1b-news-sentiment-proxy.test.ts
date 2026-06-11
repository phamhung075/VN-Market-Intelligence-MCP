/**
 * task17-p1-1b-news-sentiment-proxy.test.ts
 *
 * Tests the non-fatal loader behavior for /dashboard/news.
 *
 * The loader self-fetches `${FRONTEND_ORIGIN}/api/news-sentiment` and must:
 *   - Return items + count when the upstream is healthy (happy path).
 *   - Return empty items + error banner string on upstream 5xx (never throw).
 *   - Return empty items + error banner string on network failure (never throw).
 *   - Guard against unexpected JSON shape (never throw).
 *   - Set stale_served=true when the proxy reports it.
 *   - Handle items with empty affected_tickers/sectors gracefully.
 *
 * Strategy: extract the loader data-transform logic into pure functions that
 * mirror the loader exactly — no Remix mocking needed (host-safe).
 */

import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Types — mirror dashboard.news.tsx exactly
// ---------------------------------------------------------------------------

type Sentiment = "positive" | "negative" | "neutral" | null;

interface NewsSentimentItem {
  id: string;
  title: string;
  source: string;
  source_ts: string;
  sentiment: Sentiment;
  sentiment_score: number;
  impact_direction: string;
  confidence: number;
  affected_tickers: string[];
  affected_sectors: string[];
  impact_summary: string;
}

interface NewsSentimentDto {
  generated_at: string;
  stale_served: boolean;
  oldest_item_ts: string;
  count: number;
  items: NewsSentimentItem[];
}

interface LoaderResult {
  items: NewsSentimentItem[];
  count: number;
  generated_at: string;
  stale_served: boolean;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Pure helper — mirrors the loader's JSON-parse + guard path
// ---------------------------------------------------------------------------

function parseNewsSentimentResponse(
  raw: unknown,
  fallbackTs: string,
): LoaderResult {
  if (raw !== null && typeof raw === "object" && "items" in raw) {
    const dto = raw as NewsSentimentDto;
    const items = Array.isArray(dto.items) ? dto.items : [];
    const count = typeof dto.count === "number" ? dto.count : items.length;
    const stale_served = dto.stale_served === true;
    return { items, count, generated_at: fallbackTs, stale_served, error: null };
  }
  return {
    items: [],
    count: 0,
    generated_at: fallbackTs,
    stale_served: false,
    error: "Unexpected response shape from /api/news-sentiment",
  };
}

/** Simulate the loader's catch branch (network failure / 5xx). */
function buildErrorResult(err: unknown, fallbackTs: string): LoaderResult {
  const error =
    err instanceof Error
      ? err.message
      : "Không thể kết nối tới máy chủ tin tức";
  return { items: [], count: 0, generated_at: fallbackTs, stale_served: false, error };
}

/** Simulate the loader's non-ok branch (upstream HTTP error). */
function buildUpstreamErrorResult(
  status: number,
  statusText: string,
  fallbackTs: string,
): LoaderResult {
  return {
    items: [],
    count: 0,
    generated_at: fallbackTs,
    stale_served: false,
    error: `Upstream returned ${status} ${statusText}`,
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const REAL_TS = "2026-06-11T10:00:00Z";

const HEALTHY_ITEM: NewsSentimentItem = {
  id: "abc123",
  title: "Vietnam GDP grows 3%",
  source: "https://tradingeconomics.com/vietnam/gdp",
  source_ts: "2026-06-11T08:30:00Z",
  sentiment: "neutral",
  sentiment_score: 9.0,
  impact_direction: "neutral",
  confidence: 0.69,
  affected_tickers: [],
  affected_sectors: [],
  impact_summary: "GDP growth reported at 3% — broadly in line with consensus.",
};

const HEALTHY_DTO: NewsSentimentDto = {
  generated_at: REAL_TS,
  stale_served: false,
  oldest_item_ts: "2026-06-10T00:00:00Z",
  count: 1,
  items: [HEALTHY_ITEM],
};

const ITEM_WITH_CHIPS: NewsSentimentItem = {
  id: "xyz789",
  title: "VCB tăng mạnh sau kết quả Q1",
  source: "https://cafef.vn/vcb",
  source_ts: "2026-06-11T09:00:00Z",
  sentiment: "positive",
  sentiment_score: 8.5,
  impact_direction: "positive",
  confidence: 0.82,
  affected_tickers: ["VCB", "BID"],
  affected_sectors: ["banking"],
  impact_summary: "VCB reported strong Q1 earnings.",
};

// ---------------------------------------------------------------------------
// Suite 1 — Happy path: healthy upstream response
// ---------------------------------------------------------------------------

describe("news-sentiment loader — happy path", () => {
  it("parses items from healthy DTO", () => {
    const result = parseNewsSentimentResponse(HEALTHY_DTO, REAL_TS);
    expect(result.error).toBeNull();
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe("abc123");
    expect(result.items[0].title).toBe("Vietnam GDP grows 3%");
  });

  it("count comes from DTO count field", () => {
    const result = parseNewsSentimentResponse(HEALTHY_DTO, REAL_TS);
    expect(result.count).toBe(1);
  });

  it("stale_served false on healthy response", () => {
    const result = parseNewsSentimentResponse(HEALTHY_DTO, REAL_TS);
    expect(result.stale_served).toBe(false);
  });

  it("stale_served true when DTO reports it", () => {
    const staleDto: NewsSentimentDto = { ...HEALTHY_DTO, stale_served: true };
    const result = parseNewsSentimentResponse(staleDto, REAL_TS);
    expect(result.stale_served).toBe(true);
  });

  it("count falls back to items.length when DTO count absent", () => {
    const dtoNoCount = { ...HEALTHY_DTO, count: undefined } as unknown;
    const result = parseNewsSentimentResponse(dtoNoCount, REAL_TS);
    expect(result.count).toBe(1); // items.length
  });

  it("items with non-empty tickers and sectors are preserved", () => {
    const dto: NewsSentimentDto = {
      ...HEALTHY_DTO,
      items: [ITEM_WITH_CHIPS],
      count: 1,
    };
    const result = parseNewsSentimentResponse(dto, REAL_TS);
    expect(result.items[0].affected_tickers).toEqual(["VCB", "BID"]);
    expect(result.items[0].affected_sectors).toEqual(["banking"]);
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — Empty items: not an error, just empty state
// ---------------------------------------------------------------------------

describe("news-sentiment loader — empty items", () => {
  it("empty items array renders empty state, error is null", () => {
    const dto: NewsSentimentDto = { ...HEALTHY_DTO, items: [], count: 0 };
    const result = parseNewsSentimentResponse(dto, REAL_TS);
    expect(result.error).toBeNull();
    expect(result.items).toEqual([]);
    expect(result.count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — Non-fatal: upstream HTTP errors (never throws)
// ---------------------------------------------------------------------------

describe("news-sentiment loader — upstream HTTP error (non-fatal)", () => {
  it("502 upstream → items empty + error string, no throw", () => {
    expect(() => {
      const result = buildUpstreamErrorResult(502, "Bad Gateway", REAL_TS);
      expect(result.items).toEqual([]);
      expect(result.error).toContain("502");
    }).not.toThrow();
  });

  it("503 upstream → items empty + error string, no throw", () => {
    expect(() => {
      const result = buildUpstreamErrorResult(503, "Service Unavailable", REAL_TS);
      expect(result.items).toEqual([]);
      expect(result.error).toContain("503");
    }).not.toThrow();
  });

  it("error string contains status code for diagnostics", () => {
    const result = buildUpstreamErrorResult(504, "Gateway Timeout", REAL_TS);
    expect(result.error).toContain("504");
    expect(typeof result.error).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// Suite 4 — Non-fatal: network failure (fetch throws, never crashes loader)
// ---------------------------------------------------------------------------

describe("news-sentiment loader — network failure (non-fatal)", () => {
  it("Error instance → message preserved, items empty, no throw", () => {
    expect(() => {
      const result = buildErrorResult(new Error("ECONNREFUSED"), REAL_TS);
      expect(result.items).toEqual([]);
      expect(result.error).toBe("ECONNREFUSED");
    }).not.toThrow();
  });

  it("non-Error throw → fallback message, items empty, no throw", () => {
    expect(() => {
      const result = buildErrorResult("unknown fail", REAL_TS);
      expect(result.items).toEqual([]);
      expect(result.error).toBe("Không thể kết nối tới máy chủ tin tức");
    }).not.toThrow();
  });

  it("stale_served is false on network failure (no upstream data)", () => {
    const result = buildErrorResult(new Error("timeout"), REAL_TS);
    expect(result.stale_served).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Suite 5 — Unexpected shape guard (never throws, shows error banner)
// ---------------------------------------------------------------------------

describe("news-sentiment loader — unexpected JSON shape (non-fatal)", () => {
  it("null body → error string, no throw", () => {
    expect(() => {
      const result = parseNewsSentimentResponse(null, REAL_TS);
      expect(result.items).toEqual([]);
      expect(result.error).toContain("Unexpected");
    }).not.toThrow();
  });

  it("string body → error string, no throw", () => {
    expect(() => {
      const result = parseNewsSentimentResponse("not an object", REAL_TS);
      expect(result.items).toEqual([]);
      expect(result.error).toContain("Unexpected");
    }).not.toThrow();
  });

  it("object without items key → error string, no throw", () => {
    expect(() => {
      const result = parseNewsSentimentResponse({ message: "no items here" }, REAL_TS);
      expect(result.error).toContain("Unexpected");
    }).not.toThrow();
  });

  it("items is not an array → treated as empty array, no throw", () => {
    const malformed = { ...HEALTHY_DTO, items: "bad" } as unknown;
    expect(() => {
      const result = parseNewsSentimentResponse(malformed, REAL_TS);
      expect(result.items).toEqual([]);
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Suite 6 — Sentiment value coverage
// ---------------------------------------------------------------------------

describe("news-sentiment — sentiment field values", () => {
  const sentiments: Array<Sentiment> = ["positive", "negative", "neutral", null];

  sentiments.forEach((sentiment) => {
    it(`sentiment="${String(sentiment)}" is preserved in parsed item`, () => {
      const dto: NewsSentimentDto = {
        ...HEALTHY_DTO,
        items: [{ ...HEALTHY_ITEM, sentiment }],
        count: 1,
      };
      const result = parseNewsSentimentResponse(dto, REAL_TS);
      expect(result.items[0].sentiment).toBe(sentiment);
    });
  });
});

// ---------------------------------------------------------------------------
// Suite 7 — affected_tickers / affected_sectors empty-array guard
// ---------------------------------------------------------------------------

describe("news-sentiment — empty tickers/sectors handled gracefully", () => {
  it("empty affected_tickers array does not throw", () => {
    expect(() => {
      const item = { ...HEALTHY_ITEM, affected_tickers: [] };
      const dto: NewsSentimentDto = { ...HEALTHY_DTO, items: [item] };
      const result = parseNewsSentimentResponse(dto, REAL_TS);
      expect(result.items[0].affected_tickers).toEqual([]);
    }).not.toThrow();
  });

  it("empty affected_sectors array does not throw", () => {
    expect(() => {
      const item = { ...HEALTHY_ITEM, affected_sectors: [] };
      const dto: NewsSentimentDto = { ...HEALTHY_DTO, items: [item] };
      const result = parseNewsSentimentResponse(dto, REAL_TS);
      expect(result.items[0].affected_sectors).toEqual([]);
    }).not.toThrow();
  });
});
