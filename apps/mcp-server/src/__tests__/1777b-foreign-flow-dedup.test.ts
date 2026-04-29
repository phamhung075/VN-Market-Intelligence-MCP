/**
 * Task 1777b — Foreign Flow Dedup + CB Self-Healing
 *
 * Bug 1: UNIQUE constraint fail on push-foreign-flow when VPS re-pushes
 *   same (code, date) data after CB reset. Root cause: the constraint
 *   validation guard in upsertForeignFlow can throw "UNIQUE constraint
 *   missing" on a DB that lacks the uq_vnstats_code_date explicit index
 *   even though the table has an inline UNIQUE(code, date) constraint.
 *
 * Bug 2: CB not self-healing — verify the OPEN→HALF_OPEN→CLOSED path
 *   still works after the 1413b fix (no regression from the early-return
 *   guard removal). The CB must self-heal within one VPS retry cycle once
 *   the DB is healthy.
 *
 * Tests:
 *   1777b-1: Duplicate push (same code + same date, two separate requests)
 *            succeeds — ON CONFLICT handles idempotently, no UNIQUE error
 *   1777b-2: 100 consecutive pushes of same payload never fail
 *   1777b-3: After CB reset, duplicate push succeeds (CB stays CLOSED)
 *   1777b-4: CB OPEN → timeout elapsed → HALF_OPEN probe → success → CLOSED
 *            (regression guard for 1413b — execute() self-heals the CB)
 *   1777b-5: CB OPEN → reset via tool → duplicate push succeeds (CB stays CLOSED)
 *   1777b-6: Multiple tickers, some duplicated — all succeed, row count correct
 *   1777b-7: upsertForeignFlow with autoindex schema (UNIQUE in CREATE TABLE,
 *            no explicit uq_vnstats_code_date index) does NOT throw constraint
 *            missing error on duplicate push
 */

Bun.env["DB_PATH"] = ":memory:";
Bun.env["VPS_PUSH_API_KEY"] = "test-key-1777b";

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from "bun:test";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Database } from "bun:sqlite";
import { handlePushForeignFlow } from "../interface/mcp/routes/pushForeignFlowHandler.js";
import { upsertForeignFlow } from "../infrastructure/db/vnstockStore.js";
import { breakers } from "../infrastructure/circuitBreakerRegistry.js";
import { CircuitBreaker, CircuitOpenError } from "../infrastructure/circuitBreaker.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import { reset_foreign_flow_circuit_breaker } from "../interface/mcp/tools/market-data/foreignFlowTools.js";
import type { ForeignFlowUpsertItem } from "../domain/models/shared-types.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeReq(body: string, apiKey = "test-key-1777b"): IncomingMessage {
  const chunks: string[] = body ? [body] : [];
  let idx = 0;
  return {
    headers: { "x-api-key": apiKey },
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<{ value: string; done: boolean }> {
          if (idx < chunks.length) return Promise.resolve({ value: chunks[idx++]!, done: false });
          return Promise.resolve({ value: "", done: true });
        },
      };
    },
  } as unknown as IncomingMessage;
}

interface MockRes {
  statusCode: number;
  body: string;
  headers: Record<string, string>;
  writeHead(code: number, headers?: Record<string, string>): void;
  end(data?: string): void;
}

function makeRes(): MockRes {
  const res: MockRes = {
    statusCode: 0,
    body: "",
    headers: {},
    writeHead(code, h = {}) {
      res.statusCode = code;
      Object.assign(res.headers, h);
    },
    end(data = "") {
      res.body += data;
    },
  };
  return res;
}

const silentLog = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
} as never;

/** Minimal valid push payload — single ticker, fixed date */
const singleTickerPayload = JSON.stringify([
  { code: "VNM", foreignBuyVol: 10_000, foreignSellVol: 5_000, foreignRoom: 2_000_000, date: "2026-04-29" },
]);

/** Multi-ticker payload */
const multiTickerPayload = JSON.stringify([
  { code: "VCB", foreignBuyVol: 20_000, foreignSellVol: 8_000, foreignRoom: 5_000_000, date: "2026-04-29" },
  { code: "HPG", foreignBuyVol: 15_000, foreignSellVol: 3_000, foreignRoom: 3_000_000, date: "2026-04-29" },
  { code: "TCB", foreignBuyVol: 5_000,  foreignSellVol: 2_000, foreignRoom: 1_000_000, date: "2026-04-29" },
]);

