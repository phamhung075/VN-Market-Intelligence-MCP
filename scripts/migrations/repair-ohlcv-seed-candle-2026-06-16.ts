#!/usr/bin/env bun
/**
 * scripts/migrations/repair-ohlcv-seed-candle-2026-06-16.ts
 *
 * FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0 — SUBTASK-6 (FAST-TRACK repair)
 *
 * Deletes synthetic seed rows written by taOhlcvBackfillJob (Writer D) for
 * 2026-06-16. These rows have a flat O=H=L=C value (reference price), volume=0,
 * and data_env IS NULL — the fingerprint confirmed consumer-safe for deletion
 * per architect §3.2 (Option D verdict).
 *
 * Background:
 *   taOhlcvBackfillJob fetches VNDIRECT with toDate=today and receives a seed
 *   reference row for each uncovered ticker. The prevClose is initialised to 0,
 *   making detectAndNormalizeScaleFromPrevClose a no-op — the corrupted value
 *   (e.g. VHM 136.1 instead of 136,100) is written as-is. This poisons
 *   RSI/TA calculations and triggers false "giá 0 dưới BB" alerts.
 *
 *   Deleting these rows is safe:
 *     - get_technical_indicators falls back to yesterday's real close (self-heals)
 *     - All writers (A/C) use ON CONFLICT DO UPDATE — absent row = fresh INSERT
 *     - morningBriefing runs at 01:00 UTC, before the corrupt rows land (01:30 UTC)
 *     - Foreign-flow stubs (open=0) do NOT match the fingerprint (open > 0 here)
 *
 * Fingerprint WHERE (architect-confirmed, §3.2):
 *   date = '2026-06-16'
 *   AND volume = 0
 *   AND open = high
 *   AND high = low
 *   AND low = close
 *   AND data_env IS NULL
 *
 * DB path resolution:
 *   Reads Bun.env["DB_PATH"] first (set to /app/data/market.db inside docker by
 *   docker-compose.yml). Falls back to <repo-root>/data/market.db for local runs.
 *   This is the same resolution logic used by apps/mcp-server/src/infrastructure/db/schema.ts.
 *   NEVER hardcode ./data — that is a stale 0-row host-side decoy.
 *
 * Idempotency:
 *   Running twice deletes 0 rows on the second run (WHERE matches nothing),
 *   exits 0, and emits "[REPAIR] Deleted 0 synthetic seed rows". Safe to re-run.
 *
 * CANONICAL SCRIPT — pointer lives in:
 *   docs/agents/dev-mcp-server/flow/main.md § Script Persistence
 *
 * Usage:
 *   # Dry-run (default — prints count + sample, no writes):
 *   bun scripts/migrations/repair-ohlcv-seed-candle-2026-06-16.ts
 *   bun scripts/migrations/repair-ohlcv-seed-candle-2026-06-16.ts --dry-run
 *
 *   # Apply (performs the DELETE):
 *   bun scripts/migrations/repair-ohlcv-seed-candle-2026-06-16.ts --apply
 *   # or via env flag:
 *   REPAIR_APPLY=1 bun scripts/migrations/repair-ohlcv-seed-candle-2026-06-16.ts
 *
 *   # Against live named volume (docker exec — recommended for prod):
 *   docker cp scripts/migrations/repair-ohlcv-seed-candle-2026-06-16.ts \
 *     vn-market-intelligence-mcp-mcp-server-1:/app/repair-seed-candle.ts
 *
 *   # Dry-run inside container:
 *   docker exec vn-market-intelligence-mcp-mcp-server-1 \
 *     bun /app/repair-seed-candle.ts --dry-run
 *
 *   # Apply inside container:
 *   docker exec vn-market-intelligence-mcp-mcp-server-1 \
 *     bun /app/repair-seed-candle.ts --apply
 *
 * Environment:
 *   DB_PATH      — override DB path (default: <repo-root>/data/market.db)
 *   REPAIR_APPLY — set to "1" or "true" to perform the DELETE without --apply flag
 *
 * Exit codes:
 *   0 — success (dry-run or apply)
 *   1 — DB open failure or SQL error
 */

