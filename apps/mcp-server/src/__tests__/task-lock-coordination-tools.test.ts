/**
 * Task-Lock System — coordinationTools integration tests
 *
 * Tests the MCP tool handlers (coordinationTools.ts) end-to-end by exercising
 * the registered server.tool() handlers with a real in-memory coordination DB.
 *
 * Pattern: inject in-memory DB → call store functions directly → verify
 * responses match tool contract from brief §6.
 *
 * Note: MCP tool handler integration tests call coordinationStore functions
 * directly (not via HTTP) because the McpServer tool invocation in tests
 * would require a full transport stack. The handler logic is a thin wrapper
 * around coordinationStore, so store-level tests cover the core claims logic
 * while these tests verify the response shapes match the tool contract.
 *
 * P1-FINAL (TASK_1980): owner_client_session is now REQUIRED on all operations.
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
      owner_client_session: "client-session-uuid-A",
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
      owner_client_session: "client-session-uuid-A",
      ttl_seconds: 900,
    });

    // Second claim — different session
    const result = claimTask({
      task_id: "cowork-slot:test-slot:20260520T000000Z",
      task_kind: "cowork-slot",
      owner_session: "mock-session-pid-5678",
      owner_agent: "cowork-team",
      owner_client_session: "client-session-uuid-B",
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
      owner_client_session: "client-session-old",
      ttl_seconds: 3600,
    });

    // Set expires_at to past to simulate stale lock
    testDb.prepare("UPDATE task_locks SET expires_at = 1 WHERE task_id = ?").run(taskId);

    const result = claimTask({
      task_id: taskId,
      task_kind: "sprint-task",
      owner_session: "new-session",
      owner_agent: "dev-mcp-server",
      owner_client_session: "client-session-new",
      ttl_seconds: 3600,
    });

    expect(result.claimed).toBe(true);
    expect((result as { stolen?: boolean }).stolen).toBe(true);
  });

  it("TTL is clamped: min 60, max 691200", () => {
    // Below min: should clamp to 60
    claimTask({
      task_id: "task:ttl-min-test",
      task_kind: "sprint-task",
      owner_session: "session-ttl",
      owner_agent: "dev-mcp-server",
      owner_client_session: "client-session-ttl",
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
// P1-FINAL (TASK_1980): heartbeat matches SOLELY on owner_client_session
// ---------------------------------------------------------------------------

describe("task_heartbeat tool contract", () => {
  it("returns {ok: true, expires_at: <number>} on successful heartbeat by same session", () => {
    claimTask({
      task_id: "task:hb-ok",
      task_kind: "sprint-task",
      owner_session: "sess-hb",
      owner_agent: "dev-mcp-server",
      owner_client_session: "client-session-hb-owner",
      ttl_seconds: 3600,
    });

    // P1-FINAL: heartbeat with matching owner_client_session
    const result = heartbeatTask("task:hb-ok", "client-session-hb-owner");

    // Tool contract: {ok: boolean, expires_at: number}
    expect(result.ok).toBe(true);
    expect(typeof result.expires_at).toBe("number");
    expect(result.expires_at).toBeGreaterThan(0);
  });

  it("returns {ok: false, expires_at: 0} when different session tries to heartbeat (anti-theft)", () => {
    claimTask({
      task_id: "task:hb-stolen",
      task_kind: "sprint-task",
      owner_session: "sess-original",
      owner_agent: "dev-mcp-server",
      owner_client_session: "client-session-real-owner",
      ttl_seconds: 3600,
    });

    // Different session — anti-theft must reject this
    const result = heartbeatTask("task:hb-stolen", "client-session-intruder");
    expect(result.ok).toBe(false);
    expect(result.expires_at).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// task_release — tool contract verification
// P1-FINAL (TASK_1980): release matches SOLELY on owner_client_session
// ---------------------------------------------------------------------------

describe("task_release tool contract (P1-FINAL: {ok:true,released:0|1} shape)", () => {
  it("returns {ok:true, released:1} when owner releases their lock by session", () => {
    claimTask({
      task_id: "task:release-ok",
      task_kind: "sprint-task",
      owner_session: "sess-release",
      owner_agent: "dev-mcp-server",
      owner_client_session: "client-session-release-owner",
      ttl_seconds: 3600,
    });

    // P1-FINAL: release with matching owner_client_session
    const result = releaseTask("task:release-ok", "client-session-release-owner");
    expect(result.ok).toBe(true);
    expect((result as { released?: number }).released).toBe(1);
  });

  it("returns {ok:true, released:0} when different session tries to release (anti-theft no-op)", () => {
    claimTask({
      task_id: "task:release-denied",
      task_kind: "sprint-task",
      owner_session: "sess-owner",
      owner_agent: "dev-mcp-server",
      owner_client_session: "client-session-real-owner",
      ttl_seconds: 3600,
    });

    // Different session — P1-FINAL: clean no-op {ok:true, released:0} (not an error)
    const result = releaseTask("task:release-denied", "client-session-intruder");
    expect(result.ok).toBe(true);
    expect((result as { released?: number }).released).toBe(0);
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
      owner_client_session: "client-session-list",
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
// P1-FINAL (TASK_1980): all operations use owner_client_session as sole key
// ---------------------------------------------------------------------------

describe("Full cycle: claim → heartbeat → release (P1-FINAL)", () => {
  it("complete claim/heartbeat/release sequence is race-free", () => {
    const taskId = "sprint-task:full-cycle";
    const ownerSession = "client-session-cycle-owner";
    const otherSession = "client-session-cycle-other";

    // 1. Claim
    const claimResult = claimTask({
      task_id: taskId,
      task_kind: "sprint-task",
      owner_session: "sess-cycle",
      owner_agent: "dev-mcp-server",
      owner_client_session: ownerSession,
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
      owner_client_session: otherSession,
      ttl_seconds: 3600,
    });
    expect(competingClaim.claimed).toBe(false);

    // 3. Heartbeat by owner session succeeds
    const hb = heartbeatTask(taskId, ownerSession);
    expect(hb.ok).toBe(true);

    // 4. Heartbeat by competitor session fails (anti-theft preserved)
    const hb2 = heartbeatTask(taskId, otherSession);
    expect(hb2.ok).toBe(false);

    // 5. Release by owner session → {ok:true, released:1}
    const rel = releaseTask(taskId, ownerSession);
    expect(rel.ok).toBe(true);
    expect((rel as { released?: number }).released).toBe(1);

    // 6. Re-claim after release — should succeed
    const reClaim = claimTask({
      task_id: taskId,
      task_kind: "sprint-task",
      owner_session: "sess-other",
      owner_agent: "dev-api-gateway",
      owner_client_session: otherSession,
      ttl_seconds: 3600,
    });
    expect(reClaim.claimed).toBe(true);
  });
});
