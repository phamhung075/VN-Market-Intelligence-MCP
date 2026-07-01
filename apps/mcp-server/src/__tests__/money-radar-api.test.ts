/**
 * money-radar-api.test.ts
 *
 * Sprint: MONEY-RADAR-P0
 * Task:   MONEY-RADAR-P0-T3B-REST-API
 *
 * Tests for GET /api/money-radar handler (moneyRadarHandler.ts).
 *
 * Coverage:
 *   REG-1:  handleGetMoneyRadar is exported as a function
 *   GEN-1:  generated_at ALWAYS a valid ISO string regardless of data state
 *   200-1:  HTTP handler returns 200 even when every downstream call fails
 *   PARITY: handler response body is field-for-field IDENTICAL to calling
 *           getMoneyRadarComposite(db) directly — same usecase, same fields,
 *           so the frontend and the get_money_radar_composite MCP tool never
 *           diverge (moneyRadarTools.ts calls the same usecase function).
 *   NULL-1: thin-data scenario -> score=null, NOT zero-filled (HN-1/HN-2
 *           passthrough — the handler must not mangle the usecase output).
 *   NULL-2: divergence.flag stays UNKNOWN (never GREEN) when detector axes
 *           are null (HN-4 passthrough).
 *   SHAPE-1: response body matches brief §4 top-level field set exactly.
 *
 * Harness: same in-memory SQLite (bun:sqlite) + globalThis.fetch URL-routing
 * stub used by MONEY-RADAR-P0-T2-COMPOSITE.test.ts (no real HTTP, no real DB
 * file — the handler is a thin wrapper, so it reuses that fixture harness
 * rather than re-deriving new mock-guard-safe fixtures).
 *
 * Honest-NULL discipline: nulls pass through untouched; never fabricated.
 * Mock-guard: no real TA service / stock-price service URLs in test fixtures.
 *
 * Run: bun test src/__tests__/money-radar-api.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import type { IncomingMessage, ServerResponse } from "node:http";

import { initDatabase } from "../infrastructure/db/schema.js";
import { getMoneyRadarComposite } from "../application/usecases/getMoneyRadarComposite.js";
import { handleGetMoneyRadar } from "../interface/mcp/routes/moneyRadarHandler.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers (mirrors MONEY-RADAR-P0-T2-COMPOSITE.test.ts harness)
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal fake res for HTTP handler assertions */
function makeRes() {
  const res = {
    statusCode: 0,
    body: "",
    headers: {} as Record<string, string>,
    writeHead(code: number, headers: Record<string, string> = {}) {
      this.statusCode = code;
      Object.assign(this.headers, headers);
    },
    end(data = "") {
      this.body += data;
    },
  };
  return res;
}

const fakeReq = {} as IncomingMessage;

