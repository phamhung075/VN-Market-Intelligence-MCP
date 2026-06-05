/**
 * FU-LOCKSTORE-EXPIRED-GC — Expired tombstone GC in coordinationStore
 *
 * DoD test cases:
 *
 *   TC-1: gcExpiredLocks deletes rows past the grace window; live rows survive.
 *   TC-2: GC fires on claimTask (opportunistic path) — tombstones vacuumed
 *         before the claim logic runs.
 *   TC-3: GC respects grace window — a row that expired < 300 s ago is NOT
 *         deleted (protects a just-expired session that may still be releasing).
 *   TC-4: gcExpiredLocks returns the count of deleted rows.
 *   TC-5: A row deleted by GC is gone from listHeldTasks (table stays lean).
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  ensureCoordinationTable,
  claimTask,
  listHeldTasks,
  gcExpiredLocks,
  _injectCoordinationDb,
  _resetCoordinationDbState,
} from "../infrastructure/db/coordinationStore";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  ensureCoordinationTable(db);
  return db;
}

/**
 * Insert a tombstone row directly (bypasses the TTL-minimum guard in claimTask)
 * so we can set an arbitrary expires_at for testing.
 */
function insertTombstone(
  db: Database,
  task_id: string,
  expiresAtOffset: number, // seconds relative to now (negative = in the past)
): void {
  db.prepare(`
    INSERT OR REPLACE INTO task_locks
      (task_id, task_kind, owner_session, owner_agent,
       claimed_at, expires_at, heartbeat_at, ttl_seconds)
    VALUES (?, 'cowork-slot', 'session-gc-test', 'gc-test-agent',
            unixepoch('now'), unixepoch('now') + ?, unixepoch('now'), 900)
  `).run(task_id, expiresAtOffset);
}

function countRows(db: Database): number {
  const row = db.prepare("SELECT COUNT(*) AS c FROM task_locks").get() as { c: number };
  return row.c;
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
  try { testDb.close(); } catch { /* ignore */ }
});

// ---------------------------------------------------------------------------
// TC-1: gcExpiredLocks deletes tombstones past the grace window; live rows survive
// ---------------------------------------------------------------------------

