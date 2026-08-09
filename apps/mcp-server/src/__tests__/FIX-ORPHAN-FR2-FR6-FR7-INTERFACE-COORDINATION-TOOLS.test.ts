/**
 * FIX-ORPHAN-FR2-FR6-FR7-INTERFACE-COORDINATION-TOOLS.test.ts
 *
 * Sprint: FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD (fix_spec(a)+(c)/AC1+AC3)
 * Task: FIX-ORPHAN-FR2-FR6-FR7-INTERFACE-COORDINATION-TOOLS (PM decomposition Task 2)
 * depends_on: FIX-ORPHAN-FR1-FR2-INFRA-HEARTBEAT-LADDER (DONE_VERIFIED — backend heartbeatTask/
 * releaseTask already accept the options this task exposes at the MCP tool boundary).
 *
 * Scope: `coordinationTools.ts` interface layer only — the `task_heartbeat`/`task_release`
 * Zod schemas + their handler pass-through to the (already-implemented) store functions.
 * Store-level FR-1/FR-2 behavior itself is covered by `infrastructure/__tests__/coordinationStore.test.ts`
 * (H1-H5/L1-L3/N1/R1-R2/N2) — NOT duplicated here.
 *
 * Tests:
 *   S1-S4  — task_heartbeat Zod schema accepts/rejects ttl_seconds/payload_patch/owner_agent/
 *            original_owner_client_session per subtask 1-3 acceptance criteria
 *   S5-S6  — task_release Zod schema accepts owner_agent/original_owner_client_session, backward compat
 *   W1-W3  — task_heartbeat handler forwards options through to heartbeatTask (ttl_seconds persists,
 *            payload_patch merges, null-session ladder fires)
 *   W4-W5  — task_release handler forwards options through to releaseTask (null-session ladder fires,
 *            backward-compat live-session release unaffected)
 *   NFR-2  — omitting all new params reproduces pre-Task-2 behavior byte-identically (existing call sites)
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z, type ZodTypeAny } from "zod";
import { registerCoordinationTools } from "../interface/mcp/tools/system/coordinationTools.js";
import {
  ensureCoordinationTable,
  claimTask,
  _injectCoordinationDb,
  _resetCoordinationDbState,
} from "../infrastructure/db/coordinationStore.js";

// ---------------------------------------------------------------------------
// Setup — real McpServer instance, real in-memory DB, tool registry introspection
// ---------------------------------------------------------------------------

let db: Database;
let server: McpServer;

type ToolEntry = {
  inputSchema: ZodTypeAny;
  handler: (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }> }>;
};

function getTool(name: string): ToolEntry {
  const registry = (server as unknown as { _registeredTools: Record<string, ToolEntry> })
    ._registeredTools;
  const entry = registry[name];
  if (!entry) throw new Error(`Tool "${name}" not registered`);
  return entry;
}

async function callTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const entry = getTool(name);
  const result = await entry.handler(args);
  const text = result.content[0]?.text;
  if (text === undefined) throw new Error(`Tool "${name}" returned no content`);
  return JSON.parse(text) as Record<string, unknown>;
}

beforeEach(() => {
  _resetCoordinationDbState();
  db = new Database(":memory:");
  ensureCoordinationTable(db);
  _injectCoordinationDb(db);

  server = new McpServer({ name: "test-server", version: "0.0.0" });
  registerCoordinationTools(server);
});

/** Insert a reaper-minted orphan-signal row (owner_client_session=NULL) directly. */
function insertOrphanSignalRow(opts: {
  task_id: string;
  owner_agent: string;
  original_owner_client_session: string | null;
  ttl_seconds?: number;
}): void {
  const ttl = opts.ttl_seconds ?? 7200;
  const payload = JSON.stringify({
    original_task_id: opts.task_id,
    original_task_kind: "sprint-task",
    original_owner_client_session: opts.original_owner_client_session,
    owner_agent: opts.owner_agent,
  });
  db.prepare(`
    INSERT INTO task_locks
      (task_id, task_kind, owner_session, owner_agent, owner_client_session,
       claimed_at, expires_at, heartbeat_at, ttl_seconds, payload, redispatch_count)
    VALUES
      (?, 'orphan-signal', 'server-reaper', ?, NULL, unixepoch('now'), unixepoch('now') + ?, unixepoch('now'), ?, ?, 1)
  `).run(opts.task_id, opts.owner_agent, ttl, ttl, payload);
}

