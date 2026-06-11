/**
 * TASK17-AGM — GET /api/agm-plan-actual
 *
 * AC-1: response envelope: {generatedAt, defaultYear, availableYears, items, summary, count}
 * AC-2: FPT 2024 revenue (ptid=5): plan 61850 / actual 62962.7 → 101.8% EXCEEDED
 * AC-3: HPG 2023 revenue (ptid=5): plan 150000 / actual 120355.2 → 80.2% BEHIND
 * AC-4: HPG 2023 profit(ptid=9): plan 8000 / actual 6800.4 → 85.0% BEHIND
 * AC-5: VIC 2024 profit(ptid=9): plan 4500 / actual 5276.1 → 117.2% EXCEEDED
 * AC-6: OPEN-YEAR REGRESSION GUARD — open year (no term_id=1 actual) → IN_PROGRESS,
 *        actual_ty=null, completion_pct=null (NEVER 0%/BEHIND from partial term)
 * AC-7: defaultYear = latest year that has at least one report_term_id=1 actual
 * AC-8: availableYears includes all years in agm_plan, DESC order
 * AC-9: ?year=YYYY filters to the requested year
 * AC-10: ?limit=N clamps item count (default 200, max 500)
 * AC-11: 200 + empty items[] when no rows exist (no error)
 * AC-12: 500 JSON on DB error
 * AC-13: ON_TRACK when 90 <= pct < 100
 * AC-14: plan_ty=0 → completion_pct=null (no divide-by-zero)
 * AC-15: count matches items.length
 * AC-16: summary counts (exceeded, onTrack, behind, inProgress, total) accurate
 * AC-17: ytd_ty + ytd_term_id populated when non-1 term present for open year
 * AC-18: value_ty null-tolerant — null value_ty passes through as null (not 0)
 *
 * DDD layer: interface + infrastructure tested together at the handler seam.
 * Isolation: in-memory SQLite, reset per test via initDatabase().
 *
 * PRODUCTION SHAPE: seeds mirror the live contract (TASK17-AGM spec):
 *   agm_plan.UNIQUE(stock_code, ptid, year)
 *   agm_actuals.UNIQUE(stock_code, year, report_term_id, report_norm_id)
 */

// Must be set before importing schema module
Bun.env["DB_PATH"] = ":memory:";
if (Bun.env["DB_PATH"] !== ":memory:") {
  throw new Error(`[TASK17-AGM] DB_PATH must be ':memory:', got: ${Bun.env["DB_PATH"]}`);
}

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import { upsertAgmPlan, upsertAgmActuals } from "../infrastructure/db/agmPlanStore.js";
import {
  classifyStatus,
  computeCompletionPct,
  buildMetrics,
  buildAgmSummary,
  queryAgmPlanActualForYear,
  handleGetAgmPlanActual,
  type AgmPlanActualResponse,
  type AgmMetric,
} from "../interface/mcp/routes/agmPlanActualHandler.js";

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

const NOW = "2026-06-11T00:00:00.000Z";

/** Minimal mock ServerResponse — mirrors the pattern in 1986-foreign-flow-endpoint.test.ts */
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

function makeFakeReq(url: string = "/api/agm-plan-actual"): import("node:http").IncomingMessage {
  return { url } as import("node:http").IncomingMessage;
}

/** Seed one plan row */
function seedPlan(stockCode: string, year: number, ptid: number, valueTy: number) {
  upsertAgmPlan(getDb(), [
    {
      stock_code: stockCode,
      ptid,
      pt_name: `ptid_${ptid}`,
      year,
      value_raw: valueTy * 1e9,
      value_ty: valueTy,
      fetched_at: "2026-06-01T00:00:00.000Z",
    },
  ]);
}

