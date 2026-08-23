/**
 * CCATO-MCP-T3-PROBE-ADAPTERS — unit tests
 *
 * Covers:
 *   1. probeTechnicalIndicators — success + error isolation (R-2/R-3).
 *   2. probeForeignFlow — zero-detection guard, insufficient-data guard,
 *      null-signal guard, real signal, error isolation.
 *   3. probeMacro — ok/degrade/throw paths.
 *   4. probeFinancials — honest "period(s) not found" NULL (parity with
 *      tool_null_markers), real delta, error isolation.
 *   5. fetchFinancialReportRow (R-4 extraction) — direct query correctness.
 *   6. probeMarketSnapshot — exchange-classification dispatch (HOSE/HNX/
 *      UPCOM), error isolation.
 *   7. probeDimension — dispatch by claim-tool-map `tool` field for all 5
 *      known tools + honest CONFIG-style error for an unknown tool.
 *
 * Spec: docs/architecture-briefs/2026-07-17-ccato-truthgate-mcp-native.md §3.2, R-2, R-3, R-4
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import Database from "bun:sqlite";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import {
  probeTechnicalIndicators,
  probeForeignFlow,
  probeMacro,
  probeFinancials,
  probeMarketSnapshot,
  probeDimension,
  DEFAULT_PROBE_ADAPTERS,
  type ProbeAdapterMap,
} from "../infrastructure/probes/narrativeTruthProbeAdapters.js";
import { fetchFinancialReportRow } from "../interface/mcp/tools/financial-reports/reports.js";
import type { ClaimCandidate, ClaimToolMapDimension } from "../domain/services/narrativeTruthGate/claimToolMapTypes.js";
import type { DailyForeignFlow, ForeignFlowSignal } from "../domain/services/foreignFlowAnalyzer.js";
import type { MarketPrice } from "../infrastructure/fetchers/hose.js";

// ═══════════════════════════════════════════════════════════════════════════
// 1. probeTechnicalIndicators
// ═══════════════════════════════════════════════════════════════════════════

describe("probeTechnicalIndicators", () => {
  it("returns raw data + isError:false on success", async () => {
    const stub = async () => ({ code: "VNM", rsi: 62.1, trend: "TANG" as const });
    const result = await probeTechnicalIndicators("VNM", stub);
    expect(result.isError).toBe(false);
    expect(result.raw).toEqual({ code: "VNM", rsi: 62.1, trend: "TANG" });
  });

  it("isolates a probe failure into {_probe_error} + isError:true (R-2/R-3)", async () => {
    const stub = async () => {
      throw new Error("TA service down");
    };
    const result = await probeTechnicalIndicators("VNM", stub);
    expect(result.isError).toBe(true);
    expect(result.raw).toEqual({ _probe_error: "TA service down" });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. probeForeignFlow
// ═══════════════════════════════════════════════════════════════════════════

describe("probeForeignFlow", () => {
  it("zero-detection guard: empty history -> honest 'no data available' NULL", async () => {
    const result = await probeForeignFlow("ANI", () => []);
    expect(result.isError).toBe(false);
    expect((result.raw as { note: string }).note.toLowerCase()).toContain("no data available");
  });

  it("zero-detection guard: all-zero foreignVolume -> honest NULL", async () => {
    const zeroHistory: DailyForeignFlow[] = [
      { code: "ANI", date: "2026-08-20", foreignVolume: 0, foreignRoom: 0, holdingRatio: null },
      { code: "ANI", date: "2026-08-19", foreignVolume: 0, foreignRoom: 0, holdingRatio: null },
    ];
    const result = await probeForeignFlow("ANI", () => zeroHistory);
    expect(result.isError).toBe(false);
    expect((result.raw as { note: string }).note.toLowerCase()).toContain("no data available");
  });

  it("insufficient-data guard: <2 rows -> honest 'insufficient' NULL", async () => {
    const oneRow: DailyForeignFlow[] = [
      { code: "VNM", date: "2026-08-20", foreignVolume: 5000, foreignRoom: 0, holdingRatio: null },
    ];
    const result = await probeForeignFlow("VNM", () => oneRow);
    expect(result.isError).toBe(false);
    expect((result.raw as { note: string }).note.toLowerCase()).toContain("insufficient");
  });

  it("analyzeFn returning null -> honest NULL, not an error", async () => {
    const twoRows: DailyForeignFlow[] = [
      { code: "VNM", date: "2026-08-20", foreignVolume: 5000, foreignRoom: 0, holdingRatio: null },
      { code: "VNM", date: "2026-08-19", foreignVolume: 4000, foreignRoom: 0, holdingRatio: null },
    ];
    const result = await probeForeignFlow("VNM", () => twoRows, () => null);
    expect(result.isError).toBe(false);
    expect((result.raw as { note: string }).note.toLowerCase()).toContain("insufficient");
  });

  it("real signal -> raw = signal, isError:false", async () => {
    const twoRows: DailyForeignFlow[] = [
      { code: "VNM", date: "2026-08-20", foreignVolume: 5000, foreignRoom: 0, holdingRatio: null },
      { code: "VNM", date: "2026-08-19", foreignVolume: 4000, foreignRoom: 0, holdingRatio: null },
    ];
    const signal: ForeignFlowSignal = {
      code: "VNM",
      netFlowDirection: "net_buy",
      consecutiveDays: 1,
      totalNetVolume3d: 1000,
      totalNetVolume5d: 1000,
      holdingRatioChange5d: null,
      is_holding_ratio_fabricated: true,
      severity: "low",
      reasoning: "test",
    };
    const result = await probeForeignFlow("VNM", () => twoRows, () => signal);
    expect(result.isError).toBe(false);
    expect(result.raw).toEqual(signal);
  });

  it("isolates a probe failure (R-2)", async () => {
    const throwingHistoryFn = () => {
      throw new Error("db unavailable");
    };
    const result = await probeForeignFlow("VNM", throwingHistoryFn);
    expect(result.isError).toBe(true);
    expect(result.raw).toEqual({ _probe_error: "db unavailable" });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. probeMacro
// ═══════════════════════════════════════════════════════════════════════════

describe("probeMacro", () => {
  it("ok:true -> raw = data.data, isError:false", async () => {
    const fetchStub = async () => ({ ok: true as const, data: { thienThoi: "GOOD" } });
    const result = await probeMacro(fetchStub, () => "http://fake:5004");
    expect(result.isError).toBe(false);
    expect(result.raw).toEqual({ thienThoi: "GOOD" });
  });

  it("ok:false (degrade) -> isError:true, no fabricated data (FR-6 parity)", async () => {
    const fetchStub = async () => ({ ok: false as const, degrade: { reason: "deadline" as const, label: "x" } });
    const result = await probeMacro(fetchStub, () => "http://fake:5004");
    expect(result.isError).toBe(true);
    expect((result.raw as { _probe_error: string })._probe_error).toContain("deadline");
  });

  it("isolates a thrown error (R-2)", async () => {
    const fetchStub = async () => {
      throw new Error("network unreachable");
    };
    const result = await probeMacro(fetchStub, () => "http://fake:5004");
    expect(result.isError).toBe(true);
    expect(result.raw).toEqual({ _probe_error: "network unreachable" });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. probeFinancials + fetchFinancialReportRow (R-4 extraction)
// ═══════════════════════════════════════════════════════════════════════════

function makeFinancialReportsDb(): InstanceType<typeof Database> {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS financial_reports (
      id TEXT PRIMARY KEY,
      action_code TEXT NOT NULL,
      company_name TEXT,
      period_year INTEGER NOT NULL,
      period_quarter INTEGER,
      period_type TEXT NOT NULL,
      sort_key TEXT NOT NULL,
      audit_status TEXT NOT NULL DEFAULT 'unaudited',
      extraction_confidence REAL NOT NULL DEFAULT 0.8,
      net_revenue REAL NOT NULL DEFAULT 0,
      gross_profit REAL NOT NULL DEFAULT 0,
      operating_profit REAL NOT NULL DEFAULT 0,
      ebitda REAL NOT NULL DEFAULT 0,
      profit_before_tax REAL NOT NULL DEFAULT 0,
      net_profit REAL NOT NULL DEFAULT 0,
      eps REAL NOT NULL DEFAULT 0,
      diluted_eps REAL NOT NULL DEFAULT 0,
      total_assets REAL NOT NULL DEFAULT 0,
      current_assets REAL NOT NULL DEFAULT 0,
      cash REAL NOT NULL DEFAULT 0,
      inventory REAL NOT NULL DEFAULT 0,
      total_liabilities REAL NOT NULL DEFAULT 0,
      short_term_debt REAL NOT NULL DEFAULT 0,
      long_term_debt REAL NOT NULL DEFAULT 0,
      equity_total REAL NOT NULL DEFAULT 0,
      operating_cf REAL NOT NULL DEFAULT 0,
      investing_cf REAL NOT NULL DEFAULT 0,
      financing_cf REAL NOT NULL DEFAULT 0,
      capex REAL NOT NULL DEFAULT 0,
      free_cash_flow REAL NOT NULL DEFAULT 0,
      gross_margin_pct REAL,
      operating_margin_pct REAL,
      net_margin_pct REAL,
      roe REAL,
      roa REAL,
      current_ratio REAL,
      debt_to_equity REAL,
      net_debt_to_ebitda REAL,
      pe REAL,
      pb REAL,
      published_at TEXT NOT NULL DEFAULT '2026-01-15',
      yoy_delta_json TEXT,
      qoq_delta_json TEXT,
      validation_status TEXT NOT NULL DEFAULT 'passed'
    )
  `);
  return db;
}

function insertReportRow(
  db: InstanceType<typeof Database>,
  overrides: { action_code: string; period_year: number; period_type: string; net_revenue: number },
): void {
  const sortKey = `${overrides.period_year}-${overrides.period_type}`;
  db.prepare(
    `INSERT INTO financial_reports (id, action_code, period_year, period_type, sort_key, net_revenue)
     VALUES ($id, $action_code, $period_year, $period_type, $sort_key, $net_revenue)`,
  ).run({
    $id: `${overrides.action_code}-${sortKey}`,
    $action_code: overrides.action_code,
    $period_year: overrides.period_year,
    $period_type: overrides.period_type,
    $sort_key: sortKey,
    $net_revenue: overrides.net_revenue,
  });
}

describe("fetchFinancialReportRow (R-4 extraction)", () => {
  it("returns the matching row for an existing period", () => {
    const db = makeFinancialReportsDb();
    insertReportRow(db, { action_code: "VCB", period_year: 2026, period_type: "Q1", net_revenue: 1_000_000 });
    const row = fetchFinancialReportRow("VCB", 2026, "Q1", db as any);
    expect(row).not.toBeNull();
    expect(row?.net_revenue).toBe(1_000_000);
    db.close();
  });

  it("returns null for a missing period (honest gap, not thrown)", () => {
    const db = makeFinancialReportsDb();
    const row = fetchFinancialReportRow("VCB", 1999, "Q1", db as any);
    expect(row).toBeNull();
    db.close();
  });
});

describe("probeFinancials", () => {
  it("both periods missing -> honest 'Period(s) not found' NULL (tool_null_markers parity)", async () => {
    const db = makeFinancialReportsDb();
    const fetchRowFn = (actionCode: string, year: number, quarter: string) =>
      fetchFinancialReportRow(actionCode, year, quarter, db as any);
    const now = new Date("2026-08-23T00:00:00Z"); // latest fully-elapsed quarter = 2026-Q2
    const result = await probeFinancials("NOPE", now, fetchRowFn);
    expect(result.isError).toBe(false);
    const note = (result.raw as { note: string }).note.toLowerCase();
    expect(note).toContain("period(s) not found");
    db.close();
  });

  it("both periods present -> computes a real delta, isError:false", async () => {
    const db = makeFinancialReportsDb();
    insertReportRow(db, { action_code: "VCB", period_year: 2026, period_type: "Q2", net_revenue: 1_200_000 });
    insertReportRow(db, { action_code: "VCB", period_year: 2025, period_type: "Q2", net_revenue: 1_000_000 });
    const fetchRowFn = (actionCode: string, year: number, quarter: string) =>
      fetchFinancialReportRow(actionCode, year, quarter, db as any);
    const now = new Date("2026-08-23T00:00:00Z"); // latest fully-elapsed quarter = 2026-Q2
    const result = await probeFinancials("VCB", now, fetchRowFn);
    expect(result.isError).toBe(false);
    const delta = result.raw as { deltaType: string; netRevenue: { current: number; previous: number } };
    expect(delta.deltaType).toBe("YoY");
    expect(delta.netRevenue.current).toBe(1_200_000);
    expect(delta.netRevenue.previous).toBe(1_000_000);
    db.close();
  });

  it("isolates a thrown error (R-2)", async () => {
    const throwingFetchRowFn = () => {
      throw new Error("query failed");
    };
    const result = await probeFinancials("VCB", new Date("2026-08-23T00:00:00Z"), throwingFetchRowFn as any);
    expect(result.isError).toBe(true);
    expect(result.raw).toEqual({ _probe_error: "query failed" });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. probeMarketSnapshot — exchange dispatch (needs real getDb() for
//    market_prices classification; DB_PATH=:memory: isolates from prod)
// ═══════════════════════════════════════════════════════════════════════════

describe("probeMarketSnapshot", () => {
  beforeAll(async () => {
    Bun.env["DB_PATH"] = ":memory:";
    await initDatabase();
  });

  afterAll(() => {
    closeDb();
    delete Bun.env["DB_PATH"];
  });

  it("defaults an unclassified ticker to HOSE", async () => {
    const price: MarketPrice = { code: "VNM", price: 70000, changePct: 1.2 } as MarketPrice;
    let calledWith: string[] | undefined;
    const hoseFn = async (codes: string[]) => {
      calledWith = codes;
      return [price];
    };
    const hnxFn = async () => [];
    const upcomFn = async () => [];
    const result = await probeMarketSnapshot("VNM", hoseFn as any, hnxFn as any, upcomFn as any);
    expect(result.isError).toBe(false);
    expect(calledWith).toEqual(["VNM"]);
    expect(result.raw).toEqual([price]);
  });

  it("routes an HNX-classified ticker to fetchHnxFn", async () => {
    getDb().run("INSERT INTO market_prices (code, exchange) VALUES (?, ?)", ["SHS", "HNX"]);
    let hnxCalled = false;
    const hoseFn = async () => [];
    const hnxFn = async () => {
      hnxCalled = true;
      return [];
    };
    const upcomFn = async () => [];
    await probeMarketSnapshot("SHS", hoseFn as any, hnxFn as any, upcomFn as any);
    expect(hnxCalled).toBe(true);
  });

  it("routes a UPCOM-classified ticker to fetchUpcomFn", async () => {
    getDb().run("INSERT INTO market_prices (code, exchange) VALUES (?, ?)", ["BSR", "UPCOM"]);
    let upcomCalled = false;
    const hoseFn = async () => [];
    const hnxFn = async () => [];
    const upcomFn = async () => {
      upcomCalled = true;
      return [];
    };
    await probeMarketSnapshot("BSR", hoseFn as any, hnxFn as any, upcomFn as any);
    expect(upcomCalled).toBe(true);
  });

  it("isolates a thrown error (R-2)", async () => {
    const throwingHoseFn = async () => {
      throw new Error("VnDirect unreachable");
    };
    const result = await probeMarketSnapshot("VNM", throwingHoseFn as any, (async () => []) as any, (async () => []) as any);
    expect(result.isError).toBe(true);
    expect(result.raw).toEqual({ _probe_error: "VnDirect unreachable" });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. probeDimension — dispatch by claim-tool-map `tool` field
// ═══════════════════════════════════════════════════════════════════════════

function makeCandidate(tool: string, ticker = "VNM"): ClaimCandidate {
  const dimension: ClaimToolMapDimension = {
    id: "test-dim",
    keywords: [],
    tool,
    requires_ticker: true,
    arg_style: "ticker_code",
  };
  return {
    dimension,
    ticker,
    ticker_or_dim: ticker,
    claim_text: "test claim",
    matched_negation: "không có dữ liệu",
  };
}

describe("probeDimension", () => {
  it("routes each of the 5 known claim-tool-map tools to its matching adapter (stubbed — zero network I/O)", async () => {
    const called: string[] = [];
    const stubAdapters: ProbeAdapterMap = {
      get_technical_indicators: async (ticker) => {
        called.push(`ta:${ticker}`);
        return { raw: "ta", isError: false };
      },
      get_foreign_flow: async (ticker) => {
        called.push(`ff:${ticker}`);
        return { raw: "ff", isError: false };
      },
      get_macro_snapshot: async (ticker) => {
        called.push(`macro:${ticker}`);
        return { raw: "macro", isError: false };
      },
      compare_financials: async (ticker) => {
        called.push(`fin:${ticker}`);
        return { raw: "fin", isError: false };
      },
      get_market_snapshot: async (ticker) => {
        called.push(`mkt:${ticker}`);
        return { raw: "mkt", isError: false };
      },
    };
    const cases: Array<[string, string]> = [
      ["get_technical_indicators", "ta:VNM"],
      ["get_foreign_flow", "ff:VNM"],
      ["get_macro_snapshot", "macro:VNM"],
      ["compare_financials", "fin:VNM"],
      ["get_market_snapshot", "mkt:VNM"],
    ];
    for (const [tool, expectedCall] of cases) {
      const result = await probeDimension(makeCandidate(tool), new Date("2026-08-23T00:00:00Z"), stubAdapters);
      expect(result.isError).toBe(false);
      expect(called).toContain(expectedCall);
    }
  });

  it("uses DEFAULT_PROBE_ADAPTERS when no override is given (wiring smoke test)", () => {
    expect(DEFAULT_PROBE_ADAPTERS.get_technical_indicators).toBeInstanceOf(Function);
    expect(DEFAULT_PROBE_ADAPTERS.get_foreign_flow).toBeInstanceOf(Function);
    expect(DEFAULT_PROBE_ADAPTERS.get_macro_snapshot).toBeInstanceOf(Function);
    expect(DEFAULT_PROBE_ADAPTERS.compare_financials).toBeInstanceOf(Function);
    expect(DEFAULT_PROBE_ADAPTERS.get_market_snapshot).toBeInstanceOf(Function);
  });

  it("returns an honest CONFIG-style error for an unregistered tool name", async () => {
    const result = await probeDimension(makeCandidate("get_something_unmapped"));
    expect(result.isError).toBe(true);
    expect((result.raw as { _probe_error: string })._probe_error).toContain("get_something_unmapped");
  });
});
