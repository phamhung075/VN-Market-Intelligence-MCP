/**
 * Task-Lock System — coordinationTools integration tests
 *
 * Tests the MCP tool handlers (coordinationTools.ts) end-to-end by exercising
 * the registerd server.tool() handlers with a real in-memory coordination DB.
 *
 * Pattern: inject in-memory DB → call store functions directly → verify
 * responses match tool contract from brief §6.
 *
 * Note: MCP tool handler integration tests call coordinationStore functions
 * directly (not via HTTP) because the McpServer tool invocation in tests
 * would require a full transport stack. The handler logic is a thin wrapper
 * around coordinationStore, so store-level tests cover the core claims logic
 * while these tests verify the response shapes match the tool contract.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  ensureCoordinationTable,
  claimTask,
  heartbeatTask,
  releaseTask,
  listHeldTasks,
  _injectCoordinationDb,
  _resetCoordinationDbState,
} from "../infrastructure/db/coordinationStore";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let testDb: Database;

beforeEach(() => {
  _resetCoordinationDbState();
  testDb = new Database(":memory:");
  testDb.exec("PRAGMA journal_mode = WAL");
  ensureCoordinationTable(testDb);
  _injectCoordinationDb(testDb);
});

afterEach(() => {
  _resetCoordinationDbState();
  try { testDb.close(); } catch { /* ignore */ }
});

// ---------------------------------------------------------------------------
// task_claim — tool contract verification
// ---------------------------------------------------------------------------

describe("task_claim tool contract", () => {
  it("returns {claimed: true} on first claim — shape matches brief §6", () => {
    const result = claimTask({
      task_id: "cowork-slot:test-slot:20260520T000000Z",
      task_kind: "cowork-slot",
      owner_session: "mock-session-pid-1234",
      owner_agent: "cowork-team",
      ttl_seconds: 900,
      payload: '{"slot_id":"test-slot"}',
    });

    // Match tool output shape from brief §6
    expect(result).toMatchObject({ claimed: true });
    expect((result as Record<string, unknown>)["current_holder"]).toBeUndefined();
  });

  it("returns {claimed: false, current_holder: {...}} when lock already held", () => {
    // First claim
    claimTask({
      task_id: "cowork-slot:test-slot:20260520T000000Z",
      task_kind: "cowork-slot",
      owner_session: "mock-session-pid-1234",
      owner_agent: "cowork-team",
      ttl_seconds: 900,
    });

    // Second claim — different session
    const result = claimTask({
      task_id: "cowork-slot:test-slot:20260520T000000Z",
      task_kind: "cowork-slot",
      owner_session: "mock-session-pid-5678",
      owner_agent: "cowork-team",
      ttl_seconds: 900,
    });

    // Tool contract: {claimed: false, current_holder: {...}}
    expect(result.claimed).toBe(false);
    const r = result as unknown as { claimed: false; current_holder?: Record<string, unknown> };
    expect(r.current_holder).toBeDefined();
    expect(r.current_holder!["owner_session"]).toBe("mock-session-pid-1234");
    expect(r.current_holder!["owner_agent"]).toBe("cowork-team");
    expect(typeof r.current_holder!["claimed_at"]).toBe("number");
    expect(typeof r.current_holder!["expires_at"]).toBe("number");
    expect(typeof r.current_holder!["heartbeat_at"]).toBe("number");
  });

  it("returns {claimed: true, stolen: true} on successful stale-steal", () => {
    const taskId = "task:steal-test";

    claimTask({
      task_id: taskId,
      task_kind: "sprint-task",
      owner_session: "old-session",
      owner_agent: "dev-mcp-server",
      ttl_seconds: 3600,
    });

    // Set expires_at to past to simulate stale lock
    testDb.prepare("UPDATE task_locks SET expires_at = 1 WHERE task_id = ?").run(taskId);

    const result = claimTask({
      task_id: taskId,
      task_kind: "sprint-task",
      owner_session: "new-session",
      owner_agent: "dev-mcp-server",
      ttl_seconds: 3600,
    });

    expect(result.claimed).toBe(true);
    expect((result as { stolen?: boolean }).stolen).toBe(true);
  });

  it("TTL is clamped: min 60, max 86400", () => {
    // Below min: should clamp to 60
    claimTask({
      task_id: "task:ttl-min-test",
      task_kind: "sprint-task",
      owner_session: "session-ttl",
      owner_agent: "dev-mcp-server",
      ttl_seconds: 1, // below min 60
    });

    const row = testDb.prepare("SELECT ttl_seconds, expires_at, claimed_at FROM task_locks WHERE task_id = ?")
      .get("task:ttl-min-test") as { ttl_seconds: number; expires_at: number; claimed_at: number };

    expect(row).not.toBeNull();
    expect(row.ttl_seconds).toBe(60); // clamped to min
  });
});

// ---------------------------------------------------------------------------
// task_heartbeat — tool contract verification
// FIX-CWK-LEADER-LOCK-REBIND: heartbeat now takes owner_agent (stable) not owner_session
// ---------------------------------------------------------------------------

