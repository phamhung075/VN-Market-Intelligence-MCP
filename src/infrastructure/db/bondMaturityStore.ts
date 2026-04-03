/**
 * Bond Maturity Store — Task 243
 *
 * SQLite CRUD helpers for the `bond_maturity` table.
 * Stores TPDN (corporate bond) maturity calendar for real estate developers.
 *
 * All amounts in billion VND (tỷ đồng).
 *
 * @module infrastructure/db/bondMaturityStore
 */

import { Database } from "bun:sqlite";
import type { BondMaturityEvent } from "../../domain/services/bondMaturityTracker.js";

// ─────────────────────────────────────────────────────────────────────────────
// DDL
// ─────────────────────────────────────────────────────────────────────────────

const BOND_MATURITY_DDL = `
  CREATE TABLE IF NOT EXISTS bond_maturity (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    issuer           TEXT NOT NULL,
    issuer_code      TEXT NOT NULL UNIQUE,
    amount_billion   REAL NOT NULL,
    maturity_date    TEXT NOT NULL,
    coupon_rate      REAL,
    status           TEXT NOT NULL DEFAULT 'upcoming',
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
  )
`;

/**
 * Create the bond_maturity table and indexes if they don't exist.
 * Idempotent — safe to call multiple times.
 */
export function ensureBondMaturityTable(db: Database): void {
  db.exec(BOND_MATURITY_DDL);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_bond_maturity_date ON bond_maturity(maturity_date)`,
  );
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_bond_maturity_code ON bond_maturity(issuer_code)`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Raw row type
// ─────────────────────────────────────────────────────────────────────────────

interface BondRow {
  id: number;
  issuer: string;
  issuer_code: string;
  amount_billion: number;
  maturity_date: string;
  coupon_rate: number | null;
  status: string;
  created_at: string;
  updated_at: string;
}

function rowToEvent(row: BondRow): BondMaturityEvent {
  return {
    issuer: row.issuer,
    issuerCode: row.issuer_code,
    amount: row.amount_billion,
    maturityDate: row.maturity_date,
    couponRate: row.coupon_rate ?? 0,
    status: row.status as BondMaturityEvent["status"],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CRUD helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Insert or update a bond maturity record.
 * Uses ON CONFLICT(issuer_code) to upsert by issuer code.
 */
export function upsertBond(db: Database, event: BondMaturityEvent): void {
  db.prepare(`
    INSERT INTO bond_maturity (issuer, issuer_code, amount_billion, maturity_date, coupon_rate, status, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(issuer_code) DO UPDATE SET
      issuer         = excluded.issuer,
      amount_billion = excluded.amount_billion,
      maturity_date  = excluded.maturity_date,
      coupon_rate    = excluded.coupon_rate,
      status         = excluded.status,
      updated_at     = datetime('now')
  `).run(
    event.issuer,
    event.issuerCode,
    event.amount,
    event.maturityDate,
    event.couponRate,
    event.status,
  );
}

/**
 * List upcoming bonds whose maturity_date falls within the next `months` months.
 * Returns bonds sorted by maturity_date ascending.
 *
 * @param db     - SQLite database
 * @param months - Look-ahead window in months
 */
export function listUpcomingBonds(db: Database, months: number): BondMaturityEvent[] {
  const now = new Date().toISOString().split("T")[0]!;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() + months);
  const cutoffStr = cutoff.toISOString().split("T")[0]!;

  const rows = db.prepare(`
    SELECT * FROM bond_maturity
    WHERE maturity_date >= ? AND maturity_date <= ?
    ORDER BY maturity_date ASC
  `).all(now, cutoffStr) as BondRow[];

  return rows.map(rowToEvent);
}

/**
 * Update the status of all bonds for a given issuer_code.
 *
 * @param db         - SQLite database
 * @param issuerCode - Stock ticker code, e.g. "NVL"
 * @param status     - New status value
 */
export function updateBondStatus(
  db: Database,
  issuerCode: string,
  status: BondMaturityEvent["status"],
): void {
  db.prepare(`
    UPDATE bond_maturity
    SET status = ?, updated_at = datetime('now')
    WHERE issuer_code = ?
  `).run(status, issuerCode);
}
