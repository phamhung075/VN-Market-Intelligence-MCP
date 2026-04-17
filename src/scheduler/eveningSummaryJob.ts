/**
 * Evening Summary Job — Task 105 (Interface / Scheduler Layer)
 *
 * Thin cron wrapper around the `assembleEveningSummary` application use case.
 * Registered in `jobs.ts` at 22:30 Asia/Ho_Chi_Minh weekdays (30 22 * * 1-5).
 *
 * A concurrency guard prevents a second invocation from starting while the
 * previous summary is still assembling.
 *
 * Layer: interface/scheduler — imports from application/usecases only.
 */

import type { EveningSummary } from "../application/usecases/assembleEveningSummary.js";
import { logger } from "../infrastructure/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Concurrency guard
// ─────────────────────────────────────────────────────────────────────────────

let _running = false;

// ─────────────────────────────────────────────────────────────────────────────
// DB-level same-day dedup guard
// Prevents spam when the server restarts near 22:30 and the cron re-fires.
// ─────────────────────────────────────────────────────────────────────────────

function alreadySentToday(db: import("bun:sqlite").Database): boolean {
  try {
    const row = db
      .prepare<{ cnt: number }, []>(
        `SELECT COUNT(*) AS cnt
         FROM market_messages
         WHERE from_agent = 'evening-summary'
           AND sent_at >= date('now')`,
      )
      .get();
    return (row?.cnt ?? 0) > 0;
  } catch {
    return false; // fail-open: don't suppress if DB check fails
  }
}

