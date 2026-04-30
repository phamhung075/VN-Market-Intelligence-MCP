/**
 * MCP Tool: restart_vps_service
 *
 * Restart a named service on the Vinahost VPS via SSH.
 * Delegates to vpsServiceRestartHandler which enforces a three-layer allowlist.
 *
 * Allowed services: price-fetcher, foreign-flow-fetcher, bctc-fetcher
 *
 * Parameters:
 *   service — one of the three allowed service names
 *
 * Returns:
 *   { success, service, stdout } on success
 *   { success: false, service, exitCode, stderr } on SSH non-zero exit
 *   { error } on invalid input, disallowed service, or thrown error
 *
 * @module interface/mcp/tools/system/vpsServiceRestartTool
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { vpsServiceRestartHandler } from "../../vpsServiceRestartHandler.js";

export function registerVpsServiceRestartTool(server: McpServer): void {
  server.tool(
    "restart_vps_service",
    "Restart a named service on the Vinahost VPS via SSH. Allowed: price-fetcher, foreign-flow-fetcher, bctc-fetcher.",
    {
      service: z
        .string()
        .describe("Service name to restart. Must be one of: price-fetcher, foreign-flow-fetcher, bctc-fetcher."),
    },
    async ({ service }) => {
      const result = await vpsServiceRestartHandler({ service });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );
}
