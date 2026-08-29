/**
 * BCTC Queue Enricher Job — Task 1287 (Scheduler Layer)
 *
 * Background scheduler job for BCTC VPS queue processing.
 *
 * History:
 * - Task 1288c (2026-04-22): Disabled SSC enrichment (geo-blocked, recurring timeouts).
 * - Task 1343c (2026-04-27): Replaced old SSC approach with multi-source discovery
 *   via discoverHosePdfUrls() (SSC iboard → cafef.vn → vietstock.vn).
 *   All HTTP calls are injectable for testability. Geo-blocking avoided by
 *   using the iboard JSON API (not the legacy Oracle ADF SPA).
 * - fix/bctc-url-enrichment (2026-04-27): Extended WHERE clause to also capture
 *   items with source_url = 'MISSING' or source_url LIKE '/test-%' (placeholder
 *   values left in DB by earlier bad runs). Added SSC_IBOARD_BASE_URL env comment.
 * - FIX-BCTC-ZERO-URL-ALERT (2026-06-16): Added consecutive-zero-URL cycle counter
 *   persisted in bctc_health_state (SQLite). Fires a BUG Telegram alert when
 *   counter >= 2 during an active earnings window, deduped to <=1 alert / 6h.
 * - FIX-BCTC-ENRICHER-STUCK-BACKLOG (2026-07-02): incrementAttemptsStmt and
 *   markUrlNotFoundStmt now also set last_attempt = datetime('now') (previously
 *   only the orphan-resync statement did this), so rows they terminalize can
 *   actually satisfy Arm 2's grace-period predicate instead of being permanently
 *   excluded. Arm 2 also extended to select 'enrich_failed' rows (same
 *   grace-period + attempts<6 bound), which were previously invisible to both
 *   arms. 2nd occurrence of this bug class (1st: reset-ppc-q4-2025.ts one-row
 *   hand patch) — this is the root fix. See
 *   docs/vps-sources/bctc-discover-stale-15d/enricher-liveness.md.
 *
 * Design:
 * - Dequeues max 20 items with source_url = NULL or a placeholder value per run.
 * - Calls discoverHosePdfUrls() for each item.
 * - On success: writes source_url to DB so VPS can fetch.
 * - On failure / empty: leaves item pending (VPS will retry later).
 * - Idempotent and resilient. No circuit-breaker dependency.
 * - Set SSC_IBOARD_BASE_URL env var to route iboard API calls through a VPS proxy
 *   when running from a geo-blocked region (iboard-query.ssc.vn is NXDOMAIN outside VN).
 *
 * @module scheduler/financial-reports/bctcQueueEnricherJob
 */

import type { Database } from "bun:sqlite";
import { getDb } from "../../infrastructure/db/schema.js";
import { logger } from "../../infrastructure/logger.js";
import {
  discoverHosePdfUrls,
  type DiscoverOptions,
} from "../../domain/services/bctcDiscovery.js";
import { bctcHttpFetch } from "../../infrastructure/fetchers/bctcHttpFetcher.js";
import { fetchHsxBctcUrls } from "../../infrastructure/fetchers/hsxBctcFetcher.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_BATCH_SIZE = 20;

/** Per-ticker discovery timeout (ms). Conservative to avoid stalling the cron. */
const DISCOVERY_TIMEOUT_MS = 5_000;

/**
 * Maximum number of enrichment attempts before a no-URL row is marked
 * 'url_not_found'. This prevents rows with perpetually-empty discovery results
 * from blocking the queue indefinitely (Task 1782).
 *
 * At 15-min cron intervals, 5 attempts = ~75 min before a row is parked.
 */
const MAX_ENRICH_ATTEMPTS = 5;

/**
 * VPS bctc-files endpoint base URL — same value as in bctcPdfPullJob.
 * Declared here to build the orphan-detection LIKE filter without importing
 * from a sibling scheduler file (avoids circular dep risk).
 */
const VPS_BCTC_ENRICH_BASE_URL = "http://125.212.251.27:8765/bctc-files/";