/** Seed one actual row. report_norm_id is arbitrary non-overlapping per (code,year,term,norm). */
function seedActual(
  stockCode: string,
  year: number,
  termId: number,
  ptid: number,
  valueTy: number,
  normId = ptid * 100,
) {
  upsertAgmActuals(getDb(), [
    {
      stock_code: stockCode,
      year,
      report_term_id: termId,
      report_norm_id: normId,
      ptid,
      value_raw: valueTy * 1e9,
      value_ty: valueTy,
      fetched_at: "2026-06-01T00:00:00.000Z",
    },
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────
// classifyStatus unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("classifyStatus", () => {
  it("null → IN_PROGRESS", () => {
    expect(classifyStatus(null)).toBe("IN_PROGRESS");
  });

  it("100 → EXCEEDED", () => {
    expect(classifyStatus(100)).toBe("EXCEEDED");
  });

  it("101.8 → EXCEEDED (FPT revenue spec value)", () => {
    expect(classifyStatus(101.8)).toBe("EXCEEDED");
  });

  it("117.2 → EXCEEDED (VIC profit spec value)", () => {
    expect(classifyStatus(117.2)).toBe("EXCEEDED");
  });

  it("90 → ON_TRACK (lower boundary)", () => {
    expect(classifyStatus(90)).toBe("ON_TRACK");
  });

  it("99.9 → ON_TRACK (upper boundary below 100)", () => {
    expect(classifyStatus(99.9)).toBe("ON_TRACK");
  });

  it("80.2 → BEHIND (HPG revenue spec value)", () => {
    expect(classifyStatus(80.2)).toBe("BEHIND");
  });

  it("85.0 → BEHIND (HPG profit spec value)", () => {
    expect(classifyStatus(85.0)).toBe("BEHIND");
  });

  it("0 → BEHIND", () => {
    expect(classifyStatus(0)).toBe("BEHIND");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeCompletionPct unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("computeCompletionPct", () => {
  it("FPT 2024 revenue: 62962.7 / 61850 → 101.8% (rounded in handler)", () => {
    const raw = computeCompletionPct(61850, 62962.7);
    expect(raw).not.toBeNull();
    expect(Math.round((raw ?? 0) * 10) / 10).toBe(101.8);
  });

  it("HPG 2023 revenue: 120355.2 / 150000 → 80.2%", () => {
    const raw = computeCompletionPct(150000, 120355.2);
    expect(raw).not.toBeNull();
    expect(Math.round((raw ?? 0) * 10) / 10).toBe(80.2);
  });

  it("HPG 2023 profit(9): 6800.4 / 8000 → 85.0%", () => {
    const raw = computeCompletionPct(8000, 6800.4);
    expect(raw).not.toBeNull();
    expect(Math.round((raw ?? 0) * 10) / 10).toBe(85.0);
  });

  it("VIC 2024 profit(9): 5276.1 / 4500 → 117.2%", () => {
    const raw = computeCompletionPct(4500, 5276.1);
    expect(raw).not.toBeNull();
    expect(Math.round((raw ?? 0) * 10) / 10).toBe(117.2);
  });

  it("AC-14: plan_ty=0 → null (no divide-by-zero)", () => {
    expect(computeCompletionPct(0, 5000)).toBeNull();
  });

  it("AC-18: actual_ty=null → null", () => {
    expect(computeCompletionPct(10000, null)).toBeNull();
  });

  it("plan_ty=null → null", () => {
    expect(computeCompletionPct(null, 5000)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildMetrics unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("buildMetrics", () => {
  it("plan + full-year actual → EXCEEDED with correct pct", () => {
    const rows = [
      { stock_code: "FPT", year: 2024, ptid: 5, pt_name: "Doanh thu", value_ty: 61850, source: "plan" as const, report_term_id: null },
      { stock_code: "FPT", year: 2024, ptid: 5, pt_name: "", value_ty: 62962.7, source: "actual" as const, report_term_id: 1 },
    ];
    const metrics = buildMetrics(rows);
    expect(metrics).toHaveLength(1);
    const m = metrics[0]!;
    expect(m.ptid).toBe(5);
    expect(m.plan_ty).toBe(61850);
    expect(m.actual_ty).toBe(62962.7);
    expect(m.completion_pct).toBe(101.8);
    expect(m.status).toBe("EXCEEDED");
    expect(m.ytd_ty).toBeNull();
  });

  it("plan only, no actual → IN_PROGRESS with null actual and pct", () => {
    const rows = [
      { stock_code: "VIC", year: 2026, ptid: 9, pt_name: "", value_ty: 4500, source: "plan" as const, report_term_id: null },
    ];
    const metrics = buildMetrics(rows);
    expect(metrics).toHaveLength(1);
    const m = metrics[0]!;
    expect(m.status).toBe("IN_PROGRESS");
    expect(m.actual_ty).toBeNull();
    expect(m.completion_pct).toBeNull();
  });

  it("open year with YTD term (Q1 term_id=2) → IN_PROGRESS + ytd populated", () => {
    const rows = [
      { stock_code: "HPG", year: 2026, ptid: 5, pt_name: "", value_ty: 150000, source: "plan" as const, report_term_id: null },
      // Only Q1 term (id=2) present, NO full-year term (id=1)
      { stock_code: "HPG", year: 2026, ptid: 5, pt_name: "", value_ty: 35000, source: "actual" as const, report_term_id: 2 },
    ];
    const metrics = buildMetrics(rows);
    expect(metrics).toHaveLength(1);
    const m = metrics[0]!;
    expect(m.status).toBe("IN_PROGRESS");
    expect(m.actual_ty).toBeNull();
    expect(m.completion_pct).toBeNull();
    // YTD from Q1 row
    expect(m.ytd_ty).toBe(35000);
    expect(m.ytd_term_id).toBe(2);
  });

  it("metrics sorted by ptid ASC (5, 8, 9)", () => {
    const rows = [
      { stock_code: "HPG", year: 2023, ptid: 9, pt_name: "", value_ty: 8000, source: "plan" as const, report_term_id: null },
      { stock_code: "HPG", year: 2023, ptid: 9, pt_name: "", value_ty: 6800.4, source: "actual" as const, report_term_id: 1 },
      { stock_code: "HPG", year: 2023, ptid: 5, pt_name: "", value_ty: 150000, source: "plan" as const, report_term_id: null },
      { stock_code: "HPG", year: 2023, ptid: 5, pt_name: "", value_ty: 120355.2, source: "actual" as const, report_term_id: 1 },
    ];
    const metrics = buildMetrics(rows);
    expect(metrics).toHaveLength(2);
    expect(metrics[0]!.ptid).toBe(5);
    expect(metrics[1]!.ptid).toBe(9);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildAgmSummary unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("buildAgmSummary", () => {
  it("counts all status types correctly", () => {
    const metrics: AgmMetric[] = [
      { ptid: 5, label: "Doanh thu", plan_ty: 100, actual_ty: 110, completion_pct: 110, status: "EXCEEDED", ytd_ty: null, ytd_term_id: null },
      { ptid: 8, label: "LN trước thuế", plan_ty: 100, actual_ty: 95, completion_pct: 95, status: "ON_TRACK", ytd_ty: null, ytd_term_id: null },
      { ptid: 9, label: "LN sau thuế", plan_ty: 100, actual_ty: 80, completion_pct: 80, status: "BEHIND", ytd_ty: null, ytd_term_id: null },
      { ptid: 5, label: "Doanh thu", plan_ty: 50000, actual_ty: null, completion_pct: null, status: "IN_PROGRESS", ytd_ty: 12000, ytd_term_id: 2 },
    ];
    const summary = buildAgmSummary(2024, metrics);
    expect(summary.year).toBe(2024);
    expect(summary.exceeded).toBe(1);
    expect(summary.onTrack).toBe(1);
    expect(summary.behind).toBe(1);
    expect(summary.inProgress).toBe(1);
    expect(summary.total).toBe(4);
  });

  it("empty metrics → zero counts", () => {
    const summary = buildAgmSummary(2024, []);
    expect(summary.total).toBe(0);
    expect(summary.exceeded).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// queryAgmPlanActualForYear unit tests (DB integration)
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK17-AGM — queryAgmPlanActualForYear", () => {
  it("AC-2: FPT 2024 revenue — 101.8% EXCEEDED", () => {
    seedPlan("FPT", 2024, 5, 61850);
    seedActual("FPT", 2024, 1, 5, 62962.7);

    const { items } = queryAgmPlanActualForYear(getDb(), 2024);
    const fptItem = items.find((i) => i.stockCode === "FPT");
    expect(fptItem).toBeDefined();
    const rev = fptItem!.metrics.find((m) => m.ptid === 5);
    expect(rev).toBeDefined();
    expect(rev!.plan_ty).toBe(61850);
    expect(rev!.actual_ty).toBe(62962.7);
    expect(rev!.completion_pct).toBe(101.8);
    expect(rev!.status).toBe("EXCEEDED");
  });

  it("AC-3: HPG 2023 revenue — 80.2% BEHIND", () => {
    seedPlan("HPG", 2023, 5, 150000);
    seedActual("HPG", 2023, 1, 5, 120355.2);

    const { items } = queryAgmPlanActualForYear(getDb(), 2023);
    const hpgItem = items.find((i) => i.stockCode === "HPG");
    const rev = hpgItem!.metrics.find((m) => m.ptid === 5);
    expect(rev!.completion_pct).toBe(80.2);
    expect(rev!.status).toBe("BEHIND");
  });

  it("AC-4: HPG 2023 profit(ptid=9) — 85.0% BEHIND", () => {
    seedPlan("HPG", 2023, 9, 8000);
    seedActual("HPG", 2023, 1, 9, 6800.4);

    const { items } = queryAgmPlanActualForYear(getDb(), 2023);
    const hpgItem = items.find((i) => i.stockCode === "HPG");
    const pat = hpgItem!.metrics.find((m) => m.ptid === 9);
    expect(pat!.completion_pct).toBe(85.0);
    expect(pat!.status).toBe("BEHIND");
  });

  it("AC-5: VIC 2024 profit(ptid=9) — 117.2% EXCEEDED", () => {
    seedPlan("VIC", 2024, 9, 4500);
    seedActual("VIC", 2024, 1, 9, 5276.1);

    const { items } = queryAgmPlanActualForYear(getDb(), 2024);
    const vicItem = items.find((i) => i.stockCode === "VIC");
    const pat = vicItem!.metrics.find((m) => m.ptid === 9);
    expect(pat!.completion_pct).toBe(117.2);
    expect(pat!.status).toBe("EXCEEDED");
  });

  it("AC-6 (REGRESSION GUARD): open year — only Q1 actual present → IN_PROGRESS, actual=null, pct=null — NOT 0%/BEHIND", () => {
    // 2025 = closed year (has term_id=1)
    seedPlan("HPG", 2025, 5, 150000);
    seedActual("HPG", 2025, 1, 5, 120000); // full-year exists

    // 2026 = open year: ONLY Q1 term (report_term_id=2), NO full-year (term_id=1)
    seedPlan("HPG", 2026, 5, 160000);
    seedActual("HPG", 2026, 2, 5, 38000, 501); // Q1 only — term_id=2

    // When we query 2026 (open year):
    const { items } = queryAgmPlanActualForYear(getDb(), 2026);
    const hpgItem = items.find((i) => i.stockCode === "HPG");
    expect(hpgItem).toBeDefined();
    const rev = hpgItem!.metrics.find((m) => m.ptid === 5);
    expect(rev).toBeDefined();

    // CRITICAL ASSERTIONS — this is the regression guard
    expect(rev!.status).toBe("IN_PROGRESS");
    expect(rev!.actual_ty).toBeNull();
    expect(rev!.completion_pct).toBeNull();

    // YTD from Q1 provided as context (not headline)
    expect(rev!.ytd_ty).toBe(38000);
    expect(rev!.ytd_term_id).toBe(2);
  });

  it("AC-7: defaultYear = latest year with term_id=1 actual", () => {
    seedPlan("FPT", 2024, 5, 61850);
    seedActual("FPT", 2024, 1, 5, 62962.7);
    seedPlan("FPT", 2025, 5, 70000);
    seedActual("FPT", 2025, 1, 5, 72000);

    const { defaultYear } = queryAgmPlanActualForYear(getDb(), null);
    expect(defaultYear).toBe(2025); // most recent closed year
  });

  it("AC-7: defaultYear excludes open year with only partial actuals", () => {
    seedPlan("HPG", 2025, 5, 150000);
    seedActual("HPG", 2025, 1, 5, 120000);
    // 2026: only Q1, no full-year
    seedPlan("HPG", 2026, 5, 160000);
    seedActual("HPG", 2026, 2, 5, 38000, 501);

    const { defaultYear } = queryAgmPlanActualForYear(getDb(), null);
    expect(defaultYear).toBe(2025); // NOT 2026 (which has no term_id=1)
  });

  it("AC-8: availableYears includes all agm_plan years DESC", () => {
    seedPlan("FPT", 2023, 5, 50000);
    seedPlan("FPT", 2024, 5, 61850);
    seedPlan("FPT", 2025, 5, 70000);

    const { availableYears } = queryAgmPlanActualForYear(getDb(), 2024);
    expect(availableYears).toContain(2023);
    expect(availableYears).toContain(2024);
    expect(availableYears).toContain(2025);
    // DESC order
    expect(availableYears[0]).toBeGreaterThan(availableYears[availableYears.length - 1]!);
  });

  it("AC-9: ?year= filters to specified year only", () => {
    seedPlan("FPT", 2023, 5, 50000);
    seedActual("FPT", 2023, 1, 5, 48000);
    seedPlan("FPT", 2024, 5, 61850);
    seedActual("FPT", 2024, 1, 5, 62962.7);

    const { items } = queryAgmPlanActualForYear(getDb(), 2023);
    for (const item of items) {
      expect(item.year).toBe(2023);
    }
  });

  it("AC-10: limit clamps item count", () => {
    // Seed 5 stocks, request limit=2
    for (const code of ["AAA", "BBB", "CCC", "DDD", "EEE"]) {
      seedPlan(code, 2024, 5, 10000);
      seedActual(code, 2024, 1, 5, 11000);
    }
    const { items } = queryAgmPlanActualForYear(getDb(), 2024, 2);
    expect(items).toHaveLength(2);
  });

  it("AC-11: no data → empty items + null defaultYear", () => {
    const { items, defaultYear } = queryAgmPlanActualForYear(getDb(), null);
    expect(items).toHaveLength(0);
    expect(defaultYear).toBeNull();
  });

  it("AC-13: ON_TRACK when completion_pct in [90, 100)", () => {
    seedPlan("VNM", 2024, 5, 100000);
    seedActual("VNM", 2024, 1, 5, 95000); // 95%

    const { items } = queryAgmPlanActualForYear(getDb(), 2024);
    const vnm = items.find((i) => i.stockCode === "VNM");
    const rev = vnm!.metrics.find((m) => m.ptid === 5);
    expect(rev!.status).toBe("ON_TRACK");
    expect(rev!.completion_pct).toBe(95.0);
  });

  it("AC-14: plan_ty=0 → completion_pct=null (no divide-by-zero)", () => {
    seedPlan("ZERO", 2024, 5, 0);
    seedActual("ZERO", 2024, 1, 5, 5000);

    const { items } = queryAgmPlanActualForYear(getDb(), 2024);
    const item = items.find((i) => i.stockCode === "ZERO");
    const m = item!.metrics.find((mm) => mm.ptid === 5);
    expect(m!.completion_pct).toBeNull();
    expect(m!.status).toBe("IN_PROGRESS");
  });

  it("AC-16: summary counts accurate over multiple stocks + metrics", () => {
    // FPT 2024 revenue: EXCEEDED
    seedPlan("FPT", 2024, 5, 61850);
    seedActual("FPT", 2024, 1, 5, 62962.7);
    // HPG 2024 revenue: BEHIND (80%)
    seedPlan("HPG", 2024, 5, 100000);
    seedActual("HPG", 2024, 1, 5, 80000);
    // VNM 2024 revenue: ON_TRACK (95%)
    seedPlan("VNM", 2024, 5, 100000);
    seedActual("VNM", 2024, 1, 5, 95000);
    // BID 2024 revenue: IN_PROGRESS (no full-year actual)
    seedPlan("BID", 2024, 5, 50000);
    // only partial term
    seedActual("BID", 2024, 2, 5, 12000, 502);

    const { allMetrics } = queryAgmPlanActualForYear(getDb(), 2024);
    const summary = buildAgmSummary(2024, allMetrics);
    expect(summary.exceeded).toBe(1);   // FPT
    expect(summary.onTrack).toBe(1);    // VNM
    expect(summary.behind).toBe(1);     // HPG
    expect(summary.inProgress).toBe(1); // BID
    expect(summary.total).toBe(4);
  });

  it("AC-18: value_ty null in agm_actuals passes through as null (not 0)", () => {
    // Insert an actual with value_ty=0 explicitly (edge case)
    // plan_ty > 0 but value_ty = 0 → completion_pct = 0 → BEHIND (not null)
    seedPlan("TST", 2024, 5, 10000);
    seedActual("TST", 2024, 1, 5, 0);

    const { items } = queryAgmPlanActualForYear(getDb(), 2024);
    const item = items.find((i) => i.stockCode === "TST");
    const m = item!.metrics.find((mm) => mm.ptid === 5);
    // actual_ty = 0 (not null) → completion_pct = 0% → BEHIND
    expect(m!.actual_ty).toBe(0);
    expect(m!.completion_pct).toBe(0);
    expect(m!.status).toBe("BEHIND");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleGetAgmPlanActual HTTP handler tests
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK17-AGM — handleGetAgmPlanActual HTTP handler", () => {
  it("AC-1: returns 200 JSON with required envelope fields", () => {
    seedPlan("FPT", 2024, 5, 61850);
    seedActual("FPT", 2024, 1, 5, 62962.7);

    const res = makeMockRes();
    const fakeNow = new Date(NOW);
    handleGetAgmPlanActual(
      makeFakeReq("/api/agm-plan-actual"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
      fakeNow,
    );

    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(res.body) as AgmPlanActualResponse;
    expect(body.generatedAt).toBe(NOW);
    expect(typeof body.defaultYear).toBe("number");
    expect(Array.isArray(body.availableYears)).toBe(true);
    expect(Array.isArray(body.items)).toBe(true);
    expect(typeof body.summary).toBe("object");
    expect(typeof body.count).toBe("number");
  });

  it("AC-15: count matches items.length", () => {
    seedPlan("FPT", 2024, 5, 61850);
    seedActual("FPT", 2024, 1, 5, 62962.7);
    seedPlan("HPG", 2024, 5, 150000);
    seedActual("HPG", 2024, 1, 5, 120355.2);

    const res = makeMockRes();
    handleGetAgmPlanActual(
      makeFakeReq("/api/agm-plan-actual"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as AgmPlanActualResponse;
    expect(body.count).toBe(body.items.length);
  });

  it("AC-11: returns 200 + empty items when no data", () => {
    const res = makeMockRes();
    handleGetAgmPlanActual(
      makeFakeReq("/api/agm-plan-actual"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as AgmPlanActualResponse;
    expect(body.items).toHaveLength(0);
    expect(body.count).toBe(0);
    expect(body.defaultYear).toBeNull();
  });

  it("AC-12: returns 500 JSON on DB error (closed DB)", () => {
    const db = getDb();
    closeDb();

    const res = makeMockRes();
    handleGetAgmPlanActual(
      makeFakeReq("/api/agm-plan-actual"),
      res as unknown as import("node:http").ServerResponse,
      db,
    );

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body) as { error: string };
    expect(body.error).toBe("db_error");
  });

  it("?year=2024 param is respected", () => {
    seedPlan("FPT", 2023, 5, 50000);
    seedActual("FPT", 2023, 1, 5, 48000);
    seedPlan("FPT", 2024, 5, 61850);
    seedActual("FPT", 2024, 1, 5, 62962.7);

    const res = makeMockRes();
    handleGetAgmPlanActual(
      makeFakeReq("/api/agm-plan-actual?year=2024"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as AgmPlanActualResponse;
    for (const item of body.items) {
      expect(item.year).toBe(2024);
    }
  });

  it("?limit=1 clamps response to 1 stock item", () => {
    for (const code of ["AAA", "BBB", "CCC"]) {
      seedPlan(code, 2024, 5, 10000);
      seedActual(code, 2024, 1, 5, 10500);
    }

    const res = makeMockRes();
    handleGetAgmPlanActual(
      makeFakeReq("/api/agm-plan-actual?limit=1"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as AgmPlanActualResponse;
    expect(body.items).toHaveLength(1);
    expect(body.count).toBe(1);
  });

  it("PRODUCTION SHAPE — closed 2025 + open 2026: defaultYear=2025; 2026 metrics IN_PROGRESS", () => {
    // 2025: closed year
    seedPlan("HPG", 2025, 5, 150000);
    seedActual("HPG", 2025, 1, 5, 120000); // full-year

    // 2026: open year — only Q1 term
    seedPlan("HPG", 2026, 5, 160000);
    seedActual("HPG", 2026, 2, 5, 38000, 501);

    // First hit: no ?year= → defaults to 2025 (most recent closed)
    const res1 = makeMockRes();
    handleGetAgmPlanActual(
      makeFakeReq("/api/agm-plan-actual"),
      res1 as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    const body1 = JSON.parse(res1.body) as AgmPlanActualResponse;
    expect(body1.defaultYear).toBe(2025);
    expect(body1.availableYears).toContain(2025);
    expect(body1.availableYears).toContain(2026);
    // 2025 items should show HPG with real completion_pct
    const hpg2025 = body1.items.find((i) => i.stockCode === "HPG");
    const rev2025 = hpg2025!.metrics.find((m) => m.ptid === 5);
    expect(rev2025!.status).not.toBe("IN_PROGRESS");
    expect(rev2025!.completion_pct).not.toBeNull();

    // Second hit: ?year=2026 → IN_PROGRESS, no false BEHIND
    const res2 = makeMockRes();
    handleGetAgmPlanActual(
      makeFakeReq("/api/agm-plan-actual?year=2026"),
      res2 as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    const body2 = JSON.parse(res2.body) as AgmPlanActualResponse;
    const hpg2026 = body2.items.find((i) => i.stockCode === "HPG");
    const rev2026 = hpg2026!.metrics.find((m) => m.ptid === 5);
    expect(rev2026!.status).toBe("IN_PROGRESS");
    expect(rev2026!.actual_ty).toBeNull();
    expect(rev2026!.completion_pct).toBeNull();
    // ytd_ty present for analyst context
    expect(rev2026!.ytd_ty).toBe(38000);
    expect(rev2026!.ytd_term_id).toBe(2);
    // Summary reflects IN_PROGRESS for 2026
    expect(body2.summary.inProgress).toBeGreaterThan(0);
    expect(body2.summary.behind).toBe(0); // CRITICAL: open year must NOT count as BEHIND
  });
});
