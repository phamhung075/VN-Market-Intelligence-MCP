/**
 * TASK17-PAGE16 — GET /api/financials
 *
 * Cross-sectional Valuation & Fundamentals Screener.
 * Pure-function unit tests on in-code fixture data.
 * Does NOT hit the real DB — all store calls are replaced by fixture arrays
 * (in-memory SQLite via initDatabase() for the HTTP handler integration tests).
 *
 * AC-1:  computeMedian — empty→null, single, odd-n, even-n (0-based floor(n/2) index rule),
 *          non-finite filtered, sorted ascending
 * AC-2:  mapRow — period string synthesis `${yearReport}Q${quarter}`, camelCase passthrough,
 *          numeric values UNROUNDED
 * AC-3:  buildRankings — cheapestPe (pe>0 filter, pe ASC, code ASC tie-break, top 5),
 *          highestRoe (roe DESC, code ASC tie-break, top 5),
 *          highestRevenueYoy (revenueYoy DESC, code ASC tie-break, top 5)
 * AC-4:  buildSummary — count, medianPe/Pb/Roe all computed + rounded
 * AC-5:  handleGetFinancialsHttp — assembled response shape against in-memory fixture,
 *          empty-state, 500 on DB error
 *
 * DDD layer: interface + infrastructure tested together at the helper seam.
 * Isolation: in-memory SQLite, reset per test via initDatabase().
 */

