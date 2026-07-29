/**
 * Alert Store — Task 064 + Task 153
 *
 * Infrastructure adapter that persists Alert records to the SQLite `alerts`
 * table.  This function lives in infrastructure (not domain) so that the
 * domain layer remains pure and free of any I/O.
 *
 * Also provides `isDocAlreadyProcessed` (task 153) for SSC scan deduplication:
 * a fast index lookup against `financial_reports.ssc_doc_id` that prevents
 * re-processing the same SSC document on every 15-minute cycle.
 *
 * Usage:
 *   import { storeAlerts, isDocAlreadyProcessed } from "../infrastructure/db/alertStore.js";
 *   import { getDb } from "../infrastructure/db/schema.js";
 *
 *   const alerts = generateAlerts(signals, watchlist);
 *   storeAlerts(alerts, getDb());
 *
 *   if (isDocAlreadyProcessed(docId, getDb())) { ... }
 */

import type { Database } from "bun:sqlite";
import type { Alert } from "../../domain/services/alertGenerator.js";
import { getDb } from "./schema.js";
import { logger } from "../logger.js";

/**
 * Check whether a document identified by `ssc_doc_id` has already been
 * processed and stored in the `financial_reports` table.
 *
 * Uses a partial index on `ssc_doc_id` for O(log n) performance.
 * After the first full scan, 51 lookups complete in < 1 ms in total.
 *
 * @param docId - The unique SSC document identifier (typically the PDF URL).
 * @param db    - Active bun:sqlite Database connection (injected by caller).
 * @returns `true` when the document is already in `financial_reports`.
 */
export function isDocAlreadyProcessed(docId: string, db: Database): boolean {
  const row = db
    .prepare(
      `SELECT 1 FROM financial_reports WHERE ssc_doc_id = ? LIMIT 1`,
    )
    .get(docId);
  return row !== null && row !== undefined;
}

// ── severityToConfidence ──────────────────────────────────────────────────────
// FR-1 FIX-SIGNAL-CONFIDENCE-DEFAULT-50: module-private pure lookup.
// Derives a fallback confidence score from alert severity when the alert does
// not carry an explicit confidence_score value in [0,100].
// NFR-C: no imports from domain/ or interface/ layers — pure lookup only.
// critical=90, high=75, warning/medium=60, low=40, unknown=60 (defensive medium).
function severityToConfidence(severity: string): number {
  switch (severity) {
    case "critical": return 90;
    case "high":     return 75;
    case "warning":  // fall-through
    case "medium":   return 60;
    case "low":      return 40;
    default:         return 60; // defensive: treat unknown as medium
  }
}

// ── buildVerifiedDecisionPayload ──────────────────────────────────────────────
// FIX-ALERT-ENGINE-VERIFIED-DECISION-EMPTY-PAYLOAD-NULL-STOCKCODE: the
// agent_signals co-write below previously hardcoded payload='{}' as a bare SQL
// literal (never populated from the Alert actually being written) — every
// verified_decision row with from_agent='alert-engine' carried zero decision
// content BY CONSTRUCTION, not by data drift (RAW-verified live: 52/52 current
// rows payload='{}'; historical dbsweep 559/559 over 12+ days). This helper
// builds the real payload from the Alert's own fields. `message`/`severity` on
// Alert and `type`/`message`/`detectedAt` on Signal are all non-optional
// (alertGenerator.ts / signalDetector.ts) so the result can never legitimately
// be `{}` — the emit-time guard at the call site is a regression tripwire, not
// expected runtime behaviour.
//
// `alert_id` is deliberately embedded so the JSON string is byte-unique per
// alert even when two DIFFERENT alert types fire for the SAME ticker in the
// SAME UTC-minute (e.g. one TA + one BB alert) — this keeps the payload out of
// collision range of idx_agent_signals_dedup_identical's `WHERE payload != '{}'`
// partial unique index (FIX-AGENT-SIGNALS-IDENTICAL-DUP-EMISSION, schema-news.ts),
// which starts covering these rows for the first time now that payload is
// non-'{}' — without this, two genuinely-different alerts on the same
// ticker/minute could otherwise render identical payload text and have the
// SECOND correlation-stub INSERT OR IGNORE silently no-op (reintroducing the
// exact orphan-alert class FIX-ALERT-ORPHAN-CORRELATION/FIX-AGENT-SIGNALS-
// ORPHAN-ALERT-ID already fixed).
// NFR-C: no imports from domain/ or interface/ layers — Alert is a plain type
// already imported at module scope; this stays a pure object-shaping helper.
function buildVerifiedDecisionPayload(alert: Alert, confidenceScore: number): string {
  const primarySignal = alert.signals[0];
  const payload: Record<string, unknown> = {
    alert_id: alert.id,
    alert_type: primarySignal?.type ?? null,
    title: alert.message,
    severity: alert.severity,
    confidence: confidenceScore,
    detected_at: primarySignal?.detectedAt ?? alert.createdAt,
  };
  return JSON.stringify(payload);
}

