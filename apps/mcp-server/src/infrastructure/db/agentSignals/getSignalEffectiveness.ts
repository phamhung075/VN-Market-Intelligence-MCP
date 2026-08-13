/** getSignalEffectiveness() — aggregate effectiveness metrics grouped by (from_agent, signal_type). */

import type { Database } from "bun:sqlite";

/** Per-group effectiveness metrics returned by getSignalEffectiveness. */
export interface SignalEffectiveness {
  fromAgent: string;
  signalType: string;
  total: number;
  fired: number;
  confirmed: number;
  false_positive: number;
  /** confirmed / (confirmed + false_positive), or null when denominator is 0. */
  precision: number | null;
}

/** Options for filtering getSignalEffectiveness results. */
export interface GetEffectivenessOptions {
  /** Only include signals from this agent. */
  fromAgent?: string;
  /** Only include signals of this type. */
  signalType?: string;
  /** Look-back window in days from now (default 7). */
  days?: number;
}

/** Only rows with a non-null `outcome` within the look-back window are counted. */
export function getSignalEffectiveness(db: Database, opts: GetEffectivenessOptions = {}): SignalEffectiveness[] {
  const days = opts.days ?? 7;

  // SEC-FIX (FACTORY-INFRA-agentSignal-sql-binding): bound placeholders — idiom matches
  // cronJobRunStore.ts / agentWorkLogStore.ts (`datetime('now', ? || ' days')`).
  const conditions: string[] = ["outcome IS NOT NULL", "created_at >= datetime('now', ? || ' days')"];
  const params: (string | number)[] = [`-${days}`];

  if (opts.fromAgent) {
    conditions.push("from_agent = ?");
    params.push(opts.fromAgent);
  }
  if (opts.signalType) {
    conditions.push("signal_type = ?");
    params.push(opts.signalType);
  }

  const where = conditions.join(" AND ");

  type Row = {
    from_agent: string; signal_type: string; total: number;
    fired: number; confirmed: number; false_positive: number;
  };

  const rows = db
    .query<Row, (string | number)[]>(
      `SELECT
         from_agent,
         signal_type,
         COUNT(*)                                                     AS total,
         SUM(CASE WHEN outcome = 'fired'          THEN 1 ELSE 0 END)  AS fired,
         SUM(CASE WHEN outcome = 'confirmed'      THEN 1 ELSE 0 END)  AS confirmed,
         SUM(CASE WHEN outcome = 'false_positive' THEN 1 ELSE 0 END)  AS false_positive
       FROM agent_signals
       WHERE ${where}
       GROUP BY from_agent, signal_type
       ORDER BY from_agent, signal_type`,
    )
    .all(...params);

  return rows.map((r) => {
    const denom = r.confirmed + r.false_positive;
    const precision = denom > 0 ? r.confirmed / denom : null;
    return {
      fromAgent: r.from_agent, signalType: r.signal_type, total: r.total,
      fired: r.fired, confirmed: r.confirmed, false_positive: r.false_positive, precision,
    };
  });
}
