/**
 * Alert Engine — Alert Store
 *
 * Low-level DB access for alert outcome read/write.
 * Infra layer only — no domain logic.
 */

import type { Database } from 'bun:sqlite';

/** Raw alert row returned by readPendingOutcomeAlerts. */
export interface PendingOutcomeAlert {
  id: number;
  stocks: string;
  signal_types: string;
  message: string;
  fingerprint: string;
  severity: string;
  triggered_at: string;
  sent_telegram: number;
  outcome: null;
  outcome_at: string | null;
  outcome_detail: string | null;
}

export interface ReadPendingOptions {
  /** Max rows to return. Default: 100 */
  limit?: number;
}

/**
 * Return alerts with NULL outcome created within the last 90 days.
 *
 * Only rows eligible for scoring are returned (outcome IS NULL).
 * The 90-day cutoff prevents scoring stale records with no market data.
 */
export function readPendingOutcomeAlerts(
  db: Database,
  opts?: ReadPendingOptions,
): PendingOutcomeAlert[] {
  const limit = opts?.limit ?? 100;
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  return db
    .prepare<PendingOutcomeAlert, [string, number]>(`
      SELECT
        id,
        stocks,
        signal_types,
        message,
        fingerprint,
        severity,
        triggered_at,
        sent_telegram,
        outcome,
        outcome_at,
        outcome_detail
      FROM alert_engine_records
      WHERE outcome IS NULL
        AND triggered_at > ?
      ORDER BY triggered_at ASC
      LIMIT ?
    `)
    .all(cutoff, limit);
}

/**
 * Score an alert by writing outcome data.
 *
 * The WHERE outcome IS NULL guard ensures idempotency:
 * a second call for the same alertId returns false and does not overwrite.
 *
 * @returns true if row was updated, false if already scored or not found.
 */
export function writeAlertOutcome(
  db: Database,
  alertId: number,
  outcome: 'HIT' | 'MISS' | 'UNKNOWN',
  detail: Record<string, unknown>,
): boolean {
  const result = db
    .prepare(`
      UPDATE alert_engine_records
      SET
        outcome        = ?,
        outcome_at     = ?,
        outcome_detail = ?
      WHERE id = ?
        AND outcome IS NULL
    `)
    .run(outcome, new Date().toISOString(), JSON.stringify(detail), alertId);

  return (result.changes as number) > 0;
}
