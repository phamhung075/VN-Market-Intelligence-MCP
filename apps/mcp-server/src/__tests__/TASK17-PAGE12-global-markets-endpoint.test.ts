/**
 * TASK17-PAGE12 — GET /api/global-markets
 *
 * "Bối cảnh thị trường toàn cầu" — Global Market Context / World Risk Barometer.
 * 12 world-market indicators a VN analyst needs as risk-on/risk-off backdrop.
 *
 * AC-1:  response envelope: {generatedAt, currentAt, source, window, indicators[], series{}, summary{}, count}
 * AC-2:  exactly 12 indicators in canonical order (no cny_vnd_rate)
 * AC-3:  zero baseline → delta=null, deltaPct=null, direction="flat" (NO -100%)
 * AC-4:  computeDelta sign/direction: positive delta → "up", negative → "down", zero → "flat"
 * AC-5:  classifyVix bands: <20 → "low", 20-30 → "elevated", >30 → "high"
 * AC-6:  topMovers ordering by |deltaPct24h| DESC (only non-null deltaPct24h)
 * AC-7:  200-on-empty (empty indicators/series, summary with nulls) when table empty
 * AC-8:  500 JSON on DB error (closed DB)
 * AC-9:  cny_vnd_rate NEVER appears in response (dead column)
 * AC-10: all 12 indicator keys are present in correct order
 * AC-11: riskTone heuristic: vixBand "low"→"risk-on", "high"→"risk-off", else "neutral"
 * AC-12: series drops v<=0 points
 * AC-13: ?window clamps [1,30], default 7
 * AC-14: parameterization: SQL uses ? not string interpolation (structural test)
 *
 * PRODUCTION SHAPE seeds:
 *   - latest row: brent=92.32, gold=4106.7, usd_vnd=26325, vix=21.52, sp500=7310.4
 *     shanghai=3987.0, hang_seng=24249.29, dxy=100.103, copper=6.259, silver=64.125
 *     jpy_vnd=163.55, us10y=4.525
 *   - 24h baseline row (older by 25h): same cols but slightly different values
 *   - Zero-value baseline for 7d to test zero-as-missing rule
 *
 * DDD layer: interface + infrastructure tested together at the handler seam.
 * Isolation: in-memory SQLite, reset per test via initDatabase().
 */

// Must be set before importing schema module
Bun.env["DB_PATH"] = ":memory:";
if (Bun.env["DB_PATH"] !== ":memory:") {
  throw new Error(`[TASK17-PAGE12] DB_PATH must be ':memory:', got: ${Bun.env["DB_PATH"]}`);
}

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import {
  computeDelta,
  classifyVix,
  buildSummary,
  buildIndicator,
  handleGetGlobalMarkets,
  INDICATORS,
  type GlobalMarketsResponse,
  type DeltaResult,
} from "../interface/mcp/routes/globalMarketsHandler.js";

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

const NOW = "2026-06-11T14:00:00.000Z";
const NOW_MINUS_25H = "2026-06-10T13:00:00.000Z";  // 25h before = within 24h window baseline
const NOW_MINUS_8D = "2026-06-03T14:00:00.000Z";    // 8d before = within 7d window baseline

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

function makeFakeReq(url: string = "/api/global-markets"): import("node:http").IncomingMessage {
  return { url } as import("node:http").IncomingMessage;
}

/**
 * Insert a commodity_prices_history row directly via raw SQL.
 * cny_vnd_rate is intentionally excluded (dead column — always 0).
 */
