#!/usr/bin/env bun
/**
 * scripts/migrations/repair-ohlcv-unit-contamination-low-zero.ts
 *
 * Repair contaminated OHLCV rows — CONTAM-9 scope (SM-2 + SM-3 + partial-zero open).
 *
 * Defect class A (SM-2 / SM-3): open < 100 AND open > 0 AND close >= 1000 AND low = 0
 *   - open is in thousand-VND scale (leaked from upstream VNDIRECT feed) → multiply ×1000
 *   - low = 0 is an unrecoverable partial-zero → set to ROUND(MIN(open_after_repair, close) * 0.99)
 *     (conservative estimate: 1% below the lower of repaired-open and close)
 *   - 519 rows: 460 pre-CONTAM-2 legacy + 59 inserted 2026-06-12T08:59Z by pre-guard container
 *
 * Defect class B (partial-zero open): open = 0 AND NOT all-zero row
 *   - open was not received from upstream on the first push of the day
 *   - Set open = close (best-effort; open and close are close on most VN trading days)
 *   - 598 rows across all tickers / dates
 *
 * Root cause (confirmed 2026-06-12 CONTAM-9 investigation):
 *   - CONTAM-6 repair heuristic required low > 0 (binding amendment) — correctly excluded
 *     rows where low=0, creating the SM-2/SM-3 scope miss
 *   - CONTAM-2/3/4/5 guards (unit guard) were deployed at 2026-06-12T09:24 UTC, so rows
 *     inserted at 08:59 UTC are from the pre-guard container (not a guard failure)
 *   - The pushPricesHandler MIN(low, excluded.low) ON CONFLICT clause permanently propagates
 *     legacy low=0 values — fixed separately in the writer boundary fix (CONTAM-9 Phase 3)
 *
 * RF-3 (race guard): Run during off-hours — outside VN trading hours
 *   02:00–09:00 UTC (09:00–16:00 ICT) to avoid racing with live writers.
 * RF-5 (data_env): data_env is preserved — not touched in UPDATE.
 *
 * CANONICAL SCRIPT — pointer lives in:
 *   docs/policies/dev-standards.md § Script Persistence (migration)
 *
 * Usage:
 *   # Dry-run (default — no DB write):
 *   bun run scripts/migrations/repair-ohlcv-unit-contamination-low-zero.ts --dry-run
 *
 *   # Live-run (prompts before writing):
 *   bun run scripts/migrations/repair-ohlcv-unit-contamination-low-zero.ts --live
 *
 * Against live named volume (docker exec — recommended):
 *   docker cp scripts/migrations/repair-ohlcv-unit-contamination-low-zero.ts \
 *     vn-market-intelligence-mcp-mcp-server-1:/app/repair-ohlcv-low-zero.ts
 *   docker exec -it vn-market-intelligence-mcp-mcp-server-1 \
 *     bun run /app/repair-ohlcv-low-zero.ts --dry-run
 *   docker exec -it vn-market-intelligence-mcp-mcp-server-1 \
 *     bun run /app/repair-ohlcv-low-zero.ts --live
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

export interface LowZeroRepairResult {
  /** Class A rows: open<100 AND open>0 AND close>=1000 AND low=0 */
  class_a_count: number;
  /** Class B rows: open=0 AND not all-zero */
  class_b_count: number;
  /**
   * Class C rows: low=0 AND close>=1000 AND not all-zero AND not matched by A or B
   * (these are rows with valid open but zero low — caught after A+B pass)
   */
  class_c_count: number;
  /** All-zero rows skipped (separate defect) */
  zero_rows_skipped: number;
  /** Rows updated (0 in dry-run) */
  rows_updated_a: number;
  rows_updated_b: number;
  rows_updated_c: number;
  /** Sample before for class A */
  sample_a_before: ContaminatedRow[];
  /** Sample before for class B */
  sample_b_before: ContaminatedRow[];
}

