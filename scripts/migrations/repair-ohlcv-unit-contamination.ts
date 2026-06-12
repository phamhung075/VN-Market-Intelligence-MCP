#!/usr/bin/env bun
/**
 * scripts/migrations/repair-ohlcv-unit-contamination.ts
 *
 * Repair contaminated OHLCV rows where open/low are in thousand-VND scale
 * while close is in full-VND scale.
 *
 * Background: VNDIRECT Writers D/E delivered open/low in thousand-VND while
 * high/close came in full-VND. Heuristic: if open < 100 AND close >= 1000 (and
 * neither field is zero), the row is contaminated. Fix: multiply open and low
 * by 1000. The 2026-05-30T11:47Z bulk all-zero rows are a SEPARATE defect and
 * are excluded from this repair (see BINDING AMENDMENT in TASK_CONTAM_6.md).
 * CONTAM-8 (2026-06-12): boundary corrected from close > 1000 to close >= 1000
 *   to capture VNH 2026-06-12 (open=0.9, close=1000.0 exactly).
 *
 * RF-3 (race guard): Run during off-hours — outside VN trading hours
 *   02:00–09:00 UTC (09:00–16:00 ICT) to avoid racing with live writers.
 * RF-4 (INSERT OR IGNORE): After repair, cnt > 100 holds for all repaired rows
 *   so Writer E guard skips them correctly.
 * RF-5 (data_env): data_env is preserved — not touched in UPDATE.
 *
 * CANONICAL SCRIPT — pointer lives in:
 *   docs/policies/dev-standards.md § Script Persistence (migration)
 *
 * Usage:
 *   # Dry-run (default — no DB write):
 *   bun run scripts/migrations/repair-ohlcv-unit-contamination.ts --dry-run
 *
 *   # Live-run (prompts before writing):
 *   bun run scripts/migrations/repair-ohlcv-unit-contamination.ts --live
 *
 * Against live named volume (docker exec — recommended):
 *   docker cp scripts/migrations/repair-ohlcv-unit-contamination.ts \
 *     vn-market-intelligence-mcp-mcp-server-1:/app/repair-ohlcv-migration.ts
 *   docker exec -it vn-market-intelligence-mcp-mcp-server-1 \
 *     bun run /app/repair-ohlcv-migration.ts --dry-run
 *   docker exec -it vn-market-intelligence-mcp-mcp-server-1 \
 *     bun run /app/repair-ohlcv-migration.ts --live
 *
 * Environment:
 *   DB_PATH — override DB path (default: data/market.db relative to repo root)
 *
 * Exit codes:
 *   0 — success (dry-run or live)
 *   1 — SQL error or DB open failure
 *   2 — user aborted (live mode, answered "no")
 */

