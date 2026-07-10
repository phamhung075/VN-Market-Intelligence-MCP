/**
 * D-NEW2: Orphan agent_signals.alert_id (dangling FK, INVERSE of C-08/W-6).
 *
 * FIX-AGENT-SIGNALS-ORPHAN-ALERT-ID: C-08 (system-auditor) and W-6
 * (checkOrphanAlerts) both check "alerts row exists but its agent_signals
 * correlation row is missing." This check monitors the INVERSE direction:
 * "agent_signals.alert_id is set but no matching alerts.id exists" — a
 * dangling FK produced when the atomic co-write in alertStore.ts's
 * storeAlerts()/storeAlertsFromCommander() is bypassed or defeated (e.g. by
 * an alerts.fingerprint UNIQUE-index collision with a non-deterministic id;
 * see FIX-AGENT-SIGNALS-ORPHAN-ALERT-ID root-cause writeup).
 *
 * The writer-level guard added by FIX-AGENT-SIGNALS-ORPHAN-ALERT-ID should
 * keep this at 0 going forward — this check is the ongoing regression
 * tripwire (agent_signals correlation stubs are TTL-bound, ~2h, and purged
 * by cleanExpired(), so any historical debt self-expires; a non-zero count
 * here means the writer guard was bypassed or a NEW writer was added
 * elsewhere without routing through storeAlerts).
 */

import { Database } from "bun:sqlite";
import { AuditFinding, insertFeedbackIfNew } from "../dataAuditShared.js";

export function checkOrphanAgentSignalsAlertId(db: Database): AuditFinding[] {
  try {
    const row = db.query<{ cnt: number }, []>(`
      SELECT COUNT(*) as cnt
      FROM agent_signals s
      LEFT JOIN alerts a ON a.id = s.alert_id
      WHERE s.alert_id IS NOT NULL AND a.id IS NULL
    `).get();
    const cnt = row?.cnt ?? 0;
    const finding: AuditFinding = {
      table: "agent_signals",
      check: "orphan_agent_signals_alert_id",
      severity: "warning",
      rowsAffected: cnt,
      action: cnt > 0 ? "flagged" : "none",
      detail: `${cnt} agent_signals rows carry alert_id with no matching alerts row (dangling FK)`,
    };
    if (cnt > 0) insertFeedbackIfNew(db, finding);
    return [finding];
  } catch (err) {
    // Non-fatal: agent_signals/alerts tables may not exist yet on fresh installs
    return [{
      table: "agent_signals",
      check: "orphan_agent_signals_alert_id",
      severity: "warning",
      rowsAffected: 0,
      action: "none",
      detail: `Check failed: ${(err as Error).message}`.slice(0, 200),
    }];
  }
}
