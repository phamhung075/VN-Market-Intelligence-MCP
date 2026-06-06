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
 *   AC-5: Heartbeat extends expires_at and validates owner_agent match
 *         (FIX-CWK-LEADER-LOCK-REBIND: same owner_agent succeeds across session change)
 *   AC-6: Release scoped to owner_agent — different agent cannot release
 *         (FIX-CWK-LEADER-LOCK-REBIND: same owner_agent succeeds across session change)
 *   AC-7: List filtered by kind / agent / expired
 *   AC-8: FIX-CWK-LEADER-LOCK-REBIND — cross-restart heartbeat/release by same agent
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
// AC-5: Heartbeat extends expires_at + validates owner_agent
// FIX-CWK-LEADER-LOCK-REBIND: heartbeat matches owner_agent (stable across
// server restarts), not owner_session (changes on every boot).
// ---------------------------------------------------------------------------

describe("AC-5: Heartbeat protocol", () => {
  it("heartbeat by owner_agent extends expires_at and returns ok=true", () => {
    const taskId = "task:1955a";

    claimTask({
      task_id: taskId,
      task_kind: "sprint-task",
      owner_session: "session-A",
      owner_agent: "dev-mcp-server",
      ttl_seconds: 3600,
    });

    const rowBefore = getRow(testDb, taskId) as { expires_at: number };
    // Pass owner_agent (not owner_session) — fix: stable across restarts
    const hbResult = heartbeatTask(taskId, "dev-mcp-server");

    expect(hbResult.ok).toBe(true);
    expect(hbResult.expires_at).toBeGreaterThanOrEqual(rowBefore.expires_at);
  });

  it("heartbeat by wrong owner_agent returns ok=false (anti-theft preserved)", () => {
    const taskId = "task:1955b";

    claimTask({
      task_id: taskId,
      task_kind: "sprint-task",
      owner_session: "session-A",
      owner_agent: "dev-mcp-server",
      ttl_seconds: 3600,
    });

    // Different agent tries to heartbeat — must fail (anti-theft)
    const hbResult = heartbeatTask(taskId, "cowork-team");
    expect(hbResult.ok).toBe(false);
    expect(hbResult.expires_at).toBe(0);

    // Original lock untouched
    const row = getRow(testDb, taskId);
    expect(row!["owner_agent"]).toBe("dev-mcp-server");
  });

  it("heartbeat on non-existent task_id returns ok=false", () => {
    const result = heartbeatTask("task:does-not-exist", "dev-mcp-server");
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
      ttl_seconds: 3600,
    });

    // Simulate TTL expiry
    manipulateExpiry(testDb, taskId, 1000);

    // Same agent tries to heartbeat expired lock — must fail so steal path kicks in
    const hbResult = heartbeatTask(taskId, "dev-mcp-server");
    expect(hbResult.ok).toBe(false);
    expect(hbResult.expires_at).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// AC-6: Release scoped to owner_agent
// FIX-CWK-LEADER-LOCK-REBIND: release matches owner_agent (stable across
// server restarts), not owner_session (changes on every boot).
// ---------------------------------------------------------------------------

describe("AC-6: Release scoped to owner_agent", () => {
  it("owner can release their own lock by owner_agent", () => {
    const taskId = "cowork-slot:news-scout:20260520T150000Z";

    claimTask({
      task_id: taskId,
      task_kind: "cowork-slot",
      owner_session: "session-A",
      owner_agent: "cowork-team",
      ttl_seconds: 900,
    });

    // Pass owner_agent (not owner_session) — fix: stable across restarts
    const releaseResult = releaseTask(taskId, "cowork-team");
    expect(releaseResult.ok).toBe(true);

    const row = getRow(testDb, taskId);
    expect(row).toBeNull(); // row deleted
  });

  it("different owner_agent cannot release another agent's lock (anti-theft)", () => {
    const taskId = "cowork-slot:news-scout:20260520T160000Z";

    claimTask({
      task_id: taskId,
      task_kind: "cowork-slot",
      owner_session: "session-A",
      owner_agent: "cowork-team",
      ttl_seconds: 900,
    });

    // Different agent tries to release — must fail (anti-theft preserved)
    const releaseResult = releaseTask(taskId, "dev-mcp-server");
    expect(releaseResult.ok).toBe(false);

    // Row still exists, still owned by cowork-team
    const row = getRow(testDb, taskId);
    expect(row).not.toBeNull();
    expect(row!["owner_agent"]).toBe("cowork-team");
  });

  it("release on non-existent lock returns ok=false (acceptable)", () => {
    const result = releaseTask("task:does-not-exist", "cowork-team");
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
// AC-8: FIX-CWK-LEADER-LOCK-REBIND — zombie-lock prevention across restarts
//
// Scenario: agent claims lock with session-A. Server restarts → new session
// (session-B). heartbeat and release must still work because they now match
// on owner_agent (stable), not owner_session (changed).
//
// 4 required cases:
//   (1) same owner_agent heartbeats after session change → ok=true
//   (2) same owner_agent releases after session change → ok=true
//   (3) different owner_agent is still rejected → ok=false (anti-theft)
//   (4) TTL-expiry steal still works for any agent → claimed=true stolen=true
// ---------------------------------------------------------------------------

describe("AC-8: FIX-CWK-LEADER-LOCK-REBIND — survive server restart", () => {
  it("(1) same owner_agent can heartbeat after server restart (session change)", () => {
    const taskId = "cowork-leader";

    // Claim with the OLD session (pre-restart)
    claimTask({
      task_id: taskId,
      task_kind: "cowork-slot",
      owner_session: "pid-1234-ts-1748000000000", // old boot session
      owner_agent: "cowork-team",
      ttl_seconds: 900,
    });

    // Simulate server restart: new session id would be different
    // but heartbeat now uses owner_agent, so it still succeeds
    const hbResult = heartbeatTask(taskId, "cowork-team"); // same agent, new session context
    expect(hbResult.ok).toBe(true);
    expect(hbResult.expires_at).toBeGreaterThan(0);
  });

  it("(2) same owner_agent can release after server restart (session change)", () => {
    const taskId = "cowork-leader-rel";

    // Claim with the OLD session (pre-restart)
    claimTask({
      task_id: taskId,
      task_kind: "cowork-slot",
      owner_session: "pid-1234-ts-1748000000000", // old boot session
      owner_agent: "cowork-team",
      ttl_seconds: 900,
    });

    // Simulate server restart: release now uses owner_agent, still succeeds
    const relResult = releaseTask(taskId, "cowork-team"); // same agent, new session context
    expect(relResult.ok).toBe(true);

    const row = getRow(testDb, taskId);
    expect(row).toBeNull(); // lock is gone
  });

  it("(3) different owner_agent is still rejected by heartbeat and release (anti-theft)", () => {
    const taskId = "cowork-leader-theft";

    claimTask({
      task_id: taskId,
      task_kind: "cowork-slot",
      owner_session: "pid-1234-ts-1748000000000",
      owner_agent: "cowork-team",
      ttl_seconds: 900,
    });

    // A completely different agent tries to heartbeat — must fail
    const hbResult = heartbeatTask(taskId, "dev-mcp-server");
    expect(hbResult.ok).toBe(false);

    // A completely different agent tries to release — must fail
    const relResult = releaseTask(taskId, "dev-mcp-server");
    expect(relResult.ok).toBe(false);

    // Lock still held by cowork-team
    const row = getRow(testDb, taskId);
    expect(row).not.toBeNull();
    expect(row!["owner_agent"]).toBe("cowork-team");
  });

  it("(4) TTL-expiry steal still works — any agent can steal after lock expires", () => {
    const taskId = "cowork-leader-steal";

    // cowork-team claims (pre-restart session)
    claimTask({
      task_id: taskId,
      task_kind: "cowork-slot",
      owner_session: "pid-1234-ts-1748000000000",
      owner_agent: "cowork-team",
      ttl_seconds: 900,
    });

    // TTL expires (simulate)
    manipulateExpiry(testDb, taskId, 1000);

    // Another agent OR same agent (new server instance) steals via task_claim
    const stealResult = claimTask({
      task_id: taskId,
      task_kind: "cowork-slot",
      owner_session: "pid-9999-ts-1748100000000", // new boot session
      owner_agent: "cowork-team",                  // same logical agent
      ttl_seconds: 900,
    });

    expect(stealResult.claimed).toBe(true);
    expect((stealResult as { stolen?: boolean }).stolen).toBe(true);

    // Verify new session is recorded
    const row = getRow(testDb, taskId);
    expect(row!["owner_session"]).toBe("pid-9999-ts-1748100000000");
  });
});

// ---------------------------------------------------------------------------
// AC-9: Legacy path (no owner_agent) — backward-compat + zombie documentation
//
// Cases:
//   (5) legacy heartbeat/release WITHOUT owner_agent, same session → ok=true
//       (old behavior preserved: session-match path still works within same process)
//   (6) legacy call without owner_agent after session change → ok=false
//       (zombie path intentionally not silently fixed — documents the deprecated path)
// ---------------------------------------------------------------------------

describe("AC-9: Legacy path — no owner_agent, session-match fallback", () => {
  it("(5) legacy heartbeat without owner_agent, same session → ok=true (old behavior preserved)", () => {
    const taskId = "cowork-slot:legacy-hb:20260606T000000Z";
    const session = "pid-8888-ts-1748200000000";

    claimTask({
      task_id: taskId,
      task_kind: "cowork-slot",
      owner_session: session,
      owner_agent: "cowork-team",
      ttl_seconds: 900,
    });

    // Call without owner_agent, but pass session as owner_session fallback
    // (simulates: tool layer receives no owner_agent from caller → passes SERVER_SESSION_ID)
    const hbResult = heartbeatTask(taskId, undefined, session);
    expect(hbResult.ok).toBe(true);
    expect(hbResult.expires_at).toBeGreaterThan(0);
  });

  it("(5) legacy release without owner_agent, same session → ok=true (old behavior preserved)", () => {
    const taskId = "cowork-slot:legacy-rel:20260606T000000Z";
    const session = "pid-8888-ts-1748200000000";

    claimTask({
      task_id: taskId,
      task_kind: "cowork-slot",
      owner_session: session,
      owner_agent: "cowork-team",
      ttl_seconds: 900,
    });

    // Call without owner_agent, same session → should release
    const relResult = releaseTask(taskId, undefined, session);
    expect(relResult.ok).toBe(true);

    const row = getRow(testDb, taskId);
    expect(row).toBeNull(); // lock released
  });

  it("(6) legacy heartbeat without owner_agent, session changed → ok=false (zombie — intentional)", () => {
    const taskId = "cowork-slot:legacy-zombie-hb:20260606T000000Z";
    const oldSession = "pid-1111-ts-1748000000000";
    const newSession = "pid-2222-ts-1748100000000"; // different process after restart

    claimTask({
      task_id: taskId,
      task_kind: "cowork-slot",
      owner_session: oldSession,
      owner_agent: "cowork-team",
      ttl_seconds: 900,
    });

    // New server session tries to heartbeat without owner_agent → session mismatch → zombie
    const hbResult = heartbeatTask(taskId, undefined, newSession);
    expect(hbResult.ok).toBe(false);
    expect(hbResult.expires_at).toBe(0);

    // Lock still held by old session — lock is now a zombie (no one can renew it without owner_agent)
    const row = getRow(testDb, taskId);
    expect(row).not.toBeNull();
    expect(row!["owner_session"]).toBe(oldSession);
  });

  it("(6) legacy release without owner_agent, session changed → ok=false (zombie — intentional)", () => {
    const taskId = "cowork-slot:legacy-zombie-rel:20260606T000000Z";
    const oldSession = "pid-1111-ts-1748000000000";
    const newSession = "pid-2222-ts-1748100000000"; // different process after restart

    claimTask({
      task_id: taskId,
      task_kind: "cowork-slot",
      owner_session: oldSession,
      owner_agent: "cowork-team",
      ttl_seconds: 900,
    });

    // New server session tries to release without owner_agent → session mismatch → zombie
    const relResult = releaseTask(taskId, undefined, newSession);
    expect(relResult.ok).toBe(false);

    // Lock still exists, not released — must wait for TTL or use task_force_release_orphan
    const row = getRow(testDb, taskId);
    expect(row).not.toBeNull();
    expect(row!["owner_agent"]).toBe("cowork-team");
  });
});