// ── alert_id column probe (cached per DB connection) ─────────────────────────
// FIX-ALERT-ORPHAN-CORRELATION: check whether agent_signals has the alert_id
// column. Uses try/catch on a LIMIT-0 probe so legacy DBs (pre-migration) are
// handled gracefully — the alert row is still written; only the signal row is
// skipped when the column is absent.
function hasAgentSignalsAlertIdColumn(db: Database): boolean {
  try {
    db.prepare("SELECT alert_id FROM agent_signals LIMIT 0").all();
    return true;
  } catch {
    return false;
  }
}

// ── ensureCorrelationStubColumn ───────────────────────────────────────────────
// D-2 FIX-CASCADE-MACRO-CARD-REAL-DETAIL: idempotent startup guard that adds
// the is_correlation_stub column to agent_signals when absent.
//
// IMPORTANT: plain ALTER TABLE ... ADD COLUMN (no UNIQUE) — SQLite ADD COLUMN
// UNIQUE is illegal and silently swallowed by catch{}, leaving the column absent.
// The column is used as a write-time marker so querySignalsForStock can exclude
// correlation stubs from user-facing card queries.
export function ensureCorrelationStubColumn(db: Database): void {
  try {
    db.prepare("SELECT is_correlation_stub FROM agent_signals LIMIT 0").all();
    // Column already exists — no-op
  } catch {
    // Column absent — add it (plain ADD COLUMN, no UNIQUE)
    db.exec("ALTER TABLE agent_signals ADD COLUMN is_correlation_stub INTEGER DEFAULT 0");
  }
}

// ── ensureConfidenceScoreColumn ───────────────────────────────────────────────
// FIX-CI-RED-EAC0CC65-BUNTEST: idempotent guard that adds the confidence_score
// column to agent_signals when absent (mirrors ensureCorrelationStubColumn).
//
// The INSERT in storeAlerts / storeAlertsFromCommander always includes
// confidence_score; tests that create agent_signals manually (without calling
// initDatabase + schema-news.ts migrations) miss this column. The guard makes
// the column available before any INSERT, keeping source behaviour identical
// to production (where schema-news.ts ALTER TABLE runs at startup).
function ensureConfidenceScoreColumn(db: Database): void {
  try {
    db.prepare("SELECT confidence_score FROM agent_signals LIMIT 0").all();
    // Column already exists — no-op
  } catch {
    // Column absent — add it (plain ADD COLUMN, nullable INTEGER)
    db.exec("ALTER TABLE agent_signals ADD COLUMN confidence_score INTEGER");
  }
}

// ── hasAgentSignalsTable ────────────────────────────────────────────────────
// AC-7: gracefully skip signal write if agent_signals table doesn't exist yet.
function hasAgentSignalsTable(db: Database): boolean {
  try {
    db.prepare("SELECT 1 FROM agent_signals LIMIT 0").all();
    return true;
  } catch {
    return false;
  }
}

/**
 * Persist alert records to the SQLite `alerts` table.
 *
 * Uses INSERT OR IGNORE so calling this multiple times with the same Alert
 * objects is idempotent — duplicate IDs are silently skipped.
 *
 * Sets `sent_by = 'server'` to indicate the alert originated from the server
 * scheduler (Step E rule-based alerts).
 *
 * FIX-ALERT-ORPHAN-CORRELATION: also writes one `agent_signals` row per alert
 * (signal_type='verified_decision', from_agent='alert-engine', to_agent='all',
 * alert_id=alert.id) inside the same transaction. This fixes the C-08 audit
 * check whose JOIN `ON a.id = s.id` was comparing TEXT to INTEGER (always NULL).
 * The corrected C-08 query uses `ON a.id = s.alert_id` instead.
 *
 * FIX-AGENT-SIGNALS-ORPHAN-ALERT-ID: `INSERT OR IGNORE INTO alerts` can be
 * silently no-op'd not only by an `id` (PK) collision but also by an
 * `alerts.fingerprint` UNIQUE-index collision (idx_alerts_fingerprint) when a
 * caller's `id` isn't 1:1 with its `fingerprint`. The agent_signals co-write
 * must NEVER assume the paired alerts row exists — it confirms via a direct
 * `alerts` lookup before writing, so `agent_signals.alert_id` can never
 * dangle regardless of caller id/fingerprint correctness.
 *
 * @param alerts - Array of Alert objects returned by `generateAlerts`
 * @param db     - Active bun:sqlite Database connection (injected by caller)
 */
