#!/usr/bin/env bun
/**
 * scripts/migrations/repair-ohlcv-unit-contamination-wholerow-lt1000.ts
 *
 * Repair OHLCV rows where ALL four OHLC fields are stored in thousands-VND
 * scale (whole-row contamination). Affects stocks like FPT (~130,000 VND real)
 * stored as ~130, DHG (~75,000 VND) stored as ~75, VHM (~45,000 VND) stored as ~45.
 *
 * CONTAM-6 (repair-ohlcv-unit-contamination.ts) is BLIND to this class:
 *   - CONTAM-6 predicate requires close >= 1000 → FALSE for whole-row contamination.
 *   - Even if CONTAM-6 matched, it only multiplies open+low; close+high stay wrong.
 *
 * Root cause analysis:
 *   docs/architecture-briefs/2026-06-30-OHLCV-UNIT-CONTAM-WHOLEROW-LT1000.md
 *
 * PREDICATE: per-ticker anchor (NOT blind close<1000).
 *   Anchor = most recent bar per ticker in last 180 days with:
 *     close >= 1000 AND volume > 0
 *   A bar is contaminated when:
 *     anchor_close / bar.close >= 100  AND  bar.close < 1000
 *   Rationale: a legitimate stock cannot move 100x vs its own 180-day reference
 *   without a stock split that would appear in adjusted prices. The 100x threshold
 *   (not 1000x) gives headroom for large legitimate moves while remaining far below
 *   the expected ×1000 contamination class.
 *
 * FIX: Whole-row ×1000 — all four fields (open, high, low, close).
 *
 * INDEX_TICKERS exclusion:
 *   VNINDEX, VN30, HNXINDEX, HNX30, UPCOMINDEX are excluded from BOTH anchor
 *   selection AND candidate detection. Mirrors ohlcvSanityCheckJob.ts INDEX_TICKERS.
 *   RC3 and other newly-backfilled stocks are handled by the per-ticker anchor:
 *     no clean anchor found → skip → safe.
 *
 * RF-3 (race guard): Run during off-hours — outside VN trading hours
 *   02:00–09:00 UTC (09:00–16:00 ICT) to avoid racing with live writers.
 * RF-5 (data_env): data_env is preserved — not touched in UPDATE.
 * RF-6 (updated_at): refreshed to datetime('now') after UPDATE.
 *
 * CANONICAL SCRIPT — pointer lives in:
 *   docs/policies/dev-standards.md § Script Persistence (CONTAM-10-WHOLEROW-LT1000)
 *
 * Usage:
 *   # Dry-run (default — no DB write):
 *   bun run scripts/migrations/repair-ohlcv-unit-contamination-wholerow-lt1000.ts --dry-run
 *
 *   # Live-run (prompts before writing):
 *   bun run scripts/migrations/repair-ohlcv-unit-contamination-wholerow-lt1000.ts --live
 *
 * Against live named volume (docker exec — recommended):
 *   docker cp scripts/migrations/repair-ohlcv-unit-contamination-wholerow-lt1000.ts \
 *     vn-market-intelligence-mcp-mcp-server-1:/app/repair-ohlcv-wholerow.ts
 *   docker exec -it vn-market-intelligence-mcp-mcp-server-1 \
 *     bun run /app/repair-ohlcv-wholerow.ts --dry-run
 *   docker exec -it vn-market-intelligence-mcp-mcp-server-1 \
 *     bun run /app/repair-ohlcv-wholerow.ts --live
 *
 * Environment:
 *   DB_PATH — override DB path (default: data/market.db relative to repo root)
 *
 * Exit codes:
 *   0 — success (dry-run or live)
 *   1 — SQL error or DB open failure
 *   2 — user aborted (live mode, answered anything other than "yes")
 */

