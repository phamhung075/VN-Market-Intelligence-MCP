/**
 * deepFetchQueueStore.ts — DFR-P2-MCP (Sprint DEEPFETCH-RAG-REDESIGN)
 *
 * Infrastructure store for deep_fetch_queue and deep_fetch_stats tables.
 *
 * All functions receive a db handle (composition-root pattern — no getDb() call here).
 *
 * Layer: infrastructure — may import from domain but not from application.
 */

import type { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface DeepFetchQueueRow {
  id: number;
  source_url: string;
  source_domain: string;
  rag_id: string;
  ticker: string | null;
  status: "pending" | "vps-fetching" | "vps-failed" | "done" | "expired";
  attempts: number;
  queued_at: string;
  fetched_at: string | null;
}

export interface EnqueueParams {
  source_url: string;
  source_domain: string;
  rag_id: string;
  ticker?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Queue management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Insert a new queue row. Returns true if newly inserted, false if already present
 * (INSERT OR IGNORE on UNIQUE source_url — second call for same URL is a silent no-op).
 */
export function enqueueIfNotPresent(
  db: Database,
  params: EnqueueParams,
): boolean {
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO deep_fetch_queue
         (source_url, source_domain, rag_id, ticker)
       VALUES (?, ?, ?, ?)`,
    )
    .run(
      params.source_url,
      params.source_domain,
      params.rag_id,
      params.ticker ?? null,
    );
  return (result.changes ?? 0) > 0;
}

/**
 * Poll up to `limit` rows with status='pending' that are NOT expired
 * (queued_at >= NOW - staleExpiryHours hours).
 *
 * Returns the rows but does NOT transition their status — callers decide the next state.
 */
export function pollPending(
  db: Database,
  limit: number,
  staleExpiryHours = 4,
): DeepFetchQueueRow[] {
  return db
    .prepare<DeepFetchQueueRow, [string, number]>(
      `SELECT id, source_url, source_domain, rag_id, ticker, status, attempts, queued_at, fetched_at
       FROM deep_fetch_queue
       WHERE status = 'pending'
         AND queued_at >= datetime('now', ? )
       ORDER BY queued_at ASC
       LIMIT ?`,
    )
    .all(`-${staleExpiryHours} hours`, limit);
}

/**
 * Poll up to `limit` rows with status='vps-failed' that are NOT expired.
 * Used by deepFetchMainJob (Playwright fallback).
 */
export function pollVpsFailed(
  db: Database,
  limit: number,
  staleExpiryHours = 4,
): DeepFetchQueueRow[] {
  return db
    .prepare<DeepFetchQueueRow, [string, number]>(
      `SELECT id, source_url, source_domain, rag_id, ticker, status, attempts, queued_at, fetched_at
       FROM deep_fetch_queue
       WHERE status = 'vps-failed'
         AND queued_at >= datetime('now', ?)
       ORDER BY queued_at ASC
       LIMIT ?`,
    )
    .all(`-${staleExpiryHours} hours`, limit);
}

/**
 * Check whether a stale row (queued_at < NOW - staleExpiryHours) should be expired.
 * Used inline in executor jobs before processing each row.
 */
export function isStale(row: DeepFetchQueueRow, staleExpiryHours = 4): boolean {
  const queuedMs = new Date(row.queued_at + "Z").getTime();
  const expiryMs = staleExpiryHours * 60 * 60 * 1000;
  return Date.now() - queuedMs > expiryMs;
}

// ─────────────────────────────────────────────────────────────────────────────
// Status transitions
// ─────────────────────────────────────────────────────────────────────────────

export function markDone(db: Database, id: number, fetchedAt: string): void {
  db.prepare(
    `UPDATE deep_fetch_queue SET status = 'done', fetched_at = ? WHERE id = ?`,
  ).run(fetchedAt, id);
}

export function markVpsFailed(db: Database, id: number): void {
  db.prepare(
    `UPDATE deep_fetch_queue SET status = 'vps-failed' WHERE id = ?`,
  ).run(id);
}

export function markExpired(db: Database, id: number): void {
  db.prepare(
    `UPDATE deep_fetch_queue SET status = 'expired' WHERE id = ?`,
  ).run(id);
}

export function incrementAttempts(db: Database, id: number): void {
  db.prepare(
    `UPDATE deep_fetch_queue SET attempts = attempts + 1 WHERE id = ?`,
  ).run(id);
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-domain daily cap
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if today's fetch_count for this domain is strictly less than `cap`.
 * date is YYYY-MM-DD UTC.
 */
export function checkDomainDailyCap(
  db: Database,
  domain: string,
  cap: number,
): boolean {
  const todayUtc = new Date().toISOString().slice(0, 10);
  const row = db
    .prepare<{ fetch_count: number }, [string, string]>(
      `SELECT fetch_count FROM deep_fetch_stats WHERE domain = ? AND date = ?`,
    )
    .get(domain, todayUtc);
  return (row?.fetch_count ?? 0) < cap;
}

/**
 * Upsert the daily counter: INSERT on first call, increment on subsequent calls.
 */
export function incrementDomainCounter(db: Database, domain: string): void {
  const todayUtc = new Date().toISOString().slice(0, 10);
  db.prepare(
    `INSERT INTO deep_fetch_stats (domain, date, fetch_count)
     VALUES (?, ?, 1)
     ON CONFLICT(domain, date) DO UPDATE SET fetch_count = fetch_count + 1`,
  ).run(domain, todayUtc);
}
