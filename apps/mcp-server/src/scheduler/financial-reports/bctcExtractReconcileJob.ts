/**
 * BCTC Extract Reconcile Job — FIX-BCTC-D3C-RECONCILE-JOB
 *
 * Closes the transition gap FIX-BCTC-D3B-GATE-PEK-TRIGGERED-STATUS opened:
 * `bctcPdfPullJob.ts` fires `/pek-extract` (fire-and-forget 202) and
 * unconditionally advances the queue row to `bctc_vps_queue.status =
 * 'pek_triggered'`. Until THIS job existed, no code path ever moved a row
 * out of `pek_triggered` — every triggered row accumulated forever.
 *
 * Each tick:
 *   1. SELECT rows WHERE status = 'pek_triggered' AND last_attempt <
 *      datetime('now', '-5 minutes') — grace window so a just-triggered row
 *      isn't checked before PEK could plausibly have finished (per-page
 *      latency ~26s — render-seam brief R-MED-1).
 *   2. Re-derive `report_id` via (action_code, sort_key) — the SAME stable-id
 *      lookup D1/D2 established. `bctc_vps_queue` does NOT carry its own
 *      report_id column; the queue row's identity is only (action_code,
 *      period_year, period_quarter), so this lookup is mandatory, not
 *      defensive — there is no "the row already has a report_id" shortcut.
 *   3. Success check (OR across three tables — do NOT simplify to just
 *      bctc_layout_units, forward-compat with /extract-tables and
 *      /extract-md-tables if either is ever wired):
 *        (bctc_layout_units WHERE report_id=? AND quarantined=0 count > 0)
 *        OR (bctc_table_rows WHERE report_id=? count > 0)
 *        OR (bctc_md_tables WHERE report_id=? count > 0)
 *   4. Success            → status = 'done'.
 *      Attempts exhausted → status = 'enrich_failed' (genuinely terminal,
 *        fail-loud Telegram BUG — same sendTelegramBug mechanism the OLD
 *        synchronous 0-row gate used before FIX-BCTC-D3B removed it from
 *        bctcPdfPullJob.ts; this job is its sole successor).
 *      Under cap          → stays 'pek_triggered', reconcile_attempts++,
 *        uniform re-fire policy (see below).
 *
 * ── Emission circuit breaker (FIX-BCTC-RECONCILE-EMISSION-CIRCUIT-BREAKER) ──
 * The per-row fail-loud BUG above is emitted individually ONLY when this
 * run's exhausted-row count stays below RECONCILE_DORMANCY_ROW_THRESHOLD AND
 * the shared PEK producer (bctc_layout_units) is fresh. Once either signal
 * indicates systemic dormancy (many rows exhausting together, or the
 * producer hasn't written anything in RECONCILE_PRODUCER_STALE_DAYS), every
 * exhausted row this run is folded into ONE run-summary BUG instead — see
 * the constants + the post-loop "Circuit breaker" block below. The
 * enrich_failed status transition itself is NEVER gated by this — only the
 * notification shape changes.
 *
 * ── Re-fire-vs-passive decision (QA-flagged open point, resolved here) ──────
 * ADOPTED: uniform "always re-fire triggerPekExtractionForReport() on every
 * still-zero reconciliation pass" — bounded by the SAME MAX_RECONCILE_ATTEMPTS
 * cap as the terminal-failure bound (no separate re-fire budget).
 *
 * Why: bctcPdfPullJob.ts folds ALL FOUR /pek-extract outcomes (202 queued,
 * 503 market-hours, 502 pdf_extractor_error, 502 unreachable) into the same
 * 'pek_triggered' status — the DB column cannot distinguish "genuinely
 * in-flight" (202) from "never actually started" (503/502). A row whose
 * ONLY /pek-extract attempt got a 503 (VN market-hours guard fired before
 * PEK ever began work) or a 502 (pdf-extractor error/unreachable) can ONLY
 * ever reach a real result via an ACTIVE re-fire — a passive-only re-check
 * policy would leave that entire outcome class stuck at 'pek_triggered'
 * until MAX_RECONCILE_ATTEMPTS silently exhausts them into 'enrich_failed'
 * WITHOUT EVER HAVING ACTUALLY RETRIED, which is a second silent-failure
 * class layered on top of the one D3B/D3C exist to close.
 *
 * The alternative (distinguish 202-in-flight from 503/502-never-started and
 * only re-fire the latter) is not viable: `bctc_vps_queue` has no column
 * recording which of the 4 outcomes a given trigger call produced, and
 * adding one is out of scope for this task (the queue schema deliberately
 * folds them — see bctcPdfPullJob.ts step 6 comment).
 *
 * Cost of re-firing an already-in-flight 202 row unnecessarily: bounded and
 * acceptable. `pushBctcLayoutHandler.ts`'s DELETE-before-INSERT write pattern
 * makes repeat `/pek-extract` calls for the same report_id idempotent — a
 * wasted re-fire on a report PEK simply hasn't finished yet costs one extra
 * HTTP round-trip (30s deadline) and, worst case, briefly re-does layout-unit
 * extraction that would have landed anyway. This is strictly cheaper than the
 * alternative failure mode (503/502-class rows NEVER retried).
 *
 * Design: docs/handoffs/TASK_FIX-BCTC-PDFPULL-WIRE-TABLE-EXTRACTION.md §D3,
 * point 3 + the state-machine diagram immediately below it.
 *
 * All I/O (the PEK re-fire call, the BUG notification) is injectable so
 * tests run without real network calls. DB reads/writes use the job's own
 * `db` handle directly (opts.db ?? getDb()) — same convention as
 * bctcPdfPullJob.ts's step 4b.
 *
 * Runs every 30 min, offset 5 min from the pull cron (CRONS.bctcExtractReconcile,
 * default '5,35 * * * *') so PEK has async runway before the first check.
 *
 * Layer: interface/scheduler — imports from infrastructure (DB, logger,
 * PEK-trigger helper, Telegram notifier) only.
 *
 * @module scheduler/financial-reports/bctcExtractReconcileJob
 */

