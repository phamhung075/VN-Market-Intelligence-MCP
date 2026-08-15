/**
 * All-sources-dark alert — Poll News (FACTORY-APP-split-pollNews, stage 1: fetch/health)
 *
 * When every fetcher returned 0 items AND at least one source was expected
 * to be functional AND the VPS push pipeline hasn't delivered recently, send
 * one deduped Telegram bug alert. DB-backed cooldown (`cron_job_runs`, Task
 * 1398) persists the last-sent timestamp across restarts; `state.lastAt`
 * (Task 1793) covers the same-process fast path.
 *
 * Split out of pollNews.ts's pollNews() body (previously inline, lines
 * 374-440 of the pre-split orchestrator). The caller owns `state` (a plain
 * `{ lastAt: number }` box) so `pollNews.ts`'s `_resetAllDarkAlert()` test
 * hook can still reset it directly.
 *
 * Layer: application/usecases — may import from domain/ and infrastructure/.
 */

import type { Database } from "bun:sqlite";
import { logger } from "../../../infrastructure/logger.js";

/**
 * VPS news push freshness window. If the last VPS push is within 2 hours, a
 * scheduled job returning [] is expected (fetchers intentionally stubbed —
 * Tasks 1228 + 1843), not an outage. Task 1855a.
 */
const VPS_NEWS_STALE_MS = 2 * 60 * 60 * 1000;

/** One all-sources-dark Telegram bug alert per 24-hour window. */
const ALL_DARK_ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export interface DarkAlertState {
  lastAt: number;
}

export interface MaybeAlertAllSourcesDarkInput {
  db: Database;
  fetchedCount: number;
  activeSourceCount: number;
  sourceKeys: string[];
  sourceCount: number;
  vpsNewsLastPushTs?: Date | null;
  nowMs?: () => number;
  onAllSourcesDark?: (message: string) => Promise<void>;
  state: DarkAlertState;
}

export async function maybeAlertAllSourcesDark(input: MaybeAlertAllSourcesDarkInput): Promise<void> {
  const { db, fetchedCount, activeSourceCount, sourceKeys, sourceCount, state } = input;

  // Task 1855a: suppress alert when VPS push pipeline recently delivered news.
  const vpsNewsPushTs = input.vpsNewsLastPushTs ?? null;
  const vpsNewsAgeMs = vpsNewsPushTs
    ? (input.nowMs?.() ?? Date.now()) - vpsNewsPushTs.getTime()
    : Infinity;
  const vpsPushIsHealthy = vpsNewsAgeMs < VPS_NEWS_STALE_MS;

  // Task 1832b: only fire when at least one source is expected to be functional.
  if (fetchedCount !== 0 || activeSourceCount <= 0 || vpsPushIsHealthy) return;

  const now = input.nowMs?.() ?? Date.now();
  // DB-backed last-sent: read MAX(started_at) for the cooldown key
  const dbRow = (() => {
    try {
      return db.prepare(
        `SELECT MAX(started_at) AS ts FROM cron_job_runs WHERE job_name = 'pollNews_all_sources_dark'`,
      ).get() as { ts: string | null } | undefined;
    } catch (e) {
      logger.warn("[pollNews] cooldown SELECT failed — DB schema drift?", { error: String(e) });
      return undefined;
    }
  })();
  const dbLastMs = dbRow?.ts ? new Date(dbRow.ts).getTime() : 0;
  const lastSentMs = Math.max(state.lastAt, dbLastMs);
  if (now - lastSentMs < ALL_DARK_ALERT_COOLDOWN_MS) return;

  state.lastAt = now;
  // Persist send timestamp to DB so cross-restart cooldown is enforced (Task 1398).
  // FIX Task 1793: store `now` (from nowMs injection), not SQLite strftime('now').
  const nowIso = new Date(now).toISOString();
  try {
    db.prepare(
      `INSERT INTO cron_job_runs (job_name, started_at, status) VALUES ('pollNews_all_sources_dark', ?, 'success')`,
    ).run(nowIso);
  } catch (e) {
    logger.warn("[pollNews] cooldown INSERT failed — cooldown will not persist across restart", { error: String(e) });
  }
  const darkMsg =
    "[pollNews] All news sources returned 0 items — possible VPS/network outage. " +
    `Sources checked: ${sourceKeys.join(", ")} ` +
    `(active: ${activeSourceCount}/${sourceCount})`;
  logger.warn(darkMsg);
  try {
    if (input.onAllSourcesDark) {
      await input.onAllSourcesDark(darkMsg);
    } else {
      // Production default: send to Telegram bug channel
      const { sendTelegramBug } = await import("../../../infrastructure/notifiers/telegram.js");
      await sendTelegramBug(darkMsg, { parseMode: "" });
    }
  } catch {
    // Best-effort — alert failure must not abort the cycle
  }
}
