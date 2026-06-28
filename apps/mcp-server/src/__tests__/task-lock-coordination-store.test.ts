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
 *   AC-5: Heartbeat extends expires_at and validates owner_client_session match
 *         (P1-FINAL: sole ownership key; wrong session fails anti-theft)
 *   AC-6: Release scoped to owner_client_session
 *         (P1-FINAL: wrong session returns {ok:true, released:0}, not an error)
 *   AC-7: List filtered by kind / agent / expired
 *   AC-8: P1-FINAL SESSION ISOLATION — different sessions cannot steal each other's locks
 *         (replaces FIX-CWK-LEADER-LOCK-REBIND owner_agent fallback tests, now REMOVED)
 *   AC-10: P1-FINAL correctness — owner_client_session stored, returned in current_holder,
 *          strict matching (cases 4 and 8 removed: pre-P1 NULL-row fallback is gone)
 *
 * Removed (P1-FINAL):
 *   AC-9: Legacy path (no owner_agent / owner_session fallback) — REMOVED.
 *   AC-10 cases 4 and 8: pre-P1 NULL-owner_client_session fallback — REMOVED.
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
      owner_client_session: "client-uuid-A",
      ttl_seconds: 900,
      payload: '{"slot_id":"news-scout"}',
    });

    expect(result.claimed).toBe(true);
    expect((result as { stolen?: boolean }).stolen).toBeUndefined();

    const row = getRow(testDb, "cowork-slot:news-scout:20260520T140000Z");
    expect(row).not.toBeNull();
    expect(row!["owner_session"]).toBe("session-A");
    expect(row!["owner_agent"]).toBe("cowork-team");
    expect(row!["owner_client_session"]).toBe("client-uuid-A");
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
      owner_client_session: "client-uuid-1954b",
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
      owner_client_session: "client-uuid-A",
      ttl_seconds: 900,
    });
    expect(r1.claimed).toBe(true);

    // Session B claims same task immediately — should fail
    const r2 = claimTask({
      task_id: taskId,
      task_kind: "cowork-slot",
      owner_session: "session-B",
      owner_agent: "cowork-team",
      owner_client_session: "client-uuid-B",
      ttl_seconds: 900,
    });
    expect(r2.claimed).toBe(false);

    // Row still owned by session-A / client-uuid-A
    const row = getRow(testDb, taskId);
    expect(row!["owner_session"]).toBe("session-A");
    expect(row!["owner_client_session"]).toBe("client-uuid-A");
  });

  it("failed claim returns current_holder with correct owner info including owner_client_session", () => {
    const taskId = "dash:po:1954-A-29-1";

    claimTask({
      task_id: taskId,
      task_kind: "dashboard-row",
      owner_session: "session-A",
      owner_agent: "dev-team",
      owner_client_session: "client-uuid-winner",
      ttl_seconds: 1800,
    });

    const r2 = claimTask({
      task_id: taskId,
      task_kind: "dashboard-row",
      owner_session: "session-B",
      owner_agent: "dev-team",
      owner_client_session: "client-uuid-loser",
      ttl_seconds: 1800,
    });

    expect(r2.claimed).toBe(false);
    const holder = (r2 as { current_holder?: Record<string, unknown> }).current_holder;
    expect(holder).not.toBeUndefined();
    expect(holder!["owner_session"]).toBe("session-A");
    expect(holder!["owner_agent"]).toBe("dev-team");
    expect(holder!["owner_client_session"]).toBe("client-uuid-winner");
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
      owner_client_session: "client-uuid-A",
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
      owner_client_session: "client-uuid-B",
      ttl_seconds: 900,
    });

    expect(r2.claimed).toBe(true);
    expect((r2 as { stolen?: boolean }).stolen).toBe(true);

    // Row now owned by session-B / client-uuid-B
    const row = getRow(testDb, taskId);
    expect(row!["owner_session"]).toBe("session-B");
    expect(row!["owner_client_session"]).toBe("client-uuid-B");
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
      owner_client_session: "client-uuid-A",
      ttl_seconds: 86400, // 24h — definitely not stale
    });

    // Session B tries to steal — should fail since lock is active
    const r2 = claimTask({
      task_id: taskId,
      task_kind: "sprint-task",
      owner_session: "session-B",
      owner_agent: "dev-api-gateway",
      owner_client_session: "client-uuid-B",
      ttl_seconds: 3600,
    });

    expect(r2.claimed).toBe(false);
    const holder = (r2 as { current_holder?: Record<string, unknown> }).current_holder;
    expect(holder!["owner_session"]).toBe("session-A");
    expect(holder!["owner_client_session"]).toBe("client-uuid-A");

    // Row still owned by session-A (not stolen)
    const row = getRow(testDb, taskId);
    expect(row!["owner_session"]).toBe("session-A");
  });
});

