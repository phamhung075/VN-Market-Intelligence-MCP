/**
 * get_cycle_bootstrap — Task 1563 (Sprint 226)
 *
 * Compound tool replacing 3-call opening sequence for Cowork agents.
 * Calls: get_agent_signals + get_market_context(24h) + get_system_status in parallel.
 *
 * Input: { agent_name: ValidAgentName }
 * Output: JSON string of BootstrapResult
 * Unknown agent_name → Zod validation error (auto-rejected before handler runs)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDb } from "../../../../infrastructure/db/schema.js";
import {
  getCycleBootstrap,
  VALID_AGENT_NAMES,
} from "../../../../application/usecases/getCycleBootstrap.js";

export function registerCycleBootstrapTool(server: McpServer): void {
  server.tool(
    "get_cycle_bootstrap",
    "Compound bootstrap tool for Cowork agents. Replaces the 3-call opening sequence " +
      "(get_agent_signals + get_market_context + get_system_status) with a single parallel call. " +
      "Returns { agent_signals, market_context, system_status }. " +
      "Partial failure: failed keys set to null with error details — agent applies fail-loud protocol. " +
      "Valid agent_name values: news-scout, financial-analyst, market-watcher, alert-commander, " +
      "digest-predict, qa-responder, unified-agent, report-analyzer, bctc-analyst.",
    {
      agent_name: z
        .enum(VALID_AGENT_NAMES)
        .describe("Agent identifier. Must match a known Cowork agent name."),
    },
    async ({ agent_name }) => {
      try {
        const db = getDb();
        const result = await getCycleBootstrap(db, agent_name);

        // Observability logging per AC-4
        const signalsTiming = result.sub_call_timings.agent_signals_ms;
        const contextTiming = result.sub_call_timings.market_context_ms;
        const statusTiming = result.sub_call_timings.system_status_ms;

        console.log(
          `[BOOTSTRAP] agent=cycle-init elapsed_ms=${result.elapsed_ms} signals_ms=${signalsTiming} context_ms=${contextTiming} status_ms=${statusTiming}`
        );

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "Bootstrap failed",
                detail: (err as Error).message,
                valid_agents: VALID_AGENT_NAMES,
              }),
            },
          ],
        };
      }
    },
  );
}
