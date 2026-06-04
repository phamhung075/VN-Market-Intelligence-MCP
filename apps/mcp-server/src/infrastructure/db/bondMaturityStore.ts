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

// DDL is canonical in schema.ts:814 via initDatabase(). Tests use
// src/__tests__/helpers/bondMaturityTestDdl.ts for in-memory setup.

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
  /** DSI-S3 C3: 1 = static seed data; 0 = live-verified. Added via migration. */
  is_seed_data: number | null;
}

function rowToEvent(row: BondRow): BondMaturityEvent {
  return {
    issuer: row.issuer,
    issuerCode: row.issuer_code,
    amount: row.amount_billion,
    maturityDate: row.maturity_date,
    couponRate: row.coupon_rate ?? 0,
    status: row.status as BondMaturityEvent["status"],
    // DSI-S3 C3: propagate seed flag so formatBondCalendar emits the banner.
    // Treat NULL (pre-migration row) as seed=true (safe conservative default).
    static_seed: row.is_seed_data !== 0,
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
  // DSI-S3 C3: write is_seed_data=1 for seed events, 0 for live-fetched events.
  const isSeedData = event.static_seed === true ? 1 : 0;
  db.prepare(`
    INSERT INTO bond_maturity (issuer, issuer_code, amount_billion, maturity_date, coupon_rate, status, is_seed_data, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(issuer_code) DO UPDATE SET
      issuer         = excluded.issuer,
      amount_billion = excluded.amount_billion,
      maturity_date  = excluded.maturity_date,
      coupon_rate    = excluded.coupon_rate,
      status         = excluded.status,
      is_seed_data   = excluded.is_seed_data,
      updated_at     = datetime('now')
  `).run(
    event.issuer,
    event.issuerCode,
    event.amount,
    event.maturityDate,
    event.couponRate,
    event.status,
    isSeedData,
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