import type { Database } from "bun:sqlite";
import { getDb } from "../../infrastructure/db/schema.js";
import { logger } from "../../infrastructure/logger.js";
import type { PekTriggerOutcome } from "../../infrastructure/fetchers/pekExtractTrigger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maximum number of reconciliation passes a 'pek_triggered' row gets before
 * it is transitioned to the genuinely-terminal 'enrich_failed' state.
 *
 * Mirrors the MAX_404_ATTEMPTS pattern in bctcPdfPullJob.ts (named constant,
 * change here to apply to ALL rows, no ticker list) but is a SEPARATE
 * constant/column — this bounds reconciliation passes, not pre-download
 * fetch retries; the two attempt budgets are orthogonal.
 *
 * Value = 8: at the default 30-min cadence (CRONS.bctcExtractReconcile,
 * '5,35 * * * *') this is a ~4h budget. Per the render-seam brief's R-MED-1
 * estimate (~26s/page; a 46-page FPT-scale report ≈ 20 min end-to-end), the
 * design doc's own guidance is "size generously — e.g. ≥4 passes / ~2h" so
 * large reports are never falsely terminal-failed on their first few checks.
 * 8 passes / ~4h gives a 2x margin over that minimum recommendation.
 */
export const MAX_RECONCILE_ATTEMPTS = 8;

/** Default max items per run. */
const DEFAULT_BATCH_SIZE = 20;

