/**
 * bctcZeroExtractBlocklist.ts —
 * FIX-BCTC-ZEROEXTRACT-BLOCK-NO-FAILURE-RECORD-UNBOUNDED-REEXTRACT-LOOP
 *
 * Durable failure record for the parseBctcReport.ts::storeReport()
 * totalAssets<=0 write-block guard (parseBctcReport.ts ~line 373). That
 * guard is CORRECT and untouched by this fix — it must never let a
 * zero/failed extraction reach an INSERT. What was missing: the block was a
 * log line + one Telegram send with NO durable record anywhere keyed on
 * (action_code, sort_key). Every enqueuer (checkSscReports.ts's
 * isNewReportFn, the bctc_vps_queue pull/enrich cycle, bctcReparseJob's
 * agent_feedback loop) reads "no financial_reports row" as "never
 * attempted" and re-enqueues the same pair forever — confirmed live: 8/8
 * pairs blocked on 08-22 reappeared on 08-23, GEX 2025-Q4 fired 4x in 36
 * min, pdf-extractor sat at 119-206% CPU re-OCRing the same PDFs.
 *
 * Mirrors the existing agent_feedback attempt-count + dead-letter shape
 * (bctcReparseJob.ts:776-803, DEAD_AT_ATTEMPTS) rather than inventing a new
 * one: attempt_count increments on every blocked call; once it reaches
 * BCTC_ZERO_EXTRACT_DEAD_AT_ATTEMPTS the pair is marked status='dead' and
 * every downstream caller that checks isZeroExtractDeadLettered() must
 * short-circuit BEFORE spending another OCR/extraction cycle on it.
 *
 * Infrastructure layer: DB access only — no HTTP, no Telegram. Callers
 * (parseBctcReport.ts, fetchParseAndStoreBctc.ts, pushBctcExtraction.ts) own
 * the log/Telegram/skip side effects.
 */

import type { Database } from "bun:sqlite";

/**
 * Bounded threshold mirroring bctcReparseJob.ts's DEAD_AT_ATTEMPTS shape.
 * Set lower (5, not 10) than that agent_feedback sibling because this guard
 * has no "file confirmed missing from disk" precondition — a genuinely
 * corrupt/mis-OCR'd PDF reproduces the SAME zero-extraction on every retry,
 * so there is no transient-failure case worth an extra margin. 5 matches
 * ALERT_AT_ATTEMPTS in the same sibling file — the established "stop
 * spending cycles" bound for this pipeline family.
 */
export const BCTC_ZERO_EXTRACT_DEAD_AT_ATTEMPTS = 5;

export interface ZeroExtractBlockResult {
  attemptCount: number;
  deadLettered: boolean;
  /** false only when the durable write itself failed (DB error) — callers
   *  must never claim "flagged for manual review" when this is false (AC-4). */
  recorded: boolean;
}

/**
 * Record one blocked zero-extraction attempt for (actionCode, sortKey).
 * Upserts attempt_count (+1), last_blocked_at, reason; dead-letters the pair
 * once attempt_count reaches BCTC_ZERO_EXTRACT_DEAD_AT_ATTEMPTS. Never
 * throws — a DB write failure is caught and surfaces as `recorded: false`
 * so the caller's block message stays honest.
 */
export function recordZeroExtractBlock(
  db: Database,
  actionCode: string,
  sortKey: string,
  reason: string,
): ZeroExtractBlockResult {
  try {
    db.prepare(
      `INSERT INTO bctc_zero_extract_blocks (action_code, sort_key, attempt_count, last_blocked_at, reason, status)
       VALUES (?, ?, 1, datetime('now'), ?, 'active')
       ON CONFLICT(action_code, sort_key) DO UPDATE SET
         attempt_count   = attempt_count + 1,
         last_blocked_at = datetime('now'),
         reason          = excluded.reason,
         status          = CASE WHEN attempt_count + 1 >= ? THEN 'dead' ELSE status END`,
    ).run(actionCode, sortKey, reason, BCTC_ZERO_EXTRACT_DEAD_AT_ATTEMPTS);

    const row = db
      .query<{ attempt_count: number; status: string }, [string, string]>(
        `SELECT attempt_count, status FROM bctc_zero_extract_blocks WHERE action_code = ? AND sort_key = ?`,
      )
      .get(actionCode, sortKey);

    return {
      attemptCount: row?.attempt_count ?? 1,
      deadLettered: row?.status === "dead",
      recorded: true,
    };
  } catch {
    return { attemptCount: 0, deadLettered: false, recorded: false };
  }
}

/**
 * Check whether (actionCode, sortKey) was already dead-lettered by a prior
 * blocked zero-extraction. Callers use this to short-circuit BEFORE
 * spending an OCR/extraction cycle — this is what actually stops the
 * unbounded re-extract loop; the write-block guard alone only refuses the
 * INSERT, it never stops the enqueuer from re-triggering OCR.
 */
export function isZeroExtractDeadLettered(
  db: Database,
  actionCode: string,
  sortKey: string,
): boolean {
  // Fails OPEN (returns false = "not dead-lettered, proceed normally") on
  // any DB error, e.g. the table not existing yet in a test harness that
  // never calls initDatabase(). This is a defensive short-circuit ON TOP OF
  // the existing storeReport() write-block guard, never a substitute for
  // it: a false negative here just means one extra wasted attempt, not a
  // corrupt write (parseBctcReport's own guard still blocks the INSERT
  // unconditionally regardless of this check's outcome).
  try {
    const row = db
      .query<{ status: string }, [string, string]>(
        `SELECT status FROM bctc_zero_extract_blocks WHERE action_code = ? AND sort_key = ?`,
      )
      .get(actionCode, sortKey);
    return row?.status === "dead";
  } catch {
    return false;
  }
}
