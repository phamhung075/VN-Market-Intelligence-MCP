/**
 * TASK17-SUMMARIES — GET /api/market-summaries
 *
 * AC-1:  parseJsonField → null input → fallback [] (fails closed, never throws)
 * AC-2:  parseJsonField → malformed JSON string → fallback [] (fails closed, never throws)
 * AC-3:  parseJsonField → valid JSON → parsed value
 * AC-4:  mapKeyedToArray → ticker-keyed object → array with `symbol` field
 * AC-5:  mapKeyedToArray → null input → []
 * AC-6:  mapKeyedToArray → array input → [] (not an object)
 * AC-7:  buildListItem → keyEventCount from parsed key_events_json array
 * AC-8:  buildListItem → stockCount from parsed stock_performance_json object
 * AC-9:  buildListItem → NULL json → keyEventCount=0, stockCount=0
 * AC-10: buildListItem → MALFORMED json → keyEventCount=0, stockCount=0
 * AC-11: buildDetail → production-shape row → stockPerformance has `symbol` field
 * AC-12: buildDetail → production-shape row → recommendations has `symbol` field
 * AC-13: buildDetail → NULL json cols → keyEvents=[], stockPerformance=[], recommendations=[]
 * AC-14: buildDetail → MALFORMED json cols → keyEvents=[], stockPerformance=[], recommendations=[]
 * AC-15: LIST mode → 200 JSON with {generatedAt, periods, items, count}
 * AC-16: LIST mode → periods dict reflects DB distribution
 * AC-17: LIST mode → ?period=daily filters to daily rows only
 * AC-18: LIST mode → invalid ?period= ignored (returns all)
 * AC-19: LIST mode → ?limit=1 clamps items[] to 1
 * AC-20: LIST mode → ?limit=999 clamped to 200
 * AC-21: DETAIL mode → ?id= present → 200 {generatedAt, item}
 * AC-22: DETAIL mode → id not found → 200 {generatedAt, item:null}
 * AC-23: 200 + empty items[] when table is empty (NO error)
 * AC-24: 500 JSON on DB error (closed DB)
 * AC-25: count matches items.length
 *
 * PRODUCTION SHAPE seeds:
 *   - Normal production-shape row (stock_performance_json + recommendation_json as OBJECTS,
 *     key_events_json as ARRAY)
 *   - Row with ALL *_json = NULL (proves NULL → fallback [])
 *   - Row with MALFORMED json strings (proves malformed → fallback [])
 *
 * DDD layer: interface + infrastructure tested together at the handler seam.
 * Isolation: in-memory SQLite, CREATE TABLE in seed (NOT schema-system.ts).
 */

// Must be set before importing schema module
Bun.env["DB_PATH"] = ":memory:";
if (Bun.env["DB_PATH"] !== ":memory:") {
  throw new Error(`[TASK17-SUMMARIES] DB_PATH must be ':memory:', got: ${Bun.env["DB_PATH"]}`);
}

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  parseJsonField,
  mapKeyedToArray,
  buildListItem,
  buildDetail,
  handleGetMarketSummaries,
} from "../interface/mcp/routes/marketSummaryHandler.js";
import type { MarketSummaryRow } from "../infrastructure/db/marketSummaryStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// In-memory DB helpers (NOT schema-system.ts — per task spec)
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal in-memory Database for testing. Created fresh per test. */
let testDb: Database;