export function storeAlerts(alerts: Alert[], db: Database): void {
  if (alerts.length === 0) return;

  // FU-ALERT-COWRITE-SCHEDULER-JOBS: include fingerprint column when present.
  // The fingerprint UNIQUE constraint is the authoritative dedup gate for
  // scan jobs (taAlertScanJob, bbAlertScanJob). Non-scan callers omit it.
  const insert = db.prepare(`
    INSERT OR IGNORE INTO alerts
      (id, triggered_at, severity, signals_json, affected_actions_json,
       analysis_ids_json, message, read, user_note, sent_by, confidence_score, validated_at,
       fingerprint)
    VALUES
      (?, ?, ?, ?, ?, NULL, ?, 0, NULL, 'server', ?, ?, ?)
  `);

  // D-2 FIX-CASCADE-MACRO-CARD-REAL-DETAIL: ensure is_correlation_stub column exists
  // before writing rows (idempotent, negligible overhead).
  if (hasAgentSignalsTable(db)) {
    ensureCorrelationStubColumn(db);
    ensureConfidenceScoreColumn(db);
  }

  // FIX-ALERT-ORPHAN-CORRELATION: co-write agent_signals row for C-08 correlation.
  // Guarded: skip gracefully when alert_id column or agent_signals table is absent.
  const writeSignal = hasAgentSignalsTable(db) && hasAgentSignalsAlertIdColumn(db);
  const insertSignal = writeSignal
    ? db.prepare(`
        INSERT OR IGNORE INTO agent_signals
          (from_agent, to_agent, signal_type, stock_code, payload, status,
           created_at, expires_at, alert_id, is_correlation_stub, confidence_score)
        VALUES
          ('alert-engine', 'all', 'verified_decision', ?, ?, 'unread',
           ?, datetime(?, '+2 hours'), ?, 1, ?)
      `)
    : null;

  // Dedup guard: skip signal write if a row with this alert_id already exists.
  const checkSignal = writeSignal
    ? db.prepare("SELECT 1 FROM agent_signals WHERE alert_id = ? LIMIT 1")
    : null;

  // FIX-AGENT-SIGNALS-ORPHAN-ALERT-ID: existence guard — the correlation row
  // may only be written when an `alerts` row for this id is CONFIRMED to
  // exist (freshly inserted OR pre-existing). Never write on faith that
  // `insert.run()` succeeded — INSERT OR IGNORE can no-op on a fingerprint
  // collision too, not just an id collision.
  const checkAlertRow = writeSignal
    ? db.prepare("SELECT 1 FROM alerts WHERE id = ? LIMIT 1")
    : null;

  const insertMany = db.transaction((rows: Alert[]) => {
    for (const alert of rows) {
      insert.run(
        alert.id,
        alert.createdAt,
        alert.severity,
        JSON.stringify(alert.signals),
        JSON.stringify([{ code: alert.actionCode }]),
        alert.message,
        alert.confidence_score ?? null,
        alert.validated_at ?? null,
        alert.fingerprint ?? null,
      );
      // Co-write agent_signals correlation row (fail-loud if insert throws)
      if (insertSignal && checkSignal && checkAlertRow) {
        const existing = checkSignal.get(alert.id);
        // FIX-AGENT-SIGNALS-ORPHAN-ALERT-ID: only proceed when the alerts row
        // for this id is confirmed present — guards against a silent
        // INSERT-OR-IGNORE no-op (fingerprint collision) leaving a dangling FK.
        const alertRowExists = checkAlertRow.get(alert.id);
        if (!existing && alertRowExists) {
          const stockCode = alert.actionCode === "MACRO" ? null : (alert.actionCode || null);
          // FR-1 FIX-SIGNAL-CONFIDENCE-DEFAULT-50: use alert's real confidence when in [0,100];
          // otherwise derive from severity via module-private severityToConfidence().
          const confidenceScore =
            typeof alert.confidence_score === "number" &&
            alert.confidence_score >= 0 &&
            alert.confidence_score <= 100
              ? Math.min(100, Math.max(0, Math.round(alert.confidence_score)))
              : severityToConfidence(alert.severity);
          // FIX-ALERT-ENGINE-VERIFIED-DECISION-EMPTY-PAYLOAD-NULL-STOCKCODE:
          // populate real decision content instead of the previous hardcoded
          // '{}' literal (see buildVerifiedDecisionPayload doc comment above).
          const payloadJson = buildVerifiedDecisionPayload(alert, confidenceScore);
          // Emit-time guard — REFUSE (fail-loud log, not silent-swallow) to
          // persist an empty-content correlation row. alert.message is a
          // required field on Alert so this branch should be unreachable in
          // production; it exists as a regression tripwire.
          if (payloadJson === "{}" || !alert.message) {
            logger.warn(
              "[alertStore] refusing to write verified_decision signal with empty payload",
              { alertId: alert.id, stockCode, payloadJson },
            );
          } else {
            insertSignal.run(
              stockCode,
              payloadJson,
              alert.createdAt,
              alert.createdAt,
              alert.id,
              confidenceScore,
            );
          }
        }
      }
    }
  });

  insertMany(alerts);
}

