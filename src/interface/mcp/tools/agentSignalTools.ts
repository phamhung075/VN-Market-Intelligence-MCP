/**
 * Agent Signal Bus MCP Tools — Task 242
 *
 * Interface layer: registers two MCP tools on a McpServer instance.
 *
 * Tools registered:
 *   1. post_agent_signal  — post a typed, TTL-bound signal to another agent
 *   2. get_agent_signals  — retrieve pending signals addressed to an agent
 *
 * @module interface/mcp/tools/agentSignalTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { getDb, initDatabase } from "../../../infrastructure/db/schema.js";
import {
  postSignal,
  getSignals,
  recordOutcome,
  getSignalEffectiveness,
} from "../../../infrastructure/db/agentSignalStore.js";

// ── Zod schemas ─────────────────────────────────────────────────────────────

const SignalTypeEnum = z.enum([
  "urgent_news",
  "price_anomaly",
  "cross_validate",
  "suppress",
]);

const OutcomeEnum = z.enum([
  "fired",
  "suppressed",
  "confirmed",
  "false_positive",
]);

const PayloadSchema = z.object({
  title: z.string().describe("Short headline for the signal"),
  detail: z.string().describe("Full detail / reasoning"),
  impact_score: z
    .number()
    .min(0)
    .max(10)
    .optional()
    .describe("Impact score 0-10 (optional)"),
});

// ── registerAgentSignalTools ─────────────────────────────────────────────────

/**
 * Register `post_agent_signal` and `get_agent_signals` on the given McpServer.
 *
 * @param server - McpServer instance (from createBunServer)
 */
