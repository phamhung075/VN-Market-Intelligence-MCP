/**
 * Infrastructure — Telegram Recap Renderer (FACTORY-INFRA-split-telegramCommands)
 *
 * Pure presentation layer for /recap, /recapw, /recapm. Renders an
 * ALREADY-RESOLVED summary object into Telegram-safe Vietnamese text.
 *
 * Layering fix (restores the correct dependency direction — was infra
 * reaching UP into application/usecases/assembleEveningSummary.ts +
 * generatePeriodicSummary.ts to both FETCH and RENDER the summary):
 *   - This module has ZERO imports from application/usecases/. It never
 *     calls assembleEveningSummary or generatePeriodicSummary.
 *   - Orchestration (the fetch step) now lives in the application usecase
 *     application/usecases/orchestrateRecapCommand.ts, invoked by the
 *     INTERFACE layer (interface/mcp/routes/webhookHandler.ts) — see the
 *     `RecapResolvers` DI contract in ../telegramCommands.ts.
 *   - The types below (EveningRecapData/PeriodicRecapData) are deliberately
 *     NARROW, LOCAL, structural views — not imports of the producer's
 *     EveningSummary/PeriodicSummary types. TypeScript's structural typing
 *     means the real application-layer objects satisfy these views without
 *     any import (zero runtime AND zero compile-time coupling). This is a
 *     scoped decision: full type relocation to domain/ was judged out of
 *     proportion for this task (EveningSummary transitively depends on
 *     BriefingAlert/TopStory/TaSignal/GlobalSnapshot defined inside
 *     assembleBriefing.ts — moving all of those is a much larger blast
 *     radius) — see decision journal FACTORY-INFRA-split-telegramCommands.
 *
 * Rendering logic extracted verbatim from telegramCommands.ts's handleRecap/
 * handleRecapWeek/handleRecapMonth/buildPeriodicTexts + severityLabelVi/
 * directionVi (was lines 706-966) — zero text-output drift.
 *
 * @module infrastructure/notifiers/telegram/recapRenderer
 */

import { fmtNum, stripHtml, chunkStories, splitBlockAtNewlines } from "./format.js";

// ─────────────────────────────────────────────────────────────────────────────
// Narrow structural views (see layering-fix note above)
// ─────────────────────────────────────────────────────────────────────────────

export interface EveningRecapData {
  date: string;
  vnIndex?: { close: number; change: number; changePct: number };
  watchlistMovers: Array<{ code: string; changePct: number; price: number }>;
  topStories: Array<{ title: string }>;
  topAlerts: Array<{ severity: string | null | undefined; message: string }>;
  portfolioPnl?: {
    items: Array<{ code: string; pnlPct: number | null; pnlAmount: number | null }>;
    totalPnlAmount: number;
    totalPnlPct: number;
  } | null;
  foreignFlowMovers?: Array<{ code: string; foreignNetVol: number }>;
}

export interface PeriodicRecapData {
  periodStart: string;
  periodEnd: string;
  newsCount: number;
  alertCount: number;
  reportCount: number;
  keyEvents: Array<{ date: string; title: string; direction: string | null | undefined }>;
  stockPerformance: Record<string, { changePct: number | null }>;
  alertsSummary: { bySeverity: Record<string, number>; topAlerts: string[] };
}

// ─────────────────────────────────────────────────────────────────────────────
// Error messages (shared with the router's "resolver missing / rejected" path)
// ─────────────────────────────────────────────────────────────────────────────

const RECAP_ERROR_TEXT: Record<"day" | "week" | "month", string> = {
  day: "Lỗi khi tổng kết ngày. Vui lòng thử lại sau.",
  week: "Lỗi khi tổng kết tuần. Vui lòng thử lại sau.",
  month: "Lỗi khi tổng kết tháng. Vui lòng thử lại sau.",
};

/** Vietnamese "recap failed" message for a given recap period. */
export function recapErrorMessage(period: "day" | "week" | "month"): string {
  return RECAP_ERROR_TEXT[period];
}

