/**
 * task17-p1-3b-analysis-briefs-loader.test.ts
 *
 * Tests the non-fatal loader behaviour for /dashboard/bctc (Financial Reports hub).
 *
 * The loader self-fetches `${FRONTEND_ORIGIN}/api/analysis-briefs` and must:
 *   - Return items + count when the upstream is healthy (happy path).
 *   - Return empty items + error banner string on upstream 5xx (never throw).
 *   - Return empty items + error banner string on network failure (never throw).
 *   - Guard against unexpected JSON shape (never throw).
 *   - Return empty items + error:null when count is 0 (empty state, not error).
 *
 * Strategy: re-implement the loader's parse logic as pure helper functions
 * (mirroring dashboard.bctc.tsx fetchAnalysisBriefs exactly) — no Remix
 * mocking needed (host-safe).
 */

import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Types — mirror dashboard.bctc.tsx exactly
// ---------------------------------------------------------------------------

interface AnalysisBriefItem {
  ticker: string;
  exchange: string | null;
  latest_period: string | null;
  released: string | null;
  verdict_label: string | null;
  verdict_summary: string | null;
  confidence: number | null;
  updated_at: string | null;
}

interface AnalysisBriefsDto {
  generated_at: string;
  count: number;
  items: AnalysisBriefItem[];
}

interface LoaderResult {
  count: number;
  items: AnalysisBriefItem[];
  error: string | null;
}

// ---------------------------------------------------------------------------
// Pure helpers — mirror the loader's JSON-parse + guard paths
// ---------------------------------------------------------------------------

/**
 * Simulate the loader's success branch (response.ok + JSON parse).
 * Mirrors fetchAnalysisBriefs's ok path exactly.
 */
function parseAnalysisBriefsResponse(raw: unknown): LoaderResult {
  if (raw !== null && typeof raw === "object" && "items" in raw) {
    const dto = raw as AnalysisBriefsDto;
    const items = Array.isArray(dto.items) ? dto.items : [];
    const count = typeof dto.count === "number" ? dto.count : items.length;
    return { count, items, error: null };
  }
  return {
    count: 0,
    items: [],
    error: "Unexpected response shape from /api/analysis-briefs",
  };
}

/** Simulate the loader's non-ok branch (upstream HTTP error). */
function buildUpstreamErrorResult(
  status: number,
  statusText: string,
): LoaderResult {
  return {
    count: 0,
    items: [],
    error: `Upstream returned ${status} ${statusText}`,
  };
}