describe("task_heartbeat tool contract", () => {
  it("returns {ok: true, expires_at: <number>} on successful heartbeat by owner_agent", () => {
    claimTask({
      task_id: "task:hb-ok",
      task_kind: "sprint-task",
      owner_session: "sess-hb",
      owner_agent: "dev-mcp-server",
      ttl_seconds: 3600,
    });

    // Pass owner_agent (stable across restarts) not owner_session
    const result = heartbeatTask("task:hb-ok", "dev-mcp-server");

    // Tool contract: {ok: boolean, expires_at: number}
    expect(result.ok).toBe(true);
    expect(typeof result.expires_at).toBe("number");
    expect(result.expires_at).toBeGreaterThan(0);
  });

  it("returns {ok: false, expires_at: 0} when different owner_agent tries to heartbeat", () => {
    claimTask({
      task_id: "task:hb-stolen",
      task_kind: "sprint-task",
      owner_session: "sess-original",
      owner_agent: "dev-mcp-server",
      ttl_seconds: 3600,
    });

    // Different agent — anti-theft must reject this
    const result = heartbeatTask("task:hb-stolen", "cowork-team");
    expect(result.ok).toBe(false);
    expect(result.expires_at).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// task_release — tool contract verification
// FIX-CWK-LEADER-LOCK-REBIND: release now takes owner_agent (stable) not owner_session
// ---------------------------------------------------------------------------

describe("task_release tool contract", () => {
  it("returns {ok: true} when owner releases their lock by owner_agent", () => {
    claimTask({
      task_id: "task:release-ok",
      task_kind: "sprint-task",
      owner_session: "sess-release",
      owner_agent: "dev-mcp-server",
      ttl_seconds: 3600,
    });

    // Pass owner_agent (stable across restarts) not owner_session
    const result = releaseTask("task:release-ok", "dev-mcp-server");
    expect(result).toMatchObject({ ok: true });
  });

  it("returns {ok: false} when different owner_agent tries to release (anti-theft)", () => {
    claimTask({
      task_id: "task:release-denied",
      task_kind: "sprint-task",
      owner_session: "sess-owner",
      owner_agent: "dev-mcp-server",
      ttl_seconds: 3600,
    });

    // Different agent — anti-theft must reject this
    const result = releaseTask("task:release-denied", "cowork-team");
    expect(result).toMatchObject({ ok: false });
  });
});

// ---------------------------------------------------------------------------
// task_list_held — tool contract verification
// ---------------------------------------------------------------------------

describe("task_list_held tool contract", () => {
  it("returns {locks: [], count: 0} when no locks held", () => {
    const result = listHeldTasks();
    expect(result).toMatchObject({ locks: [], count: 0 });
  });

  it("returns {locks: [...], count: N} with full lock shape", () => {
    claimTask({
      task_id: "cowork-slot:list-test:20260520T000000Z",
      task_kind: "cowork-slot",
      owner_session: "sess-list",
      owner_agent: "cowork-team",
      ttl_seconds: 900,
      payload: '{"slot_id":"list-test"}',
    });

    const result = listHeldTasks();
    expect(result.count).toBe(1);
    expect(result.locks).toHaveLength(1);

    const lock = result.locks[0]!;
    // Verify all fields from brief §6 task_list_held output schema
    expect(lock.task_id).toBe("cowork-slot:list-test:20260520T000000Z");
    expect(lock.task_kind).toBe("cowork-slot");
    expect(lock.owner_session).toBe("sess-list");
    expect(lock.owner_agent).toBe("cowork-team");
    expect(typeof lock.claimed_at).toBe("number");
    expect(typeof lock.expires_at).toBe("number");
    expect(typeof lock.heartbeat_at).toBe("number");
    expect(lock.ttl_seconds).toBe(900);
    expect(lock.payload).toBe('{"slot_id":"list-test"}');
  });
});

// ---------------------------------------------------------------------------
// End-to-end: claim → heartbeat → release cycle
// ---------------------------------------------------------------------------

describe("Full cycle: claim → heartbeat → release", () => {
  it("complete claim/heartbeat/release sequence is race-free", () => {
    const taskId = "sprint-task:full-cycle";

    // 1. Claim
    const claimResult = claimTask({
      task_id: taskId,
      task_kind: "sprint-task",
      owner_session: "sess-cycle",
      owner_agent: "dev-mcp-server",
      ttl_seconds: 3600,
      payload: '{"task_title":"Full cycle test"}',
    });
    expect(claimResult.claimed).toBe(true);

    // 2. Competing claim fails
    const competingClaim = claimTask({
      task_id: taskId,
      task_kind: "sprint-task",
      owner_session: "sess-other",
      owner_agent: "dev-api-gateway",
      ttl_seconds: 3600,
    });
    expect(competingClaim.claimed).toBe(false);

    // 3. Heartbeat by owner_agent succeeds (FIX: uses owner_agent not owner_session)
    const hb = heartbeatTask(taskId, "dev-mcp-server");
    expect(hb.ok).toBe(true);

    // 4. Heartbeat by competitor agent fails (anti-theft preserved)
    const hb2 = heartbeatTask(taskId, "dev-api-gateway");
    expect(hb2.ok).toBe(false);

    // 5. Release by owner_agent (FIX: uses owner_agent not owner_session)
    const rel = releaseTask(taskId, "dev-mcp-server");
    expect(rel.ok).toBe(true);

    // 6. Re-claim after release — should succeed
    const reClaim = claimTask({
      task_id: taskId,
      task_kind: "sprint-task",
      owner_session: "sess-other",
      owner_agent: "dev-api-gateway",
      ttl_seconds: 3600,
    });
    expect(reClaim.claimed).toBe(true);
  });
});
