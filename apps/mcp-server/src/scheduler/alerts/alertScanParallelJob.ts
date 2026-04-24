/**
 * alertScanParallelJob — Parallel TA + BB alert scanning (Task 1309c)
 *
 * Runs taAlertScan and bbAlertScan in parallel using Promise.allSettled().
 * Both jobs scan watchlist tickers for technical analysis breakouts every
 * 15 minutes during VN market hours (02:00-08:59 UTC, Mon-Fri).
 *
 * Parallel execution reduces cycle time: if each scan takes 3-5s, parallel
 * reduces from 6-10s sequential to 3-5s concurrent.
 *
 * Error isolation: if one scan fails, the other continues. Each scan is
 * counted in `scanned` and `fired` metrics independently.
 *
 * DDD layer: scheduler — may import from domain/ and infrastructure/.
 * MUST NOT import from application/ or interface/.
 *
 * @module scheduler/alerts/alertScanParallelJob
 */

import { logger } from "../../infrastructure/logger.js";
import { runTaAlertScan } from "../market-data/taAlertScanJob.js";
import { runBbAlertScan } from "./bbAlertScanJob.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Combined result from parallel TA + BB alert scanning. */
export interface ParallelAlertScanResult {
  /** Total tickers scanned (TA + BB combined). */
  totalScanned: number;
  /** Total alerts fired (TA + BB combined). */
  totalFired: number;
  /** TA scan result (or null if failed). */
  taResult: { scanned: number; fired: number } | null;
  /** BB scan result (or null if failed). */
  bbResult: { scanned: number; fired: number } | null;
  /** Duration in milliseconds. */
  durationMs: number;
  /** Whether all scans succeeded. */
  allOk: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run TA and BB alert scans in parallel.
 *
 * @returns Combined result with scanned/fired counts and individual scan results.
 */
export async function runAlertScanParallel(): Promise<ParallelAlertScanResult> {
  const t0 = Date.now();

  // Run both scans in parallel
  const results = await Promise.allSettled([
    runTaAlertScan(),
    runBbAlertScan(),
  ]);

  // Parse results
  const taResult =
    results[0].status === "fulfilled" ? results[0].value : null;
  const bbResult =
    results[1].status === "fulfilled" ? results[1].value : null;

  const durationMs = Date.now() - t0;
  const totalScanned = (taResult?.scanned ?? 0) + (bbResult?.scanned ?? 0);
  const totalFired = (taResult?.fired ?? 0) + (bbResult?.fired ?? 0);
  const allOk = results[0].status === "fulfilled" && results[1].status === "fulfilled";

  // Log summary
  if (allOk && totalFired > 0) {
    logger.info(
      `[alert-scan-parallel] TA scanned=${taResult!.scanned} fired=${taResult!.fired}, ` +
      `BB scanned=${bbResult!.scanned} fired=${bbResult!.fired}, ` +
      `total_fired=${totalFired} [${durationMs}ms]`,
      {
        taResult,
        bbResult,
        durationMs,
      }
    );
  } else if (allOk) {
    logger.debug(`[alert-scan-parallel] No alerts fired [${durationMs}ms]`);
  } else {
    const taFailed = results[0].status === "rejected";
    const bbFailed = results[1].status === "rejected";
    const failedScans = [taFailed && "TA", bbFailed && "BB"].filter(Boolean).join(", ");

    logger.warn(`[alert-scan-parallel] Failed scans: ${failedScans}`, {
      taError: taFailed ? String(results[0].reason) : null,
      bbError: bbFailed ? String(results[1].reason) : null,
      durationMs,
    });
  }

  return {
    totalScanned,
    totalFired,
    taResult,
    bbResult,
    durationMs,
    allOk,
  };
}