// ---------------------------------------------------------------------------
// AC-5: Heartbeat extends expires_at + validates owner_client_session
// P1-FINAL (TASK_1980): heartbeat matches SOLELY on owner_client_session.
// Fallback rungs (owner_agent, owner_session) removed.
// ---------------------------------------------------------------------------

describe("AC-5: Heartbeat protocol (P1-FINAL)", () => {
  it("heartbeat by correct owner_client_session extends expires_at and returns ok=true", () => {
    const taskId = "task:1955a";

    claimTask({
      task_id: taskId,
      task_kind: "sprint-task",
      owner_session: "session-A",
      owner_agent: "dev-mcp-server",
      owner_client_session: "client-uuid-owner",
      ttl_seconds: 3600,
    });

    const rowBefore = getRow(testDb, taskId) as { expires_at: number };
    // P1-FINAL: pass owner_client_session only
    const hbResult = heartbeatTask(taskId, "client-uuid-owner");

    expect(hbResult.ok).toBe(true);
    expect(hbResult.expires_at).toBeGreaterThanOrEqual(rowBefore.expires_at);
  });

  it("heartbeat by wrong owner_client_session returns ok=false (anti-theft)", () => {
    const taskId = "task:1955b";

    claimTask({
      task_id: taskId,
      task_kind: "sprint-task",
      owner_session: "session-A",
      owner_agent: "dev-mcp-server",
      owner_client_session: "client-uuid-owner",
      ttl_seconds: 3600,
    });

    // Different session tries to heartbeat — must fail (anti-theft)
    const hbResult = heartbeatTask(taskId, "client-uuid-intruder");
    expect(hbResult.ok).toBe(false);
    expect(hbResult.expires_at).toBe(0);

    // Original lock untouched
    const row = getRow(testDb, taskId);
    expect(row!["owner_client_session"]).toBe("client-uuid-owner");
  });

  it("heartbeat on non-existent task_id returns ok=false", () => {
    const result = heartbeatTask("task:does-not-exist", "client-uuid-any");
    expect(result.ok).toBe(false);
    expect(result.expires_at).toBe(0);
  });

  it("heartbeat on expired lock returns ok=false (steal-after-TTL gate)", () => {
    const taskId = "task:1955c-expired";

    claimTask({
      task_id: taskId,
      task_kind: "sprint-task",
      owner_session: "session-A",
      owner_agent: "dev-mcp-server",
      owner_client_session: "client-uuid-owner",
      ttl_seconds: 3600,
    });

    // Simulate TTL expiry
    manipulateExpiry(testDb, taskId, 1000);

    // Same session tries to heartbeat expired lock — must fail so steal path kicks in
    const hbResult = heartbeatTask(taskId, "client-uuid-owner");
    expect(hbResult.ok).toBe(false);
    expect(hbResult.expires_at).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// AC-6: Release scoped to owner_client_session
// P1-FINAL (TASK_1980): release matches SOLELY on owner_client_session.
// Fallback rungs removed. Wrong-session release is a clean no-op.
// ---------------------------------------------------------------------------

describe("AC-6: Release scoped to owner_client_session (P1-FINAL: {ok:true,released:0|1} shape)", () => {
  it("owner can release their own lock by owner_client_session → {ok:true, released:1}", () => {
    const taskId = "cowork-slot:news-scout:20260520T150000Z";

    claimTask({
      task_id: taskId,
      task_kind: "cowork-slot",
      owner_session: "session-A",
      owner_agent: "cowork-team",
      owner_client_session: "client-uuid-owner",
      ttl_seconds: 900,
    });

    // P1-FINAL: release with matching owner_client_session
    const releaseResult = releaseTask(taskId, "client-uuid-owner");
    expect(releaseResult.ok).toBe(true);
    expect((releaseResult as { released?: number }).released).toBe(1); // row actually deleted

    const row = getRow(testDb, taskId);
    expect(row).toBeNull(); // row deleted
  });

  it("different owner_client_session cannot release another session's lock → {ok:true, released:0} (no-op, not error)", () => {
    const taskId = "cowork-slot:news-scout:20260520T160000Z";

    claimTask({
      task_id: taskId,
      task_kind: "cowork-slot",
      owner_session: "session-A",
      owner_agent: "cowork-team",
      owner_client_session: "client-uuid-owner",
      ttl_seconds: 900,
    });

    // Different session tries to release — P1-FINAL: returns {ok:true, released:0} (anti-theft via no-op)
    const releaseResult = releaseTask(taskId, "client-uuid-intruder");
    expect(releaseResult.ok).toBe(true);
    expect((releaseResult as { released?: number }).released).toBe(0); // no row deleted

    // Row still exists, still owned by client-uuid-owner
    const row = getRow(testDb, taskId);
    expect(row).not.toBeNull();
    expect(row!["owner_client_session"]).toBe("client-uuid-owner");
  });

  it("release on non-existent lock → {ok:true, released:0} (clean no-op, not error)", () => {
    // P1-FINAL: non-existent lock is a clean no-op, not an error
    const result = releaseTask("task:does-not-exist", "client-uuid-any");
    expect(result.ok).toBe(true);
    expect((result as { released?: number }).released).toBe(0);
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
      owner_client_session: "client-uuid-A",
      ttl_seconds: 900,
    });
    claimTask({
      task_id: "task:1954a",
      task_kind: "sprint-task",
      owner_session: "session-B",
      owner_agent: "dev-mcp-server",
      owner_client_session: "client-uuid-B",
      ttl_seconds: 3600,
    });
    claimTask({
      task_id: "dash:po:row-001",
      task_kind: "dashboard-row",
      owner_session: "session-C",
      owner_agent: "dev-team",
      owner_client_session: "client-uuid-C",
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
    expect(result.locks[0]!.task_kind).toBe("sprint-task");
  });

  it("filters by owner_agent=dev-team", () => {
    const result = listHeldTasks({ owner_agent: "dev-team" });
    expect(result.count).toBe(1);
    expect(result.locks[0]!.task_id).toBe("dash:po:row-001");
  });

  it("filters expired=true returns only stale locks", () => {
    const result = listHeldTasks({ expired: true });
    expect(result.count).toBe(1);
    expect(result.locks[0]!.task_id).toBe("cowork-slot:news-scout:20260520T140000Z");
  });

  it("filters expired=false returns only active locks", () => {
    const result = listHeldTasks({ expired: false });
    expect(result.count).toBe(2);
    const ids = result.locks.map(l => l.task_id);
    expect(ids).not.toContain("cowork-slot:news-scout:20260520T140000Z");
  });

  it("each lock row has all required fields", () => {
    const result = listHeldTasks({ kind: "sprint-task" });
    const lock = result.locks[0]!;
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

// ---------------------------------------------------------------------------
// AC-8: P1-FINAL SESSION ISOLATION
//
// Replaced FIX-CWK-LEADER-LOCK-REBIND tests (owner_agent fallback).
// After P1-FINAL, owner_agent fallback is REMOVED.
// The same owner_agent with a DIFFERENT owner_client_session CANNOT renew
// or release another session's lock. TTL expiry + task_force_release_orphan
// are the recovery paths.
//
// 4 required cases:
//   (1) correct session heartbeats → ok=true (baseline)
//   (2) different session CANNOT heartbeat (SAME owner_agent, DIFFERENT client_session → ok=false)
//   (3) different session CANNOT release ({ok:true, released:0} no-op)
//   (4) TTL-expiry steal still works for any agent → claimed=true stolen=true
// ---------------------------------------------------------------------------

describe("AC-8: P1-FINAL SESSION ISOLATION — different sessions cannot cross-operate", () => {
  it("(1) correct session heartbeats → ok=true (baseline)", () => {
    const taskId = "cowork-leader";

    claimTask({
      task_id: taskId,
      task_kind: "cowork-slot",
      owner_session: "pid-1234-ts-1748000000000",
      owner_agent: "cowork-team",
      owner_client_session: "client-session-original",
      ttl_seconds: 900,
    });

    // Same session → heartbeat succeeds
    const hbResult = heartbeatTask(taskId, "client-session-original");
    expect(hbResult.ok).toBe(true);
    expect(hbResult.expires_at).toBeGreaterThan(0);
  });

  it("(2) different session CANNOT heartbeat, even same owner_agent → ok=false (P1-FINAL anti-theft)", () => {
    const taskId = "cowork-leader-hb";

    claimTask({
      task_id: taskId,
      task_kind: "cowork-slot",
      owner_session: "pid-1234-ts-1748000000000",
      owner_agent: "cowork-team",
      owner_client_session: "client-session-original",
      ttl_seconds: 900,
    });

    // Different client session (simulates a new Claude Code terminal) — same agent, different session
    // P1-FINAL: NO fallback to owner_agent; this must fail.
    const hbResult = heartbeatTask(taskId, "client-session-new-terminal");
    expect(hbResult.ok).toBe(false);
    expect(hbResult.expires_at).toBe(0);

    // Lock still held by original session
    const row = getRow(testDb, taskId);
    expect(row!["owner_client_session"]).toBe("client-session-original");
  });

  it("(3) different session CANNOT release → {ok:true, released:0} (no-op, anti-theft)", () => {
    const taskId = "cowork-leader-rel";

    claimTask({
      task_id: taskId,
      task_kind: "cowork-slot",
      owner_session: "pid-1234-ts-1748000000000",
      owner_agent: "cowork-team",
      owner_client_session: "client-session-original",
      ttl_seconds: 900,
    });

    // Different session tries to release — P1-FINAL: clean no-op
    const relResult = releaseTask(taskId, "client-session-intruder");
    expect(relResult.ok).toBe(true);
    expect((relResult as { released?: number }).released).toBe(0);

    // Lock still exists — owned by original session
    const row = getRow(testDb, taskId);
    expect(row).not.toBeNull();
    expect(row!["owner_client_session"]).toBe("client-session-original");
  });

  it("(4) TTL-expiry steal still works — any session can steal after lock expires", () => {
    const taskId = "cowork-leader-steal";

    // Original session claims
    claimTask({
      task_id: taskId,
      task_kind: "cowork-slot",
      owner_session: "pid-1234-ts-1748000000000",
      owner_agent: "cowork-team",
      owner_client_session: "client-session-original",
      ttl_seconds: 900,
    });

    // TTL expires (simulate)
    manipulateExpiry(testDb, taskId, 1000);

    // New session steals via task_claim (TTL-expiry steal path)
    const stealResult = claimTask({
      task_id: taskId,
      task_kind: "cowork-slot",
      owner_session: "pid-9999-ts-1748100000000",
      owner_agent: "cowork-team",
      owner_client_session: "client-session-new",
      ttl_seconds: 900,
    });

    expect(stealResult.claimed).toBe(true);
    expect((stealResult as { stolen?: boolean }).stolen).toBe(true);

    // Verify new session is recorded
    const row = getRow(testDb, taskId);
    expect(row!["owner_client_session"]).toBe("client-session-new");
  });
});

// ---------------------------------------------------------------------------
// AC-10: P1-FINAL owner_client_session — stored, returned in current_holder, strict matching
//
// Cases (1)(2)(3)(5)(6)(7) still valid.
// Cases (4) and (8) REMOVED — pre-P1 NULL-row owner_agent fallback is gone (P1-FINAL).
// ---------------------------------------------------------------------------

describe("AC-10: P1-FINAL — owner_client_session strict matching", () => {
  it("(1) claimTask with owner_client_session stores it in DB and returns it in current_holder on collision", () => {
    const taskId = "task:p1-mcp2-1";

    // First claim with owner_client_session
    const r1 = claimTask({
      task_id: taskId,
      task_kind: "sprint-task",
      owner_session: "sess-pid-A",
      owner_agent: "dev-team",
      owner_client_session: "uuid-session-aaa-111",
      ttl_seconds: 3600,
    });
    expect(r1.claimed).toBe(true);

    // Verify DB row has owner_client_session
    const row = getRow(testDb, taskId);
    expect(row!["owner_client_session"]).toBe("uuid-session-aaa-111");

    // Second claim returns current_holder with owner_client_session
    const r2 = claimTask({
      task_id: taskId,
      task_kind: "sprint-task",
      owner_session: "sess-pid-B",
      owner_agent: "dev-team",
      owner_client_session: "uuid-session-bbb-222",
      ttl_seconds: 3600,
    });
    expect(r2.claimed).toBe(false);
    const holder = (r2 as { current_holder?: Record<string, unknown> }).current_holder;
    expect(holder).not.toBeUndefined();
    expect(holder!["owner_client_session"]).toBe("uuid-session-aaa-111");
  });

  it("(2) heartbeatTask with correct owner_client_session → ok=true", () => {
    const taskId = "task:p1-mcp2-hb-correct";

    claimTask({
      task_id: taskId,
      task_kind: "sprint-task",
      owner_session: "sess-A",
      owner_agent: "dev-team",
      owner_client_session: "uuid-session-correct",
      ttl_seconds: 3600,
    });

    // P1-FINAL: only 2 params
    const result = heartbeatTask(taskId, "uuid-session-correct");
    expect(result.ok).toBe(true);
    expect(result.expires_at).toBeGreaterThan(0);
  });

  it("(3) heartbeatTask with wrong owner_client_session → ok=false (anti-theft)", () => {
    const taskId = "task:p1-mcp2-hb-wrong";

    claimTask({
      task_id: taskId,
      task_kind: "sprint-task",
      owner_session: "sess-A",
      owner_agent: "dev-team",
      owner_client_session: "uuid-session-aaa",
      ttl_seconds: 3600,
    });

    // Heartbeat with wrong client session → ok=false (different session cannot renew)
    const result = heartbeatTask(taskId, "uuid-session-bbb");
    expect(result.ok).toBe(false);
    expect(result.expires_at).toBe(0);

    // Lock untouched
    const row = getRow(testDb, taskId);
    expect(row!["owner_client_session"]).toBe("uuid-session-aaa");
  });

  it("(5) releaseTask with correct owner_client_session → {ok:true, released:1}", () => {
    const taskId = "task:p1-mcp2-rel-correct";

    claimTask({
      task_id: taskId,
      task_kind: "sprint-task",
      owner_session: "sess-A",
      owner_agent: "dev-team",
      owner_client_session: "uuid-session-owner",
      ttl_seconds: 3600,
    });

    // P1-FINAL: only 2 params
    const result = releaseTask(taskId, "uuid-session-owner");
    expect(result.ok).toBe(true);
    expect((result as { released?: number }).released).toBe(1);

    // Row deleted
    const row = getRow(testDb, taskId);
    expect(row).toBeNull();
  });

  it("(6) releaseTask with wrong owner_client_session → {ok:true, released:0} (no-op, anti-theft)", () => {
    const taskId = "task:p1-mcp2-rel-wrong";

    claimTask({
      task_id: taskId,
      task_kind: "sprint-task",
      owner_session: "sess-A",
      owner_agent: "dev-team",
      owner_client_session: "uuid-session-aaa",
      ttl_seconds: 3600,
    });

    // Wrong session tries to release — clean no-op, not an error
    const result = releaseTask(taskId, "uuid-session-bbb");
    expect(result.ok).toBe(true);
    expect((result as { released?: number }).released).toBe(0);

    // Row still exists
    const row = getRow(testDb, taskId);
    expect(row).not.toBeNull();
    expect(row!["owner_client_session"]).toBe("uuid-session-aaa");
  });

  it("(7) two concurrent claims with distinct owner_client_session — only one wins", () => {
    const taskId = "task:p1-mcp2-race";

    const r1 = claimTask({
      task_id: taskId,
      task_kind: "sprint-task",
      owner_session: "sess-A",
      owner_agent: "dev-team",
      owner_client_session: "uuid-session-aaa-111",
      ttl_seconds: 3600,
    });
    expect(r1.claimed).toBe(true);

    const r2 = claimTask({
      task_id: taskId,
      task_kind: "sprint-task",
      owner_session: "sess-B",
      owner_agent: "dev-team",
      owner_client_session: "uuid-session-bbb-222",
      ttl_seconds: 3600,
    });
    expect(r2.claimed).toBe(false);

    // Loser gets the winner's owner_client_session in current_holder
    const holder = (r2 as { current_holder?: Record<string, unknown> }).current_holder;
    expect(holder!["owner_client_session"]).toBe("uuid-session-aaa-111");
  });
});
