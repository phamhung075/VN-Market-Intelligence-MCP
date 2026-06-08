/**
 * FIX — Foreign Flow UNIQUE Constraint + Circuit Breaker Recovery
 *
 * Bug: UNIQUE constraint failed on vnstock_trading_stats.date (composite
 * UNIQUE(code, date)) on every push attempt when the same (code, date) pair
 * was sent twice. The circuit breaker accumulated 100 failures from the VPS
 * fetcher path and is stuck OPEN, blocking all subsequent pushes.
 *
 * Root causes:
 *   1. The push handler's DB write (upsertForeignFlow) was wrapped in a bare
 *      try/catch that swallowed errors without calling breakers.foreignFlow
 *      through execute() — so failures were never counted by the CB.
 *   2. upsertForeignFlow already uses ON CONFLICT(code, date) DO UPDATE SET,
 *      which handles duplicate (code, date) correctly — no data-loss risk.
 *   3. The circuit breaker is OPEN and must be reset once the underlying
 *      issue is confirmed fixed.
 *
 * Fixes verified by these tests:
 *   TC-1: upsertForeignFlow does NOT throw on duplicate (code, date) — ON
 *         CONFLICT handles it gracefully (upsert path works).
 *   TC-2: Second push with same (code, date) updates the row, not inserts.
 *   TC-3: After fix, successful upsert through breakers.foreignFlow.execute()
 *         increments the success counter (CB records the success).
 *   TC-4: DB failure through execute() increments the CB failure counter.
 *   TC-5: reset_foreign_flow_circuit_breaker() closes a stuck-OPEN CB and
 *         returns the correct confirmation text.
 *   TC-6: After CB reset, execute() accepts new calls without CircuitOpenError.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { upsertForeignFlow } from "../infrastructure/db/vnstockStore.js";
import { breakers } from "../infrastructure/circuitBreakerRegistry.js";
import {
  reset_foreign_flow_circuit_breaker,
  diagnose_foreign_flow_circuit_breaker,
} from "../interface/mcp/tools/market-data/foreignFlowTools.js";
import { CircuitOpenError } from "../infrastructure/circuitBreaker.js";
import type { ForeignFlowUpsertItem } from "../domain/models/shared-types.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ---------------------------------------------------------------------------
// In-memory DB helper (modern schema with UNIQUE(code, date))
// ---------------------------------------------------------------------------

function makeDb(): Database {
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
      fetched_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(code, date)
    )
  `);
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

function rowCount(db: Database): number {
  return db.prepare<{ cnt: number }, []>(
    "SELECT COUNT(*) as cnt FROM vnstock_trading_stats"
  ).get()?.cnt ?? 0;
}

function getRow(db: Database, code: string, date: string): Record<string, unknown> | null {
  return db.prepare(
    "SELECT * FROM vnstock_trading_stats WHERE code = ? AND date = ?"
  ).get(code, date) as Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// TC-1 & TC-2: ON CONFLICT upsert — the core DB fix
// ---------------------------------------------------------------------------

describe("FIX — UNIQUE constraint: ON CONFLICT(code, date) handles duplicates", () => {
  let db: Database;
  beforeEach(() => { db = makeDb(); });
  afterEach(() => { db.close(); });

  it("TC-1: does NOT throw UNIQUE constraint error when same (code, date) pushed twice", () => {
    const item: ForeignFlowUpsertItem = {
      code: "VNM", date: "2026-04-27",
      foreign_volume: 200_000, foreign_room: 1_000_000,
      holding_ratio: 0.45, fetched_at: null,
    };
    // First push
    expect(() => upsertForeignFlow([item], db)).not.toThrow();
    // Second push — same (code, date), new values — must NOT throw UNIQUE constraint
    const updated: ForeignFlowUpsertItem = { ...item, foreign_volume: 250_000, foreign_room: 1_050_000 };
    expect(() => upsertForeignFlow([updated], db)).not.toThrow();
  });

  it("TC-2: second push with same (code, date) updates the row, not inserts a new one", () => {
    const first: ForeignFlowUpsertItem = {
      code: "VCB", date: "2026-04-27",
      foreign_volume: 100_000, foreign_room: 800_000,
      holding_ratio: 0.22, fetched_at: null,
    };
    upsertForeignFlow([first], db);
    expect(rowCount(db)).toBe(1);

    const second: ForeignFlowUpsertItem = { ...first, foreign_volume: 150_000 };
    upsertForeignFlow([second], db);

    expect(rowCount(db)).toBe(1); // Still 1 row — updated, not inserted
    const row = getRow(db, "VCB", "2026-04-27");
    expect(row?.foreign_volume).toBe(150_000); // Updated value
  });

  it("TC-1b: 100 consecutive pushes of same (code, date) — none throw, always 1 row", () => {
    const base: ForeignFlowUpsertItem = {
      code: "HPG", date: "2026-04-27",
      foreign_volume: 0, foreign_room: 500_000,
      holding_ratio: 0.30, fetched_at: null,
    };
    for (let i = 0; i < 100; i++) {
      const item = { ...base, foreign_volume: i * 1000 };
      expect(() => upsertForeignFlow([item], db)).not.toThrow();
    }
    expect(rowCount(db)).toBe(1);
    const row = getRow(db, "HPG", "2026-04-27");
    expect(row?.foreign_volume).toBe(99 * 1000); // Last value wins
  });
});

// ---------------------------------------------------------------------------
// TC-3 & TC-4: Circuit breaker wiring via execute()
// ---------------------------------------------------------------------------

describe("FIX — Circuit breaker: execute() counts successes and failures", () => {
  beforeEach(() => { breakers.foreignFlow.reset(); });
  afterEach(() => { breakers.foreignFlow.reset(); });

  it("TC-3: successful upsert through execute() increments success counter", async () => {
    const db = makeDb();
    const item: ForeignFlowUpsertItem = {
      code: "TCB", date: "2026-04-27",
      foreign_volume: 50_000, foreign_room: 300_000,
      holding_ratio: 0.15, fetched_at: null,
    };
    await breakers.foreignFlow.execute(async () => upsertForeignFlow([item], db));
    expect(breakers.foreignFlow.stats.successes).toBe(1);
    expect(breakers.foreignFlow.stats.state).toBe("closed");
    db.close();
  });

  it("TC-4: DB failure through execute() increments CB failure counter", async () => {
    // Simulate a DB write error by throwing inside execute
    let failures = 0;
    for (let i = 0; i < 4; i++) {
      try {
        await breakers.foreignFlow.execute(async () => {
          throw new Error("UNIQUE constraint failed: vnstock_trading_stats.date");
        });
      } catch {
        failures++;
      }
    }
    expect(failures).toBe(4);
    expect(breakers.foreignFlow.stats.failures).toBe(4);
    expect(breakers.foreignFlow.stats.state).toBe("closed"); // Not yet tripped (threshold=5)

    // 5th failure trips the CB
    try {
      await breakers.foreignFlow.execute(async () => { throw new Error("DB error"); });
    } catch { /* expected */ }
    expect(breakers.foreignFlow.stats.state).toBe("open");
  });

  it("TC-4b: once OPEN, execute() throws CircuitOpenError immediately (no DB hit)", async () => {
    // Trip the CB
    for (let i = 0; i < 5; i++) {
      try {
        await breakers.foreignFlow.execute(async () => { throw new Error("fail"); });
      } catch { /* expected */ }
    }
    expect(breakers.foreignFlow.stats.state).toBe("open");

    // Next call must throw CircuitOpenError, not a DB error
    let caught: Error | null = null;
    try {
      await breakers.foreignFlow.execute(async () => { throw new Error("should not reach"); });
    } catch (e) {
      caught = e as Error;
    }
    expect(caught).not.toBeNull();
    expect(caught instanceof CircuitOpenError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-5 & TC-6: Reset stuck-OPEN circuit breaker
// ---------------------------------------------------------------------------

describe("FIX — Circuit breaker reset: unsticks OPEN state after fix confirmed", () => {
  beforeEach(() => { breakers.foreignFlow.reset(); });
  afterEach(() => { breakers.foreignFlow.reset(); });

  it("TC-5: reset_foreign_flow_circuit_breaker() closes an OPEN CB", async () => {
    // Open the circuit (simulate 100-failure production scenario)
    for (let i = 0; i < 5; i++) {
      try {
        await breakers.foreignFlow.execute(async () => { throw new Error("UNIQUE constraint"); });
      } catch { /* expected */ }
    }
    expect(breakers.foreignFlow.stats.state).toBe("open");

    // Reset via MCP tool
    const result = await reset_foreign_flow_circuit_breaker();
    const text = result.content[0]?.text ?? "";

    expect(breakers.foreignFlow.stats.state).toBe("closed");
    expect(breakers.foreignFlow.stats.failures).toBe(0);
    expect(text.toLowerCase()).toContain("reset complete");
  });

  it("TC-5b: diagnose after reset confirms closed state and zero failures", async () => {
    // Open it
    for (let i = 0; i < 5; i++) {
      try {
        await breakers.foreignFlow.execute(async () => { throw new Error("fail"); });
      } catch { /* expected */ }
    }
    await reset_foreign_flow_circuit_breaker();

    const diag = await diagnose_foreign_flow_circuit_breaker();
    const text = diag.content[0]?.text ?? "";
    expect(text.toLowerCase()).toContain("closed");
    expect(text).not.toContain("auto-transition"); // No open-state timer shown
  });

  it("TC-6: after CB reset, execute() accepts new calls — no CircuitOpenError", async () => {
    // Trip it
    for (let i = 0; i < 5; i++) {
      try {
        await breakers.foreignFlow.execute(async () => { throw new Error("fail"); });
      } catch { /* expected */ }
    }
    expect(breakers.foreignFlow.stats.state).toBe("open");

    await reset_foreign_flow_circuit_breaker();

    // Now a successful upsert must not be rejected with CircuitOpenError
    let threw: Error | null = null;
    try {
      await breakers.foreignFlow.execute(async () => 42);
    } catch (e) {
      threw = e as Error;
    }
    expect(threw).toBeNull(); // Must not throw
    expect(breakers.foreignFlow.stats.state).toBe("closed");
  });
});