/**
 * Persist alert records originated from the Alert Commander Cowork agent.
 *
 * Identical to `storeAlerts` but sets `sent_by = 'alert-commander'`, which
 * allows the `get_alerts` tool and scheduler to distinguish reasoning-based
 * alerts (Commander) from rule-based alerts (server Step E).
 *
 * Uses INSERT OR IGNORE so the function is idempotent.
 *
 * FIX-ALERT-ORPHAN-CORRELATION: same co-write logic as storeAlerts — writes
 * one agent_signals row per alert with alert_id = alert.id.
 *
 * @param alerts - Array of Alert objects produced by the Alert Commander
 * @param db     - Active bun:sqlite Database connection (injected by caller)
 */
export function storeAlertsFromCommander(alerts: Alert[], db: Database): void {
  if (alerts.length === 0) return;

  const insert = db.prepare(`
    INSERT OR IGNORE INTO alerts
      (id, triggered_at, severity, signals_json, affected_actions_json,
       analysis_ids_json, message, read, user_note, sent_by, confidence_score, validated_at,
       fingerprint)
    VALUES
      (?, ?, ?, ?, ?, NULL, ?, 0, NULL, 'alert-commander', ?, ?, ?)
  `);

  // D-2 FIX-CASCADE-MACRO-CARD-REAL-DETAIL: ensure is_correlation_stub column exists
  // before writing rows (idempotent, negligible overhead).
  if (hasAgentSignalsTable(db)) {
    ensureCorrelationStubColumn(db);
    ensureConfidenceScoreColumn(db);
  }

  // FIX-ALERT-ORPHAN-CORRELATION: co-write agent_signals row for C-08 correlation.
  const writeSignal = hasAgentSignalsTable(db) && hasAgentSignalsAlertIdColumn(db);
  const insertSignal = writeSignal
    ? db.prepare(`
        INSERT OR IGNORE INTO agent_signals
          (from_agent, to_agent, signal_type, stock_code, payload, status,
           created_at, expires_at, alert_id, is_correlation_stub, confidence_score)
        VALUES
          ('alert-engine', 'all', 'verified_decision', ?, ?, 'unread',
           ?, datetime(?, '+2 hours'), ?, 1, ?)
      `)
    : null;

  // Dedup guard: skip signal write if a row with this alert_id already exists.
  const checkSignal = writeSignal
    ? db.prepare("SELECT 1 FROM agent_signals WHERE alert_id = ? LIMIT 1")
    : null;

  // FIX-AGENT-SIGNALS-ORPHAN-ALERT-ID: existence guard (see storeAlerts above
  // for full rationale) — never write the correlation row on faith that the
  // paired `alerts` INSERT OR IGNORE actually persisted a row.
  const checkAlertRow = writeSignal
    ? db.prepare("SELECT 1 FROM alerts WHERE id = ? LIMIT 1")
    : null;

  const insertMany = db.transaction((rows: Alert[]) => {
    for (const alert of rows) {
      insert.run(
        alert.id,
        alert.createdAt,
        alert.severity,
        JSON.stringify(alert.signals),
        JSON.stringify([{ code: alert.actionCode }]),
        alert.message,
        alert.confidence_score ?? null,
        alert.validated_at ?? null,
        alert.fingerprint ?? null,
      );
      if (insertSignal && checkSignal && checkAlertRow) {
        const existing = checkSignal.get(alert.id);
        const alertRowExists = checkAlertRow.get(alert.id);
        if (!existing && alertRowExists) {
          const stockCode = alert.actionCode === "MACRO" ? null : (alert.actionCode || null);
          // FR-1 FIX-SIGNAL-CONFIDENCE-DEFAULT-50: use alert's real confidence when in [0,100];
          // otherwise derive from severity via module-private severityToConfidence().
          const confidenceScore =
            typeof alert.confidence_score === "number" &&
            alert.confidence_score >= 0 &&
            alert.confidence_score <= 100
              ? Math.min(100, Math.max(0, Math.round(alert.confidence_score)))
              : severityToConfidence(alert.severity);
          // FIX-ALERT-ENGINE-VERIFIED-DECISION-EMPTY-PAYLOAD-NULL-STOCKCODE:
          // populate real decision content instead of the previous hardcoded
          // '{}' literal (see buildVerifiedDecisionPayload doc comment above
          // storeAlerts()).
          const payloadJson = buildVerifiedDecisionPayload(alert, confidenceScore);
          // Emit-time guard — REFUSE (fail-loud log, not silent-swallow) to
          // persist an empty-content correlation row.
          if (payloadJson === "{}" || !alert.message) {
            logger.warn(
              "[alertStore] refusing to write verified_decision signal with empty payload",
              { alertId: alert.id, stockCode, payloadJson },
            );
            continue;
          }
          insertSignal.run(
            stockCode,
            payloadJson,
            alert.createdAt,
            alert.createdAt,
            alert.id,
            confidenceScore,
          );
        }
      }
    }
  });

  insertMany(alerts);
}

