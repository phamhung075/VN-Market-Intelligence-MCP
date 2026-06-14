/**
 * diskUsageAlertJob.ts — Hourly LanceDB disk-usage alert cron (task 1959-watchdog-5)
 *
 * Problem:
 *   On 2026-05-20 LanceDB grew to 29 GB, saturating disk (97% full) and triggering
 *   a recovery-hang incident. This job closes the runtime-detection gap: it emits a
 *   BUG Telegram BEFORE the disk re-fills — giving ops hours or days of lead time
 *   rather than minutes.
 *
 * What this job does:
 *   Every hour:
 *     1. Shell-exec `du -sh /app/data/lancedb` → parse to GB
 *     2. If size <= DISK_THRESHOLD_GB → silent, return "ok"
 *     3. If size > DISK_THRESHOLD_GB AND cooldown has expired → send BUG Telegram
 *     4. Throttle: at most ONE BUG alert per 6 h (in-memory state; resets on restart)
 *
 * Design:
 *   - All external dependencies (getDiskUsageGb, notifyBug, now) are injectable
 *     for full test isolation. Production defaults wired at call time.
 *   - Module-level `lastAlertAt` tracks cooldown; cleared by _resetDiskUsageCooldown()
 *     for test isolation.
 *   - Shell-out via Bun.spawnSync (same pattern as other Bun scripts in this codebase).
 *     Falls back to path-not-found error rather than silently returning 0.
 *
 * RCA context: docs/architecture-briefs/2026-05-20-microservice-degraded-rca.md
 * Sprint: 1959 — Watchdog hardening cycle-2
 *
 * @module scheduler/diskUsageAlertJob
 */

import { sendTelegramBug } from "../infrastructure/notifiers/telegram.js";
import { logger } from "../infrastructure/logger.js";
import { shouldSkipRecoveryReplay } from "./startupHelpers.js";

// ── Constants ─────────────────────────────────────────────────────────────────

/** LanceDB path monitored in production Docker container. */
export const LANCEDB_PATH = "/app/data/lancedb";

/**
 * Alert fires when disk usage exceeds this value (exclusive — > not >=).
 *
 * Production default: 20 GB.
 * Override via env: `DISK_ALERT_THRESHOLD_GB=<number>` (smoke-test use only;
 * DO NOT raise above 20 in production — that would suppress real alerts).
 */
