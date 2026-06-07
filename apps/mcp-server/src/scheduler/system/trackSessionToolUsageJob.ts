/**
 * Track Tool Usage — Sprint TOOL-SURFACE-UPGRADE / TSU-DEV-U1
 *
 * Scheduler layer. Reads perCallCounterStore snapshot, writes aggregate
 * stats to docs/agent-memory/modules/tool-usage-stats.json.
 *
 * Replaces the sessionToolCache-based approach (Sprint 1299c).
 * Root cause: gateway dials SSE per-call and drops the connection —
 * sessionId is never populated, so sessionToolCache was always empty.
 * perCallCounterStore increments on every tool handler entry via the
 * handler-proxy installed in server.ts after registerAllTools().
 *
 * Runs every 8h. No blocking I/O on the tool execution path.
 *
 * @module scheduler/system/trackSessionToolUsageJob
 */

import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { getSnapshot as getCounterSnapshot } from "../../infrastructure/telemetry/perCallCounterStore.js";
import { getProjectRoot } from "../../infrastructure/projectRoot.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ToolUsageStats {
  /** ISO timestamp when stats were generated. */
  generatedAt: string;
  /** Number of distinct tool names seen since last reset. */
  uniqueTools: number;
  /** tool_name → number of invocations since last reset. */
  toolCounts: Record<string, number>;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const OUTPUT_PATH = join(
  getProjectRoot(),
  "docs/agent-memory/modules/tool-usage-stats.json"
);

// ── trackSessionToolUsageJob ──────────────────────────────────────────────────

/**
 * Aggregate per-call tool usage from the counter store and write stats to disk.
 *
 * @returns Computed ToolUsageStats (also written to OUTPUT_PATH).
 */
export async function trackSessionToolUsageJob(): Promise<ToolUsageStats> {
  const toolCounts = getCounterSnapshot();

  const stats: ToolUsageStats = {
    generatedAt: new Date().toISOString(),
    uniqueTools: Object.keys(toolCounts).length,
    toolCounts,
  };

  // Ensure output directory exists (docs/agent-memory/modules/)
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(stats, null, 2));

  return stats;
}
