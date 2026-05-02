/**
 * MCP Tool: smart_compact
 *
 * Summarize the latest Claude session JSONL into a compact memory file
 * using the claude CLI. Fire-and-forget.
 *
 * Parameters:
 *   session_path — optional absolute path to a specific session .jsonl file.
 *                  Omit to use the most recently modified session for this project.
 *
 * Returns:
 *   { success: true, sessionFile, memoryFile } on success
 *   { success: false, error } on failure
 *
 * @module interface/mcp/tools/system/smartCompactTool
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { spawnSmartCompact } from "../../../../infrastructure/agents/smartCompactSpawner.js";

export function registerSmartCompactTool(server: McpServer): void {
  server.tool(
    "smart_compact",
    "Summarize the latest Claude session JSONL into a compact memory file " +
      "using the claude CLI. Fire-and-forget. Returns { success, sessionFile, memoryFile } " +
      "or { success: false, error }. Call at sprint boundaries or before context offload.",
    {
      session_path: z
        .string()
        .optional()
        .describe(
          "Absolute path to a specific session .jsonl file. " +
            "Omit to use the most recently modified session for this project."
        ),
    },
    async (args) => {
      const result = await spawnSmartCompact(args.session_path);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