export const DISK_THRESHOLD_GB: number = (() => {
  const raw = Bun.env["DISK_ALERT_THRESHOLD_GB"];
  if (raw !== undefined) {
    const parsed = parseFloat(raw);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return 20;
})();

/** Minimum wait between two BUG alerts during a sustained over-threshold condition. */
export const DISK_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours

// ── Module-level cooldown state ───────────────────────────────────────────────

/** Mutable state object to allow full injection in tests. */
export interface DiskUsageAlertState {
  lastAlertAt: number; // epoch ms; 0 = never alerted
}

/** Production singleton state — shared across all cron invocations in the process. */
const _productionState: DiskUsageAlertState = { lastAlertAt: 0 };

/**
 * Test-only: resets the production module-level cooldown timer.
 * For concurrent-safe tests, pass an explicit `state` object instead.
 * Not called from production code.
 */
export function _resetDiskUsageCooldown(): void {
  _productionState.lastAlertAt = 0;
}

// ── Result type ───────────────────────────────────────────────────────────────

export type DiskUsageAlertResult =
  | "ok"              // usage <= threshold — silent
  | "alert-sent"      // usage > threshold + cooldown elapsed → BUG Telegram sent
  | "cooldown"        // usage > threshold but within 6 h cooldown window
  | "notify-failed"   // usage > threshold + cooldown elapsed but Telegram send failed
  | "measure-failed"; // du command failed — cannot determine disk usage

// ── Production disk reader ────────────────────────────────────────────────────

/**
 * Shells out to `du -sh <path>` and parses the result to a float in GB.
 *
 * Supports:
 *   - `29G\t/app/data/lancedb`   → 29.0
 *   - `512M\t/app/data/lancedb`  → 0.5
 *   - `1.5T\t/app/data/lancedb`  → 1536.0
 *
 * Returns null if `du` fails or output is unparseable.
 */
export function readDiskUsageGb(path: string): number | null {
  try {
    const proc = Bun.spawnSync(["du", "-sh", path], {
      stdout: "pipe",
      stderr: "pipe",
    });

    if (proc.exitCode !== 0) {
      const err = proc.stderr ? new TextDecoder().decode(proc.stderr) : "unknown";
      logger.warn("[diskUsageAlert] du command failed", { path, exitCode: proc.exitCode, stderr: err });
      return null;
    }

    const stdout = proc.stdout ? new TextDecoder().decode(proc.stdout).trim() : "";
    // Output format: "29G\t/app/data/lancedb" — take the first token
    const sizeToken = stdout.split(/\s/)[0] ?? "";
    return parseDuSizeToGb(sizeToken);
  } catch (err) {
    logger.error("[diskUsageAlert] readDiskUsageGb threw", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Parses a `du` size token (e.g. "29G", "512M", "1.5T", "1024K") to GB as float.
 * Returns null when the token is unrecognised.
 */
export function parseDuSizeToGb(token: string): number | null {
  const match = /^([\d.]+)([KMGTP]?)$/i.exec(token.trim());
  if (!match) return null;

  const value = parseFloat(match[1] as string);
  const unit = (match[2] ?? "").toUpperCase();

  if (isNaN(value)) return null;

  switch (unit) {
    case "K": return value / (1024 * 1024);
    case "M": return value / 1024;
    case "G": return value;
    case "T": return value * 1024;
    case "P": return value * 1024 * 1024;
    case "":  return value / (1024 * 1024 * 1024); // raw bytes (rare but valid)
    default:  return null;
  }
}

// ── Core logic ────────────────────────────────────────────────────────────────

/**
 * One run of the disk-usage alert job.
 *
 * All external dependencies are injectable for test isolation:
 *   - getDiskUsageGb   → returns disk usage in GB for a path (default: readDiskUsageGb)
 *   - notifyBug        → sends BUG Telegram (default: sendTelegramBug)
 *   - now              → current timestamp (default: new Date())
 *   - path             → filesystem path to check (default: LANCEDB_PATH)
 *   - state            → cooldown state object (default: production singleton)
 *                        Pass a local object in tests for concurrent-safe isolation.
 */
/**
 * @idempotency T4 — cron_job_runs recency guard; replay skipped if last success < 90% of hourly cadence (54min window)
 */
export async function runDiskUsageAlertJob(options?: {
  getDiskUsageGb?: (path: string) => Promise<number | null> | number | null;
  notifyBug?: (message: string) => Promise<number>;
  now?: Date;
  path?: string;
  state?: DiskUsageAlertState;
  /** Injectable nowMs for recovery dedup guard (tests only) */
  nowMsFn?: () => number;
}): Promise<DiskUsageAlertResult> {
  // T4 dedup guard: skip if already ran within hourly cadence window
  try {
    const { getDb } = await import("../infrastructure/db/schema.js");
    const _db = getDb();
    const HOURLY_CADENCE_MS = 3_600_000;
    if (shouldSkipRecoveryReplay(_db, "diskUsageAlertJob", HOURLY_CADENCE_MS, options?.nowMsFn)) {
      return "ok";
    }
  } catch { /* fail-open: DB unavailable, proceed with job */ }

  const now = options?.now ?? new Date();
  const path = options?.path ?? LANCEDB_PATH;
  const getDiskUsageGb = options?.getDiskUsageGb
    ?? ((p: string) => readDiskUsageGb(p));
  const notifyBug = options?.notifyBug
    ?? ((msg: string) => sendTelegramBug(msg));
  const state = options?.state ?? _productionState;

  // Step 1: measure disk usage
  let usageGb: number | null;
  try {
    usageGb = await getDiskUsageGb(path);
  } catch (err) {
    logger.error("[diskUsageAlert] getDiskUsageGb threw", {
      error: err instanceof Error ? err.message : String(err),
    });
    return "measure-failed";
  }

  if (usageGb === null) {
    logger.warn("[diskUsageAlert] could not measure disk usage — skipping alert", { path });
    return "measure-failed";
  }

  // Step 2: threshold check
  if (usageGb <= DISK_THRESHOLD_GB) {
    logger.debug("[diskUsageAlert] healthy", { path, usageGb, thresholdGb: DISK_THRESHOLD_GB });
    return "ok";
  }

  // Step 3: cooldown check
  const elapsed = now.getTime() - state.lastAlertAt;
  if (elapsed < DISK_COOLDOWN_MS) {
    logger.debug("[diskUsageAlert] threshold exceeded but within cooldown", {
      path,
      usageGb,
      cooldownRemainingMs: DISK_COOLDOWN_MS - elapsed,
    });
    return "cooldown";
  }

  // Step 4: build BUG message
  const usageDisplay = usageGb.toFixed(1);
  const message =
    `[Disk Alert] LanceDB disk usage exceeds threshold.\n` +
    `Path: ${path}\n` +
    `Current: ${usageDisplay} GB\n` +
    `Threshold: ${DISK_THRESHOLD_GB} GB\n` +
    `Action: Run compaction or delete stale indices to free space.\n` +
    `Ref: docs/architecture-briefs/2026-05-20-microservice-degraded-rca.md`;

  // Step 5: send BUG Telegram
  try {
    const msgId = await notifyBug(message);
    if (msgId === 0) {
      // send returned 0 = delivery failure (not dedup suppression — -1 is dedup)
      logger.error("[diskUsageAlert] BUG Telegram delivery failed", { path, usageGb });
      return "notify-failed";
    }
    // Update cooldown (even if msgId == -1 dedup suppression — avoids retry storm)
    state.lastAlertAt = now.getTime();
    logger.info("[diskUsageAlert] BUG Telegram sent", { path, usageGb, msgId });
    return "alert-sent";
  } catch (err) {
    logger.error("[diskUsageAlert] notifyBug threw", {
      error: err instanceof Error ? err.message : String(err),
    });
    // Do NOT advance lastAlertAt — next run will retry
    return "notify-failed";
  }
}