function readRow(task_id: string): { ttl_seconds: number; payload: string | null } | null {
  return db
    .prepare(`SELECT ttl_seconds, payload FROM task_locks WHERE task_id = ?`)
    .get(task_id) as { ttl_seconds: number; payload: string | null } | null;
}

// ---------------------------------------------------------------------------
// task_heartbeat — Zod schema (subtasks 1-3)
// ---------------------------------------------------------------------------

describe("task_heartbeat Zod schema — FR-1/FR-2 optional params (Task 2 subtasks 1-3)", () => {
  it("S1: omitting ttl_seconds/payload_patch/owner_agent/original_owner_client_session is valid (backward compatible)", () => {
    const parsed = getTool("task_heartbeat").inputSchema.safeParse({
      task_id: "task:x",
      owner_client_session: "sess-A",
    });
    expect(parsed.success).toBe(true);
  });

  it("S2: ttl_seconds within bounds (60-691200) is valid; below 60 / above 691200 is rejected", () => {
    const schema = getTool("task_heartbeat").inputSchema;
    expect(schema.safeParse({ task_id: "task:x", owner_client_session: "s", ttl_seconds: 60 }).success).toBe(true);
    expect(schema.safeParse({ task_id: "task:x", owner_client_session: "s", ttl_seconds: 691200 }).success).toBe(true);
    expect(schema.safeParse({ task_id: "task:x", owner_client_session: "s", ttl_seconds: 59 }).success).toBe(false);
    expect(schema.safeParse({ task_id: "task:x", owner_client_session: "s", ttl_seconds: 691201 }).success).toBe(false);
  });

  it("S3: payload_patch accepts a JSON string", () => {
    const parsed = getTool("task_heartbeat").inputSchema.safeParse({
      task_id: "task:x",
      owner_client_session: "sess-A",
      payload_patch: '{"status":"ESCALATED"}',
    });
    expect(parsed.success).toBe(true);
  });

  it("S4: owner_agent + original_owner_client_session accepted together (null-session ladder params)", () => {
    const parsed = getTool("task_heartbeat").inputSchema.safeParse({
      task_id: "task:x",
      owner_client_session: "sess-A",
      owner_agent: "dev-team",
      original_owner_client_session: "dead-sess",
    });
    expect(parsed.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// task_release — Zod schema (subtask 3)
// ---------------------------------------------------------------------------

describe("task_release Zod schema — FR-2 optional params (Task 2 subtask 3)", () => {
  it("S5: omitting owner_agent/original_owner_client_session is valid (backward compatible)", () => {
    const parsed = getTool("task_release").inputSchema.safeParse({
      task_id: "task:x",
      owner_client_session: "sess-A",
    });
    expect(parsed.success).toBe(true);
  });

  it("S6: owner_agent + original_owner_client_session accepted together", () => {
    const parsed = getTool("task_release").inputSchema.safeParse({
      task_id: "task:x",
      owner_client_session: "sess-A",
      owner_agent: "dev-team",
      original_owner_client_session: "dead-sess",
    });
    expect(parsed.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// task_heartbeat handler — options pass-through to heartbeatTask (integration)
// ---------------------------------------------------------------------------

describe("task_heartbeat handler — forwards options to heartbeatTask", () => {
  it("W1: ttl_seconds forwarded — persists new TTL on the live-session row", async () => {
    claimTask({
      task_id: "task:W1",
      task_kind: "sprint-task",
      owner_session: "srv-sess",
      owner_agent: "dev-mcp-server",
      owner_client_session: "client-W1",
      ttl_seconds: 3600,
    });

    const result = await callTool("task_heartbeat", {
      task_id: "task:W1",
      owner_client_session: "client-W1",
      ttl_seconds: 7200,
    });

    expect(result["ok"]).toBe(true);
    expect(readRow("task:W1")?.ttl_seconds).toBe(7200);
  });

  it("W2: payload_patch forwarded — shallow-merges into existing payload", async () => {
    claimTask({
      task_id: "task:W2",
      task_kind: "sprint-task",
      owner_session: "srv-sess",
      owner_agent: "dev-mcp-server",
      owner_client_session: "client-W2",
      ttl_seconds: 3600,
      payload: '{"a":1}',
    });

    const result = await callTool("task_heartbeat", {
      task_id: "task:W2",
      owner_client_session: "client-W2",
      payload_patch: '{"b":2}',
    });

    expect(result["ok"]).toBe(true);
    expect(JSON.parse(readRow("task:W2")!.payload as string)).toEqual({ a: 1, b: 2 });
  });

  it("W3: owner_agent + original_owner_client_session forwarded — null-session ladder fires for orphan-signal rows", async () => {
    insertOrphanSignalRow({
      task_id: "orphan-signal:task:W3",
      owner_agent: "dev-team",
      original_owner_client_session: "dead-sess-1",
    });

    const result = await callTool("task_heartbeat", {
      task_id: "orphan-signal:task:W3",
      owner_client_session: "caller-sess-does-not-match-null-row",
      owner_agent: "dev-team",
      original_owner_client_session: "dead-sess-1",
    });

    expect(result["ok"]).toBe(true);
  });

  it("NFR-2a: omitting all new params reproduces pre-Task-2 behavior for an existing live-session call site", async () => {
    claimTask({
      task_id: "task:NFR2A",
      task_kind: "sprint-task",
      owner_session: "srv-sess",
      owner_agent: "dev-mcp-server",
      owner_client_session: "client-NFR2A",
      ttl_seconds: 3600,
      payload: '{"x":1}',
    });

    const result = await callTool("task_heartbeat", {
      task_id: "task:NFR2A",
      owner_client_session: "client-NFR2A",
    });

    expect(result["ok"]).toBe(true);
    // unchanged ttl_seconds/payload — byte-identical to pre-Task-2 2-arg call shape
    expect(readRow("task:NFR2A")).toEqual({ ttl_seconds: 3600, payload: '{"x":1}' });
  });
});

// ---------------------------------------------------------------------------
// task_release handler — options pass-through to releaseTask (integration)
// ---------------------------------------------------------------------------

describe("task_release handler — forwards options to releaseTask", () => {
  it("W4: owner_agent + original_owner_client_session forwarded — null-session ladder releases orphan-signal row", async () => {
    insertOrphanSignalRow({
      task_id: "orphan-signal:task:W4",
      owner_agent: "dev-team",
      original_owner_client_session: "dead-sess-1",
    });

    const result = await callTool("task_release", {
      task_id: "orphan-signal:task:W4",
      owner_client_session: "caller-sess-does-not-match-null-row",
      owner_agent: "dev-team",
      original_owner_client_session: "dead-sess-1",
    });

    expect(result).toEqual({ ok: true, released: 1 });
    expect(readRow("orphan-signal:task:W4")).toBeNull();
  });

  it("NFR-2b: omitting owner_agent/original_owner_client_session reproduces pre-Task-2 behavior for an existing live-session call site", async () => {
    claimTask({
      task_id: "task:NFR2B",
      task_kind: "sprint-task",
      owner_session: "srv-sess",
      owner_agent: "dev-mcp-server",
      owner_client_session: "client-NFR2B",
      ttl_seconds: 3600,
    });

    const result = await callTool("task_release", {
      task_id: "task:NFR2B",
      owner_client_session: "client-NFR2B",
    });

    expect(result).toEqual({ ok: true, released: 1 });
  });

  it("W5: wrong-session release attempt on a live-session row is still rejected (owner_agent/echo cannot bypass Rung A)", async () => {
    claimTask({
      task_id: "task:W5",
      task_kind: "sprint-task",
      owner_session: "srv-sess",
      owner_agent: "dev-team",
      owner_client_session: "real-owner-sess",
      ttl_seconds: 3600,
    });

    const result = await callTool("task_release", {
      task_id: "task:W5",
      owner_client_session: "intruder-sess",
      owner_agent: "dev-team",
      original_owner_client_session: "real-owner-sess",
    });

    // NFR-1: ladder only ever matches rows whose OWN owner_client_session column is NULL —
    // this row is live-session, so the ladder must not fire even though owner_agent/echo "match".
    expect(result).toEqual({ ok: true, released: 0 });
  });
});
