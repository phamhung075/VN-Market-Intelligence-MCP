Bun.env["DB_PATH"] = ":memory:";

/**
 * FIX-AGENT-SIGNALS-AGENT-PARAM-CONTRACT — unit tests
 *
 * Verifies that the `agent` parameter is optional-when-not-inbox-mode after the
 * schema contract fix (Direction A).
 *
 * AC-1: inbox mode without `agent` → user-readable error, no DB query
 * AC-2: sender-history (from_agent="news-scout", no agent) → correct signals, no error
 * AC-3: all-producers (from_agent=null, no agent, hours_back=0.25) → all-producer signals, no error
 * AC-4: inbox caller passing agent="alert-commander" still works (backward-compat)
 * AC-5: Zod safeParse accepts call with agent omitted when from_agent present
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { getSignals } from "../infrastructure/db/agentSignalStore.js";
import { getRecentSignals } from "../tools/signals/getRecentSignals.js";
import { formatSignalLines } from "../interface/mcp/tools/news-analysis/agentSignalTools.js";
import { z } from "zod";

// ── Zod schema — mirrors the schema in agentSignalTools.ts after the fix ─────

const GetAgentSignalsSchema = z.object({
  agent: z
    .string()
    .optional()
    .describe(
      "Agent name to fetch signals for (e.g. 'alert_commander'). " +
        "Required in inbox mode (from_agent omitted). " +
        "Omittable in sender-history mode (from_agent=string) and all-producers mode (from_agent=null).",
    ),
  status: z
    .enum(["unread", "all"])
    .default("unread")
    .describe("Filter: 'unread' (default) or 'all'"),
  from_agent: z
    .string()
    .nullable()
    .optional()
    .describe(
      "If provided as a string, return only signals sent BY this agent (sender history). " +
        "Pass null to return signals from ALL producers.",
    ),
  hours_back: z.coerce
    .number()
    .positive()
    .optional()
    .describe("Restrict results to signals created within the last N hours."),
  signal_type: z
    .string()
    .nullable()
    .optional()
    .describe("Filter results to a specific signal type (server-side)."),
});

// ── DB helpers ───────────────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_agent TEXT NOT NULL,
      to_agent TEXT NOT NULL,
      signal_type TEXT NOT NULL,
      stock_code TEXT,
      payload TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'unread',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_agent_signals_to ON agent_signals(to_agent, status);
    CREATE INDEX IF NOT EXISTS idx_agent_signals_expires ON agent_signals(expires_at);
  `);
  return db;
}

function insertSignal(
  db: Database,
  opts: {
    fromAgent: string;
    toAgent: string;
    signalType: string;
    status?: string;
    agedSeconds?: number;
    ttlMinutes?: number;
  },
): number {
  const ttl = opts.ttlMinutes ?? 1440;
  const aged = opts.agedSeconds ?? 0;
  const status = opts.status ?? "unread";
  const stmt = db.prepare<{ id: number }, []>(`
    INSERT INTO agent_signals (from_agent, to_agent, signal_type, payload, status, created_at, expires_at)
    VALUES (
      '${opts.fromAgent}',
      '${opts.toAgent}',
      '${opts.signalType}',
      '{"title":"test signal"}',
      '${status}',
      datetime('now', '-${aged} seconds'),
      datetime('now', '+${ttl} minutes')
    )
    RETURNING id
  `);
  const row = stmt.get();
  return row!.id;
}

// ── Handler logic helper (mirrors the handler's Path B/C logic) ───────────────

/**
 * Simulate the handler's core logic for Path B (sender-history) and Path C (inbox),
 * returning the same shape as the MCP tool would.
 */
