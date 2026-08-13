/** getSignals() — retrieve pending signals for an agent (query-seam split of agentSignalStore.ts). */

import type { Database } from "bun:sqlite";
import type { AgentSignal, SignalType } from "./types.js";

/** Options for filtering getSignals results. */
export interface GetSignalsOptions {
  /** "unread" (default) returns only unread; "all" returns all statuses. */
  status?: "unread" | "all";
  /**
   * When set, filters by sender (from_agent = ?) instead of the standard
   * recipient filter. Used for sender-history / dedup lookups. Read-mark
   * side-effect is suppressed when this is provided.
   */
  fromAgent?: string;
  /**
   * When set, restricts results to signals created within the last N minutes
   * (based on created_at). Useful for wide lookback windows that exceed the
   * default TTL (e.g. 360 min for legal_risk dedup in news-scout). When
   * omitted, no created_at filter is applied (default behaviour preserved).
   */
  hoursBack?: number;
  /**
   * Task 1968c-P03 — Server-side signal_type filter.
   * null / undefined / "" = no filter applied (all types returned, backward-compatible).
   */
  signalType?: string | null;
}

/**
 * Retrieve signals for a given agent, filtered by expiry and optionally by status.
 *
 * - Always filters out expired signals (expires_at <= now).
 * - Includes signals addressed directly to `agent` OR to the special value `"all"`.
 * - If status is "unread" (default), marks returned rows as "read" atomically.
 * - Includes confidence_score and validated_at if they exist in the schema (Task 230).
 */
export function getSignals(db: Database, agent: string, opts: GetSignalsOptions = {}): AgentSignal[] {
  const statusFilter = opts.status ?? "unread";
  const statusClause = statusFilter === "unread" ? "AND s.status = 'unread'" : "";

  let hasValidationColumns = false;
  try {
    db.prepare("SELECT confidence_score, validated_at FROM agent_signals LIMIT 0").all();
    hasValidationColumns = true;
  } catch {
    hasValidationColumns = false;
  }
  const validationColumns = hasValidationColumns ? ", confidence_score, validated_at" : "";

  type RawRow = {
    id: number; from_agent: string; to_agent: string; signal_type: string; stock_code: string | null;
    payload: string; status: string; created_at: string; expires_at: string;
    confidence_score?: number; validated_at?: string;
  };

  // When fromAgent is set, query sender history: filter by from_agent only (ignores to_agent axis).
  const recipientClause = opts.fromAgent === undefined ? "(s.to_agent = ? OR s.to_agent = 'all')" : "s.from_agent = ?";
  const bindParam = opts.fromAgent !== undefined ? opts.fromAgent : agent;

  // SEC-FIX (FACTORY-INFRA-agentSignal-sql-binding): bound placeholders, not string-interpolated.
  const hoursBackClause = opts.hoursBack !== undefined ? `AND s.created_at >= datetime('now', ? || ' minutes')` : "";
  const signalTypeClause = opts.signalType != null && opts.signalType !== "" ? `AND s.signal_type = ?` : "";

  const params: (string | number)[] = [bindParam];
  if (opts.hoursBack !== undefined) params.push(`-${Math.ceil(opts.hoursBack * 60)}`);
  if (opts.signalType != null && opts.signalType !== "") params.push(opts.signalType);

  const rows = db
    .query<RawRow, (string | number)[]>(
      `SELECT id, from_agent, to_agent, signal_type, stock_code, payload, status,
              created_at, expires_at${validationColumns}
       FROM agent_signals s
       WHERE ${recipientClause}
         AND s.expires_at > datetime('now')
         ${statusClause}
         ${hoursBackClause}
         ${signalTypeClause}
       ORDER BY s.id ASC`,
    )
    .all(...params) as RawRow[];

  // Mark unread rows as read (only when fetching as inbox — NOT during sender-history lookup).
  if (statusFilter === "unread" && opts.fromAgent === undefined && rows.length > 0) {
    const ids = rows.map((r) => r.id);
    const idPlaceholders = ids.map(() => "?").join(",");
    db.prepare(`UPDATE agent_signals SET status = 'read' WHERE id IN (${idPlaceholders})`).run(...ids);
  }

  return rows.map((r) => {
    const signal: AgentSignal = {
      id: r.id, fromAgent: r.from_agent, toAgent: r.to_agent, signalType: r.signal_type as SignalType,
      stockCode: r.stock_code, payload: JSON.parse(r.payload),
      status: (statusFilter === "unread" ? "read" : r.status) as "unread" | "read",
      createdAt: r.created_at, expiresAt: r.expires_at,
    };
    if (hasValidationColumns) {
      if (r.confidence_score !== undefined) signal.confidence_score = r.confidence_score;
      if (r.validated_at !== undefined) signal.validated_at = r.validated_at;
    }
    return signal;
  });
}
