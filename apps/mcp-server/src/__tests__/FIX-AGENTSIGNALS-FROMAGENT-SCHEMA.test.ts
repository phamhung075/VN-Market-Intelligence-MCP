Bun.env["DB_PATH"] = ":memory:";

/**
 * FIX-AGENTSIGNALS-FROMAGENT-SCHEMA — regression test
 *
 * Root cause (LIVE 2026-06-17T01:31Z RAW-confirmed): get_agent_signals({from_agent:
 * 'news-scout'}) returned MCP -32602 invalid_type `agent` Required — news-scout's
 * SELF_SIGNALS_CACHE warm-up (sender-history self-read) silently emptied every
 * cycle, permanently disabling its feedback/self-tuning loop.
 *
 * This exact contract was already relaxed by commit 8a6b798ce
 * (FIX-AGENT-SIGNALS-AGENT-PARAM-CONTRACT, 2026-06-19) — two days after this
 * ticket (po-s94, minted 2026-06-17T01:34:10Z) was filed against the same
 * root cause, so the fix landed under a differently-named task before this
 * backlog row was reconciled. This file closes the loop for
 * FIX-AGENTSIGNALS-FROMAGENT-SCHEMA specifically:
 *
 *   1. Asserts against the REAL exported runtime shape (GetAgentSignalsShape,
 *      pulled directly out of agentSignalTools.ts — no hand-mirrored duplicate
 *      that could silently drift from source, unlike a copy-pasted z.object()).
 *   2. Drives the literal repro call from the ticket
 *      (get_agent_signals({from_agent:'news-scout'})) through a real McpServer
 *      + registerAgentSignalTools() wiring end-to-end (schema -> handler -> DB),
 *      proving it returns signal rows (or an empty array), never -32602.
 *   3. Confirms the GENERIC mandate: any from_agent value works, not a
 *      news-scout allowlist (AC-4 uses a different agent name).
 *
 * NOTE re: fix_spec's suggested implementation shape (`zod .refine`/`.or` so at
 * least one of agent/from_agent is present) — the actual landed fix (Direction
 * A, see FIX-AGENT-SIGNALS-AGENT-PARAM-CONTRACT.test.ts) instead makes `agent`
 * schema-optional and enforces "at least one of agent/from_agent" as a runtime
 * handler guard that returns a readable tool-response error. This is
 * deliberate: a zod-level .refine failure surfaces as a hard MCP protocol
 * error (the same -32602 class this ticket exists to eliminate), whereas the
 * handler guard gives callers a readable error string. AC-4 below asserts
 * this "neither present" case is non-crashing and controlled, matching the
 * verification_gate's "not -32602" requirement without reintroducing a
 * protocol-level parse failure.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import { postSignal } from "../infrastructure/db/agentSignalStore.js";
import {
  registerAgentSignalTools,
  GetAgentSignalsShape,
} from "../interface/mcp/tools/news-analysis/agentSignalTools.js";

// ── McpServer handler-call harness (precedent: 1194-agent08-tools.test.ts) ──

type ToolResponse = { content: Array<{ type: string; text: string }> };

async function callTool(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolResponse> {
  const tools = (
    server as unknown as {
      _registeredTools: Record<
        string,
        { handler: (args: unknown) => Promise<unknown> }
      >;
    }
  )._registeredTools;

  const tool = tools[toolName];
  if (!tool) throw new Error(`Tool not registered: ${toolName}`);
  return tool.handler(args) as Promise<ToolResponse>;
}

describe("FIX-AGENTSIGNALS-FROMAGENT-SCHEMA — schema contract (real exported shape)", () => {
  const schema = z.object(GetAgentSignalsShape);

  it("accepts {from_agent} alone — the exact ticket repro call, agent omitted", () => {
    const result = schema.safeParse({ from_agent: "news-scout" });
    expect(result.success).toBe(true);
  });

  it("GENERIC: accepts {from_agent} alone for a non-news-scout agent too (no allowlist)", () => {
    const result = schema.safeParse({ from_agent: "market-watcher" });
    expect(result.success).toBe(true);
  });

  it("accepts {agent} alone (inbox mode) — no regression for the pre-existing contract", () => {
    const result = schema.safeParse({ agent: "alert-commander" });
    expect(result.success).toBe(true);
  });

  it("does not hard-reject {} (neither present) at the zod layer — runtime guard handles it, not a protocol parse failure", () => {
    const result = schema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe("FIX-AGENTSIGNALS-FROMAGENT-SCHEMA — end-to-end (real McpServer + handler + DB)", () => {
  let server: McpServer;

  beforeEach(async () => {
    closeDb();
    await initDatabase();
    server = new McpServer(
      { name: "test-fix-agentsignals-fromagent-schema", version: "1.0.0" },
      { capabilities: { tools: {} } },
    );
    registerAgentSignalTools(server);
  });

  afterEach(() => {
    closeDb();
  });

  it("AC-1: get_agent_signals({from_agent:'news-scout'}) returns news-scout's own rows, not -32602", async () => {
    const db = getDb();
    postSignal(db, {
      fromAgent: "news-scout",
      toAgent: "alert-commander",
      signalType: "urgent_news",
      payload: { title: "self-history warm-up row" },
      ttlMinutes: 60,
    });
    postSignal(db, {
      fromAgent: "market-watcher",
      toAgent: "alert-commander",
      signalType: "price_anomaly",
      payload: { title: "not news-scout — must not leak into sender-history" },
      ttlMinutes: 60,
    });

    const result = await callTool(server, "get_agent_signals", {
      from_agent: "news-scout",
      status: "all",
    });

    const text = result.content[0]!.text;
    expect(text).not.toContain("-32602");
    expect(text).not.toContain("Error:");
    expect(text).toContain("news-scout");
    expect(text).not.toContain("PRICE_ANOMALY");
  });

  it("AC-2: get_agent_signals({from_agent:'news-scout'}) on an empty cache returns an empty array, not -32602", async () => {
    // No signals posted — SELF_SIGNALS_CACHE warm-up on a fresh cycle.
    const result = await callTool(server, "get_agent_signals", {
      from_agent: "news-scout",
      status: "all",
    });

    const text = result.content[0]!.text;
    expect(text).not.toContain("-32602");
    expect(text).not.toContain("Error:");
    expect(text).toBe("Không có tín hiệu mới.");
  });

  it("AC-3: existing inbox callers (agent='alert-commander', from_agent omitted) still work — no regression", async () => {
    const db = getDb();
    postSignal(db, {
      fromAgent: "news-scout",
      toAgent: "alert-commander",
      signalType: "urgent_news",
      payload: { title: "inbox row" },
      ttlMinutes: 60,
    });

    const result = await callTool(server, "get_agent_signals", {
      agent: "alert-commander",
      status: "all",
    });

    const text = result.content[0]!.text;
    expect(text).not.toContain("-32602");
    expect(text).not.toContain("Error:");
    expect(text).toContain("alert-commander");
  });

  it("AC-4: neither agent nor from_agent present — controlled readable error, not a protocol-level -32602 crash", async () => {
    const result = await callTool(server, "get_agent_signals", {
      status: "unread",
    });

    const text = result.content[0]!.text;
    expect(text).not.toContain("-32602");
    expect(text).toContain("Error:");
    expect(text).toContain("`agent` is required");
  });
});