function createSchema(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS market_summaries (
      id TEXT PRIMARY KEY,
      period_type TEXT NOT NULL,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      summary_text TEXT NOT NULL DEFAULT '',
      key_events_json TEXT,
      stock_performance_json TEXT,
      alerts_summary_json TEXT,
      macro_context_json TEXT,
      recommendation_json TEXT,
      news_count INTEGER DEFAULT 0,
      alert_count INTEGER DEFAULT 0,
      report_count INTEGER DEFAULT 0,
      data_sources_json TEXT,
      UNIQUE(period_type, period_start)
    )
  `);
}

/** PRODUCTION-SHAPE row: stock_performance_json + recommendation_json as OBJECTS keyed by ticker */
const PROD_SHAPE_ROW_VALUES = {
  id: "daily-2026-06-10",
  period_type: "daily",
  period_start: "2026-06-10",
  period_end: "2026-06-10",
  created_at: "2026-06-10T09:10:45.925Z",
  updated_at: "2026-06-10T09:10:45.925Z",
  summary_text: "Thị trường hôm nay giao dịch tương đối tích cực, VN-Index tăng nhẹ.",
  key_events_json: JSON.stringify([
    { date: "2026-06-10", title: "FED giữ lãi suất", impact: "high", direction: "neutral" },
    { date: "2026-06-10", title: "CPI thấp hơn kỳ vọng", impact: "medium", direction: "positive" },
  ]),
  stock_performance_json: JSON.stringify({
    VCB: { firstPrice: 61700, lastPrice: 61900, changePct: 0.33, alertCount: 0 },
    FPT: { firstPrice: 120000, lastPrice: 122000, changePct: 1.67, alertCount: 1 },
    HPG: { firstPrice: 28000, lastPrice: 27500, changePct: -1.79, alertCount: 2 },
  }),
  alerts_summary_json: null,
  macro_context_json: null,
  recommendation_json: JSON.stringify({
    VCB: { outlook: "neutral", confidence: 0.5, reasoning: "price stable (+0.3%)" },
    FPT: { outlook: "bullish", confidence: 0.72, reasoning: "strong uptrend" },
    HPG: { outlook: "bearish", confidence: 0.6, reasoning: "breaking support" },
  }),
  news_count: 15,
  alert_count: 3,
  report_count: 1,
  data_sources_json: null,
};

/** Row with ALL nullable *_json = NULL */
const NULL_JSON_ROW_VALUES = {
  id: "weekly-2026-06-01",
  period_type: "weekly",
  period_start: "2026-06-01",
  period_end: "2026-06-07",
  created_at: "2026-06-07T18:00:00.000Z",
  updated_at: "2026-06-07T18:00:00.000Z",
  summary_text: "Tuần giao dịch bình thường.",
  key_events_json: null,
  stock_performance_json: null,
  alerts_summary_json: null,
  macro_context_json: null,
  recommendation_json: null,
  news_count: 5,
  alert_count: 0,
  report_count: 0,
  data_sources_json: null,
};

/** Row with MALFORMED json strings — proves parseJsonField fails closed to [] */
const MALFORMED_JSON_ROW_VALUES = {
  id: "monthly-2026-06-01",
  period_type: "monthly",
  period_start: "2026-06-01",
  period_end: "2026-06-30",
  created_at: "2026-06-01T00:00:00.000Z",
  updated_at: "2026-06-01T00:00:00.000Z",
  summary_text: "Tháng 6.",
  key_events_json: "NOT_VALID_JSON{{{",
  stock_performance_json: "[broken",
  alerts_summary_json: "bad",
  macro_context_json: "bad",
  recommendation_json: '{"VCB": missing_quotes}',
  news_count: 0,
  alert_count: 0,
  report_count: 0,
  data_sources_json: null,
};

function insertRow(db: Database, row: typeof PROD_SHAPE_ROW_VALUES | typeof NULL_JSON_ROW_VALUES | typeof MALFORMED_JSON_ROW_VALUES): void {
  db.run(
    `INSERT OR REPLACE INTO market_summaries (
       id, period_type, period_start, period_end, created_at, updated_at,
       summary_text, key_events_json, stock_performance_json,
       alerts_summary_json, macro_context_json, recommendation_json,
       news_count, alert_count, report_count, data_sources_json
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      row.id, row.period_type, row.period_start, row.period_end,
      row.created_at, row.updated_at, row.summary_text,
      row.key_events_json, row.stock_performance_json,
      row.alerts_summary_json, row.macro_context_json, row.recommendation_json,
      row.news_count, row.alert_count, row.report_count, row.data_sources_json,
    ],
  );
}

const NOW = "2026-06-11T00:00:00.000Z";

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

function makeFakeReq(url: string): import("node:http").IncomingMessage {
  return { url } as import("node:http").IncomingMessage;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  testDb = new Database(":memory:");
  createSchema(testDb);
});

