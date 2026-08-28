/**
 * task_claim / task_heartbeat — payload union (object OR string) tests
 *
 * FIX-DISPATCHCLAIM-CARD-PAYLOAD-OBJECT-REJECTED-AND-PHASEA-OMITS-OWNER-AGENT (P1, task_claim
 * half) + family-consistency companion on task_heartbeat.payload_patch.
 *
 * Root cause fixed: `task_claim.payload` (and `task_heartbeat.payload_patch`) were
 * `z.string().optional()` — a caller passing a plain object literal (as ~21 fleet doc/flow
 * files already did) was silently rejected by Zod at the tool boundary. Widened to
 * `z.union([z.string(), z.record(z.unknown())]).optional()`; the handler serializes an object
 * to JSON at the boundary so the TEXT-column storage format (coordinationStore.ts) is
 * completely unchanged — every downstream consumer (parseJsonObject) still only ever sees a
 * JSON string.
 *
 * Two test layers, matching how this MCP SDK version validates tool input:
 *   1. Schema-level: the MCP SDK's `setRequestHandler(CallToolRequestSchema, ...)` runs
 *      `tool.inputSchema.safeParse(args)` BEFORE the registered callback ever runs (see
 *      node_modules/@modelcontextprotocol/sdk/dist/cjs/server/mcp.js `validateToolInput`).
 *      `server._registeredTools[name].inputSchema` is the real z.object(...) instance built
 *      from the raw shape passed to `server.tool()` — safeParse against it directly proves
 *      what a real MCP client call would see, without needing a transport/client stack
 *      (established precedent: `082-tool-watchlist.test.ts`'s `_registeredTools` reach-in).
 *   2. Handler-level round-trip: `entry.handler(args)` (the same reach-in pattern) calls the
 *      registered callback directly with an ALREADY-zod-shaped args object — for a union type,
 *      Zod passes an object or string through unchanged (no coercion), so passing a plain
 *      object here is behaviorally identical to what the callback receives after real Zod
 *      validation. This proves the handler's serialize-at-the-boundary line and the full
 *      claim → task_list_held round trip.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  ensureCoordinationTable,
  _injectCoordinationDb,
  _resetCoordinationDbState,
} from "../infrastructure/db/coordinationStore";
import { registerTaskClaimTool } from "../interface/mcp/tools/system/coordination/taskClaimTool";
import { registerTaskHeartbeatTool } from "../interface/mcp/tools/system/coordination/taskHeartbeatTool";
import { registerTaskListHeldTool } from "../interface/mcp/tools/system/coordination/taskListHeldTool";

// ---------------------------------------------------------------------------
// Reach-in helpers (established pattern — see 082-tool-watchlist.test.ts)
// ---------------------------------------------------------------------------

type RegisteredToolEntry = {
  inputSchema: { safeParse: (args: unknown) => { success: boolean } };
  handler: (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }> }>;
};

function getEntry(server: McpServer, toolName: string): RegisteredToolEntry {
  const registry = (server as unknown as { _registeredTools: Record<string, RegisteredToolEntry> })
    ._registeredTools;
  const entry = registry[toolName];
  if (!entry) throw new Error(`Tool "${toolName}" not registered`);
  return entry;
}

async function callTool(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const entry = getEntry(server, toolName);
  const result = await entry.handler(args);
  return JSON.parse(result.content[0]!.text) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let testDb: Database;
let server: McpServer;

beforeEach(() => {
  _resetCoordinationDbState();
  testDb = new Database(":memory:");
  testDb.exec("PRAGMA journal_mode = WAL");
  ensureCoordinationTable(testDb);
  _injectCoordinationDb(testDb);

  server = new McpServer({ name: "test-server", version: "0.0.0" });
  registerTaskClaimTool(server);
  registerTaskHeartbeatTool(server);
  registerTaskListHeldTool(server);
});

afterEach(() => {
  _resetCoordinationDbState();
  try { testDb.close(); } catch { /* ignore */ }
});

