/**
 * Morning Briefing Job — Task 101 (Interface / Scheduler Layer)
 *
 * Thin cron wrapper around the `assembleBriefing` application use case.
 * Registered in `jobs.ts` at 08:00 Asia/Ho_Chi_Minh weekdays (0 8 * * 1-5).
 *
 * A concurrency guard prevents a second invocation from starting while the
 * previous briefing is still assembling.
 *
 * Layer: interface/scheduler — imports from application/usecases only.
 */

import type {
  DailyBriefing,
  InsiderBriefingRow,
  ForeignFlowBriefingRow,
  EvidenceScoreBriefingRow,
  TaSignal,
  BctcDeadlineRow,
} from "../../application/usecases/assembleBriefing.js";
import { BEARISH_WARNING_THRESHOLD } from "../../application/usecases/assembleBriefing.js";
import { TelegramMessageFactory } from "../../infrastructure/notifiers/telegramMessageFactory.js";
import { formatPnlSection } from "../../domain/services/portfolioPnlCalculator.js";
import { isVnIndexFresh } from "./format/vnIndexFreshness.js";
import { formatGlobalSnapshotSection } from "./format/globalSnapshotSection.js";
import { logger } from "../../infrastructure/logger.js";

// Re-exported for back-compat — tests (1511/1512) import formatGlobalSnapshotSection
// directly from this job file. Shared formatter now lives in ./format/ (FACTORY-
// SCHEDULER-dedup-briefing-formatters) — this removes the former job→job import
// that eveningSummaryJob.ts and franceSummaryJob.ts used to reach into this file.
export { formatGlobalSnapshotSection } from "./format/globalSnapshotSection.js";

// ─────────────────────────────────────────────────────────────────────────────
// Formatter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns " ↑" / " ↓" / "" depending on direction vs previous value.
 * Returns "" when prev is undefined or zero (no baseline to compare).
 */
function deltaArrow(current: number, prev: number | undefined): string {
  if (prev === undefined || prev === 0) return "";
  return current > prev ? " ↑" : current < prev ? " ↓" : "";
}

/**
 * Format the commodities section as an array of lines.
 * Renders up to 5 items as "  Name: value unit ↑/↓".
 * Returns an empty array when the list is empty.
 * Exported for unit testing (task 1434/1435).
 */
export function formatCommoditiesSection(
  commodities: { indicator: string; value: number; unit: string; dataPoints: number; previousValue?: number; isStale?: boolean }[],
): string[] {
  if (commodities.length === 0) return [];
  const lines: string[] = ["📦 Hàng hóa:"];
  for (const c of commodities.slice(0, 5)) {
    // FIX-COMMODITY-WTI-DELTA-CORRUPT (I10): a news-mined indicator (e.g. wti_crude_usd,
    // no live fetcher) whose latest row is stale (>4h, DSI-MACRO-PHANTOM-STALE-GUARD)
    // must never be presented as an unqualified "current" price — surface it explicitly,
    // same [STALE] convention already used for watchlist prices (marketContextBuilder.ts).
    const staleFlag = c.isStale ? " [STALE]" : "";
    lines.push(`  ${c.indicator}: ${c.value} ${c.unit}${deltaArrow(c.value, c.previousValue)}${staleFlag}`.trimEnd());
  }
  return lines;
}

/**
 * Format a DailyBriefing as a compact Telegram message string.
 * Exported for unit testing (AC-5 / AC-6 in task 1159).
 * Plain-text output — no Markdown to avoid Telegram parse errors.
 */
