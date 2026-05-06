/**
 * Task 1847d-A — Alert outcome schema + store methods
 *
 * Tests:
 *  1. Migration runs without error on fresh DB
 *  2. Migration is idempotent (runs twice)
 *  3. readPendingOutcomeAlerts returns only NULL-outcome rows
 *  4. readPendingOutcomeAlerts respects 90-day lookback
 *  5. writeAlertOutcome updates correctly
 *  6. writeAlertOutcome is idempotent (second call → false)
 *  7. Index exists after migration
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runAlertOutcomeMigration } from '../infrastructure/db/schema-alerts.js';
import { readPendingOutcomeAlerts, writeAlertOutcome } from '../infrastructure/db/alertStore.js';

// ── helpers ────────────────────────────────────────────────────────────────────

function freshDb(): Database {
  const db = new Database(':memory:');
  // minimal alerts table matching existing schema
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
  `);
  return db;
}

function insertAlert(db: Database, opts: {
  stocks?: string;
  triggered_at?: string;
  outcome?: string | null;
}): number {
  const now = opts.triggered_at ?? new Date().toISOString();
  const result = db.prepare(`
    INSERT INTO alert_engine_records
      (stocks, signal_types, message, fingerprint, severity, triggered_at, sent_telegram)
    VALUES (?, '', 'msg', 'fp1', 'medium', ?, 0)
  `).run(opts.stocks ?? 'VCB', now);
  const id = result.lastInsertRowid as number;

  if (opts.outcome !== undefined && opts.outcome !== null) {
    db.prepare(`UPDATE alert_engine_records SET outcome = ? WHERE id = ?`).run(opts.outcome, id);
  }
  return id;
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('1847d-A — alert outcome schema migration', () => {
  it('runs without error on fresh DB', () => {
    const db = freshDb();
    expect(() => runAlertOutcomeMigration(db)).not.toThrow();
  });

  it('is idempotent — runs twice without error', () => {
    const db = freshDb();
    runAlertOutcomeMigration(db);
    expect(() => runAlertOutcomeMigration(db)).not.toThrow();
  });

  it('index idx_alerts_outcome_pending exists after migration', () => {
    const db = freshDb();
    runAlertOutcomeMigration(db);
    const row = db
      .prepare<{ name: string }, []>(
        `SELECT name FROM sqlite_master WHERE type='index' AND name='idx_alerts_outcome_pending'`,
      )
      .get();
    expect(row?.name).toBe('idx_alerts_outcome_pending');
  });
});

describe('1847d-A — readPendingOutcomeAlerts', () => {
  let db: Database;

  beforeEach(() => {
    db = freshDb();
    runAlertOutcomeMigration(db);
  });

  it('returns rows with NULL outcome only', () => {
    insertAlert(db, { stocks: 'VCB' }); // NULL outcome — should appear
    const id2 = insertAlert(db, { stocks: 'TCB' });
    // mark id2 as scored
    db.prepare(`UPDATE alert_engine_records SET outcome = 'HIT' WHERE id = ?`).run(id2);

    const rows = readPendingOutcomeAlerts(db);
    expect(rows.length).toBe(1);
    expect(rows[0].stocks).toBe('VCB');
  });

  it('excludes rows older than 90 days', () => {
    const old = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString();
    insertAlert(db, { stocks: 'OLD', triggered_at: old });
    insertAlert(db, { stocks: 'RECENT' }); // now → within 90d

    const rows = readPendingOutcomeAlerts(db);
    expect(rows.length).toBe(1);
    expect(rows[0].stocks).toBe('RECENT');
  });

  it('respects limit option', () => {
    for (let i = 0; i < 5; i++) insertAlert(db, { stocks: `S${i}` });
    const rows = readPendingOutcomeAlerts(db, { limit: 2 });
    expect(rows.length).toBe(2);
  });

  it('returns all required fields', () => {
    insertAlert(db, { stocks: 'VCB' });
    const rows = readPendingOutcomeAlerts(db);
    const r = rows[0];
    expect(r).toHaveProperty('id');
    expect(r).toHaveProperty('stocks');
    expect(r).toHaveProperty('signal_types');
    expect(r).toHaveProperty('message');
    expect(r).toHaveProperty('fingerprint');
    expect(r).toHaveProperty('severity');
    expect(r).toHaveProperty('triggered_at');
    expect(r.outcome).toBeNull();
  });
});

describe('1847d-A — writeAlertOutcome', () => {
  let db: Database;

  beforeEach(() => {
    db = freshDb();
    runAlertOutcomeMigration(db);
  });

  it('updates outcome and returns true', () => {
    const id = insertAlert(db, { stocks: 'VCB' });
    const ok = writeAlertOutcome(db, id, 'HIT', { price: 123 });
    expect(ok).toBe(true);

    const row = db
      .prepare<{ outcome: string; outcome_at: string; outcome_detail: string }, [number]>(
        `SELECT outcome, outcome_at, outcome_detail FROM alert_engine_records WHERE id = ?`,
      )
      .get(id);
    expect(row?.outcome).toBe('HIT');
    expect(row?.outcome_at).toBeTruthy();
    expect(JSON.parse(row?.outcome_detail ?? '{}')).toEqual({ price: 123 });
  });

  it('is idempotent — second call returns false and does not overwrite', () => {
    const id = insertAlert(db, { stocks: 'VCB' });
    writeAlertOutcome(db, id, 'HIT', { price: 100 });
    const ok2 = writeAlertOutcome(db, id, 'MISS', { price: 200 });
    expect(ok2).toBe(false);

    const row = db
      .prepare<{ outcome: string }, [number]>(
        `SELECT outcome FROM alert_engine_records WHERE id = ?`,
      )
      .get(id);
    expect(row?.outcome).toBe('HIT'); // not overwritten
  });

  it('returns false for non-existent id', () => {
    const ok = writeAlertOutcome(db, 9999, 'HIT', {});
    expect(ok).toBe(false);
  });
});
