/**
 * Task 1105 — Retrieve signals grouped by causal_root_id for Alert Commander.
 *
 * Grouping rules:
 *   - Signals sharing the same non-NULL causal_root_id → 1 consolidated group
 *     (isConsolidated=true, signalCount >= 2).
 *   - Signals with NULL causal_root_id → each appears as its own individual
 *     group (isConsolidated=false, signalCount=1).
 *
 * This lets Alert Commander send 1 Telegram message per macro event instead
 * of one per signal.
 */

import type { Database } from "bun:sqlite";
import type { AgentSignal, SignalPayload, SignalType } from "./types.js";

/** One group in the Alert Commander consolidated view. */
export interface CausalRootGroup {
  causalRootId: string | null;
  causalRootLabel: string | null;
  signalCount: number;
  isConsolidated: boolean;
  signals: AgentSignal[];
}

/** Options for getSignalsGroupedByCausalRoot. */
export interface GetGroupedSignalsOptions {
  toAgent?: string;
  status?: "unread" | "all";
}

export function getSignalsGroupedByCausalRoot(
  db: Database,
  opts: GetGroupedSignalsOptions = {},
): CausalRootGroup[] {
  const { toAgent, status = "unread" } = opts;
  const agentClause = toAgent ? "AND (s.to_agent = ? OR s.to_agent = 'all')" : "";
  const statusClause = status === "unread" ? "AND s.status = 'unread'" : "";
  const params: (string | number)[] = [];
  if (toAgent) params.push(toAgent);

  type RawRow = {
    id: number; from_agent: string; to_agent: string; signal_type: string; stock_code: string | null;
    payload: string; status: string; created_at: string; expires_at: string;
    causal_root_id: string | null; causal_root_label: string | null;
  };

  const rows = db
    .prepare<RawRow, (string | number)[]>(
      `SELECT id, from_agent, to_agent, signal_type, stock_code, payload,
              status, created_at, expires_at, causal_root_id, causal_root_label
       FROM agent_signals s
       WHERE s.expires_at > datetime('now')
         ${agentClause}
         ${statusClause}
       ORDER BY causal_root_id ASC NULLS LAST, s.id ASC`,
    )
    .all(...params) as RawRow[];

  if (rows.length === 0) return [];

  const consolidatedMap = new Map<string, CausalRootGroup>();
  const individualGroups: CausalRootGroup[] = [];

  for (const row of rows) {
    let payloadParsed: SignalPayload = {};
    try { payloadParsed = JSON.parse(row.payload); } catch {}

    const signal: AgentSignal = {
      id: row.id, fromAgent: row.from_agent, toAgent: row.to_agent, signalType: row.signal_type as SignalType,
      stockCode: row.stock_code, payload: payloadParsed, status: row.status as "unread" | "read",
      createdAt: row.created_at, expiresAt: row.expires_at,
    };

    if (row.causal_root_id !== null) {
      const key = row.causal_root_id;
      const existing = consolidatedMap.get(key);
      if (existing) {
        existing.signals.push(signal);
        existing.signalCount = existing.signals.length;
        existing.isConsolidated = existing.signalCount >= 2;
      } else {
        consolidatedMap.set(key, {
          causalRootId: row.causal_root_id, causalRootLabel: row.causal_root_label,
          signalCount: 1, isConsolidated: false, signals: [signal],
        });
      }
    } else {
      individualGroups.push({
        causalRootId: null, causalRootLabel: null, signalCount: 1, isConsolidated: false, signals: [signal],
      });
    }
  }

  for (const group of consolidatedMap.values()) group.isConsolidated = group.signalCount >= 2;

  return [...individualGroups, ...consolidatedMap.values()];
}
