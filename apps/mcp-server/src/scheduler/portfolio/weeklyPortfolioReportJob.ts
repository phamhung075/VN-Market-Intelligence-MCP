/**
 * Weekly Portfolio Report Job — Task 218 (Interface / Scheduler Layer)
 *
 * Generates and sends a Vietnamese-language weekly portfolio performance
 * summary to Telegram every Sunday at 23:00 Asia/Ho_Chi_Minh.
 *
 * Logic:
 *   1. Query open positions (closed_at IS NULL) from `positions` table
 *   2. Join with `market_prices` to get current prices
 *   3. Query `portfolio_pnl_snapshots` from last 7 days to compute week-over-week change
 *   4. Format Vietnamese report with per-stock row + total P&L summary
 *   5. Send via Telegram MARKET channel (sendTelegramMarket)
 *
 * DDD Layer: interface/scheduler — may import from infrastructure only (no domain).
 *
 * All dependencies injectable for TDD (db, sendFn, reportFn).
 */

import type { Database } from "bun:sqlite";
import { logger } from "../../infrastructure/logger.js";
import { sqlInClause } from "../../infrastructure/db/sqlHelpers.js";
import { VN_OFFSET_MS } from "../../domain/services/timeConstants.js";
import {
  isSchedulerLockFresh,
  acquireSchedulerLock,
  ensureSchedulerLocksTable,
} from "../../infrastructure/db/schedulerLockStore.js";
import { shouldSkipRecoveryReplay } from "../startupHelpers.js";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/** One open position row enriched with current market price. */
export interface PortfolioRow {
  code: string;
  shares: number;
  avgPrice: number;
  currentPrice: number;
  /** Price at start of the week (from earliest snapshot in last 7 days), 0 if unknown */
  startOfWeekPrice: number;
  /** Week-over-week price change percentage */
  weekChangePct: number;
}

/** Aggregated week + total P&L summary. */
export interface WeekSummary {
  /** Net VND gain/loss this week across all positions */
  weekPnlAmount: number;
  /** Week gain/loss as % of total cost basis */
  weekPnlPct: number;
  /** Net VND gain/loss cumulative (current vs avg_price) */
  totalPnlAmount: number;
  /** Cumulative gain/loss as % of total cost basis */
  totalPnlPct: number;
}

/** Options for formatWeeklyReport date override (testing/display). */
export interface FormatOptions {
  weekStart?: string; // e.g. "29/03"
  weekEnd?: string;   // e.g. "04/04"
}