/**
 * Row shape returned from the `alerts` table for unnotified queries.
 * We map it back to a minimal Alert-compatible object.
 */
interface AlertRow {
  id: string;
  triggered_at: string;
  severity: string;
  signals_json: string | null;
  affected_actions_json: string | null;
  analysis_ids_json: string | null;
  message: string | null;
  read: number;
  user_note: string | null;
  notified_telegram: number;
}

/**
 * Read all HIGH/CRITICAL alerts that have not yet been sent to Telegram,
 * constrained to the given rolling time window.
 *
 * The window prevents re-sending old alerts on server restart: only alerts
 * created within the last `windowMinutes` minutes are considered.
 *
 * The 16-minute default matches the 15-minute intelligence cycle with 1-minute
 * overlap to absorb clock drift.
 *
 * @param windowMinutes - Look-back window in minutes (e.g. 16 for 16 min)
 * @param db            - SQLite Database connection (defaults to singleton `getDb()`)
 * @returns Alert array sorted oldest-first (triggered_at ASC)
 */
export function readUnnotifiedAlerts(
  windowMinutes: number,
  db: Database = getDb(),
): Alert[] {
  // Use unixepoch arithmetic so the comparison works regardless of whether
  // triggered_at is stored as ISO 8601 (e.g. "2026-03-30T14:00:00.000Z")
  // or as SQLite datetime string (e.g. "2026-03-30 14:00:00").
  const windowSeconds = Math.round(windowMinutes * 60);
  const rows = db
    .prepare(
      `SELECT * FROM alerts
       WHERE severity IN ('high', 'critical', 'medium')
         AND notified_telegram = 0
         AND unixepoch(triggered_at) >= unixepoch('now') - ?
       ORDER BY triggered_at ASC`,
    )
    .all(windowSeconds) as AlertRow[];

  return rows.map((row) => ({
    id: row.id,
    createdAt: row.triggered_at,
    severity: row.severity as Alert["severity"],
    signals: row.signals_json ? (JSON.parse(row.signals_json) as Alert["signals"]) : [],
    actionCode:
      row.affected_actions_json
        ? (JSON.parse(row.affected_actions_json) as Array<{ code: string }>)[0]?.code ?? ""
        : "",
    message: row.message ?? "",
    isRead: row.read === 1,
  }));
}

