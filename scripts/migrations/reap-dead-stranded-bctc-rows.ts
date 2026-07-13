#!/usr/bin/env bun
/**
 * scripts/migrations/reap-dead-stranded-bctc-rows.ts
 *
 * VCB-MISSING-PDFS — one-time data cleanup for permanently-dead
 * stranded_bctc_pdf agent_feedback rows.
 *
 * Background: `bctcReparseJob` (apps/mcp-server/src/scheduler/financial-reports/
 * bctcReparseJob.ts) retries every `agent_feedback` row tagged
 * `[AUDIT] stranded_bctc_pdf%` with `status='new'` on every run. Before this
 * fix, a row whose source PDF had been deleted from `data/pdfs/` (e.g. the
 * production VCB_2025_Q4.pdf row, id=323, created 2026-05-28) spun forever —
 * "file disappeared before reparse" on every single run, incrementing
 * reparse_attempts without limit (271 attempts observed 2026-07-13) and
 * wasting a pdf-extractor service round-trip each time, because nothing ever
 * transitioned the row out of status='new'.
 *
 * The companion code fix (same commit) adds a DEAD_AT_ATTEMPTS(10) guard
 * inside bctcReparseJob.ts: once a row has failed at least 10 times AND its
 * file is confirmed absent from disk right now, the job itself retires the
 * row to status='dead'. That guard only takes effect for the LIVE container
 * after an image rebuild (deploy-gated — see DEPLOY-REQUIRED note in the
 * task journal). This script performs the same generic detection + retire
 * action directly against the DB so already-stuck rows (like id=323) do not
 * have to wait for that rebuild.
 *
 * Generic — NO ticker/date literals: selects ANY `stranded_bctc_pdf` row
 * with `status='new'`, `reparse_attempts >= DEAD_AT_ATTEMPTS`, and a
 * `filePath` (parsed from the JSON tail of `detail`) that does not exist on
 * disk right now. A row whose file still exists is left untouched — that is
 * a different, still-open failure mode (e.g. repeated low-confidence
 * extraction), out of scope for this cleanup.
 *
 * Self-contained (duplicates the tiny JSON-detail parse rather than
 * importing bctcReparseJob.ts) — same reasoning as
 * resync-watchlist-sysmap-2026-07-11.ts: the Docker image bakes `src/` at
 * build time (NOT live-synced like `docs/data/`), so this script must work
 * correctly whether run BEFORE or AFTER the DEAD_AT_ATTEMPTS code fix has
 * been rebuilt into the live image.
 *
 * NO FAKE DATA: this script never writes/fabricates PDF content or
 * financial_reports rows. It only flips `agent_feedback.status` from 'new'
 * to 'dead' for rows whose file is confirmed absent — an honest bookkeeping
 * correction, distinct from 'resolved' (which would falsely claim the file
 * was actually reparsed).
 *
 * Idempotent: a second run finds 0 candidate rows once already marked dead
 * (exit 0, no-op).
 *
 * Usage:
 *   # Dry-run (default — reports candidate rows, no writes):
 *   bun scripts/migrations/reap-dead-stranded-bctc-rows.ts
 *   bun scripts/migrations/reap-dead-stranded-bctc-rows.ts --dry-run
 *
 *   # Apply (UPDATE status='dead' for every candidate found):
 *   bun scripts/migrations/reap-dead-stranded-bctc-rows.ts --apply
 *
 *   # Against the live named-volume DB (docker exec — matches other
 *   # CANONICAL scripts in this zone):
 *   docker cp scripts/migrations/reap-dead-stranded-bctc-rows.ts \
 *     vn-market-intelligence-mcp-mcp-server-1:/app/reap-dead-stranded-bctc-rows.ts
 *   docker exec vn-market-intelligence-mcp-mcp-server-1 \
 *     bun /app/reap-dead-stranded-bctc-rows.ts --apply
 *
 * Environment:
 *   DB_PATH — override DB path (default: <repo-root>/data/market.db)
 *
 * Exit codes:
 *   0 — success (dry-run or apply, including 0-candidate no-op)
 *   1 — DB open failure or SQL error
 */

import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

/** Mirrors DEAD_AT_ATTEMPTS in apps/mcp-server/src/scheduler/financial-reports/bctcReparseJob.ts */
export const DEAD_AT_ATTEMPTS = 10;

export interface DeadRowCandidate {
  id: number;
  title: string;
  filePath: string;
  reparse_attempts: number;
}

/**
 * Extract `filePath` from the JSON tail of a stranded_bctc_pdf feedback
 * `detail` string. Mirrors parseStrandedDetail()'s JSON branch in
 * bctcReparseJob.ts (duplicated intentionally — see file header).
 */