// ---------------------------------------------------------------------------
// Preflight probe — detect a leaked mock.module() replacement of
// @modelcontextprotocol/sdk/server/mcp.js. 1862c-transport-session-eviction.test.ts
// documents (its own file header) that Bun's mock.module() ESM replacement
// cannot be undone by mock.restore(), so its harmless-by-design McpServer stub
// leaks into every test file loaded after it in the same worker process. That
// stub's server.tool() only records {handler}, never inputSchema — so Layer-1
// below (which reads entry.inputSchema.safeParse) would false-fail with a
// TypeError under full-suite ordering, not a real regression (confirmed: full
// `bun test` run 2026-08-26 showed exactly these 7 assertions failing while
// every Layer-2 handler round-trip test — unaffected by this leak, since
// handler is a real reference to THIS file's own callback regardless of which
// McpServer class captured it — passed clean). Skip Layer-1 honestly when
// detected rather than report a false failure; Layer-2 always runs and is the
// stronger proof anyway (exercises the real production callback end-to-end).
const _probeServer = new McpServer({ name: "schema-introspection-probe", version: "0.0.0" });
_probeServer.tool("probe_tool", "probe", {}, async () => ({ content: [] }));
const _probeRegistry = (_probeServer as unknown as {
  _registeredTools: Record<string, { inputSchema?: { safeParse?: unknown } }>;
})._registeredTools;
const SCHEMA_INTROSPECTION_AVAILABLE =
  typeof _probeRegistry["probe_tool"]?.inputSchema?.safeParse === "function";
if (!SCHEMA_INTROSPECTION_AVAILABLE) {
  console.warn(
    "[task-claim-payload-union.test.ts] SKIPPING Layer-1 schema-level tests: " +
      "McpServer.inputSchema introspection unavailable in this worker (leaked mock from " +
      "1862c-transport-session-eviction.test.ts, or an equivalent — see comment above). " +
      "Layer-2 handler round-trip tests still run and prove the real production behavior.",
  );
}

// ---------------------------------------------------------------------------
// Layer 1 — Zod schema acceptance (proves a real MCP client call is not rejected)
// ---------------------------------------------------------------------------

describe.skipIf(!SCHEMA_INTROSPECTION_AVAILABLE)("task_claim.payload — Zod schema union (schema-level)", () => {
  const baseArgs = {
    task_id: "task:schema-probe",
    task_kind: "sprint-task",
    owner_agent: "dev-mcp-server",
    owner_client_session: "session-A",
  };

  it("accepts a plain object payload", () => {
    const entry = getEntry(server, "task_claim");
    const result = entry.inputSchema.safeParse({ ...baseArgs, payload: { slot_id: "s1", notes: "hi" } });
    expect(result.success).toBe(true);
  });

  it("accepts a JSON string payload (regression — status quo unchanged)", () => {
    const entry = getEntry(server, "task_claim");
    const result = entry.inputSchema.safeParse({ ...baseArgs, payload: '{"slot_id":"s1"}' });
    expect(result.success).toBe(true);
  });

  it("accepts payload omitted (optional)", () => {
    const entry = getEntry(server, "task_claim");
    const result = entry.inputSchema.safeParse({ ...baseArgs });
    expect(result.success).toBe(true);
  });

  it("still rejects a non-object, non-string scalar (e.g. a bare number)", () => {
    const entry = getEntry(server, "task_claim");
    const result = entry.inputSchema.safeParse({ ...baseArgs, payload: 42 });
    expect(result.success).toBe(false);
  });

  it("still rejects an array (matches grounding fact: no consumer ever stores an array)", () => {
    const entry = getEntry(server, "task_claim");
    const result = entry.inputSchema.safeParse({ ...baseArgs, payload: [1, 2, 3] });
    expect(result.success).toBe(false);
  });
});

