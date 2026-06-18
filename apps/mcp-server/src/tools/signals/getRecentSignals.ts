/**
 * getRecentSignals — DMS-1 + DMS-2 shared helper
 *
 * Cross-producer signal query for the last `windowSeconds` seconds.
 * Used by:
 *   - DMS-1 (Root B): news-scout SIBLING_WINDOW_CACHE dedup gate
 *   - DMS-2 (Root C): market-watcher sibling-success corroboration gate
 *
 * Returns ALL producers' committed/published/read signals in the given window.
 * Does NOT mark signals as read (no side effects).
 *
 * @module tools/signals/getRecentSignals
 */

import type { Database } from "bun:sqlite";
import type { AgentSignal } from "../../infrastructure/db/agentSignalStore.js";

/** Raw row from agent_signals (minimal columns needed for dedup + corroboration). */
interface RawRecentRow {
  id: number;
  from_agent: string;
  to_agent: string;
  signal_type: string;
  stock_code: string | null;
  payload: string;
  status: string;
  created_at: string;
  expires_at: string;
}

/**
 * Query all producers' signals committed in the last `windowSeconds` seconds.
 *
 * Filters:
 *   - created_at >= now - windowSeconds
 *   - status IN ('committed', 'published', 'read')  — excludes 'unread' draft rows
 *   - NOT constrained by expires_at (window is creation-time based, not TTL)
 *
 * Does NOT apply read-mark side effects.
 *
 * @param db            - Active bun:sqlite Database connection
 * @param windowSeconds - Look-back window in seconds (default 900 = 15 minutes)
 * @returns             Array of AgentSignal rows, newest-first
 */
export function getRecentSignals(
  db: Database,
  windowSeconds: number = 900,
): AgentSignal[] {
  // Compute cutoff in SQLite datetime format: "YYYY-MM-DD HH:MM:SS"
  const cutoff = new Date(Date.now() - windowSeconds * 1000)
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d{3}Z$/, "");

  // Check whether validation columns exist (same guard used throughout the codebase).
  let hasValidationColumns = false;
  try {
    db.prepare("SELECT confidence_score, validated_at FROM agent_signals LIMIT 0").all();
    hasValidationColumns = true;
  } catch {
    hasValidationColumns = false;
  }

  const validationColumns = hasValidationColumns
    ? ", confidence_score, validated_at"
    : "";

  type RawRow = RawRecentRow & {
    confidence_score?: number;
    validated_at?: string;
  };

  const rows = db
    .query<RawRow, [string]>(
      `SELECT id, from_agent, to_agent, signal_type, stock_code, payload, status,
              created_at, expires_at${validationColumns}
       FROM agent_signals
       WHERE created_at >= ?
         AND status IN ('committed', 'published', 'read')
       ORDER BY created_at DESC`,
    )
    .all(cutoff) as RawRow[];

  return rows.map((r) => {
    let payload: import("../../infrastructure/db/agentSignalStore.js").SignalPayload = {};
    try {
      payload = JSON.parse(r.payload) as import("../../infrastructure/db/agentSignalStore.js").SignalPayload;
    } catch {
      // malformed payload — return empty object (non-fatal)
    }

    const signal: AgentSignal = {
      id: r.id,
      fromAgent: r.from_agent,
      toAgent: r.to_agent,
      signalType: r.signal_type as import("../../infrastructure/db/agentSignalStore.js").SignalType,
      stockCode: r.stock_code,
      payload,
      status: r.status as "unread" | "read",
      createdAt: r.created_at,
      expiresAt: r.expires_at,
    };

    if (hasValidationColumns) {
      if (r.confidence_score !== undefined) signal.confidence_score = r.confidence_score;
      if (r.validated_at !== undefined) signal.validated_at = r.validated_at;
    }

    return signal;
  });
}