type CbInternal = {
  _state: string;
  _openedAt: Date | null;
  _failures: number;
  _consecutiveFailures: number;
  _halfOpenSuccesses: number;
};

function cbInternals(cb: CircuitBreaker): CbInternal {
  return cb as unknown as CbInternal;
}

/** Force CB into OPEN state with timeout NOT elapsed (just now) */
function forceOpenRecent(cb: CircuitBreaker): void {
  const i = cbInternals(cb);
  i._state = "open";
  i._openedAt = new Date();
  i._failures = 5;
  i._consecutiveFailures = 5;
  i._halfOpenSuccesses = 0;
}

/** Force CB into OPEN state with timeout elapsed (700s ago > 600s timeout) */
function forceOpenExpired(cb: CircuitBreaker): void {
  const i = cbInternals(cb);
  i._state = "open";
  i._openedAt = new Date(Date.now() - 700_000);
  i._failures = 5;
  i._consecutiveFailures = 5;
  i._halfOpenSuccesses = 0;
}

/**
 * Create an in-memory DB with vnstock_trading_stats using INLINE UNIQUE constraint
 * (no separate CREATE UNIQUE INDEX — only sqlite_autoindex).
 * This matches the production schema from schema-financial-reports.ts.
 */
function makeDbWithInlineUnique(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS vnstock_trading_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      date TEXT NOT NULL DEFAULT '1970-01-01',
      foreign_room INTEGER,
      foreign_volume INTEGER,
      current_holding_ratio REAL,
      max_holding_ratio REAL,
      avg_volume_2w INTEGER,
      high_52w REAL,
      low_52w REAL,
      pct_from_high_52w REAL,
      pct_from_low_52w REAL,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(code, date)
    )
  `);
  return db;
}

function rowCount(db: Database): number {
  return db.prepare<{ cnt: number }, []>(
    "SELECT COUNT(*) as cnt FROM vnstock_trading_stats"
  ).get()?.cnt ?? 0;
}

// ─── Test Setup ───────────────────────────────────────────────────────────────

beforeAll(async () => {
  await initDatabase();
});

afterAll(() => {
  closeDb();
});

afterEach(() => {
  breakers.foreignFlow.reset();
  try { getDb().exec("DELETE FROM vnstock_trading_stats"); } catch { /* ok */ }
  try { getDb().exec("DELETE FROM vps_push_log"); } catch { /* ok */ }
  try { getDb().exec("DELETE FROM daily_ohlcv"); } catch { /* ok */ }
});

// ─── 1777b-1: Duplicate push (same code + date, two separate requests) ───────

describe("1777b-1: Duplicate push — two separate requests with same (code, date)", () => {
  it("first and second push both return 200 — no UNIQUE constraint error", async () => {
    const req1 = makeReq(singleTickerPayload);
    const res1 = makeRes();
    await handlePushForeignFlow(req1, res1 as unknown as ServerResponse, getDb(), silentLog);
    expect(res1.statusCode).toBe(200);
    const body1 = JSON.parse(res1.body);
    expect(body1.ok).toBe(true);

    // Second push with identical payload (VPS re-push after reboot)
    const req2 = makeReq(singleTickerPayload);
    const res2 = makeRes();
    await handlePushForeignFlow(req2, res2 as unknown as ServerResponse, getDb(), silentLog);
    expect(res2.statusCode).toBe(200);
    const body2 = JSON.parse(res2.body);
    expect(body2.ok).toBe(true);
  });

  it("second push updates the row, not inserts a new one (table stays at 1 row)", async () => {
    const countBefore = rowCount(getDb());

    const req1 = makeReq(singleTickerPayload);
    await handlePushForeignFlow(req1, makeRes() as unknown as ServerResponse, getDb(), silentLog);

    const countAfterFirst = rowCount(getDb());
    expect(countAfterFirst).toBe(countBefore + 1);

    const req2 = makeReq(singleTickerPayload);
    await handlePushForeignFlow(req2, makeRes() as unknown as ServerResponse, getDb(), silentLog);

    const countAfterSecond = rowCount(getDb());
    expect(countAfterSecond).toBe(countAfterFirst); // Still same count — updated, not inserted
  });
});

// ─── 1777b-2: 100 consecutive pushes of same payload ─────────────────────────

describe("1777b-2: 100 consecutive pushes of same payload", () => {
  it("all 100 pushes return 200, CB stays CLOSED, row count never exceeds 1", async () => {
    for (let i = 0; i < 100; i++) {
      const req = makeReq(singleTickerPayload);
      const res = makeRes();
      await handlePushForeignFlow(req, res as unknown as ServerResponse, getDb(), silentLog);
      expect(res.statusCode).toBe(200);
    }
    expect(breakers.foreignFlow.stats.state).toBe("closed");
    expect(rowCount(getDb())).toBe(1); // One row for VNM 2026-04-29
  });
});

// ─── 1777b-3: After CB reset, duplicate push succeeds ────────────────────────

describe("1777b-3: After CB reset, duplicate push succeeds (CB stays CLOSED)", () => {
  beforeEach(() => { breakers.foreignFlow.reset(); });

  it("first push OPEN CB, reset tool closes it, second duplicate push succeeds", async () => {
    // Trip the CB with 5 forced failures
    for (let i = 0; i < 5; i++) {
      try {
        await breakers.foreignFlow.execute(() => Promise.reject(new Error("forced fail")));
      } catch { /* expected */ }
    }
    expect(breakers.foreignFlow.stats.state).toBe("open");

    // Reset via MCP tool
    await reset_foreign_flow_circuit_breaker();
    expect(breakers.foreignFlow.stats.state).toBe("closed");

    // Push same data twice — both must succeed
    const req1 = makeReq(singleTickerPayload);
    const res1 = makeRes();
    await handlePushForeignFlow(req1, res1 as unknown as ServerResponse, getDb(), silentLog);
    expect(res1.statusCode).toBe(200);

    const req2 = makeReq(singleTickerPayload);
    const res2 = makeRes();
    await handlePushForeignFlow(req2, res2 as unknown as ServerResponse, getDb(), silentLog);
    expect(res2.statusCode).toBe(200);

    // CB must still be CLOSED after both duplicate pushes
    expect(breakers.foreignFlow.stats.state).toBe("closed");
  });
});

// ─── 1777b-4: CB OPEN → timeout elapsed → HALF_OPEN → success → CLOSED ──────

describe("1777b-4: CB self-healing — OPEN→HALF_OPEN→CLOSED via execute() after timeout", () => {
  beforeEach(() => { breakers.foreignFlow.reset(); });

  it("CB transitions OPEN→HALF_OPEN→CLOSED when timeout elapsed and push succeeds", async () => {
    // Force CB open with expired timeout (700s > 600s resetTimeoutMs)
    forceOpenExpired(breakers.foreignFlow);
    expect(cbInternals(breakers.foreignFlow)._state).toBe("open");

    // Push must succeed (execute() calls _checkTimeout → HALF_OPEN, DB write succeeds → CLOSED)
    const req = makeReq(singleTickerPayload);
    const res = makeRes();
    await handlePushForeignFlow(req, res as unknown as ServerResponse, getDb(), silentLog);

    expect(res.statusCode).toBe(200);
    // halfOpenMaxAttempts=1 → single success closes the CB
    expect(breakers.foreignFlow.stats.state).toBe("closed");
  });

  it("CB stays OPEN (503) when timeout NOT yet elapsed", async () => {
    // Force CB open with recent openedAt (timeout has NOT elapsed)
    forceOpenRecent(breakers.foreignFlow);

    const req = makeReq(singleTickerPayload);
    const res = makeRes();
    await handlePushForeignFlow(req, res as unknown as ServerResponse, getDb(), silentLog);

    expect(res.statusCode).toBe(503);
    const body = JSON.parse(res.body);
    expect(body.error).toBe("Service temporarily unavailable");
    // Retry-After must be present
    expect(res.headers["Retry-After"]).toBeDefined();
    const retryAfter = Number(res.headers["Retry-After"]);
    expect(retryAfter).toBeGreaterThanOrEqual(60);
  });
});

// ─── 1777b-5: CB reset via tool + duplicate push ─────────────────────────────

describe("1777b-5: reset_foreign_flow_circuit_breaker then duplicate push succeeds", () => {
  beforeEach(() => { breakers.foreignFlow.reset(); });

  it("multiple trips and resets followed by duplicate push — always succeeds after reset", async () => {
    for (let round = 0; round < 3; round++) {
      // Trip CB
      for (let i = 0; i < 5; i++) {
        try {
          await breakers.foreignFlow.execute(() => Promise.reject(new Error("trip")));
        } catch { /* expected */ }
      }
      expect(breakers.foreignFlow.stats.state).toBe("open");

      // Reset
      await reset_foreign_flow_circuit_breaker();
      expect(breakers.foreignFlow.stats.state).toBe("closed");

      // Duplicate push must succeed
      for (let j = 0; j < 2; j++) {
        const req = makeReq(singleTickerPayload);
        const res = makeRes();
        await handlePushForeignFlow(req, res as unknown as ServerResponse, getDb(), silentLog);
        expect(res.statusCode).toBe(200);
      }
    }
  });
});

// ─── 1777b-6: Multi-ticker payload, some duplicated ──────────────────────────

describe("1777b-6: Multi-ticker payload pushed twice — correct row count, no UNIQUE error", () => {
  it("3-ticker payload pushed twice → 3 rows total (all updated, not inserted)", async () => {
    const req1 = makeReq(multiTickerPayload);
    const res1 = makeRes();
    await handlePushForeignFlow(req1, res1 as unknown as ServerResponse, getDb(), silentLog);
    expect(res1.statusCode).toBe(200);
    const body1 = JSON.parse(res1.body);
    expect(body1.ok).toBe(true);
    expect(rowCount(getDb())).toBe(3);

    const req2 = makeReq(multiTickerPayload);
    const res2 = makeRes();
    await handlePushForeignFlow(req2, res2 as unknown as ServerResponse, getDb(), silentLog);
    expect(res2.statusCode).toBe(200);
    const body2 = JSON.parse(res2.body);
    expect(body2.ok).toBe(true);
    // Still 3 rows — updated not inserted
    expect(rowCount(getDb())).toBe(3);
  });
});

// ─── 1777b-7: autoindex schema — no explicit uq_vnstats_code_date index ──────

describe("1777b-7: upsertForeignFlow with autoindex schema (inline UNIQUE, no explicit index)", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDbWithInlineUnique();
  });

  afterEach(() => {
    db.close();
  });

  it("first insert succeeds on a table with only sqlite_autoindex (no uq_vnstats_code_date)", () => {
    const item: ForeignFlowUpsertItem = {
      code: "VIC",
      date: "2026-04-29",
      foreign_volume: 10_000,
      foreign_room: 500_000,
      holding_ratio: 0.25,
      fetched_at: null,
    };
    expect(() => upsertForeignFlow([item], db)).not.toThrow();
    expect(rowCount(db)).toBe(1);
  });

  it("duplicate push on autoindex schema does NOT throw UNIQUE constraint error", () => {
    const item: ForeignFlowUpsertItem = {
      code: "MWG",
      date: "2026-04-29",
      foreign_volume: 8_000,
      foreign_room: 300_000,
      holding_ratio: 0.18,
      fetched_at: null,
    };
    // Push twice — second must not throw
    expect(() => upsertForeignFlow([item], db)).not.toThrow();
    expect(() => upsertForeignFlow([item], db)).not.toThrow();
    expect(rowCount(db)).toBe(1); // Only one row
  });

  it("constraint validation guard accepts sqlite_autoindex as a valid UNIQUE constraint", () => {
    // Verify pragma_index_list returns the autoindex
    const indexList = db.prepare<{ name: string; unique: number }, []>(
      `SELECT name, "unique" FROM pragma_index_list('vnstock_trading_stats') WHERE "unique" = 1`
    ).all();
    // sqlite_autoindex_vnstock_trading_stats_1 must be present
    expect(indexList.length).toBeGreaterThan(0);
    const autoIndex = indexList.find((idx) => idx.name.includes("autoindex") || idx.name.includes("uq_vnstats"));
    expect(autoIndex).toBeDefined();
  });

  it("50 consecutive duplicate pushes on autoindex schema — all succeed, 1 row remains", () => {
    const base: ForeignFlowUpsertItem = {
      code: "FPT",
      date: "2026-04-29",
      foreign_volume: 0,
      foreign_room: 1_000_000,
      holding_ratio: 0.10,
      fetched_at: null,
    };
    for (let i = 0; i < 50; i++) {
      const item = { ...base, foreign_volume: i * 500 };
      expect(() => upsertForeignFlow([item], db)).not.toThrow();
    }
    expect(rowCount(db)).toBe(1);
    const row = db.prepare("SELECT foreign_volume FROM vnstock_trading_stats WHERE code = 'FPT'")
      .get() as { foreign_volume: number } | null;
    expect(row?.foreign_volume).toBe(49 * 500); // Last value wins
  });
});
