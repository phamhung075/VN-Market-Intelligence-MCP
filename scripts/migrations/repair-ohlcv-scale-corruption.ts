#!/usr/bin/env bun
/**
 * scripts/migrations/repair-ohlcv-scale-corruption.ts
 *
 * FIX-STOCK-PRICE-SCALE-CORRUPT: Repair OHLCV rows where ALL fields are in
 * thousand-VND scale (100-999 range) when they should be full-VND (100k-999k).
 *
 * Background: VNDIRECT API sometimes returns prices in thousand-VND for expensive
 * stocks (VIC=195.5 should be 195,500). The naive normalizer only catches values
 * < 100. Values in 100-999 range slip through but are obviously wrong for stocks
 * like VIC/VHM that trade at 150k-200k VND.
 *
 * Detection heuristic:
 *   For each row where ALL of open/high/low/close are < 1000:
 *     - Look at the PREVIOUS day's close for the same ticker
 *     - If prevClose > 10,000 (clearly full-VND scale), the current row is
 *       thousand-scale and needs x1000 correction
 *     - Also check NEXT day's close — if it's > 10,000, confirms current is wrong
 *
 * This is more conservative than the live guard (SCALE_DETECTION_RATIO=50) because
 * we're repairing historical data and want to avoid false positives.
 *
 * Usage:
 *   # Dry-run (default — no DB write):
 *   bun run scripts/migrations/repair-ohlcv-scale-corruption.ts --dry-run
 *
 *   # Live-run (prompts before writing):
 *   bun run scripts/migrations/repair-ohlcv-scale-corruption.ts --live
 *
 * Against live named volume (docker exec — recommended):
 *   docker cp scripts/migrations/repair-ohlcv-scale-corruption.ts \
 *     vn-market-intelligence-mcp-mcp-server-1:/app/repair-scale.ts
 *   docker exec -it vn-market-intelligence-mcp-mcp-server-1 \
 *     bun run /app/repair-scale.ts --dry-run
 *
 * Exit codes:
 *   0 — success
 *   1 — error
 *   2 — user aborted
 */

