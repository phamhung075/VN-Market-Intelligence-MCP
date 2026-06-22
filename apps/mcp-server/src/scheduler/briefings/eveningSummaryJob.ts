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

import type { EveningSummary } from "../../application/usecases/assembleEveningSummary.js";
import { logger } from "../../infrastructure/logger.js";
import {
  computeSectorAverage,
  getStockProfile,
  SECTOR_NAME_VI,
} from "../../domain/services/sectorPeers.js";
import { formatPnlSection } from "../../domain/services/portfolioPnlCalculator.js";
import { VN_INDEX_FRESHNESS_MS } from "../../domain/services/timeConstants.js";
import { TelegramMessageFactory } from "../../infrastructure/notifiers/telegramMessageFactory.js";
import { formatGlobalSnapshotSection } from "./morningBriefingJob.js";
import type { GlobalSnapshot } from "../../application/usecases/assembleBriefing.js";

// ─────────────────────────────────────────────────────────────────────────────
// Concurrency guard
// ─────────────────────────────────────────────────────────────────────────────

let _running = false;

// ─────────────────────────────────────────────────────────────────────────────
// Freshness guard
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true when a vnIndex fetchedAt timestamp is within the last 25 hours.
 * A stale index (e.g. VPS down for >25h) must not trigger a send on its own.
 */
export function isVnIndexFresh(
  fetchedAt: string,
  nowMs: number = Date.now(),
): boolean {
  return nowMs - new Date(fetchedAt).getTime() < VN_INDEX_FRESHNESS_MS;
}

// ─────────────────────────────────────────────────────────────────────────────
// DB-level same-day dedup guard
// Prevents spam when the server restarts near 22:30 and the cron re-fires.
//
// Quality-aware: if the most recent evening-summary row sent today has stale
// vnIndex data (content contains " (cũ)" — written by formatEveningSummaryLines
// when isVnIndexFresh() is false), the slot is re-opened so the job can retry
// once fresh data is available.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true when a valid (fresh-data) evening summary has already been sent
 * today, false otherwise.
 *
 * "Valid" means the persisted message content does NOT contain the stale-data
 * marker " (cũ)" that formatEveningSummaryLines appends when vnIndex.fetchedAt
 * is more than 25 hours before the send time.
 *
 * Exported as `alreadySentTodayForTest` for unit-test access only — production
 * code uses the `alreadySentToday` alias below.
 */
export function alreadySentTodayForTest(
  db: import("bun:sqlite").Database,
): boolean {
  try {
    const row = db
      .prepare<{ content: string } | null, []>(
        `SELECT content
         FROM market_messages
         WHERE from_agent = 'evening-summary'
           AND sent_at >= date('now')
         ORDER BY sent_at DESC
         LIMIT 1`,
      )
      .get();

    if (!row) return false; // no row today — allow run

    // If the stored content carries the stale-data marker, the prior run used
    // stale vnIndex data. Re-open the slot so a retry can produce a fresh report.
    const wasStale = row.content.includes(" (cũ)");
    return !wasStale;
  } catch {
    return false; // fail-open: don't suppress if DB check fails
  }
}

/** Internal alias used by the production code path. */
const alreadySentToday = alreadySentTodayForTest;

