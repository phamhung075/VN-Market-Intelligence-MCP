/**
 * Task 1109 — Agent Work Log MCP Tools
 *
 * Registers two MCP tools:
 *   1. log_agent_work       — agents log session start/end lifecycle events
 *   2. get_agent_work_log   — query agent work history with optional filters
 *
 * Uses the store functions from task 1108 (agentWorkLogStore.ts).
 * Follows DDD layering: this interface layer imports only from infrastructure/,
 * never from domain/.
 *
 * @module interface/mcp/tools/agentWorkLogTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Database } from "bun:sqlite";

import {
  logAgentWorkStart,
  logAgentWorkEnd,
  getAgentWorkLog,
} from "../../../infrastructure/db/agentWorkLogStore.js";
import { getDb } from "../../../infrastructure/db/schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register agent work log MCP tools.
 *
 * Registers: log_agent_work, get_agent_work_log
 *
 * @param server  The McpServer instance to register tools on.
 * @param _db     Optional Database override (used in tests for in-memory DB).
 *                When omitted, the production DB from getDb() is used.
 */
export function registerAgentWorkLogTools(
  server: McpServer,
  _db?: Database,
): void {
  // ── log_agent_work ────────────────────────────────────────────────────────
  server.tool(
    "log_agent_work",
    "Log an agent work session lifecycle event. " +
      "Use status='running' at session start (returns { id }). " +
      "Use status='completed' or status='error' at session end, passing the id " +
      "returned by the start call.",
    {
      agent_name: z
        .string()
        .min(1)
        .describe("Name of the agent logging this session (e.g. 'unified-agent')"),
      session_id: z
        .string()
        .optional()
        .describe("Optional caller-supplied session identifier (e.g. cron run id)"),
      id: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          "Row id returned by a prior status='running' call. " +
            "Required when status is 'completed' or 'error'.",
        ),
      summary: z
        .string()
        .optional()
        .describe("Short one-line description of what the session did"),
      findings: z
        .string()
        .optional()
        .describe("Free-form notes on what was found (signals, alerts, issues)"),
      actions: z
        .union([z.array(z.unknown()), z.record(z.unknown())])
        .optional()
        .describe("Actions taken during the session (serialised to JSON)"),
      status: z
        .enum(["running", "completed", "error"])
        .describe(
          "Session status. 'running' = session start. 'completed'/'error' = session end.",
        ),
    },
    async ({ agent_name, session_id, id, summary, findings, actions, status }) => {
      try {
        const db = _db ?? getDb();

        if (status === "running") {
          const newId = logAgentWorkStart(db, agent_name, session_id);
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ id: newId }, null, 2),
              },
            ],
          };
        }

        // status is 'completed' or 'error' — id is required
        if (id === undefined || id === null) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    error:
                      "id is required when status is 'completed' or 'error'. " +
                      "Pass the id returned by the status='running' call.",
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        const actionsJson =
          actions !== undefined ? JSON.stringify(actions) : null;

        logAgentWorkEnd(
          db,
          id,
          summary ?? null,
          findings ?? null,
          actionsJson,
          status,
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ ok: true, id }, null, 2),
            },
          ],
        };
      } catch (err) {
        console.error("[log_agent_work] Error:", err);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  error: `log_agent_work failed: ${err instanceof Error ? err.message : String(err)}`,
                },
                null,
                2,
              ),
            },
          ],
        };
      }
    },
  );

  // ── get_agent_work_log ────────────────────────────────────────────────────
  server.tool(
    "get_agent_work_log",
    "Query agent work history. Returns entries ordered by started_at DESC " +
      "(most recent first). All parameters are optional.",
    {
      agent_name: z
        .string()
        .optional()
        .describe("Filter to a specific agent (e.g. 'unified-agent'). Omit for all agents."),
      days: z
        .number()
        .int()
        .positive()
        .default(7)
        .describe("Return only rows started within the last N days (default: 7)"),
      limit: z
        .number()
        .int()
        .positive()
        .max(200)
        .default(20)
        .describe("Maximum number of rows to return (default: 20, max: 200)"),
    },
    async ({ agent_name, days, limit }) => {
      try {
        const db = _db ?? getDb();

        const opts: {
          agentName?: string;
          days?: number;
          limit?: number;
        } = {
          days: days ?? 7,
          limit: limit ?? 20,
        };
        if (agent_name !== undefined) {
          opts.agentName = agent_name;
        }
        const entries = getAgentWorkLog(db, opts);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(entries, null, 2),
            },
          ],
        };
      } catch (err) {
        console.error("[get_agent_work_log] Error:", err);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  error: `get_agent_work_log failed: ${err instanceof Error ? err.message : String(err)}`,
                },
                null,
                2,
              ),
            },
          ],
        };
      }
    },
  );
}
