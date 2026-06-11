/**
 * reaudit-fe-001-stale-banners.test.ts
 *
 * PURE-LOGIC unit tests for NFR-C-1 stale banner feature (REAUDIT-FE-001).
 * Verifies stale/staleByDays fields are parsed from live payload contract
 * and returned correctly by each fetchXxxData helper.
 *
 * Contract verified from LIVE payloads 2026-06-11:
 *   - shareholders: stale=true, staleByDays=3 (asOf 2026-04-14, 58 days old)
 *   - financials: stale=true, staleByDays=43 (asOf 2026-04-15, 57+ days old)
 *   - conviction-history: stale=false, staleByDays=0 (tradingDate 2026-06-09)
 *   - corporate-events: stale=false, staleByDays=0 (asOf 2026-06-08)
 *   - reputation: stale=false, staleByDays=0 (asOf 2026-06-09)
 *
 * Suites:
 *   1. conviction-history — stale=false path: no stale flag
 *   2. conviction-history — stale=true path: staleByDays propagated
 *   3. conviction-history — missing fields: graceful default (false/0)
 *   4. conviction-history — 502 upstream: error set, stale defaults
 *   5. corporate-events — stale=false path: no stale flag
 *   6. corporate-events — stale=true path: staleByDays propagated
 *   7. corporate-events — missing fields: graceful default
 *   8. shareholders — stale=true path (live scenario): staleByDays=3
 *   9. shareholders — stale=false path: no stale flag
 *  10. shareholders — missing fields: graceful default
 *  11. financials — stale=true path (live scenario): staleByDays=43
 *  12. financials — stale=false path: no stale flag
 *  13. financials — missing fields: graceful default
 *  14. reputation — stale=false path: no stale flag
 *  15. reputation — stale=true path: staleByDays propagated
 *  16. reputation — missing fields: graceful default
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchConvictionData } from "../routes/dashboard.conviction-history";
import { fetchCorporateEventsData } from "../routes/dashboard.corporate-events";
import { fetchShareholdersData } from "../routes/dashboard.shareholders";
import { fetchFinancialsData } from "../routes/dashboard.financials";
import { fetchReputationData } from "../routes/dashboard.reputation";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function mockFetch(body: unknown, status = 200) {
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Bad Gateway",
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response);
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Minimal valid DTO factories
// ---------------------------------------------------------------------------

function makeConvictionDto(overrides: Record<string, unknown> = {}) {
  return {
    generatedAt: "2026-06-11T10:00:00Z",
    tradingDate: "2026-06-09",
    stale: false,
    staleByDays: 0,
    snapshot: [],
    series: {},
    summary: {
      symbols: 0, bullish: 0, bearish: 0, neutral: 0, unknown: 0,
      avgPeakScore: null, topBullish: [], topBearish: [],
    },
    count: 0,
    ...overrides,
  };
}

function makeCorporateEventsDto(overrides: Record<string, unknown> = {}) {
  return {
    generatedAt: "2026-06-11T10:00:00Z",
    windowDays: 90,
    since: "2026-03-13",
    asOf: "2026-06-08",
    stale: false,
    staleByDays: 0,
    typeFilter: null,
    events: [],
    byType: [],
    summary: {
      totalEvents: 0, distinctCodes: 0,
      dividend: 0, issuance: 0, insider: 0, meeting: 0, other: 0,
      topActiveCodes: [],
    },
    count: 0,
    ...overrides,
  };
}

function makeShareholdersDto(overrides: Record<string, unknown> = {}) {
  return {
    generatedAt: "2026-06-11T10:00:00Z",
    asOf: "2026-04-14T18:08:47.720Z",
    stale: false,
    staleByDays: 0,
    codes: ["BID"],
    selectedCode: "BID",
    holders: [],
    selectedSummary: null,
    ranking: [],
    count: 1,
    ...overrides,
  };
}

function makeFinancialsDto(overrides: Record<string, unknown> = {}) {
  return {
    generatedAt: "2026-06-11T10:00:00Z",
    asOf: "2026-04-15T10:00:15.953332",
    stale: false,
    staleByDays: 0,
    count: 78,
    rows: [],
    summary: { medianPe: 14.09, medianPb: 1.62, medianRoe: 12.53 },
    rankings: {
      cheapestPe: [], highestRoe: [], highestRevenueYoy: [],
    },
    ...overrides,
  };
}

function makeReputationDto(overrides: Record<string, unknown> = {}) {
  return {
    generatedAt: "2026-06-11T10:00:00Z",
    asOf: "2026-06-09",
    stale: false,
    staleByDays: 0,
    summary: {
      total: 0, avgScore: null,
      byRisk: { safe: 0, watch: 0, warning: 0, danger: 0 },
    },
    leaderboard: [],
    history: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Suite 1: conviction-history — stale=false
// ---------------------------------------------------------------------------

describe("conviction-history — stale=false path", () => {
  it("stale is false when backend returns false", async () => {
    mockFetch(makeConvictionDto({ stale: false, staleByDays: 0 }));
    const result = await fetchConvictionData("http://x");
    expect(result.stale).toBe(false);
  });

  it("staleByDays is 0 when stale=false", async () => {
    mockFetch(makeConvictionDto({ stale: false, staleByDays: 0 }));
    const result = await fetchConvictionData("http://x");
    expect(result.staleByDays).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 2: conviction-history — stale=true
// ---------------------------------------------------------------------------

describe("conviction-history — stale=true path", () => {
  it("stale is true when backend returns true", async () => {
    mockFetch(makeConvictionDto({ stale: true, staleByDays: 5 }));
    const result = await fetchConvictionData("http://x");
    expect(result.stale).toBe(true);
  });

  it("staleByDays=5 propagated correctly", async () => {
    mockFetch(makeConvictionDto({ stale: true, staleByDays: 5 }));
    const result = await fetchConvictionData("http://x");
    expect(result.staleByDays).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Suite 3: conviction-history — missing stale fields → graceful default
// ---------------------------------------------------------------------------

describe("conviction-history — missing stale fields", () => {
  it("stale defaults to false when field absent", async () => {
    const dto = makeConvictionDto();
    const { stale: _s, staleByDays: _sd, ...withoutStale } = dto;
    mockFetch(withoutStale);
    const result = await fetchConvictionData("http://x");
    expect(result.stale).toBe(false);
  });

  it("staleByDays defaults to 0 when field absent", async () => {
    const dto = makeConvictionDto();
    const { stale: _s, staleByDays: _sd, ...withoutStale } = dto;
    mockFetch(withoutStale);
    const result = await fetchConvictionData("http://x");
    expect(result.staleByDays).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 4: conviction-history — 502 upstream
// ---------------------------------------------------------------------------

describe("conviction-history — 502 upstream", () => {
  it("error set, stale=false, staleByDays=0 on 502", async () => {
    mockFetch({ error: "bad gateway" }, 502);
    const result = await fetchConvictionData("http://x");
    expect(result.error).toBeTruthy();
    expect(result.stale).toBe(false);
    expect(result.staleByDays).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 5: corporate-events — stale=false
// ---------------------------------------------------------------------------

describe("corporate-events — stale=false path", () => {
  it("stale is false when backend returns false", async () => {
    mockFetch(makeCorporateEventsDto({ stale: false, staleByDays: 0 }));
    const result = await fetchCorporateEventsData("http://x");
    expect(result.stale).toBe(false);
  });

  it("staleByDays is 0 when stale=false", async () => {
    mockFetch(makeCorporateEventsDto({ stale: false, staleByDays: 0 }));
    const result = await fetchCorporateEventsData("http://x");
    expect(result.staleByDays).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 6: corporate-events — stale=true
// ---------------------------------------------------------------------------

describe("corporate-events — stale=true path", () => {
  it("stale is true when backend returns true", async () => {
    mockFetch(makeCorporateEventsDto({ stale: true, staleByDays: 4 }));
    const result = await fetchCorporateEventsData("http://x");
    expect(result.stale).toBe(true);
  });

  it("staleByDays=4 propagated correctly", async () => {
    mockFetch(makeCorporateEventsDto({ stale: true, staleByDays: 4 }));
    const result = await fetchCorporateEventsData("http://x");
    expect(result.staleByDays).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Suite 7: corporate-events — missing fields
// ---------------------------------------------------------------------------

describe("corporate-events — missing stale fields", () => {
  it("stale defaults to false when field absent", async () => {
    const dto = makeCorporateEventsDto();
    const { stale: _s, staleByDays: _sd, ...withoutStale } = dto;
    mockFetch(withoutStale);
    const result = await fetchCorporateEventsData("http://x");
    expect(result.stale).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Suite 8: shareholders — stale=true (live scenario staleByDays=3)
// ---------------------------------------------------------------------------

describe("shareholders — stale=true (live scenario)", () => {
  it("stale=true and staleByDays=3 from live-shaped payload", async () => {
    mockFetch(makeShareholdersDto({ stale: true, staleByDays: 3 }));
    const result = await fetchShareholdersData("http://x");
    expect(result.stale).toBe(true);
    expect(result.staleByDays).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Suite 9: shareholders — stale=false
// ---------------------------------------------------------------------------

describe("shareholders — stale=false path", () => {
  it("stale is false when backend returns false", async () => {
    mockFetch(makeShareholdersDto({ stale: false, staleByDays: 0 }));
    const result = await fetchShareholdersData("http://x");
    expect(result.stale).toBe(false);
    expect(result.staleByDays).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 10: shareholders — missing fields
// ---------------------------------------------------------------------------

describe("shareholders — missing stale fields", () => {
  it("stale defaults to false when field absent", async () => {
    const dto = makeShareholdersDto();
    const { stale: _s, staleByDays: _sd, ...withoutStale } = dto;
    mockFetch(withoutStale);
    const result = await fetchShareholdersData("http://x");
    expect(result.stale).toBe(false);
    expect(result.staleByDays).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 11: financials — stale=true (live scenario staleByDays=43)
// ---------------------------------------------------------------------------

describe("financials — stale=true (live scenario)", () => {
  it("stale=true and staleByDays=43 from live-shaped payload", async () => {
    mockFetch(makeFinancialsDto({ stale: true, staleByDays: 43 }));
    const result = await fetchFinancialsData("http://x");
    expect(result.stale).toBe(true);
    expect(result.staleByDays).toBe(43);
  });
});

// ---------------------------------------------------------------------------
// Suite 12: financials — stale=false
// ---------------------------------------------------------------------------

describe("financials — stale=false path", () => {
  it("stale is false when backend returns false", async () => {
    mockFetch(makeFinancialsDto({ stale: false, staleByDays: 0 }));
    const result = await fetchFinancialsData("http://x");
    expect(result.stale).toBe(false);
    expect(result.staleByDays).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 13: financials — missing fields
// ---------------------------------------------------------------------------

describe("financials — missing stale fields", () => {
  it("stale defaults to false when field absent", async () => {
    const dto = makeFinancialsDto();
    const { stale: _s, staleByDays: _sd, ...withoutStale } = dto;
    mockFetch(withoutStale);
    const result = await fetchFinancialsData("http://x");
    expect(result.stale).toBe(false);
    expect(result.staleByDays).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 14: reputation — stale=false
// ---------------------------------------------------------------------------

describe("reputation — stale=false path", () => {
  it("stale is false when backend returns false", async () => {
    mockFetch(makeReputationDto({ stale: false, staleByDays: 0 }));
    const result = await fetchReputationData("http://x");
    expect(result.stale).toBe(false);
    expect(result.staleByDays).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 15: reputation — stale=true
// ---------------------------------------------------------------------------

describe("reputation — stale=true path", () => {
  it("stale=true and staleByDays=7 propagated correctly", async () => {
    mockFetch(makeReputationDto({ stale: true, staleByDays: 7 }));
    const result = await fetchReputationData("http://x");
    expect(result.stale).toBe(true);
    expect(result.staleByDays).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// Suite 16: reputation — missing fields
// ---------------------------------------------------------------------------

describe("reputation — missing stale fields", () => {
  it("stale defaults to false when field absent", async () => {
    const dto = makeReputationDto();
    const { stale: _s, staleByDays: _sd, ...withoutStale } = dto;
    mockFetch(withoutStale);
    const result = await fetchReputationData("http://x");
    expect(result.stale).toBe(false);
    expect(result.staleByDays).toBe(0);
  });
});