export function extractFilePath(detail: string): string | null {
  const braceIdx = detail.indexOf("{");
  if (braceIdx < 0) return null;
  try {
    const parsed = JSON.parse(detail.slice(braceIdx)) as { filePath?: string };
    return parsed.filePath ?? null;
  } catch {
    return null;
  }
}

/**
 * Find stranded_bctc_pdf rows that are permanently dead: still 'new',
 * already retried at least DEAD_AT_ATTEMPTS times, and whose file is
 * confirmed absent from disk right now.
 */
export function findDeadCandidates(
  db: Database,
  fileExistsFn: (path: string) => boolean = existsSync,
): DeadRowCandidate[] {
  const rows = db
    .query<{ id: number; title: string; detail: string; reparse_attempts: number }, [number]>(
      `SELECT id, title, detail, reparse_attempts FROM agent_feedback
       WHERE title LIKE '[AUDIT] stranded_bctc_pdf%'
         AND status = 'new'
         AND reparse_attempts >= ?`,
    )
    .all(DEAD_AT_ATTEMPTS);

  const candidates: DeadRowCandidate[] = [];
  for (const r of rows) {
    const filePath = extractFilePath(r.detail);
    if (!filePath) continue;
    if (fileExistsFn(filePath)) continue; // file present — different, still-open failure mode
    candidates.push({
      id: r.id,
      title: r.title,
      filePath,
      reparse_attempts: r.reparse_attempts,
    });
  }
  return candidates;
}

/** Retire the given row ids to status='dead'. Returns the number of rows actually changed. */
export function markDead(db: Database, ids: number[]): number {
  if (ids.length === 0) return 0;
  const placeholders = ids.map(() => "?").join(",");
  const result = db
    .prepare(
      `UPDATE agent_feedback SET status = 'dead' WHERE id IN (${placeholders}) AND status = 'new'`,
    )
    .run(...ids);
  return result.changes;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI entry point
// ─────────────────────────────────────────────────────────────────────────────

if (import.meta.main) {
  const args = process.argv.slice(2);
  const isDryRun = !args.includes("--apply");

  const PROJECT_ROOT = resolve(import.meta.dir, "..", "..");
  const DB_PATH = Bun.env["DB_PATH"] ?? resolve(PROJECT_ROOT, "data", "market.db");

  function log(msg: string): void {
    console.log(`[${new Date().toISOString()}] ${msg}`);
  }

  log(`[REAP-DEAD-BCTC] reap-dead-stranded-bctc-rows`);
  log(`[REAP-DEAD-BCTC] mode=${isDryRun ? "DRY-RUN" : "APPLY"}`);
  log(`[REAP-DEAD-BCTC] DB_PATH=${DB_PATH}`);

  if (!existsSync(DB_PATH)) {
    log(`[REAP-DEAD-BCTC] ERROR: DB not found at ${DB_PATH}`);
    log(`[REAP-DEAD-BCTC] For named-volume DB, run via docker exec:`);
    log(`[REAP-DEAD-BCTC]   docker cp scripts/migrations/reap-dead-stranded-bctc-rows.ts \\`);
    log(`[REAP-DEAD-BCTC]     vn-market-intelligence-mcp-mcp-server-1:/app/reap-dead-stranded-bctc-rows.ts`);
    log(`[REAP-DEAD-BCTC]   docker exec vn-market-intelligence-mcp-mcp-server-1 \\`);
    log(`[REAP-DEAD-BCTC]     bun /app/reap-dead-stranded-bctc-rows.ts --apply`);
    process.exit(1);
  }

  let db: Database;
  try {
    db = new Database(DB_PATH, { readwrite: !isDryRun, readonly: isDryRun });
  } catch (err) {
    log(`[REAP-DEAD-BCTC] ERROR: Cannot open DB: ${err}`);
    process.exit(1);
  }

  try {
    const candidates = findDeadCandidates(db);

    if (candidates.length === 0) {
      log(`[REAP-DEAD-BCTC] No dead candidates found — no-op (exit 0)`);
      db.close();
      process.exit(0);
    }

    log(`[REAP-DEAD-BCTC] Found ${candidates.length} dead candidate(s):`);
    for (const c of candidates) {
      log(`[REAP-DEAD-BCTC]   id=${c.id} attempts=${c.reparse_attempts} filePath=${c.filePath}`);
    }

    if (isDryRun) {
      log(`[REAP-DEAD-BCTC] DRY-RUN — no writes. Re-run with --apply to mark these rows 'dead'.`);
    } else {
      const changed = markDead(
        db,
        candidates.map((c) => c.id),
      );
      log(`[REAP-DEAD-BCTC] APPLY — marked ${changed} row(s) status='dead'`);
    }

    db.close();
  } catch (err) {
    log(`[REAP-DEAD-BCTC] FATAL: ${err}`);
    try {
      db.close();
    } catch {
      /* ignore */
    }
    process.exit(1);
  }
}
