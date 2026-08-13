/** recordOutcome() — record the processing outcome for a signal row. */

import type { Database } from "bun:sqlite";

/** Outcome values for a signal once it has been processed. */
export type SignalOutcome = "fired" | "suppressed" | "confirmed" | "false_positive";

/**
 * Sets `outcome`, `outcome_at` (UTC now), and optionally `outcome_detail` on
 * the row identified by `signalId`.
 */
export function recordOutcome(db: Database, signalId: number, outcome: SignalOutcome, detail?: string): void {
  db.prepare(
    `UPDATE agent_signals
        SET outcome        = ?,
            outcome_at     = datetime('now'),
            outcome_detail = ?
      WHERE id = ?`,
  ).run(outcome, detail ?? null, signalId);
}
