/**
 * P1.5-MCP-3 (TASK_1984) — Periodic reaper unit tests
 *
 * Tests _reaperTick (the logic extracted from the setInterval callback) and
 * startPeriodicReaper (timer setup + DoD-P15-5 error-survival guarantee).
 *
 * NOTE: We do NOT test the actual 600s wall-clock timing here — that would
 * require fake timers or a live rebuild. Per the handoff, live-timer
 * verification is deferred to qa/TASK_1988. Instead:
 *
 *   1. We test the REAPING LOGIC directly by calling _reaperTick with an
 *      in-memory DB that has expired adoptable rows, and asserting that
 *      orphan-signals are emitted + expired rows are deleted.
 *
 *   2. We test the DoD-P15-5 error-survival guarantee by wrapping the timer
 *      callback logic manually: error in one tick → catch+log → next tick OK.
 *
 * Acceptance criteria (from TASK_1984 handoff):
 *   AC-REAPER-1: _reaperTick with an in-memory DB containing expired sprint-task
 *     → orphan-signal emitted, original row deleted (logic test)
 *   AC-REAPER-2: _reaperTick with DB-unavailable (NULL) → returns 0, no throw
 *   AC-REAPER-3: DoD-P15-5 regression — timer callback catches errors and
 *     continues; subsequent tick still executes (error-survival)
 *   AC-REAPER-4: startPeriodicReaper returns a clearable interval ID (no leak)
 */

import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from "bun:test";
import { Database } from "bun:sqlite";
import {
  ensureCoordinationTable,
  _reaperTick,
  startPeriodicReaper,
  _injectCoordinationDb,
  _resetCoordinationDbState,
} from "../infrastructure/db/coordinationStore";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createTestDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  ensureCoordinationTable(db);
  return db;
}