export function formatBriefingMessage(briefing: DailyBriefing): string {
  const lines: string[] = [`📋 BẢN TIN SÁNG ${briefing.date}`];

  // ── VN-Index ──────────────────────────────────────────────
  if (briefing.vnIndex) {
    lines.push("");
    const { price, changePct, change } = briefing.vnIndex;
    // Vietnamese dot-thousands: 1285 → "1.285"
    const priceFmt = Math.round(price).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    const pctSign = changePct >= 0 ? "+" : "";
    let suffix: string;
    if (change !== undefined) {
      const chSign = change >= 0 ? "+" : "";
      suffix = `(${chSign}${Math.round(change)} / ${pctSign}${changePct.toFixed(2)}%)`;
    } else {
      suffix = `(${pctSign}${changePct.toFixed(2)}%)`;
    }
    const staleSuffix =
      briefing.vnIndex.fetchedAt && !isVnIndexFresh(briefing.vnIndex.fetchedAt) ? " (cũ)" : "";
    lines.push(`📈 VN-Index: ${priceFmt} ${suffix}${staleSuffix}`);
  }
  // omit section entirely when null

  // ── Watchlist prices ──────────────────────────────────────
  if (briefing.watchlistSummary.length > 0) {
    const entries = briefing.watchlistSummary.filter((w) => w.price != null);
    if (entries.length > 0) {
      lines.push("");
      lines.push("📊 Giá cổ phiếu:");
      for (const w of entries) {
        const price = w.price!.toLocaleString("en-US");
        const chg = w.changePct != null ? ` (${w.changePct >= 0 ? "+" : ""}${w.changePct.toFixed(2)}%)` : "";
        lines.push(`  ${w.code}: ${price}${chg}`);
      }
    }
  }
  // omit header+entries entirely when empty or all null prices

  // ── Top stories ───────────────────────────────────────────
  if (briefing.topStories.length > 0) {
    lines.push("");
    lines.push("📰 Tin quan trọng:");
    for (const s of briefing.topStories.slice(0, 3)) {
      const sentIcon = s.sentiment === "bullish" ? "🟢" : s.sentiment === "bearish" ? "🔴" : "⚪";
      lines.push(`  ${sentIcon} ${TelegramMessageFactory.formatStoryTitle(s.title)}`);
    }
  }

  // ── Unresolved alerts ─────────────────────────────────────
  if (briefing.unresolvedAlerts && briefing.unresolvedAlerts.length > 0) {
    lines.push("");
    lines.push(`🚨 ${briefing.unresolvedAlerts.length} cảnh báo chưa xử lý:`);
    for (const a of briefing.unresolvedAlerts.slice(0, 3)) {
      lines.push(`  • [${a.severity.toUpperCase()}] ${TelegramMessageFactory.formatAlertMessage(a.message)}`);
    }
  }

  // ── Top conviction ────────────────────────────────────────
  if (briefing.topConviction) {
    lines.push("");
    lines.push(briefing.topConviction.summary);
  }

  // ── Sensitive dates ───────────────────────────────────────
  if (briefing.sensitiveWarnings && briefing.sensitiveWarnings.length > 0) {
    lines.push("");
    for (const w of briefing.sensitiveWarnings.slice(0, 2)) {
      lines.push(w);
    }
  }

  // ── Macro abnormalities ───────────────────────────────────
  if (briefing.macroSnapshot && briefing.macroSnapshot.length > 0) {
    const abnormal = briefing.macroSnapshot.filter((m) => !m.status.includes("bình thường"));
    if (abnormal.length > 0) {
      lines.push("");
      lines.push("🌍 Macro bất thường:");
      for (const m of abnormal.slice(0, 3)) {
        lines.push(`  ${m.status}`);
      }
    }
  }

  // ── Tracked commodities (top 5) ──────────────────────────
  const commodityLines = formatCommoditiesSection(briefing.trackedCommodities ?? []);
  if (commodityLines.length > 0) {
    lines.push("");
    for (const l of commodityLines) lines.push(l);
  }

  // ── Global market snapshot ────────────────────────────────
  if (briefing.globalSnapshot) {
    const snapLines = formatGlobalSnapshotSection(briefing.globalSnapshot);
    if (snapLines.length > 0) {
      lines.push("");
      for (const l of snapLines) lines.push(l);
    }
  }

  // ── New reports ────────────────────────────────────────────
  if (briefing.newReports.length > 0) {
    lines.push("");
    lines.push("📄 BCTC mới:");
    for (const r of briefing.newReports) {
      lines.push(`  ${r.code} — ${r.period}`);
    }
  }

  // ── Insider Mới ──────────────────────────────────────────────────────────────
  if (briefing.insiderRecent && briefing.insiderRecent.length > 0) {
    lines.push("");
    lines.push("👤 Insider Mới:");
    for (const row of briefing.insiderRecent as InsiderBriefingRow[]) {
      const typeLabel =
        row.type === "buy" ? "MUA" : row.type === "sell" ? "BÁN" : "KHÁC";
      const vol = row.executedVolume.toLocaleString("en-US");
      lines.push(`  ${row.code}: ${typeLabel} ${vol} cp — ${row.insiderName}`);
    }
  }

  // ── Dòng Tiền Ngoại ──────────────────────────────────────────────────────────
  if (briefing.foreignFlowSummary && briefing.foreignFlowSummary.length > 0) {
    lines.push("");
    lines.push("🌊 Dòng Tiền Ngoại:");
    for (const row of briefing.foreignFlowSummary as ForeignFlowBriefingRow[]) {
      const dirLabel = row.direction === "net_buy" ? "MUA RÒNG" : "BÁN RÒNG";
      const vol = Math.abs(row.foreignVolume).toLocaleString("en-US");
      lines.push(`  ${row.code}: ${dirLabel} ${vol}`);
    }
  }

  // ── Tích Lũy Bằng Chứng ──────────────────────────────────────────────────────
  if (briefing.evidenceTopScores && briefing.evidenceTopScores.length > 0) {
    lines.push("");
    lines.push("🧠 Tích Lũy Bằng Chứng:");
    for (const row of briefing.evidenceTopScores as EvidenceScoreBriefingRow[]) {
      const icon =
        row.netScore > 0 ? "🟢" : row.netScore < BEARISH_WARNING_THRESHOLD ? "🔴" : "⚪";
      lines.push(
        `  ${icon} ${row.code}: net=${row.netScore.toFixed(2)} ` +
          `(bull=${row.bullishScore.toFixed(2)}/bear=${row.bearishScore.toFixed(2)}, ` +
          `${row.fragmentCount} mảnh)`,
      );
    }
  }

  // ── TA Tín hiệu ──────────────────────────────────────────────────────────────
  if (briefing.taSummary && briefing.taSummary.length > 0) {
    lines.push("");
    lines.push("📡 TA Tín hiệu:");
    for (const sig of briefing.taSummary as TaSignal[]) {
      const rsiPart =
        sig.rsiStatus === "overbought" ? `RSI=${sig.rsi14!.toFixed(1)} (quá mua)` :
        sig.rsiStatus === "oversold"   ? `RSI=${sig.rsi14!.toFixed(1)} (quá bán)` :
        "";
      const maPart =
        sig.priceVsMa20 === "above" ? "| giá trên MA20" :
        sig.priceVsMa20 === "below" ? "| giá dưới MA20" :
        "";
      const parts = [rsiPart, maPart].filter(Boolean).join(" ");
      lines.push(`  ${sig.code}: ${parts}`);
    }
  }

  // ── BCTC sắp đến ─────────────────────────────────────────────────────────────
  if (briefing.upcomingDeadlines && briefing.upcomingDeadlines.length > 0) {
    lines.push("");
    lines.push("📅 BCTC sắp đến:");
    for (const row of briefing.upcomingDeadlines as BctcDeadlineRow[]) {
      if (row.status === "QUA_HAN") {
        lines.push(
          `  ${row.code}: Q${row.quarter}/${row.year} — QUÁ HẠN ${Math.abs(row.daysUntilDeadline)} ngày`
        );
      } else {
        lines.push(
          `  ${row.code}: Q${row.quarter}/${row.year} — hạn ${row.deadline} (${row.daysUntilDeadline} ngày)`
        );
      }
    }
  }

  // ── Portfolio P&L (task 1438/1439) ───────────────────────────────────────
  if (briefing.portfolioPnl != null && briefing.portfolioPnl.items.length > 0) {
    const pnlBlock = formatPnlSection(briefing.portfolioPnl);
    if (pnlBlock.length > 0) {
      lines.push("");
      lines.push(pnlBlock);
    }
  }

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Concurrency guard
// ─────────────────────────────────────────────────────────────────────────────

let isRunning = false;
/** Date string of last Telegram briefing sent — prevents duplicates on restart. */
let _lastBriefingSentDate = "";

/** Reset concurrency guard — exported for test isolation. */
export function resetMorningBriefingGuard(): void {
  isRunning = false;
  _lastBriefingSentDate = "";
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute one morning briefing cycle.
 *
 * Accepts an optional `briefingFn` parameter for testing (avoids importing the
 * real `assembleBriefing` in tests, which would trigger DB and HTTP dependencies).
 * In production the default `briefingFn` dynamically imports `assembleBriefing`.
 *
 * @param briefingFn - Optional override for the briefing function (injectable for tests)
 */
export async function runMorningBriefing(
  briefingFn?: () => Promise<DailyBriefing>,
): Promise<void> {
  if (isRunning) {
    logger.warn("[morning-briefing] previous cycle still running — skipped");
    return;
  }

  isRunning = true;

  try {
    // Resolve briefing function: injected override or real assembleBriefing
    const fn =
      briefingFn ??
      (async () => {
        const { assembleBriefing } = await import(
          "../../application/usecases/assembleBriefing.js"
        );
        return assembleBriefing();
      });

    const briefing = await fn();

    logger.info(
      `[morning-briefing] cycle complete — ` +
        `date: ${briefing.date}, ` +
        `stories: ${briefing.topStories.length}, ` +
        `alerts: ${briefing.alerts.length}, ` +
        `watchlist: ${briefing.watchlistSummary.length}, ` +
        `newReports: ${briefing.newReports.length}`,
    );

    // ── Send briefing to Telegram (task 147) ─────────────────────────────
    // Dedup: check both in-memory AND SQLite (survives restarts)
    let alreadySent = _lastBriefingSentDate === briefing.date;
    if (!alreadySent) {
      try {
        // briefing_log DDL is now canonical in initDatabase() (task 1040)
        const { getDb } = await import("../../infrastructure/db/schema.js");
        const db = getDb();
        const row = db.query<{ date: string }, [string]>(
          "SELECT date FROM briefing_log WHERE date = ?",
        ).get(briefing.date);
        if (row) alreadySent = true;
      } catch { /* best effort */ }
    }

    // ── Empty-data guard: skip Telegram when briefing has no useful content ──
    const hasContent =
      briefing.vnIndex != null ||
      briefing.watchlistSummary.length > 0 ||
      briefing.topStories.length > 0 ||
      briefing.alerts.length > 0 ||
      briefing.newReports.length > 0 ||
      (briefing.unresolvedAlerts && briefing.unresolvedAlerts.length > 0);

    if (!hasContent) {
      logger.info("[morning-briefing] briefing has no useful data — skipping Telegram send");
    } else if (alreadySent) {
      logger.debug("[morning-briefing] Telegram already sent for today — skipping");
    } else {
    try {
      const { sendTelegramMarket } = await import(
        "../../infrastructure/notifiers/telegram.js"
      );

      // Format briefing as a compact Telegram message — always show all sections
      const text = formatBriefingMessage(briefing);

      // Persist the full pre-split text once before chunking (Sprint 068).
      // The chunk loop sends slices, so we insert the complete content here
      // rather than inside the loop where only a partial chunk would be stored.
      try {
        const { getDb: getDbForPersist } = await import("../../infrastructure/db/schema.js");
        const { insertMarketMessage } = await import("../../infrastructure/db/marketMessageStore.js");
        insertMarketMessage(getDbForPersist(), {
          from_agent: "morning-briefing",
          message_type: "morning_briefing",
          ticker: null,
          content: text,
        });
      } catch { /* best effort — send must not be blocked */ }

      // Telegram limit: 4096 chars per message. Split if needed.
      // skipPersist=true on all send calls because the full text was already
      // persisted to market_messages above (before chunking) — prevents duplicate
      // rows with from_agent="unknown" (bug 1263).
      const MAX_CHUNK = 4000;
      if (text.length <= MAX_CHUNK) {
        await sendTelegramMarket(text, { parseMode: "", skipPersist: true });
      } else {
        for (let i = 0; i < text.length; i += MAX_CHUNK) {
          await sendTelegramMarket(text.slice(i, i + MAX_CHUNK), { parseMode: "", skipPersist: true });
        }
      }

      _lastBriefingSentDate = briefing.date;
      // Persist to SQLite so it survives restarts
      try {
        const { getDb } = await import("../../infrastructure/db/schema.js");
        const db = getDb();
        db.prepare(`INSERT OR IGNORE INTO briefing_log (date, sent_at) VALUES (?, ?)`).run(briefing.date, new Date().toISOString());
      } catch { /* best effort */ }
      logger.info("[morning-briefing] sent to Telegram", { chars: text.length });
    } catch (tgErr) {
      logger.warn("[morning-briefing] Telegram send failed — briefing still saved to file", {
        error: tgErr instanceof Error ? tgErr.message : String(tgErr),
      });
    }
    } // end dedup check
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error("[morning-briefing] unhandled error in briefing cycle", { error: errMsg });
    // Notify WORK channel — do NOT fall back to stale cached briefing (task 1290)
    try {
      const { sendTelegramWork } = await import(
        "../../infrastructure/notifiers/telegram.js"
      );
      await sendTelegramWork(
        `morningBriefingJob failed — assembleBriefing error: ${errMsg}`,
      );
    } catch { /* best effort — Telegram itself may be unavailable */ }
  } finally {
    isRunning = false;
  }
}
