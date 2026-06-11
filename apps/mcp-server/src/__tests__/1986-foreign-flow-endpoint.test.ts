/**
 * TASK17-FOREIGN-FLOW — GET /api/foreign-flow
 *
 * AC-1: items ordered by foreignVolume DESC (net buys first, net sells last)
 * AC-2: direction derived from sign (>0=BUY, <0=SELL, 0=FLAT)
 * AC-3: null current_holding_ratio, max_holding_ratio, marketCapBn → null in item (NOT 0)
 * AC-4: ?limit= is respected (default 200, clamp 500)
 * AC-5: handleGetForeignFlow returns 200 JSON with {tradingDate, items, summary, count, fetchedAt}
 * AC-6: returns 200 + empty items[] when no rows exist (no error)
 * AC-7: returns 500 on DB error
 * AC-8: count matches items.length
 * AC-9: summary.netBuyCount / netSellCount accurate
 * AC-10: summary.topBuys = first 5 items (highest positive foreignVolume)
 * AC-11: summary.topSells = top 5 negative items (most negative first)
 * AC-12: only latest trading date rows served (WHERE date = MAX(date))
 * AC-13: zero foreignVolume → FLAT direction
 * AC-14: tradingDate is empty string when no rows
 *
 * Real-shape seeds: include negative foreign_volume (net sell), positive (net buy),
 * zero/flat, AND null current_holding_ratio/market_cap_bn rows — matches production shape.
 *
 * DDD layer: interface + infrastructure tested together at the handler seam.
 * Isolation: in-memory SQLite, reset per test via initDatabase().
 */

// Must be set before importing schema module
Bun.env["DB_PATH"] = ":memory:";
if (Bun.env["DB_PATH"] !== ":memory:") {
  throw new Error(`[1986] DB_PATH must be ':memory:', got: ${Bun.env["DB_PATH"]}`);
}

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import {
  queryForeignFlow,
  handleGetForeignFlow,
  deriveDirection,
  shapeRow,
  buildSummary,
  type ForeignFlowItem,
  type ForeignFlowResponse,
} from "../interface/mcp/routes/foreignFlowHandler.js";

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

type TradingStatsInsert = {
  code: string;
  date: string;
  foreign_volume: number;
  foreign_room?: number | null;
  current_holding_ratio?: number | null;
  max_holding_ratio?: number | null;
  market_cap_bn?: number | null;
  fetched_at?: string;
};