import { Database } from "bun:sqlite";
import { existsSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";

// ─────────────────────────────────────────────────────────────────────────────
// Types (exported for test imports)
// ─────────────────────────────────────────────────────────────────────────────

export interface ContaminatedRow {
  code: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  data_env: string | null;
}

export interface RepairResult {
  contaminated_count: number;
  zero_rows_skipped: number;
  rows_updated: number;
  sample_before: ContaminatedRow[];
  sample_after: ContaminatedRow[];
}

export interface RepairOptions {
  /** If true: count + sample only, no writes. Default: true */
  dryRun: boolean;
  /** Optional logger — defaults to console.log. Pass no-op in tests to suppress output. */
  logger?: (msg: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// SQL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detection WHERE clause (binding amendment: exclude all-zero rows).
 * CONTAM-8 fix: boundary changed from close > 1000 to close >= 1000 to capture
 * rows where close is exactly 1000 (e.g. VNH 2026-06-12 open=0.9, close=1000.0).
 */
const CONTAM_WHERE = [
  "(open < 100 OR low < 100)",
  "AND close >= 1000",
  "AND open > 0",
  "AND low > 0",
  "AND NOT (open = 0 AND low = 0 AND high = 0 AND close = 0)",
].join(" ");

const SQL = {
  countContam: `SELECT COUNT(*) AS cnt FROM daily_ohlcv WHERE ${CONTAM_WHERE}`,
  countZero: `SELECT COUNT(*) AS cnt FROM daily_ohlcv WHERE open = 0 AND low = 0 AND high = 0 AND close = 0`,
  sampleContam: `
    SELECT code, date, open, high, low, close, data_env
    FROM daily_ohlcv WHERE ${CONTAM_WHERE}
    ORDER BY date DESC, code LIMIT 5
  `,
  update: `
    UPDATE daily_ohlcv
    SET
      open = CASE WHEN open < 100 AND open > 0 THEN open * 1000 ELSE open END,
      low  = CASE WHEN low  < 100 AND low  > 0 THEN low  * 1000 ELSE low  END
    WHERE ${CONTAM_WHERE}
  `,
  postVerify: `
    SELECT code, date, open, high, low, close, data_env
    FROM daily_ohlcv
    WHERE code IN ('VNH','FPT','TRA','PVI')
    ORDER BY code, date DESC LIMIT 20
  `,
};

// ─────────────────────────────────────────────────────────────────────────────
// Core repair function (exported for tests)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the OHLCV unit contamination repair against the given Database instance.
 *
 * - If dryRun=true: counts + samples only, no writes.
 * - If dryRun=false: executes UPDATE inside a transaction.
 *
 * Safe to call on :memory: for unit tests.
 * Throws on SQL error (caller handles exit code).
 */
export function runRepair(db: Database, opts: RepairOptions): RepairResult {
  const log = opts.logger ?? ((msg: string) => console.log(msg));

  // Count all-zero rows (separate defect — informational only)
  const zeroResult = db.query<{ cnt: number }, []>(SQL.countZero).get();
  const zeroCount = zeroResult?.cnt ?? 0;
  log(`[repair-ohlcv] All-zero rows (SEPARATE defect — skipped): ${zeroCount}`);

  // Count contaminated rows
  const countResult = db.query<{ cnt: number }, []>(SQL.countContam).get();
  const contamCount = countResult?.cnt ?? 0;
  log(`[repair-ohlcv] Contaminated rows to repair: ${contamCount}`);

  // Sample before
  const sampleBefore = db.query<ContaminatedRow, []>(SQL.sampleContam).all();
  if (sampleBefore.length > 0) {
    log(`[repair-ohlcv] Sample contaminated rows (before):`);
    for (const row of sampleBefore) {
      const openAfter = row.open < 100 && row.open > 0 ? row.open * 1000 : row.open;
      const lowAfter  = row.low  < 100 && row.low  > 0 ? row.low  * 1000 : row.low;
      log(
        `  ${row.code} ${row.date}: open=${row.open}→${openAfter} low=${row.low}→${lowAfter} close=${row.close} data_env=${row.data_env ?? "null"}`
      );
    }
  }

  if (opts.dryRun) {
    log(`[repair-ohlcv] DRY-RUN complete — no changes written.`);
    return {
      contaminated_count: contamCount,
      zero_rows_skipped: zeroCount,
      rows_updated: 0,
      sample_before: sampleBefore,
      sample_after: [],
    };
  }

  // Live: execute UPDATE in transaction
  let rowsUpdated = 0;
  db.exec("BEGIN IMMEDIATE");
  try {
    const stmt = db.prepare(SQL.update);
    const result = stmt.run();
    rowsUpdated = result.changes;
    db.exec("COMMIT");
    log(`[repair-ohlcv] UPDATE committed: ${rowsUpdated} rows changed`);
  } catch (err) {
    try { db.exec("ROLLBACK"); } catch { /* ignore */ }
    throw err;
  }

  // Post-update verification sample
  const sampleAfter = db.query<ContaminatedRow, []>(SQL.postVerify).all();
  log(`[repair-ohlcv] Post-repair sample (VNH/FPT/TRA/PVI):`);
  for (const row of sampleAfter) {
    log(`  ${row.code} ${row.date}: open=${row.open} high=${row.high} low=${row.low} close=${row.close}`);
  }

  // Remaining contamination check (expect 0)
  const remainResult = db.query<{ cnt: number }, []>(SQL.countContam).get();
  const remainCount = remainResult?.cnt ?? 0;
  log(`[repair-ohlcv] Remaining contaminated rows: ${remainCount} (expect 0)`);
  if (remainCount > 0) {
    log(`[repair-ohlcv] WARNING: ${remainCount} rows still contaminated after UPDATE!`);
  } else {
    log(`[repair-ohlcv] OK: no contaminated rows remain (excluding all-zero defect)`);
  }

  return {
    contaminated_count: contamCount,
    zero_rows_skipped: zeroCount,
    rows_updated: rowsUpdated,
    sample_before: sampleBefore,
    sample_after: sampleAfter,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI entry point
// ─────────────────────────────────────────────────────────────────────────────

// Guard: only run main() when executed directly, not when imported by tests
if (import.meta.main) {
  const args = process.argv.slice(2);
  const isLive = args.includes("--live");
  const isDryRun = !isLive;

  const PROJECT_ROOT = resolve(import.meta.dir, "..", "..");
  const DB_PATH = Bun.env["DB_PATH"] ?? resolve(PROJECT_ROOT, "data", "market.db");
  const LOG_PATH = resolve(PROJECT_ROOT, "repair-ohlcv-unit-contamination.log");

  function log(msg: string): void {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(line);
    try {
      appendFileSync(LOG_PATH, line + "\n");
    } catch {
      // non-fatal
    }
  }

  async function main(): Promise<void> {
    log(`[repair-ohlcv] mode=${isLive ? "LIVE" : "DRY-RUN"}`);
    log(`[repair-ohlcv] DB_PATH=${DB_PATH}`);

    if (!existsSync(DB_PATH)) {
      log(`[repair-ohlcv] ERROR: DB not found at ${DB_PATH}`);
      log(`[repair-ohlcv] For live named volume, run via docker exec:`);
      log(`[repair-ohlcv]   docker cp scripts/migrations/repair-ohlcv-unit-contamination.ts \\`);
      log(`[repair-ohlcv]     vn-market-intelligence-mcp-mcp-server-1:/app/repair-ohlcv-migration.ts`);
      log(`[repair-ohlcv]   docker exec -it vn-market-intelligence-mcp-mcp-server-1 \\`);
      log(`[repair-ohlcv]     bun run /app/repair-ohlcv-migration.ts --dry-run`);
      process.exit(1);
    }

    let db: Database;
    try {
      db = new Database(DB_PATH, { readwrite: isLive, readonly: isDryRun });
    } catch (err) {
      log(`[repair-ohlcv] ERROR: Cannot open DB: ${err}`);
      process.exit(1);
    }

    try {
      if (isLive) {
        // Count first for the prompt
        const countResult = db.query<{ cnt: number }, []>(SQL.countContam).get();
        const contamCount = countResult?.cnt ?? 0;
        log(`[repair-ohlcv] Contaminated rows to repair: ${contamCount}`);

        if (contamCount === 0) {
          log(`[repair-ohlcv] No contaminated rows — table already clean. DONE.`);
          db.close();
          return;
        }

        // Confirm before write
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        const confirmed = await new Promise<boolean>((resolve) => {
          rl.question(
            `About to normalize ${contamCount} rows (open*1000, low*1000). Continue? (yes/no): `,
            (answer) => {
              rl.close();
              resolve(answer.trim().toLowerCase() === "yes");
            }
          );
        });

        if (!confirmed) {
          log(`[repair-ohlcv] Aborted by user.`);
          db.close();
          process.exit(2);
        }
      }

      const result = runRepair(db, { dryRun: isDryRun, logger: log });

      if (isDryRun) {
        log(`[repair-ohlcv] DRY-RUN: would update ${result.contaminated_count} rows.`);
        log(`[repair-ohlcv] Re-run with --live to execute.`);
      } else {
        log(
          `[repair-ohlcv] DONE: ${result.rows_updated} rows normalized. Remaining contamination: ${result.contaminated_count - result.rows_updated}.`
        );
      }

      db.close();
    } catch (err) {
      log(`[repair-ohlcv] FATAL: ${err}`);
      try { db.close(); } catch { /* ignore */ }
      process.exit(1);
    }
  }

  main().catch((err) => {
    console.error(`[repair-ohlcv] Unhandled rejection: ${err}`);
    process.exit(1);
  });
}
