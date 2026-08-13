/** Small pure helpers shared across the agentSignals/ query modules. */

/**
 * Compute an ISO-8601 UTC datetime string for `now + ttlMinutes`.
 * SQLite stores datetimes without a timezone suffix — we strip the trailing Z.
 */
export function expiresAt(ttlMinutes: number): string {
  const ms = Date.now() + ttlMinutes * 60 * 1000;
  // SQLite datetime() format: "YYYY-MM-DD HH:MM:SS" (no Z)
  return new Date(ms).toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
}

/**
 * FIX-AGENT-SIGNALS-IDENTICAL-DUP-EMISSION: resolve the ID to return from an
 * `INSERT OR IGNORE INTO agent_signals` call. Every INSERT variant uses OR
 * IGNORE so a genuine double-EMISSION (same from_agent, signal_type,
 * stock_code, payload, and minute-bucket — see the partial UNIQUE INDEX
 * idx_agent_signals_dedup_identical in schema-news.ts) is silently suppressed
 * at the data layer instead of throwing. `result.changes === 0` means the row
 * was suppressed (either by this index, or by any other UNIQUE constraint on
 * the table) — return -1, the same sentinel the Task 1862g dedupWindowMinutes
 * path already uses for "no row written", so callers have one consistent
 * suppression signal regardless of which dedup layer caught it. When no such
 * constraint is present (e.g. minimal/legacy test DBs), OR IGNORE is a no-op
 * and this always resolves the real inserted ID.
 */
export function resolveInsertId(result: { changes: number; lastInsertRowid: number | bigint }): number {
  if (result.changes === 0) return -1;
  return Number(result.lastInsertRowid);
}
