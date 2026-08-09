/**
 * Coordination Tools — Task-Lock System Phase 1
 *
 * 6 MCP tools for cross-session agent coordination:
 *   1. task_claim              — Claim a lock before exclusive work
 *   2. task_heartbeat          — Renew a held lock (prove-alive)
 *   3. task_release            — Release a lock on completion
 *   4. task_list_held          — List current locks for debugging
 *   5. task_force_release_orphan — Release a stale orphaned lock
 *   6. get_week_period         — Canonical ISO-week period (publish-gate dedup key)
 *
 * Session identity model (P1-MCP-2 / P1-MCP-3, CROSS-SESSION-MULTI-TEAM-ORCH):
 *   owner_client_session (AUTHORITATIVE): per-CLAUDE_CODE_SESSION_ID UUID.
 *     Supplied by the CALLER via the tool input field; NOT injected server-side.
 *     This is the ownership discriminator that makes cross-session collision prevention
 *     work correctly when multiple Claude Code terminals run the same logical agent.
 *
 *   owner_session (DIAGNOSTIC): server-side process discriminator (pid + boot timestamp).
 *     Server-injected for diagnostics only. MUST NOT be used as the ownership key.
 *
 * Security note:
 *   owner_client_session is a coordination PARAMETER agreed to among cooperative
 *   internal agents. It is NEVER logged or echoed as a credential.
 *
 * FIX-CI-SIZELINT-COORDINATIONTOOLS-TS-457L (2026-08-09): this file used to hold all 6 tool
 * bodies inline (457L, over the 426L baseline-tolerance cap) — each tool's implementation was
 * split verbatim (zero logic change) into its own file under ./coordination/, one per tool.
 * This file is now the thin entry point that preserves the public `registerCoordinationTools`
 * export every caller/test imports.
 *
 * @module interface/mcp/tools/system/coordinationTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTaskClaimTool } from "./coordination/taskClaimTool.js";
import { registerTaskHeartbeatTool } from "./coordination/taskHeartbeatTool.js";
import { registerTaskReleaseTool } from "./coordination/taskReleaseTool.js";
import { registerTaskListHeldTool } from "./coordination/taskListHeldTool.js";
import { registerTaskForceReleaseOrphanTool } from "./coordination/taskForceReleaseOrphanTool.js";
import { registerWeekPeriodTool } from "./coordination/weekPeriodTool.js";

/**
 * Register all 6 coordination tools on the MCP server.
 *
 * @param server The McpServer instance to register tools on.
 */
export function registerCoordinationTools(server: McpServer): void {
  registerTaskClaimTool(server);
  registerTaskHeartbeatTool(server);
  registerTaskReleaseTool(server);
  registerTaskListHeldTool(server);
  registerTaskForceReleaseOrphanTool(server);
  registerWeekPeriodTool(server);
}
