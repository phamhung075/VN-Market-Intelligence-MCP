/**
 * Data Freshness SLA Monitor Job — Task 234
 *
 * Scheduler layer: checks signal source data freshness every 30 minutes.
 * Escalates to Alert Commander when SLA breaches detected.
 * Tracks recovery status in sla_breach_audit table.
 *
 * Enforces 60-minute cooldown per signal type to prevent alert spam.
 *
 * DDD Layer: interface/scheduler — may import from domain + infrastructure.
 *
 * @module scheduler/system/freshnessSlaMonitorJob
 */

import type { Database } from "bun:sqlite";
import {
  checkDataFreshnessSla,
  type SignalType,
} from "../../domain/services/freshnessSlaChecker.js";

/**
 * Escalation callback signature.
 */
export type EscalationCallback = (
  signalType: SignalType,
  ageMinutes: number,
  thresholdMinutes: number,
  severity: "HIGH" | "CRITICAL"
) => Promise<void>;

/**
 * Queries the age of signal data for each source.
 *
 * @param db Database instance
 * @returns Map of signalType → ageMinutes
 */
export function querySignalAges(
  db: Database
): Record<SignalType, number> {
  const now = Math.floor(Date.now() / 1000);

  interface AgeRow {
    signal_type: SignalType;
    age_minutes: number;
  }

  // Table mapping (corrected from original wrong names):
  //   sbv_fx       — sbv_rates.fetched_at
  //   foreign_flow — daily_ohlcv.updated_at WHERE foreign_buy_vol IS NOT NULL
  //                  (VPS pushes foreign flow into daily_ohlcv, not a separate table)
  const rows = db
    .query<AgeRow, [number, number, number, number, number]>(
      `SELECT
        'price' as signal_type,
        CAST((? - CAST((SELECT MAX(created_at) FROM market_prices) as INTEGER)) / 60 AS INTEGER) as age_minutes
      UNION ALL
      SELECT
        'bctc' as signal_type,
        CAST((? - CAST((SELECT MAX(created_at) FROM financial_reports) as INTEGER)) / 60 AS INTEGER) as age_minutes
      UNION ALL
      SELECT
        'news' as signal_type,
        CAST((? - CAST((SELECT MAX(created_at) FROM news) as INTEGER)) / 60 AS INTEGER) as age_minutes
      UNION ALL
      SELECT
        'sbv_fx' as signal_type,
        CAST((? - CAST((SELECT MAX(fetched_at) FROM sbv_rates) as INTEGER)) / 60 AS INTEGER) as age_minutes
      UNION ALL
      SELECT
        'foreign_flow' as signal_type,
        CAST((? - CAST((SELECT MAX(updated_at) FROM daily_ohlcv WHERE foreign_buy_vol IS NOT NULL) as INTEGER)) / 60 AS INTEGER) as age_minutes`
    )
    .all(now, now, now, now, now) as AgeRow[];

  const result: Record<SignalType, number> = {
    price: 0,
    bctc: 0,
    news: 0,
    sbv_fx: 0,
    foreign_flow: 0,
  };

  for (const row of rows) {
    result[row.signal_type] = Math.max(0, row.age_minutes);
  }

  return result;
}

/**
 * Retrieves prior breach records for recovery detection.
 *
 * @param db Database instance
 * @returns Array of prior breach records
 */
export function getPriorBreaches(
  db: Database
): Array<{ signalType: SignalType; status: "breach_open" | "recovered" }> {
  interface BreachRow {
    signal_type: SignalType;
    status: "breach_open" | "recovered";
  }

  const rows = db
    .query<BreachRow, []>(
      `SELECT signal_type, status FROM sla_breach_audit
       WHERE status = 'breach_open'`
    )
    .all() as BreachRow[];

  return rows.map(row => ({
    signalType: row.signal_type,
    status: row.status
  }));
}

/**
 * Checks cooldown: has this signal type been escalated in the last 60 minutes?
 *
 * @param db Database instance
 * @param signalType Signal type to check
 * @returns true if escalation_callback_sent=true within last 60 minutes
 */
export function isEscalationCooldownActive(
  db: Database,
  signalType: SignalType
): boolean {
  interface CooldownRow {
    count: number;
  }

  const row = db
    .query<CooldownRow, [SignalType]>(
      `SELECT COUNT(*) as count FROM sla_breach_audit
       WHERE signal_type = ?
       AND escalation_callback_sent = 1
       AND breached_at > datetime('now', '-60 minutes')`
    )
    .get(signalType) as CooldownRow | undefined;

  return (row?.count ?? 0) > 0;
}

/**
 * Records an SLA breach in the audit table.
 *
 * @param db Database instance
 * @param signalType Signal type
 * @param ageMinutes Data age in minutes
 * @param thresholdMinutes SLA threshold
 * @param severity Breach severity
 */
