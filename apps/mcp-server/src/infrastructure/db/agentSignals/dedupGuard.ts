/**
 * Task 1862g — 4-hour dedup for same (stock_code, signal_type, direction).
 * Extracted verbatim (behaviour-preserving) out of _postSignalInner for size.
 * Suppresses alert spam when a producer fires the same ticker + direction
 * repeatedly. Only applies when BOTH stock_code AND direction are present.
 */

import type { Database } from "bun:sqlite";

export interface DedupCheckParams {
  db: Database;
  dedupWindowMinutes: number;
  resolvedStockCode: string | null;
  signalType: string;
  findingData: Record<string, unknown>;
  hasCreatedAtColumn: boolean;
}

/** True when a duplicate exists within the window — caller must suppress (return -1) without inserting. */
export function isDuplicateWithinWindow(p: DedupCheckParams): boolean {
  if (p.dedupWindowMinutes <= 0 || p.resolvedStockCode === null || !p.hasCreatedAtColumn) return false;

  const direction =
    typeof p.findingData["direction"] === "string"
      ? (p.findingData["direction"] as string)
      : typeof p.findingData["catalyst_direction"] === "string"
      ? (p.findingData["catalyst_direction"] as string)
      : null;
  if (direction === null) return false;

  const cutoff = new Date(Date.now() - p.dedupWindowMinutes * 60_000)
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d{3}Z$/, "");

  // Direction is stored inside finding_data JSON — use JSON_EXTRACT when available,
  // otherwise fall back to a LIKE search (SQLite < 3.38 may lack JSON functions).
  let existing: { id: number } | null = null;
  try {
    existing = p.db
      .prepare<{ id: number }, [string, string, string, string, string]>(
        `SELECT id FROM agent_signals
         WHERE stock_code  = ?
           AND signal_type = ?
           AND created_at >= ?
           AND (
             JSON_EXTRACT(finding_data, '$.direction') = ?
             OR JSON_EXTRACT(finding_data, '$.catalyst_direction') = ?
           )
         LIMIT 1`,
      )
      .get(p.resolvedStockCode, p.signalType, cutoff, direction, direction);
  } catch {
    existing = p.db
      .prepare<{ id: number }, [string, string, string, string, string]>(
        `SELECT id FROM agent_signals
         WHERE stock_code  = ?
           AND signal_type = ?
           AND created_at >= ?
           AND (
             finding_data LIKE '%"direction":"' || ? || '"%'
             OR finding_data LIKE '%"catalyst_direction":"' || ? || '"%'
           )
         LIMIT 1`,
      )
      .get(p.resolvedStockCode, p.signalType, cutoff, direction, direction);
  }

  if (existing !== null) {
    console.info(
      `[agentSignalStore] Dedup suppressed: ${p.signalType} ${p.resolvedStockCode} ${direction} ` +
      `(duplicate of id=${existing.id}, window=${p.dedupWindowMinutes}m)`,
    );
    return true;
  }
  return false;
}