function stubOk(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function stubErr(msg = "internal error"): Response {
  return new Response(msg, { status: 500 });
}

/** Route globalThis.fetch by URL substring to the 3 downstream services. */
function buildFetchRouter(routes: Array<[string, () => Response]>): typeof globalThis.fetch {
  return (async (input: unknown) => {
    const url = typeof input === "string" ? input : (input as URL).toString();
    for (const [frag, handler] of routes) {
      if (url.includes(frag)) return handler();
    }
    return stubErr(`unrouted URL in test: ${url}`);
  }) as unknown as typeof globalThis.fetch;
}

/** Default all-fail router — every downstream call returns 500. */
function allFailRouter(): typeof globalThis.fetch {
  return buildFetchRouter([
    ["/price/foreign-accum-rank", () => stubErr("stock-price down")],
    ["/ta/money-flow-oscillators", () => stubErr("ta down")],
    ["/ta/volatility-indicators", () => stubErr("ta down")],
    ["/snapshot", () => stubErr("macro down")],
  ]);
}

async function makeDb(): Promise<Database> {
  const db = new Database(":memory:");
  await initDatabase(db);
  return db;
}

let _originalFetch: typeof globalThis.fetch;
beforeEach(() => {
  _originalFetch = globalThis.fetch;
});
afterEach(() => {
  globalThis.fetch = _originalFetch;
});

// ─────────────────────────────────────────────────────────────────────────────
// REG-1: exports exist
// ─────────────────────────────────────────────────────────────────────────────

describe("money-radar-api — registration", () => {
  it("REG-1: handleGetMoneyRadar is a function", () => {
    expect(typeof handleGetMoneyRadar).toBe("function");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GEN-1: generated_at always set
// ─────────────────────────────────────────────────────────────────────────────

describe("money-radar-api — generated_at invariant", () => {
  it("GEN-1: generated_at is an ISO string even when every downstream call fails", async () => {
    const db = await makeDb();
    globalThis.fetch = allFailRouter();

    const fakeServerRes = makeRes();
    await handleGetMoneyRadar(fakeReq, fakeServerRes as unknown as ServerResponse, db);

    const body = JSON.parse(fakeServerRes.body) as { generated_at: string };
    expect(body.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 200-1: HTTP 200 always
// ─────────────────────────────────────────────────────────────────────────────

describe("money-radar-api — HTTP 200 contract", () => {
  it("200-1a: HTTP 200 when every downstream call fails", async () => {
    const db = await makeDb();
    globalThis.fetch = allFailRouter();

    const fakeServerRes = makeRes();
    await handleGetMoneyRadar(fakeReq, fakeServerRes as unknown as ServerResponse, db);

    expect(fakeServerRes.statusCode).toBe(200);
  });

  it("200-1b: response body is valid JSON", async () => {
    const db = await makeDb();
    globalThis.fetch = allFailRouter();

    const fakeServerRes = makeRes();
    await handleGetMoneyRadar(fakeReq, fakeServerRes as unknown as ServerResponse, db);

    expect(() => JSON.parse(fakeServerRes.body)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PARITY: handler body === direct getMoneyRadarComposite(db) call
// The frontend and the get_money_radar_composite MCP tool must agree —
// both consume the exact same usecase function.
// ─────────────────────────────────────────────────────────────────────────────

describe("money-radar-api — parity with getMoneyRadarComposite usecase", () => {
  it("PARITY-1: handler response fields match a direct usecase call field-for-field (thin-data path)", async () => {
    const db = await makeDb();
    globalThis.fetch = allFailRouter();

    const direct = await getMoneyRadarComposite(db);

    const fakeServerRes = makeRes();
    await handleGetMoneyRadar(fakeReq, fakeServerRes as unknown as ServerResponse, db);
    const viaHandler = JSON.parse(fakeServerRes.body) as Record<string, unknown>;

    // generated_at + delta_5d are call-time-sensitive (Date.now() / forward-accruing
    // history) — compare every OTHER field exactly, and just type-check the two.
    expect(viaHandler["score"]).toBe(direct.score);
    expect(viaHandler["coverage_pct"]).toBe(direct.coverage_pct);
    expect(viaHandler["source_tier"]).toBe(direct.source_tier);
    expect(viaHandler["is_estimate"]).toBe(direct.is_estimate);
    expect(viaHandler["null_reason"]).toBe(direct.null_reason);
    expect(viaHandler["components"]).toEqual(direct.components);
    expect(viaHandler["divergence"]).toEqual(direct.divergence);
    expect(typeof viaHandler["generated_at"]).toBe("string");
  });

  it("PARITY-2: handler exposes the brief §4 top-level field set exactly (SHAPE-1)", async () => {
    const db = await makeDb();
    globalThis.fetch = allFailRouter();

    const fakeServerRes = makeRes();
    await handleGetMoneyRadar(fakeReq, fakeServerRes as unknown as ServerResponse, db);
    const body = JSON.parse(fakeServerRes.body) as Record<string, unknown>;

    expect(Object.keys(body).sort()).toEqual(
      [
        "score",
        "delta_5d",
        "divergence",
        "coverage_pct",
        "source_tier",
        "is_estimate",
        "null_reason",
        "components",
        "generated_at",
      ].sort(),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// NULL-1/NULL-2: honest-NULL passthrough — handler must not mangle the usecase output
// ─────────────────────────────────────────────────────────────────────────────

describe("money-radar-api — honest-NULL passthrough (HN-1, HN-2, HN-4)", () => {
  it("NULL-1: thin-data (no watchlist, all downstream fail) -> score=null, NOT zero-filled", async () => {
    const db = await makeDb();
    globalThis.fetch = allFailRouter();

    const fakeServerRes = makeRes();
    await handleGetMoneyRadar(fakeReq, fakeServerRes as unknown as ServerResponse, db);
    const body = JSON.parse(fakeServerRes.body) as {
      score: number | null;
      coverage_pct: number;
      null_reason: string | null;
    };

    expect(body.score).toBeNull();
    expect(body.score).not.toBe(0); // HN-1: never zero-filled
    expect(body.coverage_pct).toBeLessThan(0.5);
    expect(typeof body.null_reason).toBe("string");
  });

  it("NULL-2: divergence.flag stays UNKNOWN (never GREEN) when detector axes are null", async () => {
    const db = await makeDb();
    // No watchlist, no daily_ohlcv, no VNINDEX, no breadth history.
    globalThis.fetch = allFailRouter();

    const fakeServerRes = makeRes();
    await handleGetMoneyRadar(fakeReq, fakeServerRes as unknown as ServerResponse, db);
    const body = JSON.parse(fakeServerRes.body) as {
      divergence: { flag: string; severity: number; detectors: string[]; null_reason?: string };
    };

    expect(body.divergence.flag).toBe("UNKNOWN");
    expect(body.divergence.flag).not.toBe("GREEN");
    expect(body.divergence.detectors).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Full-coverage path: handler surfaces a non-null score end-to-end
// ─────────────────────────────────────────────────────────────────────────────

describe("money-radar-api — full-coverage path", () => {
  it("FULL-1: seeded watchlist + all downstream calls OK -> handler surfaces non-null score", async () => {
    const db = await makeDb();
    const now = new Date().toISOString();
    for (const code of ["AAA", "BBB", "CCC"]) {
      db.prepare(`INSERT INTO watchlist (code, exchange, added_at) VALUES (?, 'HOSE', ?)`).run(code, now);
    }
    const dates = Array.from({ length: 8 }, (_, i) => `2026-06-${String(i + 1).padStart(2, "0")}`);
    for (const [code, base] of [
      ["AAA", 50],
      ["BBB", 30],
      ["CCC", 20],
    ] as const) {
      dates.forEach((date, i) => {
        db.prepare(
          `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(code, date, base + i, base + i, base + i, base + i, 10_000 + i * 100, now);
      });
    }

    globalThis.fetch = buildFetchRouter([
      ["/price/foreign-accum-rank", () => stubOk({
        tickers: [], foreign_accum_z_market: 1.4, adtv_unit: "shares", computed_as_of: "2026-06-08T00:00:00Z",
      })],
      ["/ta/money-flow-oscillators", () => stubOk({
        tickers: [
          { code: "AAA", obv: 1000, rel_vol_z_20: 0.8, up_down_vol_ratio: 1.3, degraded_vwap: 52, is_proxy: true, bars_used: 8 },
          { code: "BBB", obv: -400, rel_vol_z_20: 0.5, up_down_vol_ratio: 0.9, degraded_vwap: 28, is_proxy: true, bars_used: 8 },
          { code: "CCC", obv: 200, rel_vol_z_20: 0.2, up_down_vol_ratio: 1.1, degraded_vwap: 21, is_proxy: true, bars_used: 8 },
        ],
      })],
      ["/ta/volatility-indicators", () => stubOk({
        rv_20d_percentile: 0.4, rv_10d_pct: 12, rv_20d_pct: 14, rv_60d_pct: null,
        gk_vol_20d_pct: 13, vol_regime: "NORMAL", vol_regime_pct: 0.4, history_sessions: 60,
        drawdown_252d_pct: null,
      })],
      ["/snapshot", () => stubOk({ signals: {}, fetchedAt: "2026-06-08T00:00:00Z" })],
    ]);

    const fakeServerRes = makeRes();
    await handleGetMoneyRadar(fakeReq, fakeServerRes as unknown as ServerResponse, db);

    expect(fakeServerRes.statusCode).toBe(200);
    const body = JSON.parse(fakeServerRes.body) as { score: number | null; coverage_pct: number };
    expect(body.score).not.toBeNull();
    expect(body.coverage_pct).toBeGreaterThanOrEqual(0.5);
  });
});
