/**
 * Pattern Watch Job — Weekly proactive alert (Sunday 22:30 GMT+7)
 *
 * Scans all watchlist stocks for current price/volume profiles that match
 * historical setups preceding >= 5% moves within 10 trading days.
 *
 * This is pure rule-based pattern matching — no LLM calls.
 * Sends Telegram only when genuine matches are found.
 *
 * Layer: interface/scheduler
 */

import { logger } from "../../infrastructure/logger.js";
import { shouldSkipRecoveryReplay } from "../startupHelpers.js";

/**
 * Run the weekly pattern watch scan.
 *
 * Checks each watchlist stock against historical patterns from market_prices_history.
 * If a current profile matches a past setup that led to a 5%+ move, sends a Telegram alert.
 *
 * @idempotency T4 — cron_job_runs recency guard; replay skipped if last success < 90% of weekly cadence (6 days 1h12m window)
 */
export async function runPatternWatch(nowMsFn?: () => number): Promise<void> {
  try {
    const { getDb } = await import("../../infrastructure/db/schema.js");
    const { sendTelegramBug } = await import("../../infrastructure/notifiers/telegram.js");
    const db = getDb();

    const WEEKLY_CADENCE_MS = 604_800_000;
    if (shouldSkipRecoveryReplay(db, "patternWatchJob", WEEKLY_CADENCE_MS, nowMsFn)) return;

    // Get watchlist codes
    const watchlist = db
      .prepare("SELECT code, domain FROM watchlist")
      .all() as Array<{ code: string; domain: string }>;

    if (watchlist.length === 0) return;

    const warnings: string[] = [];

    for (const stock of watchlist) {
      try {
        // Get last 5 price records
        const recent = db
          .query<{ price: number; volume: number; change_pct: number; fetched_at: string }, [string]>(
            `SELECT price, volume, change_pct, fetched_at
             FROM market_prices_history
             WHERE code = ?
             ORDER BY fetched_at DESC
             LIMIT 5`,
          )
          .all(stock.code);

        if (recent.length < 3) continue;

        // Get historical records (30-90 days ago)
        const historical = db
          .query<{ price: number; volume: number; change_pct: number; fetched_at: string }, [string]>(
            `SELECT price, volume, change_pct, fetched_at
             FROM market_prices_history
             WHERE code = ?
               AND fetched_at < datetime('now', '-30 days')
               AND fetched_at > datetime('now', '-90 days')
             ORDER BY fetched_at DESC`,
          )
          .all(stock.code);

        if (historical.length < 10) continue;

        // Compute current profile
        const currentAvgChange = recent.reduce((s, r) => s + (r.change_pct ?? 0), 0) / recent.length;

        // Find historical windows where 5-day avg change was similar to current
        // AND was followed by a 5%+ move
        for (let i = 0; i < historical.length - 10; i++) {
          const window = historical.slice(i, i + 5);
          const windowAvgChange = window.reduce((s, r) => s + (r.change_pct ?? 0), 0) / window.length;

          // Profile similarity: both trending same direction with similar magnitude
          if (Math.abs(windowAvgChange - currentAvgChange) > 2) continue;

          // Check what happened in the next 10 days
          const afterWindow = historical.slice(Math.max(0, i - 10), i);
          if (afterWindow.length < 3) continue;

          const startPrice = window[0]!.price;
          const maxAfter = Math.max(...afterWindow.map((r) => r.price));
          const minAfter = Math.min(...afterWindow.map((r) => r.price));

          const maxMove = ((maxAfter - startPrice) / startPrice) * 100;
          const minMove = ((minAfter - startPrice) / startPrice) * 100;

          if (Math.abs(maxMove) >= 5 || Math.abs(minMove) >= 5) {
            const move = Math.abs(maxMove) > Math.abs(minMove) ? maxMove : minMove;
            const dir = move > 0 ? "↑" : "↓";
            const date = window[0]!.fetched_at.slice(0, 10);

            warnings.push(
              `📊 ${stock.code}: profile hiện tại giống ${date} — sau đó ${dir}${Math.abs(move).toFixed(1)}% trong 10 phiên`,
            );
            break; // one match per stock
          }
        }
      } catch {
        // skip stock on error
      }
    }

    if (warnings.length > 0) {
      const message = [
        "🔮 PATTERN WATCH — Tuần tới cần lưu ý",
        "",
        ...warnings,
        "",
        "⚠️ Pattern matching chỉ mang tính tham khảo, không phải khuyến nghị đầu tư",
      ].join("\n");

      const tickerMatch = message.match(/\b([A-Z]{2,4})\b/);
      const patternTicker: string | null = tickerMatch?.[1] ?? null;
      await sendTelegramBug(message, {
        parseMode: "",
      });
      logger.info("[patternWatch] sent weekly pattern alert", {
        matches: warnings.length,
      });
    } else {
      logger.debug("[patternWatch] no matching patterns found");
    }
  } catch (err) {
    logger.error("[patternWatch] failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
