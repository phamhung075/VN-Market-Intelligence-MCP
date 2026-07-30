/**
 * FIX-AUDITOR-OUTPUT-CONTRACT-SIGNALSPOSTED-COUNTS-CALLS-NOT-CONFIRMED-ROWS
 *
 * AC-1 (empirical finding, recorded here as regression coverage): TWO distinct
 * mechanisms in `post_agent_signal`'s response composition can make a caller
 * believe a signal was written to `agent_signals` when zero new rows landed:
 *
 *   Mechanism A — `postSignalWithCriticGate()` returns `signalId=-1` for ANY
 *   dedup-suppressed write (the `INSERT OR IGNORE` identical-payload guard,
 *   or the Task-1862g same-direction time-window guard) — not just the
 *   narrow "critic rejected on first attempt" case. Before this fix, the
 *   interface layer only special-cased `id===-1` when paired with
 *   `criticResult !== null && !criticResult.pass`; every OTHER `id===-1`
 *   outcome fell through to the generic `success:true` response, embedding
 *   the sentinel `-1` as if it were a real row id ("...(id=-1,...)").
 *
 *   Mechanism B — the handler's outer catch-all (a genuine thrown DB error,
 *   e.g. mid-write corruption) returns `Error: <message>` as the response
 *   TEXT but never sets `isError: true` on the tool response envelope —
 *   unlike the other two intentional-rejection branches in this same
 *   handler, which both set `isError` or `success:false` consistently.
 *   `scripts/agents-flow/mcp-call.sh`'s `_mcp_call_parse()` only inspects
 *   `.result.isError`, never the text content, so this response was
 *   silently counted as a successful call.
 *
 * AC-2/AC-3/AC-4 (read-back derivation, fail-loud mismatch, Error:-prefix
 * detection) are covered by scripts/emit-audit-signal.test.sh and
 * scripts/agents-flow/mcp-call.test.sh (bash layer) — this file covers only
 * the TypeScript tool-response-contract half of the fix.
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import { registerAgentSignalTools } from "../interface/mcp/tools/news-analysis/agentSignalTools.js";

type ToolResponse = {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
};

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

// A payload deliberately shaped to PASS the TNB critic gate (specific
// direction + magnitude + evidence source + cost-of-capital/profit context +
// a confidence anchor) — dedup-suppression behaviour must be isolated from
// critic-rejection behaviour, so this fixture must clear the critic cleanly.
const CRITIC_PASSING_PAYLOAD = {
  from_agent: "repro-agent",
  to_agent: "po",
  signal_type: "signal_feedback" as const,
  stock_code: "VNM",
  payload: {
    title: "identical-dup-repro",
    detail:
      "VNM cost-of-capital outlook improves as SBV rate cut lowers WACC; " +
      "profit outlook revised up on lower funding cost, direction bullish, " +
      "evidence: SBV circular 12/2026, magnitude +8% EPS.",
    impact_score: 7,
  },
  finding_data: { confidence: 0.85 },
  ttl_minutes: 60,
};

describe("FIX-AUDITOR-OUTPUT-CONTRACT-SIGNALSPOSTED: post_agent_signal must never report success:true for a call that wrote zero new agent_signals rows", () => {
  let server: McpServer;

  beforeEach(async () => {
    closeDb();
    await initDatabase();
    server = new McpServer(
      { name: "test-fix-auditor-output-contract", version: "1.0.0" },
      { capabilities: { tools: {} } },
    );
    registerAgentSignalTools(server);
  });

  afterEach(() => {
    closeDb();
  });

  it("AC-1 mechanism A: identical duplicate payload (dedup-suppressed, critic PASS) returns success:false, not success:true with a fake signal_id", async () => {
    const first = await callTool(server, "post_agent_signal", CRITIC_PASSING_PAYLOAD);
    const firstBody = JSON.parse(first.content[0]!.text) as {
      success: boolean;
      signal_id: number | null;
    };
    expect(firstBody.success).toBe(true);
    expect(firstBody.signal_id).toBeGreaterThan(0);

    // Second call: byte-identical payload, same minute — hits
    // idx_agent_signals_dedup_identical (INSERT OR IGNORE no-op).
    const second = await callTool(server, "post_agent_signal", CRITIC_PASSING_PAYLOAD);
    const secondBody = JSON.parse(second.content[0]!.text) as {
      success: boolean;
      signal_id: number | null;
    };

    // RED (pre-fix): secondBody was {success:true, signal_id:-1, message:
    // "...(id=-1,...)"} — a fabricated-looking success for a write that
    // never happened. GREEN (post-fix): success must be false and signal_id
    // must never be the sentinel -1 dressed up as a real id.
    expect(secondBody.success).toBe(false);
    expect(secondBody.signal_id).not.toBe(-1);

    const db = getDb();
    const count = db
      .prepare("SELECT COUNT(*) as n FROM agent_signals WHERE from_agent = 'repro-agent'")
      .get() as { n: number };
    expect(count.n).toBe(1); // only the first call actually wrote a row
  });

  it("AC-1 mechanism B: a genuine thrown DB error sets isError:true (not just an Error:-prefixed text body)", async () => {
    const db = getDb();
    const originalPrepare = db.prepare.bind(db);
    (db as unknown as { prepare: typeof db.prepare }).prepare = ((
      sql: string,
      ...rest: unknown[]
    ) => {
      if (typeof sql === "string" && sql.includes("INSERT OR IGNORE INTO agent_signals")) {
        throw new Error("database disk image is malformed (simulated corrupt btree)");
      }
      return (originalPrepare as unknown as (...a: unknown[]) => unknown)(sql, ...rest);
    }) as typeof db.prepare;

    const result = await callTool(server, "post_agent_signal", {
      ...CRITIC_PASSING_PAYLOAD,
      from_agent: "repro-agent-thrown",
    });

    expect(result.content[0]!.text.startsWith("Error:")).toBe(true);
    // RED (pre-fix): isError was undefined here. GREEN (post-fix): true.
    expect(result.isError).toBe(true);
  });
});