afterEach(() => {
  testDb.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// parseJsonField unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("parseJsonField", () => {
  it("AC-1: null input → fallback []", () => {
    const result = parseJsonField<unknown[]>(null, []);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it("AC-2: malformed JSON → fallback [] (never throws)", () => {
    const result = parseJsonField<unknown[]>("NOT_VALID_JSON{{{", []);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it("AC-3: valid JSON array → parsed value", () => {
    const result = parseJsonField<unknown[]>('[{"key":"val"}]', []);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
  });

  it("AC-3b: valid JSON object → parsed value", () => {
    const result = parseJsonField<Record<string, number>>('{"a":1,"b":2}', {});
    expect(result["a"]).toBe(1);
    expect(result["b"]).toBe(2);
  });

  it("empty string → fallback", () => {
    const result = parseJsonField<unknown[]>("", []);
    expect(result).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mapKeyedToArray unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("mapKeyedToArray", () => {
  it("AC-4: ticker-keyed object → array with `symbol` field", () => {
    const obj = {
      VCB: { firstPrice: 61700, lastPrice: 61900, changePct: 0.33 },
      FPT: { firstPrice: 120000, lastPrice: 122000, changePct: 1.67 },
    };
    const arr = mapKeyedToArray(obj);
    expect(arr).toHaveLength(2);
    const symbols = arr.map((i) => i["symbol"]);
    expect(symbols).toContain("VCB");
    expect(symbols).toContain("FPT");
    const vcb = arr.find((i) => i["symbol"] === "VCB")!;
    expect(vcb["firstPrice"]).toBe(61700);
  });

  it("AC-5: null input → []", () => {
    expect(mapKeyedToArray(null)).toHaveLength(0);
  });

  it("AC-6: array input → [] (not a keyed object)", () => {
    expect(mapKeyedToArray([{ a: 1 }])).toHaveLength(0);
  });

  it("primitive input → []", () => {
    expect(mapKeyedToArray("string")).toHaveLength(0);
    expect(mapKeyedToArray(42)).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildListItem unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("buildListItem", () => {
  it("AC-7: keyEventCount from parsed key_events_json array", () => {
    const row: MarketSummaryRow = {
      ...PROD_SHAPE_ROW_VALUES,
      summary_text: "",
      summary_preview: "Thị trường hôm nay",
    };
    const item = buildListItem(row);
    expect(item.keyEventCount).toBe(2); // 2 events in PROD_SHAPE_ROW_VALUES
  });

  it("AC-8: stockCount from parsed stock_performance_json object", () => {
    const row: MarketSummaryRow = {
      ...PROD_SHAPE_ROW_VALUES,
      summary_text: "",
      summary_preview: "preview",
    };
    const item = buildListItem(row);
    expect(item.stockCount).toBe(3); // VCB + FPT + HPG
  });

  it("AC-9: NULL json → keyEventCount=0, stockCount=0", () => {
    const row: MarketSummaryRow = {
      ...NULL_JSON_ROW_VALUES,
      summary_text: "",
      summary_preview: "Tuần giao dịch",
    };
    const item = buildListItem(row);
    expect(item.keyEventCount).toBe(0);
    expect(item.stockCount).toBe(0);
  });

  it("AC-10: MALFORMED json → keyEventCount=0, stockCount=0 (fails closed)", () => {
    const row: MarketSummaryRow = {
      ...MALFORMED_JSON_ROW_VALUES,
      summary_text: "",
      summary_preview: "Tháng 6",
    };
    const item = buildListItem(row);
    expect(item.keyEventCount).toBe(0);
    expect(item.stockCount).toBe(0);
  });

  it("summaryPreview is trimmed string from summary_preview alias", () => {
    const row: MarketSummaryRow = {
      ...PROD_SHAPE_ROW_VALUES,
      summary_text: "",
      summary_preview: "  hello world  ",
    };
    const item = buildListItem(row);
    expect(item.summaryPreview).toBe("hello world");
  });

  it("null summary_preview → empty string", () => {
    const row: MarketSummaryRow = {
      ...PROD_SHAPE_ROW_VALUES,
      summary_text: "",
      summary_preview: null,
    };
    const item = buildListItem(row);
    expect(item.summaryPreview).toBe("");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildDetail unit tests (production shape)
// ─────────────────────────────────────────────────────────────────────────────

describe("buildDetail — production shape", () => {
  it("AC-11: stockPerformance array has `symbol` field (ticker-keyed → array)", () => {
    const row: MarketSummaryRow = {
      ...PROD_SHAPE_ROW_VALUES,
      summary_preview: null,
    };
    const detail = buildDetail(row);
    expect(Array.isArray(detail.stockPerformance)).toBe(true);
    expect(detail.stockPerformance.length).toBe(3);
    const symbols = detail.stockPerformance.map((s) => s.symbol);
    expect(symbols).toContain("VCB");
    expect(symbols).toContain("FPT");
    expect(symbols).toContain("HPG");
    // Verify field values for VCB
    const vcb = detail.stockPerformance.find((s) => s.symbol === "VCB")!;
    expect(vcb.firstPrice).toBe(61700);
    expect(vcb.lastPrice).toBe(61900);
    expect(vcb.changePct).toBe(0.33);
    expect(vcb.alertCount).toBe(0);
  });

  it("AC-12: recommendations array has `symbol` field (ticker-keyed → array)", () => {
    const row: MarketSummaryRow = {
      ...PROD_SHAPE_ROW_VALUES,
      summary_preview: null,
    };
    const detail = buildDetail(row);
    expect(Array.isArray(detail.recommendations)).toBe(true);
    expect(detail.recommendations.length).toBe(3);
    const symbols = detail.recommendations.map((r) => r.symbol);
    expect(symbols).toContain("VCB");
    expect(symbols).toContain("FPT");
    expect(symbols).toContain("HPG");
    // Verify FPT recommendation
    const fpt = detail.recommendations.find((r) => r.symbol === "FPT")!;
    expect(fpt.outlook).toBe("bullish");
    expect(fpt.confidence).toBe(0.72);
    expect(fpt.reasoning).toBe("strong uptrend");
  });

  it("keyEvents parsed correctly (already an array in DB)", () => {
    const row: MarketSummaryRow = {
      ...PROD_SHAPE_ROW_VALUES,
      summary_preview: null,
    };
    const detail = buildDetail(row);
    expect(Array.isArray(detail.keyEvents)).toBe(true);
    expect(detail.keyEvents.length).toBe(2);
    expect(detail.keyEvents[0]!.title).toBe("FED giữ lãi suất");
    expect(detail.keyEvents[0]!.impact).toBe("high");
    expect(detail.keyEvents[1]!.direction).toBe("positive");
  });

  it("summaryText passes through full text", () => {
    const row: MarketSummaryRow = {
      ...PROD_SHAPE_ROW_VALUES,
      summary_preview: null,
    };
    const detail = buildDetail(row);
    expect(detail.summaryText).toBe(PROD_SHAPE_ROW_VALUES.summary_text);
  });

  it("AC-13: NULL json cols → keyEvents=[], stockPerformance=[], recommendations=[]", () => {
    const row: MarketSummaryRow = {
      ...NULL_JSON_ROW_VALUES,
      summary_preview: null,
    };
    const detail = buildDetail(row);
    expect(detail.keyEvents).toHaveLength(0);
    expect(detail.stockPerformance).toHaveLength(0);
    expect(detail.recommendations).toHaveLength(0);
  });

  it("AC-14: MALFORMED json cols → keyEvents=[], stockPerformance=[], recommendations=[] (fails closed)", () => {
    const row: MarketSummaryRow = {
      ...MALFORMED_JSON_ROW_VALUES,
      summary_preview: null,
    };
    const detail = buildDetail(row);
    expect(detail.keyEvents).toHaveLength(0);
    expect(detail.stockPerformance).toHaveLength(0);
    expect(detail.recommendations).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleGetMarketSummaries HTTP handler tests (DB integration)
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK17-SUMMARIES — handleGetMarketSummaries LIST mode", () => {
  it("AC-15: returns 200 JSON with required envelope fields", () => {
    insertRow(testDb, PROD_SHAPE_ROW_VALUES);

    const res = makeMockRes();
    handleGetMarketSummaries(
      makeFakeReq("/api/market-summaries"),
      res as unknown as import("node:http").ServerResponse,
      testDb,
      new Date(NOW),
    );

    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse(res.body) as {
      generatedAt: string;
      periods: Record<string, number>;
      items: unknown[];
      count: number;
    };
    expect(body.generatedAt).toBe(NOW);
    expect(typeof body.periods).toBe("object");
    expect(Array.isArray(body.items)).toBe(true);
    expect(typeof body.count).toBe("number");
  });

  it("AC-16: periods dict reflects DB distribution", () => {
    insertRow(testDb, PROD_SHAPE_ROW_VALUES);  // daily
    insertRow(testDb, NULL_JSON_ROW_VALUES);    // weekly
    insertRow(testDb, MALFORMED_JSON_ROW_VALUES); // monthly

    const res = makeMockRes();
    handleGetMarketSummaries(
      makeFakeReq("/api/market-summaries"),
      res as unknown as import("node:http").ServerResponse,
      testDb,
      new Date(NOW),
    );

    const body = JSON.parse(res.body) as { periods: Record<string, number> };
    expect(body.periods["daily"]).toBe(1);
    expect(body.periods["weekly"]).toBe(1);
    expect(body.periods["monthly"]).toBe(1);
  });

  it("AC-17: ?period=daily filters to daily rows only", () => {
    insertRow(testDb, PROD_SHAPE_ROW_VALUES);  // daily
    insertRow(testDb, NULL_JSON_ROW_VALUES);    // weekly
    insertRow(testDb, MALFORMED_JSON_ROW_VALUES); // monthly

    const res = makeMockRes();
    handleGetMarketSummaries(
      makeFakeReq("/api/market-summaries?period=daily"),
      res as unknown as import("node:http").ServerResponse,
      testDb,
      new Date(NOW),
    );

    const body = JSON.parse(res.body) as {
      items: Array<{ periodType: string }>;
      count: number;
    };
    expect(body.count).toBe(1);
    expect(body.items.every((i) => i.periodType === "daily")).toBe(true);
  });

  it("AC-18: invalid ?period= ignored (returns all rows)", () => {
    insertRow(testDb, PROD_SHAPE_ROW_VALUES);
    insertRow(testDb, NULL_JSON_ROW_VALUES);

    const res = makeMockRes();
    handleGetMarketSummaries(
      makeFakeReq("/api/market-summaries?period=invalid_type"),
      res as unknown as import("node:http").ServerResponse,
      testDb,
      new Date(NOW),
    );

    const body = JSON.parse(res.body) as { count: number };
    expect(body.count).toBe(2); // both rows returned
  });

  it("AC-19: ?limit=1 clamps items[] to 1", () => {
    insertRow(testDb, PROD_SHAPE_ROW_VALUES);
    insertRow(testDb, NULL_JSON_ROW_VALUES);
    insertRow(testDb, MALFORMED_JSON_ROW_VALUES);

    const res = makeMockRes();
    handleGetMarketSummaries(
      makeFakeReq("/api/market-summaries?limit=1"),
      res as unknown as import("node:http").ServerResponse,
      testDb,
      new Date(NOW),
    );

    const body = JSON.parse(res.body) as { items: unknown[]; count: number };
    expect(body.items).toHaveLength(1);
    expect(body.count).toBe(1);
  });

  it("AC-20: ?limit=999 clamped to 200 (no error)", () => {
    // Seed a few rows — just verify no error + count <= 200
    insertRow(testDb, PROD_SHAPE_ROW_VALUES);

    const res = makeMockRes();
    handleGetMarketSummaries(
      makeFakeReq("/api/market-summaries?limit=999"),
      res as unknown as import("node:http").ServerResponse,
      testDb,
      new Date(NOW),
    );

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { count: number };
    expect(body.count).toBeLessThanOrEqual(200);
  });

  it("AC-23: 200 + empty items[] when table is empty (NO error)", () => {
    const res = makeMockRes();
    handleGetMarketSummaries(
      makeFakeReq("/api/market-summaries"),
      res as unknown as import("node:http").ServerResponse,
      testDb,
      new Date(NOW),
    );

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      items: unknown[];
      count: number;
      periods: Record<string, number>;
    };
    expect(body.items).toHaveLength(0);
    expect(body.count).toBe(0);
    expect(Object.keys(body.periods)).toHaveLength(0);
  });

  it("AC-24: returns 500 JSON on DB error (closed DB)", () => {
    testDb.close();
    const closedDb = testDb; // reference to closed DB

    const res = makeMockRes();
    handleGetMarketSummaries(
      makeFakeReq("/api/market-summaries"),
      res as unknown as import("node:http").ServerResponse,
      closedDb,
      new Date(NOW),
    );

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body) as { error: string };
    expect(body.error).toBe("db_error");

    // Re-open for afterEach cleanup (create fresh to prevent double-close error)
    testDb = new Database(":memory:");
  });

  it("AC-25: count matches items.length", () => {
    insertRow(testDb, PROD_SHAPE_ROW_VALUES);
    insertRow(testDb, NULL_JSON_ROW_VALUES);

    const res = makeMockRes();
    handleGetMarketSummaries(
      makeFakeReq("/api/market-summaries"),
      res as unknown as import("node:http").ServerResponse,
      testDb,
      new Date(NOW),
    );

    const body = JSON.parse(res.body) as { items: unknown[]; count: number };
    expect(body.count).toBe(body.items.length);
  });
});

describe("TASK17-SUMMARIES — handleGetMarketSummaries DETAIL mode", () => {
  it("AC-21: ?id= present → 200 {generatedAt, item} with detail shape", () => {
    insertRow(testDb, PROD_SHAPE_ROW_VALUES);

    const res = makeMockRes();
    handleGetMarketSummaries(
      makeFakeReq("/api/market-summaries?id=daily-2026-06-10"),
      res as unknown as import("node:http").ServerResponse,
      testDb,
      new Date(NOW),
    );

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      generatedAt: string;
      item: {
        id: string;
        summaryText: string;
        keyEvents: unknown[];
        stockPerformance: Array<{ symbol: string; firstPrice: number }>;
        recommendations: Array<{ symbol: string; outlook: string }>;
      } | null;
    };
    expect(body.generatedAt).toBe(NOW);
    expect(body.item).not.toBeNull();
    expect(body.item!.id).toBe("daily-2026-06-10");
    expect(typeof body.item!.summaryText).toBe("string");
    expect(body.item!.summaryText.length).toBeGreaterThan(0);
    // stockPerformance has symbol field (ticker-keyed object → array conversion)
    expect(body.item!.stockPerformance.length).toBe(3);
    expect(body.item!.stockPerformance.find((s) => s.symbol === "VCB")!.firstPrice).toBe(61700);
    // recommendations has symbol field
    expect(body.item!.recommendations.length).toBe(3);
    expect(body.item!.recommendations.find((r) => r.symbol === "FPT")!.outlook).toBe("bullish");
    // keyEvents parsed from array
    expect(Array.isArray(body.item!.keyEvents)).toBe(true);
    expect(body.item!.keyEvents.length).toBe(2);
  });

  it("AC-22: ?id= not found → 200 {generatedAt, item:null}", () => {
    const res = makeMockRes();
    handleGetMarketSummaries(
      makeFakeReq("/api/market-summaries?id=daily-9999-99-99"),
      res as unknown as import("node:http").ServerResponse,
      testDb,
      new Date(NOW),
    );

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { generatedAt: string; item: null };
    expect(body.item).toBeNull();
    expect(body.generatedAt).toBe(NOW);
  });

  it("detail with NULL json cols → keyEvents/stockPerformance/recommendations = []", () => {
    insertRow(testDb, NULL_JSON_ROW_VALUES);

    const res = makeMockRes();
    handleGetMarketSummaries(
      makeFakeReq("/api/market-summaries?id=weekly-2026-06-01"),
      res as unknown as import("node:http").ServerResponse,
      testDb,
      new Date(NOW),
    );

    const body = JSON.parse(res.body) as {
      item: {
        keyEvents: unknown[];
        stockPerformance: unknown[];
        recommendations: unknown[];
      } | null;
    };
    expect(body.item).not.toBeNull();
    expect(body.item!.keyEvents).toHaveLength(0);
    expect(body.item!.stockPerformance).toHaveLength(0);
    expect(body.item!.recommendations).toHaveLength(0);
  });

  it("detail with MALFORMED json → keyEvents/stockPerformance/recommendations = []", () => {
    insertRow(testDb, MALFORMED_JSON_ROW_VALUES);

    const res = makeMockRes();
    handleGetMarketSummaries(
      makeFakeReq("/api/market-summaries?id=monthly-2026-06-01"),
      res as unknown as import("node:http").ServerResponse,
      testDb,
      new Date(NOW),
    );

    const body = JSON.parse(res.body) as {
      item: {
        keyEvents: unknown[];
        stockPerformance: unknown[];
        recommendations: unknown[];
      } | null;
    };
    expect(body.item).not.toBeNull();
    expect(body.item!.keyEvents).toHaveLength(0);
    expect(body.item!.stockPerformance).toHaveLength(0);
    expect(body.item!.recommendations).toHaveLength(0);
  });
});
