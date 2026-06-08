Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1355b — davPharmacyJob gap-fill tests (DAV-1 through DAV-8)
 *
 *   DAV-1: Normal path — fetchDavPharmacy returns N approvals, stored count = N
 *   DAV-2: Partial failure — one insertPharmaEvent throws, stored = N-1, job completes
 *   DAV-3: All inserts fail — stored = 0, job completes (no re-throw)
 *   DAV-4: fetchDavPharmacy rejects — outer catch logs error, no re-throw
 *   DAV-5: Empty approvals array — stored = 0, logger.info called with fetched:0
 *   DAV-6: relatedStocks empty → stock_code null passed to insertPharmaEvent
 *   DAV-7: logger.info called with correct durationMs field (>= 0)
 *   DAV-8: initDatabase called before fetchDavPharmacy (sequencing assertion)
 *
 * Mock strategy: mock.module() at file top level with mutable factory variables.
 * Dynamic import of the job inside each test picks up the current mock state.
 *
 * Layer: tests — no real HTTP, no real DB writes, in-memory isolation.
 */

import { describe, it, expect, mock, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import type { DrugApproval } from "../infrastructure/fetchers/davPharmacy.js";
import type { PharmaEventRow } from "../infrastructure/db/pharmaStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Real-module captures — imported BEFORE any mock.module() call so they hold
// the genuine implementations. Used in teardown to repair the module registry
// for worker-sibling test files.
// ─────────────────────────────────────────────────────────────────────────────
import { fetchDavPharmacy as _realFetchDavPharmacy } from "../infrastructure/fetchers/davPharmacy.js";
import { getDb as _realGetDb, initDatabase as _realInitDatabase } from "../infrastructure/db/schema.js";
import { insertPharmaEvent as _realInsertPharmaEvent } from "../infrastructure/db/pharmaStore.js";
import { logger as _realLogger } from "../infrastructure/logger.js";

// Freeze before any mock.module() can mutate the live bindings
const _frozenFetch = _realFetchDavPharmacy;
const _frozenGetDb = _realGetDb;
const _frozenInitDatabase = _realInitDatabase;
const _frozenInsertPharmaEvent = _realInsertPharmaEvent;

// ─────────────────────────────────────────────────────────────────────────────
// Top-level mutable mock factories
//
// mock.module() is worker-scoped and permanent. All mocked modules are
// registered once here with mutable factory variables. Per-test behaviour
// is controlled by updating these variables, not by re-calling mock.module().
// ─────────────────────────────────────────────────────────────────────────────

let _fetchDavPharmacyImpl: () => Promise<DrugApproval[]> = async () => [];
let _initDatabaseImpl: () => Promise<void> = async () => {};
let _getDbImpl: () => Database = () => { throw new Error("getDb not configured"); };
let _insertPharmaEventImpl: (db: Database, row: PharmaEventRow) => void = () => {};

// Logger capture variables — mutated per test via object property assignment
let _loggerInfoCalls: Array<[string, unknown]> = [];
let _loggerErrorCalls: Array<[string, unknown]> = [];
let _loggerWarnCalls: Array<[string, unknown]> = [];

mock.module("../infrastructure/fetchers/davPharmacy.js", () => ({
  fetchDavPharmacy: async () => _fetchDavPharmacyImpl(),
}));

mock.module("../infrastructure/db/schema.js", () => ({
  initDatabase: async () => _initDatabaseImpl(),
  getDb: () => _getDbImpl(),
}));

mock.module("../infrastructure/db/pharmaStore.js", () => ({
  insertPharmaEvent: (db: Database, row: PharmaEventRow) => _insertPharmaEventImpl(db, row),
}));

mock.module("../infrastructure/logger.js", () => ({
  logger: {
    info: (msg: string, meta?: unknown) => { _loggerInfoCalls.push([msg, meta]); },
    error: (msg: string, meta?: unknown) => { _loggerErrorCalls.push([msg, meta]); },
    warn: (msg: string, meta?: unknown) => { _loggerWarnCalls.push([msg, meta]); },
    debug: (_msg: string, _meta?: unknown) => {},
  },
}));

// ─────────────────────────────────────────────────────────────────────────────
// Fixture helper
// ─────────────────────────────────────────────────────────────────────────────

function makeApproval(overrides: Partial<DrugApproval> = {}): DrugApproval {
  return {
    drugName: "TestDrug",
    manufacturer: "Dược Hậu Giang",
    registrationNumber: "SD-0001/26",
    approvalDate: "2026-01-15",
    category: "generic",
    relatedStocks: ["DHG"],
    ...overrides,
  };
}

/** Minimal in-memory DB with pharma_events DDL. */
function makeDb(): Database {
  const db = new Database(":memory:");
  db.run(`
    CREATE TABLE IF NOT EXISTS pharma_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      drug_name TEXT,
      manufacturer TEXT,
      stock_code TEXT,
      approval_date TEXT,
      description TEXT NOT NULL,
      severity TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1355b — davPharmacyJob gap tests", () => {

  it("DAV-1: normal path — fetchDavPharmacy returns 2 approvals, insertPharmaEvent called twice", async () => {
    const approvals = [
      makeApproval(),
      makeApproval({ drugName: "Drug2", registrationNumber: "SD-0002/26" }),
    ];

    let insertCallCount = 0;
    _fetchDavPharmacyImpl = async () => approvals;
    _initDatabaseImpl = async () => {};
    _getDbImpl = () => makeDb();
    _insertPharmaEventImpl = (_db, _row) => { insertCallCount++; };
    _loggerInfoCalls = [];
    _loggerErrorCalls = [];
    _loggerWarnCalls = [];

    const { runDavPharmacyCheck } = await import("../scheduler/davPharmacyJob.js");
    await expect(runDavPharmacyCheck()).resolves.toBeUndefined();

    expect(insertCallCount).toBe(2);
    expect(_loggerErrorCalls.length).toBe(0);
  });

  it("DAV-2: partial failure — first insert throws, second succeeds, job completes", async () => {
    const approvals = [makeApproval(), makeApproval({ drugName: "Drug2", registrationNumber: "SD-0002/26" })];

    let insertCallCount = 0;
    _fetchDavPharmacyImpl = async () => approvals;
    _initDatabaseImpl = async () => {};
    _getDbImpl = () => makeDb();
    _insertPharmaEventImpl = (_db, _row) => {
      insertCallCount++;
      if (insertCallCount === 1) throw new Error("DB write failed");
    };
    _loggerInfoCalls = [];
    _loggerErrorCalls = [];
    _loggerWarnCalls = [];

    const { runDavPharmacyCheck } = await import("../scheduler/davPharmacyJob.js");
    await expect(runDavPharmacyCheck()).resolves.toBeUndefined();

    // Job must NOT throw — outer function resolves
    expect(insertCallCount).toBe(2);
    // logger.warn called once for the failed item
    expect(_loggerWarnCalls.length).toBe(1);
    // Outer catch NOT triggered — only the inner per-item catch
    expect(_loggerErrorCalls.length).toBe(0);
  });

  it("DAV-3: all inserts fail — stored = 0, job completes without re-throw", async () => {
    const approvals = [makeApproval(), makeApproval({ drugName: "Drug2", registrationNumber: "SD-0002/26" })];

    let insertCallCount = 0;
    _fetchDavPharmacyImpl = async () => approvals;
    _initDatabaseImpl = async () => {};
    _getDbImpl = () => makeDb();
    _insertPharmaEventImpl = (_db, _row) => {
      insertCallCount++;
      throw new Error("DB unavailable");
    };
    _loggerInfoCalls = [];
    _loggerErrorCalls = [];
    _loggerWarnCalls = [];

    const { runDavPharmacyCheck } = await import("../scheduler/davPharmacyJob.js");
    await expect(runDavPharmacyCheck()).resolves.toBeUndefined();

    // Both insert attempts were made (and both absorbed)
    expect(insertCallCount).toBe(2);
    // Two warn calls (one per failed item)
    expect(_loggerWarnCalls.length).toBe(2);
    // Outer error catch NOT triggered
    expect(_loggerErrorCalls.length).toBe(0);
  });

  it("DAV-4: fetchDavPharmacy rejects — outer catch logs error, no re-throw", async () => {
    _fetchDavPharmacyImpl = async () => { throw new Error("Network timeout"); };
    _initDatabaseImpl = async () => {};
    _getDbImpl = () => makeDb();
    _insertPharmaEventImpl = () => {};
    _loggerInfoCalls = [];
    _loggerErrorCalls = [];
    _loggerWarnCalls = [];

    const { runDavPharmacyCheck } = await import("../scheduler/davPharmacyJob.js");
    await expect(runDavPharmacyCheck()).resolves.toBeUndefined();

    // Outer catch must log via logger.error
    expect(_loggerErrorCalls.length).toBeGreaterThanOrEqual(1);
    const [errorMsg, errorMeta] = _loggerErrorCalls[0]!;
    // Message should indicate job failure
    expect(errorMsg).toContain("job failed");
    // Meta should contain the error text
    expect(JSON.stringify(errorMeta)).toContain("Network timeout");
  });

  it("DAV-5: empty approvals array — insertPharmaEvent never called, logger.info has fetched:0 stored:0", async () => {
    let insertCallCount = 0;
    _fetchDavPharmacyImpl = async () => [];
    _initDatabaseImpl = async () => {};
    _getDbImpl = () => makeDb();
    _insertPharmaEventImpl = (_db, _row) => { insertCallCount++; };
    _loggerInfoCalls = [];
    _loggerErrorCalls = [];
    _loggerWarnCalls = [];

    const { runDavPharmacyCheck } = await import("../scheduler/davPharmacyJob.js");
    await expect(runDavPharmacyCheck()).resolves.toBeUndefined();

    expect(insertCallCount).toBe(0);

    // Find the completion log call (the one with fetched/stored fields)
    const completionCall = _loggerInfoCalls.find(([, meta]) =>
      meta !== undefined && typeof meta === "object" && "fetched" in (meta as object),
    );
    expect(completionCall).toBeDefined();
    const meta = completionCall![1] as { fetched: number; stored: number };
    expect(meta.fetched).toBe(0);
    expect(meta.stored).toBe(0);
  });

  it("DAV-6: relatedStocks empty → stock_code null passed to insertPharmaEvent", async () => {
    const capturedRows: PharmaEventRow[] = [];
    _fetchDavPharmacyImpl = async () => [makeApproval({ relatedStocks: [] })];
    _initDatabaseImpl = async () => {};
    _getDbImpl = () => makeDb();
    _insertPharmaEventImpl = (_db, row) => { capturedRows.push(row); };
    _loggerInfoCalls = [];
    _loggerErrorCalls = [];
    _loggerWarnCalls = [];

    const { runDavPharmacyCheck } = await import("../scheduler/davPharmacyJob.js");
    await expect(runDavPharmacyCheck()).resolves.toBeUndefined();

    expect(capturedRows.length).toBe(1);
    // relatedStocks[0] is undefined → undefined ?? null → null
    expect(capturedRows[0]!.stock_code).toBeNull();
  });

  it("DAV-7: logger.info completion log contains durationMs >= 0", async () => {
    _fetchDavPharmacyImpl = async () => [];
    _initDatabaseImpl = async () => {};
    _getDbImpl = () => makeDb();
    _insertPharmaEventImpl = () => {};
    _loggerInfoCalls = [];
    _loggerErrorCalls = [];
    _loggerWarnCalls = [];

    const { runDavPharmacyCheck } = await import("../scheduler/davPharmacyJob.js");
    await expect(runDavPharmacyCheck()).resolves.toBeUndefined();

    // Find the completion log call (has durationMs field)
    const completionCall = _loggerInfoCalls.find(([, meta]) =>
      meta !== undefined && typeof meta === "object" && "durationMs" in (meta as object),
    );
    expect(completionCall).toBeDefined();
    const meta = completionCall![1] as { durationMs: number };
    expect(typeof meta.durationMs).toBe("number");
    expect(meta.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("DAV-8: initDatabase called before fetchDavPharmacy (sequencing assertion)", async () => {
    const callOrder: string[] = [];
    _initDatabaseImpl = async () => { callOrder.push("initDatabase"); };
    _fetchDavPharmacyImpl = async () => { callOrder.push("fetchDavPharmacy"); return []; };
    _getDbImpl = () => makeDb();
    _insertPharmaEventImpl = () => {};
    _loggerInfoCalls = [];
    _loggerErrorCalls = [];
    _loggerWarnCalls = [];

    const { runDavPharmacyCheck } = await import("../scheduler/davPharmacyJob.js");
    await expect(runDavPharmacyCheck()).resolves.toBeUndefined();

    expect(callOrder[0]).toBe("initDatabase");
    expect(callOrder[1]).toBe("fetchDavPharmacy");
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// Teardown — restore mocked modules to real implementations
//
// mock.module() in Bun 1.x is worker-scoped and permanent. Re-register the
// real implementations captured at file top-level so worker-siblings see
// genuine modules rather than our test stubs.
// ─────────────────────────────────────────────────────────────────────────────
afterAll(() => {
  mock.module("../infrastructure/fetchers/davPharmacy.js", () => ({
    fetchDavPharmacy: _frozenFetch,
  }));
  mock.module("../infrastructure/db/schema.js", () => ({
    initDatabase: _frozenInitDatabase,
    getDb: _frozenGetDb,
  }));
  mock.module("../infrastructure/db/pharmaStore.js", () => ({
    insertPharmaEvent: _frozenInsertPharmaEvent,
  }));
  mock.module("../infrastructure/logger.js", () => ({
    logger: _realLogger,
  }));
});