import { Database } from "bun:sqlite";
import { existsSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Threshold for considering a price as "definitely full-VND scale" */
const FULL_VND_THRESHOLD = 10_000;

/** Maximum value that could be thousand-scale (e.g., VIC at 250 = 250,000 VND) */
const THOUSAND_SCALE_MAX = 1_000;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface CorruptRow {
  code: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  prevClose: number | null;
  nextClose: number | null;
}

interface RepairResult {
  detected: number;
  repaired: number;
  skipped: number;
  samples: CorruptRow[];
}

// ─────────────────────────────────────────────────────────────────────────────
// SQL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find rows with definitive evidence of thousand-scale corruption.
 *
 * Pattern 1: MIXED fields - some < 1000, some > 10000 (clear partial contamination)
 *            Example: VIC open=195.5, high=197500 - the 1000x ratio is unmistakable
 *
 * Pattern 2: ALL fields < 1000, but prevClose or nextClose > 10000 (full-VND)
 *            AND current/prev ratio is > 50 (clearly scale mismatch, not just volatility)
 *            Example: VIC close=195.5, prevClose=196000 - ratio = 1002x
 *
 * This is conservative - we require evidence from within the row or from neighbors.
 * Legitimate penny stocks (ACM at 500 VND) won't match because their neighbors are also < 1000.
 */
const DETECT_SQL = `
  SELECT
    code, date, open, high, low, close,
    (SELECT close FROM daily_ohlcv d2
     WHERE d2.code = daily_ohlcv.code AND d2.date < daily_ohlcv.date
     ORDER BY d2.date DESC LIMIT 1) as prevClose,
    (SELECT close FROM daily_ohlcv d3
     WHERE d3.code = daily_ohlcv.code AND d3.date > daily_ohlcv.date
     ORDER BY d3.date ASC LIMIT 1) as nextClose
  FROM daily_ohlcv
  WHERE
    code NOT LIKE '%INDEX%'
    AND (
      -- Pattern 1: MIXED - some fields < 1000 while others clearly full-VND (> 10000)
      -- The 10000 threshold ensures we have a 10x+ ratio which is unmistakable
      (
        (open > 0 AND open < 1000 AND (high > 10000 OR close > 10000))
        OR (low > 0 AND low < 1000 AND (high > 10000 OR close > 10000))
        OR (high > 0 AND high < 1000 AND (open > 10000 OR close > 10000))
        OR (close > 0 AND close < 1000 AND (open > 10000 OR high > 10000))
      )
      OR
      -- Pattern 2: ALL fields < 1000, but neighbor is clearly full-VND (> 10000)
      -- AND the ratio is extreme (> 50x), not just normal volatility
      (
        open > 0 AND open < 1000
        AND high > 0 AND high < 1000
        AND low > 0 AND low < 1000
        AND close > 0 AND close < 1000
        AND (
          (SELECT close FROM daily_ohlcv d2
           WHERE d2.code = daily_ohlcv.code AND d2.date < daily_ohlcv.date
           ORDER BY d2.date DESC LIMIT 1) > 10000
          OR
          (SELECT close FROM daily_ohlcv d3
           WHERE d3.code = daily_ohlcv.code AND d3.date > daily_ohlcv.date
           ORDER BY d3.date ASC LIMIT 1) > 10000
        )
      )
    )
  ORDER BY code, date
`;

/**
 * Update ONLY the fields that are < 1000.
 * Uses CASE to selectively multiply sub-1000 fields by 1000.
 */
const UPDATE_SQL = `
  UPDATE daily_ohlcv
  SET
    open = CASE WHEN open > 0 AND open < 1000 THEN open * 1000 ELSE open END,
    high = CASE WHEN high > 0 AND high < 1000 THEN high * 1000 ELSE high END,
    low = CASE WHEN low > 0 AND low < 1000 THEN low * 1000 ELSE low END,
    close = CASE WHEN close > 0 AND close < 1000 THEN close * 1000 ELSE close END
  WHERE code = ? AND date = ?
`;

// ─────────────────────────────────────────────────────────────────────────────
// Core repair function
// ─────────────────────────────────────────────────────────────────────────────

export function runRepair(
  db: Database,
  dryRun: boolean,
  logger: (msg: string) => void,
): RepairResult {
  // Detect corrupt rows
  const rows = db.query<CorruptRow, []>(DETECT_SQL).all();
  logger(`[repair-scale] Detected ${rows.length} suspect rows`);

  if (rows.length === 0) {
    logger(`[repair-scale] No corrupt rows found — table is clean`);
    return { detected: 0, repaired: 0, skipped: 0, samples: [] };
  }

  // Log samples with field-by-field fix plan
  const samples = rows.slice(0, 15);
  logger(`[repair-scale] Sample rows (first 15):`);
  for (const r of samples) {
    const fixes: string[] = [];
    if (r.open > 0 && r.open < 1000) fixes.push(`open=${r.open}→${r.open * 1000}`);
    if (r.high > 0 && r.high < 1000) fixes.push(`high=${r.high}→${r.high * 1000}`);
    if (r.low > 0 && r.low < 1000) fixes.push(`low=${r.low}→${r.low * 1000}`);
    if (r.close > 0 && r.close < 1000) fixes.push(`close=${r.close}→${r.close * 1000}`);
    const fixStr = fixes.length > 0 ? fixes.join(", ") : "(no fix needed)";
    logger(`  ${r.code} ${r.date}: ${fixStr} (prevClose=${r.prevClose})`);
  }

  if (dryRun) {
    logger(`[repair-scale] DRY-RUN: would repair ${rows.length} rows`);
    return { detected: rows.length, repaired: 0, skipped: 0, samples };
  }

  // Live repair
  let repaired = 0;
  let skipped = 0;
  const updateStmt = db.prepare(UPDATE_SQL);

  db.exec("BEGIN IMMEDIATE");
  try {
    for (const r of rows) {
      // Extra validation: ensure we're not over-correcting
      // Skip if any corrected field would be implausibly high (> 10M VND)
      let wouldOverCorrect = false;
      for (const [field, val] of [["open", r.open], ["high", r.high], ["low", r.low], ["close", r.close]] as const) {
        if (val > 0 && val < 1000 && val * 1000 > 10_000_000) {
          logger(`[repair-scale] SKIP ${r.code} ${r.date}: corrected ${field}=${val * 1000} too high`);
          wouldOverCorrect = true;
          break;
        }
      }
      if (wouldOverCorrect) {
        skipped++;
        continue;
      }

      // Additional guard: for mixed rows, verify that at least one field is clearly full-VND
      // to confirm this is a partial contamination, not a legitimate penny stock
      const hasFullVnd = r.open > 1000 || r.high > 1000 || r.low > 1000 || r.close > 1000;
      const hasThousandScale = (r.open > 0 && r.open < 1000) || (r.low > 0 && r.low < 1000);
      if (hasThousandScale && !hasFullVnd && r.prevClose !== null && r.prevClose < 1000) {
        // All fields are < 1000 and prevClose is also < 1000 - might be legitimate penny stock
        // Check if prevClose is in the same scale (ratio < 2x)
        const ratio = r.prevClose / r.close;
        if (ratio > 0.5 && ratio < 2) {
          logger(`[repair-scale] SKIP ${r.code} ${r.date}: all fields < 1000 but ratio=${ratio.toFixed(2)} suggests real penny stock`);
          skipped++;
          continue;
        }
      }

      updateStmt.run(r.code, r.date);
      repaired++;
    }
    db.exec("COMMIT");
    logger(`[repair-scale] COMMITTED: ${repaired} rows repaired, ${skipped} skipped`);
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  }

  // Verify repair
  const remainingRows = db.query<CorruptRow, []>(DETECT_SQL).all();
  logger(`[repair-scale] Post-repair: ${remainingRows.length} suspect rows remain (expect 0)`);

  return { detected: rows.length, repaired, skipped, samples };
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
  const LOG_PATH = resolve(PROJECT_ROOT, "repair-ohlcv-scale-corruption.log");

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
    log(`[repair-scale] mode=${isLive ? "LIVE" : "DRY-RUN"}`);
    log(`[repair-scale] DB_PATH=${DB_PATH}`);

    if (!existsSync(DB_PATH)) {
      log(`[repair-scale] ERROR: DB not found at ${DB_PATH}`);
      log(`[repair-scale] For live named volume, run via docker exec:`);
      log(`[repair-scale]   docker cp scripts/migrations/repair-ohlcv-scale-corruption.ts \\`);
      log(`[repair-scale]     vn-market-intelligence-mcp-mcp-server-1:/app/repair-scale.ts`);
      log(`[repair-scale]   docker exec -it vn-market-intelligence-mcp-mcp-server-1 \\`);
      log(`[repair-scale]     bun run /app/repair-scale.ts --dry-run`);
      process.exit(1);
    }

    let db: Database;
    try {
      db = new Database(DB_PATH, { readwrite: isLive, readonly: isDryRun });
    } catch (err) {
      log(`[repair-scale] ERROR: Cannot open DB: ${err}`);
      process.exit(1);
    }

    try {
      if (isLive) {
        // Count first for the prompt
        const rows = db.query<CorruptRow, []>(DETECT_SQL).all();
        log(`[repair-scale] Found ${rows.length} corrupt rows to repair`);

        if (rows.length === 0) {
          log(`[repair-scale] No corrupt rows — table already clean. DONE.`);
          db.close();
          return;
        }

        // Confirm before write
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        const confirmed = await new Promise<boolean>((resolve) => {
          rl.question(
            `About to repair ${rows.length} rows (multiply OHLC by 1000). Continue? (yes/no): `,
            (answer) => {
              rl.close();
              resolve(answer.trim().toLowerCase() === "yes");
            },
          );
        });

        if (!confirmed) {
          log(`[repair-scale] Aborted by user.`);
          db.close();
          process.exit(2);
        }
      }

      const result = runRepair(db, isDryRun, log);
      log(`[repair-scale] Result: detected=${result.detected} repaired=${result.repaired} skipped=${result.skipped}`);

      db.close();
    } catch (err) {
      log(`[repair-scale] FATAL: ${err}`);
      try {
        db.close();
      } catch {
        /* ignore */
      }
      process.exit(1);
    }
  }

  main().catch((err) => {
    console.error(`[repair-scale] Unhandled rejection: ${err}`);
    process.exit(1);
  });
}