/**
 * Mark a single alert as successfully sent to Telegram.
 *
 * Sets `notified_telegram = 1` for the given alert ID. This prevents the next
 * cycle from re-sending the same alert. Call this only after a confirmed
 * successful Telegram send (i.e. `notifyTelegramAlert` returned `true`).
 *
 * @param alertId - The `id` field of the alert to mark
 * @param db      - SQLite Database connection (defaults to singleton `getDb()`)
 */
export function markAlertNotified(alertId: string, db: Database = getDb()): void {
  db.prepare("UPDATE alerts SET notified_telegram = 1 WHERE id = ?").run(alertId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Task 1847d-A — Outcome scoring store methods
// ─────────────────────────────────────────────────────────────────────────────

/** Valid outcome values for alert scoring */
export type AlertOutcome = "HIT" | "MISS" | "UNKNOWN";

/** Minimal shape for outcome-pending alerts */
export interface PendingOutcomeAlert {
  id: string;
  triggered_at: string;
  severity: string;
  signals_json: string | null;
  affected_actions_json: string | null;
  alert_type: string | null;
}

/**
 * Read alerts that have no outcome scored yet (outcome IS NULL).
 * Used by the outcome-scoring job and by `get_alert_accuracy` fallback path.
 *
 * @param windowDays - Only look back this many days (default: 30)
 * @param db         - SQLite Database connection (defaults to singleton)
 * @returns Array of alerts without outcomes, oldest-first
 */
export function readPendingOutcomeAlerts(
  windowDays = 30,
  db: Database = getDb(),
): PendingOutcomeAlert[] {
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();
  return db
    .prepare<PendingOutcomeAlert, [string]>(
      `SELECT id, triggered_at, severity, signals_json, affected_actions_json,
              NULL as alert_type
       FROM alerts
       WHERE outcome IS NULL
         AND triggered_at >= ?
       ORDER BY triggered_at ASC`,
    )
    .all(since);
}

/**
 * Write an outcome to a single alert row.
 *
 * Idempotent via UPDATE — calling twice with the same values is safe.
 * Returns false (already-scored) when outcome column is already non-null
 * with a DIFFERENT value, but still writes — caller decides policy.
 *
 * @param alertId - The alert `id` to update
 * @param outcome - 'HIT' | 'MISS' | 'UNKNOWN'
 * @param detail  - Optional free-text explanation
 * @param db      - SQLite Database connection (defaults to singleton)
 * @returns `{ found: true, alreadyScored: boolean }` or `{ found: false }`
 */
export function writeAlertOutcome(
  alertId: string,
  outcome: AlertOutcome,
  detail?: string,
  db: Database = getDb(),
): { found: boolean; alreadyScored: boolean } {
  const existing = db
    .prepare<{ outcome: string | null }, [string]>(
      "SELECT outcome FROM alerts WHERE id = ? LIMIT 1",
    )
    .get(alertId);

  if (!existing) return { found: false, alreadyScored: false };

  const alreadyScored = existing.outcome !== null;

  db.prepare(
    `UPDATE alerts
     SET outcome        = ?,
         outcome_at     = datetime('now'),
         outcome_detail = ?
     WHERE id = ?`,
  ).run(outcome, detail ?? null, alertId);

  return { found: true, alreadyScored };
}

/**
 * Returns true when the alert with `alertId` already exists in the DB AND has
 * `notified_telegram = 1`. Use this in push-prices and similar inline send
 * paths to guard against re-sending on every VPS push (~65 s cadence).
 *
 * Background: `storeAlerts` uses INSERT OR IGNORE so duplicate rows are
 * silently skipped at the DB layer, but the in-memory Alert object is still
 * returned by `generateAlerts` and would be re-sent on every push without
 * this guard. Task 1393.
 *
 * @param alertId - The deterministic ID from `alertGenerator.chooseAlertId`
 * @param db      - SQLite Database connection (defaults to singleton `getDb()`)
 * @returns `true` → skip send; `false` → proceed with send
 */
export function shouldSkipAlreadyNotifiedAlert(
  alertId: string,
  db: Database = getDb(),
): boolean {
  const row = db
    .prepare<{ notified_telegram: number }, [string]>(
      "SELECT notified_telegram FROM alerts WHERE id = ? LIMIT 1",
    )
    .get(alertId);
  return row !== null && row !== undefined && row.notified_telegram === 1;
}