/** Reset concurrency guard — exported for test isolation. */
export function resetEveningSummaryGuard(): void {
  _running = false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Vietnamese dot-thousands formatter: 1285 → "1.285" */
function fmtThousands(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Format a trading volume as a compact human-readable string.
 * >= 1_000_000 → "X.XM", >= 1_000 → "X.XK", otherwise raw rounded number.
 * Examples: 7_000_000 → "7.0M", 500_000 → "500.0K", 1_200 → "1.2K"
 */
function fmtVolume(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(Math.round(v));
}

/** Mover entry accepted by formatMoversSection. volume and rsi14 are optional. */
type MoverEntry = {
  code: string;
  changePct: number;
  volume?: number;
  rsi14?: number | null;
};

/**
 * Format a single mover ticker line: "CODE: +X.XX% | Vol: Y | RSI: Z"
 * Vol is "N/A" when volume is undefined. RSI is "N/A" when rsi14 is null/undefined.
 */
function fmtMoverLine(prefix: string, m: MoverEntry): string {
  const sign = m.changePct >= 0 ? "+" : "";
  const volStr = m.volume != null ? fmtVolume(m.volume) : "N/A";
  const rsiStr = m.rsi14 != null ? m.rsi14.toFixed(1) : "N/A";
  return `${prefix}${m.code}: ${sign}${m.changePct.toFixed(2)}% | Vol: ${volStr} | RSI: ${rsiStr}`;
}

/**
 * Formats watchlistMovers into sector-grouped + flat lines.
 * Exported for unit-test isolation (Task 1424 / 1425).
 *
 * @param movers - MoverEntry[] sorted |changePct| DESC (from assembleEveningSummary)
 * @returns string[] — ready to push onto the message lines array
 */
export function formatMoversSection(
  movers: MoverEntry[],
): string[] {
  if (movers.length === 0) return [];

  // Group by domain
  const sectorMap = new Map<string, MoverEntry[]>();
  for (const m of movers) {
    const profile = getStockProfile(m.code);
    const domain = profile?.domain ?? "other";
    if (!sectorMap.has(domain)) sectorMap.set(domain, []);
    sectorMap.get(domain)!.push(m);
  }

  // Split: multi-mover sectors (>=2, not "other") vs single-mover
  const multiSectors: { domain: string; movers: MoverEntry[]; avgPct: number }[] = [];
  const singleMovers: MoverEntry[] = [];

  for (const [domain, domainMovers] of sectorMap.entries()) {
    if (domain !== "other" && domainMovers.length >= 2) {
      const avgPct = computeSectorAverage(domainMovers) ?? 0;
      multiSectors.push({ domain, movers: domainMovers, avgPct });
    } else {
      singleMovers.push(...domainMovers);
    }
  }

  // No multi-mover sector → flat block only (backward-compat)
  if (multiSectors.length === 0) {
    const lines: string[] = ["", "Biến động giá:"];
    for (const m of singleMovers) {
      lines.push(fmtMoverLine("  ", m));
    }
    return lines;
  }

  // Sort sectors by |avgPct| DESC
  multiSectors.sort((a, b) => Math.abs(b.avgPct) - Math.abs(a.avgPct));

  const lines: string[] = ["", "Biến động theo ngành:"];
  for (const sector of multiSectors) {
    const sectorLabel = (SECTOR_NAME_VI as Record<string, string>)[sector.domain] ?? sector.domain;
    const sign = sector.avgPct >= 0 ? "+" : "";
    lines.push(`  ${sectorLabel} (+${sector.movers.length} cp): avg ${sign}${sector.avgPct.toFixed(2)}%`);
    for (const m of sector.movers.slice(0, 5)) {
      lines.push(fmtMoverLine("    ", m));
    }
  }

  // Flat block for single-mover tickers
  if (singleMovers.length > 0) {
    lines.push("", "Biến động giá:");
    for (const m of singleMovers) {
      lines.push(fmtMoverLine("  ", m));
    }
  }

  return lines;
}

// ─────────────────────────────────────────────────────────────────────────────
// Foreign flow formatter (Task 1503)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format the "Khối ngoại" (foreign investor flow) block for the evening Telegram message.
 *
 * @param movers - Array of ForeignFlowMover entries ordered by |foreignNetVol| DESC.
 * @returns string[] — ready to push onto the message lines array. Empty when movers is empty.
 */
export function formatForeignFlowSection(
  movers: { code: string; foreignNetVol: number; foreignBuyVol: number; foreignSellVol: number }[],
): string[] {
  if (movers.length === 0) return [];

  // Filter to nonzero net-vol entries only — SQL already excludes zeros, but
  // this defensive guard also covers the injected-fn path and edge cases where
  // a partial-zero set slips through (e.g. getForeignFlowMoversFn returns raw DB rows).
  const nonZeroMovers = movers.filter((m) => m.foreignNetVol !== 0);
  if (nonZeroMovers.length === 0) {
    return ["", "Khối ngoại: Dữ liệu không khả dụng (pipeline tạm dừng)"];
  }

  // Sort by |net_flow| descending — biggest movers first.
  const sorted = [...nonZeroMovers].sort(
    (a, b) => Math.abs(b.foreignNetVol) - Math.abs(a.foreignNetVol),
  );

  const lines: string[] = ["", `Khối ngoại (top ${sorted.length}):`];
  for (const m of sorted) {
    const direction = m.foreignNetVol >= 0 ? "mua ròng" : "bán ròng";
    const netK = (Math.abs(m.foreignNetVol) / 1000).toFixed(3);
    const buyK = (m.foreignBuyVol / 1000).toFixed(3);
    const sellK = (m.foreignSellVol / 1000).toFixed(3);
    lines.push(`  ${m.code}: ${direction} ${netK}k (mua ${buyK}k / bán ${sellK}k)`);
  }
  return lines;
}

// ─────────────────────────────────────────────────────────────────────────────
// Evening message formatter (exported for unit testing — task 1512)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build Telegram lines for the evening summary.
 * Exported for unit testing (task 1512).
 */
export function formatEveningSummaryLines(summary: EveningSummary): string[] {
  const lines: string[] = [`TÓM TẮT BUỔI TỐI ${summary.date}`];

  // VN-Index close — first content line (FR-4, REQ-1426)
  if (summary.vnIndex) {
    const { close, change, changePct } = summary.vnIndex;
    const closeFmt = fmtThousands(close);
    const chSign = change >= 0 ? "+" : "";
    const pctSign = changePct >= 0 ? "+" : "";
    const freshSuffix = isVnIndexFresh(summary.vnIndex.fetchedAt) ? "" : " (cũ)";
    lines.push(
      `VN-Index: ${closeFmt} (${chSign}${Math.round(change)} / ${pctSign}${changePct.toFixed(2)}%)${freshSuffix}`,
    );
  }

  if (summary.topAlerts.length > 0) {
    lines.push("");
    lines.push(`Cảnh báo (${summary.topAlerts.length}):`);
    for (const a of summary.topAlerts.slice(0, 5)) {
      lines.push(`  [${a.severity.toUpperCase()}] ${TelegramMessageFactory.formatAlertMessage(a.message)}`);
    }
  }

  if (summary.topStories.length > 0) {
    lines.push("");
    lines.push(`Tin quan trọng (${summary.topStories.length}):`);
    for (const s of summary.topStories.slice(0, 5)) {
      lines.push(`  - ${TelegramMessageFactory.formatStoryTitle(s.title)}`);
    }
  }

  // News count diagnostic line (Task 1323)
  const newsCount = summary.newsCount ?? 0;
  if (newsCount > 0) {
    lines.push("");
    lines.push(`(${newsCount} tin tức hôm nay)`);
  }

  lines.push(...formatMoversSection(summary.watchlistMovers));

  if (summary.predictionSignals.length > 0) {
    lines.push("");
    lines.push(`Tín hiệu dự đoán (${summary.predictionSignals.length}):`);
    for (const p of summary.predictionSignals.slice(0, 3)) {
      lines.push(`  ${p.question.slice(0, 70)}`);
    }
  }

  const nonNeutralTa = (summary.taSummary ?? []).filter(
    (s) => s.rsiStatus !== "neutral",
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

  // ── Portfolio P&L (task 1441/1442) ──────────────────────────────
  if (summary.portfolioPnl != null && summary.portfolioPnl.items.length > 0) {
    const pnlBlock = formatPnlSection(summary.portfolioPnl);
    if (pnlBlock.length > 0) {
      lines.push("");
      lines.push(pnlBlock);
    }
  }

  // ── Khối ngoại / Foreign flow (task 1503) ───────────────────────
  lines.push(...formatForeignFlowSection(summary.foreignFlowMovers ?? []));

  // ── Global snapshot (task 1512) ──────────────────────────────────
  if (summary.globalSnapshot) {
    lines.push("");
    lines.push(...formatGlobalSnapshotSection(summary.globalSnapshot as GlobalSnapshot));
  }

  // ── Data crisis detection (FR-3) ──────────────────────────────────
  // If watchlistMovers + topStories both empty, check if reason is stale data
  if (summary.watchlistMovers.length === 0 && summary.topStories.length === 0) {
    const priceAgeMs = summary.lastPriceUpdate
      ? Date.now() - new Date(summary.lastPriceUpdate).getTime()
      : Infinity;
    const newsAgeMs = summary.lastNewsUpdate
      ? Date.now() - new Date(summary.lastNewsUpdate).getTime()
      : Infinity;

    // NOTE: Data pipeline warnings are operational alerts handled by vpsProxyWatchdogJob
    // (sent to WORK channel). User-facing briefings do NOT include infrastructure warnings.
  }

  return lines;
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
        const { getDb } = await import("../../infrastructure/db/index.js");
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
          "../../application/usecases/assembleEveningSummary.js"
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
    // Freshness gate: suppress stale-only messages when VPS is down.
    // If no real signals AND vnIndex.fetchedAt >25h old, suppress send.
    const hasRealSignals =
      summary.topStories.length > 0 ||
      summary.topAlerts.length > 0 ||
      summary.watchlistMovers.length > 0 ||
      summary.predictionSignals.length > 0 ||
      (summary.taSummary ?? []).some(
        (s) => s.rsiStatus !== "neutral",
      ) ||
      (summary.portfolioPnl != null && summary.portfolioPnl.items.length > 0) ||
      (summary.foreignFlowMovers?.length ?? 0) > 0;

    // Freshness check: if no real signals AND vnIndex is stale (>25h), suppress send.
    const vnIndexStaleWithNoSignals =
      !hasRealSignals &&
      summary.vnIndex != null &&
      !isVnIndexFresh(summary.vnIndex.fetchedAt);

    const hasContent = hasRealSignals && !vnIndexStaleWithNoSignals;

    // Resolve the send function: use injected sendFn for tests, or dynamic import in prod.
    const doSend =
      sendFn ??
      (async (message: string, opts: unknown) => {
        const { sendTelegramMarket } = await import(
          "../../infrastructure/notifiers/telegram.js"
        );
        await sendTelegramMarket(
          message,
          opts as Parameters<typeof sendTelegramMarket>[1],
        );
      });

    if (hasContent) {
      try {
        const lines = formatEveningSummaryLines(summary);

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
