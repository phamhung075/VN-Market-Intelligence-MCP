/**
 * Pharma Store — Task 269
 *
 * SQLite CRUD helpers for the pharma_events table.
 *
 * Table stores:
 *   - drug_approval events from DAV scraper
 *   - outbreak signals detected by pollNews
 *   - hospital_tender signals
 *   - price_regulation events
 *   - fdi_pharma events
 *
 * Layer: infrastructure/db
 */

import type { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Row shape for inserting/reading pharma_events. */
export interface PharmaEventRow {
  event_type: string;
  drug_name: string | null;
  manufacturer: string | null;
  stock_code: string | null;
  approval_date: string | null;
  description: string;
  severity: string;
}

/** Full row from DB (includes id and created_at). */
export interface PharmaEventRecord extends PharmaEventRow {
  id: number;
  created_at: string;
}

export interface GetPharmaEventsOptions {
  /** Filter by stock code (e.g. 'DHG') */
  stockCode?: string;
  /** Only return events from the last N days (default: 90) */
  days?: number;
  /** Max rows to return (default: 100) */
  limit?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema init
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create the pharma_events table and indexes (idempotent).
 *
 * @param db - SQLite database instance to initialise the table in.
 */
export function initPharmaStore(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pharma_events (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type    TEXT NOT NULL,
      drug_name     TEXT,
      manufacturer  TEXT,
      stock_code    TEXT,
      approval_date TEXT,
      description   TEXT NOT NULL,
      severity      TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_pharma_code ON pharma_events(stock_code);
    CREATE INDEX IF NOT EXISTS idx_pharma_date ON pharma_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_pharma_type ON pharma_events(event_type);
  `);
}

// ─────────────────────────────────────────────────────────────────────────────
// Write
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Insert a pharma event into the database.
 *
 * @param db  - SQLite database instance
 * @param row - Pharma event data to insert
 */
export function insertPharmaEvent(db: Database, row: PharmaEventRow): void {
  db.run(
    `INSERT INTO pharma_events
       (event_type, drug_name, manufacturer, stock_code, approval_date, description, severity)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      row.event_type,
      row.drug_name ?? null,
      row.manufacturer ?? null,
      row.stock_code ?? null,
      row.approval_date ?? null,
      row.description,
      row.severity,
    ],
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Read
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Query pharma events from the database.
 *
 * @param db      - SQLite database instance
 * @param options - Optional filters: stockCode, days, limit
 * @returns       Array of PharmaEventRecord ordered by created_at DESC
 */
export function getPharmaEvents(
  db: Database,
  options: GetPharmaEventsOptions = {},
): PharmaEventRecord[] {
  const { stockCode, days = 90, limit = 100 } = options;

  const conditions: string[] = [
    `datetime(created_at) >= datetime('now', '-${days} days')`,
  ];
  const params: (string | number)[] = [];

  if (stockCode) {
    conditions.push("stock_code = ?");
    params.push(stockCode);
  }

  const sql = `
    SELECT id, event_type, drug_name, manufacturer, stock_code,
           approval_date, description, severity, created_at
    FROM pharma_events
    WHERE ${conditions.join(" AND ")}
    ORDER BY created_at DESC
    LIMIT ?
  `;
  params.push(limit);

  return db.query<PharmaEventRecord, (string | number)[]>(sql).all(...params);
}