export interface LowZeroRepairOptions {
  /** If true: count + sample only, no writes. Default: true */
  dryRun: boolean;
  /** Optional logger — defaults to console.log. Pass no-op in tests to suppress output. */
  logger?: (msg: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// SQL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Class A detection: mixed-unit open (thousand-VND scale) with zero low.
 * Excludes all-zero rows (separate defect).
 */
const CLASS_A_WHERE = [
  "open < 100",
  "AND open > 0",
  "AND close >= 1000",
  "AND low = 0",
  "AND NOT (open = 0 AND low = 0 AND high = 0 AND close = 0)",
].join(" ");

/**
 * Class B detection: open = 0 (partial-zero open, not all-zero).
 * Excludes all-zero rows (separate defect).
 */
const CLASS_B_WHERE = [
  "open = 0",
  "AND NOT (open = 0 AND low = 0 AND high = 0 AND close = 0)",
].join(" ");

const SQL = {
  countA: `SELECT COUNT(*) AS cnt FROM daily_ohlcv WHERE ${CLASS_A_WHERE}`,
  countB: `SELECT COUNT(*) AS cnt FROM daily_ohlcv WHERE ${CLASS_B_WHERE}`,
  countZero: `SELECT COUNT(*) AS cnt FROM daily_ohlcv WHERE open = 0 AND low = 0 AND high = 0 AND close = 0`,

  sampleA: `
    SELECT code, date, open, high, low, close, data_env
    FROM daily_ohlcv WHERE ${CLASS_A_WHERE}
    ORDER BY date DESC, code LIMIT 5
  `,
  sampleB: `
    SELECT code, date, open, high, low, close, data_env
    FROM daily_ohlcv WHERE ${CLASS_B_WHERE}
    ORDER BY date DESC, code LIMIT 5
  `,

  /**
   * Class A repair:
   *   open → ROUND(open * 1000, 2)
   *   low  → ROUND(MIN(open*1000, close) * 0.99, 2) — conservative 1% below lower bound
   *           This is the best estimate without network backfill.
   *           low <= min(open_after, close) is guaranteed (1% below).
   */
  updateA: `
    UPDATE daily_ohlcv
    SET
      open = ROUND(open * 1000, 2),
      low  = ROUND(MIN(ROUND(open * 1000, 2), close) * 0.99, 2)
    WHERE ${CLASS_A_WHERE}
  `,

  /**
   * Class B repair:
   *   open → close (best-effort; open ≈ close on most VN trading days)
   *   low stays as-is (cleaned by Class C pass after this)
   */
  updateB: `
    UPDATE daily_ohlcv
    SET open = close
    WHERE ${CLASS_B_WHERE}
  `,

  /**
   * Class C detection: any remaining low=0 with close>=1000 (not all-zero).
   * Catches rows where open was 0→fixed by B but low is still 0, plus other low=0 patterns.
   * Run AFTER A and B updates in the same transaction.
   */
  countC: `
    SELECT COUNT(*) AS cnt FROM daily_ohlcv
    WHERE low = 0
      AND close >= 1000
      AND NOT (open = 0 AND low = 0 AND high = 0 AND close = 0)
  `,
  /**
   * Class C repair:
   *   low → ROUND(close * 0.99, 2) — conservative 1% below close
   *   Applied to all remaining low=0 rows after A+B have run.
   */
  updateC: `
    UPDATE daily_ohlcv
    SET low = ROUND(close * 0.99, 2)
    WHERE low = 0
      AND close >= 1000
      AND NOT (open = 0 AND low = 0 AND high = 0 AND close = 0)
  `,

  postVerifyA: `
    SELECT COUNT(*) AS cnt FROM daily_ohlcv WHERE ${CLASS_A_WHERE}
  `,
  postVerifyB: `
    SELECT COUNT(*) AS cnt FROM daily_ohlcv WHERE ${CLASS_B_WHERE}
  `,
  postVerifyC: `
    SELECT COUNT(*) AS cnt FROM daily_ohlcv
    WHERE low = 0 AND close >= 1000
      AND NOT (open = 0 AND low = 0 AND high = 0 AND close = 0)
  `,
};

// ─────────────────────────────────────────────────────────────────────────────
// Core repair function (exported for tests)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the OHLCV low-zero / partial-zero contamination repair.
 *
 * Three-pass repair in a single transaction:
 *   A: mixed-unit open (open<100 AND open>0 AND close>=1000 AND low=0) → open*1000, low=estimate
 *   B: partial-zero open (open=0, not all-zero) → open=close
 *   C: remaining low=0 rows (close>=1000, not all-zero, after A+B) → low=ROUND(close*0.99,2)
 *
 * - If dryRun=true: counts + samples only, no writes.
 * - If dryRun=false: executes all three UPDATEs inside a single transaction.
 *
 * Safe to call on :memory: for unit tests.
 * Throws on SQL error (caller handles exit code).
 */
export function runLowZeroRepair(
  db: Database,
  opts: LowZeroRepairOptions
): LowZeroRepairResult {
  const log = opts.logger ?? ((msg: string) => console.log(msg));

  // Count all-zero rows (separate defect — informational only)
  const zeroResult = db.query<{ cnt: number }, []>(SQL.countZero).get();
  const zeroCount = zeroResult?.cnt ?? 0;
  log(`[repair-low-zero] All-zero rows (SEPARATE defect — skipped): ${zeroCount}`);

  // Count class A
  const countA = db.query<{ cnt: number }, []>(SQL.countA).get()?.cnt ?? 0;
  log(`[repair-low-zero] Class A (mixed-unit open + low=0) rows: ${countA}`);

  // Count class B
  const countB = db.query<{ cnt: number }, []>(SQL.countB).get()?.cnt ?? 0;
  log(`[repair-low-zero] Class B (open=0 partial-zero) rows: ${countB}`);

  // Count class C (includes overlap with B — all low=0 with valid close)
  const countC = db.query<{ cnt: number }, []>(SQL.countC).get()?.cnt ?? 0;
  log(`[repair-low-zero] Class C (remaining low=0 with close>=1000) rows: ${countC}`);

  // Sample class A before
  const sampleA = db.query<ContaminatedRow, []>(SQL.sampleA).all();
  if (sampleA.length > 0) {
    log(`[repair-low-zero] Sample Class A (before):`);
    for (const row of sampleA) {
      const openAfter = Math.round(row.open * 1000 * 100) / 100;
      const closeVal = row.close;
      const lowAfter = Math.round(Math.min(openAfter, closeVal) * 0.99 * 100) / 100;
      log(
        `  ${row.code} ${row.date}: open=${row.open}→${openAfter} low=${row.low}→${lowAfter} close=${row.close}`
      );
    }
  }

  // Sample class B before
  const sampleB = db.query<ContaminatedRow, []>(SQL.sampleB).all();
  if (sampleB.length > 0) {
    log(`[repair-low-zero] Sample Class B (before):`);
    for (const row of sampleB) {
      log(
        `  ${row.code} ${row.date}: open=${row.open}→${row.close} high=${row.high} low=${row.low} close=${row.close}`
      );
    }
  }

  if (opts.dryRun) {
    log(`[repair-low-zero] DRY-RUN complete — no changes written.`);
    return {
      class_a_count: countA,
      class_b_count: countB,
      class_c_count: countC,
      zero_rows_skipped: zeroCount,
      rows_updated_a: 0,
      rows_updated_b: 0,
      rows_updated_c: 0,
      sample_a_before: sampleA,
      sample_b_before: sampleB,
    };
  }

  // Live: execute all three UPDATEs in a single transaction (A → B → C)
  let rowsUpdatedA = 0;
  let rowsUpdatedB = 0;
  let rowsUpdatedC = 0;

  db.exec("BEGIN IMMEDIATE");
  try {
    const stmtA = db.prepare(SQL.updateA);
    const resultA = stmtA.run();
    rowsUpdatedA = resultA.changes;
    log(`[repair-low-zero] Class A UPDATE: ${rowsUpdatedA} rows changed`);

    const stmtB = db.prepare(SQL.updateB);
    const resultB = stmtB.run();
    rowsUpdatedB = resultB.changes;
    log(`[repair-low-zero] Class B UPDATE: ${rowsUpdatedB} rows changed`);

    const stmtC = db.prepare(SQL.updateC);
    const resultC = stmtC.run();
    rowsUpdatedC = resultC.changes;
    log(`[repair-low-zero] Class C UPDATE: ${rowsUpdatedC} rows changed`);

    db.exec("COMMIT");
    log(`[repair-low-zero] Transaction committed`);
  } catch (err) {
    try { db.exec("ROLLBACK"); } catch { /* ignore */ }
    throw err;
  }

  // Post-update verification
  const remainA = db.query<{ cnt: number }, []>(SQL.postVerifyA).get()?.cnt ?? 0;
  log(`[repair-low-zero] Remaining Class A rows: ${remainA} (expect 0)`);
  if (remainA > 0) {
    log(`[repair-low-zero] WARNING: ${remainA} Class A rows still contaminated!`);
  } else {
    log(`[repair-low-zero] OK: no Class A rows remain`);
  }

  const remainB = db.query<{ cnt: number }, []>(SQL.postVerifyB).get()?.cnt ?? 0;
  log(`[repair-low-zero] Remaining Class B rows: ${remainB} (expect 0)`);
  if (remainB > 0) {
    log(`[repair-low-zero] WARNING: ${remainB} Class B rows still contaminated!`);
  } else {
    log(`[repair-low-zero] OK: no Class B rows remain`);
  }

  const remainC = db.query<{ cnt: number }, []>(SQL.postVerifyC).get()?.cnt ?? 0;
  log(`[repair-low-zero] Remaining Class C (low=0 + close>=1000): ${remainC} (expect 0)`);
  if (remainC > 0) {
    log(`[repair-low-zero] WARNING: ${remainC} low=0 rows still in DB!`);
  } else {
    log(`[repair-low-zero] OK: no low=0 rows remain (for close>=1000 stocks)`);
  }

  return {
    class_a_count: countA,
    class_b_count: countB,
    class_c_count: countC,
    zero_rows_skipped: zeroCount,
    rows_updated_a: rowsUpdatedA,
    rows_updated_b: rowsUpdatedB,
    rows_updated_c: rowsUpdatedC,
    sample_a_before: sampleA,
    sample_b_before: sampleB,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI entry point
// ─────────────────────────────────────────────────────────────────────────────

if (import.meta.main) {
  const args = process.argv.slice(2);
  const isLive = args.includes("--live");
  const isDryRun = !isLive;

  const PROJECT_ROOT = resolve(import.meta.dir, "..", "..");
  const DB_PATH = Bun.env["DB_PATH"] ?? resolve(PROJECT_ROOT, "data", "market.db");
  const LOG_PATH = resolve(PROJECT_ROOT, "repair-ohlcv-low-zero.log");

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
    log(`[repair-low-zero] mode=${isLive ? "LIVE" : "DRY-RUN"}`);
    log(`[repair-low-zero] DB_PATH=${DB_PATH}`);

    if (!existsSync(DB_PATH)) {
      log(`[repair-low-zero] ERROR: DB not found at ${DB_PATH}`);
      log(`[repair-low-zero] For live named volume, run via docker exec:`);
      log(`[repair-low-zero]   docker cp scripts/migrations/repair-ohlcv-unit-contamination-low-zero.ts \\`);
      log(`[repair-low-zero]     vn-market-intelligence-mcp-mcp-server-1:/app/repair-ohlcv-low-zero.ts`);
      log(`[repair-low-zero]   docker exec -it vn-market-intelligence-mcp-mcp-server-1 \\`);
      log(`[repair-low-zero]     bun run /app/repair-ohlcv-low-zero.ts --dry-run`);
      process.exit(1);
    }

    let db: Database;
    try {
      db = new Database(DB_PATH, { readwrite: isLive, readonly: isDryRun });
    } catch (err) {
      log(`[repair-low-zero] ERROR: Cannot open DB: ${err}`);
      process.exit(1);
    }

    try {
      const countAResult = db.query<{ cnt: number }, []>(
        `SELECT COUNT(*) AS cnt FROM daily_ohlcv WHERE open < 100 AND open > 0 AND close >= 1000 AND low = 0 AND NOT (open = 0 AND low = 0 AND high = 0 AND close = 0)`
      ).get();
      const countBResult = db.query<{ cnt: number }, []>(
        `SELECT COUNT(*) AS cnt FROM daily_ohlcv WHERE open = 0 AND NOT (open = 0 AND low = 0 AND high = 0 AND close = 0)`
      ).get();
      const countCResult = db.query<{ cnt: number }, []>(
        `SELECT COUNT(*) AS cnt FROM daily_ohlcv WHERE low = 0 AND close >= 1000 AND NOT (open = 0 AND low = 0 AND high = 0 AND close = 0)`
      ).get();
      const countA = countAResult?.cnt ?? 0;
      const countB = countBResult?.cnt ?? 0;
      const countC = countCResult?.cnt ?? 0;

      log(`[repair-low-zero] Class A (mixed-unit open + low=0): ${countA} rows`);
      log(`[repair-low-zero] Class B (partial-zero open=0): ${countB} rows`);
      log(`[repair-low-zero] Class C (remaining low=0 with close>=1000): ${countC} rows`);

      if (countA === 0 && countB === 0 && countC === 0) {
        log(`[repair-low-zero] No contaminated rows — table already clean. DONE.`);
        db.close();
        return;
      }

      if (isLive) {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        const confirmed = await new Promise<boolean>((resolve) => {
          rl.question(
            `About to repair ${countA} Class A + ${countB} Class B + ${countC} Class C rows. Continue? (yes/no): `,
            (answer) => {
              rl.close();
              resolve(answer.trim().toLowerCase() === "yes");
            }
          );
        });

        if (!confirmed) {
          log(`[repair-low-zero] Aborted by user.`);
          db.close();
          process.exit(2);
        }
      }

      const result = runLowZeroRepair(db, { dryRun: isDryRun, logger: log });

      if (isDryRun) {
        log(`[repair-low-zero] DRY-RUN: would update ${result.class_a_count} Class A + ${result.class_b_count} Class B + ${result.class_c_count} Class C rows.`);
        log(`[repair-low-zero] Re-run with --live to execute.`);
      } else {
        log(
          `[repair-low-zero] DONE: A=${result.rows_updated_a}, B=${result.rows_updated_b}, C=${result.rows_updated_c}.`
        );
      }

      db.close();
    } catch (err) {
      log(`[repair-low-zero] FATAL: ${err}`);
      try { db.close(); } catch { /* ignore */ }
      process.exit(1);
    }
  }

  main().catch((err) => {
    console.error(`[repair-low-zero] Unhandled rejection: ${err}`);
    process.exit(1);
  });
}
