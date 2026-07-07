#!/usr/bin/env bun
/**
 * scripts/migrations/trigger-ohlcv-backfill-queue.ts
 *
 * DATA-BACKFILL-PRICES-20260706-MONDAY-GAP — manual VPS backfill-queue trigger.
 *
 * Reusable operational script for the existing OHLCV-BACKFILL-P0 mechanism
 * (apps/mcp-server/src/scheduler/market-data/ohlcvHistoryBackfillJob.ts,
 * apps/mcp-server/src/interface/mcp/routes/ohlcvBackfillHandler.ts).
 *
 * Background:
 *   TCBS/VnDirect are geo-blocked from France/Docker, so daily_ohlcv history
 *   is filled VPS-side: VPS fetches VNDirect stock_prices for a rolling
 *   ~2yr window and pushes bars via POST /api/push-ohlcv-history. The VPS
 *   only runs this when it sees a pending row in `ohlcv_backfill_queue`
 *   (`vn-ohlcv-backfill.timer` polls GET /api/ohlcv-backfill-queue every
 *   30 min via `vps-scripts/ohlcv-backfill-poll.sh`).
 *
 *   The automated cron (`ohlcvHistoryBackfill`, 01:40 UTC daily) only queues
 *   a trigger when a ticker's bar count drops below HISTORY_TARGET_BARS
 *   (500) — a single-day gap inside an otherwise deep history (e.g. a
 *   Cloudflare Tunnel outage that drops exactly one trading day for every
 *   ticker) does NOT cross that threshold, so the daily cron will not fire
 *   for it. This script performs the same dedup-guarded INSERT the
 *   production job/probe use (ohlcvHistoryBackfillJob.ts,
 *   ohlcvStartupProbe.ts), on demand, so an operator/agent does not have to
 *   hand-write the SQL.
 *
 *   Because the VPS re-fetches a wide date window (fromDate..today) for
 *   every code, any honest gap inside that window (not just the sparse/
 *   shallow tail) gets naturally backfilled by the same push — idempotent
 *   via ON CONFLICT(code, date) DO UPDATE.
 *
 * Precedent: commit c94b58da4 (OHLCV-BACKFILL-P0, 2026-06-29) — "VPS queue
 * trigger id=451 inserted (done=0) → VPS will push 730-day data per ticker."
 * This script formalizes that manual action as a reusable, idempotent CLI.
 *
 * NO FAKE DATA: this script never writes to daily_ohlcv itself. It only
 * inserts a signal row; all price data still flows through the existing
 * VNDirect-fetch → validateOhlcvUnit → writeOhlcvBatch/push-ohlcv-history
 * SSOT path.
 *
 * Idempotency: dedup-guarded on `SELECT id FROM ohlcv_backfill_queue WHERE
 * done = 0` — running twice while a trigger is still pending is a no-op.
 *
 * DB path resolution: same as other canonical scripts — Bun.env["DB_PATH"]
 * first (docker: /app/data/market.db), else <repo-root>/data/market.db.
 *
 * CANONICAL SCRIPT — pointer lives in:
 *   docs/agents/dev-mcp-server/flow/main.md § Script Persistence
 *
 * Usage:
 *   # Dry-run (default — reports current queue + gap state, no writes):
 *   bun scripts/migrations/trigger-ohlcv-backfill-queue.ts
 *   bun scripts/migrations/trigger-ohlcv-backfill-queue.ts --dry-run
 *
 *   # Apply (inserts a queue trigger row unless one is already pending):
 *   bun scripts/migrations/trigger-ohlcv-backfill-queue.ts --apply
 *
 *   # Against the live named-volume DB (docker exec — recommended for prod):
 *   docker cp scripts/migrations/trigger-ohlcv-backfill-queue.ts \
 *     vn-market-intelligence-mcp-mcp-server-1:/app/trigger-ohlcv-backfill-queue.ts
 *   docker exec vn-market-intelligence-mcp-mcp-server-1 \
 *     bun /app/trigger-ohlcv-backfill-queue.ts --apply
 *
 *   # Optional: report gap-day diagnostics for a specific date
 *   bun scripts/migrations/trigger-ohlcv-backfill-queue.ts --gap-date=2026-07-06
 *
 * Environment:
 *   DB_PATH — override DB path (default: <repo-root>/data/market.db)
 *
 * Exit codes:
 *   0 — success (dry-run, apply, or no-op dedup skip)
 *   1 — DB open failure or SQL error
 */

import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// Types (exported for test imports)
// ─────────────────────────────────────────────────────────────────────────────

export interface QueueTriggerResult {
  /** true if a pending (done=0) row already existed before this run */
  alreadyPending: boolean;
  /** id of the existing pending row (alreadyPending=true) or the newly inserted row */
  queueRowId: number | null;
  /** true if a new row was inserted by this run */
  inserted: boolean;
}

