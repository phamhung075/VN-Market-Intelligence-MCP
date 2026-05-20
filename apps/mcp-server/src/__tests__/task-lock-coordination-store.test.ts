/**
 * Task-Lock System — coordinationStore unit tests
 *
 * Tests the coordinationStore.ts DB layer in isolation using an in-memory SQLite DB.
 * Covers all claim/heartbeat/release/list operations + race conditions.
 *
 * Acceptance criteria:
 *   AC-1: Successful claim creates row
 *   AC-2: Concurrent INSERT OR IGNORE — only one wins
 *   AC-3: Stale-steal UPDATE succeeds when expires_at < now
 *   AC-4: Stale-steal UPDATE fails when expires_at > now
 *   AC-5: Heartbeat extends expires_at and validates owner_session match
 *   AC-6: Release scoped to owner_session — wrong session cannot release
 *   AC-7: List filtered by kind / agent / expired
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  ensureCoordinationTable,
  claimTask,
  heartbeatTask,
  releaseTask,
  listHeldTasks,
  closeCoordinationDb,
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

function manipulateExpiry(db: Database, task_id: string, epochSeconds: number): void {
  db.prepare("UPDATE task_locks SET expires_at = ? WHERE task_id = ?").run(epochSeconds, task_id);
}

function getRow(db: Database, task_id: string): Record<string, unknown> | null {
  return db.prepare("SELECT * FROM task_locks WHERE task_id = ?").get(task_id) as Record<string, unknown> | null;
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
// AC-1: Successful claim creates row
// ---------------------------------------------------------------------------

describe("AC-1: Successful claim creates row", () => {
  it("creates a task_locks row on first claim", () => {
    const result = claimTask({
      task_id: "cowork-slot:news-scout:20260520T140000Z",
      task_kind: "cowork-slot",
      owner_session: "session-A",
      owner_agent: "cowork-team",
      ttl_seconds: 900,
      payload: '{"slot_id":"news-scout"}',
    });

    expect(result.claimed).toBe(true);
    expect((result as { stolen?: boolean }).stolen).toBeUndefined();

    const row = getRow(testDb, "cowork-slot:news-scout:20260520T140000Z");
    expect(row).not.toBeNull();
    expect(row!["owner_session"]).toBe("session-A");
    expect(row!["owner_agent"]).toBe("cowork-team");
    expect(row!["task_kind"]).toBe("cowork-slot");
    expect(row!["ttl_seconds"]).toBe(900);
    expect(row!["payload"]).toBe('{"slot_id":"news-scout"}');
  });

  it("claimed row has expires_at > claimed_at (TTL applied)", () => {
    claimTask({
      task_id: "sprint-task:1954b",
      task_kind: "sprint-task",
      owner_session: "session-A",
      owner_agent: "dev-mcp-server",
      ttl_seconds: 3600,
    });

    const row = getRow(testDb, "sprint-task:1954b") as { claimed_at: number; expires_at: number } | null;
    expect(row).not.toBeNull();
    expect(row!.expires_at).toBeGreaterThan(row!.claimed_at);
    expect(row!.expires_at - row!.claimed_at).toBeLessThanOrEqual(3601); // allow 1s drift
    expect(row!.expires_at - row!.claimed_at).toBeGreaterThanOrEqual(3599);
  });
});

// ---------------------------------------------------------------------------
// AC-2: Concurrent INSERT OR IGNORE — only one wins
// ---------------------------------------------------------------------------

describe("AC-2: Concurrent INSERT OR IGNORE — only one winner", () => {
  it("second claim fails when lock is already held (non-expired)", () => {
    const taskId = "cowork-slot:market-watcher:20260520T140000Z";

    // Session A claims first
    const r1 = claimTask({
      task_id: taskId,
      task_kind: "cowork-slot",
      owner_session: "session-A",
      owner_agent: "cowork-team",
      ttl_seconds: 900,
    });
    expect(r1.claimed).toBe(true);

    // Session B claims same task immediately — should fail
    const r2 = claimTask({
      task_id: taskId,
      task_kind: "cowork-slot",
      owner_session: "session-B",
      owner_agent: "cowork-team",
      ttl_seconds: 900,
    });
    expect(r2.claimed).toBe(false);

    // Row still owned by session-A
    const row = getRow(testDb, taskId);
    expect(row!["owner_session"]).toBe("session-A");
  });

  it("failed claim returns current_holder with correct owner info", () => {
    const taskId = "dash:po:1954-A-29-1";

    claimTask({
      task_id: taskId,
      task_kind: "dashboard-row",
      owner_session: "session-A",
      owner_agent: "dev-team",
      ttl_seconds: 1800,
    });

    const r2 = claimTask({
      task_id: taskId,
      task_kind: "dashboard-row",
      owner_session: "session-B",
      owner_agent: "dev-team",
      ttl_seconds: 1800,
    });

    expect(r2.claimed).toBe(false);
    const holder = (r2 as { current_holder?: Record<string, unknown> }).current_holder;
    expect(holder).not.toBeUndefined();
    expect(holder!["owner_session"]).toBe("session-A");
    expect(holder!["owner_agent"]).toBe("dev-team");
    expect(typeof holder!["expires_at"]).toBe("number");
  });
});

// ---------------------------------------------------------------------------
// AC-3: Stale-steal UPDATE succeeds when expires_at < now
// ---------------------------------------------------------------------------

describe("AC-3: Stale-steal succeeds when expires_at < now", () => {
  it("session B steals a stale lock (expires_at set to past)", () => {
    const taskId = "cowork-slot:alert-commander:20260520T140000Z";

    // Session A claims
    const r1 = claimTask({
      task_id: taskId,
      task_kind: "cowork-slot",
      owner_session: "session-A",
      owner_agent: "cowork-team",
      ttl_seconds: 900,
    });
    expect(r1.claimed).toBe(true);

    // Simulate expiry by setting expires_at to the past
    manipulateExpiry(testDb, taskId, 1000); // epoch 1000 = far in the past

    // Session B should steal the stale lock
    const r2 = claimTask({
      task_id: taskId,
      task_kind: "cowork-slot",
      owner_session: "session-B",
      owner_agent: "cowork-team",
      ttl_seconds: 900,
    });

    expect(r2.claimed).toBe(true);
    expect((r2 as { stolen?: boolean }).stolen).toBe(true);

    // Row now owned by session-B
    const row = getRow(testDb, taskId);
    expect(row!["owner_session"]).toBe("session-B");
  });
});

// ---------------------------------------------------------------------------
// AC-4: Stale-steal UPDATE fails when expires_at > now
// ---------------------------------------------------------------------------

describe("AC-4: Stale-steal fails when lock is still active", () => {
  it("session B cannot steal an active lock (expires_at > now)", () => {
    const taskId = "task:1954c";

    // Session A claims with generous TTL
    claimTask({
      task_id: taskId,
      task_kind: "sprint-task",
      owner_session: "session-A",
      owner_agent: "dev-mcp-server",
      ttl_seconds: 86400, // 24h — definitely not stale
    });

    // Session B tries to steal — should fail since lock is active
    const r2 = claimTask({
      task_id: taskId,
      task_kind: "sprint-task",
      owner_session: "session-B",
      owner_agent: "dev-api-gateway",
      ttl_seconds: 3600,
    });

    expect(r2.claimed).toBe(false);
    const holder = (r2 as { current_holder?: Record<string, unknown> }).current_holder;
    expect(holder!["owner_session"]).toBe("session-A");

    // Row still owned by session-A (not stolen)
    const row = getRow(testDb, taskId);
    expect(row!["owner_session"]).toBe("session-A");
  });
});

// ---------------------------------------------------------------------------
// AC-5: Heartbeat extends expires_at + validates owner_session
// ---------------------------------------------------------------------------

describe("AC-5: Heartbeat protocol", () => {
  it("heartbeat by owner extends expires_at and returns ok=true", () => {
    const taskId = "task:1955a";

    claimTask({
      task_id: taskId,
      task_kind: "sprint-task",
      owner_session: "session-A",
      owner_agent: "dev-mcp-server",
      ttl_seconds: 3600,
    });

    const rowBefore = getRow(testDb, taskId) as { expires_at: number };
    const hbResult = heartbeatTask(taskId, "session-A");

    expect(hbResult.ok).toBe(true);
    expect(hbResult.expires_at).toBeGreaterThanOrEqual(rowBefore.expires_at);
  });

  it("heartbeat by wrong session returns ok=false (lock not found or stolen)", () => {
    const taskId = "task:1955b";

    claimTask({
      task_id: taskId,
      task_kind: "sprint-task",
      owner_session: "session-A",
      owner_agent: "dev-mcp-server",
      ttl_seconds: 3600,
    });

    // Different session tries to heartbeat — must fail
    const hbResult = heartbeatTask(taskId, "session-WRONG");
    expect(hbResult.ok).toBe(false);
    expect(hbResult.expires_at).toBe(0);

    // Original lock untouched
    const row = getRow(testDb, taskId);
    expect(row!["owner_session"]).toBe("session-A");
  });

  it("heartbeat on non-existent task_id returns ok=false", () => {
    const result = heartbeatTask("task:does-not-exist", "session-A");
    expect(result.ok).toBe(false);
    expect(result.expires_at).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// AC-6: Release scoped to owner_session
// ---------------------------------------------------------------------------

describe("AC-6: Release scoped to owner_session", () => {
  it("owner can release their own lock", () => {
    const taskId = "cowork-slot:news-scout:20260520T150000Z";

    claimTask({
      task_id: taskId,
      task_kind: "cowork-slot",
      owner_session: "session-A",
      owner_agent: "cowork-team",
      ttl_seconds: 900,
    });

    const releaseResult = releaseTask(taskId, "session-A");
    expect(releaseResult.ok).toBe(true);

    const row = getRow(testDb, taskId);
    expect(row).toBeNull(); // row deleted
  });

  it("wrong session cannot release another session's lock", () => {
    const taskId = "cowork-slot:news-scout:20260520T160000Z";

    claimTask({
      task_id: taskId,
      task_kind: "cowork-slot",
      owner_session: "session-A",
      owner_agent: "cowork-team",
      ttl_seconds: 900,
    });

    // Session B tries to release — must fail (ok=false)
    const releaseResult = releaseTask(taskId, "session-B");
    expect(releaseResult.ok).toBe(false);

    // Row still exists, still owned by session-A
    const row = getRow(testDb, taskId);
    expect(row).not.toBeNull();
    expect(row!["owner_session"]).toBe("session-A");
  });

  it("release on non-existent lock returns ok=false (acceptable)", () => {
    const result = releaseTask("task:does-not-exist", "session-A");
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AC-7: List filtered by kind / agent / expired
// ---------------------------------------------------------------------------

describe("AC-7: listHeldTasks filtered queries", () => {
  beforeEach(() => {
    // Seed a few locks with different kinds/agents
    claimTask({
      task_id: "cowork-slot:news-scout:20260520T140000Z",
      task_kind: "cowork-slot",
      owner_session: "session-A",
      owner_agent: "cowork-team",
      ttl_seconds: 900,
    });
    claimTask({
      task_id: "task:1954a",
      task_kind: "sprint-task",
      owner_session: "session-B",
      owner_agent: "dev-mcp-server",
      ttl_seconds: 3600,
    });
    claimTask({
      task_id: "dash:po:row-001",
      task_kind: "dashboard-row",
      owner_session: "session-C",
      owner_agent: "dev-team",
      ttl_seconds: 1800,
    });

    // Make one lock stale
    manipulateExpiry(testDb, "cowork-slot:news-scout:20260520T140000Z", 1000);
  });

  it("returns all locks when no filter", () => {
    const result = listHeldTasks();
    expect(result.count).toBe(3);
    expect(result.locks).toHaveLength(3);
  });

  it("filters by kind=sprint-task", () => {
    const result = listHeldTasks({ kind: "sprint-task" });
    expect(result.count).toBe(1);
    expect(result.locks[0].task_kind).toBe("sprint-task");
  });

  it("filters by owner_agent=dev-team", () => {
    const result = listHeldTasks({ owner_agent: "dev-team" });
    expect(result.count).toBe(1);
    expect(result.locks[0].task_id).toBe("dash:po:row-001");
  });

  it("filters expired=true returns only stale locks", () => {
    const result = listHeldTasks({ expired: true });
    expect(result.count).toBe(1);
    expect(result.locks[0].task_id).toBe("cowork-slot:news-scout:20260520T140000Z");
  });

  it("filters expired=false returns only active locks", () => {
    const result = listHeldTasks({ expired: false });
    expect(result.count).toBe(2);
    const ids = result.locks.map(l => l.task_id);
    expect(ids).not.toContain("cowork-slot:news-scout:20260520T140000Z");
  });

  it("each lock row has all required fields", () => {
    const result = listHeldTasks({ kind: "sprint-task" });
    const lock = result.locks[0];
    expect(lock.task_id).toBeTruthy();
    expect(lock.task_kind).toBeTruthy();
    expect(lock.owner_session).toBeTruthy();
    expect(lock.owner_agent).toBeTruthy();
    expect(typeof lock.claimed_at).toBe("number");
    expect(typeof lock.expires_at).toBe("number");
    expect(typeof lock.heartbeat_at).toBe("number");
    expect(typeof lock.ttl_seconds).toBe("number");
  });
});
