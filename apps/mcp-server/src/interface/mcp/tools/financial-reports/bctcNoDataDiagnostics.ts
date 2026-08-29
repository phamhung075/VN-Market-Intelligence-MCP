/**
 * bctcNoDataDiagnostics.ts — FIX-BCTC-DATA-GAP-FAMILY U3.3 / U6
 *
 * Stage-granular no-data diagnostics for the `financial_reports` serve paths
 * (consumed by get_bctc_full): (a) quarantine → period-mismatch (U3.3) or
 * write-blocked N times (U6b); (b) refine_status='PENDING' row → "extracted,
 * refine pending (N layout units, M refined)" (U6a); (c) neither → kind='absent'
 * → caller keeps the EXACT legacy string (bctc-analyst contract). Pure DB reads,
 * never throws. Extracted from bctcFullTools.ts (size-lint baseline tolerance).
 */
import type { Database } from "bun:sqlite";

export interface BctcNoDataDiagnostic {
  /** refine_pending — a financial_reports row exists but refine never ran/finalized. */
  kind: "refine_pending" | "blocked" | "absent";
  /** Human-readable reason; null for kind='absent' (caller keeps the legacy string). */
  text: string | null;
}

/** Quarantine record for (upperCode [, sortKey]) → blocked diagnostic or null. Fails open on missing table. */
function readQuarantineRecord(
  db: Database,
  upperCode: string,
  sortKey?: string,
): BctcNoDataDiagnostic | null {
  try {
    const blockRow = db
      .query<{ attempt_count: number; reason: string; status: string }, [string, string | null, string | null]>(
        `SELECT attempt_count, reason, status FROM bctc_zero_extract_blocks
         WHERE action_code = ? AND (? IS NULL OR sort_key = ?)
         ORDER BY last_blocked_at DESC LIMIT 1`,
      )
      .get(upperCode, sortKey ?? null, sortKey ?? null);
    if (!blockRow) return null;

    const mismatchMatch = blockRow.reason.match(/period-mismatch:\s*content=(\d{4})-Q([1-4])/i);
    if (mismatchMatch) {
      return {
        kind: "blocked",
        text:
          `${upperCode} ${sortKey ?? "?"}: period-mismatch (content ` +
          `${mismatchMatch[1]}-Q${mismatchMatch[2]}) — awaiting re-discovery.`,
      };
    }
    const stateLabel = blockRow.status === "dead" ? "DEAD-LETTERED" : "active";
    return {
      kind: "blocked",
      text:
        `${upperCode} ${sortKey ?? ""}: write-blocked ${blockRow.attempt_count} time(s) ` +
        `(${stateLabel}) — ${blockRow.reason}`.trim(),
    };
  } catch {
    return null; // table absent — fail open
  }
}

/** Stage pointer for a PENDING row that never refined (DXG class). Fails open on missing tables. */
function readRefinePending(
  db: Database,
  upperCode: string,
): BctcNoDataDiagnostic | null {
  try {
    const pendingRow = db
      .query<{ id: string; sort_key: string }, [string]>(
        `SELECT id, sort_key FROM financial_reports
         WHERE action_code = ? AND refine_status = 'PENDING'
         ORDER BY sort_key DESC LIMIT 1`,
      )
      .get(upperCode);
    if (!pendingRow) return null;

    let layoutUnits = 0;
    let refinedUnits = 0;
    try {
      layoutUnits = db
        .query<{ cnt: number }, [string]>(
          "SELECT COUNT(*) AS cnt FROM bctc_layout_units WHERE report_id = ?",
        )
        .get(pendingRow.id)?.cnt ?? 0;
    } catch { /* table absent in fixture */ }
    try {
      refinedUnits = db
        .query<{ cnt: number }, [string]>(
          "SELECT COUNT(*) AS cnt FROM bctc_refined_units WHERE report_id = ?",
        )
        .get(pendingRow.id)?.cnt ?? 0;
    } catch { /* table absent in fixture */ }

    return {
      kind: "refine_pending",
      text:
        `${upperCode} ${pendingRow.sort_key}: extracted, refine pending ` +
        `(${layoutUnits} layout units, ${refinedUnits} refined) — awaiting refine pipeline. ` +
        `Use get_bctc_pending_refine for the queue.`,
    };
  } catch {
    return null; // financial_reports absent — fail open
  }
}

/** Build a stage-granular no-data diagnostic (kind='absent' → caller keeps the
 * exact legacy string). Precedence: exact-pair quarantine (root cause) → PENDING
 * row (current stage) → latest quarantine for the code. Never throws. */
export function buildBctcNoDataDiagnostic(
  db: Database,
  upperCode: string,
  sortKey?: string,
): BctcNoDataDiagnostic {
  if (sortKey !== undefined) {
    const exactBlock = readQuarantineRecord(db, upperCode, sortKey);
    if (exactBlock) return exactBlock;
  }
  const pending = readRefinePending(db, upperCode);
  if (pending) return pending;
  if (sortKey === undefined) {
    const anyBlock = readQuarantineRecord(db, upperCode);
    if (anyBlock) return anyBlock;
  }
  return { kind: "absent", text: null };
}