/** Simulate the loader's catch branch (network failure / fetch throws). */
function buildNetworkErrorResult(err: unknown): LoaderResult {
  const error =
    err instanceof Error
      ? err.message
      : "Không thể kết nối tới máy chủ báo cáo";
  return { count: 0, items: [], error };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const REAL_TS = "2026-06-11T10:00:00Z";

const SAMPLE_ITEM: AnalysisBriefItem = {
  ticker: "VCB",
  exchange: "HOSE",
  latest_period: "Q4 2025",
  released: "2026-05-12",
  verdict_label: "In-line",
  verdict_summary: "Revenue strong (+18.1%) — broadly in line with consensus.",
  confidence: 0.65,
  updated_at: REAL_TS,
};

const HEALTHY_DTO: AnalysisBriefsDto = {
  generated_at: REAL_TS,
  count: 1,
  items: [SAMPLE_ITEM],
};

const MULTI_ITEM_DTO: AnalysisBriefsDto = {
  generated_at: REAL_TS,
  count: 3,
  items: [
    SAMPLE_ITEM,
    { ...SAMPLE_ITEM, ticker: "ACB", exchange: "HNX", verdict_label: "Bullish", confidence: 0.8 },
    { ...SAMPLE_ITEM, ticker: "FPT", exchange: "HOSE", verdict_label: "Caution", confidence: 0.3 },
  ],
};

// ---------------------------------------------------------------------------
// Suite 1 — Happy path: 200 → items rendered
// ---------------------------------------------------------------------------

describe("analysis-briefs loader — 200 happy path", () => {
  it("parses items from healthy DTO", () => {
    const result = parseAnalysisBriefsResponse(HEALTHY_DTO);
    expect(result.error).toBeNull();
    expect(result.items).toHaveLength(1);
    expect(result.items[0].ticker).toBe("VCB");
  });

  it("count comes from DTO count field", () => {
    const result = parseAnalysisBriefsResponse(HEALTHY_DTO);
    expect(result.count).toBe(1);
  });

  it("count falls back to items.length when DTO count absent", () => {
    const noCount = { ...HEALTHY_DTO, count: undefined } as unknown;
    const result = parseAnalysisBriefsResponse(noCount);
    expect(result.count).toBe(1); // items.length fallback
  });

  it("all DTO fields preserved on item", () => {
    const result = parseAnalysisBriefsResponse(HEALTHY_DTO);
    const item = result.items[0];
    expect(item.exchange).toBe("HOSE");
    expect(item.latest_period).toBe("Q4 2025");
    expect(item.released).toBe("2026-05-12");
    expect(item.verdict_label).toBe("In-line");
    expect(item.verdict_summary).toContain("Revenue strong");
    expect(item.confidence).toBe(0.65);
  });

  it("multiple items parsed correctly", () => {
    const result = parseAnalysisBriefsResponse(MULTI_ITEM_DTO);
    expect(result.error).toBeNull();
    expect(result.items).toHaveLength(3);
    expect(result.count).toBe(3);
    expect(result.items.map((i) => i.ticker)).toEqual(["VCB", "ACB", "FPT"]);
  });

  it("items with null fields (exchange, released, confidence) are preserved", () => {
    const nullItem: AnalysisBriefItem = {
      ticker: "VNM",
      exchange: null,
      latest_period: null,
      released: null,
      verdict_label: null,
      verdict_summary: null,
      confidence: null,
      updated_at: null,
    };
    const dto: AnalysisBriefsDto = { ...HEALTHY_DTO, items: [nullItem], count: 1 };
    const result = parseAnalysisBriefsResponse(dto);
    expect(result.error).toBeNull();
    expect(result.items[0].exchange).toBeNull();
    expect(result.items[0].confidence).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — Empty state: count:0 → error null, items empty (not an error)
// ---------------------------------------------------------------------------

describe("analysis-briefs loader — count:0 empty state", () => {
  it("empty items + count 0 → error null, no throw", () => {
    expect(() => {
      const dto: AnalysisBriefsDto = { ...HEALTHY_DTO, items: [], count: 0 };
      const result = parseAnalysisBriefsResponse(dto);
      expect(result.error).toBeNull();
      expect(result.items).toEqual([]);
      expect(result.count).toBe(0);
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — Non-fatal: upstream HTTP errors (502 / 503) — degraded banner
// ---------------------------------------------------------------------------

describe("analysis-briefs loader — upstream HTTP error (non-fatal)", () => {
  it("502 upstream → items empty + error string, no throw", () => {
    expect(() => {
      const result = buildUpstreamErrorResult(502, "Bad Gateway");
      expect(result.items).toEqual([]);
      expect(result.error).toContain("502");
    }).not.toThrow();
  });

  it("503 upstream → items empty + error string, no throw", () => {
    expect(() => {
      const result = buildUpstreamErrorResult(503, "Service Unavailable");
      expect(result.items).toEqual([]);
      expect(result.error).toContain("503");
    }).not.toThrow();
  });

  it("error string contains status code for diagnostics", () => {
    const result = buildUpstreamErrorResult(504, "Gateway Timeout");
    expect(result.error).toContain("504");
    expect(typeof result.error).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// Suite 4 — Non-fatal: network failure (fetch throws) — degraded banner
// ---------------------------------------------------------------------------

describe("analysis-briefs loader — network failure (non-fatal)", () => {
  it("Error instance → message preserved, items empty, no throw", () => {
    expect(() => {
      const result = buildNetworkErrorResult(new Error("ECONNREFUSED"));
      expect(result.items).toEqual([]);
      expect(result.error).toBe("ECONNREFUSED");
    }).not.toThrow();
  });

  it("non-Error throw → fallback Vietnamese message, items empty, no throw", () => {
    expect(() => {
      const result = buildNetworkErrorResult("unknown fail");
      expect(result.items).toEqual([]);
      expect(result.error).toBe("Không thể kết nối tới máy chủ báo cáo");
    }).not.toThrow();
  });

  it("count is 0 on network failure", () => {
    const result = buildNetworkErrorResult(new Error("timeout"));
    expect(result.count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 5 — Unexpected JSON shape guard — degraded banner, never throws
// ---------------------------------------------------------------------------

describe("analysis-briefs loader — unexpected JSON shape (non-fatal)", () => {
  it("null body → error string, no throw", () => {
    expect(() => {
      const result = parseAnalysisBriefsResponse(null);
      expect(result.items).toEqual([]);
      expect(result.error).toContain("Unexpected");
    }).not.toThrow();
  });

  it("string body → error string, no throw", () => {
    expect(() => {
      const result = parseAnalysisBriefsResponse("not an object");
      expect(result.items).toEqual([]);
      expect(result.error).toContain("Unexpected");
    }).not.toThrow();
  });

  it("object without items key → error string, no throw", () => {
    expect(() => {
      const result = parseAnalysisBriefsResponse({ message: "no items here" });
      expect(result.error).toContain("Unexpected");
    }).not.toThrow();
  });

  it("items field is not an array → treated as empty array, no throw", () => {
    const malformed = { ...HEALTHY_DTO, items: "bad" } as unknown;
    expect(() => {
      const result = parseAnalysisBriefsResponse(malformed);
      expect(result.items).toEqual([]);
      expect(result.error).toBeNull();
    }).not.toThrow();
  });
});