describe("TC-1: gcExpiredLocks removes tombstones outside grace window, leaves live rows", () => {
  it("deletes a row that expired 600 s ago (grace=300 s) while keeping a live row", () => {
    // Tombstone: expired 600 s ago (outside 300 s grace → eligible for GC)
    insertTombstone(testDb, "stale:task:A", -600);
    // Live lock: expires 3600 s from now
    insertTombstone(testDb, "live:task:B", +3600);

    expect(countRows(testDb)).toBe(2);

    const deleted = gcExpiredLocks(testDb, 300);

    expect(deleted).toBe(1);
    expect(countRows(testDb)).toBe(1);

    // The surviving row must be the live one
    const survivor = testDb
      .prepare("SELECT task_id FROM task_locks")
      .get() as { task_id: string } | null;
    expect(survivor?.task_id).toBe("live:task:B");
  });

  it("deletes multiple tombstones in a single call", () => {
    insertTombstone(testDb, "stale:task:X", -700);
    insertTombstone(testDb, "stale:task:Y", -500);
    insertTombstone(testDb, "stale:task:Z", -400);
    insertTombstone(testDb, "live:task:K",  +100);

    const deleted = gcExpiredLocks(testDb, 300);

    expect(deleted).toBe(3);
    expect(countRows(testDb)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// TC-2: GC fires on claimTask (opportunistic)
// ---------------------------------------------------------------------------

describe("TC-2: claimTask triggers opportunistic GC before inserting", () => {
  it("tombstones vacuumed when a new task_claim arrives", () => {
    // Plant 5 tombstones with expires_at well past the grace window
    for (let i = 0; i < 5; i++) {
      insertTombstone(testDb, `old:cowork-slot:tick-${i}`, -1000);
    }
    expect(countRows(testDb)).toBe(5);

    // A new task_claim triggers the GC path before inserting
    const result = claimTask({
      task_id: "new:cowork-slot:tick-fresh",
      task_kind: "cowork-slot",
      owner_session: "session-new",
      owner_agent: "cowork-team",
      ttl_seconds: 900,
    });

    expect(result.claimed).toBe(true);

    // 5 tombstones deleted + 1 new live row = 1 row total
    expect(countRows(testDb)).toBe(1);
  });

  it("GC does not delete a row that is still within its TTL", () => {
    // Active lock: expires 3600 s from now
    claimTask({
      task_id: "active:sprint-task:007",
      task_kind: "sprint-task",
      owner_session: "session-active",
      owner_agent: "dev-mcp-server",
      ttl_seconds: 3600,
    });

    // Another claim (triggers GC) — the active lock must not be deleted
    claimTask({
      task_id: "another:cowork-slot:001",
      task_kind: "cowork-slot",
      owner_session: "session-B",
      owner_agent: "cowork-team",
      ttl_seconds: 900,
    });

    expect(countRows(testDb)).toBe(2);
    const ids = (testDb.prepare("SELECT task_id FROM task_locks").all() as Array<{ task_id: string }>)
      .map((r) => r.task_id);
    expect(ids).toContain("active:sprint-task:007");
  });
});

// ---------------------------------------------------------------------------
// TC-3: grace window respected — just-expired row is NOT deleted
// ---------------------------------------------------------------------------

describe("TC-3: grace window protects recently-expired rows", () => {
  it("a row that expired 100 s ago is NOT deleted with grace=300 s", () => {
    // Expired 100 s ago — inside the 300 s grace window
    insertTombstone(testDb, "just:expired:task", -100);

    const deleted = gcExpiredLocks(testDb, 300);

    expect(deleted).toBe(0);
    expect(countRows(testDb)).toBe(1);
  });

  it("a row that expired exactly at the grace boundary is NOT deleted", () => {
    // expires_at = now - 300 → boundary; DELETE condition is strictly <, so not deleted
    insertTombstone(testDb, "boundary:task", -300);

    const deleted = gcExpiredLocks(testDb, 300);

    // expires_at = now - 300; condition is expires_at < now - 300 → false at boundary
    expect(deleted).toBe(0);
  });

  it("a row that expired 301 s ago IS deleted with grace=300 s", () => {
    insertTombstone(testDb, "just:past:boundary", -301);

    const deleted = gcExpiredLocks(testDb, 300);

    expect(deleted).toBe(1);
    expect(countRows(testDb)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// TC-4: gcExpiredLocks returns correct row count
// ---------------------------------------------------------------------------

describe("TC-4: gcExpiredLocks return value", () => {
  it("returns 0 when no rows are eligible for GC", () => {
    insertTombstone(testDb, "fresh:task:A", +3600);
    const deleted = gcExpiredLocks(testDb, 300);
    expect(deleted).toBe(0);
  });

  it("returns exact count matching the number of deleted rows", () => {
    insertTombstone(testDb, "stale:a", -500);
    insertTombstone(testDb, "stale:b", -600);
    const deleted = gcExpiredLocks(testDb, 300);
    expect(deleted).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// TC-5: listHeldTasks reflects the lean post-GC table state
// ---------------------------------------------------------------------------

describe("TC-5: listHeldTasks shows only live locks after GC", () => {
  it("expired tombstones are absent from listHeldTasks after a claim triggers GC", () => {
    // 3 stale tombstones
    insertTombstone(testDb, "old:slot:1", -1000);
    insertTombstone(testDb, "old:slot:2", -800);
    insertTombstone(testDb, "old:slot:3", -600);

    // 1 live lock (claim also triggers GC)
    claimTask({
      task_id: "live:slot:now",
      task_kind: "cowork-slot",
      owner_session: "session-live",
      owner_agent: "cowork-team",
      ttl_seconds: 900,
    });

    const listResult = listHeldTasks();
    expect(listResult.count).toBe(1);
    expect(listResult.locks[0]!.task_id).toBe("live:slot:now");

    // No expired rows remain
    const expiredResult = listHeldTasks({ expired: true });
    expect(expiredResult.count).toBe(0);
  });
});
