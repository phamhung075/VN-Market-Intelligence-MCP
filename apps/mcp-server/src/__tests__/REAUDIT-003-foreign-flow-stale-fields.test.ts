/**
 * REAUDIT-003 — NFR-C-5 foreign-flow stale_fields
 *
 * Acceptance criteria:
 *   AC-1: stale_fields is a string[] at root level of ForeignFlowResponse
 *   AC-2: empty items → stale_fields === []
 *   AC-3: all items null for a field → field name in stale_fields
 *   AC-4: exactly 50% null → field NOT in stale_fields (threshold is >50%, not >=50%)
 *   AC-5: 51%+ null → field added to stale_fields
 *   AC-6: mixed scenario — some fields hit threshold, others do not
 *   AC-7: handleGetForeignFlow HTTP response includes stale_fields array
 *   AC-8: non-null values in majority → field NOT in stale_fields
 *
 * DDD Layer: interface — imports only from foreignFlowHandler (interface layer).
 */

// Must be set before importing schema module
Bun.env["DB_PATH"] = ":memory:";
if (Bun.env["DB_PATH"] !== ":memory:") {
  throw new Error(`[REAUDIT-003] DB_PATH must be ':memory:', got: ${Bun.env["DB_PATH"]}`);
}

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import {
  computeStaleFields,
  handleGetForeignFlow,
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

const PROD_DATE = "2026-06-11";
const PROD_FETCHED = "2026-06-11 08:59:55";

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
    params.fetched_at ?? PROD_FETCHED,
  );
}

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