describe.skipIf(!SCHEMA_INTROSPECTION_AVAILABLE)("task_heartbeat.payload_patch — Zod schema union (schema-level)", () => {
  const baseArgs = {
    task_id: "task:schema-probe",
    owner_client_session: "session-A",
  };

  it("accepts a plain object payload_patch", () => {
    const entry = getEntry(server, "task_heartbeat");
    const result = entry.inputSchema.safeParse({ ...baseArgs, payload_patch: { notes: "patched" } });
    expect(result.success).toBe(true);
  });

  it("accepts a JSON string payload_patch (regression — status quo unchanged)", () => {
    const entry = getEntry(server, "task_heartbeat");
    const result = entry.inputSchema.safeParse({ ...baseArgs, payload_patch: '{"notes":"patched"}' });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Layer 2 — handler round trip (claim → task_list_held readback)
// ---------------------------------------------------------------------------

describe("task_claim payload round trip via task_list_held", () => {
  it("object payload: claim with object → read back → parses to the SAME object", async () => {
    const original = { slot_id: "slot-9", task_title: "widen payload union", notes: "obj form" };

    const claimResult = await callTool(server, "task_claim", {
      task_id: "task:obj-roundtrip",
      task_kind: "sprint-task",
      owner_agent: "dev-mcp-server",
      owner_client_session: "session-obj",
      ttl_seconds: 3600,
      payload: original,
    });
    expect(claimResult["claimed"]).toBe(true);

    const listResult = await callTool(server, "task_list_held", {});
    const locks = listResult["locks"] as Array<{ task_id: string; payload: string | null }>;
    const row = locks.find((l) => l.task_id === "task:obj-roundtrip");
    expect(row).toBeDefined();
    expect(typeof row!.payload).toBe("string"); // storage format unchanged — always TEXT
    expect(JSON.parse(row!.payload as string)).toEqual(original);
  });

  it("string payload: claim with JSON string → read back UNCHANGED (regression, no double-encoding)", async () => {
    const originalString = '{"slot_id":"slot-10","notes":"string form"}';

    const claimResult = await callTool(server, "task_claim", {
      task_id: "task:string-roundtrip",
      task_kind: "sprint-task",
      owner_agent: "dev-mcp-server",
      owner_client_session: "session-str",
      ttl_seconds: 3600,
      payload: originalString,
    });
    expect(claimResult["claimed"]).toBe(true);

    const listResult = await callTool(server, "task_list_held", {});
    const locks = listResult["locks"] as Array<{ task_id: string; payload: string | null }>;
    const row = locks.find((l) => l.task_id === "task:string-roundtrip");
    expect(row).toBeDefined();
    expect(row!.payload).toBe(originalString); // byte-identical — not re-serialized/mangled
    expect(JSON.parse(row!.payload as string)).toEqual({ slot_id: "slot-10", notes: "string form" });
  });

  it("payload omitted: stored payload is null (regression, pre-existing behavior unchanged)", async () => {
    const claimResult = await callTool(server, "task_claim", {
      task_id: "task:no-payload",
      task_kind: "sprint-task",
      owner_agent: "dev-mcp-server",
      owner_client_session: "session-none",
      ttl_seconds: 3600,
    });
    expect(claimResult["claimed"]).toBe(true);

    const listResult = await callTool(server, "task_list_held", {});
    const locks = listResult["locks"] as Array<{ task_id: string; payload: string | null }>;
    const row = locks.find((l) => l.task_id === "task:no-payload");
    expect(row).toBeDefined();
    expect(row!.payload).toBeNull();
  });
});

describe("task_heartbeat payload_patch object round trip", () => {
  it("object patch: heartbeat with object payload_patch merges correctly into stored TEXT payload", async () => {
    await callTool(server, "task_claim", {
      task_id: "task:hb-obj-patch",
      task_kind: "sprint-task",
      owner_agent: "dev-mcp-server",
      owner_client_session: "session-hb",
      ttl_seconds: 3600,
      payload: { a: 1 },
    });

    const hbResult = await callTool(server, "task_heartbeat", {
      task_id: "task:hb-obj-patch",
      owner_client_session: "session-hb",
      payload_patch: { b: 2 },
    });
    expect(hbResult["ok"]).toBe(true);

    const listResult = await callTool(server, "task_list_held", {});
    const locks = listResult["locks"] as Array<{ task_id: string; payload: string | null }>;
    const row = locks.find((l) => l.task_id === "task:hb-obj-patch");
    expect(JSON.parse(row!.payload as string)).toEqual({ a: 1, b: 2 });
  });

  it("string patch: heartbeat with JSON string payload_patch still works (regression)", async () => {
    await callTool(server, "task_claim", {
      task_id: "task:hb-str-patch",
      task_kind: "sprint-task",
      owner_agent: "dev-mcp-server",
      owner_client_session: "session-hb2",
      ttl_seconds: 3600,
      payload: '{"a":1}',
    });

    const hbResult = await callTool(server, "task_heartbeat", {
      task_id: "task:hb-str-patch",
      owner_client_session: "session-hb2",
      payload_patch: '{"b":2}',
    });
    expect(hbResult["ok"]).toBe(true);

    const listResult = await callTool(server, "task_list_held", {});
    const locks = listResult["locks"] as Array<{ task_id: string; payload: string | null }>;
    const row = locks.find((l) => l.task_id === "task:hb-str-patch");
    expect(JSON.parse(row!.payload as string)).toEqual({ a: 1, b: 2 });
  });
});