function insertCommodityRow(
  fetchedAt: string,
  opts: {
    brent?: number; gold?: number; usd_vnd?: number; vix?: number; sp500?: number;
    shanghai?: number; hang_seng?: number; dxy?: number; copper?: number;
    silver?: number; jpy_vnd?: number; us10y?: number; source?: string;
  } = {},
): void {
  const db = getDb();
  const {
    brent = 90.0, gold = 4000.0, usd_vnd = 26000.0, vix = 20.0, sp500 = 7000.0,
    shanghai = 3900.0, hang_seng = 24000.0, dxy = 100.0, copper = 6.0,
    silver = 60.0, jpy_vnd = 160.0, us10y = 4.5, source = "yahoo",
  } = opts;
  db.prepare(
    `INSERT INTO commodity_prices_history
       (source, fetched_at, brent_crude_usd, gold_usd_per_oz, usd_vnd_rate, vix, sp500,
        shanghai_comp, hang_seng, dxy, cny_vnd_rate, copper_usd, silver_usd_per_oz,
        jpy_vnd_rate, us10y_yield)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
  ).run(source, fetchedAt, brent, gold, usd_vnd, vix, sp500, shanghai, hang_seng, dxy, copper, silver, jpy_vnd, us10y);
}

/** Seed the production-shape corpus: latest + 24h baseline + 7d zero-baseline row */
function seedProductionCorpus(): void {
  // Latest row (current)
  insertCommodityRow(NOW, {
    brent: 92.32, gold: 4106.7, usd_vnd: 26325, vix: 21.52, sp500: 7310.4,
    shanghai: 3987.0, hang_seng: 24249.29, dxy: 100.103, copper: 6.259,
    silver: 64.125, jpy_vnd: 163.55, us10y: 4.525,
  });
  // 24h baseline row
  insertCommodityRow(NOW_MINUS_25H, {
    brent: 91.0, gold: 4080.0, usd_vnd: 26300, vix: 20.0, sp500: 7250.0,
    shanghai: 3970.0, hang_seng: 24100.0, dxy: 99.8, copper: 6.2,
    silver: 63.0, jpy_vnd: 162.0, us10y: 4.5,
  });
  // 7d baseline row with ZERO values for some fields (zero-as-missing rule)
  insertCommodityRow(NOW_MINUS_8D, {
    brent: 0, gold: 0, usd_vnd: 0, vix: 0, sp500: 0,
    shanghai: 0, hang_seng: 0, dxy: 0, copper: 0,
    silver: 0, jpy_vnd: 0, us10y: 0,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// computeDelta unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("computeDelta", () => {
  it("AC-3: baseline <= 0 → delta=null, deltaPct=null, direction='flat' (NO -100%)", () => {
    const result: DeltaResult = computeDelta(92.32, 0);
    expect(result.delta).toBeNull();
    expect(result.deltaPct).toBeNull();
    expect(result.direction).toBe("flat");
    // Explicitly assert NOT -100
    expect(result.deltaPct).not.toBe(-100);
  });

  it("AC-3: null baseline → delta=null, deltaPct=null, direction='flat'", () => {
    const result: DeltaResult = computeDelta(92.32, null);
    expect(result.delta).toBeNull();
    expect(result.deltaPct).toBeNull();
    expect(result.direction).toBe("flat");
  });

  it("AC-4: positive delta → direction='up'", () => {
    const result: DeltaResult = computeDelta(100, 90);
    expect(result.delta).toBeCloseTo(10, 5);
    expect(result.deltaPct).toBeCloseTo(11.111, 2);
    expect(result.direction).toBe("up");
  });

  it("AC-4: negative delta → direction='down'", () => {
    const result: DeltaResult = computeDelta(90, 100);
    expect(result.delta).toBeCloseTo(-10, 5);
    expect(result.deltaPct).toBeCloseTo(-10, 2);
    expect(result.direction).toBe("down");
  });

  it("AC-4: zero delta → direction='flat'", () => {
    const result: DeltaResult = computeDelta(100, 100);
    expect(result.delta).toBeCloseTo(0, 5);
    expect(result.deltaPct).toBeCloseTo(0, 5);
    expect(result.direction).toBe("flat");
  });

  it("AC-3: negative baseline → treat as missing → delta=null", () => {
    const result: DeltaResult = computeDelta(100, -5);
    expect(result.delta).toBeNull();
    expect(result.deltaPct).toBeNull();
    expect(result.direction).toBe("flat");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// classifyVix unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("classifyVix", () => {
  it("AC-5: vix < 20 → 'low'", () => {
    expect(classifyVix(15)).toBe("low");
    expect(classifyVix(19.99)).toBe("low");
  });

  it("AC-5: vix exactly 20 → 'elevated'", () => {
    expect(classifyVix(20)).toBe("elevated");
  });

  it("AC-5: vix in [20, 30] → 'elevated'", () => {
    expect(classifyVix(25)).toBe("elevated");
    expect(classifyVix(30)).toBe("elevated");
  });

  it("AC-5: vix > 30 → 'high'", () => {
    expect(classifyVix(30.01)).toBe("high");
    expect(classifyVix(40)).toBe("high");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// INDICATORS config tests
// ─────────────────────────────────────────────────────────────────────────────

describe("INDICATORS config", () => {
  it("AC-2: exactly 12 indicators", () => {
    expect(INDICATORS).toHaveLength(12);
  });

  it("AC-9: cny_vnd_rate NEVER appears in INDICATORS", () => {
    const keys = INDICATORS.map((i) => i.key);
    expect(keys).not.toContain("cny_vnd_rate");
  });

  it("AC-10: all 12 canonical keys present in order", () => {
    const keys = INDICATORS.map((i) => i.key);
    expect(keys).toEqual([
      "brent_crude_usd",
      "gold_usd_per_oz",
      "copper_usd",
      "silver_usd_per_oz",
      "sp500",
      "shanghai_comp",
      "hang_seng",
      "vix",
      "dxy",
      "usd_vnd_rate",
      "jpy_vnd_rate",
      "us10y_yield",
    ]);
  });

  it("each indicator has key, label, unit, group fields", () => {
    for (const ind of INDICATORS) {
      expect(typeof ind.key).toBe("string");
      expect(typeof ind.label).toBe("string");
      expect(typeof ind.unit).toBe("string");
      expect(["commodities", "equities", "fx_rates"]).toContain(ind.group);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildSummary unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("buildSummary", () => {
  it("AC-11: vixBand 'low' → riskTone 'risk-on'", () => {
    const summary = buildSummary([], 15);
    expect(summary.vixBand).toBe("low");
    expect(summary.riskTone).toBe("risk-on");
  });

  it("AC-11: vixBand 'high' → riskTone 'risk-off'", () => {
    const summary = buildSummary([], 35);
    expect(summary.vixBand).toBe("high");
    expect(summary.riskTone).toBe("risk-off");
  });

  it("AC-11: vixBand 'elevated' → riskTone 'neutral'", () => {
    const summary = buildSummary([], 25);
    expect(summary.vixBand).toBe("elevated");
    expect(summary.riskTone).toBe("neutral");
  });

  it("AC-6: topMovers ordered by |deltaPct24h| DESC, only non-null deltaPct24h", () => {
    // Fake indicators with various deltaPct24h
    const indicators = [
      { key: "brent_crude_usd", label: "Dầu Brent", deltaPct24h: 1.5, direction24h: "up" as const },
      { key: "gold_usd_per_oz", label: "Vàng", deltaPct24h: null, direction24h: "flat" as const },
      { key: "sp500", label: "S&P 500", deltaPct24h: -3.2, direction24h: "down" as const },
      { key: "vix", label: "VIX", deltaPct24h: 8.0, direction24h: "up" as const },
      { key: "dxy", label: "DXY", deltaPct24h: 0.2, direction24h: "up" as const },
      { key: "us10y_yield", label: "10Y", deltaPct24h: -0.5, direction24h: "down" as const },
    ] as any[];

    const summary = buildSummary(indicators, 21);
    // topMovers should be sorted by |deltaPct24h| DESC, max 5, null excluded
    const movers = summary.topMovers;
    expect(movers).toHaveLength(5); // 5 non-null entries
    expect(movers[0]!.key).toBe("vix");       // |8.0| = 8.0 — largest
    expect(movers[1]!.key).toBe("sp500");     // |-3.2| = 3.2
    expect(movers[2]!.key).toBe("brent_crude_usd"); // |1.5| = 1.5
    expect(movers[3]!.key).toBe("us10y_yield");     // |-0.5| = 0.5
    expect(movers[4]!.key).toBe("dxy");             // |0.2| = 0.2
  });

  it("topMovers capped at 5", () => {
    const indicators = Array.from({ length: 12 }, (_, i) => ({
      key: `key${i}`, label: `Label${i}`, deltaPct24h: i + 1, direction24h: "up" as const,
    })) as any[];
    const summary = buildSummary(indicators, 21);
    expect(summary.topMovers).toHaveLength(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleGetGlobalMarkets HTTP handler tests (DB integration)
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK17-PAGE12 — handleGetGlobalMarkets HTTP handler", () => {
  it("AC-1: returns 200 JSON with required envelope fields", () => {
    seedProductionCorpus();

    const res = makeMockRes();
    handleGetGlobalMarkets(
      makeFakeReq("/api/global-markets"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(res.body) as GlobalMarketsResponse;
    expect(typeof body.generatedAt).toBe("string");
    expect(typeof body.currentAt).toBe("string");
    expect(body.source).toBe("yahoo");
    expect(typeof body.window).toBe("number");
    expect(Array.isArray(body.indicators)).toBe(true);
    expect(typeof body.series).toBe("object");
    expect(typeof body.summary).toBe("object");
    expect(typeof body.count).toBe("number");
  });

  it("AC-2: exactly 12 indicators returned", () => {
    seedProductionCorpus();

    const res = makeMockRes();
    handleGetGlobalMarkets(
      makeFakeReq("/api/global-markets"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as GlobalMarketsResponse;
    expect(body.indicators).toHaveLength(12);
  });

  it("AC-9: cny_vnd_rate NEVER appears in indicators", () => {
    seedProductionCorpus();

    const res = makeMockRes();
    handleGetGlobalMarkets(
      makeFakeReq("/api/global-markets"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as GlobalMarketsResponse;
    const keys = body.indicators.map((i) => i.key);
    expect(keys).not.toContain("cny_vnd_rate");

    // Also check series
    expect(Object.keys(body.series)).not.toContain("cny_vnd_rate");
  });

  it("AC-10: indicators in canonical order", () => {
    seedProductionCorpus();

    const res = makeMockRes();
    handleGetGlobalMarkets(
      makeFakeReq("/api/global-markets"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as GlobalMarketsResponse;
    const keys = body.indicators.map((i) => i.key);
    expect(keys).toEqual([
      "brent_crude_usd", "gold_usd_per_oz", "copper_usd", "silver_usd_per_oz",
      "sp500", "shanghai_comp", "hang_seng", "vix", "dxy",
      "usd_vnd_rate", "jpy_vnd_rate", "us10y_yield",
    ]);
  });

  it("AC-3: zero baseline → delta=null, deltaPct=null, direction='flat' (NO -100%)", () => {
    // Seed with 7d-zero row as only baseline
    insertCommodityRow(NOW, {
      brent: 92.32, gold: 4106.7, usd_vnd: 26325, vix: 21.52, sp500: 7310.4,
      shanghai: 3987.0, hang_seng: 24249.29, dxy: 100.103, copper: 6.259,
      silver: 64.125, jpy_vnd: 163.55, us10y: 4.525,
    });
    // 24h and 7d baselines are zero (not captured)
    insertCommodityRow("2026-06-10T14:00:00.000Z", {
      brent: 0, gold: 0, usd_vnd: 0, vix: 0, sp500: 0,
      shanghai: 0, hang_seng: 0, dxy: 0, copper: 0, silver: 0, jpy_vnd: 0, us10y: 0,
    });

    const res = makeMockRes();
    handleGetGlobalMarkets(
      makeFakeReq("/api/global-markets"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as GlobalMarketsResponse;
    expect(body.indicators).toHaveLength(12);

    for (const ind of body.indicators) {
      // Zero baseline → null deltas, not -100
      expect(ind.deltaPct24h).toBeNull();
      expect(ind.delta24h).toBeNull();
      expect(ind.direction24h).toBe("flat");
      // Current value should be real (non-zero)
      expect(ind.current).toBeGreaterThan(0);
    }
  });

  it("AC-4: correct delta/direction when 24h baseline is non-zero", () => {
    seedProductionCorpus();

    const res = makeMockRes();
    handleGetGlobalMarkets(
      makeFakeReq("/api/global-markets"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as GlobalMarketsResponse;
    // brent: current=92.32, 24h=91.0 → delta=+1.32 → direction="up"
    const brent = body.indicators.find((i) => i.key === "brent_crude_usd")!;
    expect(brent.delta24h).not.toBeNull();
    expect((brent.delta24h ?? 0)).toBeCloseTo(1.32, 1);
    expect(brent.direction24h).toBe("up");
  });

  it("AC-7: 200-on-empty — returns 200 + empty indicators/series when table empty", () => {
    const res = makeMockRes();
    handleGetGlobalMarkets(
      makeFakeReq("/api/global-markets"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as GlobalMarketsResponse;
    expect(body.indicators).toHaveLength(0);
    expect(Object.keys(body.series)).toHaveLength(0);
    expect(body.count).toBe(0);
    expect(body.currentAt).toBe("");
    // summary should still be present with null vix
    expect(body.summary.vix).toBeNull();
  });

  it("AC-8: returns 500 JSON on DB error (closed DB)", () => {
    const db = getDb();
    closeDb();

    const res = makeMockRes();
    handleGetGlobalMarkets(
      makeFakeReq("/api/global-markets"),
      res as unknown as import("node:http").ServerResponse,
      db,
    );

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body) as { error: string };
    expect(body.error).toBe("db_error");
  });

  it("AC-12: series drops v<=0 points", () => {
    // Insert multiple rows; some have zero values (should be excluded from series)
    insertCommodityRow(NOW, {
      brent: 92.32, gold: 4106.7, usd_vnd: 26325, vix: 21.52, sp500: 7310.4,
      shanghai: 3987.0, hang_seng: 24249.29, dxy: 100.103, copper: 6.259,
      silver: 64.125, jpy_vnd: 163.55, us10y: 4.525,
    });
    insertCommodityRow(NOW_MINUS_25H, {
      brent: 0, gold: 0, usd_vnd: 26300, vix: 0, sp500: 0,
      shanghai: 0, hang_seng: 0, dxy: 0, copper: 0, silver: 0, jpy_vnd: 162.0, us10y: 0,
    });

    const res = makeMockRes();
    handleGetGlobalMarkets(
      makeFakeReq("/api/global-markets?window=7"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as GlobalMarketsResponse;
    // brent series: only 1 non-zero point (NOW row), zero row dropped
    const brentSeries = body.series["brent_crude_usd"];
    if (brentSeries) {
      for (const pt of brentSeries) {
        expect(pt.v).toBeGreaterThan(0);
      }
    }
    // usd_vnd series: 2 points (both non-zero in both rows)
    const usdVndSeries = body.series["usd_vnd_rate"];
    if (usdVndSeries) {
      expect(usdVndSeries.length).toBe(2);
    }
  });

  it("AC-13: ?window=30 clamps to 30", () => {
    seedProductionCorpus();

    const res = makeMockRes();
    handleGetGlobalMarkets(
      makeFakeReq("/api/global-markets?window=30"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as GlobalMarketsResponse;
    expect(body.window).toBe(30);
  });

  it("AC-13: ?window=100 clamps to 30 (max)", () => {
    seedProductionCorpus();

    const res = makeMockRes();
    handleGetGlobalMarkets(
      makeFakeReq("/api/global-markets?window=100"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as GlobalMarketsResponse;
    expect(body.window).toBe(30);
  });

  it("AC-13: ?window=0 clamps to 1 (min)", () => {
    seedProductionCorpus();

    const res = makeMockRes();
    handleGetGlobalMarkets(
      makeFakeReq("/api/global-markets?window=0"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as GlobalMarketsResponse;
    expect(body.window).toBe(1);
  });

  it("AC-13: default window is 7", () => {
    seedProductionCorpus();

    const res = makeMockRes();
    handleGetGlobalMarkets(
      makeFakeReq("/api/global-markets"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as GlobalMarketsResponse;
    expect(body.window).toBe(7);
  });

  it("current values match latest row", () => {
    seedProductionCorpus();

    const res = makeMockRes();
    handleGetGlobalMarkets(
      makeFakeReq("/api/global-markets"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as GlobalMarketsResponse;
    const brent = body.indicators.find((i) => i.key === "brent_crude_usd")!;
    const vix = body.indicators.find((i) => i.key === "vix")!;
    const sp500 = body.indicators.find((i) => i.key === "sp500")!;
    const gold = body.indicators.find((i) => i.key === "gold_usd_per_oz")!;

    expect(brent.current).toBeCloseTo(92.32, 2);
    expect(vix.current).toBeCloseTo(21.52, 2);
    expect(sp500.current).toBeCloseTo(7310.4, 1);
    expect(gold.current).toBeCloseTo(4106.7, 1);
    expect(body.currentAt).toBe(NOW);
  });

  it("summary.vix matches vix current value", () => {
    seedProductionCorpus();

    const res = makeMockRes();
    handleGetGlobalMarkets(
      makeFakeReq("/api/global-markets"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as GlobalMarketsResponse;
    const vixInd = body.indicators.find((i) => i.key === "vix")!;
    expect(body.summary.vix).toBeCloseTo(vixInd.current, 2);
    // vix=21.52 → elevated → neutral riskTone
    expect(body.summary.vixBand).toBe("elevated");
    expect(body.summary.riskTone).toBe("neutral");
  });

  it("count matches indicators.length", () => {
    seedProductionCorpus();

    const res = makeMockRes();
    handleGetGlobalMarkets(
      makeFakeReq("/api/global-markets"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as GlobalMarketsResponse;
    expect(body.count).toBe(body.indicators.length);
  });
});
