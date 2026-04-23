/**
 * Signal Rejection Audit Store — Task 1293c
 *
 * Stores rejected signal payloads from post_agent_signal MCP tool validation.
 * Provides diagnostic queries to identify agent prompt failures and validation patterns.
 *
 * @module infrastructure/db/signalRejectionStore
 */

import type { Database } from "bun:sqlite";

/**
 * Represents a single signal rejection record from the database.
 */
export interface SignalRejection {
  id: number;
  from_agent: string;
  signal_type: string;
  stock_code: string | null;
  reason: string;
  payload_preview: string | null;
  created_at: string;
}

/**
 * Log a rejected signal to the audit table.
 *
 * Called by post_agent_signal MCP tool when validation fails.
 * Uses parameterized binding to prevent SQL injection.
 *
 * @param db - Database instance
 * @param params - Rejection details
 * @param params.from_agent - Sending agent name (e.g., "news_scout")
 * @param params.signal_type - Signal type (e.g., "chain_catalyst")
 * @param params.stock_code - Stock code (optional)
 * @param params.reason - Validation error message
 * @param params.payload_preview - First 200 chars of payload JSON
 */
export function logSignalRejection(
  db: Database,
  params: {
    from_agent: string;
    signal_type: string;
    stock_code?: string;
    reason: string;
    payload_preview: string;
  },
): void {
  const stmt = db.prepare(`
    INSERT INTO signal_rejections
      (from_agent, signal_type, stock_code, reason, payload_preview, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `);

  stmt.run(
    params.from_agent,
    params.signal_type,
    params.stock_code ?? null,
    params.reason,
    params.payload_preview,
  );
}

/**
 * Get rejection count summary by agent for a time window.
 *
 * Used by get_signal_rejection_summary MCP tool for diagnostics.
 *
 * @param db - Database instance
 * @param hours - Look back N hours (default 24)
 * @returns Map of agent name → rejection count
 */
export function getSignalRejectionSummary(
  db: Database,
  hours: number = 24,
): Record<string, number> {
  const cutoff = new Date(Date.now() - hours * 3600000).toISOString();

  const rows = db
    .prepare(`
      SELECT from_agent, COUNT(*) as count
      FROM signal_rejections
      WHERE created_at >= ?
      GROUP BY from_agent
      ORDER BY count DESC
    `)
    .all(cutoff) as Array<{ from_agent: string; count: number }>;

  const summary: Record<string, number> = {};
  rows.forEach((row) => {
    summary[row.from_agent] = row.count;
  });

  return summary;
}

/**
 * Get detailed rejection records for a specific agent.
 *
 * Used by get_signal_rejection_summary MCP tool when filtering by agent.
 * Returns up to 50 most recent rejections (reverse chronological).
 *
 * @param db - Database instance
 * @param from_agent - Agent name to filter by
 * @param hours - Look back N hours (default 24)
 * @returns Array of rejection records, newest first, limited to 50
 */
export function getSignalRejectionDetails(
  db: Database,
  from_agent: string,
  hours: number = 24,
): SignalRejection[] {
  const cutoff = new Date(Date.now() - hours * 3600000).toISOString();

  return db
    .prepare(`
      SELECT *
      FROM signal_rejections
      WHERE from_agent = ? AND created_at >= ?
      ORDER BY created_at DESC
      LIMIT 50
    `)
    .all(from_agent, cutoff) as SignalRejection[];
}
