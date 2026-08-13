/**
 * SPIKE-BOOTSTRAP-BROADCAST-CATALYST-CONSUME — Retrieve unexpired broadcast
 * (`to_agent = 'all'`) signals regardless of `status`.
 *
 * `agent_signals` has exactly one global `status` column per row — there is
 * NO per-recipient read-state table. `getSignals()`'s unread-only query marks
 * a row 'read' the FIRST time ANY recipient's inbox call touches it. For a
 * `to_agent = 'all'` broadcast row that is a structural bug: the first
 * recipient to bootstrap consumes the row for every OTHER recipient too.
 *
 * This helper sidesteps the single-reader-consumed status gate entirely for
 * to_agent='all' rows: bounded only by `expires_at`, never by `status`, and
 * never marks rows as read — safe to call from every recipient's bootstrap on
 * every cycle. Callers merge this with getSignals() and dedupe by id.
 */

import type { Database } from "bun:sqlite";
import type { AgentSignal, SignalType } from "./types.js";

export function getBroadcastSignals(db: Database): AgentSignal[] {
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

  const rows = db
    .query<RawRow, []>(
      `SELECT id, from_agent, to_agent, signal_type, stock_code, payload, status,
              created_at, expires_at${validationColumns}
       FROM agent_signals
       WHERE to_agent = 'all'
         AND expires_at > datetime('now')
       ORDER BY id ASC`,
    )
    .all() as RawRow[];

  return rows.map((r) => {
    const signal: AgentSignal = {
      id: r.id, fromAgent: r.from_agent, toAgent: r.to_agent, signalType: r.signal_type as SignalType,
      stockCode: r.stock_code,
      payload: (() => { try { return JSON.parse(r.payload); } catch { return {}; } })(),
      status: r.status as "unread" | "read", createdAt: r.created_at, expiresAt: r.expires_at,
    };
    if (hasValidationColumns) {
      if (r.confidence_score !== undefined) signal.confidence_score = r.confidence_score;
      if (r.validated_at !== undefined) signal.validated_at = r.validated_at;
    }
    return signal;
  });
}