/** Injectable options for runWeeklyPortfolioReport. */
export interface WeeklyReportOptions {
  /** SQLite DB (defaults to getDb() singleton) */
  db?: Database;
  /**
   * Override the send function (for tests). Receives the formatted text.
   * In production, sends to Telegram via Bun.fetch.
   */
  sendFn?: (text: string) => Promise<void>;
  /**
   * Override the full report logic (for concurrency guard tests only).
   * When provided, bypasses DB queries and formatting entirely.
   */
  reportFn?: () => Promise<void>;
  /**
   * Task 1221: disable DB-backed lock check (for unit tests that do not
   * exercise the lock path). Defaults to false (lock check enabled).
   */
  skipDbLock?: boolean;
  /** Injectable nowMs for recovery dedup guard (tests only) */
  nowMsFn?: () => number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal SQLite row types
// ─────────────────────────────────────────────────────────────────────────────

interface PositionRow {
  code: string;
  shares: number;
  avg_price: number;
  current_price: number | null;
}

interface SnapshotRow {
  code: string;
  date: string;
  current_price: number | null;
  avg_price: number;
  shares: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Concurrency guard
// ─────────────────────────────────────────────────────────────────────────────

let _running = false;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a number as Vietnamese-style integer with dots as thousand separators.
 * e.g. 1500000 → "1.500.000"
 */
function fmtVnd(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Format a percentage with sign and 1 decimal place.
 * e.g. 2.41 → "+2.4%", -1.7 → "-1.7%"
 */
function fmtPct(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

/**
 * Format a VND amount with sign.
 * e.g. 1500000 → "+1.500.000 VND", -800000 → "-800.000 VND"
 */
function fmtVndSigned(n: number): string {
  const sign = n >= 0 ? "+" : "-";
  return `${sign}${fmtVnd(Math.abs(n))} VND`;
}

/**
 * Returns the current week's Monday and Sunday as DD/MM strings (Vietnam time).
 */
function currentWeekRange(): { weekStart: string; weekEnd: string } {
  const now = new Date(Date.now() + VN_OFFSET_MS); // shift to Vietnam clock
  const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  // Days back to Monday
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(now.getTime() - daysToMonday * 86_400_000);
  const sunday = new Date(monday.getTime() + 6 * 86_400_000);

  const fmt = (d: Date) =>
    `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

  return { weekStart: fmt(monday), weekEnd: fmt(sunday) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Core functions (exported for unit-testing)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute week-over-week and total P&L summary from snapshot history.
 *
 * For each code in `codes`, looks at the earliest and latest snapshot
 * in the last 7 days. The difference in current_price × shares gives the
 * week P&L for that position.
 *
 * Total P&L is computed from the latest snapshot's pnl_amount values.
 *
 * @param db    - SQLite database
 * @param codes - Open position codes to consider
 * @returns     - WeekSummary
 */
export function computeWeekSummary(db: Database, codes: string[]): WeekSummary {
  if (codes.length === 0) {
    return { weekPnlAmount: 0, weekPnlPct: 0, totalPnlAmount: 0, totalPnlPct: 0 };
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  // Get all snapshots for these codes in the last 7 days
  const placeholders = sqlInClause(codes.length);
  const rows = db
    .prepare<SnapshotRow, string[]>(`
      SELECT code, date, current_price, avg_price, shares
      FROM portfolio_pnl_snapshots
      WHERE code IN (${placeholders})
        AND date >= ?
      ORDER BY date ASC
    `)
    .all(...codes, sevenDaysAgo);

  if (rows.length === 0) {
    return { weekPnlAmount: 0, weekPnlPct: 0, totalPnlAmount: 0, totalPnlPct: 0 };
  }

  // Group by code → earliest and latest snapshot
  const byCode = new Map<string, SnapshotRow[]>();
  for (const row of rows) {
    const list = byCode.get(row.code) ?? [];
    list.push(row);
    byCode.set(row.code, list);
  }

  let weekPnlAmount = 0;
  let totalPnlAmount = 0;
  let totalCostBasis = 0;

  for (const [, snapshots] of byCode) {
    const earliest = snapshots[0]!;
    const latest = snapshots[snapshots.length - 1]!;

    const startPrice = earliest.current_price ?? earliest.avg_price;
    const endPrice = latest.current_price ?? latest.avg_price;
    const shares = latest.shares;

    weekPnlAmount += (endPrice - startPrice) * shares;
    totalPnlAmount += (endPrice - latest.avg_price) * shares;
    totalCostBasis += latest.avg_price * shares;
  }

  const weekPnlPct = totalCostBasis > 0 ? (weekPnlAmount / totalCostBasis) * 100 : 0;
  const totalPnlPct = totalCostBasis > 0 ? (totalPnlAmount / totalCostBasis) * 100 : 0;

  return { weekPnlAmount, weekPnlPct, totalPnlAmount, totalPnlPct };
}

/**
 * Format the weekly portfolio report as a plain-text Vietnamese string.
 *
 * Output format (ASCII table, no Markdown):
 * ```
 * BÁO CÁO DANH MỤC TUẦN (29/03 - 04/04)
 *
 * Mã    | Giá đầu tuần | Giá cuối tuần | Thay đổi tuần
 * VCB   | 83.000       | 85.000        | +2.4%
 * FPT   | 117.000      | 115.000       | -1.7%
 *
 * Tổng P&L tuần: +1.500.000 VND (+1.2%)
 * Tổng P&L tích lũy: +7.500.000 VND (+5.6%)
 * ```
 *
 * @param rows    - Open position rows with price data
 * @param summary - Aggregated P&L summary
 * @param opts    - Optional date range override
 */
export function formatWeeklyReport(
  rows: PortfolioRow[],
  summary: WeekSummary,
  opts: FormatOptions = {},
): string {
  const { weekStart, weekEnd } = opts.weekStart
    ? { weekStart: opts.weekStart, weekEnd: opts.weekEnd ?? "" }
    : currentWeekRange();

  const lines: string[] = [];

  lines.push(`BÁO CÁO DANH MỤC TUẦN (${weekStart} - ${weekEnd})`);
  lines.push("");

  // Table header
  lines.push("Mã    | Giá đầu tuần | Giá cuối tuần | Thay đổi tuần");
  lines.push("------+--------------+---------------+--------------");

  for (const row of rows) {
    const code = row.code.padEnd(5, " ");
    const startPriceStr = fmtVnd(row.startOfWeekPrice).padEnd(12, " ");
    const endPriceStr = fmtVnd(row.currentPrice).padEnd(13, " ");
    const changePctStr = fmtPct(row.weekChangePct);
    lines.push(`${code} | ${startPriceStr} | ${endPriceStr} | ${changePctStr}`);
  }

  lines.push("");
  lines.push(`Tổng P&L tuần: ${fmtVndSigned(summary.weekPnlAmount)} (${fmtPct(summary.weekPnlPct)})`);
  lines.push(`Tổng P&L tích lũy: ${fmtVndSigned(summary.totalPnlAmount)} (${fmtPct(summary.totalPnlPct)})`);

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Telegram send helper (production)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sends plain text to the MARKET Telegram channel via the unified notifier.
 * Never throws — logs errors instead.
 */
async function sendTelegram(text: string): Promise<void> {
  try {
    const { sendTelegramMarket } = await import(
      "../../infrastructure/notifiers/telegram.js"
    );
    const ok = await sendTelegramMarket(text, {
      parseMode: "",
      persist: { from_agent: "weekly-portfolio", message_type: "weekly_portfolio" },
    });
    if (!ok) {
      logger.warn("[weeklyPortfolioReport] sendTelegramMarket returned false — check TELEGRAM_BOT_TOKEN / TELEGRAM_INFO_MARKET_GROUP_ID");
    }
  } catch (err) {
    logger.error("[weeklyPortfolioReport] Telegram send failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main exported function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the weekly portfolio report:
 *
 *   1. Query open positions + current prices
 *   2. Query P&L snapshots from last 7 days
 *   3. Compute week-over-week change
 *   4. Format Vietnamese report
 *   5. Send via Telegram (or injected sendFn)
 *
 * A concurrency guard prevents overlapping executions.
 * Never throws — all errors are caught and logged.
 *
 * @idempotency T4 — cron_job_runs recency guard; replay skipped if last success < 90% of weekly cadence (6 days 1h12m window)
 * @param opts - Injectable dependencies for testability
 */
export async function runWeeklyPortfolioReport(
  opts: WeeklyReportOptions = {},
): Promise<void> {
  if (_running) {
    logger.warn("[weeklyPortfolioReport] already running — skipping");
    return;
  }

  _running = true;

  try {
    // If caller injects a full reportFn (used only for concurrency guard tests),
    // delegate entirely to it.
    if (opts.reportFn) {
      await opts.reportFn();
      return;
    }

    // Resolve DB
    const db =
      opts.db ??
      (await (async () => {
        const { getDb } = await import("../../infrastructure/db/schema.js");
        return getDb();
      })());

    // ── T4 dedup guard: skip if already ran within weekly cadence window ──────
    const WEEKLY_CADENCE_MS = 604_800_000;
    if (shouldSkipRecoveryReplay(db, "weeklyPortfolioReport", WEEKLY_CADENCE_MS, opts.nowMsFn)) {
      return;
    }

    // ── Task 1221: DB-backed lock — prevents duplicate runs across restarts ────
    // The in-memory `_running` flag resets on every launchctl restart. A restart
    // that fires the Sunday cron within the lock window of the last run would
    // produce a duplicate report. Guard: use schedulerLockStore (scheduler_locks
    // table) which is the canonical lock mechanism for all scheduler jobs.
    try {
      const lockWindowMinutes = 60;
      ensureSchedulerLocksTable(db);
      if (isSchedulerLockFresh(db, "weeklyPortfolioReport", lockWindowMinutes)) {
        logger.warn(
          "[weeklyPortfolioReport] DB lock held by a recent run — skipping to prevent duplicate report",
        );
        return;
      }
      acquireSchedulerLock(db, "weeklyPortfolioReport", lockWindowMinutes);
    } catch {
      // scheduler_locks table may not exist in minimal test setups — proceed
    }

    // ── Step 1: Query open positions with current prices ─────────────────────
    let positionRows: PositionRow[];
    try {
      positionRows = db
        .prepare<PositionRow, []>(`
          SELECT p.code, p.shares, p.avg_price,
                 mp.price AS current_price
          FROM positions p
          LEFT JOIN market_prices mp ON mp.code = p.code
          WHERE p.closed_at IS NULL
          ORDER BY p.code
        `)
        .all();
    } catch (err) {
      logger.warn("[weeklyPortfolioReport] positions table not found or query failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      positionRows = [];
    }

    const codes = positionRows.map((r) => r.code);

    // ── Step 2: Compute week summary from snapshots ──────────────────────────
    let summary: WeekSummary = { weekPnlAmount: 0, weekPnlPct: 0, totalPnlAmount: 0, totalPnlPct: 0 };
    try {
      summary = computeWeekSummary(db, codes);
    } catch (err) {
      logger.warn("[weeklyPortfolioReport] snapshot query failed — using zeroed summary", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // ── Step 3: Build start-of-week prices per code ──────────────────────────
    const startPriceMap = new Map<string, number>();
    if (codes.length > 0) {
      try {
        const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000)
          .toISOString()
          .slice(0, 10);
        const placeholders = sqlInClause(codes.length);
        const earliest = db
          .prepare<{ code: string; current_price: number | null; avg_price: number }, string[]>(`
            SELECT code, MIN(current_price) AS current_price, avg_price
            FROM portfolio_pnl_snapshots
            WHERE code IN (${placeholders})
              AND date >= ?
            GROUP BY code
            ORDER BY date ASC
          `)
          .all(...codes, sevenDaysAgo);
        for (const row of earliest) {
          startPriceMap.set(row.code, row.current_price ?? row.avg_price);
        }
      } catch {
        // Snapshots unavailable — leave startPriceMap empty
      }
    }

    // ── Step 4: Build portfolio rows ─────────────────────────────────────────
    const portfolioRows: PortfolioRow[] = positionRows.map((pos) => {
      const currentPrice = pos.current_price ?? pos.avg_price;
      const startOfWeekPrice = startPriceMap.get(pos.code) ?? currentPrice;
      const weekChangePct =
        startOfWeekPrice > 0
          ? ((currentPrice - startOfWeekPrice) / startOfWeekPrice) * 100
          : 0;

      // If we have no snapshot data, add total P&L contribution inline
      if (codes.length > 0 && !startPriceMap.has(pos.code)) {
        // Ensure summary reflects this position even without snapshots
        const posTotalPnl = (currentPrice - pos.avg_price) * pos.shares;
        summary = {
          ...summary,
          totalPnlAmount: summary.totalPnlAmount + posTotalPnl,
        };
      }

      return {
        code: pos.code,
        shares: pos.shares,
        avgPrice: pos.avg_price,
        currentPrice,
        startOfWeekPrice,
        weekChangePct,
      };
    });

    // ── Step 5: Format report ────────────────────────────────────────────────
    if (portfolioRows.length === 0) {
      logger.info("[weeklyPortfolioReport] no open positions — skipping send");
      return;
    }

    const reportText = formatWeeklyReport(portfolioRows, summary);

    logger.info(
      `[weeklyPortfolioReport] report ready — positions: ${portfolioRows.length}, ` +
        `weekPnl: ${summary.weekPnlAmount.toFixed(0)} VND (${summary.weekPnlPct.toFixed(1)}%)`,
    );

    // ── Step 6: Send via Telegram ────────────────────────────────────────────
    const send = opts.sendFn ?? sendTelegram;
    try {
      await send(reportText);
    } catch (err) {
      logger.error("[weeklyPortfolioReport] send failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  } catch (err) {
    logger.error("[weeklyPortfolioReport] unhandled error", {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    _running = false;
  }
}