export function registerAgentSignalTools(server: McpServer): void {
  // ── post_agent_signal ──────────────────────────────────────────────────────
  server.tool(
    "post_agent_signal",
    "Post a typed signal to another analysis agent via the SQLite message bus. " +
      "Signals expire after ttl_minutes and are automatically cleaned up.",
    {
      from_agent: z
        .string()
        .describe("Name of the sending agent (e.g. 'market_watcher')"),
      to_agent: z
        .string()
        .describe(
          "Name of the receiving agent or 'all' for broadcast (e.g. 'alert_commander')",
        ),
      signal_type: SignalTypeEnum.describe(
        "Signal category: urgent_news | price_anomaly | cross_validate | suppress",
      ),
      stock_code: z
        .string()
        .optional()
        .describe("Stock ticker code (e.g. 'VNM'), optional"),
      payload: PayloadSchema.describe(
        "Signal payload: title, detail, and optional impact_score",
      ),
      ttl_minutes: z
        .number()
        .int()
        .positive()
        .default(120)
        .describe("Time-to-live in minutes (default 120)"),
    },
    async (args) => {
      try {
        await initDatabase();
        const db = getDb();

        const payload: import("../../../infrastructure/db/agentSignalStore.js").SignalPayload = {
          title: args.payload.title,
          detail: args.payload.detail,
          ...(args.payload.impact_score !== undefined
            ? { impact_score: args.payload.impact_score }
            : {}),
        };

        const signalInput: import("../../../infrastructure/db/agentSignalStore.js").PostSignalInput =
          {
            fromAgent: args.from_agent,
            toAgent: args.to_agent,
            signalType: args.signal_type,
            payload,
            ttlMinutes: args.ttl_minutes,
            ...(args.stock_code !== undefined
              ? { stockCode: args.stock_code }
              : {}),
          };

        const id = postSignal(db, signalInput);

        const stockSuffix = args.stock_code ? ` [${args.stock_code}]` : "";
        const result = `Signal posted to ${args.to_agent}: ${args.signal_type}${stockSuffix} (id=${id}, ttl=${args.ttl_minutes}m)`;

        return {
          content: [{ type: "text" as const, text: result }],
        };
      } catch (err) {
        console.error("[post_agent_signal] Failed:", err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );

  // ── get_agent_signals ──────────────────────────────────────────────────────
  server.tool(
    "get_agent_signals",
    "Retrieve pending signals addressed to the given agent (or broadcast 'all'). " +
      "Unread signals are marked as read on retrieval.",
    {
      agent: z
        .string()
        .describe("Agent name to fetch signals for (e.g. 'alert_commander')"),
      status: z
        .enum(["unread", "all"])
        .default("unread")
        .describe("Filter: 'unread' (default) or 'all'"),
    },
    async (args) => {
      try {
        await initDatabase();
        const db = getDb();

        const signals = getSignals(db, args.agent, { status: args.status });

        if (signals.length === 0) {
          return {
            content: [{ type: "text" as const, text: "Khong co tin hieu moi." }],
          };
        }

        const lines: string[] = [
          `Tin hieu cho ${args.agent} (${signals.length} tin):`,
          "",
        ];

        for (const s of signals) {
          const stock = s.stockCode ? ` [${s.stockCode}]` : "";
          lines.push(
            `[${s.id}] ${s.signalType.toUpperCase()}${stock} — tu: ${s.fromAgent}`,
          );
          lines.push(`  Tieu de: ${s.payload.title}`);
          lines.push(`  Chi tiet: ${s.payload.detail}`);
          if (s.payload.impact_score !== undefined) {
            lines.push(`  Muc do anh huong: ${s.payload.impact_score}/10`);
          }
          lines.push(`  Trang thai: ${s.status} | Het han: ${s.expiresAt}`);
          lines.push("");
        }

        return {
          content: [{ type: "text" as const, text: lines.join("\n").trimEnd() }],
        };
      } catch (err) {
        console.error("[get_agent_signals] Failed:", err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );

  // ── record_signal_outcome ──────────────────────────────────────────────────
  server.tool(
    "record_signal_outcome",
    "Record the processing outcome for an agent signal. " +
      "Use this after a signal has been acted upon to feed the effectiveness tracker.",
    {
      signal_id: z
        .number()
        .int()
        .positive()
        .describe("The numeric id of the agent_signals row to update"),
      outcome: OutcomeEnum.describe(
        "Outcome: fired | suppressed | confirmed | false_positive",
      ),
      detail: z
        .string()
        .optional()
        .describe("Optional free-text explanation stored in outcome_detail"),
    },
    async (args) => {
      try {
        await initDatabase();
        const db = getDb();

        recordOutcome(db, args.signal_id, args.outcome, args.detail);

        const text =
          `Outcome recorded: signal_id=${args.signal_id} outcome=${args.outcome}` +
          (args.detail ? ` (${args.detail})` : "");

        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        console.error("[record_signal_outcome] Failed:", err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );

  // ── get_signal_effectiveness ───────────────────────────────────────────────
  server.tool(
    "get_signal_effectiveness",
    "Retrieve aggregated signal effectiveness metrics grouped by agent and signal type. " +
      "Shows total signals, confirmed hits, false positives, and precision percentage.",
    {
      from_agent: z
        .string()
        .optional()
        .describe("Filter to a specific sending agent (optional)"),
      signal_type: z
        .string()
        .optional()
        .describe(
          "Filter to a specific signal type: urgent_news | price_anomaly | cross_validate | suppress (optional)",
        ),
      days: z
        .number()
        .int()
        .positive()
        .default(7)
        .describe("Look-back window in days (default 7)"),
    },
    async (args) => {
      try {
        await initDatabase();
        const db = getDb();

        const effectivenessOpts: import("../../../infrastructure/db/agentSignalStore.js").GetEffectivenessOptions =
          { days: args.days };
        if (args.from_agent !== undefined) effectivenessOpts.fromAgent = args.from_agent;
        if (args.signal_type !== undefined) effectivenessOpts.signalType = args.signal_type;

        const rows = getSignalEffectiveness(db, effectivenessOpts);

        if (rows.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Chua co du lieu hieu qua tin hieu trong ${args.days} ngay qua.`,
              },
            ],
          };
        }

        const header = `Agent                | Signal type      | Total | Fired | Confirmed | False+ | Precision`;
        const sep = `---------------------|------------------|-------|-------|-----------|--------|----------`;

        const tableRows = rows.map((r) => {
          const precStr =
            r.precision === null ? "  N/A" : `${(r.precision * 100).toFixed(1)}%`;
          return [
            r.fromAgent.padEnd(20),
            r.signalType.padEnd(16),
            String(r.total).padStart(5),
            String(r.fired).padStart(5),
            String(r.confirmed).padStart(9),
            String(r.false_positive).padStart(6),
            precStr.padStart(9),
          ].join(" | ");
        });

        const text = [
          `Hieu qua tin hieu (${args.days} ngay qua):`,
          "",
          header,
          sep,
          ...tableRows,
        ].join("\n");

        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        console.error("[get_signal_effectiveness] Failed:", err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );
}
