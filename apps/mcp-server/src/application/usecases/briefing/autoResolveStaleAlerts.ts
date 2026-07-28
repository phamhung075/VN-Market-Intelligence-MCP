/**
 * Morning Briefing — Step 10: auto-resolve stale low/medium alerts (72h).
 *
 * Extracted from assembleBriefing.ts _assembleBriefingImpl (FACTORY-APP-split-assembleBriefing).
 *
 * Write step (not a query) — runs before Step 10b so the unresolved-alerts
 * read reflects the freshly auto-resolved rows.
 *
 * Layer: application/usecases/briefing — pure DB write, no side effects beyond the UPDATE.
 */
import type { Database } from "bun:sqlite";
import { failLoud } from "../../../domain/utils/safeQuery.js";

/** Auto-resolve low/medium alerts unresolved for >72h. Schema-tolerant (older DBs may lack resolved_at). */
export function autoResolveStaleAlerts(db: Database): void {
  try {
    db.exec(`
      UPDATE alerts
      SET resolved_at = datetime('now'), resolution_notes = 'Auto-resolved: stale >72h'
      WHERE severity IN ('low', 'medium')
        AND resolved_at IS NULL
        AND triggered_at < datetime('now', '-72 hours')
    `);
  } catch (err) {
    // schema may not have resolved_at column in older DBs — log but don't abort
    failLoud(err, "assembleBriefing.step10.autoResolveAlerts");
  }
}
