/**
 * Agent Signal Bus MCP Tools — Task 242 + Enrichment Chain Extension
 *
 * Interface layer: registers MCP tools on a McpServer instance.
 *
 * Tools registered:
 *   1. post_agent_signal        — post a typed, TTL-bound signal to another agent
 *                                 (extended with enrichment chain params: cycle_id,
 *                                  finding_data, causal_ref, chain_depth)
 *   2. get_agent_signals        — retrieve pending signals addressed to an agent
 *   3. record_signal_outcome    — record processing outcome for a signal
 *   4. get_signal_effectiveness — aggregated effectiveness metrics
 *   5. get_open_chain_findings  — query open findings for agents to enrich
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
  getOpenChainFindings,
  computeCycleId,
  type SignalType,
} from "../../../infrastructure/db/agentSignalStore.js";

// ── Zod schemas ─────────────────────────────────────────────────────────────

const SignalTypeEnum = z.enum([
  "urgent_news",
  "price_anomaly",
  "cross_validate",
  "suppress",
  "chain_catalyst",
  "fundamental_validation",
  "price_confirmation",
  "verified_chain",
]);

const OutcomeEnum = z.enum([
  "fired",
  "suppressed",
  "confirmed",
  "false_positive",
]);

const PayloadSchema = z.object({
  title: z.string().optional().describe("Short headline for the signal"),
  detail: z.string().optional().describe("Full detail / reasoning"),
  impact_score: z
    .number()
    .min(0)
    .max(10)
    .optional()
    .describe("Impact score 0-10 (optional)"),
}).passthrough();

// ── registerAgentSignalTools ─────────────────────────────────────────────────

/**
 * Register agent signal MCP tools on the given McpServer.
 *
 * @param server - McpServer instance (from createBunServer)
 */
export function registerAgentSignalTools(server: McpServer): void {
  // ── post_agent_signal ──────────────────────────────────────────────────────
  server.tool(
    "post_agent_signal",
    "Post a signal to the agent coordination bus. Agents use this to share findings " +
      "(news events, price confirmations, fundamental validations) that participate in " +
      "the enrichment chain. The chain synthesizer automatically forms causal chains " +
      "when 2+ agents post about the same stock in the same 15-min cycle. " +
      "Signals expire after ttl_minutes and are automatically cleaned up.",
    {
      from_agent: z
        .string()
        .describe("Name of the sending agent (e.g. 'news-scout')"),
      to_agent: z
        .string()
        .describe(
          "Name of the receiving agent or 'all' for broadcast (e.g. 'alert-commander')",
        ),
      signal_type: SignalTypeEnum.describe(
        "Signal classification: urgent_news | price_anomaly | cross_validate | suppress | chain_catalyst | fundamental_validation | price_confirmation | verified_chain",
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
      cycle_id: z.string().optional().describe("15-min cycle ID (auto-computed if omitted), format YYYYMMDD-HHMM"),
      finding_data: z.record(z.unknown()).optional().describe("Structured finding metrics: { confidence, direction, event_type, validates, confirms_direction, volume_above_average, summary, ... }"),
      causal_ref: z.number().int().optional().describe("ID of parent signal this finding builds on"),
      chain_depth: z.number().int().min(0).max(3).optional().default(0).describe("Chain depth: 0=catalyst, 1=validation, 2=confirmation, 3=synthesis"),
    },
    async (args) => {
      try {
        await initDatabase();
        const db = getDb();

        const cycleId = args.cycle_id ?? computeCycleId();

        const signalInput: import("../../../infrastructure/db/agentSignalStore.js").PostSignalInput =
          {
            fromAgent: args.from_agent,
            toAgent: args.to_agent,
            signalType: args.signal_type as SignalType,
            payload: args.payload as Record<string, unknown>,
            ttlMinutes: args.ttl_minutes,
            cycleId,
            findingData: args.finding_data ?? {},
            chainDepth: args.chain_depth ?? 0,
            ...(args.stock_code !== undefined
              ? { stockCode: args.stock_code }
              : {}),
            ...(args.causal_ref !== undefined
              ? { causalRef: args.causal_ref }
              : {}),
          };

        const id = postSignal(db, signalInput);

        const stockSuffix = args.stock_code ? ` [${args.stock_code}]` : "";
        const result = JSON.stringify(
          {
            success: true,
            signal_id: id,
            cycle_id: cycleId,
            message: `Signal posted to ${args.to_agent}: ${args.signal_type}${stockSuffix} (id=${id}, ttl=${args.ttl_minutes}m, cycle=${cycleId})`,
          },
          null,
          2,
        );

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
          if (s.payload.title) lines.push(`  Tieu de: ${s.payload.title}`);
          if (s.payload.detail) lines.push(`  Chi tiet: ${s.payload.detail}`);
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
          "Filter to a specific signal type (optional)",
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

  // ── get_open_chain_findings ────────────────────────────────────────────────
  server.tool(
    "get_open_chain_findings",
    "Get open chain findings from the coordination bus — signals posted with a cycle_id that have not yet been synthesized. Agents use this to see what other agents have found, so they can post enrichment findings that build on the catalyst. Optionally filter by stock_code.",
    {
      minutes_back: z.number().int().min(1).max(120).optional().default(30).describe("Lookback window in minutes (default 30)"),
      stock_code: z.string().optional().describe("Filter by stock code, e.g. 'VNM'"),
    },
    async (input) => {
      try {
        await initDatabase();
        const db = getDb();

        const findings = getOpenChainFindings(db, input.minutes_back ?? 30);

        const filtered = input.stock_code
          ? findings.filter(f => f.stockCode === input.stock_code)
          : findings;

        // Group by stock for clarity
        const byStock = new Map<string, typeof filtered>();
        for (const f of filtered) {
          const key = f.stockCode ?? "unknown";
          const arr = byStock.get(key) ?? [];
          arr.push(f);
          byStock.set(key, arr);
        }

        const groups = Array.from(byStock.entries()).map(([stock, links]) => ({
          stock_code: stock,
          finding_count: links.length,
          agents: [...new Set(links.map(l => l.fromAgent))],
          latest_depth: Math.max(...links.map(l => l.chainDepth)),
          links: links.map(l => ({
            id: l.id,
            from_agent: l.fromAgent,
            signal_type: l.signalType,
            chain_depth: l.chainDepth,
            causal_ref: l.causalRef,
            confidence: l.findingData["confidence"] ?? null,
            direction: l.findingData["direction"] ?? null,
            summary: l.findingData["summary"] ?? null,
            created_at: l.createdAt,
          })),
        }));

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  total_findings: filtered.length,
                  stock_groups: groups.length,
                  groups,
                  cycle_id_current: computeCycleId(),
                  minutes_back: input.minutes_back ?? 30,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        console.error("[get_open_chain_findings] Failed:", err);
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
