/**
 * Track Session Tool Usage — Sprint 1299c
 *
 * Scheduler layer. Reads sessionToolCache snapshot, aggregates per-tool
 * session counts, writes to docs/agent-memory/modules/tool-usage-stats.json.
 *
 * Runs every 8h (matches cache TTL).
 * Accepts an injected cache for testability (TC-7, TC-8).
 * No blocking I/O on the SSE request path.
 *
 * @module scheduler/system/trackSessionToolUsageJob
 */

import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { sessionToolCache, type SessionToolCache } from "../../infrastructure/cache/sessionToolCache.js";
import { getProjectRoot } from "../../infrastructure/projectRoot.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ToolUsageStats {
  /** ISO timestamp when stats were generated. */
  generatedAt: string;
  /** Number of active (non-expired) sessions in the snapshot. */
  sessionCount: number;
  /** Number of distinct tool names seen across all sessions. */
  uniqueTools: number;
  /** tool_name → number of sessions that loaded it. */
  toolCounts: Record<string, number>;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const OUTPUT_PATH = join(
  getProjectRoot(),
  "docs/agent-memory/modules/tool-usage-stats.json"
);

// ── trackSessionToolUsageJob ──────────────────────────────────────────────────

/**
 * Aggregate tool usage from the session cache and write stats to disk.
 *
 * @param cache - Cache instance to read from (defaults to production singleton).
 * @returns Computed ToolUsageStats (also written to OUTPUT_PATH).
 */
export async function trackSessionToolUsageJob(
  cache: SessionToolCache = sessionToolCache
): Promise<ToolUsageStats> {
  const snap = cache.snapshot();
  const toolCounts: Record<string, number> = {};

  for (const entry of Object.values(snap)) {
    for (const tool of entry.toolNames) {
      toolCounts[tool] = (toolCounts[tool] ?? 0) + 1;
    }
  }

  const stats: ToolUsageStats = {
    generatedAt: new Date().toISOString(),
    sessionCount: Object.keys(snap).length,
    uniqueTools: Object.keys(toolCounts).length,
    toolCounts,
  };

  // Ensure output directory exists (docs/agent-memory/modules/)
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(stats, null, 2));

  return stats;
}