/** Helper: build a ForeignFlowItem with controllable null fields */
function makeItem(
  code: string,
  opts: {
    currentHoldingRatio?: number | null;
    maxHoldingRatio?: number | null;
    marketCapBn?: number | null;
  } = {},
): ForeignFlowItem {
  return {
    code,
    foreignVolume: 1000,
    direction: "BUY",
    foreignRoom: null,
    currentHoldingRatio: opts.currentHoldingRatio ?? null,
    maxHoldingRatio: opts.maxHoldingRatio ?? null,
    marketCapBn: opts.marketCapBn ?? null,
    fetchedAt: PROD_FETCHED,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// computeStaleFields unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("REAUDIT-003 — computeStaleFields", () => {
  // AC-2: empty items → []
  it("AC-2: empty items array → stale_fields = []", () => {
    expect(computeStaleFields([])).toEqual([]);
  });

  // AC-3: all null for all 3 fields → all 3 in array
  it("AC-3: all items have null for all 3 fields → all 3 field names in stale_fields", () => {
    const items = [
      makeItem("A", { currentHoldingRatio: null, maxHoldingRatio: null, marketCapBn: null }),
      makeItem("B", { currentHoldingRatio: null, maxHoldingRatio: null, marketCapBn: null }),
      makeItem("C", { currentHoldingRatio: null, maxHoldingRatio: null, marketCapBn: null }),
    ];
    const result = computeStaleFields(items);
    expect(result).toContain("currentHoldingRatio");
    expect(result).toContain("maxHoldingRatio");
    expect(result).toContain("marketCapBn");
    expect(result).toHaveLength(3);
  });

  // AC-4: exactly 50% null → NOT in stale_fields (threshold is >50%)
  it("AC-4: exactly 50% null → field NOT in stale_fields (strict >50% threshold)", () => {
    // 2 items: 1 null, 1 non-null → 50% null — threshold NOT crossed
    const items = [
      makeItem("A", { currentHoldingRatio: null }),
      makeItem("B", { currentHoldingRatio: 0.25 }),
    ];
    const result = computeStaleFields(items);
    expect(result).not.toContain("currentHoldingRatio");
  });

  // AC-5: 51% null (strict >50%) → field IS in stale_fields
  it("AC-5: >50% null → field added to stale_fields", () => {
    // 3 items: 2 null = 66.7% → threshold crossed
    const items = [
      makeItem("A", { currentHoldingRatio: null }),
      makeItem("B", { currentHoldingRatio: null }),
      makeItem("C", { currentHoldingRatio: 0.30 }),
    ];
    const result = computeStaleFields(items);
    expect(result).toContain("currentHoldingRatio");
  });

  // AC-6: mixed scenario — some fields hit threshold, others don't
  it("AC-6: mixed — currentHoldingRatio stale, marketCapBn not stale", () => {
    // 4 items: currentHoldingRatio all null (100%) → stale
    //          marketCapBn all non-null (0%) → not stale
    //          maxHoldingRatio 2/4 null (50%) → NOT stale (not >50%)
    const items = [
      makeItem("A", { currentHoldingRatio: null, maxHoldingRatio: null,    marketCapBn: 10.0 }),
      makeItem("B", { currentHoldingRatio: null, maxHoldingRatio: null,    marketCapBn: 20.0 }),
      makeItem("C", { currentHoldingRatio: null, maxHoldingRatio: 0.45,    marketCapBn: 30.0 }),
      makeItem("D", { currentHoldingRatio: null, maxHoldingRatio: 0.50,    marketCapBn: 40.0 }),
    ];
    const result = computeStaleFields(items);
    expect(result).toContain("currentHoldingRatio");      // 4/4 = 100% → stale
    expect(result).not.toContain("maxHoldingRatio");      // 2/4 = 50% → NOT stale
    expect(result).not.toContain("marketCapBn");          // 0/4 = 0% → not stale
  });

  // AC-8: majority non-null → field not in stale_fields
  it("AC-8: majority non-null → field not in stale_fields", () => {
    // 5 items: 2 null = 40% → NOT stale
    const items = [
      makeItem("A", { maxHoldingRatio: null }),
      makeItem("B", { maxHoldingRatio: null }),
      makeItem("C", { maxHoldingRatio: 0.49 }),
      makeItem("D", { maxHoldingRatio: 0.48 }),
      makeItem("E", { maxHoldingRatio: 0.47 }),
    ];
    const result = computeStaleFields(items);
    expect(result).not.toContain("maxHoldingRatio");
  });

  // Single item, all null → all 3 stale (100% > 50%)
  it("single item all null → all 3 fields stale", () => {
    const items = [makeItem("X")];
    const result = computeStaleFields(items);
    expect(result).toContain("currentHoldingRatio");
    expect(result).toContain("maxHoldingRatio");
    expect(result).toContain("marketCapBn");
  });

  // Single item, all non-null → none stale
  it("single item all non-null → stale_fields empty", () => {
    const items = [makeItem("X", { currentHoldingRatio: 0.1, maxHoldingRatio: 0.49, marketCapBn: 5.0 })];
    const result = computeStaleFields(items);
    expect(result).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleGetForeignFlow — stale_fields in HTTP response
// ─────────────────────────────────────────────────────────────────────────────

describe("REAUDIT-003 — handleGetForeignFlow stale_fields in response", () => {
  // AC-1: stale_fields exists as array in response root
  it("AC-1: response contains stale_fields as string[]", () => {
    const db = getDb();
    insertRow(db, { code: "A", date: PROD_DATE, foreign_volume: 100 });

    const res = makeMockRes();
    handleGetForeignFlow(
      makeFakeReq("/api/foreign-flow"),
      res as unknown as import("node:http").ServerResponse,
      db,
    );

    const body = JSON.parse(res.body) as ForeignFlowResponse;
    expect(Array.isArray(body.stale_fields)).toBe(true);
  });

  // AC-7: production shape (all nulls) → stale_fields populated
  it("AC-7: production shape (all 3 fields null on all rows) → all 3 in stale_fields", () => {
    const db = getDb();
    // Seed 3 production-shape rows: all optionals null
    for (const code of ["NVL", "HNG", "VNM"]) {
      insertRow(db, {
        code,
        date: PROD_DATE,
        foreign_volume: 10000,
        current_holding_ratio: null,
        max_holding_ratio: null,
        market_cap_bn: null,
      });
    }

    const res = makeMockRes();
    handleGetForeignFlow(
      makeFakeReq("/api/foreign-flow"),
      res as unknown as import("node:http").ServerResponse,
      db,
    );

    const body = JSON.parse(res.body) as ForeignFlowResponse;
    expect(body.stale_fields).toContain("currentHoldingRatio");
    expect(body.stale_fields).toContain("maxHoldingRatio");
    expect(body.stale_fields).toContain("marketCapBn");
  });

  // Empty rows → stale_fields = []
  it("empty items → stale_fields = []", () => {
    const db = getDb();
    const res = makeMockRes();
    handleGetForeignFlow(
      makeFakeReq("/api/foreign-flow"),
      res as unknown as import("node:http").ServerResponse,
      db,
    );

    const body = JSON.parse(res.body) as ForeignFlowResponse;
    expect(body.stale_fields).toEqual([]);
  });

  // Non-null values → fields NOT in stale_fields
  it("rows with non-null values → field NOT in stale_fields", () => {
    const db = getDb();
    insertRow(db, {
      code: "FPT",
      date: PROD_DATE,
      foreign_volume: 1200,
      current_holding_ratio: 0.23,
      max_holding_ratio: 0.49,
      market_cap_bn: 85.5,
    });

    const res = makeMockRes();
    handleGetForeignFlow(
      makeFakeReq("/api/foreign-flow"),
      res as unknown as import("node:http").ServerResponse,
      db,
    );

    const body = JSON.parse(res.body) as ForeignFlowResponse;
    expect(body.stale_fields).not.toContain("currentHoldingRatio");
    expect(body.stale_fields).not.toContain("maxHoldingRatio");
    expect(body.stale_fields).not.toContain("marketCapBn");
  });

  // Existing fields unchanged — items still contain null values (no filtering)
  it("items still contain null values even when field is stale (no filtering)", () => {
    const db = getDb();
    insertRow(db, {
      code: "NVL",
      date: PROD_DATE,
      foreign_volume: -393749,
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
    // stale_fields signals unavailability but items still carry nulls
    expect(body.stale_fields).toContain("currentHoldingRatio");
    const item = body.items[0]!;
    expect(item.currentHoldingRatio).toBeNull();
    expect(item.maxHoldingRatio).toBeNull();
    expect(item.marketCapBn).toBeNull();
  });
});