/**
 * FIX-BCTC-VPS-QUEUE-SYNC G2: VPS placeholder URL LIKE suffix pattern.
 *
 * Real VPS cache filenames start with a date prefix (YYYYMMDD-...), e.g.:
 *   http://125.212.251.27:8765/bctc-files/VNM/20260130-VNM-...pdf
 *
 * Placeholder filenames (auto-generated at seed time, never actually cached)
 * follow the pattern <TICKER>_<YEAR>_Q<N>.pdf — NO date prefix:
 *   http://125.212.251.27:8765/bctc-files/VNM/VNM_2026_Q1.pdf
 *
 * The programmatic distinguisher: real cached URLs contain `/20` in the
 * filename segment (date prefix starts with `20`), placeholders do not.
 * We select rows WHERE source_url LIKE VPS_BASE% AND source_url NOT LIKE
 * `%/20%` — computed from row data, never a hardcoded ticker list.
 *
 * These orphan rows should have source_url reset to NULL so the enricher
 * can re-discover the real cached PDF URL via discoverHosePdfUrls().
 * If re-discovery still returns no URL, the normal MAX_ENRICH_ATTEMPTS
 * gate will eventually mark them url_not_found — honest terminal state.
 */
const VPS_PLACEHOLDER_NOT_LIKE = "%/20%";

// ─────────────────────────────────────────────────────────────────────────────
// FIX-BCTC-ZERO-URL-ALERT constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Number of consecutive zero-URL cycles required before firing a BUG alert.
 * Must be >= 2 (single cycle with 0 URLs may be a transient miss during
 * non-earnings season when the queue is partially populated).
 */
const ZERO_URL_ALERT_THRESHOLD = 2;

/**
 * Minimum gap between consecutive BUG alerts for this condition (ms).
 * 6 hours: the VPS cron runs every 6h, so at most one alert per VPS cycle.
 */
const ZERO_URL_ALERT_DEDUP_MS = 6 * 60 * 60_000;

/**
 * bctc_health_state row key for the consecutive-zero counter.
 * text_value stores last_alerted_at (ISO string) for the 6h dedup guard.
 */
const BHS_KEY_ZERO_COUNTER = "zero_url_consecutive_cycles";

// ─────────────────────────────────────────────────────────────────────────────
// FIX-BCTC-ZERO-URL-ALERT helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ensure the bctc_health_state table exists (idempotent — tolerates
 * older DBs that pre-date the FIX-BCTC-ZERO-URL-ALERT migration).
 */
function ensureBctcHealthStateTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS bctc_health_state (
      key         TEXT PRIMARY KEY,
      int_value   INTEGER NOT NULL DEFAULT 0,
      text_value  TEXT,
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

/**
 * Read the current consecutive-zero counter and last_alerted_at from DB.
 * Returns { count: 0, lastAlertedAt: null } when the row is absent.
 */
function readZeroCounter(db: Database): { count: number; lastAlertedAt: string | null } {
  try {
    ensureBctcHealthStateTable(db);
    const row = db
      .query<{ int_value: number; text_value: string | null }, [string]>(
        `SELECT int_value, text_value FROM bctc_health_state WHERE key = ?`,
      )
      .get(BHS_KEY_ZERO_COUNTER);
    if (!row) return { count: 0, lastAlertedAt: null };
    return { count: row.int_value, lastAlertedAt: row.text_value };
  } catch {
    return { count: 0, lastAlertedAt: null };
  }
}

/**
 * Upsert the zero counter row.  lastAlertedAt = null leaves text_value unchanged.
 */
function writeZeroCounter(
  db: Database,
  count: number,
  lastAlertedAt?: string | null,
): void {
  try {
    ensureBctcHealthStateTable(db);
    if (lastAlertedAt !== undefined) {
      db.exec(
        `INSERT INTO bctc_health_state (key, int_value, text_value, updated_at)
         VALUES ('${BHS_KEY_ZERO_COUNTER}', ${count}, ${lastAlertedAt === null ? "NULL" : `'${lastAlertedAt}'`}, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET
           int_value  = excluded.int_value,
           text_value = excluded.text_value,
           updated_at = excluded.updated_at`,
      );
    } else {
      db.exec(
        `INSERT INTO bctc_health_state (key, int_value, updated_at)
         VALUES ('${BHS_KEY_ZERO_COUNTER}', ${count}, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET
           int_value  = excluded.int_value,
           updated_at = excluded.updated_at`,
      );
    }
  } catch (err) {
    logger.warn("[bctcQueueEnricher] writeZeroCounter failed (non-fatal)", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Returns true when there is at least one active queue row (pending,
 * url_not_found, or pek_triggered) — i.e. we are inside an active earnings
 * window. Generic: keyed on row status only, no ticker/exchange filter.
 *
 * FIX-BCTC-D3B-GATE-PEK-TRIGGERED-STATUS: 'pek_triggered' added — a row
 * awaiting async PEK table-extraction reconciliation (bctcExtractReconcileJob,
 * not yet landed) is genuinely in-progress work, not idle/stalled/orphaned.
 */
function isEarningsWindowActive(db: Database): boolean {
  try {
    const row = db
      .query<{ cnt: number }, []>(
        `SELECT COUNT(*) AS cnt FROM bctc_vps_queue
         WHERE status IN ('pending', 'url_not_found', 'pek_triggered')`,
      )
      .get();
    return (row?.cnt ?? 0) > 0;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface BctcQueueEnricherRunResult {
  itemsProcessed: number;
  urlsPopulated: number;
  timeoutFailures: number;
  partialFailures: number;
  /**
   * FIX-BCTC-VPS-QUEUE-SYNC G2: number of orphaned-URL rows (VPS placeholder
   * source_url that was never actually cached) whose source_url was reset to
   * NULL so re-discovery can proceed. These rows came from the orphan-re-sync
   * arm and are NOT counted in itemsProcessed (discovery is deferred to the
   * next enricher cycle after the reset).
   */
  orphansResynced: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Job
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run a single pass of the BCTC queue enricher job.
 *
 * For each pending queue item without a source_url, calls discoverHosePdfUrls()
 * and writes the first discovered PDF URL back to `bctc_vps_queue.source_url`.
 *
 * @param opts - Configuration and dependency injection
 * @returns Result object with counts
 */
export async function runBctcQueueEnricherJob(opts: {
  db?: Database;
  batchSize?: number;
  /** Injectable fetch overrides — used in tests to avoid real HTTP calls. */
  discoverOptions?: DiscoverOptions;
  /**
   * FIX-BCTC-ZERO-URL-ALERT: injectable BUG sender.
   * Defaults to sendTelegramBug (lazy import) in production.
   * Inject a no-op or capture function in tests.
   */
  sendBugFn?: (msg: string) => Promise<unknown>;
} = {}): Promise<BctcQueueEnricherRunResult> {
  const db = opts.db ?? getDb();
  const batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE;

  const result: BctcQueueEnricherRunResult = {
    itemsProcessed: 0,
    urlsPopulated: 0,
    timeoutFailures: 0,
    partialFailures: 0,
    orphansResynced: 0,
  };

  // ── Query items awaiting enrichment ──────────────────────────────────────
  //
  // Selects rows that need a discovery pass:
  //
  // Arm 1 — Normal pending items (source_url missing or placeholder):
  //   - source_url IS NULL (never populated)
  //   - 'MISSING' (placeholder written by earlier bad runs)
  //   - '/test-...' (placeholder written by test-seeding scripts)
  //   - 'https://congbothongtin.ssc.gov.vn/test...' (stub seeded before VPS
  //     resolves real URLs — FIX 1405b)
  //   - status = 'pending'
  //
  // Arm 2 — TASK-1943a: Grace-period auto-retry for url_not_found rows.
  // FIX-BCTC-ENRICHER-STUCK-BACKLOG (2026-07-02): also covers 'enrich_failed'
  // rows under the identical bound — that status was previously invisible to
  // BOTH arms (a design gap, not a timing issue). Same grace-period + attempts
  // cap applies to both terminal statuses; no unbounded retry is introduced.
  //   - status IN ('url_not_found', 'enrich_failed') (exhausted MAX_ENRICH_ATTEMPTS
  //     previously, or failed PDF parse/enrichment downstream)
  //   - last_attempt IS NOT NULL AND last_attempt < datetime('now', '-7 days')
  //     (grace period expired — SSC may have published late filings)
  //   - attempts <= MAX_ENRICH_ATTEMPTS + 1 (FIX-BCTC-DATA-GAP-FAMILY U1: the
  //     old `attempts < 6` bound excluded the attempts=6 rows THIS job itself
  //     terminalizes — markUrlNotFoundStmt sets attempts=attempts+1 when
  //     item.attempts >= MAX_ENRICH_ATTEMPTS(5), so every url_not_found row
  //     landed at attempts=6 and was permanently excluded from the 7-day-grace
  //     re-discovery the FIX-BCTC-ENRICHER-STUCK-BACKLOG comment below intends
  //     ("after 7 days one more discovery pass"). Live: 26 url_not_found rows
  //     parked at attempts 6-7. A row at attempts=6 is now re-eligible; the
  //     last_attempt < -7 days gate still prevents unbounded churn.)
  //
  // Effect: rows permanently parked at url_not_found/enrich_failed after 7+
  // days get one more discovery pass. If still no URL → re-marked
  // url_not_found (expected). This prevents permanent calendar blindspots
  // when SSC is slow to publish, and closes the previous structural gap where
  // rows terminalized by incrementAttemptsStmt/markUrlNotFoundStmt never had
  // last_attempt set (see below) and so could NEVER satisfy this arm's
  // `last_attempt IS NOT NULL` predicate — a permanent false-terminal.
  //
  // FIX-BCTC-D3B-GATE-PEK-TRIGGERED-STATUS: 'pek_triggered' is deliberately
  // NOT added to this arm's status list. Unlike url_not_found/enrich_failed
  // (genuinely-terminal/stuck states eligible for a fresh discovery pass),
  // a pek_triggered row already has a real (non-placeholder) source_url and a
  // valid pdf_path/report_id — resetting it to source_url=NULL/status='pending'
  // here would corrupt in-flight PEK work, not repair a stuck row. Reconciling
  // pek_triggered → done/enrich_failed based on actual bctc_layout_units row
  // counts is bctcExtractReconcileJob.ts's job (FIX-BCTC-D3C-RECONCILE-JOB,
  // not yet landed) — this arm must stay hands-off until that job lands.
  //
  // FIX-CTG-1 (2026-06-03): include period_year and period_quarter in SELECT so
  // each row is enriched with its OWN quarter's PDF URL, not the current year/Q4 default.
  // Previously the SELECT discarded these fields → discoverHosePdfUrls defaulted to
  // year=currentYear, quarter="Q4" → Q3/Q2 rows were corrupted with a Q1-2026 URL.
  let queueItems: Array<{ id: number; action_code: string; attempts: number; period_year: number; period_quarter: string }> = [];

  // FIX-BCTC-ENRICHER-STUCK-BACKLOG (2026-07-02): tracks whether this DB's
  // bctc_vps_queue table has the last_attempt column. Some older/simplified
  // test-fixture schemas omit it (see the ARM1_ONLY_SQL fallback below) — the
  // UPDATE statements further down must degrade the same way the SELECT does,
  // or they throw "no such column: last_attempt" on those schemas.
  let lastAttemptColumnAvailable = true;

  // Primary query includes both Arm 1 (normal pending) and Arm 2 (grace-period retry).
  // Falls back to Arm 1 only if last_attempt column is absent (e.g. older schema).
  const ARM1_ONLY_SQL = `
    SELECT id, action_code, period_year, period_quarter, attempts
    FROM bctc_vps_queue
    WHERE (
      source_url IS NULL
      OR source_url = 'MISSING'
      OR source_url LIKE '/test-%'
      OR source_url LIKE 'https://congbothongtin.ssc.gov.vn/test%'
    )
    AND status = 'pending'
    ORDER BY created_at ASC
    LIMIT ?`;

  const COMBINED_SQL = `
    SELECT id, action_code, period_year, period_quarter, attempts
    FROM bctc_vps_queue
    WHERE (
      (
        (
          source_url IS NULL
          OR source_url = 'MISSING'
          OR source_url LIKE '/test-%'
          OR source_url LIKE 'https://congbothongtin.ssc.gov.vn/test%'
        )
        AND status = 'pending'
      )
      OR (
        status IN ('url_not_found', 'enrich_failed')
        AND last_attempt IS NOT NULL
        AND last_attempt < datetime('now', '-7 days')
        AND attempts <= ${MAX_ENRICH_ATTEMPTS + 1}
      )
    )
    ORDER BY created_at ASC
    LIMIT ?`;

  try {
    queueItems = db
      .query<{ id: number; action_code: string; attempts: number; period_year: number; period_quarter: string }, [number]>(
        COMBINED_SQL,
      )
      .all(batchSize);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("no such column: last_attempt")) {
      // Older schema without last_attempt column — fall back to Arm 1 only.
      // This handles test DBs with simplified schemas and pre-migration DBs.
      logger.debug("[bctcQueueEnricher] last_attempt column absent — grace-period arm disabled");
      lastAttemptColumnAvailable = false;
      try {
        queueItems = db
          .query<{ id: number; action_code: string; attempts: number; period_year: number; period_quarter: string }, [number]>(
            ARM1_ONLY_SQL,
          )
          .all(batchSize);
      } catch (fallbackErr) {
        logger.warn("[bctcQueueEnricher] Query failed", {
          error: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr),
        });
        return result;
      }
    } else {
      logger.warn("[bctcQueueEnricher] Query failed", {
        error: msg,
      });
      return result;
    }
  }

  // ── FIX-BCTC-VPS-QUEUE-SYNC G2: Orphan re-sync arm ─────────────────────────
  //
  // Detects local queue rows with a VPS placeholder source_url that was never
  // actually cached on the VPS (programmatic set-difference: local VPS URLs
  // whose filename segment does NOT contain the date-prefix that real cached
  // files always have). Resets source_url to NULL so Arm 1 picks them up on
  // the NEXT enricher cycle for fresh discovery.
  //
  // Detection is GENERIC — computed from row data (URL pattern), never a
  // hardcoded ticker or date list. The rule:
  //   VPS URL: source_url LIKE '<VPS_BASE>%'
  //   Placeholder (NOT a real cache file): source_url NOT LIKE '%/20%'
  //     (real VPS cache filenames start with a date, e.g. "20260130-VNM-...")
  //
  // Also re-syncs 'deferred_infra' rows that have a VPS placeholder URL
  // (transitioned there by bctcPdfPullJob's G1 cap). Reset source_url=NULL
  // and status='pending' so the enricher can discover the real URL.
  //
  // Includes only pending + deferred_infra rows (done / url_not_found stay).
  // Runs before the main query early-return so orphans get cleared even when
  // queueItems (the Arm 1+2 result) is empty.
  {
    const ORPHAN_SQL = `
      SELECT id, action_code, period_year, period_quarter, source_url
      FROM bctc_vps_queue
      WHERE status IN ('pending', 'deferred_infra')
        AND source_url LIKE ?
        AND source_url NOT LIKE ?
      LIMIT 50`;

    type OrphanRow = { id: number; action_code: string; period_year: number; period_quarter: string; source_url: string };

    let orphanRows: OrphanRow[] = [];
    try {
      orphanRows = db
        .query<OrphanRow, [string, string]>(ORPHAN_SQL)
        .all(`${VPS_BCTC_ENRICH_BASE_URL}%`, VPS_PLACEHOLDER_NOT_LIKE);
    } catch (orphanErr) {
      // Non-fatal — orphan arm is best-effort; log and continue to main arm.
      logger.debug("[bctcQueueEnricher] orphan-re-sync query failed (non-fatal)", {
        error: orphanErr instanceof Error ? orphanErr.message : String(orphanErr),
      });
      orphanRows = [];
    }

    if (orphanRows.length > 0) {
      const resetOrphanStmt = db.prepare<void, [number]>(
        `UPDATE bctc_vps_queue SET source_url = NULL, status = 'pending', attempts = 0, last_attempt = datetime('now') WHERE id = ?`,
      );
      for (const orphan of orphanRows) {
        resetOrphanStmt.run(orphan.id);
        result.orphansResynced++;
        logger.info("[bctcQueueEnricher] orphan VPS placeholder URL reset for re-discovery", {
          ticker: orphan.action_code,
          year: orphan.period_year,
          quarter: orphan.period_quarter,
          stale_url: orphan.source_url,
        });
      }
      logger.info("[bctcQueueEnricher] orphan-re-sync arm complete", {
        orphansResynced: result.orphansResynced,
      });
    }
  }

  // ── FIX-BCTC-DATA-GAP-FAMILY U1: deferred_infra NULL-URL arm ───────────────
  //
  // Rows parked at status='deferred_infra' by bctcPdfPullJob's
  // MAX_404_ATTEMPTS cap with source_url=NULL are structurally unreachable by
  // EVERY existing arm: Arm-1 requires status='pending', Arm-2 requires
  // status IN ('url_not_found','enrich_failed'), and the orphan-re-sync arm
  // above requires source_url LIKE '<VPS_BASE>%'. Live 2026-08-28: 293 of 328
  // deferred_infra rows have NULL source_url — a permanent dead-end for the
  // BID/FRT/KDH/EIB/SHB/GVR/GEX/VJC extraction-failure class.
  //
  // Recycle them past the SAME 7-day grace bound as Arm-2: reset to
  // status='pending' (source_url already NULL) so Arm-1 re-discovers on the
  // next cycle. `attempts` is reset to 0 on recycle (mirrors the
  // FIX-BCTC-D3C-FOLLOW-UP-RESET-ATTEMPTS pattern). `last_attempt IS NULL` is
  // accepted (a row never attempted is trivially past any grace).
  {
    const DEFERRED_NULL_URL_SQL = `
      SELECT id, action_code, period_year, period_quarter
      FROM bctc_vps_queue
      WHERE status = 'deferred_infra'
        AND source_url IS NULL
        AND (last_attempt IS NULL OR last_attempt < datetime('now', '-7 days'))
      LIMIT 50`;

    let deferredNullRows: Array<{ id: number; action_code: string; period_year: number; period_quarter: string }> = [];
    try {
      deferredNullRows = db
        .query<{ id: number; action_code: string; period_year: number; period_quarter: string }, []>(
          DEFERRED_NULL_URL_SQL,
        )
        .all();
    } catch (deferredErr) {
      // Non-fatal — arm is best-effort; log and continue to the main arms.
      logger.debug("[bctcQueueEnricher] deferred_infra NULL-URL arm query failed (non-fatal)", {
        error: deferredErr instanceof Error ? deferredErr.message : String(deferredErr),
      });
      deferredNullRows = [];
    }

    if (deferredNullRows.length > 0) {
      const resetDeferredStmt = db.prepare<void, [number]>(
        `UPDATE bctc_vps_queue SET status = 'pending', attempts = 0, last_attempt = datetime('now') WHERE id = ?`,
      );
      for (const row of deferredNullRows) {
        resetDeferredStmt.run(row.id);
        result.orphansResynced++;
        logger.info("[bctcQueueEnricher] deferred_infra NULL-URL row recycled for re-discovery", {
          ticker: row.action_code,
          year: row.period_year,
          quarter: row.period_quarter,
        });
      }
      logger.info("[bctcQueueEnricher] deferred_infra NULL-URL arm complete", {
        recycled: deferredNullRows.length,
      });
    }
  }

  if (queueItems.length === 0) {
    return result;
  }

  // ── Prepare update statements ─────────────────────────────────────────────
  // TASK-1943a: also reset status to 'pending' so grace-period url_not_found
  // rows (selected via Arm 2 query) are re-queued for the PDF pull job when
  // a source_url is found. For normal pending rows this is a no-op (already pending).
  //
  // FIX-BCTC-D3C-FOLLOW-UP-RESET-ATTEMPTS (2026-07-29): also reset attempts = 0.
  // A row recycled here (Arm 2, from url_not_found/enrich_failed) previously
  // carried its old attempts counter forward into the new pending/pek_triggered
  // cycle, letting it re-exhaust the discovery-attempts budget prematurely on a
  // fresh grace-period retry. No-op for Arm 1 rows (already attempts=0/pending).
  const updateStmt = db.prepare<void, [string, number]>(
    `UPDATE bctc_vps_queue SET source_url = ?, status = 'pending', attempts = 0 WHERE id = ?`,
  );
  // Task 1782: increment attempts on every no-URL run so the max-attempts gate
  // can fire and mark exhausted rows as 'url_not_found'.
  //
  // FIX-BCTC-ENRICHER-STUCK-BACKLOG (2026-07-02): both statements now also set
  // last_attempt = datetime('now') — matching the orphan-resync statement
  // above, which already did this. Without it, rows terminalized here could
  // NEVER satisfy Arm 2's `last_attempt IS NOT NULL` predicate and were
  // permanently excluded from grace-period re-discovery (root cause of the
  // 23-row false-terminal HOSE backlog; see
  // docs/vps-sources/bctc-discover-stale-15d/enricher-liveness.md).
  //
  // Schema-guarded like the SELECT above: when last_attempt is absent
  // (lastAttemptColumnAvailable=false), fall back to the pre-fix SQL so
  // older/simplified test-fixture schemas don't throw "no such column".
  const incrementAttemptsStmt = db.prepare<void, [number]>(
    lastAttemptColumnAvailable
      ? `UPDATE bctc_vps_queue SET attempts = attempts + 1, last_attempt = datetime('now') WHERE id = ?`
      : `UPDATE bctc_vps_queue SET attempts = attempts + 1 WHERE id = ?`,
  );
  const markUrlNotFoundStmt = db.prepare<void, [number]>(
    lastAttemptColumnAvailable
      ? `UPDATE bctc_vps_queue SET status = 'url_not_found', attempts = attempts + 1, last_attempt = datetime('now') WHERE id = ?`
      : `UPDATE bctc_vps_queue SET status = 'url_not_found', attempts = attempts + 1 WHERE id = ?`,
  );

  // ── Discover URLs for each item ───────────────────────────────────────────
  for (const item of queueItems) {
    result.itemsProcessed++;

    try {
      // Build discover options. Production defaults use fetchHsxBctcUrls for Strategy 0.
      // When opts.discoverOptions is supplied by a caller (e.g. integration tests),
      // _fetchHsx is only included if the caller explicitly sets it — preserving the
      // pre-BCTC-3b behaviour for all existing tests. Only pure production runs
      // (no discoverOptions override) wire the live hsxBctcFetcher.
      //
      // FIX-CTG-1 (2026-06-03): pass item.period_year and item.period_quarter so
      // discoverHosePdfUrls calls the hsx.vn API for the correct year and the fetcher
      // filters to the correct quarter's PDF. Previously these defaulted to
      // year=currentYear / quarter="Q4", corrupting Q3/Q2 rows with a Q1-2026 URL.
      const discovery = await discoverHosePdfUrls(item.action_code, {
        timeout:  DISCOVERY_TIMEOUT_MS,
        year:     item.period_year,
        quarter:  item.period_quarter,
        _fetchHsx:           fetchHsxBctcUrls,
        _fetchVpsPlaywright: bctcHttpFetch,
        // SSC (_fetchSsc), cafef (_fetchCafef), vietstock (_fetchVietstock) removed TASK_1944b/TASK_1916b.
        // opts.discoverOptions spreads LAST and overrides any key above when present.
        // Tests that include _fetchHsx: undefined disable Strategy 0.
        // Tests that omit _fetchHsx entirely get the production default (live hsx.vn fetch).
        ...opts.discoverOptions,
      });

      if (discovery.urls.length > 0) {
        // Write the first (most authoritative) PDF URL
        const firstUrl = discovery.urls[0];
        if (firstUrl === undefined) {
          result.partialFailures++;
          continue;
        }
        updateStmt.run(firstUrl, item.id);
        result.urlsPopulated++;

        logger.debug("[bctcQueueEnricher] source_url populated", {
          ticker: item.action_code,
          source: discovery.source,
          url: discovery.urls[0],
        });
      } else {
        // No URL found.
        logger.warn(`[bctcQueueEnricher] 0 URLs found for ticker ${item.action_code} — scrape may be stale or source unavailable`);

        // FIX-BCTC-DISCOVER-CURRENT-QUARTER-ZERO-PUSH:
        // When discovery REACHES the source and returns 0 URLs (a real
        // network-level discovery, NOT a pre-network error), ALWAYS increment
        // attempts regardless of current value.  This is generic — no per-ticker
        // allowlist, no date literal.  Any genuinely-absent filing accumulates
        // attempts across cron cycles → reaches MAX_ENRICH_ATTEMPTS → marked
        // url_not_found (honest terminal) → drops out of pending → SLA stops
        // climbing.
        //
        // The previous `attempts===0` special-case else-branch prevented increment
        // on the first pass, causing genuinely-absent rows to stay stuck at
        // attempts=0 forever and cycle through 210+ zero-url cycles without ever
        // terminalising (root cause of bctc SLA FALSE-CRITICAL).
        //
        // The pre-network error path (catch block below) still does NOT increment,
        // so transient network/source-down failures do not penalise rows.
        if (item.attempts >= MAX_ENRICH_ATTEMPTS) {
          markUrlNotFoundStmt.run(item.id);
          logger.warn("[bctcQueueEnricher] no URL after max attempts — marking url_not_found", {
            ticker: item.action_code,
            attempts: item.attempts,
          });
        } else {
          incrementAttemptsStmt.run(item.id);
          logger.debug("[bctcQueueEnricher] no URLs found, incrementing attempts", {
            ticker: item.action_code,
            attempts: item.attempts + 1,
          });
        }
        result.partialFailures++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isTimeout = msg.toLowerCase().includes("abort") || msg.toLowerCase().includes("timeout");

      if (isTimeout) {
        result.timeoutFailures++;
      } else {
        result.partialFailures++;
      }

      // Do NOT increment attempts on error when source_url was never set.
      // Only increment when discovery actually reached the network and returned
      // no URL (handled in the else branch above). This keeps NULL-url rows
      // at attempts=0 until a real network-level discovery attempt completes.

      logger.warn("[bctcQueueEnricher] discovery error", {
        ticker: item.action_code,
        error: msg,
      });
    }
  }

  // ── FIX-BCTC-ZERO-URL-ALERT: consecutive-zero counter + earnings-guarded alert ─
  //
  // Rules (from Contract 1):
  //   • itemsProcessed == 0  → SKIP (empty queue = legit idle, not a fault)
  //   • urlsPopulated >  0   → RESET counter to 0  (any success resets)
  //   • urlsPopulated == 0 AND itemsProcessed > 0 → INCREMENT counter
  //   • counter >= THRESHOLD AND earnings window active AND dedup ok → ALERT
  //
  // Generic invariant: counter is aggregate across ALL tickers — no per-ticker
  // allowlist, no date literal.  Partial success (some tickers found, some not)
  // counts as urlsPopulated > 0 and resets the counter.
  //
  if (result.itemsProcessed === 0) {
    // Empty queue — legit idle, do not touch the counter.
    logger.debug("[bctcQueueEnricher] zero-url-alert: itemsProcessed=0, skipping counter update (idle)");
  } else if (result.urlsPopulated > 0) {
    // Any URL found → reset counter.
    writeZeroCounter(db, 0);
    logger.debug("[bctcQueueEnricher] zero-url-alert: urlsPopulated>0, counter reset to 0");
  } else {
    // urlsPopulated === 0 AND itemsProcessed > 0 → genuine zero-URL cycle.
    logger.warn(`[bctcQueueEnricher] 0 URLs populated across all ${result.itemsProcessed} item(s) — all sources may be unavailable or geo-blocked`);

    const { count: prevCount, lastAlertedAt } = readZeroCounter(db);
    const newCount = prevCount + 1;
    writeZeroCounter(db, newCount);

    logger.warn(`[bctcQueueEnricher] zero-url-alert: consecutive_zero_cycles=${newCount}`, {
      threshold: ZERO_URL_ALERT_THRESHOLD,
    });

    // Fire alert when threshold reached during active earnings window.
    if (newCount >= ZERO_URL_ALERT_THRESHOLD) {
      const earningsActive = isEarningsWindowActive(db);
      if (!earningsActive) {
        logger.info("[bctcQueueEnricher] zero-url-alert: threshold reached but no active earnings window — suppressing");
      } else {
        // Dedup: at most 1 alert per 6h.
        const nowMs = Date.now();
        const lastAlertMs = lastAlertedAt ? new Date(lastAlertedAt).getTime() : 0;
        const msSinceLastAlert = nowMs - lastAlertMs;

        if (msSinceLastAlert < ZERO_URL_ALERT_DEDUP_MS) {
          const waitMinutes = Math.round((ZERO_URL_ALERT_DEDUP_MS - msSinceLastAlert) / 60_000);
          logger.info(`[bctcQueueEnricher] zero-url-alert: dedup active — last alert ${Math.round(msSinceLastAlert / 60_000)} min ago, next in ~${waitMinutes} min`);
        } else {
          // Build message: aggregate, not per-ticker.
          const alertMsg =
            `[BCTC-ZERO-URL-ALERT] ${newCount} consecutive enricher cycles returned 0 URLs for ALL tickers.\n` +
            `itemsProcessed=${result.itemsProcessed} urlsPopulated=0\n` +
            `Active earnings window confirmed (pending/url_not_found rows exist).\n` +
            `Possible cause: discovery source down, VPS unavailable, or URL-regex change.\n` +
            `Check bctcQueueEnricherJob logs and discoverHosePdfUrls() sources.`;

          logger.error("[bctcQueueEnricher] zero-url-alert: FIRING BUG alert", {
            consecutive_zero_cycles: newCount,
          });

          // Record the alert timestamp BEFORE sending (so a send error doesn't cause
          // dedup to fire again immediately on the next cycle).
          const nowIso = new Date(nowMs).toISOString();
          writeZeroCounter(db, newCount, nowIso);

          try {
            const effectiveSendBug =
              opts.sendBugFn ??
              (async (msg: string) => {
                const { sendTelegramBug } = await import(
                  "../../infrastructure/notifiers/telegram.js"
                );
                await sendTelegramBug(msg);
              });
            await effectiveSendBug(alertMsg);
            logger.info("[bctcQueueEnricher] zero-url-alert: BUG alert sent successfully");
          } catch (sendErr) {
            logger.warn("[bctcQueueEnricher] zero-url-alert: sendBugFn threw (non-fatal)", {
              error: sendErr instanceof Error ? sendErr.message : String(sendErr),
            });
          }
        }
      }
    }
  }

  return result;
}
