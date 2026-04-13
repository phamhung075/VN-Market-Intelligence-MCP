/**
 * France Wake-Up Summary Job — Task 243 (Interface / Scheduler Layer)
 *
 * Sends a Vietnamese-language Telegram summary at 07:00 CET (06:00 UTC)
 * every weekday. By that time, Vietnam market is 4 hours into the session
 * (09:00–13:00 VN = 02:00–06:00 UTC), so the message captures the live
 * mid-session picture rather than the stale 08:00 VN morning briefing.
 *
 * Data sources (last 4 hours):
 *   - market_prices  — watchlist stocks (current price + change_pct)
 *   - alerts         — unread alerts (read=0)
 *   - rag_analyses   — top 3 by impact_score
 *
 * Registered in jobs.ts at cron "0 6 * * 1-5" with timezone: "UTC".
 *
 * Layer: interface/scheduler — thin orchestration; no domain imports.
 */

import type { Database } from "bun:sqlite";
import { logger } from "../infrastructure/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/** Injectable options for testability. */
export interface FranceSummaryOptions {
  /** SQLite database (defaults to getDb() in production). */
  db?: Database;
  /**
   * Telegram send function.
   * Defaults to the real sendTelegramMarket in production.
   * Inject a no-op or capture fn in tests.
   */
  sendFn?: (message: string) => Promise<void>;
  /**
   * VN-Index snapshot function.
   * Defaults to fetchVnIndex() from hose.ts in production.
   * Return null on failure — the message will omit the index line.
   */
  vnIndexFn?: () => Promise<{ price: number; changePct: number } | null>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal SQLite row types
// ─────────────────────────────────────────────────────────────────────────────

interface WatchlistPriceRow {
  code: string;
  price: number | null;
  change_pct: number | null;
}

interface AlertRow {
  id: string;
  severity: string;
  message: string | null;
}

interface RagRow {
  source_title: string | null;
  impact_score: number | null;
  summary: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a price as integer VND string (e.g. 65000 → "65000").
 * Returns "-" if price is null/undefined.
 */
function fmtPrice(price: number | null | undefined): string {
  if (price == null) return "-";
  return String(Math.round(price));
}

/**
 * Format change percentage with sign (e.g. 2.5 → "+2.50%" or -1.2 → "-1.20%").
 * Returns "-" if null.
 */
function fmtChangePct(pct: number | null | undefined): string {
  if (pct == null) return "-";
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

/**
 * Returns today's date in Vietnam timezone (UTC+7) as DD/MM/YYYY.
 * Used in the message header.
 */
function todayVietnamFormatted(): string {
  const vnNow = new Date(Date.now() + 7 * 3_600_000);
  const d = String(vnNow.getUTCDate()).padStart(2, "0");
  const m = String(vnNow.getUTCMonth() + 1).padStart(2, "0");
  const y = vnNow.getUTCFullYear();
  return `${d}/${m}/${y}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core assembly — exported for testing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Assembles the France wake-up summary message and calls sendFn.
 *
 * Returns the assembled message string (useful for tests).
 *
 * @param options - Injectable dependencies; all are optional for production.
 */
export async function assembleFranceSummary(
  options: FranceSummaryOptions = {},
): Promise<string> {
  // ── Resolve DB ──────────────────────────────────────────────────────────────
  const db =
    options.db ??
    (await (async () => {
      const { getDb } = await import("../infrastructure/db/schema.js");
      return getDb();
    })());

  // ── Resolve sendFn ─────────────────────────────────────────────────────────
  const sendFn =
    options.sendFn ??
    (async (msg: string) => {
      // Dynamic import — module may not exist in all versions of the codebase.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod = await import("../infrastructure/notifiers/telegram.js" as string).catch(() => null) as any;
      if (mod?.sendTelegramMarket) {
        await mod.sendTelegramMarket(msg, {
          persist: { from_agent: "france-summary", message_type: "france_summary" },
        });
      }
    });

  // ── Resolve vnIndexFn ──────────────────────────────────────────────────────
  const vnIndexFn =
    options.vnIndexFn ??
    (async () => {
      try {
        // Dynamic import — fetchVnIndex may not exist in all versions.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mod = await import("../infrastructure/fetchers/hose.js") as any;
        if (typeof mod.fetchVnIndex === "function") {
          return (mod.fetchVnIndex as () => Promise<{ price: number; changePct: number } | null>)();
        }
        return null;
      } catch {
        return null;
      }
    });

  // ── 1. VN-Index snapshot ───────────────────────────────────────────────────
  let vnIndex: { price: number; changePct: number } | null = null;
  try {
    vnIndex = await vnIndexFn();
  } catch (err) {
    logger.warn("[france-summary] vnIndexFn failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // ── 2. Watchlist stocks with prices ───────────────────────────────────────
  const watchlistRows = db
    .prepare<WatchlistPriceRow, []>(`
      SELECT w.code, mp.price, mp.change_pct
      FROM watchlist w
      LEFT JOIN market_prices mp ON mp.code = w.code
      ORDER BY w.code ASC
    `)
    .all();

  // ── 3. Unread alerts from the last 4 hours ─────────────────────────────────
  const alertRows = db
    .prepare<AlertRow, []>(`
      SELECT id, severity, message
      FROM alerts
      WHERE read = 0
        AND triggered_at > datetime('now', '-4 hours')
      ORDER BY triggered_at DESC
      LIMIT 10
    `)
    .all();

  // ── 4. Top 3 news by impact_score (last 4 hours) ──────────────────────────
  const ragRows = db
    .prepare<RagRow, []>(`
      SELECT source_title, impact_score, summary
      FROM rag_analyses
      WHERE created_at > datetime('now', '-4 hours')
      ORDER BY impact_score DESC
      LIMIT 3
    `)
    .all();

  // ── 5. Assemble message ───────────────────────────────────────────────────
  const lines: string[] = [];
  const dateStr = todayVietnamFormatted();

  lines.push(`Tóm tắt phiên (4h đầu) — ${dateStr}`);
  lines.push("");

  // VN-Index
  if (vnIndex) {
    lines.push(
      `VN-Index: ${fmtPrice(vnIndex.price)} (${fmtChangePct(vnIndex.changePct)})`,
    );
  } else {
    lines.push("VN-Index: chưa có dữ liệu");
  }
  lines.push("");

  // Watchlist stocks
  lines.push("Cổ phiếu theo dõi:");
  if (watchlistRows.length === 0) {
    lines.push("  (Danh sách theo dõi trống)");
  } else {
    for (const row of watchlistRows) {
      const priceStr = fmtPrice(row.price);
      const pctStr = fmtChangePct(row.change_pct);
      lines.push(`  ${row.code}  ${priceStr}  ${pctStr}`);
    }
  }
  lines.push("");

  // Alerts
  lines.push(`Cảnh báo (4h qua): ${alertRows.length}`);
  const top3Alerts = alertRows.slice(0, 3);
  for (const al of top3Alerts) {
    const sev = al.severity.toUpperCase();
    const msg = al.message ?? "(không có nội dung)";
    lines.push(`  [${sev}] ${msg}`);
  }
  lines.push("");

  // News
  lines.push("Tin nổi bật:");
  if (ragRows.length === 0) {
    lines.push("  (Chưa có tin tức mới)");
  } else {
    for (const row of ragRows) {
      const title = row.source_title ?? row.summary ?? "(không có tiêu đề)";
      lines.push(`  - ${title}`);
    }
  }
  lines.push("");

  lines.push("Gửi từ France wake-up summary (07:00 CET)");

  const message = lines.join("\n");

  // ── 6. Send ────────────────────────────────────────────────────────────────
  try {
    await sendFn(message);
  } catch (err) {
    logger.error("[france-summary] sendFn failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return message;
}

// ─────────────────────────────────────────────────────────────────────────────
// Concurrency guard
// ─────────────────────────────────────────────────────────────────────────────

let _running = false;

// ─────────────────────────────────────────────────────────────────────────────
// Public cron wrapper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute one France wake-up summary cycle.
 *
 * In production: calls assembleFranceSummary() with real dependencies.
 * In tests: optionally inject a custom async fn returning a string to bypass
 * DB and network calls.
 *
 * Concurrency guard: if the previous cycle is still running, the new one is
 * skipped with a warning log.
 *
 * @param overrideFn - Optional async function returning a string (for tests).
 */
export async function runFranceSummary(
  overrideFn?: () => Promise<string>,
): Promise<void> {
  if (_running) {
    logger.warn("[france-summary] previous cycle still running — skipped");
    return;
  }

  _running = true;

  try {
    if (overrideFn) {
      await overrideFn();
    } else {
      await assembleFranceSummary();
    }

    logger.info("[france-summary] cycle complete");
  } catch (err) {
    logger.error("[france-summary] unhandled error", {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    _running = false;
  }
}