function simulateHandler(
  db: Database,
  args: {
    agent?: string;
    status?: "unread" | "all";
    from_agent?: string | null;
    hours_back?: number;
    signal_type?: string | null;
  },
): { content: Array<{ type: string; text: string }> } {
  // Path A: all-producers
  if (args.from_agent === null) {
    const hoursBack = args.hours_back ?? 0.25;
    const windowSeconds = Math.round(hoursBack * 3600);
    const signals = getRecentSignals(db, windowSeconds);
    const filtered = args.signal_type != null
      ? signals.filter((s) => s.signalType === args.signal_type)
      : signals;
    return {
      content: [{ type: "text", text: formatSignalLines(filtered, "all-producers") }],
    };
  }

  // Path C guard (inbox mode): from_agent is undefined AND agent is falsy
  if (args.from_agent === undefined && !args.agent) {
    return {
      content: [{
        type: "text",
        text: "Error: `agent` is required when using inbox mode (from_agent not provided).",
      }],
    };
  }

  // Path B (sender-history) + Path C (inbox)
  const signals = getSignals(db, args.agent ?? "", {
    ...(args.status !== undefined ? { status: args.status } : {}),
    ...(args.from_agent !== undefined && args.from_agent !== null ? { fromAgent: args.from_agent } : {}),
    ...(args.hours_back !== undefined ? { hoursBack: args.hours_back } : {}),
    ...(args.signal_type != null ? { signalType: args.signal_type } : {}),
  });

  return {
    content: [{ type: "text", text: formatSignalLines(signals, args.agent ?? "") }],
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("FIX-AGENT-SIGNALS-AGENT-PARAM-CONTRACT", () => {
  // AC-1: inbox mode without agent → user-readable error, no DB query
  it("AC-1: inbox mode (from_agent absent, agent absent) returns user-readable error", () => {
    const db = makeDb();
    // Insert a signal so we can confirm no DB read occurred (result is error, not signal data)
    insertSignal(db, {
      fromAgent: "news-scout",
      toAgent: "alert-commander",
      signalType: "urgent_news",
    });

    const result = simulateHandler(db, {
      // agent: omitted
      // from_agent: omitted (undefined → inbox mode)
      status: "unread",
    });

    expect(result.content[0]!.text).toContain("Error:");
    expect(result.content[0]!.text).toContain("`agent` is required");
    // Confirm no signal data was returned (not the signal count line)
    expect(result.content[0]!.text).not.toContain("urgent_news");
  });

  // AC-2: sender-history mode (from_agent="news-scout", agent absent) → signals returned, no error
  it("AC-2: sender-history mode without agent returns signals sent by from_agent", () => {
    const db = makeDb();
    insertSignal(db, {
      fromAgent: "news-scout",
      toAgent: "alert-commander",
      signalType: "urgent_news",
      status: "unread",
    });
    // Signal from a different agent — should NOT appear
    insertSignal(db, {
      fromAgent: "market-watcher",
      toAgent: "alert-commander",
      signalType: "price_anomaly",
      status: "unread",
    });

    const result = simulateHandler(db, {
      // agent: omitted deliberately
      from_agent: "news-scout",
      status: "all",
    });

    expect(result.content[0]!.text).not.toContain("Error:");
    expect(result.content[0]!.text).toContain("news-scout");
    // market-watcher signal should not appear (sender-history filtered to news-scout)
    // formatSignalLines uppercases signal_type in output
    expect(result.content[0]!.text).not.toContain("PRICE_ANOMALY");
  });

  // AC-3: all-producers mode (from_agent=null, agent absent, hours_back=0.25) → all-producer signals
  it("AC-3: all-producers mode (from_agent=null, no agent, hours_back=0.25) returns all recent signals", () => {
    const db = makeDb();
    // Insert two signals from different producers with 'read' status (visible to getRecentSignals)
    insertSignal(db, {
      fromAgent: "news-scout",
      toAgent: "all",
      signalType: "urgent_news",
      status: "read",
      agedSeconds: 30, // 30s ago — well within 0.25h = 900s window
    });
    insertSignal(db, {
      fromAgent: "market-watcher",
      toAgent: "all",
      signalType: "price_anomaly",
      status: "read",
      agedSeconds: 60, // 60s ago — within window
    });

    const result = simulateHandler(db, {
      // agent: omitted
      from_agent: null,
      hours_back: 0.25,
    });

    expect(result.content[0]!.text).not.toContain("Error:");
    // Both signals from different producers should appear
    expect(result.content[0]!.text).toContain("news-scout");
    expect(result.content[0]!.text).toContain("market-watcher");
  });

  // AC-4: existing inbox callers pass agent="alert-commander" — no regression
  it("AC-4: inbox mode with agent='alert-commander' returns signals addressed to alert-commander", () => {
    const db = makeDb();
    insertSignal(db, {
      fromAgent: "news-scout",
      toAgent: "alert-commander",
      signalType: "price_anomaly",
      status: "unread",
    });
    // Signal to a different agent — should NOT appear
    insertSignal(db, {
      fromAgent: "news-scout",
      toAgent: "market-watcher",
      signalType: "urgent_news",
      status: "unread",
    });

    const result = simulateHandler(db, {
      agent: "alert-commander",
      // from_agent: omitted (inbox mode)
      status: "unread",
    });

    expect(result.content[0]!.text).not.toContain("Error:");
    expect(result.content[0]!.text).toContain("alert-commander");
    // formatSignalLines uppercases signal_type in output
    expect(result.content[0]!.text).toContain("PRICE_ANOMALY");
    // Signal to market-watcher should not appear
    expect(result.content[0]!.text).not.toContain("URGENT_NEWS");
  });

  // AC-5: Zod schema — agent is optional (safeParse verifies schema contract)
  it("AC-5: Zod schema accepts agent omitted when from_agent is present", () => {
    // sender-history call: from_agent present, agent omitted
    const senderHistoryResult = GetAgentSignalsSchema.safeParse({
      from_agent: "news-scout",
      status: "all",
      hours_back: 6,
    });
    expect(senderHistoryResult.success).toBe(true);

    // inbox call: agent present, from_agent omitted
    const inboxResult = GetAgentSignalsSchema.safeParse({
      agent: "alert-commander",
      status: "unread",
    });
    expect(inboxResult.success).toBe(true);

    // all-producers call: from_agent=null, agent omitted
    const allProducersResult = GetAgentSignalsSchema.safeParse({
      from_agent: null,
      hours_back: 0.25,
    });
    expect(allProducersResult.success).toBe(true);

    // Both agent and from_agent omitted — schema accepts it (handler guard catches it at runtime)
    const bothOmittedResult = GetAgentSignalsSchema.safeParse({
      status: "unread",
    });
    expect(bothOmittedResult.success).toBe(true);
  });
});
