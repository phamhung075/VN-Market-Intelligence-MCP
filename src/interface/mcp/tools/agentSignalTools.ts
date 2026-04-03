/**
 * Agent Signal MCP Tools — Enrichment Chain
 *
 * Tools registered:
 *   1. post_agent_signal        — agents post findings into the coordination bus
 *   2. get_open_chain_findings  — query open findings for agents to enrich
 *
 * These tools are used by the Analysis Team (Cowork agents) to participate
 * in the enrichment chain. The chain synthesizer runs server-side (Step F
 * of the intelligence cycle) with zero Claude API tokens.
 *
 * @module interface/mcp/tools/agentSignalTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { getDb, initDatabase } from "../../../infrastructure/db/schema.js";
import {
  postSignal,
  getOpenChainFindings,
  computeCycleId,
  type SignalType,
} from "../../../infrastructure/db/agentSignalStore.js";

// ── Zod schemas ───────────────────────────────────────────────────────────────

const SignalTypeSchema = z.enum([
  "urgent_news",
  "price_anomaly",
  "cross_validate",
  "suppress",
  "chain_catalyst",
  "fundamental_validation",
  "price_confirmation",
  "verified_chain",
]);

// ── Tool registration ─────────────────────────────────────────────────────────

/**
 * Registers agent signal MCP tools on the McpServer instance.
 */
export function registerAgentSignalTools(server: McpServer): void {
  // ── post_agent_signal ──────────────────────────────────────────────────────
  server.tool(
    "post_agent_signal",
    "Post a signal to the agent coordination bus. Agents use this to share findings (news events, price confirmations, fundamental validations) that participate in the enrichment chain. The chain synthesizer automatically forms causal chains when 2+ agents post about the same stock in the same 15-min cycle.",
    {
      from_agent: z.string().min(1).describe("Posting agent name, e.g. 'news-scout'"),
      to_agent: z.string().min(1).describe("Target agent or 'alert-commander' for all"),
      signal_type: SignalTypeSchema.describe("Signal classification"),
      stock_code: z.string().optional().describe("Affected stock code, e.g. 'VNM'"),
      payload: z.object({
        title: z.string().optional(),
        detail: z.string().optional(),
      }).passthrough().describe("Signal payload with title and optional detail"),
      ttl_minutes: z.number().int().min(1).max(1440).optional().default(60).describe("Signal TTL in minutes (default 60)"),
      cycle_id: z.string().optional().describe("15-min cycle ID (auto-computed if omitted), format YYYYMMDD-HHMM"),
      finding_data: z.record(z.unknown()).optional().describe("Structured finding metrics: { confidence, direction, event_type, validates, confirms_direction, volume_above_average, summary, ... }"),
      causal_ref: z.number().int().optional().describe("ID of parent signal this finding builds on"),
      chain_depth: z.number().int().min(0).max(3).optional().default(0).describe("Chain depth: 0=catalyst, 1=validation, 2=confirmation, 3=synthesis"),
    },
    async (input) => {
      await initDatabase();
      const db = getDb();

      const cycleId = input.cycle_id ?? computeCycleId();

      const id = postSignal(db, {
        fromAgent: input.from_agent,
        toAgent: input.to_agent,
        signalType: input.signal_type as SignalType,
        stockCode: input.stock_code ?? null,
        payload: input.payload as Record<string, unknown>,
        ttlMinutes: input.ttl_minutes,
        cycleId,
        findingData: input.finding_data ?? {},
        ...(input.causal_ref !== undefined ? { causalRef: input.causal_ref } : {}),
        chainDepth: input.chain_depth ?? 0,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: true,
                signal_id: id,
                cycle_id: cycleId,
                message: `Signal ${id} posted to cycle ${cycleId}`,
              },
              null,
              2,
            ),
          },
        ],
      };
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
    },
  );
}