import { Database } from "bun:sqlite";
import { existsSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";

// ─────────────────────────────────────────────────────────────────────────────
// Constants (exported for test imports)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Known index tickers — excluded from BOTH anchor query and candidate detection.
 * Mirrors the constant in:
 *   apps/mcp-server/src/scheduler/market-data/ohlcvSanityCheckJob.ts (lines ~61-62)
 *
 * VNINDEX legitimately trades ~1300–1900 and RC3 is NOT in this list (handled by
 * per-ticker anchor logic: no anchor → skip).
 */
export const INDEX_TICKERS = new Set([
  "VNINDEX",
  "VN30",
  "HNXINDEX",
  "HNX30",
  "UPCOMINDEX",
]);

// Inline SQL IN-list (fixed constant — not user input, no injection risk)
const INDEX_TICKERS_SQL = [...INDEX_TICKERS].map((t) => `'${t}'`).join(",");

// ─────────────────────────────────────────────────────────────────────────────
// Types (exported for test imports)
// ─────────────────────────────────────────────────────────────────────────────

export interface WholeRowCandidate {
  code: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  anchor_close: number;
  ratio: number;
}

export interface PerTickerSummary {
  code: string;
  row_count: number;
  first_date: string;
  last_date: string;
  anchor_close: number;
}

export interface WholeRowRepairResult {
  /** Total contaminated rows across all tickers */
  candidate_count: number;
  /** Number of distinct tickers with contaminated rows */
  ticker_count: number;
  /** Rows actually updated (0 in dry-run) */
  rows_updated: number;
  /** Per-ticker summary (code, date range, anchor_close, row_count) */
  per_ticker: PerTickerSummary[];
  /** Sample contaminated rows (up to 15) for human review */
  sample_before: WholeRowCandidate[];
  /** Remaining contaminated count after UPDATE (expect 0 on live run) */
  remaining_count: number;
}

export interface WholeRowRepairOptions {
  /** If true: count + sample only, no writes. Default: true */
  dryRun: boolean;
  /** Optional logger — defaults to console.log. Pass no-op in tests to suppress output. */
  logger?: (msg: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// SQL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Common CTE block used in all queries:
 *
 * anchor CTE — most recent bar per non-index ticker with close >= 1000 AND volume > 0
 *   within the last 180 days. ROW_NUMBER() OVER (PARTITION BY code ORDER BY date DESC)
 *   picks the freshest clean reference close.
 *
 * candidates CTE — rows where anchor_close / bar.close >= 100 AND bar.close < 1000.
 *   All four OHLC fields must be > 0 (excludes all-zero defect rows).
 *   Index tickers excluded again (belt-and-suspenders).
 */
const CANDIDATES_CTE = `
WITH anchor AS (
  SELECT code, close AS anchor_close
  FROM (
    SELECT code, close,
           ROW_NUMBER() OVER (PARTITION BY code ORDER BY date DESC) AS rn
    FROM daily_ohlcv
    WHERE close >= 1000
      AND volume > 0
      AND date >= date('now', '-180 days')
      AND code NOT IN (${INDEX_TICKERS_SQL})
  ) ranked
  WHERE rn = 1
),
candidates AS (
  SELECT d.code, d.date, d.open, d.high, d.low, d.close,
         a.anchor_close,
         CAST(a.anchor_close AS REAL) / d.close AS ratio
  FROM daily_ohlcv d
  INNER JOIN anchor a ON a.code = d.code
  WHERE d.close > 0
    AND d.close < 1000
    AND d.open  > 0
    AND d.high  > 0
    AND d.low   > 0
    AND CAST(a.anchor_close AS REAL) / d.close >= 100
    AND d.code NOT IN (${INDEX_TICKERS_SQL})
    AND NOT (d.open = 0 AND d.low = 0 AND d.high = 0 AND d.close = 0)
)`;

const SQL = {
  /** Count all candidate (contaminated) rows across all tickers */
  countCandidates: `${CANDIDATES_CTE}
SELECT COUNT(*) AS cnt FROM candidates`,

  /** Per-ticker summary: code, row_count, date range, anchor_close used for detection */
  perTickerSummary: `${CANDIDATES_CTE}
SELECT code,
       COUNT(*)    AS row_count,
       MIN(date)   AS first_date,
       MAX(date)   AS last_date,
       anchor_close
FROM candidates
GROUP BY code, anchor_close
ORDER BY code`,

  /** Sample contaminated rows (up to 15) for dry-run human review */
  sampleCandidates: `${CANDIDATES_CTE}
SELECT code, date, open, high, low, close, anchor_close, ratio
FROM candidates
ORDER BY code, date DESC
LIMIT 15`,

  /**
   * Whole-row ×1000 UPDATE using the same CTE.
   * Requires SQLite >= 3.35.0 (CTEs in DML) — satisfied by Bun's bundled SQLite.
   * data_env is NOT in the SET clause (RF-5 preserved).
   * updated_at refreshed to datetime('now') (RF-6).
   */
  update: `${CANDIDATES_CTE}
UPDATE daily_ohlcv
SET open       = open  * 1000,
    high       = high  * 1000,
    low        = low   * 1000,
    close      = close * 1000,
    updated_at = datetime('now')
WHERE (code, date) IN (SELECT code, date FROM candidates)`,

  /** Post-verify: re-run candidate detection, expect count = 0 */
  postVerify: `${CANDIDATES_CTE}
SELECT COUNT(*) AS cnt FROM candidates`,
};

// ─────────────────────────────────────────────────────────────────────────────
// Core repair function (exported for tests)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the whole-row OHLCV unit contamination repair against the given Database.
 *
 * - dryRun=true  → count + per-ticker summary + sample only; no writes.
 * - dryRun=false → count + summary + sample; then BEGIN IMMEDIATE UPDATE; post-verify.
 *
 * Safe to call on :memory: for unit tests.
 * Throws on SQL error (caller handles exit code).
 */
export function runRepair(db: Database, opts: WholeRowRepairOptions): WholeRowRepairResult {
  const log = opts.logger ?? ((msg: string) => console.log(msg));

  // Count contaminated rows
  const countResult = db.query<{ cnt: number }, []>(SQL.countCandidates).get();
  const candidateCount = countResult?.cnt ?? 0;
  log(`[repair-wholerow] Contaminated rows to repair: ${candidateCount}`);

  // Per-ticker summary (code, date range, anchor_close)
  const perTicker = db.query<PerTickerSummary, []>(SQL.perTickerSummary).all();

  if (perTicker.length > 0) {
    log(`[repair-wholerow] Per-ticker summary (anchor_close = most recent clean bar):`);
    for (const t of perTicker) {
      log(
        `  ${t.code}: ${t.row_count} rows (${t.first_date}..${t.last_date})` +
        ` anchor_close=${t.anchor_close}`
      );
    }
  } else {
    log(`[repair-wholerow] No contaminated tickers found.`);
  }

  // Sample contaminated rows before repair
  const sampleBefore = db.query<WholeRowCandidate, []>(SQL.sampleCandidates).all();
  if (sampleBefore.length > 0) {
    log(`[repair-wholerow] Sample contaminated rows (before — up to 15):`);
    for (const row of sampleBefore) {
      log(
        `  ${row.code} ${row.date}:` +
        ` open=${row.open}→${row.open * 1000}` +
        ` high=${row.high}→${row.high * 1000}` +
        ` low=${row.low}→${row.low * 1000}` +
        ` close=${row.close}→${row.close * 1000}` +
        ` | anchor_close=${row.anchor_close} ratio=${row.ratio.toFixed(1)}`
      );
    }
  }

  if (opts.dryRun) {
    log(`[repair-wholerow] DRY-RUN complete — no changes written.`);
    log(`[repair-wholerow] Re-run with --live to execute.`);
    return {
      candidate_count: candidateCount,
      ticker_count: perTicker.length,
      rows_updated: 0,
      per_ticker: perTicker,
      sample_before: sampleBefore,
      remaining_count: candidateCount, // unchanged in dry-run
    };
  }

  // Live: execute whole-row ×1000 UPDATE inside BEGIN IMMEDIATE transaction
  let rowsUpdated = 0;
  db.exec("BEGIN IMMEDIATE");
  try {
    const stmt = db.prepare(SQL.update);
    const result = stmt.run();
    rowsUpdated = result.changes;
    db.exec("COMMIT");
    log(`[repair-wholerow] UPDATE committed: ${rowsUpdated} rows changed`);
  } catch (err) {
    try { db.exec("ROLLBACK"); } catch { /* ignore rollback error */ }
    throw err;
  }

  // Post-verify: re-run candidate detection — expect 0 remaining
  const remainResult = db.query<{ cnt: number }, []>(SQL.postVerify).get();
  const remainCount = remainResult?.cnt ?? 0;
  log(`[repair-wholerow] Remaining contaminated rows: ${remainCount} (expect 0)`);
  if (remainCount > 0) {
    log(
      `[repair-wholerow] WARNING: ${remainCount} rows still contaminated after UPDATE!` +
      ` Run dry-run again to inspect anchor values.`
    );
  } else {
    log(`[repair-wholerow] OK: no contaminated rows remain.`);
  }

  return {
    candidate_count: candidateCount,
    ticker_count: perTicker.length,
    rows_updated: rowsUpdated,
    per_ticker: perTicker,
    sample_before: sampleBefore,
    remaining_count: remainCount,
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
  const LOG_PATH = resolve(PROJECT_ROOT, "repair-ohlcv-wholerow-contam-lt1000.log");

  function log(msg: string): void {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(line);
    try {
      appendFileSync(LOG_PATH, line + "\n");
    } catch {
      // non-fatal: log write failure does not abort the repair
    }
  }

  async function main(): Promise<void> {
    log(`[repair-wholerow] mode=${isLive ? "LIVE" : "DRY-RUN"}`);
    log(`[repair-wholerow] DB_PATH=${DB_PATH}`);

    if (!existsSync(DB_PATH)) {
      log(`[repair-wholerow] ERROR: DB not found at ${DB_PATH}`);
      log(`[repair-wholerow] For live named volume, run via docker exec:`);
      log(
        `[repair-wholerow]   docker cp scripts/migrations/repair-ohlcv-unit-contamination-wholerow-lt1000.ts \\`
      );
      log(
        `[repair-wholerow]     vn-market-intelligence-mcp-mcp-server-1:/app/repair-ohlcv-wholerow.ts`
      );
      log(
        `[repair-wholerow]   docker exec -it vn-market-intelligence-mcp-mcp-server-1 \\`
      );
      log(`[repair-wholerow]     bun run /app/repair-ohlcv-wholerow.ts --dry-run`);
      process.exit(1);
    }

    let db: Database;
    try {
      db = new Database(DB_PATH, { readwrite: isLive, readonly: isDryRun });
    } catch (err) {
      log(`[repair-wholerow] ERROR: Cannot open DB: ${err}`);
      process.exit(1);
    }

    try {
      if (isLive) {
        // Count + per-ticker summary before prompting user
        const countResult = db.query<{ cnt: number }, []>(SQL.countCandidates).get();
        const candidateCount = countResult?.cnt ?? 0;
        const perTicker = db.query<PerTickerSummary, []>(SQL.perTickerSummary).all();

        log(`[repair-wholerow] Contaminated rows to repair: ${candidateCount}`);
        if (perTicker.length > 0) {
          log(`[repair-wholerow] Per-ticker summary:`);
          for (const t of perTicker) {
            log(
              `  ${t.code}: ${t.row_count} rows (${t.first_date}..${t.last_date})` +
              ` anchor_close=${t.anchor_close}`
            );
          }
        }

        if (candidateCount === 0) {
          log(`[repair-wholerow] No contaminated rows — table already clean. DONE.`);
          db.close();
          return;
        }

        // Human confirm gate: require literal "yes" to proceed
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        const confirmed = await new Promise<boolean>((resolve) => {
          rl.question(
            `\nAbout to apply ×1000 to ALL FOUR OHLC fields for ${candidateCount} rows` +
            ` across ${perTicker.length} ticker(s).\n` +
            `Type "yes" to confirm: `,
            (answer) => {
              rl.close();
              resolve(answer.trim().toLowerCase() === "yes");
            }
          );
        });

        if (!confirmed) {
          log(`[repair-wholerow] Aborted by user.`);
          db.close();
          process.exit(2);
        }
      }

      const result = runRepair(db, { dryRun: isDryRun, logger: log });

      if (isDryRun) {
        log(
          `[repair-wholerow] DRY-RUN: would update ${result.candidate_count} rows` +
          ` across ${result.ticker_count} ticker(s). Re-run with --live to execute.`
        );
      } else {
        log(
          `[repair-wholerow] DONE: ${result.rows_updated} rows normalized.` +
          ` Remaining contamination: ${result.remaining_count}.`
        );
      }

      db.close();
    } catch (err) {
      log(`[repair-wholerow] FATAL: ${err}`);
      try { db.close(); } catch { /* ignore */ }
      process.exit(1);
    }
  }

  main().catch((err) => {
    console.error(`[repair-wholerow] Unhandled rejection: ${err}`);
    process.exit(1);
  });
}
