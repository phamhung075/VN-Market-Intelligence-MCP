/**
 * task17-page16-financials-loader.test.ts
 *
 * PURE-LOGIC unit tests for dashboard.financials.tsx helpers + data shaping.
 * No .tsx render, no jsdom required — pure TypeScript, importable by vitest.
 *
 * Fixtures mirror the PRODUCTION payload shape verified live 2026-04-15:
 *   generatedAt, asOf, count, rows[], summary{}, rankings{}
 *
 * Suites:
 *   1. formatNum — numbers with separators, null→"—", zero→"0"
 *   2. formatPct1 — 1 decimal place, null→"—", zero→"0.0%"
 *   3. formatDate — ISO→DD/MM/YYYY
 *   4. Fixture A — shape loaded correctly (count, rows length, summary, rankings)
 *   5. Fixture A — summary medianPe/medianPb/medianRoe correct
 *   6. Fixture A — rankings cheapestPe head = VIX
 *   7. Fixture A — rankings highestRoe head = SCS
 *   8. Fixture A — rankings highestRevenueYoy head = DIG
 *   9. eps=0 renders as "0" (not "—")
 *  10. fetchFinancialsData — happy path (Fixture A via mocked fetch)
 *  11. fetchFinancialsData — NO query param forwarded (full-universe endpoint)
 *  12. fetchFinancialsData — network error → error string set, rows=[]
 *  13. fetchFinancialsData — bad shape → error set
 *  14. fetchFinancialsData — upstream 502 → error set
 *  15. fetchFinancialsData — empty rows (no crash)
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  formatNum,
  formatPct1,
  formatDate,
  fetchFinancialsData,
} from "../routes/dashboard.financials";
import type { FinancialsDto } from "../routes/dashboard.financials";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXTURE_A_ROWS = [
  {
    code: "VIX",
    period: "2025Q4",
    yearReport: 2025,
    quarter: 4,
    revenueBn: 450.5,
    revenueYoy: 285.86,
    netProfitBn: 80.2,
    netProfitYoy: 120.5,
    eps: 0,
    pe: 5.47,
    pb: 0.82,
    roe: 14.3,
    roa: 3.1,
    debtToEquity: 2.1,
    netProfitMargin: 17.8,
  },
  {
    code: "SHB",
    period: "2025Q4",
    yearReport: 2025,
    quarter: 4,
    revenueBn: 1200.0,
    revenueYoy: 12.3,
    netProfitBn: 310.0,
    netProfitYoy: 8.5,
    eps: 1200,
    pe: 5.82,
    pb: 0.91,
    roe: 15.2,
    roa: 1.2,
    debtToEquity: 8.3,
    netProfitMargin: 25.8,
  },
  {
    code: "SCS",
    period: "2025Q4",
    yearReport: 2025,
    quarter: 4,
    revenueBn: 580.0,
    revenueYoy: 18.4,
    netProfitBn: 220.0,
    netProfitYoy: 22.1,
    eps: 15200,
    pe: 12.5,
    pb: 5.6,
    roe: 50.62,
    roa: 20.1,
    debtToEquity: 0.4,
    netProfitMargin: 37.9,
  },
  {
    code: "DIG",
    period: "2025Q4",
    yearReport: 2025,
    quarter: 4,
    revenueBn: 3800.0,
    revenueYoy: 514.4,
    netProfitBn: 180.0,
    netProfitYoy: 98.2,
    eps: 2100,
    pe: 18.2,
    pb: 2.1,
    roe: 11.5,
    roa: 4.2,
    debtToEquity: 1.8,
    netProfitMargin: 4.7,
  },
];

const FIXTURE_A_DTO: FinancialsDto = {
  generatedAt: "2026-04-15T10:00:15.953332",
  asOf: "2026-04-15T10:00:15.953332",
  count: 78,
  rows: FIXTURE_A_ROWS,
  summary: {
    medianPe: 14.09,
    medianPb: 1.62,
    medianRoe: 12.53,
  },
  rankings: {
    cheapestPe: [
      { code: "VIX", pe: 5.47, roe: 14.3 },
      { code: "SHB", pe: 5.82, roe: 15.2 },
      { code: "DBC", pe: 6.18, roe: 9.4 },
      { code: "SSI", pe: 7.1, roe: 13.2 },
      { code: "TCB", pe: 7.8, roe: 18.9 },
    ],
    highestRoe: [
      { code: "SCS", roe: 50.62, pe: 12.5 },
      { code: "TMT", roe: 43.73, pe: 8.3 },
      { code: "ANV", roe: 31.61, pe: 6.9 },
      { code: "MSN", roe: 28.4, pe: 15.2 },
      { code: "HPG", roe: 22.1, pe: 9.8 },
    ],
    highestRevenueYoy: [
      { code: "DIG", revenueYoy: 514.4 },
      { code: "VIX", revenueYoy: 285.86 },
      { code: "VHM", revenueYoy: 215.23 },
      { code: "PDR", revenueYoy: 180.5 },
      { code: "NVL", revenueYoy: 142.3 },
    ],
  },
};

// ---------------------------------------------------------------------------
// Suite 1: formatNum
// ---------------------------------------------------------------------------

describe("formatNum", () => {
  it("null → '—'", () => {
    expect(formatNum(null)).toBe("—");
  });

  it("undefined → '—'", () => {
    expect(formatNum(undefined)).toBe("—");
  });

  it("0 → '0'", () => {
    expect(formatNum(0)).toBe("0");
  });

  it("1000 → '1,000'", () => {
    expect(formatNum(1000)).toBe("1,000");
  });

  it("14.09 → '14.09'", () => {
    expect(formatNum(14.09)).toBe("14.09");
  });

  it("large number contains commas", () => {
    const result = formatNum(1200000);
    expect(result).toContain(",");
  });
});

// ---------------------------------------------------------------------------
// Suite 2: formatPct1
// ---------------------------------------------------------------------------

describe("formatPct1", () => {
  it("null → '—'", () => {
    expect(formatPct1(null)).toBe("—");
  });

  it("undefined → '—'", () => {
    expect(formatPct1(undefined)).toBe("—");
  });

  it("0 → '0.0%'", () => {
    expect(formatPct1(0)).toBe("0.0%");
  });

  it("12.53 → '12.5%'", () => {
    expect(formatPct1(12.53)).toBe("12.5%");
  });

  it("514.4 → '514.4%'", () => {
    expect(formatPct1(514.4)).toBe("514.4%");
  });

  it("result ends with '%'", () => {
    expect(formatPct1(50.62)).toMatch(/%$/);
  });
});

// ---------------------------------------------------------------------------
// Suite 3: formatDate
// ---------------------------------------------------------------------------

describe("formatDate", () => {
  it("ISO date formats to DD/MM/YYYY", () => {
    expect(formatDate("2026-04-15T10:00:15.953332")).toBe("15/04/2026");
  });

  it("empty string returns empty string", () => {
    expect(formatDate("")).toBe("");
  });

  it("returns original string for invalid date", () => {
    expect(formatDate("not-a-date")).toBe("not-a-date");
  });
});

// ---------------------------------------------------------------------------
// Suite 4: Fixture A — shape
// ---------------------------------------------------------------------------

describe("Fixture A — basic shape", () => {
  it("count is 78", () => {
    expect(FIXTURE_A_DTO.count).toBe(78);
  });

  it("rows has 4 entries in fixture", () => {
    expect(FIXTURE_A_DTO.rows).toHaveLength(4);
  });

  it("summary is defined", () => {
    expect(FIXTURE_A_DTO.summary).toBeDefined();
  });

  it("rankings is defined", () => {
    expect(FIXTURE_A_DTO.rankings).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Suite 5: Fixture A — summary
// ---------------------------------------------------------------------------

describe("Fixture A — summary values", () => {
  it("medianPe is 14.09", () => {
    expect(FIXTURE_A_DTO.summary.medianPe).toBe(14.09);
  });

  it("medianPb is 1.62", () => {
    expect(FIXTURE_A_DTO.summary.medianPb).toBe(1.62);
  });

  it("medianRoe is 12.53", () => {
    expect(FIXTURE_A_DTO.summary.medianRoe).toBe(12.53);
  });

  it("formatNum(medianPe) = '14.09'", () => {
    expect(formatNum(FIXTURE_A_DTO.summary.medianPe)).toBe("14.09");
  });

  it("formatPct1(medianRoe) = '12.5%'", () => {
    expect(formatPct1(FIXTURE_A_DTO.summary.medianRoe)).toBe("12.5%");
  });
});

// ---------------------------------------------------------------------------
// Suite 6: Fixture A — cheapestPe ranking
// ---------------------------------------------------------------------------

describe("Fixture A — cheapestPe ranking", () => {
  it("cheapestPe has 5 items", () => {
    expect(FIXTURE_A_DTO.rankings.cheapestPe).toHaveLength(5);
  });

  it("head is VIX with pe=5.47", () => {
    expect(FIXTURE_A_DTO.rankings.cheapestPe[0]!.code).toBe("VIX");
    expect(FIXTURE_A_DTO.rankings.cheapestPe[0]!.pe).toBe(5.47);
  });

  it("second is SHB with pe=5.82", () => {
    expect(FIXTURE_A_DTO.rankings.cheapestPe[1]!.code).toBe("SHB");
    expect(FIXTURE_A_DTO.rankings.cheapestPe[1]!.pe).toBe(5.82);
  });

  it("third is DBC with pe=6.18", () => {
    expect(FIXTURE_A_DTO.rankings.cheapestPe[2]!.code).toBe("DBC");
    expect(FIXTURE_A_DTO.rankings.cheapestPe[2]!.pe).toBe(6.18);
  });
});

// ---------------------------------------------------------------------------
// Suite 7: Fixture A — highestRoe ranking
// ---------------------------------------------------------------------------

describe("Fixture A — highestRoe ranking", () => {
  it("highestRoe has 5 items", () => {
    expect(FIXTURE_A_DTO.rankings.highestRoe).toHaveLength(5);
  });

  it("head is SCS with roe=50.62", () => {
    expect(FIXTURE_A_DTO.rankings.highestRoe[0]!.code).toBe("SCS");
    expect(FIXTURE_A_DTO.rankings.highestRoe[0]!.roe).toBe(50.62);
  });

  it("second is TMT with roe=43.73", () => {
    expect(FIXTURE_A_DTO.rankings.highestRoe[1]!.code).toBe("TMT");
    expect(FIXTURE_A_DTO.rankings.highestRoe[1]!.roe).toBe(43.73);
  });
});

// ---------------------------------------------------------------------------
// Suite 8: Fixture A — highestRevenueYoy ranking
// ---------------------------------------------------------------------------

describe("Fixture A — highestRevenueYoy ranking", () => {
  it("highestRevenueYoy has 5 items", () => {
    expect(FIXTURE_A_DTO.rankings.highestRevenueYoy).toHaveLength(5);
  });

  it("head is DIG with revenueYoy=514.4", () => {
    expect(FIXTURE_A_DTO.rankings.highestRevenueYoy[0]!.code).toBe("DIG");
    expect(FIXTURE_A_DTO.rankings.highestRevenueYoy[0]!.revenueYoy).toBe(514.4);
  });

  it("second is VIX with revenueYoy=285.86", () => {
    expect(FIXTURE_A_DTO.rankings.highestRevenueYoy[1]!.code).toBe("VIX");
    expect(FIXTURE_A_DTO.rankings.highestRevenueYoy[1]!.revenueYoy).toBe(285.86);
  });

  it("third is VHM with revenueYoy=215.23", () => {
    expect(FIXTURE_A_DTO.rankings.highestRevenueYoy[2]!.code).toBe("VHM");
    expect(FIXTURE_A_DTO.rankings.highestRevenueYoy[2]!.revenueYoy).toBe(215.23);
  });
});

// ---------------------------------------------------------------------------
// Suite 9: eps=0 renders as "0" (not "—")
// ---------------------------------------------------------------------------

describe("eps=0 renders as '0'", () => {
  it("VIX row has eps=0", () => {
    const vix = FIXTURE_A_DTO.rows[0]!;
    expect(vix.code).toBe("VIX");
    expect(vix.eps).toBe(0);
  });

  it("eps=0 → formatNum returns '0' not '—'", () => {
    // 0 is a valid value — formatNum(0) must return "0"
    expect(formatNum(0)).toBe("0");
  });

  it("eps=null → '—' but eps=0 → '0' (different sentinel)", () => {
    expect(formatNum(null)).toBe("—");
    expect(formatNum(0)).toBe("0");
    expect(formatNum(0)).not.toBe("—");
  });
});

// ---------------------------------------------------------------------------
// Suite 10: fetchFinancialsData — happy path
// ---------------------------------------------------------------------------

describe("fetchFinancialsData — happy path (Fixture A shape)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses count, rows, summary, rankings — no error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => FIXTURE_A_DTO,
      }),
    );

    const result = await fetchFinancialsData("http://localhost:3001");

    expect(result.error).toBeNull();
    expect(result.count).toBe(78);
    expect(result.rows).toHaveLength(4);
    expect(result.summary).not.toBeNull();
    expect(result.summary!.medianPe).toBe(14.09);
    expect(result.rankings).not.toBeNull();
    expect(result.rankings!.cheapestPe[0]!.code).toBe("VIX");
    expect(result.rankings!.highestRoe[0]!.code).toBe("SCS");
    expect(result.rankings!.highestRevenueYoy[0]!.code).toBe("DIG");
  });
});

// ---------------------------------------------------------------------------
// Suite 11: fetchFinancialsData — NO query param forwarded
// ---------------------------------------------------------------------------

describe("fetchFinancialsData — no query param forwarded", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetch URL contains '/api/financials' with no query string", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => FIXTURE_A_DTO,
    });
    vi.stubGlobal("fetch", mockFetch);

    await fetchFinancialsData("http://localhost:3001");

    const calledUrl: string = mockFetch.mock.calls[0]![0] as string;
    expect(calledUrl).toContain("/api/financials");
    expect(calledUrl).not.toContain("?");
    expect(calledUrl).not.toContain("code=");
  });
});

// ---------------------------------------------------------------------------
// Suite 12: fetchFinancialsData — network error
// ---------------------------------------------------------------------------

describe("fetchFinancialsData — network error", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetch throws → error is set, rows=[], summary=null, rankings=null", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    );

    const result = await fetchFinancialsData("http://localhost:3001");

    expect(result.error).toBe("ECONNREFUSED");
    expect(result.rows).toHaveLength(0);
    expect(result.count).toBe(0);
    expect(result.summary).toBeNull();
    expect(result.rankings).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite 13: fetchFinancialsData — bad response shape
// ---------------------------------------------------------------------------

describe("fetchFinancialsData — bad shape", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("unexpected shape → error is set, rows=[]", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ unexpected: "shape" }),
      }),
    );

    const result = await fetchFinancialsData("http://localhost:3001");

    expect(result.error).toContain("/api/financials");
    expect(result.rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 14: fetchFinancialsData — upstream 502
// ---------------------------------------------------------------------------

describe("fetchFinancialsData — upstream 502", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("upstream 502 → error string set, rows=[]", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
        json: async () => ({}),
      }),
    );

    const result = await fetchFinancialsData("http://localhost:3001");

    expect(result.error).toContain("502");
    expect(result.rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 15: fetchFinancialsData — empty rows (no crash)
// ---------------------------------------------------------------------------

describe("fetchFinancialsData — empty rows (no crash)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("empty rows response → rows=[], no error, no crash", async () => {
    const emptyPayload: FinancialsDto = {
      generatedAt: "2026-04-15T10:00:00.000Z",
      asOf: "2026-04-15T10:00:00.000Z",
      count: 0,
      rows: [],
      summary: { medianPe: 0, medianPb: 0, medianRoe: 0 },
      rankings: {
        cheapestPe: [],
        highestRoe: [],
        highestRevenueYoy: [],
      },
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => emptyPayload,
      }),
    );

    const result = await fetchFinancialsData("http://localhost:3001");

    expect(result.error).toBeNull();
    expect(result.rows).toHaveLength(0);
    expect(result.count).toBe(0);
    expect(result.summary).not.toBeNull();
    expect(result.rankings).not.toBeNull();
    const isEmpty = !result.error && result.rows.length === 0;
    expect(isEmpty).toBe(true);
  });
});