// Must be set before importing schema module
Bun.env["DB_PATH"] = ":memory:";
if (Bun.env["DB_PATH"] !== ":memory:") {
  throw new Error(`[TASK17-PAGE16] DB_PATH must be ':memory:', got: ${Bun.env["DB_PATH"]}`);
}

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import {
  computeMedian,
  mapRow,
  buildSummary,
  buildRankings,
  handleGetFinancials,
  handleGetFinancialsHttp,
  type FinancialsResponse,
  type ScreenerRow,
  type ScreenerSummary,
  type ScreenerRankings,
  type YoyDirection,
} from "../interface/mcp/routes/financialsHandler.js";
import type { FinancialRow } from "../infrastructure/db/financialsStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  closeDb();
  await initDatabase();
});
afterEach(() => {
  closeDb();
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeMockRes() {
  const mock = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: "",
    writeHead(status: number, headers?: Record<string, string>) {
      this.statusCode = status;
      if (headers) Object.assign(this.headers, headers);
    },
    end(data: string) {
      this.body = data;
    },
  };
  return mock;
}

function makeFakeReq(url: string = "/api/financials"): import("node:http").IncomingMessage {
  return { url } as import("node:http").IncomingMessage;
}

/**
 * Insert a vnstock_financials row directly via raw SQL.
 */
function insertFinancial(opts: {
  code: string;
  year_report: number;
  quarter: number;
  revenue_bn?: number | null;
  revenue_yoy?: number | null;
  net_profit_bn?: number | null;
  net_profit_yoy?: number | null;
  eps?: number | null;
  pe?: number | null;
  pb?: number | null;
  roe?: number | null;
  roa?: number | null;
  debt_to_equity?: number | null;
  net_profit_margin?: number | null;
  nim?: number | null;
  npl?: number | null;
  fetched_at?: string;
}): void {
  const db = getDb();
  const {
    code,
    year_report,
    quarter,
    revenue_bn = null,
    revenue_yoy = null,
    net_profit_bn = null,
    net_profit_yoy = null,
    eps = null,
    pe = null,
    pb = null,
    roe = null,
    roa = null,
    debt_to_equity = null,
    net_profit_margin = null,
    nim = null,
    npl = null,
    fetched_at = "2026-06-10T12:00:00.000Z",
  } = opts;
  db.prepare(
    `INSERT OR IGNORE INTO vnstock_financials
       (code, year_report, quarter, revenue_bn, revenue_yoy, net_profit_bn, net_profit_yoy,
        eps, pe, pb, roe, roa, debt_to_equity, net_profit_margin, nim, npl, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    code, year_report, quarter,
    revenue_bn, revenue_yoy, net_profit_bn, net_profit_yoy,
    eps, pe, pb, roe, roa, debt_to_equity, net_profit_margin, nim, npl,
    fetched_at,
  );
}

/**
 * Seed a small realistic fixture corpus (3 codes).
 * FPT: 2024Q4 — well-known tech stock
 * VCB: 2024Q4 — large bank with NIM/NPL
 * HPG: 2024Q4 — steel, high revenue
 */
function seedFixtureCorpus(): void {
  insertFinancial({
    code: "FPT", year_report: 2024, quarter: 4,
    revenue_bn: 7200, revenue_yoy: 22.5,
    net_profit_bn: 850, net_profit_yoy: 18.3,
    eps: 6200, pe: 18.5, pb: 3.2, roe: 25.4, roa: 8.1,
    debt_to_equity: 0.45, net_profit_margin: 11.8,
  });
  insertFinancial({
    code: "VCB", year_report: 2024, quarter: 4,
    revenue_bn: 12000, revenue_yoy: 10.2,
    net_profit_bn: 3500, net_profit_yoy: 9.5,
    eps: 8900, pe: 14.2, pb: 2.1, roe: 18.0, roa: 1.5,
    debt_to_equity: 9.8, nim: 3.1, npl: 0.9,
  });
  insertFinancial({
    code: "HPG", year_report: 2024, quarter: 4,
    revenue_bn: 35000, revenue_yoy: 5.8,
    net_profit_bn: 1200, net_profit_yoy: -8.0,
    eps: 2800, pe: 9.3, pb: 1.1, roe: 10.2, roa: 5.0,
    debt_to_equity: 0.62,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// AC-1: computeMedian
// ─────────────────────────────────────────────────────────────────────────────

describe("computeMedian", () => {
  it("AC-1: empty array → null", () => {
    expect(computeMedian([])).toBeNull();
  });

  it("AC-1: all-null array → null", () => {
    expect(computeMedian([null, null, null])).toBeNull();
  });

  it("AC-1: single value → that value rounded 2dp", () => {
    expect(computeMedian([14.09])).toBe(14.09);
  });

  it("AC-1: single non-round value → rounded 2dp", () => {
    expect(computeMedian([14.0951])).toBe(14.1);
  });

  it("AC-1: odd-n (3) → middle element index 1", () => {
    // sorted: [5, 10, 20] — floor(3/2) = index 1 = 10
    expect(computeMedian([20, 5, 10])).toBe(10);
  });

  it("AC-1: even-n (4) → floor(4/2)=index 2 (NOT average of middle two)", () => {
    // sorted: [1, 2, 3, 4] — floor(4/2) = index 2 = 3
    // This is load-bearing: do NOT average 2+3=2.5
    expect(computeMedian([3, 1, 4, 2])).toBe(3);
  });

  it("AC-1: even-n (2) → floor(2/2)=index 1", () => {
    // sorted: [5, 10] — floor(2/2) = index 1 = 10
    expect(computeMedian([5, 10])).toBe(10);
  });

  it("AC-1: n=78 (live universe size) — floor(78/2)=index 39 (0-based 40th element)", () => {
    // Simulate sorted ascending pe values; index 39 is the 40th element
    const vals = Array.from({ length: 78 }, (_, i) => i + 1.0); // 1.0, 2.0, ..., 78.0
    // sorted[39] = 40.0
    expect(computeMedian(vals)).toBe(40.0);
  });

  it("AC-1: NaN filtered out", () => {
    expect(computeMedian([NaN, 10, 20] as unknown as number[])).toBe(20);
  });

  it("AC-1: Infinity filtered out", () => {
    expect(computeMedian([Infinity, 10, 20])).toBe(20);
  });

  it("AC-1: mixed null and valid values → ignores nulls", () => {
    // sorted finite: [5, 10, 20] — floor(3/2) = index 1 = 10
    expect(computeMedian([null, 20, 5, null, 10])).toBe(10);
  });

  it("AC-1: sorted ASCENDING (not DESC) before selecting", () => {
    // If sorted DESC, floor(3/2)=index 1 of [20,10,5] = 10 (same result here)
    // Use case where direction matters: [1,2,100] floor(3/2)=index1=2 (asc) vs 2 (desc) — pick one where asc is distinct
    // sorted asc: [1, 2, 100] → index 1 = 2
    // sorted desc: [100, 2, 1] → index 1 = 2 — same
    // Use n=4: [1,2,3,100] asc index 2 = 3; desc [100,3,2,1] index 2 = 2 — DIFFERENT
    expect(computeMedian([100, 1, 2, 3])).toBe(3); // sorted asc: [1,2,3,100] index 2=3
  });

  it("AC-1: rounding to 2dp", () => {
    // sorted: [1.005] → rounded to 2dp = 1.01 (JS rounding: 1.005*100=100.5 → 101 → 1.01)
    expect(computeMedian([1.115, 1.125, 1.135])).toBe(1.13); // sorted index 1 = 1.125 → 1.13? check
    // sorted: [1.115, 1.125, 1.135], index 1 = 1.125, Math.round(1.125*100)/100 = Math.round(112.5)/100 = 113/100 = 1.13
    // Actually Math.round(112.5) = 113 in most JS engines
    // Let's use simpler values
    expect(computeMedian([14.094, 14.096])).toBe(14.1); // sorted index 1 = 14.096, rounds to 14.1
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-2: mapRow
// ─────────────────────────────────────────────────────────────────────────────

describe("mapRow", () => {
  const baseRow: FinancialRow = {
    code: "FPT",
    yearReport: 2024,
    quarter: 4,
    revenueBn: 7200,
    revenueYoy: 22.5,
    netProfitBn: 850,
    netProfitYoy: 18.3,
    eps: 6200,
    pe: 18.5,
    pb: 3.2,
    roe: 25.4,
    roa: 8.1,
    debtToEquity: 0.45,
    netProfitMargin: 11.8,
    nim: null,
    npl: null,
  };

  it("AC-2: period string = `${yearReport}Q${quarter}`", () => {
    expect(mapRow(baseRow).period).toBe("2024Q4");
  });

  it("AC-2: period Q1 correctly formatted", () => {
    expect(mapRow({ ...baseRow, quarter: 1, yearReport: 2023 }).period).toBe("2023Q1");
  });

  it("AC-2: code preserved", () => {
    expect(mapRow(baseRow).code).toBe("FPT");
  });

  it("AC-2: yearReport and quarter preserved as numbers", () => {
    const r = mapRow(baseRow);
    expect(r.yearReport).toBe(2024);
    expect(r.quarter).toBe(4);
  });

  it("AC-2: pe is UNROUNDED (pass-through)", () => {
    // pe = 18.5 exactly → stays 18.5 (not rounded to 18 or 19)
    expect(mapRow(baseRow).pe).toBe(18.5);
  });

  it("AC-2: all camelCase fields present (including yoyDirection fields)", () => {
    const r = mapRow(baseRow);
    expect("code" in r).toBe(true);
    expect("period" in r).toBe(true);
    expect("yearReport" in r).toBe(true);
    expect("quarter" in r).toBe(true);
    expect("revenueBn" in r).toBe(true);
    expect("revenueYoy" in r).toBe(true);
    expect("revenueYoyDirection" in r).toBe(true);
    expect("netProfitBn" in r).toBe(true);
    expect("netProfitYoy" in r).toBe(true);
    expect("netProfitYoyDirection" in r).toBe(true);
    expect("eps" in r).toBe(true);
    expect("pe" in r).toBe(true);
    expect("pb" in r).toBe(true);
    expect("roe" in r).toBe(true);
    expect("roa" in r).toBe(true);
    expect("debtToEquity" in r).toBe(true);
    expect("netProfitMargin" in r).toBe(true);
    expect("nim" in r).toBe(true);
    expect("npl" in r).toBe(true);
  });

  it("AC-2: null values pass through as null", () => {
    const r = mapRow({ ...baseRow, nim: null, npl: null, netProfitMargin: null });
    expect(r.nim).toBeNull();
    expect(r.npl).toBeNull();
    expect(r.netProfitMargin).toBeNull();
  });

  it("AC-2: pe value with many decimal places passed through unrounded", () => {
    const r = mapRow({ ...baseRow, pe: 14.094444 });
    expect(r.pe).toBe(14.094444); // NOT rounded
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-3: buildRankings
// ─────────────────────────────────────────────────────────────────────────────

describe("buildRankings", () => {
  function makeRow(overrides: Partial<ScreenerRow>): ScreenerRow {
    return {
      code: "X",
      period: "2024Q4",
      yearReport: 2024,
      quarter: 4,
      revenueBn: null,
      revenueYoy: null,
      revenueYoyDirection: "flat" as YoyDirection,
      netProfitBn: null,
      netProfitYoy: null,
      netProfitYoyDirection: "flat" as YoyDirection,
      eps: null,
      pe: null,
      pb: null,
      roe: null,
      roa: null,
      debtToEquity: null,
      netProfitMargin: null,
      nim: null,
      npl: null,
      ...overrides,
    };
  }

  it("AC-3: empty input → all arrays empty", () => {
    const r = buildRankings([]);
    expect(r.cheapestPe).toHaveLength(0);
    expect(r.highestRoe).toHaveLength(0);
    expect(r.highestRevenueYoy).toHaveLength(0);
  });

  it("AC-3: cheapestPe excludes pe=0 rows", () => {
    const rows = [
      makeRow({ code: "A", pe: 0 }),
      makeRow({ code: "B", pe: 5 }),
    ];
    const r = buildRankings(rows);
    expect(r.cheapestPe.map((x) => x.code)).toEqual(["B"]);
  });

  it("AC-3: cheapestPe excludes pe=null rows", () => {
    const rows = [
      makeRow({ code: "A", pe: null }),
      makeRow({ code: "B", pe: 5 }),
    ];
    const r = buildRankings(rows);
    expect(r.cheapestPe.map((x) => x.code)).toEqual(["B"]);
  });

  it("AC-3: cheapestPe excludes pe<0 rows", () => {
    const rows = [
      makeRow({ code: "A", pe: -3 }),
      makeRow({ code: "B", pe: 8 }),
    ];
    const r = buildRankings(rows);
    expect(r.cheapestPe.map((x) => x.code)).toEqual(["B"]);
  });

  it("AC-3: cheapestPe sorted pe ASC", () => {
    const rows = [
      makeRow({ code: "A", pe: 20 }),
      makeRow({ code: "B", pe: 5 }),
      makeRow({ code: "C", pe: 10 }),
    ];
    const r = buildRankings(rows);
    expect(r.cheapestPe.map((x) => x.code)).toEqual(["B", "C", "A"]);
  });

  it("AC-3: cheapestPe tie-break code ASC when pe equal", () => {
    const rows = [
      makeRow({ code: "ZZZ", pe: 10 }),
      makeRow({ code: "AAA", pe: 10 }),
      makeRow({ code: "MMM", pe: 10 }),
    ];
    const r = buildRankings(rows);
    expect(r.cheapestPe.map((x) => x.code)).toEqual(["AAA", "MMM", "ZZZ"]);
  });

  it("AC-3: cheapestPe capped at top 5", () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      makeRow({ code: String(i + 1).padStart(3, "0"), pe: i + 1 }),
    );
    const r = buildRankings(rows);
    expect(r.cheapestPe).toHaveLength(5);
    // cheapest 5: pe 1,2,3,4,5
    expect(r.cheapestPe[0]!.pe).toBe(1);
    expect(r.cheapestPe[4]!.pe).toBe(5);
  });

  it("AC-3: cheapestPe entry contains code, pe, roe", () => {
    const rows = [makeRow({ code: "FPT", pe: 18.5, roe: 25.4 })];
    const r = buildRankings(rows);
    expect(r.cheapestPe[0]!.code).toBe("FPT");
    expect(r.cheapestPe[0]!.pe).toBe(18.5);
    expect(r.cheapestPe[0]!.roe).toBe(25.4);
  });

  it("AC-3: highestRoe sorted roe DESC", () => {
    const rows = [
      makeRow({ code: "A", roe: 10 }),
      makeRow({ code: "B", roe: 30 }),
      makeRow({ code: "C", roe: 20 }),
    ];
    const r = buildRankings(rows);
    expect(r.highestRoe.map((x) => x.code)).toEqual(["B", "C", "A"]);
  });

  it("AC-3: highestRoe tie-break code ASC when roe equal", () => {
    const rows = [
      makeRow({ code: "ZZZ", roe: 20 }),
      makeRow({ code: "AAA", roe: 20 }),
    ];
    const r = buildRankings(rows);
    expect(r.highestRoe[0]!.code).toBe("AAA");
    expect(r.highestRoe[1]!.code).toBe("ZZZ");
  });

  it("AC-3: highestRoe null roe sorts last", () => {
    const rows = [
      makeRow({ code: "A", roe: null }),
      makeRow({ code: "B", roe: 10 }),
    ];
    const r = buildRankings(rows);
    expect(r.highestRoe[0]!.code).toBe("B");
    expect(r.highestRoe[1]!.code).toBe("A");
  });

  it("AC-3: highestRoe capped at top 5", () => {
    const rows = Array.from({ length: 8 }, (_, i) =>
      makeRow({ code: String(i + 1).padStart(3, "0"), roe: i + 1 }),
    );
    const r = buildRankings(rows);
    expect(r.highestRoe).toHaveLength(5);
    // highest 5: roe 8,7,6,5,4
    expect(r.highestRoe[0]!.roe).toBe(8);
  });

  it("AC-3: highestRoe entry contains code, roe, pe", () => {
    const rows = [makeRow({ code: "VCB", roe: 18.0, pe: 14.2 })];
    const r = buildRankings(rows);
    expect(r.highestRoe[0]!.code).toBe("VCB");
    expect(r.highestRoe[0]!.roe).toBe(18.0);
    expect(r.highestRoe[0]!.pe).toBe(14.2);
  });

  it("AC-3: highestRevenueYoy sorted revenueYoy DESC", () => {
    const rows = [
      makeRow({ code: "A", revenueYoy: 5 }),
      makeRow({ code: "B", revenueYoy: 40 }),
      makeRow({ code: "C", revenueYoy: 15 }),
    ];
    const r = buildRankings(rows);
    expect(r.highestRevenueYoy.map((x) => x.code)).toEqual(["B", "C", "A"]);
  });

  it("AC-3: highestRevenueYoy tie-break code ASC", () => {
    const rows = [
      makeRow({ code: "ZZZ", revenueYoy: 20 }),
      makeRow({ code: "AAA", revenueYoy: 20 }),
    ];
    const r = buildRankings(rows);
    expect(r.highestRevenueYoy[0]!.code).toBe("AAA");
  });

  it("AC-3: highestRevenueYoy null sorts last", () => {
    const rows = [
      makeRow({ code: "A", revenueYoy: null }),
      makeRow({ code: "B", revenueYoy: 10 }),
    ];
    const r = buildRankings(rows);
    expect(r.highestRevenueYoy[0]!.code).toBe("B");
  });

  it("AC-3: highestRevenueYoy entry contains code, revenueYoy", () => {
    const rows = [makeRow({ code: "FPT", revenueYoy: 22.5 })];
    const r = buildRankings(rows);
    expect(r.highestRevenueYoy[0]!.code).toBe("FPT");
    expect(r.highestRevenueYoy[0]!.revenueYoy).toBe(22.5);
  });

  it("AC-3: highestRevenueYoy capped at top 5", () => {
    const rows = Array.from({ length: 8 }, (_, i) =>
      makeRow({ code: String(i + 1).padStart(3, "0"), revenueYoy: i + 1 }),
    );
    const r = buildRankings(rows);
    expect(r.highestRevenueYoy).toHaveLength(5);
    expect(r.highestRevenueYoy[0]!.revenueYoy).toBe(8);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-4: buildSummary
// ─────────────────────────────────────────────────────────────────────────────

describe("buildSummary", () => {
  function makeScreenerRow(overrides: Partial<ScreenerRow>): ScreenerRow {
    return {
      code: "X", period: "2024Q4", yearReport: 2024, quarter: 4,
      revenueBn: null, revenueYoy: null, revenueYoyDirection: "flat" as YoyDirection,
      netProfitBn: null, netProfitYoy: null, netProfitYoyDirection: "flat" as YoyDirection,
      eps: null, pe: null, pb: null, roe: null, roa: null,
      debtToEquity: null, netProfitMargin: null, nim: null, npl: null,
      ...overrides,
    };
  }

  it("AC-4: count = rows.length", () => {
    const rows = [makeScreenerRow({ code: "A" }), makeScreenerRow({ code: "B" })];
    expect(buildSummary(rows).count).toBe(2);
  });

  it("AC-4: empty rows → count=0, all medians null", () => {
    const s = buildSummary([]);
    expect(s.count).toBe(0);
    expect(s.medianPe).toBeNull();
    expect(s.medianPb).toBeNull();
    expect(s.medianRoe).toBeNull();
  });

  it("AC-4: medianPe computed from pe values", () => {
    const rows = [
      makeScreenerRow({ code: "A", pe: 5 }),
      makeScreenerRow({ code: "B", pe: 15 }),
      makeScreenerRow({ code: "C", pe: 10 }),
    ];
    // sorted: [5, 10, 15] → floor(3/2)=index 1 = 10
    expect(buildSummary(rows).medianPe).toBe(10);
  });

  it("AC-4: medianPb computed from pb values", () => {
    const rows = [
      makeScreenerRow({ code: "A", pb: 1.0 }),
      makeScreenerRow({ code: "B", pb: 3.0 }),
      makeScreenerRow({ code: "C", pb: 2.0 }),
    ];
    // sorted: [1.0, 2.0, 3.0] → index 1 = 2.0
    expect(buildSummary(rows).medianPb).toBe(2);
  });

  it("AC-4: medianRoe computed from roe values", () => {
    const rows = [
      makeScreenerRow({ code: "A", roe: 10 }),
      makeScreenerRow({ code: "B", roe: 30 }),
      makeScreenerRow({ code: "C", roe: 20 }),
    ];
    // sorted: [10, 20, 30] → index 1 = 20
    expect(buildSummary(rows).medianRoe).toBe(20);
  });

  it("AC-4: summary shape has count, medianPe, medianPb, medianRoe", () => {
    const s = buildSummary([]);
    expect("count" in s).toBe(true);
    expect("medianPe" in s).toBe(true);
    expect("medianPb" in s).toBe(true);
    expect("medianRoe" in s).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-5: handleGetFinancialsHttp — integration with in-memory DB
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK17-PAGE16 — handleGetFinancialsHttp (in-memory DB)", () => {
  it("AC-5: empty table → 200 + empty-state shape", () => {
    const res = makeMockRes();
    handleGetFinancialsHttp(
      makeFakeReq("/api/financials"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as FinancialsResponse;
    expect(body.asOf).toBeNull();
    expect(body.count).toBe(0);
    expect(body.rows).toHaveLength(0);
    expect(body.summary.count).toBe(0);
    expect(body.summary.medianPe).toBeNull();
    expect(body.summary.medianPb).toBeNull();
    expect(body.summary.medianRoe).toBeNull();
    expect(body.rankings.cheapestPe).toHaveLength(0);
    expect(body.rankings.highestRoe).toHaveLength(0);
    expect(body.rankings.highestRevenueYoy).toHaveLength(0);
    expect(typeof body.generatedAt).toBe("string");
  });

  it("AC-5: response envelope has all required top-level fields", () => {
    seedFixtureCorpus();
    const res = makeMockRes();
    handleGetFinancialsHttp(
      makeFakeReq("/api/financials"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    const body = JSON.parse(res.body) as FinancialsResponse;
    expect(res.statusCode).toBe(200);
    expect(typeof body.generatedAt).toBe("string");
    expect(typeof body.asOf === "string" || body.asOf === null).toBe(true);
    expect(typeof body.count).toBe("number");
    expect(Array.isArray(body.rows)).toBe(true);
    expect(typeof body.summary).toBe("object");
    expect(typeof body.rankings).toBe("object");
  });

  it("AC-5: count = rows.length", () => {
    seedFixtureCorpus();
    const res = makeMockRes();
    handleGetFinancialsHttp(
      makeFakeReq("/api/financials"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    const body = JSON.parse(res.body) as FinancialsResponse;
    expect(body.count).toBe(body.rows.length);
  });

  it("AC-5: 3 codes seeded → 3 rows returned", () => {
    seedFixtureCorpus();
    const res = makeMockRes();
    handleGetFinancialsHttp(
      makeFakeReq("/api/financials"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    const body = JSON.parse(res.body) as FinancialsResponse;
    expect(body.count).toBe(3);
  });

  it("AC-5: rows ordered code ASC (FPT < HPG < VCB)", () => {
    seedFixtureCorpus();
    const res = makeMockRes();
    handleGetFinancialsHttp(
      makeFakeReq("/api/financials"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    const body = JSON.parse(res.body) as FinancialsResponse;
    expect(body.rows.map((r) => r.code)).toEqual(["FPT", "HPG", "VCB"]);
  });

  it("AC-5: row has period string `${yearReport}Q${quarter}`", () => {
    seedFixtureCorpus();
    const res = makeMockRes();
    handleGetFinancialsHttp(
      makeFakeReq("/api/financials"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    const body = JSON.parse(res.body) as FinancialsResponse;
    const fpt = body.rows.find((r) => r.code === "FPT");
    expect(fpt).toBeDefined();
    expect(fpt!.period).toBe("2024Q4");
  });

  it("AC-5: MBS with 2 periods → only latest period returned", () => {
    // Insert two periods for MBS — latest should win
    insertFinancial({ code: "MBS", year_report: 2024, quarter: 3, pe: 8, pb: 1.2, roe: 12 });
    insertFinancial({ code: "MBS", year_report: 2024, quarter: 4, pe: 9, pb: 1.3, roe: 13 });
    const res = makeMockRes();
    handleGetFinancialsHttp(
      makeFakeReq("/api/financials"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    const body = JSON.parse(res.body) as FinancialsResponse;
    const mbsRows = body.rows.filter((r) => r.code === "MBS");
    expect(mbsRows).toHaveLength(1);
    expect(mbsRows[0]!.quarter).toBe(4); // latest quarter
    expect(mbsRows[0]!.pe).toBe(9);
  });

  it("AC-5: summary.count = rows.length", () => {
    seedFixtureCorpus();
    const res = makeMockRes();
    handleGetFinancialsHttp(
      makeFakeReq("/api/financials"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    const body = JSON.parse(res.body) as FinancialsResponse;
    expect(body.summary.count).toBe(body.rows.length);
  });

  it("AC-5: summary medians computed from seeded data", () => {
    // FPT pe=18.5, HPG pe=9.3, VCB pe=14.2
    // sorted: [9.3, 14.2, 18.5] → floor(3/2)=index 1 = 14.2
    seedFixtureCorpus();
    const res = makeMockRes();
    handleGetFinancialsHttp(
      makeFakeReq("/api/financials"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    const body = JSON.parse(res.body) as FinancialsResponse;
    expect(body.summary.medianPe).toBe(14.2);
  });

  it("AC-5: rankings.cheapestPe — HPG (9.3) is cheapest in fixture", () => {
    seedFixtureCorpus();
    const res = makeMockRes();
    handleGetFinancialsHttp(
      makeFakeReq("/api/financials"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    const body = JSON.parse(res.body) as FinancialsResponse;
    expect(body.rankings.cheapestPe[0]!.code).toBe("HPG");
    expect(body.rankings.cheapestPe[0]!.pe).toBe(9.3);
  });

  it("AC-5: rankings.highestRoe — FPT (25.4) has highest ROE in fixture", () => {
    seedFixtureCorpus();
    const res = makeMockRes();
    handleGetFinancialsHttp(
      makeFakeReq("/api/financials"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    const body = JSON.parse(res.body) as FinancialsResponse;
    expect(body.rankings.highestRoe[0]!.code).toBe("FPT");
    expect(body.rankings.highestRoe[0]!.roe).toBe(25.4);
  });

  it("AC-5: rankings.highestRevenueYoy — FPT (22.5) highest in fixture", () => {
    seedFixtureCorpus();
    const res = makeMockRes();
    handleGetFinancialsHttp(
      makeFakeReq("/api/financials"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    const body = JSON.parse(res.body) as FinancialsResponse;
    expect(body.rankings.highestRevenueYoy[0]!.code).toBe("FPT");
    expect(body.rankings.highestRevenueYoy[0]!.revenueYoy).toBe(22.5);
  });

  it("AC-5: asOf is fetched_at from seeded data", () => {
    seedFixtureCorpus();
    const res = makeMockRes();
    handleGetFinancialsHttp(
      makeFakeReq("/api/financials"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    const body = JSON.parse(res.body) as FinancialsResponse;
    expect(body.asOf).toBe("2026-06-10T12:00:00.000Z");
  });

  it("AC-5: generatedAt is a valid ISO 8601 string", () => {
    seedFixtureCorpus();
    const res = makeMockRes();
    handleGetFinancialsHttp(
      makeFakeReq("/api/financials"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    const body = JSON.parse(res.body) as FinancialsResponse;
    expect(body.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("AC-5: unknown query params ignored gracefully", () => {
    seedFixtureCorpus();
    const res = makeMockRes();
    handleGetFinancialsHttp(
      makeFakeReq("/api/financials?foo=bar&unknown=123"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    expect(res.statusCode).toBe(200);
  });

  it("AC-5: 500 JSON on DB error (closed DB)", () => {
    const db = getDb();
    closeDb();
    const res = makeMockRes();
    handleGetFinancialsHttp(
      makeFakeReq("/api/financials"),
      res as unknown as import("node:http").ServerResponse,
      db,
    );
    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body) as { error: string };
    expect(body.error).toBe("db_error");
  });

  it("AC-5: rows contain all required fields per spec", () => {
    seedFixtureCorpus();
    const res = makeMockRes();
    handleGetFinancialsHttp(
      makeFakeReq("/api/financials"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    const body = JSON.parse(res.body) as FinancialsResponse;
    const row = body.rows[0]!;
    const requiredFields = [
      "code", "period", "yearReport", "quarter",
      "revenueBn", "revenueYoy", "revenueYoyDirection",
      "netProfitBn", "netProfitYoy", "netProfitYoyDirection",
      "eps", "pe", "pb", "roe", "roa",
      "debtToEquity", "netProfitMargin", "nim", "npl",
    ];
    for (const field of requiredFields) {
      expect(field in row).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeMedian — live universe validation
// ─────────────────────────────────────────────────────────────────────────────

describe("computeMedian — live universe median validation", () => {
  it("AC-1: floor(n/2) index for n=78 selects index 39 (0-based 40th element)", () => {
    // Live universe has 78 codes.
    // Floor(78/2) = 39.
    // The task states: medianPe≈14.09, medianPb≈1.62, medianRoe≈12.53.
    // Verify the index selection rule is correct for n=78.
    expect(Math.floor(78 / 2)).toBe(39);
    // A value at sorted[39] (0-based) is the 40th element — confirmed.

    // Simulate with known values: if pe sorted=[..., 14.09 at index 39, ...]
    const fakePes = Array.from({ length: 78 }, (_, i) => i + 0.5); // 0.5,1.5,...,77.5
    // fakePes[39] = 39.5
    expect(computeMedian(fakePes)).toBe(39.5);
  });

  it("AC-1: medians for fixture corpus (FPT/HPG/VCB) match expected values", () => {
    // pe sorted: [9.3, 14.2, 18.5] → floor(3/2)=index 1 = 14.2
    expect(computeMedian([18.5, 9.3, 14.2])).toBe(14.2);
    // pb sorted: [1.1, 2.1, 3.2] → floor(3/2)=index 1 = 2.1
    expect(computeMedian([3.2, 1.1, 2.1])).toBe(2.1);
    // roe sorted: [10.2, 18.0, 25.4] → floor(3/2)=index 1 = 18.0
    expect(computeMedian([25.4, 10.2, 18.0])).toBe(18.0);
  });
});