/**
 * Systemic-dormancy circuit breaker — FIX-BCTC-RECONCILE-EMISSION-CIRCUIT-BREAKER.
 *
 * Without this breaker, a systemic outage (PEK/pdf-extractor pipeline down,
 * or the whole producer path dormant) manifests as EVERY exhausted row in a
 * batch firing its own fail-loud Telegram BUG — a 76+ report storm (~1 dup /
 * 30-min tick), each burning a full router→PO archive cycle (churn without
 * convergence). The breaker does NOT change the per-row data-integrity path
 * (updateEnrichFailed.run still commits for every exhausted row, every pass,
 * unconditionally) — it only changes how the notification is SHAPED once the
 * failure looks systemic rather than isolated:
 *   - >= this many rows exhausted in a single run, OR
 *   - the shared producer (bctc_layout_units, written by the PEK pipeline)
 *     hasn't landed ANY row in RECONCILE_PRODUCER_STALE_DAYS
 * → collapse the whole run's exhausted-row set into ONE run-summary BUG
 * instead of one-per-row. Below threshold with a healthy producer, today's
 * per-row fail-loud emission is unchanged (isolated one-offs stay isolated).
 */
export const RECONCILE_DORMANCY_ROW_THRESHOLD = parseInt(
  Bun.env["BCTC_RECONCILE_DORMANCY_ROW_THRESHOLD"] ?? "3",
  10,
);

/**
 * Producer-freshness staleness window (days). If the PEK pipeline hasn't
 * written a single bctc_layout_units row in this long, the whole extraction
 * producer is presumed dormant — treat ALL of this run's exhausted rows as
 * one systemic incident regardless of count.
 */
export const RECONCILE_PRODUCER_STALE_DAYS = parseInt(
  Bun.env["BCTC_RECONCILE_PRODUCER_STALE_DAYS"] ?? "2",
  10,
);

// ─────────────────────────────────────────────────────────────────────────────
// Concurrency guard
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Each row's success check issues up to 3 DB reads, and an under-cap row
 * issues one bounded (30s deadline) HTTP re-fire call. A full batch could in
 * principle still be mid-flight when the next 30-min tick fires (e.g. a
 * batch of pdf-extractor-unresponsive rows all hitting the fetch deadline).
 * Guard mirrors bctcPdfPullJob.ts's `_isRunning` module-level flag.
 */
let _isRunning = false;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface BctcExtractReconcileDeps {
  /**
   * Re-fire the async PEK table-extraction trigger for a still-zero report.
   * Production default (makeProductionDeps) delegates to the shared
   * triggerPekExtractionForReport() helper (infrastructure/fetchers/pekExtractTrigger.ts,
   * FIX-BCTC-D3A) — the SAME implementation bctcPdfPullJob.ts's initial
   * trigger and the manual /api/trigger-pek-extract MCP route both use.
   * Never throws (all failure modes are represented in its return union);
   * the call site here still wraps it in try/catch defensively.
   */
  triggerPekExtraction?: (
    reportId: string,
    pdfPath: string,
  ) => Promise<PekTriggerOutcome>;

  /**
   * Injectable BUG notification function, fired when a row exhausts
   * MAX_RECONCILE_ATTEMPTS while still at 0 rows across all three tables.
   * Defaults to sendTelegramBug (lazy import) in production — this is the
   * SAME fail-loud mechanism the OLD synchronous 0-row gate
   * (FIX-BCTC-ENRICH-SILENT-0ROWS, removed from bctcPdfPullJob.ts by
   * FIX-BCTC-D3B) used; this job is its sole successor.
   * Errors from sendBugFn are caught and logged — never block the fail-loud
   * status transition itself.
   */
  sendBugFn?: (msg: string) => Promise<void>;
}

/**
 * Real-implementation default for `triggerPekExtraction` — used both by
 * makeProductionDeps() and as the field-level fallback when a caller-supplied
 * partial `deps` object omits this field. One lazy-import wrapper, not
 * duplicated at both call sites.
 */
const defaultTriggerPekExtraction: (
  reportId: string,
  pdfPath: string,
) => Promise<PekTriggerOutcome> = async (reportId, pdfPath) => {
  const { triggerPekExtractionForReport } = await import(
    "../../infrastructure/fetchers/pekExtractTrigger.js"
  );
  return triggerPekExtractionForReport(reportId, pdfPath);
};

