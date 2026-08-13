/**
 * Task 1786 — Earnings conflict detection.
 * Extracted verbatim (behaviour-preserving) out of _postSignalInner for size.
 * For chain_catalyst signals with event_type = "earnings", checks whether a
 * prior signal for the same ticker already carries a different growth
 * figure. If so, appends a conflict warning to payload.detail — does NOT
 * block posting.
 */

import type { Database } from "bun:sqlite";
import { detectEarningsConflict } from "../../../domain/services/earningsConflictDetector.js";

/** Mutates `payload.detail` in place when an earnings conflict is detected. Otherwise a no-op. */
export function applyEarningsConflictWarning(
  db: Database,
  signalType: string,
  resolvedStockCode: string | null,
  findingData: Record<string, unknown>,
  payload: Record<string, unknown>,
): void {
  if (signalType !== "chain_catalyst" || !resolvedStockCode) return;
  if (findingData["event_type"] !== "earnings") return;

  const detail = payload["detail"];
  const warning = detectEarningsConflict(db, resolvedStockCode, typeof detail === "string" ? detail : undefined);
  if (!warning) return;

  payload["detail"] = typeof detail === "string" ? `${detail} — ${warning}` : warning;
}
