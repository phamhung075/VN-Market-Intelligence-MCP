/**
 * Task 1804d-C — Retrieve unexpired price_anomaly signals for a given ticker
 * within a time window. Does NOT mark signals as read — non-consuming, like
 * getBroadcastSignals().
 */

import type { Database } from "bun:sqlite";
import type { AgentSignal, SignalType } from "./types.js";

/**
 * @param db            - Active bun:sqlite Database connection
 * @param ticker        - Stock code to filter by (e.g. "VCB")
 * @param withinMinutes - Look-back window in minutes (default 120)
 */
export function getPriceAnomalySignals(db: Database, ticker: string, withinMinutes: number = 120): AgentSignal[] {
  const cutoff = new Date(Date.now() - withinMinutes * 60_000)
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d{3}Z$/, "");

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
    .prepare<RawRow, [string, string]>(
      `SELECT id, from_agent, to_agent, signal_type, stock_code, payload, status,
              created_at, expires_at${validationColumns}
       FROM agent_signals
       WHERE signal_type  = 'price_anomaly'
         AND stock_code   = ?
         AND expires_at   > datetime('now')
         AND created_at  >= ?
       ORDER BY id ASC`,
    )
    .all(ticker, cutoff) as RawRow[];

  return rows.map((r) => {
    const signal: AgentSignal = {
      id: r.id, fromAgent: r.from_agent, toAgent: r.to_agent, signalType: r.signal_type as SignalType,
      stockCode: r.stock_code,
      payload: (() => { try { return JSON.parse(r.payload); } catch { return {}; } })(),
      status: r.status as "unread" | "read", createdAt: r.created_at, expiresAt: r.expires_at,
    };
    if (hasValidationColumns) {
      if (r.confidence_score !== undefined) signal.confidence_score = r.confidence_score;
      if (r.validated_at   !== undefined) signal.validated_at   = r.validated_at;
    }
    return signal;
  });
}
