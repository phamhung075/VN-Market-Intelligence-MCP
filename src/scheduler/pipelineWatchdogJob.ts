/**
 * Pipeline Watchdog — stale news-pipeline Telegram alert.
 *
 * Every 30 min (24/7) this job calls getPipelineHealth() and checks whether
 * rag_analyses has been silent for more than STALE_THRESHOLD_MINS minutes.
 * When staleness is detected it fires ONE alert to the WORK channel, then
 * backs off for COOLDOWN_MS (3 hours) before alerting again, preventing alert
 * floods during sustained outages.
 *
 * Design mirrors vpsProxyWatchdogJob.ts: module-level lastAlertAt for
 * cooldown state, injectable now/notify/getPipelineHealthFn for test isolation,
 * production defaults wired at call time (not at import time).
 *
 * Spec: docs/TECH_076.md
 * Task: 1190, Sprint 076
 *
 * @module scheduler/pipelineWatchdogJob
 */

import { getPipelineHealth } from "../application/usecases/getPipelineHealth.js";
import type {
  GetPipelineHealthOptions,
  PipelineHealthResult,
} from "../application/usecases/getPipelineHealth.js";
import { sendTelegramWork, sendTelegramMarket } from "../infrastructure/notifiers/telegram.js";
import { logger } from "../infrastructure/logger.js";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Alert fires when rag_analyses.staleMins exceeds this threshold (inclusive+1). */
export const STALE_THRESHOLD_MINS = 90;

/** Minimum wait between two stale-alerts during the same outage (3 hours). */
export const COOLDOWN_MS = 3 * 60 * 60 * 1000; // 10_800_000 ms

// ── Module-level cooldown state ───────────────────────────────────────────────

let lastAlertAt = 0; // epoch ms; 0 means "never alerted"

/**
 * Test-only: resets the in-module cooldown timer so each test starts clean.
 * Not called from production code.
 */
export function _resetWatchdogCooldown(): void {
  lastAlertAt = 0;
}

// ── WatchdogResult ────────────────────────────────────────────────────────────

export type WatchdogResult =
  | "ok"            // staleMins <= STALE_THRESHOLD_MINS
  | "no-data"       // staleMins === null (rag_analyses table is empty)
  | "alert-sent"    // stale + cooldown passed + notify returned truthy
  | "cooldown"      // stale but within 3-hour cooldown window
  | "notify-failed"; // stale + cooldown passed + notify returned false or threw

// ── Core logic ────────────────────────────────────────────────────────────────

/**
 * One run of the pipeline watchdog.
 *
 * All external dependencies are injectable:
 *   - now             → current timestamp (default: new Date())
 *   - notify          → Telegram send function (default: sendTelegramWork)
 *   - getPipelineHealthFn → health use-case (default: getPipelineHealth)
 *
 * Return values are the 5 WatchdogResult variants documented in TECH_076.md.
 */
export async function runPipelineWatchdog(options?: {
  now?: Date;
  notify?: (message: string) => Promise<boolean>;
  notifyUser?: (message: string) => Promise<unknown>;
  getPipelineHealthFn?: (
    opts?: GetPipelineHealthOptions,
  ) => Promise<PipelineHealthResult>;
}): Promise<WatchdogResult> {
  const now = options?.now ?? new Date();
  const getPipelineHealthFn =
    options?.getPipelineHealthFn ?? getPipelineHealth;
  const notify =
    options?.notify ??
    ((msg: string) => sendTelegramWork(msg, { parseMode: "" }));
  const notifyUser =
    options?.notifyUser ??
    ((msg: string) => sendTelegramMarket(msg, { parseMode: "" }));

  // Step 1: call the health use case
  let health: PipelineHealthResult;
  try {
    health = await getPipelineHealthFn();
  } catch (err) {
    logger.error("[pipelineWatchdog] getPipelineHealth threw", {
      error: err instanceof Error ? err.message : String(err),
    });
    return "notify-failed";
  }

  // Step 2: evaluate staleMins
  const { staleMins } = health.ragRows;

  if (staleMins === null) {
    logger.debug("[pipelineWatchdog] no data — rag_analyses table is empty");
    return "no-data";
  }

  if (staleMins <= STALE_THRESHOLD_MINS) {
    logger.debug("[pipelineWatchdog] healthy", { staleMins });
    return "ok";
  }

  // Step 3: cooldown check
  if (now.getTime() - lastAlertAt < COOLDOWN_MS) {
    return "cooldown";
  }

  // Step 4: build alert message (exact template from TECH_076.md FR-4)
  const lastInsertedAt = health.ragRows.lastInsertedAt ?? "never";
  const vpsPush =
    health.vpsPushLast24h !== null && health.vpsPushLast24h !== undefined
      ? String(health.vpsPushLast24h)
      : "unknown";

  const message =
    `[Pipeline Watchdog] News pipeline silent.\n` +
    `Stale for: ${staleMins} min\n` +
    `Today's rag_analyses rows: ${health.ragRows.today}\n` +
    `Last insert: ${lastInsertedAt}\n` +
    `VPS news pushes (24h): ${vpsPush}\n` +
    `\n` +
    `Check intelligenceCycleJob logs and VPS vn-news-fetch.service.`;

  // Step 5: send alert
  try {
    const ok = await notify(message);
    if (!ok) {
      // Do NOT advance lastAlertAt — next run retries automatically
      return "notify-failed";
    }
    lastAlertAt = now.getTime();
    // Best-effort MARKET alert — failure does not change return value
    const userMessage =
      `News analysis pipeline stale for ${staleMins} min — ` +
      `market alerts and briefings may be delayed.`;
    try {
      await notifyUser(userMessage);
    } catch (userErr) {
      logger.warn("[pipelineWatchdog] MARKET user alert failed", {
        error: userErr instanceof Error ? userErr.message : String(userErr),
      });
    }
    return "alert-sent";
  } catch (err) {
    logger.error("[pipelineWatchdog] alert send failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    // Do NOT advance lastAlertAt — next run retries automatically
    return "notify-failed";
  }
}
