/**
 * Task 210 — Source Health MCP Tool
 *
 * Interface layer: registers the `get_source_health` MCP tool which displays
 * the health status of all tracked news/data sources.
 *
 * Also exports `formatSourceHealthTable` as a pure formatting helper so that
 * unit tests can verify output without starting an MCP server.
 *
 * FACTORY-APP-pollNews-layering-fix (2026-07-24): the stateful
 * `globalSourceTracker` singleton (+ `_resetGlobalSourceTracker`) previously
 * defined here moved to `infrastructure/observability/sourceHealthRegistry.ts`
 * — a stateful cross-cutting tracker belongs in the infrastructure layer, not
 * the interface layer. This file now holds only pure rendering helpers.
 *
 * @module interface/mcp/tools/sourceHealthTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SourceHealth } from "../../../../domain/services/sourceHealthTracker.js";

// ─────────────────────────────────────────────────────────────────────────────
// Vietnamese status labels
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  ok: "OK",
  degraded: "Suy giảm",
  down: "Ngưng",
};

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helper (exported for tests)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format an array of SourceHealth records as a Vietnamese plain-text table.
 *
 * Example output:
 * ```
 * Tình trạng nguồn dữ liệu
 * ========================
 *
 * Nguồn              | Trạng thái | Lần cuối thành công | Lỗi liên tiếp
 * -------------------|------------|---------------------|---------------
 * CafeF RSS          | OK         | 5 phút trước        | 0
 * Google News        | Suy giảm   | 2 giờ trước         | 3
 * Trading Economics  | Ngưng      | 6 giờ trước         | 7 ⚠
 * ```
 *
 * @param sources - Array of SourceHealth records (from getAllHealth()).
 * @returns        Formatted plain-text table string.
 */
// FIX-NEWS-CB-FALSE-CLOSED (2026-07-08): column width was 18 chars — too
// narrow to fit "Trading Economics News" (22 chars). Both "Trading Economics"
// (17 chars) and "Trading Economics News" (22 chars) truncated to the
// identical 18-char string "Trading Economics ", so two genuinely distinct
// tracked sources rendered as a byte-identical duplicate-looking row. Widened
// to fit the longest known display name with headroom for future names, and
// the header/separator are now derived from the same constant so this class
// of drift cannot recur.
const NAME_COL_WIDTH = 26;
const STATUS_COL_WIDTH = 10;
const LAST_OK_COL_WIDTH = 21;

export function formatSourceHealthTable(sources: SourceHealth[]): string {
  if (sources.length === 0) {
    return "Tình trạng nguồn dữ liệu\n========================\n\nChưa có dữ liệu. Chưa có nguồn nào được theo dõi.";
  }

  const nameHeader = "Nguồn".padEnd(NAME_COL_WIDTH);
  const statusHeader = "Trạng thái".padEnd(STATUS_COL_WIDTH);
  const lastOkHeader = "Lần cuối thành công".padEnd(LAST_OK_COL_WIDTH);

  const lines: string[] = [
    "Tình trạng nguồn dữ liệu",
    "========================",
    "",
    `${nameHeader} | ${statusHeader} | ${lastOkHeader} | Lỗi liên tiếp`,
    `${"-".repeat(NAME_COL_WIDTH)}|${"-".repeat(STATUS_COL_WIDTH + 2)}|${"-".repeat(LAST_OK_COL_WIDTH + 2)}|---------------`,
  ];

  for (const s of sources) {
    const statusLabel = STATUS_LABEL[s.status] ?? s.status;
    const lastSuccess = formatRelativeTime(s.lastSuccessAt);
    const failures = s.consecutiveFailures;
    const warn = s.status === "down" ? " ⚠" : "";

    // Pad columns for alignment. NAME_COL_WIDTH must stay >= the longest
    // known source display name (currently "Trading Economics News", 22
    // chars) so distinct sources never truncate into an identical string.
    const name = s.source.padEnd(NAME_COL_WIDTH).slice(0, NAME_COL_WIDTH);
    const status = statusLabel.padEnd(STATUS_COL_WIDTH).slice(0, STATUS_COL_WIDTH);
    const lastOk = lastSuccess.padEnd(LAST_OK_COL_WIDTH).slice(0, LAST_OK_COL_WIDTH);
    const failStr = `${failures}${warn}`;

    lines.push(`${name} | ${status} | ${lastOk} | ${failStr}`);
  }

  lines.push("");
  lines.push(`Cập nhật lúc: ${new Date().toISOString()}`);

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert an ISO timestamp to a Vietnamese relative-time string.
 *
 * @param isoString - ISO-8601 timestamp or null.
 * @returns           Human-readable relative string, e.g. "5 phút trước".
 */
function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return "Chưa bao giờ";

  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return `${diffSec} giây trước`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} phút trước`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} giờ trước`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay} ngày trước`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register source health tools.
 *
 * NOTE (sprint-036 task 234): `get_source_health` has been merged into
 * `get_system_status`. This function is kept as a no-op so that existing
 * imports in server.ts continue to compile without modification.
 *
 * `formatSourceHealthTable` is still exported and used by
 * `systemTools.ts → getSystemStatus()` (paired with `globalSourceTracker`
 * from `infrastructure/observability/sourceHealthRegistry.ts`).
 *
 * @param _server - The McpServer instance (unused — no tools registered here).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function registerSourceHealthTools(_server: McpServer): void {
  // get_source_health removed — merged into get_system_status (task 234)
}
