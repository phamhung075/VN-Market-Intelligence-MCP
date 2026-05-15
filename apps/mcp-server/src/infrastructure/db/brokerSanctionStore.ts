/**
 * Task 915 — Broker Sanction Store
 *
 * SQLite adapter for persisting SSC sanctions against brokers / securities
 * firms. Used by `forecastConfidenceScore` to discount a broker's forecast
 * confidence when the broker is currently under SSC sanction.
 *
 * Table: broker_sanctions
 *   id             INTEGER PRIMARY KEY AUTOINCREMENT
 *   broker_name    TEXT    — canonical broker name (e.g. "Chứng khoán Tân Việt")
 *   sanction_start TEXT    — ISO date (YYYY-MM-DD)
 *   sanction_end   TEXT    — ISO date or NULL for open-ended
 *   severity       TEXT    — 'warning' | 'suspension'
 *   source         TEXT    — URL / short description (optional)
 *   created_at     TEXT    — ISO 8601 timestamp
 */

import type { Database } from "bun:sqlite";
import type {
  BrokerSanction,
  SanctionSeverity,
} from "../../domain/services/forecastConfidenceScore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Table init
// ─────────────────────────────────────────────────────────────────────────────
//
// Task 1038 (janitor dedup): the broker_sanctions DDL lives exclusively in
// `schema.ts:initDatabase()`. The former `initBrokerSanctionTable()` helper was
// removed because it duplicated the schema. Tests using :memory: databases
// create the table inline (see src/__tests__/915-broker-credibility.test.ts).

// ─────────────────────────────────────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────────────────────────────────────

export interface InsertBrokerSanctionInput {
  brokerName: string;
  sanctionStart: string;
  sanctionEnd: string | null;
  severity: SanctionSeverity;
  source?: string;
}

/**
 * Insert a new sanction row using INSERT OR IGNORE.
 *
 * Task 1920d: Changed from plain INSERT to INSERT OR IGNORE to support the
 * UNIQUE(broker_name, sanction_start) constraint added for the quarterly sweep
 * job. A duplicate (same broker + same sanction_start) is silently skipped —
 * this is correct dedup behaviour for idempotent quarterly re-runs.
 *
 * Returns the generated row id, or 0 when the row was ignored (duplicate).
 */
export function insertBrokerSanction(
  db: Database,
  input: InsertBrokerSanctionInput,
): number {
  const createdAt = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO broker_sanctions
        (broker_name, sanction_start, sanction_end, severity, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.brokerName,
      input.sanctionStart,
      input.sanctionEnd,
      input.severity,
      input.source ?? null,
      createdAt,
    );
  // Return the new rowid when the row was inserted, or 0 when OR IGNORE skipped
  // a duplicate. SQLite's lastInsertRowid is sticky (returns previous rowid on
  // ignored inserts), so we use `changes` to detect the no-op case.
  return result.changes > 0 ? Number(result.lastInsertRowid) : 0;
}

interface BrokerSanctionRow {
  broker_name: string;
  sanction_start: string;
  sanction_end: string | null;
  severity: string;
  source: string | null;
}

function rowToSanction(row: BrokerSanctionRow): BrokerSanction {
  const base: BrokerSanction = {
    brokerName: row.broker_name,
    sanctionStart: row.sanction_start,
    sanctionEnd: row.sanction_end,
    severity: row.severity as SanctionSeverity,
  };
  if (row.source !== null) base.source = row.source;
  return base;
}

/**
 * List all sanctions for a broker (case-insensitive match on broker_name).
 */
export function listBrokerSanctions(
  db: Database,
  brokerName: string,
): BrokerSanction[] {
  const rows = db
    .prepare(
      `SELECT broker_name, sanction_start, sanction_end, severity, source
       FROM broker_sanctions
       WHERE LOWER(broker_name) = LOWER(?)
       ORDER BY sanction_start DESC`,
    )
    .all(brokerName) as BrokerSanctionRow[];
  return rows.map(rowToSanction);
}

/**
 * List all sanctions active on a given date (YYYY-MM-DD).
 */
export function listActiveBrokerSanctions(
  db: Database,
  asOf: string,
): BrokerSanction[] {
  const rows = db
    .prepare(
      `SELECT broker_name, sanction_start, sanction_end, severity, source
       FROM broker_sanctions
       WHERE sanction_start <= ?
         AND (sanction_end IS NULL OR sanction_end >= ?)
       ORDER BY broker_name ASC, sanction_start DESC`,
    )
    .all(asOf, asOf) as BrokerSanctionRow[];
  return rows.map(rowToSanction);
}
