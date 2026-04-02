/**
 * Interface — Rate Limit Status MCP Tool (Task 207)
 *
 * Exposes the current rate-limit state of all tracked external API sources.
 * Useful for debugging and monitoring during the intelligence cycle.
 *
 * Tool: get_rate_limit_status
 *   → Returns a table of hosts, last call time, cooldown remaining, status.
 *
 * Layer: interface/mcp/tools — calls domain service, no direct I/O.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { globalRateLimiter, DEFAULT_INTERVALS } from "../../../domain/services/rateLimiter.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Formats elapsed milliseconds into a human-readable Vietnamese string. */
function formatElapsed(ms: number): string {
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec} giay truoc`;
  const min = Math.round(sec / 60);
  return `${min} phut truoc`;
}

/** Formats remaining wait milliseconds into a short string. */
function formatWait(waitMs: number): string {
  if (waitMs === 0) return "0s";
  const sec = Math.ceil(waitMs / 1000);
  return `${sec}s`;
}

/** Truncates a host string to fit within the display column. */
function truncateHost(host: string, maxLen: number): string {
  if (host.length <= maxLen) return host.padEnd(maxLen);
  return host.slice(0, maxLen - 1) + "…";
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

/**
 * Registers the `get_rate_limit_status` MCP tool on the given server.
 *
 * Output format (plain text, Vietnamese labels):
 * ```
 * Trang thai gioi han API
 *
 * Host                    | Cuoi cung     | Cho    | Trang thai
 * cafef.vn                | 15 giay truoc | 0s     | San sang
 * api-finfo.vndirect.com  | 2 giay truoc  | 3s     | Cho
 * tradingeconomics.com    | 45 giay truoc | 0s     | San sang
 * ```
 *
 * Hosts that have never been called are shown with status "Chua goi".
 */
export function registerRateLimitTools(server: McpServer): void {
  server.tool(
    "get_rate_limit_status",
    "Show current rate limit status for all external API sources. Returns a table of hosts, last call time, cooldown remaining, and ready status.",
    {},
    async () => {
      const now = Date.now();
      const trackedStatus = globalRateLimiter.getStatus();

      // Build a set of all known hosts (called + configured but not yet called)
      const allHosts = new Set<string>([
        ...Object.keys(DEFAULT_INTERVALS),
        ...trackedStatus.map((s) => s.host),
      ]);

      // Merge tracked state with un-called hosts
      const rows: Array<{
        host: string;
        lastCallMs: number | null;
        waitMs: number;
        ready: boolean;
        neverCalled: boolean;
      }> = [];

      const trackedByHost = new Map(trackedStatus.map((s) => [s.host, s]));

      for (const host of [...allHosts].sort()) {
        const tracked = trackedByHost.get(host);
        if (tracked) {
          rows.push({
            host,
            lastCallMs: tracked.lastCallMs,
            waitMs: tracked.waitMs,
            ready: tracked.ready,
            neverCalled: false,
          });
        } else {
          rows.push({
            host,
            lastCallMs: null,
            waitMs: 0,
            ready: true,
            neverCalled: true,
          });
        }
      }

      // Format table
      const COL_HOST = 26;
      const COL_LAST = 15;
      const COL_WAIT = 8;

      const header =
        truncateHost("Host", COL_HOST) +
        "| " +
        "Cuoi cung".padEnd(COL_LAST) +
        "| " +
        "Cho".padEnd(COL_WAIT) +
        "| Trang thai";

      const separator = "-".repeat(header.length);

      const dataRows = rows.map((r) => {
        const hostCol = truncateHost(r.host, COL_HOST);
        const lastCol = r.neverCalled
          ? "Chua goi".padEnd(COL_LAST)
          : formatElapsed(now - (r.lastCallMs ?? now)).padEnd(COL_LAST);
        const waitCol = formatWait(r.waitMs).padEnd(COL_WAIT);
        const statusCol = r.neverCalled
          ? "Chua goi"
          : r.ready
            ? "San sang"
            : "Cho";
        return `${hostCol}| ${lastCol}| ${waitCol}| ${statusCol}`;
      });

      const table = [
        "Trang thai gioi han API",
        "",
        header,
        separator,
        ...dataRows,
        "",
        `Tong: ${rows.length} nguon | San sang: ${rows.filter((r) => r.ready).length} | Dang cho: ${rows.filter((r) => !r.ready).length}`,
      ].join("\n");

      return {
        content: [{ type: "text" as const, text: table }],
      };
    },
  );
}
