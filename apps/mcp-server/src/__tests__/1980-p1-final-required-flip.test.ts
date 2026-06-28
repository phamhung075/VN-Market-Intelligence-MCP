/**
 * TASK_1980 P1-FINAL — Required-flip acceptance tests
 *
 * Verifies the three DoD acceptance criteria for the P1-FINAL fallback removal:
 *
 *   AC-A: Missing owner_client_session is REJECTED by Zod validation on all 4 tools
 *         (task_claim, task_heartbeat, task_release, task_force_release_orphan)
 *
 *   AC-B: Session-A claims a lock. Session-B (different UUID) CANNOT:
 *         - heartbeat Session-A's lock (heartbeatTask returns ok=false)
 *         - release Session-A's lock (releaseTask returns {ok:true, released:0})
 *
 *   AC-C: Claim mutex holds correctly:
 *         - INSERT OR IGNORE: second claim fails while lock is active
 *         - Stale-steal still works after TTL expiry
 *         - Claim-after-release works (mutex is released)
 *
 * SECURITY: owner_client_session is a coordination key — never echo/log it.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  ensureCoordinationTable,
  claimTask,
  heartbeatTask,
  releaseTask,
  _injectCoordinationDb,
  _resetCoordinationDbState,
} from "../infrastructure/db/coordinationStore";
import { registerCoordinationTools } from "../interface/mcp/tools/system/coordinationTools";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  ensureCoordinationTable(db);
  return db;
}

function manipulateExpiry(db: Database, task_id: string, epochSeconds: number): void {
  db.prepare("UPDATE task_locks SET expires_at = ? WHERE task_id = ?").run(epochSeconds, task_id);
}

/** Call a tool through the real MCP transport stack. Returns parsed JSON content. */
async function callMcpTool(
  client: Client,
  tool: string,
  args: Record<string, unknown>,
): Promise<{ isError?: boolean; content: Array<{ type: string; text?: string }> }> {
  return client.callTool({ name: tool, arguments: args }) as Promise<{
    isError?: boolean;
    content: Array<{ type: string; text?: string }>;
  }>;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let testDb: Database;
let server: McpServer;
let client: Client;

beforeEach(async () => {
  _resetCoordinationDbState();
  testDb = createTestDb();
  _injectCoordinationDb(testDb);

  // Wire up a real McpServer + InMemoryTransport for AC-A (Zod validation tests)
  server = new McpServer({ name: "test-1980", version: "0.0.1" }, { capabilities: { tools: {} } });
  registerCoordinationTools(server);

  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test-client-1980", version: "0.0.1" }, { capabilities: {} });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
});

afterEach(async () => {
  try { await client.close(); } catch { /* ignore */ }
  _resetCoordinationDbState();
  try { testDb.close(); } catch { /* ignore */ }
});

// ---------------------------------------------------------------------------
// AC-A: Missing owner_client_session is REJECTED (Zod validation)
// ---------------------------------------------------------------------------

describe("AC-A: Missing owner_client_session is REJECTED by Zod on all coordination tools", () => {
  it("task_claim without owner_client_session → isError=true", async () => {
    const result = await callMcpTool(client, "task_claim", {
      task_id: "task:1980-ac-a-claim",
      task_kind: "sprint-task",
      owner_agent: "test-agent",
      // owner_client_session: INTENTIONALLY OMITTED
      ttl_seconds: 3600,
    });
    expect(result.isError).toBe(true);
    // Zod validation error message should mention owner_client_session
    const text = result.content[0]?.text ?? "";
    expect(text.toLowerCase()).toMatch(/owner_client_session|invalid|required/);
  });

  it("task_heartbeat without owner_client_session → isError=true", async () => {
    const result = await callMcpTool(client, "task_heartbeat", {
      task_id: "task:1980-ac-a-hb",
      // owner_client_session: INTENTIONALLY OMITTED
    });
    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text.toLowerCase()).toMatch(/owner_client_session|invalid|required/);
  });

  it("task_release without owner_client_session → isError=true", async () => {
    const result = await callMcpTool(client, "task_release", {
      task_id: "task:1980-ac-a-release",
      // owner_client_session: INTENTIONALLY OMITTED
    });
    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text.toLowerCase()).toMatch(/owner_client_session|invalid|required/);
  });

  it("task_force_release_orphan without owner_client_session → isError=true", async () => {
    const result = await callMcpTool(client, "task_force_release_orphan", {
      task_id: "task:1980-ac-a-orphan",
      // owner_client_session: INTENTIONALLY OMITTED
    });
    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text.toLowerCase()).toMatch(/owner_client_session|invalid|required/);
  });

  it("task_claim WITH owner_client_session → isError falsy (validation passes)", async () => {
    const result = await callMcpTool(client, "task_claim", {
      task_id: "task:1980-ac-a-valid",
      task_kind: "sprint-task",
      owner_agent: "test-agent",
      owner_client_session: "valid-session-uuid-AC-A",
      ttl_seconds: 3600,
    });
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0]?.text ?? "{}") as { claimed?: boolean };
    expect(parsed.claimed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AC-B: Session-A claims → Session-B CANNOT heartbeat or release Session-A's lock
// ---------------------------------------------------------------------------

describe("AC-B: Session-B cannot steal Session-A's lock via heartbeat or release", () => {
  const SESSION_A = "session-uuid-AC-B-owner";
  const SESSION_B = "session-uuid-AC-B-intruder";
  const TASK_ID = "task:1980-ac-b-isolation";

  beforeEach(() => {
    // Session-A claims the lock
    const r = claimTask({
      task_id: TASK_ID,
      task_kind: "sprint-task",
      owner_session: "srv-sess-A",
      owner_agent: "dev-team",
      owner_client_session: SESSION_A,
      ttl_seconds: 3600,
    });
    expect(r.claimed).toBe(true);
  });

  it("Session-B CANNOT heartbeat Session-A's lock (ok=false, anti-theft)", () => {
    const result = heartbeatTask(TASK_ID, SESSION_B);
    expect(result.ok).toBe(false);
    expect(result.expires_at).toBe(0);
  });

  it("Session-A CAN still heartbeat its own lock (ok=true, ownership verified)", () => {
    const result = heartbeatTask(TASK_ID, SESSION_A);
    expect(result.ok).toBe(true);
    expect(result.expires_at).toBeGreaterThan(0);
  });

  it("Session-B CANNOT release Session-A's lock ({ok:true, released:0})", () => {
    const result = releaseTask(TASK_ID, SESSION_B);
    expect(result.ok).toBe(true);
    expect((result as { released?: number }).released).toBe(0);

    // Lock still held by Session-A
    const row = testDb.prepare("SELECT * FROM task_locks WHERE task_id = ?").get(TASK_ID) as Record<string, unknown> | null;
    expect(row).not.toBeNull();
    expect(row!["owner_client_session"]).toBe(SESSION_A);
  });

  it("Session-A CAN release its own lock ({ok:true, released:1})", () => {
    const result = releaseTask(TASK_ID, SESSION_A);
    expect(result.ok).toBe(true);
    expect((result as { released?: number }).released).toBe(1);

    // Lock gone
    const row = testDb.prepare("SELECT * FROM task_locks WHERE task_id = ?").get(TASK_ID) as Record<string, unknown> | null;
    expect(row).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AC-C: Claim mutex correctness
// ---------------------------------------------------------------------------

describe("AC-C: Claim mutex holds (INSERT OR IGNORE + stale-steal + release)", () => {
  it("INSERT OR IGNORE: second simultaneous claim from different session fails", () => {
    const TASK_ID = "task:1980-ac-c-mutex";

    const r1 = claimTask({
      task_id: TASK_ID,
      task_kind: "sprint-task",
      owner_session: "srv-A",
      owner_agent: "dev-team",
      owner_client_session: "session-winner",
      ttl_seconds: 3600,
    });
    expect(r1.claimed).toBe(true);

    const r2 = claimTask({
      task_id: TASK_ID,
      task_kind: "sprint-task",
      owner_session: "srv-B",
      owner_agent: "dev-team",
      owner_client_session: "session-loser",
      ttl_seconds: 3600,
    });
    expect(r2.claimed).toBe(false);

    // Winner's session is in current_holder
    const holder = (r2 as { current_holder?: Record<string, unknown> }).current_holder;
    expect(holder!["owner_client_session"]).toBe("session-winner");
  });

  it("Stale-steal: second claim succeeds after TTL expiry (stale-steal path)", () => {
    const TASK_ID = "task:1980-ac-c-steal";

    claimTask({
      task_id: TASK_ID,
      task_kind: "sprint-task",
      owner_session: "srv-A",
      owner_agent: "dev-team",
      owner_client_session: "session-old",
      ttl_seconds: 3600,
    });

    // Simulate expiry
    manipulateExpiry(testDb, TASK_ID, 1000);

    const r2 = claimTask({
      task_id: TASK_ID,
      task_kind: "sprint-task",
      owner_session: "srv-B",
      owner_agent: "dev-team",
      owner_client_session: "session-new",
      ttl_seconds: 3600,
    });
    expect(r2.claimed).toBe(true);
    expect((r2 as { stolen?: boolean }).stolen).toBe(true);

    // New session is now the owner
    const row = testDb.prepare("SELECT * FROM task_locks WHERE task_id = ?").get(TASK_ID) as Record<string, unknown> | null;
    expect(row!["owner_client_session"]).toBe("session-new");
  });

  it("Claim-after-release: third session claims successfully after owner releases", () => {
    const TASK_ID = "task:1980-ac-c-release-reclaim";
    const SESSION_OWNER = "session-owner-AC-C";
    const SESSION_NEXT = "session-next-AC-C";

    // Owner claims
    const r1 = claimTask({
      task_id: TASK_ID,
      task_kind: "sprint-task",
      owner_session: "srv-A",
      owner_agent: "dev-team",
      owner_client_session: SESSION_OWNER,
      ttl_seconds: 3600,
    });
    expect(r1.claimed).toBe(true);

    // Owner releases
    const rel = releaseTask(TASK_ID, SESSION_OWNER);
    expect(rel.ok).toBe(true);
    expect((rel as { released?: number }).released).toBe(1);

    // Next session claims successfully
    const r2 = claimTask({
      task_id: TASK_ID,
      task_kind: "sprint-task",
      owner_session: "srv-C",
      owner_agent: "dev-team",
      owner_client_session: SESSION_NEXT,
      ttl_seconds: 3600,
    });
    expect(r2.claimed).toBe(true);
    // Not a steal (the lock was properly released)
    expect((r2 as { stolen?: boolean }).stolen).toBeUndefined();
  });
});