/**
 * Real-implementation default for `sendBugFn` — see defaultTriggerPekExtraction
 * doc comment above for the shared-reference rationale.
 */
const defaultSendBug: (msg: string) => Promise<void> = async (msg) => {
  const { sendTelegramBug } = await import(
    "../../infrastructure/notifiers/telegram.js"
  );
  await sendTelegramBug(msg);
};

export interface BctcExtractReconcileResult {
  /** Total 'pek_triggered' rows examined past the grace window this pass. */
  itemsProcessed: number;
  /** Rows confirmed to have landed real extraction data → 'done'. */
  done: number;
  /**
   * Rows that exhausted MAX_RECONCILE_ATTEMPTS while still at 0 rows across
   * all three tables → 'enrich_failed' (terminal, fail-loud BUG fired).
   */
  enrichFailed: number;
  /** Rows still under the attempt cap — stay 'pek_triggered' this pass. */
  stillPending: number;
  /**
   * Subset of `stillPending` where a PEK re-fire call was actually attempted
   * (report_id + pdf_path were resolvable). Rows whose financial_reports row
   * or pdf_path is not yet resolvable are counted in `stillPending` but NOT
   * here — nothing to call /pek-extract with yet.
   */
  refired: number;
  /**
   * Set to 'already_running' when this invocation early-returned because a
   * previous invocation was still in-flight. All counts above are 0 in that
   * case. Absent (undefined) on a normal run.
   */
  skippedReason?: "already_running";
}

// ─────────────────────────────────────────────────────────────────────────────
// Queue row type (internal)
// ─────────────────────────────────────────────────────────────────────────────

