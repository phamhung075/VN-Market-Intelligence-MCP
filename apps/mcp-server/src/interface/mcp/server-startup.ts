/**
 * Interface — MCP Server startup state + one-time guards
 *
 * Extracted from server.ts (Task 1406d).
 * Holds module-level mutable state and startup-guard functions that must run
 * exactly once per process lifetime.
 *
 * Rule: no circular imports — nothing here imports from server.ts or route handlers.
 */

import { createLogger } from "../../infrastructure/logger.js";
import { getDb } from "../../infrastructure/db/schema.js";
import { runVnstockMigrations } from "../../infrastructure/db/vnstockStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Stale-ticker cooldown state
// ─────────────────────────────────────────────────────────────────────────────

/** ISO date string (YYYY-MM-DD) of the last stale-ticker WORK notification. Reset daily. */
export let _staleTickers_lastNotifiedDate = "";

/**
 * Setter used by pushPricesHandler to update the cooldown date.
 * ESM live bindings for `let` exports are read-only from the importer side,
 * so we expose an explicit setter instead of direct assignment.
 */
export function _setStaleTickers_lastNotifiedDate(v: string): void {
  _staleTickers_lastNotifiedDate = v;
}

/** Resets the cooldown — used by tests for isolation between test cases. */
export function _resetStaleTickers_lastNotifiedDate(): void {
  _staleTickers_lastNotifiedDate = "";
}

// ─────────────────────────────────────────────────────────────────────────────
// VN trading window helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true only during VN trading hours: 02:00–08:59 UTC, Mon–Fri.
 * Used to suppress change_pct alerts outside the intraday window (Task 1380).
 */
export function isVnTradingWindowUtc(now: Date = new Date()): boolean {
  const day = now.getUTCDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;
  const h = now.getUTCHours();
  return h >= 2 && h <= 8;
}

// ─────────────────────────────────────────────────────────────────────────────
// Foreign flow migration guard
// ─────────────────────────────────────────────────────────────────────────────

// Migration guard — run once per process startup, before the first upsertForeignFlow call.
// Ensures UNIQUE(code, date) index exists on vnstock_trading_stats for production DBs
// that were created before the index was added (FIX-1312).
let _migrationRanForForeignFlow = false;

export function ensureForeignFlowMigration(): void {
  if (_migrationRanForForeignFlow) return;
  _migrationRanForForeignFlow = true;
  try {
    runVnstockMigrations();
  } catch (err) {
    // Log but don't crash the server — upsertForeignFlow has its own constraint guard
    import("../../infrastructure/logger.js").then(({ createLogger }) => {
      createLogger("info").warn("[push-foreign-flow] migration guard failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FIX-BCTC-SIZE-GUARD — One-time cleanup: reset 4 poisoned 'done' queue entries
//
// Migration complete (2026-04-26): all 4 poisoned PDFs (459-byte test payloads)
// were deleted and their queue rows re-enqueued. BSR and DGC have since been
// successfully downloaded as real PDFs from VPS.
//
// IMPORTANT: This list must remain empty. Adding entries here causes the cleanup
// to run on every container restart (ensurePoisonedQueueCleanup's _poisonedQueueCleanupRan
// guard is process-scoped, not persistent), which resets 'done' rows back to
// 'pending' and creates an infinite re-download loop.
//
// Task 1413d (2026-04-29): emptied list after diagnosing BSR/DGC stuck-pending
// root cause — cleanup was resetting them to 'pending' on every restart despite
// their PDFs being successfully downloaded.
// ─────────────────────────────────────────────────────────────────────────────

export const POISONED_BCTC_ENTRIES: ReadonlyArray<{
  action_code: string;
  period_year: number;
  period_quarter: string;
  filename: string;
}> = [];

let _poisonedQueueCleanupRan = false;

export function ensurePoisonedQueueCleanup(): void {
  if (_poisonedQueueCleanupRan) return;
  _poisonedQueueCleanupRan = true;
  const _log = createLogger("info");
  try {
    const db = getDb();
    const { resolve } = require("node:path") as typeof import("node:path");
    const { rmSync, existsSync } = require("node:fs") as typeof import("node:fs");
    const pdfDir = resolve(process.cwd(), "data", "pdfs");

    for (const entry of POISONED_BCTC_ENTRIES) {
      // Step 1: reset queue status → pending
      db.prepare(
        `UPDATE bctc_vps_queue
         SET status = 'pending', attempts = 0, last_attempt = NULL
         WHERE action_code = ? AND period_year = ? AND period_quarter = ?`,
      ).run(entry.action_code, entry.period_year, entry.period_quarter);

      // Step 2: delete pdf_extracted_text rows
      db.prepare(`DELETE FROM pdf_extracted_text WHERE filename = ?`).run(entry.filename);

      // Step 3: delete corrupt PDF file from disk
      const pdfPath = resolve(pdfDir, entry.filename);
      if (existsSync(pdfPath)) {
        rmSync(pdfPath, { force: true });
        _log.info("[bctc-poison-cleanup] deleted corrupt PDF", { path: pdfPath });
      }
    }

    _log.info("[bctc-poison-cleanup] reset 4 poisoned bctc_vps_queue entries to pending");
  } catch (err) {
    _log.warn("[bctc-poison-cleanup] cleanup failed (non-fatal)", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