import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const TARGET_DATE = "2026-06-16";

// ─────────────────────────────────────────────────────────────────────────────
// Types (exported for test imports)
// ─────────────────────────────────────────────────────────────────────────────

export interface SeedRow {
  code: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  data_env: string | null;
}

export interface RepairResult {
  /** Number of rows matched by the fingerprint WHERE (before DELETE in apply mode) */
  matched_count: number;
  /** Number of rows actually deleted (0 in dry-run, matches matched_count in apply) */
  deleted_count: number;
  /** Up to 5 sample rows from the matched set (populated in dry-run and apply pre-delete) */
  sample: SeedRow[];
}

export interface RepairOptions {
  /** If true (default): count + sample only, no DELETE. Pass false to execute DELETE. */
  dryRun: boolean;
  /** Optional logger — defaults to console.log. Pass a no-op in tests to suppress output. */
  logger?: (msg: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// SQL — architect-confirmed fingerprint WHERE (§3.2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fingerprint WHERE clause for synthetic seed rows written by Writer D on 2026-06-16.
 * Matches ONLY rows that are:
 *   - date-scoped to the affected date
 *   - zero-volume (seed reference rows have no real traded volume)
 *   - flat OHLC (open = high = low = close — reference price, not a real candle)
 *   - data_env IS NULL (Writer D omits data_env; Writer E always sets it)
 *
 * Does NOT match:
 *   - Real VPS-pushed rows (volume > 0 after market opens)
 *   - Foreign-flow stub rows (open = 0, not flat non-zero price)
 *   - Rows corrected by Writer A or C (they set volume > 0)
 */
const FINGERPRINT_WHERE = `
  date = ?
  AND volume = 0
  AND open = high
  AND high = low
  AND low = close
  AND data_env IS NULL
`.trim();

const SQL = {
  count: `SELECT COUNT(*) AS cnt FROM daily_ohlcv WHERE ${FINGERPRINT_WHERE}`,
  sample: `
    SELECT code, date, open, high, low, close, volume, data_env
    FROM daily_ohlcv
    WHERE ${FINGERPRINT_WHERE}
    ORDER BY code
    LIMIT 5
  `,
  delete: `
    DELETE FROM daily_ohlcv
    WHERE ${FINGERPRINT_WHERE}
  `,
};

// ─────────────────────────────────────────────────────────────────────────────
// Core repair function (exported for tests)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the seed-candle repair against the given Database instance.
 *
 * - dryRun=true (default): counts + samples only, no writes.
 * - dryRun=false: executes DELETE inside a transaction.
 *
 * Idempotent: running twice with dryRun=false deletes 0 rows on the second
 * run (WHERE matches nothing). Both runs exit 0.
 *
 * Safe to call on :memory: for unit tests.
 * Throws on SQL error (caller sets exit code 1).
 */
export function runRepair(db: Database, opts: RepairOptions): RepairResult {
  const log = opts.logger ?? ((msg: string) => console.log(msg));

  // Count matched rows
  const countRow = db.query<{ cnt: number }, [string]>(SQL.count).get(TARGET_DATE);
  const matchedCount = countRow?.cnt ?? 0;
  log(`[REPAIR] Matched ${matchedCount} synthetic seed row(s) for ${TARGET_DATE}`);

  // Sample matched rows (up to 5)
  const sample = db.query<SeedRow, [string]>(SQL.sample).all(TARGET_DATE);
  if (sample.length > 0) {
    log(`[REPAIR] Sample matched rows (up to 5):`);
    for (const row of sample) {
      log(
        `  ${row.code} ${row.date}: O=${row.open} H=${row.high} L=${row.low} C=${row.close} vol=${row.volume} data_env=${row.data_env ?? "NULL"}`,
      );
    }
  } else {
    log(`[REPAIR] No matched rows — table is already clean for ${TARGET_DATE}.`);
  }

  if (opts.dryRun) {
    log(`[REPAIR] DRY-RUN — no rows deleted. Re-run with --apply to execute DELETE.`);
    return { matched_count: matchedCount, deleted_count: 0, sample };
  }

  // Apply: DELETE inside a transaction
  let deletedCount = 0;
  db.exec("BEGIN IMMEDIATE");
  try {
    const stmt = db.prepare(SQL.delete);
    const result = stmt.run(TARGET_DATE);
    deletedCount = result.changes;
    db.exec("COMMIT");
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* ignore rollback error */
    }
    throw err;
  }

  log(`[REPAIR] Deleted ${deletedCount} synthetic seed rows from daily_ohlcv for ${TARGET_DATE}`);

  // Idempotency verification: count again (expect 0)
  const remainRow = db.query<{ cnt: number }, [string]>(SQL.count).get(TARGET_DATE);
  const remainCount = remainRow?.cnt ?? 0;
  if (remainCount > 0) {
    log(`[REPAIR] WARNING: ${remainCount} matched rows still present after DELETE — unexpected`);
  } else {
    log(`[REPAIR] OK: 0 matched rows remain (idempotency confirmed)`);
  }

  return { matched_count: matchedCount, deleted_count: deletedCount, sample };
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI entry point
// ─────────────────────────────────────────────────────────────────────────────

if (import.meta.main) {
  const args = process.argv.slice(2);

  // Dry-run by default; explicit --apply flag or REPAIR_APPLY env triggers DELETE
  const applyEnv = Bun.env["REPAIR_APPLY"];
  const applyViaEnv = applyEnv === "1" || applyEnv === "true";
  const applyViaFlag = args.includes("--apply");
  const isDryRun = !(applyViaFlag || applyViaEnv);

  // DB path: read from env (set to /app/data/market.db inside docker) or fall back
  // to <repo-root>/data/market.db. Never hardcode ./data — that is the stale host decoy.
  const PROJECT_ROOT = resolve(import.meta.dir, "..", "..");
  const DB_PATH = Bun.env["DB_PATH"] ?? resolve(PROJECT_ROOT, "data", "market.db");

  function log(msg: string): void {
    console.log(`[${new Date().toISOString()}] ${msg}`);
  }

  log(`[REPAIR] repair-ohlcv-seed-candle-2026-06-16`);
  log(`[REPAIR] mode=${isDryRun ? "DRY-RUN" : "APPLY"}`);
  log(`[REPAIR] DB_PATH=${DB_PATH}`);
  log(`[REPAIR] target_date=${TARGET_DATE}`);

  if (!existsSync(DB_PATH)) {
    log(`[REPAIR] ERROR: DB not found at ${DB_PATH}`);
    log(`[REPAIR] For named-volume DB, run via docker exec:`);
    log(`[REPAIR]   docker cp scripts/migrations/repair-ohlcv-seed-candle-2026-06-16.ts \\`);
    log(`[REPAIR]     vn-market-intelligence-mcp-mcp-server-1:/app/repair-seed-candle.ts`);
    log(`[REPAIR]   docker exec vn-market-intelligence-mcp-mcp-server-1 \\`);
    log(`[REPAIR]     bun /app/repair-seed-candle.ts --dry-run`);
    process.exit(1);
  }

  let db: Database;
  try {
    // Open readonly for dry-run; readwrite for apply
    db = new Database(DB_PATH, { readwrite: !isDryRun, readonly: isDryRun });
  } catch (err) {
    log(`[REPAIR] ERROR: Cannot open DB: ${err}`);
    process.exit(1);
  }

  try {
    const result = runRepair(db, { dryRun: isDryRun, logger: log });

    if (isDryRun) {
      log(`[REPAIR] DRY-RUN summary: ${result.matched_count} rows would be deleted.`);
      log(`[REPAIR] Re-run with --apply (or REPAIR_APPLY=1) to execute DELETE.`);
    } else {
      log(`[REPAIR] APPLY summary: deleted=${result.deleted_count} matched=${result.matched_count}`);
    }

    db.close();
  } catch (err) {
    log(`[REPAIR] FATAL: ${err}`);
    try {
      db.close();
    } catch {
      /* ignore */
    }
    process.exit(1);
  }
}