interface ReconcileQueueRow {
  id: number;
  action_code: string;
  period_year: number;
  period_quarter: string;
  reconcile_attempts: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Production deps factory
// ─────────────────────────────────────────────────────────────────────────────

/** Build production deps wired to real infrastructure. */
async function makeProductionDeps(): Promise<BctcExtractReconcileDeps> {
  return {
    triggerPekExtraction: defaultTriggerPekExtraction,
    sendBugFn: defaultSendBug,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Core logic
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run one pass of the BCTC extract reconcile job.
 *
 * @param opts.db        - SQLite database (defaults to singleton)
 * @param opts.batchSize - Max items per run (default 20)
 * @param opts.deps      - Injectable I/O deps (defaults to production)
 */
export async function runBctcExtractReconcileJob(opts: {
  db?: Database;
  batchSize?: number;
  deps?: BctcExtractReconcileDeps;
} = {}): Promise<BctcExtractReconcileResult> {
  if (_isRunning) {
    logger.warn("[bctcExtractReconcile] already running — skipping concurrent fire");
    return {
      itemsProcessed: 0,
      done: 0,
      enrichFailed: 0,
      stillPending: 0,
      refired: 0,
      skippedReason: "already_running",
    };
  }
  _isRunning = true;

  try {
    const db = opts.db ?? getDb();
    const batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE;
    const deps = opts.deps ?? (await makeProductionDeps());

    const result: BctcExtractReconcileResult = {
      itemsProcessed: 0,
      done: 0,
      enrichFailed: 0,
      stillPending: 0,
      refired: 0,
    };

    // ── 1. Query pek_triggered rows past the grace window ────────────────────
    let rows: ReconcileQueueRow[];
    try {
      rows = db
        .query<ReconcileQueueRow, [number]>(
          `SELECT id, action_code, period_year, period_quarter, reconcile_attempts
           FROM bctc_vps_queue
           WHERE status = 'pek_triggered'
             AND last_attempt < datetime('now', '-5 minutes')
           ORDER BY last_attempt ASC
           LIMIT ?`,
        )
        .all(batchSize);
    } catch (err) {
      logger.warn("[bctcExtractReconcile] DB query failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      return result;
    }

    if (rows.length === 0) {
      return result;
    }

    const updateDone = db.prepare<void, [number]>(
      `UPDATE bctc_vps_queue SET status = 'done', last_attempt = datetime('now') WHERE id = ?`,
    );
    const updateEnrichFailed = db.prepare<void, [number]>(
      `UPDATE bctc_vps_queue SET status = 'enrich_failed', reconcile_attempts = reconcile_attempts + 1, last_attempt = datetime('now') WHERE id = ?`,
    );
    const updateStillPending = db.prepare<void, [number]>(
      `UPDATE bctc_vps_queue SET reconcile_attempts = reconcile_attempts + 1, last_attempt = datetime('now') WHERE id = ?`,
    );

    // ── Circuit-breaker accumulator — FIX-BCTC-RECONCILE-EMISSION-CIRCUIT-
    //    BREAKER. Exhausted rows are NOT bugged inline anymore; collected
    //    here so the post-loop breaker decision (see below the loop) can see
    //    the WHOLE run's incidence count before choosing per-row vs.
    //    one-summary emission shape. ─────────────────────────────────────────
    const exhaustedRows: Array<{
      ticker: string;
      sortKey: string;
      reportId: string | undefined;
      attempts: number;
      bugMsg: string;
    }> = [];

    // ── 2. Reconcile each row ─────────────────────────────────────────────────
    for (const row of rows) {
      result.itemsProcessed++;

      const quarter = row.period_quarter.startsWith("Q")
        ? row.period_quarter
        : `Q${row.period_quarter}`;
      const sortKey = `${row.period_year}-${quarter}`;

      // ── Re-derive report_id via (action_code, sort_key) — the queue row
      //    does NOT carry its own report_id column; this lookup is the ONLY
      //    way to resolve it, not a defensive fallback. ────────────────────
      let reportRow: { id: string; pdf_path: string | null } | undefined;
      try {
        reportRow =
          db
            .query<{ id: string; pdf_path: string | null }, [string, string]>(
              `SELECT id, pdf_path FROM financial_reports WHERE action_code = ? AND sort_key = ?`,
            )
            .get(row.action_code, sortKey) ?? undefined;
      } catch (err) {
        logger.warn("[bctcExtractReconcile] financial_reports lookup failed", {
          ticker: row.action_code,
          sortKey,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // ── Success check — OR across three tables (explicit per design doc,
      //    do NOT simplify to just bctc_layout_units). No report_id resolved
      //    yet ⇒ trivially 0/0/0 ⇒ success = false. ─────────────────────────
      let success = false;
      if (reportRow) {
        try {
          const layoutCnt =
            db
              .query<{ cnt: number }, [string]>(
                `SELECT COUNT(*) AS cnt FROM bctc_layout_units WHERE report_id = ? AND quarantined = 0`,
              )
              .get(reportRow.id)?.cnt ?? 0;
          const tableRowCnt =
            db
              .query<{ cnt: number }, [string]>(
                `SELECT COUNT(*) AS cnt FROM bctc_table_rows WHERE report_id = ?`,
              )
              .get(reportRow.id)?.cnt ?? 0;
          const mdTableCnt =
            db
              .query<{ cnt: number }, [string]>(
                `SELECT COUNT(*) AS cnt FROM bctc_md_tables WHERE report_id = ?`,
              )
              .get(reportRow.id)?.cnt ?? 0;
          success = layoutCnt > 0 || tableRowCnt > 0 || mdTableCnt > 0;
        } catch (err) {
          logger.warn("[bctcExtractReconcile] success-check query failed", {
            ticker: row.action_code,
            sortKey,
            reportId: reportRow.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // ── Success → done ────────────────────────────────────────────────────
      if (success) {
        updateDone.run(row.id);
        result.done++;
        logger.info("[bctcExtractReconcile] reconciled to done", {
          ticker: row.action_code,
          sortKey,
          reportId: reportRow?.id,
        });
        continue;
      }

      const nextAttempt = row.reconcile_attempts + 1;

      // ── Attempts exhausted → enrich_failed (terminal). Status transition
      //    commits unconditionally, every pass, for every exhausted row — the
      //    circuit breaker below only changes how the NOTIFICATION is
      //    shaped, it never touches this write. ───────────────────────────────
      if (nextAttempt >= MAX_RECONCILE_ATTEMPTS) {
        updateEnrichFailed.run(row.id);
        result.enrichFailed++;

        const bugMsg =
          `[bctcExtractReconcile] RECONCILE EXHAUSTED: ${row.action_code} ${sortKey} — ` +
          `0 rows across bctc_layout_units/bctc_table_rows/bctc_md_tables after ` +
          `${nextAttempt} reconciliation passes (cap ${MAX_RECONCILE_ATTEMPTS}). ` +
          `Queue row marked enrich_failed (terminal). ` +
          `report_id: ${reportRow?.id ?? "UNRESOLVED (no financial_reports row for this action_code/sort_key)"}. ` +
          `Action: inspect pdf-extractor logs for this report; consider manual ` +
          `/api/trigger-pek-extract re-fire once the root cause is fixed.`;

        logger.error("[bctcExtractReconcile] RECONCILE EXHAUSTED — FAIL LOUD", {
          ticker: row.action_code,
          sortKey,
          reportId: reportRow?.id,
          attempts: nextAttempt,
          cap: MAX_RECONCILE_ATTEMPTS,
        });

        // Emission deferred to the post-loop circuit-breaker decision (see
        // "Circuit breaker" block below the loop) — collecting here rather
        // than sending here is what lets the breaker see the WHOLE run's
        // incidence count before choosing per-row vs. run-summary shape.
        exhaustedRows.push({
          ticker: row.action_code,
          sortKey,
          reportId: reportRow?.id,
          attempts: nextAttempt,
          bugMsg,
        });
        continue;
      }

      // ── Under cap → stays pek_triggered, uniform re-fire policy ────────────
      // See the module doc comment's "Re-fire-vs-passive decision" section for
      // the full rationale: ALWAYS re-fire when report_id + pdf_path are
      // resolvable (idempotent DELETE-before-INSERT on the PEK side makes a
      // wasted re-fire on an already-in-flight 202 row cheap; the 503/502
      // outcome class has NO other path to eventual convergence).
      updateStillPending.run(row.id);
      result.stillPending++;

      if (reportRow?.pdf_path) {
        try {
          const outcome = await (deps.triggerPekExtraction ?? defaultTriggerPekExtraction)(
            reportRow.id,
            reportRow.pdf_path,
          );
          result.refired++;
          logger.info("[bctcExtractReconcile] re-fired PEK extraction", {
            ticker: row.action_code,
            sortKey,
            reportId: reportRow.id,
            attempt: nextAttempt,
            outcome: outcome.outcome,
          });
        } catch (err) {
          // triggerPekExtractionForReport() never throws — defensive catch only.
          logger.warn("[bctcExtractReconcile] re-fire threw unexpectedly (non-fatal)", {
            ticker: row.action_code,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      } else {
        // report_id/pdf_path not yet resolvable (shell row upsert may still be
        // in-flight, or genuinely failed on the pull side) — nothing to call
        // /pek-extract with this pass. Attempt counter still incremented above
        // so this row still terminal-fails eventually rather than stalling
        // forever on an unresolvable report.
        logger.warn("[bctcExtractReconcile] skipping re-fire — report_id/pdf_path not resolved", {
          ticker: row.action_code,
          sortKey,
          attempt: nextAttempt,
        });
      }
    }

    // ── Circuit breaker — collapse systemic dormancy into ONE run-summary
    //    BUG instead of one-per-row (FIX-BCTC-RECONCILE-EMISSION-CIRCUIT-
    //    BREAKER). Tripped by EITHER signal:
    //      (a) row-count — this run alone exhausted >=
    //          RECONCILE_DORMANCY_ROW_THRESHOLD rows.
    //      (b) freshness — the shared PEK producer (bctc_layout_units)
    //          hasn't landed ANY row in RECONCILE_PRODUCER_STALE_DAYS —
    //          presumed dormant, so every exhausted row this run shares one
    //          root cause regardless of how many there are.
    //    Below threshold with a healthy producer, behavior is UNCHANGED:
    //    each exhausted row still fires its own fail-loud BUG (genuine
    //    isolated one-offs must not be muted). ────────────────────────────────
    if (exhaustedRows.length > 0) {
      let producerStale = false;
      try {
        const freshnessRow = db
          .query<{ isStale: number }, [number]>(
            `SELECT (MAX(extracted_at) IS NOT NULL
                     AND MAX(extracted_at) < datetime('now', '-' || ? || ' days')) AS isStale
             FROM bctc_layout_units`,
          )
          .get(RECONCILE_PRODUCER_STALE_DAYS);
        producerStale = !!freshnessRow?.isStale;
      } catch (err) {
        logger.warn("[bctcExtractReconcile] producer-freshness check failed (treated as not-stale)", {
          error: err instanceof Error ? err.message : String(err),
        });
      }

      const countTripped = exhaustedRows.length >= RECONCILE_DORMANCY_ROW_THRESHOLD;
      const breakerTripped = countTripped || producerStale;
      const effectiveSendBug = deps.sendBugFn ?? defaultSendBug;

      if (breakerTripped) {
        const signals: string[] = [];
        if (countTripped) {
          signals.push(
            `${exhaustedRows.length} rows exhausted this run >= threshold ${RECONCILE_DORMANCY_ROW_THRESHOLD}`,
          );
        }
        if (producerStale) {
          signals.push(
            `producer dormant — MAX(bctc_layout_units.extracted_at) older than ${RECONCILE_PRODUCER_STALE_DAYS}d (no fresh PEK output)`,
          );
        }

        const summaryMsg =
          `[bctcExtractReconcile] RECONCILE CIRCUIT BREAKER TRIPPED — run-summary ` +
          `(per-row BUGs suppressed, systemic dormancy detected): ` +
          `${exhaustedRows.length} row(s) exhausted to enrich_failed this run — ` +
          `${exhaustedRows.map((r) => `${r.ticker} ${r.sortKey}`).join(", ")}. ` +
          `Shared symptom: 0 rows across bctc_layout_units/bctc_table_rows/bctc_md_tables ` +
          `after cap ${MAX_RECONCILE_ATTEMPTS} reconciliation passes (each row; all queue rows ` +
          `independently marked enrich_failed — this notification change does not affect that write). ` +
          `Dormancy signal(s): ${signals.join(" AND ")}. ` +
          `Action: investigate the shared pdf-extractor/PEK pipeline — this is a systemic ` +
          `incident, do NOT triage these rows one-by-one.`;

        try {
          await effectiveSendBug(summaryMsg);
        } catch (notifyErr) {
          logger.warn("[bctcExtractReconcile] run-summary sendBugFn threw (non-fatal)", {
            error: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
          });
        }
      } else {
        for (const r of exhaustedRows) {
          try {
            await effectiveSendBug(r.bugMsg);
          } catch (notifyErr) {
            // Bug notification errors must NEVER block the fail-loud status
            // transition — updateEnrichFailed.run() already committed per-row above.
            logger.warn("[bctcExtractReconcile] sendBugFn threw (non-fatal to fail-loud)", {
              ticker: r.ticker,
              error: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
            });
          }
        }
      }
    }

    logger.info("[bctcExtractReconcile] cycle complete", {
      itemsProcessed: result.itemsProcessed,
      done: result.done,
      enrichFailed: result.enrichFailed,
      stillPending: result.stillPending,
      refired: result.refired,
    });

    return result;
  } finally {
    _isRunning = false;
  }
}
