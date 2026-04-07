/**
 * Task 210 — Source Health MCP Tool
 *
 * Interface layer: registers the `get_source_health` MCP tool which displays
 * the health status of all tracked news/data sources.
 *
 * Also exports `formatSourceHealthTable` as a pure formatting helper so that
 * unit tests can verify output without starting an MCP server.
 *
 * @module interface/mcp/tools/sourceHealthTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SourceHealth } from "../../../domain/services/sourceHealthTracker.js";
import { SourceHealthTracker } from "../../../domain/services/sourceHealthTracker.js";

// ─────────────────────────────────────────────────────────────────────────────
// Singleton tracker — shared across the process lifetime
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Global singleton instance of SourceHealthTracker.
 *
 * Stashed on `globalThis` so that `bun --hot` module reloads do NOT wipe
 * the in-memory health state. Without this, every hot-reload of pollNews.ts
 * (or any module that transitively re-imports sourceHealthTools.ts) creates
 * a fresh tracker with `lastSuccessAt = null` for all sources, causing the
 * SOURCE HEALTH table to show "Chua bao gio" even though fetchers are running
 * successfully (regression reported in Loop #36, report 1003).
 *
 * Application-layer modules (e.g. pollNews.ts) import and use this directly:
 *
 * ```typescript
 * import { globalSourceTracker } from '../../interface/mcp/tools/sourceHealthTools.js';
 * globalSourceTracker.recordSuccess("CafeF RSS");
 * ```
 */
const GLOBAL_TRACKER_KEY = "__vnMarketSourceHealthTracker__";
type GlobalWithTracker = typeof globalThis & {
  [GLOBAL_TRACKER_KEY]?: SourceHealthTracker;
};
const _g = globalThis as GlobalWithTracker;
export const globalSourceTracker: SourceHealthTracker =
  _g[GLOBAL_TRACKER_KEY] ?? (_g[GLOBAL_TRACKER_KEY] = new SourceHealthTracker());

// Pre-seed the 5 known news sources so get_system_status / get_source_health
// return rows immediately on a fresh process — before the first pollNews
// tick has fired. The names match what pollNews uses in its sourceEntries.
globalSourceTracker.seedKnownSources([
  "CafeF RSS",
  "VnExpress RSS",
  "VnEconomy RSS",
  "Reuters RSS",
  "Trading Economics",
]);

// ─────────────────────────────────────────────────────────────────────────────
// Vietnamese status labels
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  ok: "OK",
  degraded: "Suy giam",
  down: "Ngung",
};

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helper (exported for tests)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format an array of SourceHealth records as a Vietnamese plain-text table.
 *
 * Example output:
 * ```
 * Tinh trang nguon du lieu
 * ========================
 *
 * Nguon              | Trang thai | Lan cuoi thanh cong | Loi lien tiep
 * -------------------|------------|---------------------|---------------
 * CafeF RSS          | OK         | 5 phut truoc        | 0
 * Google News        | Suy giam   | 2 gio truoc         | 3
 * Trading Economics  | Ngung      | 6 gio truoc         | 7 ⚠
 * ```
 *
 * @param sources - Array of SourceHealth records (from getAllHealth()).
 * @returns        Formatted plain-text table string.
 */
export function formatSourceHealthTable(sources: SourceHealth[]): string {
  if (sources.length === 0) {
    return "Tinh trang nguon du lieu\n========================\n\nChua co du lieu. Chua co nguon nao duoc theo doi.";
  }

  const lines: string[] = [
    "Tinh trang nguon du lieu",
    "========================",
    "",
    "Nguon              | Trang thai | Lan cuoi thanh cong | Loi lien tiep",
    "-------------------|------------|---------------------|---------------",
  ];

  for (const s of sources) {
    const statusLabel = STATUS_LABEL[s.status] ?? s.status;
    const lastSuccess = formatRelativeTime(s.lastSuccessAt);
    const failures = s.consecutiveFailures;
    const warn = s.status === "down" ? " ⚠" : "";

    // Pad columns for alignment
    const name = s.source.padEnd(18).slice(0, 18);
    const status = statusLabel.padEnd(10).slice(0, 10);
    const lastOk = lastSuccess.padEnd(21).slice(0, 21);
    const failStr = `${failures}${warn}`;

    lines.push(`${name} | ${status} | ${lastOk} | ${failStr}`);
  }

  lines.push("");
  lines.push(`Cap nhat luc: ${new Date().toISOString()}`);

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert an ISO timestamp to a Vietnamese relative-time string.
 *
 * @param isoString - ISO-8601 timestamp or null.
 * @returns           Human-readable relative string, e.g. "5 phut truoc".
 */
function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return "Chua bao gio";

  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return `${diffSec} giay truoc`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} phut truoc`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} gio truoc`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay} ngay truoc`;
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
 * The underlying logic (`globalSourceTracker`, `formatSourceHealthTable`) is
 * still exported and used by `systemTools.ts → getSystemStatus()`.
 *
 * @param _server - The McpServer instance (unused — no tools registered here).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function registerSourceHealthTools(_server: McpServer): void {
  // get_source_health removed — merged into get_system_status (task 234)
}