export interface GapReport {
  gapDate: string;
  /** codes with data the trading day before AND after gapDate, but not on gapDate */
  missingCodes: string[];
  missingCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core functions (exported for tests)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dedup-guarded queue trigger insert — mirrors the exact pattern used by
 * ohlcvHistoryBackfillJob.ts and ohlcvStartupProbe.ts in production.
 */
export function triggerBackfillQueue(
  db: Database,
  opts: { dryRun: boolean; logger?: (msg: string) => void },
): QueueTriggerResult {
  const log = opts.logger ?? ((msg: string) => console.log(msg));

  const existing = db
    .query<{ id: number }, []>("SELECT id FROM ohlcv_backfill_queue WHERE done = 0 LIMIT 1")
    .get();

  if (existing) {
    log(`[TRIGGER] Pending queue row already exists (id=${existing.id}) — not inserting duplicate`);
    return { alreadyPending: true, queueRowId: existing.id, inserted: false };
  }

  if (opts.dryRun) {
    log(`[TRIGGER] DRY-RUN — no pending row found; would INSERT a new trigger row. Re-run with --apply.`);
    return { alreadyPending: false, queueRowId: null, inserted: false };
  }

  db.prepare("INSERT INTO ohlcv_backfill_queue(queued_at) VALUES (datetime('now'))").run();
  const row = db
    .query<{ id: number }, []>("SELECT id FROM ohlcv_backfill_queue ORDER BY id DESC LIMIT 1")
    .get();
  const newId = row?.id ?? null;
  log(`[TRIGGER] Inserted new trigger row id=${newId} — VPS will pick this up on its next poll (≤30 min)`);
  return { alreadyPending: false, queueRowId: newId, inserted: true };
}

/**
 * Diagnostic-only gap report: codes that have a row on the closest prior
 * trading day AND the closest following row in the table, but are missing
 * exactly on gapDate. Read-only — never used to gate the trigger insert.
 */
export function reportGap(db: Database, gapDate: string): GapReport {
  const missingCodes = db
    .query<{ code: string }, [string]>(
      `
      SELECT DISTINCT d1.code AS code
      FROM daily_ohlcv d1
      WHERE d1.date = (SELECT MAX(date) FROM daily_ohlcv WHERE date < ?)
        AND NOT EXISTS (SELECT 1 FROM daily_ohlcv d2 WHERE d2.code = d1.code AND d2.date = ?)
      `,
    )
    .all(gapDate, gapDate)
    .map((r) => r.code);

  return { gapDate, missingCodes, missingCount: missingCodes.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI entry point
// ─────────────────────────────────────────────────────────────────────────────

if (import.meta.main) {
  const args = process.argv.slice(2);
  const isDryRun = !args.includes("--apply");
  const gapDateArg = args.find((a) => a.startsWith("--gap-date="));
  const gapDate = gapDateArg ? gapDateArg.split("=")[1] : undefined;

  const PROJECT_ROOT = resolve(import.meta.dir, "..", "..");
  const DB_PATH = Bun.env["DB_PATH"] ?? resolve(PROJECT_ROOT, "data", "market.db");

  function log(msg: string): void {
    console.log(`[${new Date().toISOString()}] ${msg}`);
  }

  log(`[TRIGGER] trigger-ohlcv-backfill-queue`);
  log(`[TRIGGER] mode=${isDryRun ? "DRY-RUN" : "APPLY"}`);
  log(`[TRIGGER] DB_PATH=${DB_PATH}`);

  if (!existsSync(DB_PATH)) {
    log(`[TRIGGER] ERROR: DB not found at ${DB_PATH}`);
    log(`[TRIGGER] For named-volume DB, run via docker exec:`);
    log(`[TRIGGER]   docker cp scripts/migrations/trigger-ohlcv-backfill-queue.ts \\`);
    log(`[TRIGGER]     vn-market-intelligence-mcp-mcp-server-1:/app/trigger-ohlcv-backfill-queue.ts`);
    log(`[TRIGGER]   docker exec vn-market-intelligence-mcp-mcp-server-1 \\`);
    log(`[TRIGGER]     bun /app/trigger-ohlcv-backfill-queue.ts --apply`);
    process.exit(1);
  }

  let db: Database;
  try {
    db = new Database(DB_PATH, { readwrite: !isDryRun, readonly: isDryRun });
  } catch (err) {
    log(`[TRIGGER] ERROR: Cannot open DB: ${err}`);
    process.exit(1);
  }

  try {
    if (gapDate) {
      const gap = reportGap(db, gapDate);
      log(`[TRIGGER] Gap report for ${gapDate}: ${gap.missingCount} code(s) missing`);
      if (gap.missingCount > 0) {
        log(`[TRIGGER] Sample: ${gap.missingCodes.slice(0, 10).join(", ")}`);
      }
    }

    const result = triggerBackfillQueue(db, { dryRun: isDryRun, logger: log });

    if (isDryRun) {
      log(`[TRIGGER] DRY-RUN summary: alreadyPending=${result.alreadyPending} — re-run with --apply to insert.`);
    } else {
      log(
        `[TRIGGER] APPLY summary: alreadyPending=${result.alreadyPending} inserted=${result.inserted} queueRowId=${result.queueRowId ?? "n/a"}`,
      );
    }

    db.close();
  } catch (err) {
    log(`[TRIGGER] FATAL: ${err}`);
    try {
      db.close();
    } catch {
      /* ignore */
    }
    process.exit(1);
  }
}
