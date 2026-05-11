/**
 * Alert Engine — Infrastructure Repositories
 *
 * Concrete implementations of domain ports.
 * SQLite-backed alert storage + mute state.
 */

import type { Database } from 'bun:sqlite';
import type { AlertRepositoryPort, MutePort } from '../domain/repositories.js';
import type { StoredAlert } from '../domain/models.js';

/** Initialize alert engine tables if not present. */
export function initAlertTables(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS alert_engine_records (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      stocks       TEXT NOT NULL,
      signal_types TEXT NOT NULL DEFAULT '',
      message      TEXT NOT NULL DEFAULT '',
      fingerprint  TEXT NOT NULL DEFAULT '',
      severity     TEXT NOT NULL DEFAULT 'medium',
      triggered_at TEXT NOT NULL,
      sent_telegram INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_alert_engine_stocks
      ON alert_engine_records(stocks, triggered_at);
    CREATE INDEX IF NOT EXISTS idx_alert_engine_fingerprint
      ON alert_engine_records(fingerprint, triggered_at);

    CREATE TABLE IF NOT EXISTS alert_mutes (
      stock      TEXT PRIMARY KEY,
      muted_until TEXT NOT NULL
    );
  `);
}

export class SQLiteAlertRepository implements AlertRepositoryPort {
  constructor(private readonly db: Database) {}

  getRecentAlerts(stock: string, withinMinutes: number): StoredAlert[] {
    const cutoff = new Date(Date.now() - withinMinutes * 60_000).toISOString();
    return this.db
      .prepare<StoredAlert, [string, string]>(`
        SELECT
          id,
          stocks,
          signal_types as signalTypes,
          message,
          fingerprint,
          severity,
          triggered_at as triggeredAt,
          sent_telegram as sentToTelegram
        FROM alert_engine_records
        WHERE stocks = ? AND triggered_at >= ?
        ORDER BY triggered_at DESC
      `)
      .all(stock, cutoff);
  }

  countTodayAlerts(stock: string): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const result = this.db
      .prepare<{ cnt: number }, [string, string]>(`
        SELECT COUNT(*) as cnt
        FROM alert_engine_records
        WHERE stocks = ? AND triggered_at >= ?
      `)
      .get(stock, today.toISOString());
    return result?.cnt ?? 0;
  }

  storeAlert(alert: Omit<StoredAlert, 'id'>): number {
    const result = this.db
      .prepare(`
        INSERT INTO alert_engine_records
          (stocks, signal_types, message, fingerprint, severity, triggered_at, sent_telegram)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        alert.stocks,
        alert.signalTypes,
        alert.message,
        alert.fingerprint,
        alert.severity,
        alert.triggeredAt,
        alert.sentToTelegram,
      );
    return result.lastInsertRowid as number;
  }

  hasDuplicateFingerprint(fingerprint: string, withinMinutes: number): boolean {
    const cutoff = new Date(Date.now() - withinMinutes * 60_000).toISOString();
    const row = this.db
      .prepare<{ cnt: number }, [string, string]>(`
        SELECT COUNT(*) as cnt
        FROM alert_engine_records
        WHERE fingerprint = ? AND triggered_at >= ?
      `)
      .get(fingerprint, cutoff);
    return (row?.cnt ?? 0) > 0;
  }
}

export class SQLiteMuteRepository implements MutePort {
  constructor(private readonly db: Database) {}

  isStockMuted(stock: string): boolean {
    const row = this.db
      .prepare<{ muted_until: string }, [string]>(`
        SELECT muted_until FROM alert_mutes WHERE stock = ?
      `)
      .get(stock);
    if (!row) return false;
    return new Date(row.muted_until).getTime() > Date.now();
  }
}