export function recordSlaBreach(
  db: Database,
  signalType: SignalType,
  ageMinutes: number,
  thresholdMinutes: number,
  severity: "HIGH" | "CRITICAL"
): void {
  const stmt = db.prepare(`
    INSERT INTO sla_breach_audit (
      signal_type,
      age_minutes,
      threshold_minutes,
      status,
      severity
    ) VALUES (?, ?, ?, ?, ?)
  `);

  stmt.run(signalType, ageMinutes, thresholdMinutes, "breach_open", severity);
}

/**
 * Records recovery of a previously breached signal.
 *
 * @param db Database instance
 * @param signalType Signal type
 */
export function recordSlaRecovery(
  db: Database,
  signalType: SignalType
): void {
  const stmt = db.prepare(`
    UPDATE sla_breach_audit
    SET status = 'recovered', recovered_at = datetime('now')
    WHERE signal_type = ? AND status = 'breach_open'
  `);

  stmt.run(signalType);
}

/**
 * Marks escalation callback as sent for a breach.
 *
 * @param db Database instance
 * @param signalType Signal type
 */
export function markEscalationSent(
  db: Database,
  signalType: SignalType
): void {
  const stmt = db.prepare(`
    UPDATE sla_breach_audit
    SET escalation_callback_sent = 1
    WHERE signal_type = ? AND status = 'breach_open'
    ORDER BY breached_at DESC
    LIMIT 1
  `);

  stmt.run(signalType);
}

/**
 * Runs the data freshness SLA monitor job.
 *
 * @param db Database instance (injectable for testing)
 * @param escalateToCommander Escalation callback (injectable for testing)
 * @returns Job result summary
 */
export async function runFreshnessSlaMonitor(
  db: Database,
  escalateToCommander: EscalationCallback,
): Promise<{ breaches: number; recoveries: number; escalations: number }> {
  // Query current signal ages
  const signalAges = querySignalAges(db);

  // Get prior breaches for recovery detection
  const priorBreaches = getPriorBreaches(db);

  // Check freshness SLAs
  const slaCheck = checkDataFreshnessSla(signalAges, undefined, priorBreaches);

  let breaches = 0;
  let recoveries = 0;
  let escalations = 0;

  // Process breaches
  for (const breach of slaCheck.breaches) {
    breaches++;
    recordSlaBreach(
      db,
      breach.signalType,
      breach.ageMinutes,
      breach.thresholdMinutes,
      breach.severity!
    );

    // Check cooldown and escalate if not active
    if (!isEscalationCooldownActive(db, breach.signalType)) {
      try {
        await escalateToCommander(
          breach.signalType,
          breach.ageMinutes,
          breach.thresholdMinutes,
          breach.severity!
        );
        markEscalationSent(db, breach.signalType);
        escalations++;
      } catch (err) {
        console.error(
          `[sla-monitor] escalation failed for ${breach.signalType}:`,
          err
        );
      }
    }
  }

  // Process recoveries
  for (const recovery of slaCheck.recoveries) {
    recoveries++;
    recordSlaRecovery(db, recovery.signalType);
  }

  return { breaches, recoveries, escalations };
}

/**
 * Default escalation callback: posts signal to Alert Commander via agent signal bus.
 *
 * @param signalType Signal type
 * @param ageMinutes Data age in minutes
 * @param thresholdMinutes SLA threshold
 * @param severity Breach severity
 */
export async function escalateToCommander(
  signalType: SignalType,
  ageMinutes: number,
  thresholdMinutes: number,
  severity: "HIGH" | "CRITICAL"
): Promise<void> {
  const { getDb, initDatabase } = await import(
    "../../infrastructure/db/schema.js"
  );
  const { postSignal } = await import(
    "../../infrastructure/db/agentSignalStore.js"
  );

  await initDatabase();
  const db = getDb();

  const payload = {
    title: `SLA BREACH: ${signalType} source stale`,
    detail: `Data age: ${ageMinutes} minutes (threshold: ${thresholdMinutes} min)`,
    signal_type: signalType,
    severity,
    timestamp: new Date().toISOString(),
  };

  postSignal(db, {
    fromAgent: "freshness-sla-monitor",
    toAgent: "05-alert-commander",
    signalType: "urgent_news",
    payload,
    ttlMinutes: 60,
  });
}

/**
 * Public entry point for cron scheduler.
 *
 * Defaults to production database and escalateToCommander callback.
 */
export async function runFreshnessSlaMonitorJob(): Promise<void> {
  try {
    const { getDb } = await import("../../infrastructure/db/schema.js");
    const db = getDb();

    const result = await runFreshnessSlaMonitor(
      db,
      escalateToCommander
    );

    console.log(
      `[sla-monitor] breaches=${result.breaches} recoveries=${result.recoveries} escalations=${result.escalations}`
    );
  } catch (err) {
    console.error(
      "[sla-monitor] Uncaught error:",
      err instanceof Error ? err.message : String(err)
    );
  }
}