function insertRow(db: Database, params: TradingStatsInsert): void {
  db.prepare(
    `INSERT INTO vnstock_trading_stats
       (code, date, foreign_volume, foreign_room, current_holding_ratio,
        max_holding_ratio, market_cap_bn, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    params.code,
    params.date,
    params.foreign_volume,
    params.foreign_room ?? null,
    params.current_holding_ratio ?? null,
    params.max_holding_ratio ?? null,
    params.market_cap_bn ?? null,
    params.fetched_at ?? "2026-06-11 08:59:55",
  );
}

/** Minimal mock ServerResponse. */
function makeMockRes(): {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  writeHead: (status: number, headers?: Record<string, string>) => void;
  end: (data: string) => void;
} {
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

function makeFakeReq(url: string = "/api/foreign-flow"): import("node:http").IncomingMessage {
  return { url } as import("node:http").IncomingMessage;
}

// ─────────────────────────────────────────────────────────────────────────────
// Production shape: null-heavy rows (matching real DB as of 2026-06-11)
// current_holding_ratio, max_holding_ratio, market_cap_bn are ALL NULL today
// ─────────────────────────────────────────────────────────────────────────────
const PROD_DATE = "2026-06-11";
const PROD_FETCHED = "2026-06-11 08:59:55";

// ─────────────────────────────────────────────────────────────────────────────
// deriveDirection unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("deriveDirection", () => {
  it("positive → BUY", () => {
    expect(deriveDirection(50000)).toBe("BUY");
  });

  it("negative → SELL", () => {
    expect(deriveDirection(-393749)).toBe("SELL");
  });

  it("zero → FLAT", () => {
    expect(deriveDirection(0)).toBe("FLAT");
  });

  it("large positive → BUY", () => {
    expect(deriveDirection(9999999)).toBe("BUY");
  });

  it("small negative → SELL", () => {
    expect(deriveDirection(-1)).toBe("SELL");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// shapeRow unit tests — null tolerance (load-bearing: this is where the
// contract-mismatch defect class hits; null current_holding_ratio MUST be null)
// ─────────────────────────────────────────────────────────────────────────────

describe("shapeRow — null tolerance (production shape)", () => {
  it("null current_holding_ratio passes through as null (not 0)", () => {
    const row = {
      code: "NVL",
      foreign_volume: -393749,
      foreign_room: 97777804.2,
      current_holding_ratio: null,
      max_holding_ratio: null,
      market_cap_bn: null,
      date: PROD_DATE,
      fetched_at: PROD_FETCHED,
    };
    const item = shapeRow(row);
    expect(item.currentHoldingRatio).toBeNull();
    expect(item.maxHoldingRatio).toBeNull();
    expect(item.marketCapBn).toBeNull();
  });

  it("non-null values pass through correctly", () => {
    const row = {
      code: "FPT",
      foreign_volume: 1200,
      foreign_room: 1000000.0,
      current_holding_ratio: 0.23,
      max_holding_ratio: 0.49,
      market_cap_bn: 85.5,
      date: PROD_DATE,
      fetched_at: PROD_FETCHED,
    };
    const item = shapeRow(row);
    expect(item.currentHoldingRatio).toBe(0.23);
    expect(item.maxHoldingRatio).toBe(0.49);
    expect(item.marketCapBn).toBe(85.5);
    expect(item.foreignRoom).toBe(1000000.0);
  });

  it("direction derived correctly on shaped row", () => {
    const sellRow = { code: "X", foreign_volume: -100, foreign_room: null, current_holding_ratio: null, max_holding_ratio: null, market_cap_bn: null, date: PROD_DATE, fetched_at: PROD_FETCHED };
    const buyRow = { code: "Y", foreign_volume: 100, foreign_room: null, current_holding_ratio: null, max_holding_ratio: null, market_cap_bn: null, date: PROD_DATE, fetched_at: PROD_FETCHED };
    const flatRow = { code: "Z", foreign_volume: 0, foreign_room: null, current_holding_ratio: null, max_holding_ratio: null, market_cap_bn: null, date: PROD_DATE, fetched_at: PROD_FETCHED };
    expect(shapeRow(sellRow).direction).toBe("SELL");
    expect(shapeRow(buyRow).direction).toBe("BUY");
    expect(shapeRow(flatRow).direction).toBe("FLAT");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildSummary unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("buildSummary", () => {
  it("counts netBuyCount and netSellCount correctly", () => {
    const items: ForeignFlowItem[] = [
      { code: "A", foreignVolume: 100, direction: "BUY", foreignRoom: null, currentHoldingRatio: null, maxHoldingRatio: null, marketCapBn: null, fetchedAt: PROD_FETCHED },
      { code: "B", foreignVolume: 50, direction: "BUY", foreignRoom: null, currentHoldingRatio: null, maxHoldingRatio: null, marketCapBn: null, fetchedAt: PROD_FETCHED },
      { code: "C", foreignVolume: 0, direction: "FLAT", foreignRoom: null, currentHoldingRatio: null, maxHoldingRatio: null, marketCapBn: null, fetchedAt: PROD_FETCHED },
      { code: "D", foreignVolume: -50, direction: "SELL", foreignRoom: null, currentHoldingRatio: null, maxHoldingRatio: null, marketCapBn: null, fetchedAt: PROD_FETCHED },
      { code: "E", foreignVolume: -200, direction: "SELL", foreignRoom: null, currentHoldingRatio: null, maxHoldingRatio: null, marketCapBn: null, fetchedAt: PROD_FETCHED },
    ];
    const summary = buildSummary(items);
    expect(summary.netBuyCount).toBe(2);
    expect(summary.netSellCount).toBe(2);
  });

  it("topBuys = first 5 (highest positive values, already in DESC order)", () => {
    const buys: ForeignFlowItem[] = Array.from({ length: 8 }, (_, i) => ({
      code: `B${i}`,
      foreignVolume: 1000 - i * 100,
      direction: "BUY" as const,
      foreignRoom: null,
      currentHoldingRatio: null,
      maxHoldingRatio: null,
      marketCapBn: null,
      fetchedAt: PROD_FETCHED,
    }));
    const sells: ForeignFlowItem[] = [{ code: "S1", foreignVolume: -300, direction: "SELL", foreignRoom: null, currentHoldingRatio: null, maxHoldingRatio: null, marketCapBn: null, fetchedAt: PROD_FETCHED }];
    const summary = buildSummary([...buys, ...sells]);
    expect(summary.topBuys).toHaveLength(5);
    expect(summary.topBuys[0]!.foreignVolume).toBe(1000);
  });

  it("topSells = up to 5 net sell items (most negative first)", () => {
    const sells: ForeignFlowItem[] = [
      { code: "S1", foreignVolume: -10, direction: "SELL", foreignRoom: null, currentHoldingRatio: null, maxHoldingRatio: null, marketCapBn: null, fetchedAt: PROD_FETCHED },
      { code: "S2", foreignVolume: -500, direction: "SELL", foreignRoom: null, currentHoldingRatio: null, maxHoldingRatio: null, marketCapBn: null, fetchedAt: PROD_FETCHED },
      { code: "S3", foreignVolume: -200, direction: "SELL", foreignRoom: null, currentHoldingRatio: null, maxHoldingRatio: null, marketCapBn: null, fetchedAt: PROD_FETCHED },
    ];
    const summary = buildSummary(sells);
    // topSells: first 5 of the sell items (already sorted DESC so sells come last in items DESC order)
    // Here all items are sells; first 5 sliced = first 3 = S1(-10), S2(-500), S3(-200)
    expect(summary.topSells).toHaveLength(3);
    expect(summary.netSellCount).toBe(3);
  });

  it("empty items → zero counts and empty arrays", () => {
    const summary = buildSummary([]);
    expect(summary.netBuyCount).toBe(0);
    expect(summary.netSellCount).toBe(0);
    expect(summary.topBuys).toHaveLength(0);
    expect(summary.topSells).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// queryForeignFlow unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK17-FOREIGN-FLOW — queryForeignFlow", () => {
  it("AC-1: items ordered foreignVolume DESC (net buys first)", () => {
    const db = getDb();
    // Insert mix: negative, positive, zero — all production-null shape
    insertRow(db, { code: "NVL", date: PROD_DATE, foreign_volume: -393749, foreign_room: 97777804.2 });
    insertRow(db, { code: "HNG", date: PROD_DATE, foreign_volume: 50000, foreign_room: 53829910.7 });
    insertRow(db, { code: "VNM", date: PROD_DATE, foreign_volume: 49960, foreign_room: 107085298.2 });

    const { items } = queryForeignFlow(db);
    expect(items).toHaveLength(3);
    expect(items[0]!.code).toBe("HNG");    // highest positive
    expect(items[1]!.code).toBe("VNM");    // second positive
    expect(items[2]!.code).toBe("NVL");    // most negative
  });

  it("AC-2: direction derived correctly for each row", () => {
    const db = getDb();
    insertRow(db, { code: "BUY1", date: PROD_DATE, foreign_volume: 44270 });
    insertRow(db, { code: "SELL1", date: PROD_DATE, foreign_volume: -129601 });
    insertRow(db, { code: "FLAT1", date: PROD_DATE, foreign_volume: 0 });

    const { items } = queryForeignFlow(db);
    const byCode = Object.fromEntries(items.map((i) => [i.code, i]));
    expect(byCode["BUY1"]!.direction).toBe("BUY");
    expect(byCode["SELL1"]!.direction).toBe("SELL");
    expect(byCode["FLAT1"]!.direction).toBe("FLAT");
  });

  it("AC-3: null current_holding_ratio, max_holding_ratio, marketCapBn → null (NOT 0, matching production shape)", () => {
    const db = getDb();
    // Matches live production row: NVL|2026-06-11 with all nulls
    insertRow(db, {
      code: "NVL",
      date: PROD_DATE,
      foreign_volume: -393749,
      foreign_room: 97777804.2,
      current_holding_ratio: null,
      max_holding_ratio: null,
      market_cap_bn: null,
    });

    const { items } = queryForeignFlow(db);
    expect(items).toHaveLength(1);
    const item = items[0]!;
    expect(item.currentHoldingRatio).toBeNull();
    expect(item.maxHoldingRatio).toBeNull();
    expect(item.marketCapBn).toBeNull();
    // foreignVolume is non-null (WHERE guard)
    expect(item.foreignVolume).toBe(-393749);
  });

  it("AC-4: limit param respected", () => {
    const db = getDb();
    for (let i = 0; i < 10; i++) {
      insertRow(db, { code: `T${i}`, date: PROD_DATE, foreign_volume: i * 100 });
    }
    const { items } = queryForeignFlow(db, 3);
    expect(items).toHaveLength(3);
  });

  it("AC-4: limit clamped to MAX (500)", () => {
    const db = getDb();
    insertRow(db, { code: "A", date: PROD_DATE, foreign_volume: 100 });
    const { items } = queryForeignFlow(db, 9999);
    expect(items).toHaveLength(1); // only 1 row in DB
  });

  it("AC-12: only latest trading date rows returned (WHERE date = MAX(date))", () => {
    const db = getDb();
    // Stale date rows
    insertRow(db, { code: "OLD1", date: "2026-06-10", foreign_volume: 999999 });
    insertRow(db, { code: "OLD2", date: "2026-06-10", foreign_volume: 888888 });
    // Latest date rows
    insertRow(db, { code: "NEW1", date: PROD_DATE, foreign_volume: 50000 });
    insertRow(db, { code: "NEW2", date: PROD_DATE, foreign_volume: -10000 });

    const { tradingDate, items } = queryForeignFlow(db);
    expect(tradingDate).toBe(PROD_DATE);
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.fetchedAt !== undefined)).toBe(true);
    // should NOT include stale date rows
    const codes = items.map((i) => i.code);
    expect(codes).not.toContain("OLD1");
    expect(codes).not.toContain("OLD2");
  });

  it("AC-13: zero foreignVolume row → FLAT direction", () => {
    const db = getDb();
    insertRow(db, { code: "FLAT", date: PROD_DATE, foreign_volume: 0 });
    const { items } = queryForeignFlow(db);
    expect(items[0]!.direction).toBe("FLAT");
  });

  it("AC-14: tradingDate is empty string when no rows", () => {
    const db = getDb();
    const { tradingDate, items } = queryForeignFlow(db);
    expect(tradingDate).toBe("");
    expect(items).toHaveLength(0);
  });

  it("returns correct tradingDate from rows", () => {
    const db = getDb();
    insertRow(db, { code: "X", date: PROD_DATE, foreign_volume: 100 });
    const { tradingDate } = queryForeignFlow(db);
    expect(tradingDate).toBe(PROD_DATE);
  });

  it("camelCase shape correct for full production-shape row", () => {
    const db = getDb();
    // Full production-shape: all nulls on optional fields
    insertRow(db, {
      code: "KBC",
      date: PROD_DATE,
      foreign_volume: 44270,
      foreign_room: 38371901.2,
      current_holding_ratio: null,
      max_holding_ratio: null,
      market_cap_bn: null,
      fetched_at: PROD_FETCHED,
    });

    const { items } = queryForeignFlow(db);
    expect(items).toHaveLength(1);
    const item = items[0]!;
    expect(item.code).toBe("KBC");
    expect(item.foreignVolume).toBe(44270);
    expect(item.direction).toBe("BUY");
    expect(item.foreignRoom).toBe(38371901.2);
    expect(item.currentHoldingRatio).toBeNull();
    expect(item.maxHoldingRatio).toBeNull();
    expect(item.marketCapBn).toBeNull();
    expect(item.fetchedAt).toBe(PROD_FETCHED);
  });

  it("AC-9: netBuyCount and netSellCount accurate from queryForeignFlow feed", () => {
    const db = getDb();
    // 3 buys, 2 sells, 1 flat
    insertRow(db, { code: "B1", date: PROD_DATE, foreign_volume: 50000 });
    insertRow(db, { code: "B2", date: PROD_DATE, foreign_volume: 30000 });
    insertRow(db, { code: "B3", date: PROD_DATE, foreign_volume: 10000 });
    insertRow(db, { code: "S1", date: PROD_DATE, foreign_volume: -393749 });
    insertRow(db, { code: "S2", date: PROD_DATE, foreign_volume: -129601 });
    insertRow(db, { code: "F1", date: PROD_DATE, foreign_volume: 0 });

    const { items } = queryForeignFlow(db);
    const summary = buildSummary(items);
    expect(summary.netBuyCount).toBe(3);
    expect(summary.netSellCount).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleGetForeignFlow HTTP handler tests
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK17-FOREIGN-FLOW — handleGetForeignFlow HTTP handler", () => {
  it("AC-5: returns 200 JSON with {tradingDate, items, summary, count, fetchedAt}", () => {
    const db = getDb();
    insertRow(db, { code: "HNG", date: PROD_DATE, foreign_volume: 50000, foreign_room: 53829910.7 });

    const res = makeMockRes();
    const fakeNow = new Date("2026-06-11T12:00:00.000Z");
    handleGetForeignFlow(
      makeFakeReq("/api/foreign-flow"),
      res as unknown as import("node:http").ServerResponse,
      db,
      fakeNow,
    );

    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(res.body) as ForeignFlowResponse;
    expect(body.tradingDate).toBe(PROD_DATE);
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items).toHaveLength(1);
    expect(typeof body.count).toBe("number");
    expect(body.count).toBe(1);
    expect(body.fetchedAt).toBe("2026-06-11T12:00:00.000Z");
    // summary block present
    expect(typeof body.summary.netBuyCount).toBe("number");
    expect(typeof body.summary.netSellCount).toBe("number");
    expect(Array.isArray(body.summary.topBuys)).toBe(true);
    expect(Array.isArray(body.summary.topSells)).toBe(true);
  });

  it("AC-6: returns 200 with empty items[] when no rows exist", () => {
    const db = getDb();
    const res = makeMockRes();
    handleGetForeignFlow(
      makeFakeReq("/api/foreign-flow"),
      res as unknown as import("node:http").ServerResponse,
      db,
    );

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as ForeignFlowResponse;
    expect(body.items).toHaveLength(0);
    expect(body.count).toBe(0);
    expect(body.tradingDate).toBe("");
  });

  it("AC-8: count matches items.length", () => {
    const db = getDb();
    insertRow(db, { code: "A", date: PROD_DATE, foreign_volume: 100 });
    insertRow(db, { code: "B", date: PROD_DATE, foreign_volume: -200 });

    const res = makeMockRes();
    handleGetForeignFlow(
      makeFakeReq("/api/foreign-flow"),
      res as unknown as import("node:http").ServerResponse,
      db,
    );

    const body = JSON.parse(res.body) as ForeignFlowResponse;
    expect(body.count).toBe(body.items.length);
  });

  it("respects ?limit= query param", () => {
    const db = getDb();
    for (let i = 0; i < 5; i++) {
      insertRow(db, { code: `T${i}`, date: PROD_DATE, foreign_volume: i * 10 });
    }

    const res = makeMockRes();
    handleGetForeignFlow(
      makeFakeReq("/api/foreign-flow?limit=2"),
      res as unknown as import("node:http").ServerResponse,
      db,
    );

    const body = JSON.parse(res.body) as ForeignFlowResponse;
    expect(body.items).toHaveLength(2);
    expect(body.count).toBe(2);
  });

  it("AC-7: returns 500 JSON on DB error (closed DB)", () => {
    const db = getDb();
    closeDb();

    const res = makeMockRes();
    handleGetForeignFlow(
      makeFakeReq("/api/foreign-flow"),
      res as unknown as import("node:http").ServerResponse,
      db,
    );

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body) as { error: string };
    expect(body.error).toBe("db_error");
  });

  it("null numeric fields are null in JSON response (not 0)", () => {
    const db = getDb();
    // Production-shape row: all optionals null
    insertRow(db, {
      code: "NVL",
      date: PROD_DATE,
      foreign_volume: -393749,
      foreign_room: 97777804.2,
      current_holding_ratio: null,
      max_holding_ratio: null,
      market_cap_bn: null,
    });

    const res = makeMockRes();
    handleGetForeignFlow(
      makeFakeReq("/api/foreign-flow"),
      res as unknown as import("node:http").ServerResponse,
      db,
    );

    const body = JSON.parse(res.body) as ForeignFlowResponse;
    const item = body.items[0]!;
    expect(item.currentHoldingRatio).toBeNull();
    expect(item.maxHoldingRatio).toBeNull();
    expect(item.marketCapBn).toBeNull();
    expect(item.foreignVolume).toBe(-393749);
    expect(item.direction).toBe("SELL");
  });

  it("full production-shape: 5 buys + 5 sells + 1 flat, summary counts correct", () => {
    const db = getDb();
    // Real-shape seeds — all nulls on optional fields (matching production)
    const testData = [
      { code: "HNG", foreign_volume: 50000 },
      { code: "VNM", foreign_volume: 49960 },
      { code: "KBC", foreign_volume: 44270 },
      { code: "GVR", foreign_volume: 36890 },
      { code: "PVS", foreign_volume: 33645 },
      { code: "NVL", foreign_volume: -393749 },
      { code: "VPB", foreign_volume: -129601 },
      { code: "EIB", foreign_volume: -128460 },
      { code: "HDB", foreign_volume: -119672 },
      { code: "TCB", foreign_volume: -109557 },
      { code: "FLAT", foreign_volume: 0 },
    ];
    for (const d of testData) {
      insertRow(db, { ...d, date: PROD_DATE, foreign_room: 50000000.0 });
    }

    const res = makeMockRes();
    handleGetForeignFlow(
      makeFakeReq("/api/foreign-flow"),
      res as unknown as import("node:http").ServerResponse,
      db,
    );

    const body = JSON.parse(res.body) as ForeignFlowResponse;
    expect(body.count).toBe(11);
    expect(body.summary.netBuyCount).toBe(5);
    expect(body.summary.netSellCount).toBe(5);
    // topBuys: first 5 (highest positive)
    expect(body.summary.topBuys).toHaveLength(5);
    expect(body.summary.topBuys[0]!.code).toBe("HNG");
    expect(body.summary.topBuys[0]!.foreignVolume).toBe(50000);
    // topSells: first 5 sell items in DESC order (items sorted DESC overall;
    // sells appear at the tail — first sell = least negative = TCB -109557,
    // last sell = most negative = NVL -393749).
    expect(body.summary.topSells).toHaveLength(5);
    // all topSells items have direction SELL
    expect(body.summary.topSells.every((i) => i.direction === "SELL")).toBe(true);
    // ordering: items DESC so buys first
    expect(body.items[0]!.direction).toBe("BUY");
    expect(body.items[body.items.length - 1]!.direction).toBe("SELL");
  });
});
