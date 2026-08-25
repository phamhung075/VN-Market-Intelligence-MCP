/**
 * Evening Summary — diagnostic: news count since midnight GMT+7.
 *
 * Extracted from assembleEveningSummary.ts _assembleEveningSummaryImpl
 * (FACTORY-APP-split-assembleEveningSummary).
 *
 * Layer: application/usecases/eveningSummary — pure query, no side effects.
 */
import type { Database } from "bun:sqlite";

/**
 * Count of rag_analyses rows since `midnight`. Uses injected `getNewsCountFn`
 * for testability; falls back to a direct DB query. Never throws — returns 0
 * on any error.
 */
export function queryNewsCount(
  db: Database,
  midnight: string,
  getNewsCountFn?: (midnight: string) => number,
): number {
  try {
    if (getNewsCountFn) {
      return getNewsCountFn(midnight);
    }
    const countRow = db
      .prepare<{ cnt: number }, [string]>(
        `SELECT COUNT(*) AS cnt FROM rag_analyses WHERE created_at >= ?`,
      )
      .get(midnight);
    return countRow?.cnt ?? 0;
  } catch {
    return 0;
  }
}