/** Reset concurrency guard — exported for test isolation. */
export function resetEveningSummaryGuard(): void {
  _running = false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute one evening summary cycle.
 *
 * Accepts optional injectable parameters for test isolation:
 * - `summaryFn`: override the summary assembler (avoids DB dependencies in tests)
 * - `sendFn`: override the Telegram sender (avoids network calls in tests)
 * - `db`: override the SQLite database instance (avoids production-DB bleed in tests)
 *
 * In production all three default to their respective singletons / dynamic imports.
 *
 * @param summaryFn - Optional override for the summary function
 * @param sendFn    - Optional override for the Telegram send function
 * @param db        - Optional override for the SQLite DB used by the dedup guard
 */
export async function runEveningSummary(
  summaryFn?: () => Promise<EveningSummary>,
  sendFn?: (message: string, opts: unknown) => Promise<void>,
  db?: import("bun:sqlite").Database,
): Promise<void> {
  if (_running) {
    logger.warn("[eveningSummaryJob] already running — skipping");
    return;
  }

  _running = true;

  try {
    // DB-level dedup: skip if we already sent an evening summary today.
    // Guards against server restarts near 22:30 causing double-fire.
    try {
      let dedupDb = db;
      if (!dedupDb) {
        const { getDb } = await import("../infrastructure/db/index.js");
        dedupDb = getDb();
      }
      if (alreadySentToday(dedupDb)) {
        logger.info("[eveningSummaryJob] already sent today — skipping duplicate");
        return;
      }
    } catch {
      // fail-open: if DB is unavailable, proceed and let the job run
    }
    const fn =
      summaryFn ??
      (async () => {
        const { assembleEveningSummary } = await import(
          "../application/usecases/assembleEveningSummary.js"
        );
        return assembleEveningSummary();
      });

    const summary = await fn();

    logger.info(
      `[eveningSummaryJob] cycle complete — ` +
        `date: ${summary.date}, ` +
        `stories: ${summary.topStories.length}, ` +
        `alerts: ${summary.topAlerts.length}, ` +
        `movers: ${summary.watchlistMovers.length}`,
    );

    // ── Format and send to Telegram ─────────────────────────────────
    const hasContent =
      summary.topStories.length > 0 ||
      summary.topAlerts.length > 0 ||
      summary.watchlistMovers.length > 0 ||
      summary.predictionSignals.length > 0 ||
      (summary.taSummary ?? []).some(
        (s) => s.rsiStatus !== "neutral" || s.priceVsMa20 !== "neutral",
      );

    // Resolve the send function: use injected sendFn for tests, or dynamic import in prod.
    const doSend =
      sendFn ??
      (async (message: string, opts: unknown) => {
        const { sendTelegramMarket } = await import(
          "../infrastructure/notifiers/telegram.js"
        );
        await sendTelegramMarket(
          message,
          opts as Parameters<typeof sendTelegramMarket>[1],
        );
      });

    if (hasContent) {
      try {
        const lines: string[] = [`TÓM TẮT BUỔI TỐI ${summary.date}`];

        if (summary.topAlerts.length > 0) {
          lines.push("");
          lines.push(`Cảnh báo (${summary.topAlerts.length}):`);
          for (const a of summary.topAlerts.slice(0, 5)) {
            lines.push(`  [${a.severity.toUpperCase()}] ${a.message.slice(0, 80)}`);
          }
        }

        if (summary.topStories.length > 0) {
          lines.push("");
          lines.push(`Tin quan trọng (${summary.topStories.length}):`);
          for (const s of summary.topStories.slice(0, 5)) {
            lines.push(`  - ${s.title.slice(0, 80)}`);
          }
        }

        // News count diagnostic line (Task 1323)
        const newsCount = summary.newsCount ?? 0;
        if (newsCount > 0) {
          lines.push("");
          lines.push(`(${newsCount} tin tức hôm nay)`);
        }

        if (summary.watchlistMovers.length > 0) {
          lines.push("");
          lines.push("Biến động giá:");
          for (const m of summary.watchlistMovers.slice(0, 5)) {
            const sign = m.changePct >= 0 ? "+" : "";
            lines.push(`  ${m.code}: ${sign}${m.changePct.toFixed(2)}%`);
          }
        }

        if (summary.predictionSignals.length > 0) {
          lines.push("");
          lines.push(`Tín hiệu dự đoán (${summary.predictionSignals.length}):`);
          for (const p of summary.predictionSignals.slice(0, 3)) {
            lines.push(`  ${p.question.slice(0, 70)}`);
          }
        }

        const nonNeutralTa = (summary.taSummary ?? []).filter(
          (s) => s.rsiStatus !== "neutral" || s.priceVsMa20 !== "neutral",
        );
        if (nonNeutralTa.length > 0) {
          lines.push("");
          lines.push("TA tín hiệu đóng cửa:");
          for (const s of nonNeutralTa.slice(0, 5)) {
            let line = `  ${s.code}:`;
            if (s.rsi14 !== null && s.rsiStatus === "overbought") {
              line += ` RSI=${s.rsi14.toFixed(1)} (quá mua)`;
            } else if (s.rsi14 !== null && s.rsiStatus === "oversold") {
              line += ` RSI=${s.rsi14.toFixed(1)} (quá bán)`;
            }
            if (s.priceVsMa20 === "above") line += ", giá trên MA20";
            else if (s.priceVsMa20 === "below") line += ", giá dưới MA20";
            lines.push(line);
          }
        }

        await doSend(lines.join("\n"), {
          persist: { from_agent: "evening-summary", message_type: "evening_summary" },
        });
        logger.info("[eveningSummaryJob] Telegram sent");
      } catch (tgErr) {
        logger.warn("[eveningSummaryJob] Telegram send failed", {
          error: tgErr instanceof Error ? tgErr.message : String(tgErr),
        });
      }
    } else {
      logger.info("[eveningSummaryJob] no content — skipping Telegram (silent)");
    }
  } catch (err) {
    logger.error("[eveningSummaryJob] unhandled error in summary cycle", {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    _running = false;
  }
}

/**
 * Register the evening summary job.
 * Called from `jobs.ts` — the cron expression is configured there.
 * This function is provided for callers who want to schedule via their own cron setup.
 */
export function scheduleEveningSummaryJob(): void {
  // Scheduling is wired in jobs.ts via the CRONS.eveningSummary expression.
  // This exported function exists for explicit registration use cases
  // (e.g. interface/scheduler/index.ts).
  logger.info("[eveningSummaryJob] evening summary job ready — scheduled via jobs.ts");
}