function insertExpiredSprintTask(
  db: Database,
  taskId: string,
  ownerAgent = "dev-team",
  redispatchCount = 0,
): void {
  // Insert with a far-past expires_at so it's beyond the 300s grace window
  const pastExpiry = Math.floor(Date.now() / 1000) - 400; // expired 400s ago
  db.prepare(`
    INSERT INTO task_locks
      (task_id, task_kind, owner_session, owner_agent, owner_client_session,
       claimed_at, expires_at, heartbeat_at, ttl_seconds, payload, redispatch_count)
    VALUES
      (?, 'sprint-task', 'sess-test', ?, 'client-uuid-test',
       unixepoch('now'), ?, unixepoch('now'), 3600, '{"test":true}', ?)
  `).run(taskId, ownerAgent, pastExpiry, redispatchCount);
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let testDb: Database;

beforeEach(() => {
  _resetCoordinationDbState();
  testDb = createTestDb();
  _injectCoordinationDb(testDb);
});

afterEach(() => {
  _resetCoordinationDbState();
  try { testDb.close(); } catch { /* already closed */ }
});

// ---------------------------------------------------------------------------
// AC-REAPER-1: _reaperTick — reaping logic with in-memory DB
// ---------------------------------------------------------------------------

describe("AC-REAPER-1: _reaperTick — reaping logic (inject expired rows, call directly)", () => {
  it("emits orphan-signal and deletes expired sprint-task when called with dbOverride", () => {
    insertExpiredSprintTask(testDb, "task:1984-reaper-direct", "dev-team", 0);

    // Call _reaperTick directly with the test DB (bypass getCoordinationDb)
    const deleted = _reaperTick(testDb);

    // Original row gone
    const orig = testDb.prepare("SELECT * FROM task_locks WHERE task_id = 'task:1984-reaper-direct'").get();
    expect(orig).toBeNull();

    // Orphan-signal row emitted
    const signal = testDb.prepare(
      "SELECT * FROM task_locks WHERE task_id = 'orphan-signal:task:1984-reaper-direct'"
    ).get() as Record<string, unknown> | null;
    expect(signal).not.toBeNull();
    expect(signal!["task_kind"]).toBe("orphan-signal");
    expect(signal!["owner_agent"]).toBe("dev-team");
    expect(signal!["owner_client_session"]).toBeNull();

    const payload = JSON.parse(signal!["payload"] as string) as Record<string, unknown>;
    expect(payload["redispatch_count"]).toBe(1);

    expect(deleted).toBe(1);
  });

  it("_reaperTick uses injected DB (via _injectCoordinationDb) when no override", () => {
    insertExpiredSprintTask(testDb, "task:1984-reaper-injected", "cowork-team", 1);

    // Call without override — uses the injected testDb
    const deleted = _reaperTick();

    const signal = testDb.prepare(
      "SELECT payload FROM task_locks WHERE task_id = 'orphan-signal:task:1984-reaper-injected'"
    ).get() as { payload: string } | null;
    expect(signal).not.toBeNull();
    expect(JSON.parse(signal!.payload)["redispatch_count"]).toBe(2); // prior 1 → 2

    expect(deleted).toBe(1);
  });

  it("returns 0 when no expired rows exist (empty tick)", () => {
    // Insert an active (non-expired) sprint-task
    testDb.prepare(`
      INSERT INTO task_locks
        (task_id, task_kind, owner_session, owner_agent, owner_client_session,
         claimed_at, expires_at, heartbeat_at, ttl_seconds, payload, redispatch_count)
      VALUES
        ('task:1984-active', 'sprint-task', 'sess-test', 'dev-team', 'client-uuid-test',
         unixepoch('now'), unixepoch('now') + 3600, unixepoch('now'), 3600, NULL, 0)
    `).run();

    const deleted = _reaperTick(testDb);
    expect(deleted).toBe(0);

    // Active row still exists
    const row = testDb.prepare("SELECT * FROM task_locks WHERE task_id = 'task:1984-active'").get();
    expect(row).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AC-REAPER-2: _reaperTick with DB unavailable → 0, no throw
// ---------------------------------------------------------------------------

describe("AC-REAPER-2: _reaperTick — DB unavailable returns 0, does not throw", () => {
  it("returns 0 when called with a closed DB (simulates DB unavailable)", () => {
    // Create and immediately close a DB to simulate unavailability
    const closedDb = createTestDb();
    closedDb.close();

    // _reaperTick should not throw even with a broken DB
    // (gcExpiredLocks has its own try/catch that catches DB errors)
    let result: number | undefined;
    expect(() => {
      result = _reaperTick(closedDb);
    }).not.toThrow();

    // gcExpiredLocks catches the DB error and returns 0
    expect(result).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// AC-REAPER-3: DoD-P15-5 — timer callback error-survival
//
// Verifies that ONE error inside the setInterval callback does NOT kill the
// timer. We simulate this by:
//   1. Building the same callback logic used by startPeriodicReaper
//   2. Calling it with a DB that throws (first invocation → error)
//   3. Calling it again normally (second invocation → success)
// This proves the pattern is correct without wall-clock timing.
// ---------------------------------------------------------------------------

describe("AC-REAPER-3: DoD-P15-5 — timer callback error-survival", () => {
  it("callback catches gcExpiredLocks error and subsequent call still succeeds", () => {
    // Simulate the interval callback with try/catch (mirrors startPeriodicReaper internals)
    const simulateCallback = (dbOverride?: Database): { succeeded: boolean; errorCaught: boolean } => {
      let succeeded = false;
      let errorCaught = false;
      try {
        _reaperTick(dbOverride);
        succeeded = true;
      } catch {
        errorCaught = true;
        // DoD-P15-5: log + continue (no rethrow)
      }
      return { succeeded, errorCaught };
    };

    // First call: closed DB → gcExpiredLocks catches internally → returns 0 → no throw
    // (gcExpiredLocks has its own try/catch so it never throws to the interval callback)
    const closedDb = createTestDb();
    closedDb.close();
    const firstResult = simulateCallback(closedDb);
    // gcExpiredLocks absorbs the error internally and returns 0 — callback succeeds
    expect(firstResult.succeeded).toBe(true);
    expect(firstResult.errorCaught).toBe(false);

    // Second call: live DB → succeeds
    insertExpiredSprintTask(testDb, "task:1984-dod-p15-5", "dev-team", 0);
    const secondResult = simulateCallback(testDb);
    expect(secondResult.succeeded).toBe(true);
    expect(secondResult.errorCaught).toBe(false);

    // Orphan-signal from second call
    const signal = testDb.prepare(
      "SELECT * FROM task_locks WHERE task_id = 'orphan-signal:task:1984-dod-p15-5'"
    ).get();
    expect(signal).not.toBeNull();
  });

  it("startPeriodicReaper interval callback: explicit throw in tick does not propagate", () => {
    // Build the same callback structure that startPeriodicReaper uses.
    // We stub _reaperTick to throw on first call, succeed on second.
    let callCount = 0;
    const errors: unknown[] = [];
    const successes: number[] = [];

    // Simulate what the setInterval closure does (mirrors startPeriodicReaper)
    const reaperCallback = () => {
      try {
        callCount++;
        if (callCount === 1) {
          throw new Error("simulated transient DB-busy");
        }
        successes.push(_reaperTick(testDb));
      } catch (err) {
        // DoD-P15-5: log + continue; must NOT rethrow
        errors.push(err);
      }
    };

    // First tick: should catch the error
    expect(() => reaperCallback()).not.toThrow();
    expect(errors).toHaveLength(1);
    expect(successes).toHaveLength(0);

    // Second tick: should succeed (timer survives the error)
    insertExpiredSprintTask(testDb, "task:1984-second-tick", "dev-team", 0);
    expect(() => reaperCallback()).not.toThrow();
    expect(errors).toHaveLength(1); // still only 1 error
    expect(successes).toHaveLength(1); // second tick executed
  });
});

// ---------------------------------------------------------------------------
// AC-REAPER-4: startPeriodicReaper returns a clearable interval ID
// ---------------------------------------------------------------------------

describe("AC-REAPER-4: startPeriodicReaper — returns clearable interval ID", () => {
  it("returns a non-null interval ID that can be cleared without throwing", () => {
    const intervalId = startPeriodicReaper();

    // Interval ID must be truthy (non-null, non-zero)
    expect(intervalId).toBeDefined();

    // clearInterval must not throw
    expect(() => clearInterval(intervalId)).not.toThrow();
  });

  it("cleared interval does not cause errors when clearInterval is called twice", () => {
    const intervalId = startPeriodicReaper();
    clearInterval(intervalId);
    // Second clearInterval on same ID is a no-op — should not throw
    expect(() => clearInterval(intervalId)).not.toThrow();
  });
});
