/**
 * tasksMdJanitorJob — 7-day dedup store (in-memory, resets on process restart —
 * acceptable for a daily job).
 *
 * Split out of tasksMdJanitorJob.ts (FIX-SIZELINT-TASKSMDJANITORJOB-1012L,
 * 2026-08-24). Used both for Step R-6 (BUG telegram per-divergence dedup)
 * and the production entry point's job-level internal-failure dedup.
 */

const _dedupStore: Map<string, number> = new Map();
const DEDUP_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function isDedupActive(key: string): boolean {
  const ts = _dedupStore.get(key);
  if (ts === undefined) return false;
  return Date.now() - ts < DEDUP_TTL_MS;
}

export function markDedup(key: string): void {
  _dedupStore.set(key, Date.now());
}

/** Reset dedup store (test isolation) */
export function _resetDedupStore(): void {
  _dedupStore.clear();
}