// ─────────────────────────────────────────────────────────────────────────────
// Label helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Map severity string to plain Vietnamese label for alert rendering. */
function severityLabelVi(raw: string | null | undefined): string {
  switch (raw) {
    case "critical": return "Nghiêm trọng";
    case "warning":  return "Cảnh báo";
    case "info":     return "Thông tin";
    case "high":     return "Cao";
    default:         return "Thông tin";
  }
}

/** Map direction string to plain Vietnamese direction word. */
function directionVi(raw: string | null | undefined): string {
  switch (raw) {
    case "up":   return "tăng";
    case "down": return "giảm";
    default:     return "ổn định";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// /recap — day synthesis renderer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Render an already-resolved EveningRecapData into Telegram-chunked Vietnamese
 * text. Pure — never fetches, never throws (malformed input falls back to the
 * same friendly error text as an upstream resolution failure).
 */
export function renderEveningRecap(summary: EveningRecapData): { texts: string[] } {
  try {
    const sectionBlocks: string[] = [];

    // Section 2 — VN-Index (present only when defined)
    if (summary.vnIndex !== undefined) {
      const direction = summary.vnIndex.change >= 0 ? "tăng" : "giảm";
      const absChange = Math.abs(summary.vnIndex.change);
      const absPct = Math.abs(summary.vnIndex.changePct).toLocaleString("vi-VN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      sectionBlocks.push(
        `VN-Index: ${fmtNum(summary.vnIndex.close)} điểm (${direction} ${fmtNum(absChange)} điểm, ${direction} ${absPct}%)`,
      );
    }

    // Section 3 — Watchlist movers (always present)
    {
      const lines: string[] = ["Cổ phiếu nổi bật:"];
      if (summary.watchlistMovers.length === 0) {
        lines.push("Không có cổ phiếu nào biến động đáng kể hôm nay.");
      } else {
        for (const mover of summary.watchlistMovers) {
          const dir = mover.changePct >= 0 ? "tăng" : "giảm";
          const absPct = Math.abs(mover.changePct).toLocaleString("vi-VN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
          lines.push(`${mover.code}: ${dir} +${absPct}% (giá ${fmtNum(mover.price)})`);
        }
      }
      sectionBlocks.push(lines.join("\n"));
    }

    // Section 4 — Top news (present only when non-empty)
    if (summary.topStories.length > 0) {
      const lines: string[] = [`Tin tức nổi bật (${summary.topStories.length} bài):`];
      for (const story of summary.topStories) {
        const title = stripHtml(story.title) || "(không có tiêu đề)";
        lines.push(title);
      }
      sectionBlocks.push(lines.join("\n"));
    }

    // Section 5 — Alerts (present only when non-empty)
    if (summary.topAlerts.length > 0) {
      const lines: string[] = ["Cảnh báo:"];
      for (const alert of summary.topAlerts) {
        const sevLabel = severityLabelVi(alert.severity);
        const msg = alert.message.length > 120
          ? alert.message.slice(0, 120) + "…"
          : alert.message;
        lines.push(`[${sevLabel}] ${msg}`);
      }
      sectionBlocks.push(lines.join("\n"));
    }

    // Section 6 — Portfolio P/L (present only when non-null/undefined)
    if (summary.portfolioPnl != null) {
      const lines: string[] = ["Danh mục:"];
      for (const item of summary.portfolioPnl.items) {
        if (item.pnlPct === null || item.pnlAmount === null) {
          lines.push(`${item.code}: chưa có giá`);
        } else {
          const dir = item.pnlAmount >= 0 ? "lãi" : "lỗ";
          const absPct = Math.abs(item.pnlPct).toLocaleString("vi-VN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
          lines.push(`${item.code}: ${dir} +${absPct}% (${dir} ${fmtNum(Math.abs(item.pnlAmount))} đ)`);
        }
      }
      // Aggregate footer
      const totalDir = summary.portfolioPnl.totalPnlAmount >= 0 ? "lãi" : "lỗ";
      const totalAbsPct = Math.abs(summary.portfolioPnl.totalPnlPct).toLocaleString("vi-VN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      lines.push(
        `Tổng: ${totalDir} +${totalAbsPct}% (${totalDir} ${fmtNum(Math.abs(summary.portfolioPnl.totalPnlAmount))} đ)`,
      );
      sectionBlocks.push(lines.join("\n"));
    }

    // Section 7 — Foreign flow (present only when defined and non-empty)
    if (summary.foreignFlowMovers && summary.foreignFlowMovers.length > 0) {
      const lines: string[] = ["Khối ngoại:"];
      for (const mover of summary.foreignFlowMovers) {
        const dir = mover.foreignNetVol > 0 ? "mua ròng" : "bán ròng";
        lines.push(`${mover.code}: ${dir} ${fmtNum(Math.abs(mover.foreignNetVol))} cổ phiếu`);
      }
      sectionBlocks.push(lines.join("\n"));
    }

    const header = `Tổng kết ngày ${summary.date}`;
    const flatBlocks = sectionBlocks.flatMap((b) => splitBlockAtNewlines(b));
    return { texts: chunkStories(header, flatBlocks, 4096) };
  } catch {
    return { texts: [recapErrorMessage("day")] };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// /recapw and /recapm — periodic synthesis renderer (shared section builder)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Render an already-resolved PeriodicRecapData into Telegram-chunked
 * Vietnamese text. `period` selects the week/month header label and the
 * error-fallback message. Pure — never fetches, never throws.
 */
export function renderPeriodicRecap(
  summary: PeriodicRecapData,
  period: "week" | "month",
): { texts: string[] } {
  try {
    const periodLabel = period === "week" ? "tuần" : "tháng";
    const header = `Tổng kết ${periodLabel} ${summary.periodStart} đến ${summary.periodEnd}`;

    const sectionBlocks: string[] = [];

    // Section 2 — Totals (always present)
    sectionBlocks.push(
      [
        "Tổng quan:",
        `Tin tức: ${summary.newsCount} bài`,
        `Cảnh báo: ${summary.alertCount} cảnh báo`,
        `Báo cáo tài chính: ${summary.reportCount} báo cáo`,
      ].join("\n"),
    );

    // Section 3 — Key events (present only when non-empty)
    if (summary.keyEvents.length > 0) {
      const lines: string[] = ["Sự kiện nổi bật:"];
      const events = summary.keyEvents.slice(0, 5);
      for (const ev of events) {
        const localDate = (ev.date ?? "").slice(0, 10);
        const dir = directionVi(ev.direction);
        const title = stripHtml(ev.title);
        const truncTitle = title.length > 100 ? title.slice(0, 100) + "…" : title;
        lines.push(`${localDate} — ${dir} — ${truncTitle}`);
      }
      sectionBlocks.push(lines.join("\n"));
    }

    // Section 4 — Per-stock moves (present only when at least one non-null changePct)
    {
      const entries = Object.entries(summary.stockPerformance)
        .filter(([, perf]) => perf.changePct !== null)
        .sort((a, b) => Math.abs(b[1].changePct!) - Math.abs(a[1].changePct!));

      if (entries.length > 0) {
        const lines: string[] = ["Biến động cổ phiếu:"];
        for (const [code, perf] of entries) {
          const dir = (perf.changePct ?? 0) >= 0 ? "tăng" : "giảm";
          const absPct = Math.abs(perf.changePct!).toLocaleString("vi-VN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
          lines.push(`${code}: ${dir} +${absPct}%`);
        }
        sectionBlocks.push(lines.join("\n"));
      }
    }

    // Section 5 — Alert breakdown (present only when alertCount > 0)
    if (summary.alertCount > 0) {
      const lines: string[] = ["Phân loại cảnh báo:"];
      for (const [sev, count] of Object.entries(summary.alertsSummary.bySeverity)) {
        lines.push(`${severityLabelVi(sev)}: ${count}`);
      }
      const topAlerts = (summary.alertsSummary.topAlerts ?? []).slice(0, 3);
      for (const msg of topAlerts) {
        const truncMsg = msg.length > 100 ? msg.slice(0, 100) + "…" : msg;
        lines.push(`- ${truncMsg}`);
      }
      sectionBlocks.push(lines.join("\n"));
    }

    const flatBlocks = sectionBlocks.flatMap((b) => splitBlockAtNewlines(b));
    return { texts: chunkStories(header, flatBlocks, 4096) };
  } catch {
    return { texts: [recapErrorMessage(period)] };
  }
}
