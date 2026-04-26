/**
 * Task 1134 — get_foreign_flow MCP Tool
 * Task 1283a — diagnose & reset circuit breaker tools
 *
 * Provides the `get_foreign_flow` tool for reading daily foreign investor
 * flow history for a stock and returning an analyzed signal.
 *
 * Zero-detection guard: if all foreignVolume values are 0, returns a
 * no-data message without calling analyzeForeignFlow.
 *
 * Additionally provides diagnostic tools for the foreign flow circuit breaker
 * (Task 1283a): query breaker state and reset when stalled.
 *
 * DDD layer: interface/mcp/tools — may import infrastructure and domain.
 *
 * @module interface/mcp/tools/foreignFlowTools
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Database } from "bun:sqlite";
import { z } from "zod";
import {
  analyzeForeignFlow,
  type DailyForeignFlow,
  type ForeignFlowSignal,
} from "../../../../domain/services/foreignFlowAnalyzer.js";
import { getForeignFlowHistory } from "../../../../infrastructure/db/vnstockStore.js";
import { getDb } from "../../../../infrastructure/db/schema.js";
import { breakers } from "../../../../infrastructure/circuitBreakerRegistry.js";

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format volume as human-readable string.
 * @param vol - Volume in shares
 */
function fmtVol(vol: number): string {
  if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(2)}M`;
  if (vol >= 1_000) return `${(vol / 1_000).toFixed(1)}k`;
  return String(Math.round(vol));
}

/**
 * Format holding ratio as percentage string.
 * @param ratio - Decimal ratio, e.g. 0.30 → "30.00%"
 */
function fmtRatio(ratio: number): string {
  return `${(ratio * 100).toFixed(2)}%`;
}

/**
 * Format the full foreign flow analysis output text block.
 *
 * @param code    - Stock ticker
 * @param signal  - Result from analyzeForeignFlow
 * @param history - Raw daily history rows (sorted DESC)
 */
export function formatForeignFlowOutput(
  code: string,
  signal: ForeignFlowSignal,
  history: DailyForeignFlow[],
): string {
  const lines: string[] = [];

  lines.push(`Foreign Flow Analysis — ${code}`);
  lines.push("");

  // Signal summary
  lines.push("Signal");
  lines.push(`  Direction: ${signal.netFlowDirection}`);
  lines.push(`  Severity: ${signal.severity.toUpperCase()}`);
  lines.push(`  Consecutive days: ${signal.consecutiveDays}`);
  lines.push(`  Net volume 3d: ${signal.totalNetVolume3d >= 0 ? "+" : ""}${fmtVol(signal.totalNetVolume3d)} shares`);
  lines.push(`  Net volume 5d: ${signal.totalNetVolume5d >= 0 ? "+" : ""}${fmtVol(signal.totalNetVolume5d)} shares`);

  const ratioChange = signal.holdingRatioChange5d;
  const ratioSign = ratioChange >= 0 ? "+" : "";
  lines.push(`  Holding ratio change (5d): ${ratioSign}${(ratioChange * 100).toFixed(3)}%`);
  lines.push("");

  // Reasoning
  lines.push("Reasoning");
  lines.push(`  ${signal.reasoning}`);
  lines.push("");

  // Daily history table
  lines.push("Daily history");
  lines.push("  Date        | Net Vol (daily) | Foreign Room  | Holding Ratio");
  lines.push("  ------------|-----------------|---------------|---------------");
  for (const row of history) {
    const date = row.date.slice(0, 10).padEnd(12);
    const vol = fmtVol(row.foreignVolume).padStart(14);
    const room = fmtVol(row.foreignRoom).padStart(13);
    const ratio = fmtRatio(row.holdingRatio).padStart(15);
    lines.push(`  ${date}|${vol} |${room} |${ratio}`);
  }

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register the get_foreign_flow tool on an McpServer instance.
 *
 * @param server - The McpServer instance to register tools on.
 * @param db     - Optional database injection (defaults to getDb() for production).
 */
export function registerForeignFlowTools(
  server: McpServer,
  db?: Database,
): void {
  server.tool(
    "get_foreign_flow",
    "Retrieve and analyze foreign investor flow history for a VN stock. " +
      "Returns direction (net_buy / net_sell / neutral), severity (LOW/MEDIUM/HIGH), " +
      "consecutive streak days, net volume over 3d and 5d windows, holding ratio change, " +
      "and a daily history table. " +
      "Severity HIGH = 3+ consecutive days in same direction AND total net volume > 100k shares. " +
      "If foreign flow data has not been collected yet (all volumes are 0), returns a clear no-data message. " +
      "Data freshness depends on the VPS push-foreign-flow pipeline (Task 1132/1135).",
    {
      code: z
        .string()
        .min(1)
        .describe("Stock ticker, e.g. 'VNM', 'VCB', 'HPG'"),
      days: z
        .number()
        .int()
        .min(2)
        .max(30)
        .optional()
        .default(10)
        .describe("Number of calendar days of history to fetch (2–30, default 10)"),
    },
    async ({ code, days }) => {
      try {
        // Resolve DB — injected in tests, real getDb() in production
        const resolvedDb = db ?? getDb();

        // Fetch history from store using the injected db context.
        // getForeignFlowHistory uses getDb() internally, so for test injection
        // we call the query directly on the injected db.
        let history: DailyForeignFlow[];
        if (db) {
          // Test path: query daily_ohlcv directly on injected db.
          // ASC order to build cumulative sum; reversed to DESC for analyzeForeignFlow.
          const rows = resolvedDb
            .prepare<any, [string, number]>(
              `SELECT code,
                      date,
                      COALESCE(foreign_net_vol, 0) AS net_vol
               FROM daily_ohlcv
               WHERE code = ?
               ORDER BY date ASC
               LIMIT ?`,
            )
            .all(code, days);

          let cumsum = 0;
          const ascending: DailyForeignFlow[] = rows.map((row: any) => {
            cumsum += row.net_vol as number;
            return {
              code: row.code as string,
              date: row.date as string,
              foreignVolume: cumsum,
              foreignRoom: 0,
              holdingRatio: 0,
            };
          });
          history = ascending.reverse();
        } else {
          // Production path: use the shared store function
          history = getForeignFlowHistory(code, days);
        }

        // ── Zero-detection guard ──────────────────────────────────────────────
        // Return no-data message without calling analyzeForeignFlow if:
        //  (a) no rows at all, or
        //  (b) all foreignVolume values are 0
        if (history.length === 0 || history.every((r) => r.foreignVolume === 0)) {
          return {
            content: [
              {
                type: "text" as const,
                text:
                  `No data available for ${code}: foreign investor volume has not been collected yet. ` +
                  "Data is populated by the VPS push-foreign-flow pipeline (Task 1132/1135). " +
                  "Check back after the pipeline has run at least one day.",
              },
            ],
          };
        }

        // ── Insufficient data guard ───────────────────────────────────────────
        if (history.length < 2) {
          return {
            content: [
              {
                type: "text" as const,
                text:
                  `Insufficient foreign flow data for ${code}: only ${history.length} row(s) found. ` +
                  "At least 2 days of history are required to compute flow deltas. " +
                  "Data is populated by the VPS push-foreign-flow pipeline.",
              },
            ],
          };
        }

        // ── Analyze ───────────────────────────────────────────────────────────
        const signal = analyzeForeignFlow(history);
        if (signal === null) {
          return {
            content: [
              {
                type: "text" as const,
                text:
                  `Insufficient foreign flow data for ${code}: analysis returned null. ` +
                  "At least 2 days of history with non-zero volume are required.",
              },
            ],
          };
        }

        // ── Format and return ─────────────────────────────────────────────────
        const text = formatForeignFlowOutput(code, signal, history);
        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[get_foreign_flow] Error for ${code}:`, msg);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error retrieving foreign flow data for ${code}: ${msg}`,
            },
          ],
        };
      }
    },
  );

  // Task 1283b: Register circuit breaker diagnostics tools
  server.tool(
    "diagnose_foreign_flow_circuit_breaker",
    "Query the foreign flow circuit breaker state: current status (closed/open/half-open), " +
      "failure count, last failure timestamp, and reset timeout. " +
      "Use this to debug when foreign flow data stops ingesting. " +
      "No parameters required.",
    {},
    async () => {
      return await diagnose_foreign_flow_circuit_breaker();
    },
  );

  server.tool(
    "reset_foreign_flow_circuit_breaker",
    "Manually reset the foreign flow circuit breaker to closed state. " +
      "Only call if OPS has confirmed the underlying issue is fixed (e.g., VPS endpoint responding). " +
      "Warning: idempotent, but only use after verifying the pipeline is healthy. " +
      "No parameters required.",
    {},
    async () => {
      return await reset_foreign_flow_circuit_breaker();
    },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Task 1283b: Circuit Breaker Diagnostics Tools (GREEN implementation)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Query the foreign flow circuit breaker state and return diagnostic information.
 *
 * Returns:
 * - Current state (closed/open/half-open)
 * - Failure count
 * - Success count
 * - Last failure timestamp (ISO format or null)
 * - Reset timeout configuration
 *
 * Use case: Operator debugging when foreign flow data stops ingesting.
 * Related incident: Task 1283 — VPS service stalled 2026-04-22 07:36:55+.
 */
export async function diagnose_foreign_flow_circuit_breaker(): Promise<{
  content: Array<{ type: "text"; text: string }>;
}> {
  const cb = breakers.foreignFlow;
  const stats = cb.stats;

  const lines: string[] = [];

  lines.push("Foreign Flow Circuit Breaker Diagnostics");
  lines.push("========================================");

  // State line with interpretation
  const stateInterpretation =
    stats.state === "closed"
      ? "(healthy — ingesting normally)"
      : stats.state === "open"
        ? "(circuit TRIPPED — foreign flow disabled)"
        : "(testing — limited attempts allowed)";
  lines.push(`Status: ${stats.state} ${stateInterpretation}`);

  // Failures line with threshold
  lines.push(`Consecutive failures: ${stats.failures}/5 (threshold for trip)`);

  // Successes line
  lines.push(`Total successes: ${stats.successes}`);

  // Last failure timestamp
  if (stats.lastFailure) {
    lines.push(`Last failure: ${stats.lastFailure}`);
  } else {
    lines.push("Last failure: Never failed (healthy)");
  }

  // Reset timeout info (only if open)
  if (stats.state === "open") {
    const resetTimeoutMs = stats.resetTimeoutMs;
    let remainingMs = resetTimeoutMs;
    if (stats.openedAt) {
      const elapsedMs = Date.now() - new Date(stats.openedAt).getTime();
      remainingMs = Math.max(0, resetTimeoutMs - elapsedMs);
    }
    const remainingSec = Math.round(remainingMs / 1000);
    lines.push(
      `Will auto-transition to half-open in ~${remainingSec}s (resetTimeout: ${resetTimeoutMs / 1000}s)`,
    );
  }

  return {
    content: [
      {
        type: "text" as const,
        text: lines.join("\n"),
      },
    ],
  };
}

/**
 * Reset the foreign flow circuit breaker from open to closed state.
 *
 * Manual intervention tool for operators. Clears all failure counters
 * and transitions the breaker to closed state regardless of current state.
 *
 * Effect: Clears failure counter, transitions state to closed, allows new attempts.
 * Idempotent: Safe to call multiple times.
 *
 * Use case: Manual recovery when OPS repairs the foreign flow pipeline.
 * Related incident: Task 1283 — Foreign flow service recovery.
 */
export async function reset_foreign_flow_circuit_breaker(): Promise<{
  content: Array<{ type: "text"; text: string }>;
}> {
  const cb = breakers.foreignFlow;
  const stateBefore = cb.state;

  // Reset the circuit breaker
  cb.reset();

  const lines: string[] = [];

  if (stateBefore === "closed") {
    // Idempotency: already closed, no action needed
    lines.push("Circuit is already closed (healthy). No action needed.");
  } else {
    // Was open or half-open, now closed
    lines.push("Reset complete. State: closed. Failure counter: 0. Ready to resume foreign flow ingestion.");
  }

  return {
    content: [
      {
        type: "text" as const,
        text: lines.join("\n"),
      },
    ],
  };
}
