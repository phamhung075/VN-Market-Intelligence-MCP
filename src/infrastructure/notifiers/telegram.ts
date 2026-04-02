/**
 * Infrastructure — Telegram Bot Notifier
 *
 * Sends notifications to a Telegram chat via the Telegram Bot API.
 * Uses plain fetch() (Bun native) — no third-party Telegram SDK required.
 *
 * DDD layer: infrastructure/notifiers
 *
 * Design rules:
 *   - Never throws — all errors are caught and returned as false / logged as warnings
 *   - Returns true on HTTP 200, false on any failure
 *   - Reads TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID from Bun.env
 *   - Both env vars are optional — missing config silently returns false
 *   - TELEGRAM_BOT_TOKEN is NEVER logged (security)
 */

import type { Alert } from "../../domain/services/alertGenerator.js";
import { detectSensitiveDates } from "../../domain/services/priceNewsValidator.js";
import { createLogger } from "../logger.js";
import { getPatternSummary } from "../../application/usecases/getPatternSummary.js";

const log = createLogger("info");

// ─────────────────────────────────────────────────────────────────────────────
// Exported interfaces
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Injectable fetch function for testing.
 * Defaults to globalThis.fetch (Bun built-in).
 */
export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Options for sendTelegramMessage.
 */
export interface SendTelegramOptions {
  /** Telegram parse mode. Default: "Markdown". */
  parseMode?: string;
  /** Injectable fetch function for tests. Default: globalThis.fetch. */
  fetchFn?: FetchFn;
}

/**
 * Options for notifyTelegramAlert / notifyTelegramDocument — injectable fetch.
 */
export interface NotifyOptions {
  /** Injectable fetch function for tests. Default: globalThis.fetch. */
  fetchFn?: FetchFn;
}

/**
 * TelegramNotifier — interface for dependency injection.
 * Implementations can be swapped in tests.
 */
export interface TelegramNotifier {
  sendTelegramMessage(text: string, options?: SendTelegramOptions): Promise<boolean>;
  notifyTelegramAlert(alert: Alert, options?: NotifyOptions): Promise<boolean>;
  notifyTelegramDocument(
    doc: { actionCode: string; title: string; publishedAt: string },
    options?: NotifyOptions,
  ): Promise<boolean>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core send function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sends a text message to the configured Telegram chat.
 * Never throws — returns false on any error and logs a warning.
 *
 * @param text    - The message text to send.
 * @param options - Optional parse mode and injectable fetch function.
 * @returns true on HTTP 200, false on any failure.
 */
export async function sendTelegramMessage(
  text: string,
  options: SendTelegramOptions = {},
): Promise<boolean> {
  const botToken = Bun.env.TELEGRAM_BOT_TOKEN ?? "";
  const chatId = Bun.env.TELEGRAM_CHAT_ID ?? "";

  if (!botToken) {
    log.warn("[telegram] TELEGRAM_BOT_TOKEN is not set — skipping send");
    return false;
  }

  if (!chatId) {
    log.warn("[telegram] TELEGRAM_CHAT_ID is not set — skipping send");
    return false;
  }

  const parseMode = options.parseMode ?? "Markdown";
  const fetchFn = options.fetchFn ?? (globalThis.fetch as FetchFn);

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const body = JSON.stringify({
    chat_id: chatId,
    text,
    parse_mode: parseMode,
    // Disable link previews to reduce payload and avoid preview-fetch timeouts
    disable_web_page_preview: true,
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      // If Markdown parse failed (400), retry as plain text
      const status = response.status;
      if (status === 400 && parseMode !== "") {
        log.warn("[telegram] Markdown parse failed — retrying as plain text", { chatId });
        clearTimeout(timeoutId);
        return sendTelegramMessage(text, { ...options, parseMode: "" });
      }
      log.warn("[telegram] sendMessage failed", { status, chatId });
      return false;
    }

    return true;
  } catch (err) {
    log.warn("[telegram] sendMessage network error", {
      error: err instanceof Error ? err.message : String(err),
      chatId,
    });
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Report channel — inter-agent communication (TELEGRAM_REPORT_ID)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sends a message to the REPORT channel (TELEGRAM_REPORT_ID).
 * Used for inter-agent communication: feedback, improvement reports, dev requests.
 * Separate from the user alert channel (TELEGRAM_CHAT_ID).
 *
 * @param text    - The message text.
 * @param options - Optional parse mode and injectable fetch.
 * @returns true on success, false on failure.
 */
export async function sendTelegramReport(
  text: string,
  options: SendTelegramOptions = {},
): Promise<boolean> {
  const botToken = Bun.env.TELEGRAM_BOT_TOKEN ?? "";
  const reportChatId = Bun.env.TELEGRAM_REPORT_ID ?? "";

  if (!botToken) {
    log.warn("[telegram] TELEGRAM_BOT_TOKEN is not set — skipping report send");
    return false;
  }

  if (!reportChatId) {
    log.warn("[telegram] TELEGRAM_REPORT_ID is not set — skipping report send");
    return false;
  }

  const parseMode = options.parseMode ?? "";
  const fetchFn = options.fetchFn ?? (globalThis.fetch as FetchFn);

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const body = JSON.stringify({
    chat_id: reportChatId,
    text,
    parse_mode: parseMode || undefined,
    disable_web_page_preview: true,
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      log.warn("[telegram] sendReport failed", { status: response.status, chatId: reportChatId });
      return false;
    }

    return true;
  } catch (err) {
    log.warn("[telegram] sendReport network error", {
      error: err instanceof Error ? err.message : String(err),
      chatId: reportChatId,
    });
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Alert formatter (Vietnamese)
// ─────────────────────────────────────────────────────────────────────────────

/** Map severity to emoji + Vietnamese label. */
const SEVERITY_LABEL: Record<string, { emoji: string; label: string }> = {
  critical: { emoji: "🚨", label: "NGHIÊM TRỌNG" },
  high: { emoji: "🔴", label: "QUAN TRỌNG" },
  medium: { emoji: "🟡", label: "LƯU Ý" },
  low: { emoji: "🟢", label: "THÔNG TIN" },
};

/** Map signal type to Vietnamese description. */
const SIGNAL_TYPE_VI: Record<string, string> = {
  price_drop: "Giá giảm",
  price_surge: "Giá tăng",
  volume_spike: "KL bất thường",
  report_new: "BCTC mới",
  news_mention: "Tin liên quan",
};

/**
 * Formats a single signal's message into a concise Vietnamese bullet.
 * Extracts numbers from the English signal message and reformats.
 */
function formatSignalVi(sig: { type: string; message: string }): string {
  const label = SIGNAL_TYPE_VI[sig.type] ?? sig.type;
  const msg = sig.message;

  // Extract useful data from signal message patterns
  // price_drop/surge: "VCB dropped 5.23% (88,000 → 83,400 VND)"
  const pricePctMatch = msg.match(/([\d.]+)%.*?([\d,.]+)\s*→\s*([\d,.]+)\s*VND/);
  if (pricePctMatch && (sig.type === "price_drop" || sig.type === "price_surge")) {
    const dir = sig.type === "price_drop" ? "↓" : "↑";
    return `${label} ${dir}${pricePctMatch[1]}% (${pricePctMatch[2]} → ${pricePctMatch[3]} VND)`;
  }

  // volume_spike: "VCB volume spike: 3.5× average (5,200,000 vs avg 1,500,000)"
  const volMatch = msg.match(/([\d.]+)×.*?\(([\d,]+)\s*vs\s*avg\s*([\d,]+)\)/);
  if (volMatch && sig.type === "volume_spike") {
    return `${label} ${volMatch[1]}× TB (${volMatch[2]} / TB ${volMatch[3]})`;
  }

  // report_new: "VCB published a new BCTC report (2026-03-31)"
  if (sig.type === "report_new") {
    return `${label} — vừa công bố`;
  }

  // news_mention: "FPT mentioned in 5 articles — headline1 | headline2"
  const newsMatch = msg.match(/mentioned in (\d+) article/);
  if (newsMatch) {
    const headlinePart = msg.split(" — ").slice(1).join(" — ").slice(0, 80);
    return `${label} (${newsMatch[1]} bài) — ${headlinePart || "xem chi tiết"}`;
  }

  // Trade-based: "Article Title — VEA có 25% doanh thu từ us (Ford VN...)"
  const tradeMatch = msg.match(/^(.{10,60})\s*—\s*(\w{2,4})\s+có\s+(\d+)%\s+doanh thu từ\s+(\w+)\s*\((.{5,40})/);
  if (tradeMatch) {
    const headline = tradeMatch[1]!.trim().slice(0, 40);
    const pct = tradeMatch[3];
    const market = tradeMatch[4];
    const detail = tradeMatch[5]!.trim();
    return `${label} — ${headline}\n    → ${pct}% doanh thu từ ${market} (${detail})`;
  }

  // Conviction-enriched: contains "💎" or "📊" or "⚠️" conviction summary
  if (msg.includes("💎") || msg.includes("📊") || msg.includes("⚠️")) {
    // Extract just the conviction part
    const convPart = msg.split(" | ").find((p) => p.includes("💎") || p.includes("📊") || p.includes("⚠️"));
    if (convPart) return convPart.trim().slice(0, 80);
  }

  // Fallback: extract the most readable part after " — "
  const parts = msg.split(" — ");
  if (parts.length >= 2) {
    return `${label} — ${parts[parts.length - 1]!.slice(0, 70)}`;
  }
  return `${label} — ${msg.slice(0, 80)}`;
}

/**
 * Formats an Alert into a compact Vietnamese Telegram message.
 *
 * Single signal example:
 *   🔴 VCB — QUAN TRỌNG
 *   Giá giảm ↓5.23% (88,000 → 83,400 VND)
 *   🕐 31/03/2026 13:14
 *
 * Multi-signal example:
 *   🚨 MWG — NGHIÊM TRỌNG
 *   • Giá tăng ↑7.2% (45,000 → 48,240 VND)
 *   • KL bất thường 3.5× TB (5.2M / TB 1.5M)
 *   🕐 31/03/2026 13:14
 */
function formatAlertMessage(alert: Alert): string {
  const severity = alert.severity.toLowerCase();
  const { emoji, label } = SEVERITY_LABEL[severity] ?? { emoji: "🔔", label: severity.toUpperCase() };
  const stockCode = alert.actionCode;

  // Timestamp in VN time (GMT+7)
  const now = new Date(alert.createdAt);
  const gmt7 = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const dd = String(gmt7.getUTCDate()).padStart(2, "0");
  const mm = String(gmt7.getUTCMonth() + 1).padStart(2, "0");
  const hh = String(gmt7.getUTCHours()).padStart(2, "0");
  const min = String(gmt7.getUTCMinutes()).padStart(2, "0");
  const timestamp = `${dd}/${mm} ${hh}:${min}`;

  // Format signal details
  const signalLines = alert.signals.map((s) => formatSignalVi(s));

  // Build message — no Markdown to avoid parse errors
  const header = `${emoji} ${stockCode} — ${label}`;

  let body: string;
  if (signalLines.length === 1) {
    body = signalLines[0]!;
  } else {
    body = signalLines.map((l) => `• ${l}`).join("\n");
  }

  // Add sensitive date warnings (e.g. derivative expiry, BCTC season)
  const sensitiveWarnings = detectSensitiveDates();
  const warningLine = sensitiveWarnings.length > 0
    ? `\n${sensitiveWarnings[0]}`  // show first warning only (keep compact)
    : "";

  return `${header}\n${body}${warningLine}\n🕐 ${timestamp}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// High-level notifiers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sends a Telegram notification for a HIGH or CRITICAL alert.
 * Silently skips LOW and MEDIUM severity alerts.
 *
 * @param alert   - The Alert to notify about.
 * @param options - Injectable fetch function for tests.
 * @returns true if message was sent, false if skipped or failed.
 */
export async function notifyTelegramAlert(
  alert: Alert,
  options: NotifyOptions = {},
): Promise<boolean> {
  const severity = alert.severity;
  if (severity !== "high" && severity !== "critical") {
    return false;
  }

  let text = formatAlertMessage(alert);

  // Append historical parallel (best-effort, async)
  try {
    const signalType = alert.signals[0]?.type ?? "";
    const keyword = signalType === "price_drop" ? "giảm giá"
      : signalType === "price_surge" ? "tăng giá"
      : signalType === "volume_spike" ? "khối lượng"
      : alert.actionCode;
    const pattern = await getPatternSummary(alert.actionCode, keyword, 720);
    if (pattern && pattern.precedents.length > 0) {
      const p = pattern.precedents[0]!;
      const dir = p.impactDirection === "up" ? "↑" : p.impactDirection === "down" ? "↓" : "→";
      const date = p.date.slice(0, 10);
      // Insert before the timestamp line
      text = text.replace(/\n🕐/, `\n📜 Tiền lệ ${date}: ${dir} score ${p.impactScore}/10\n🕐`);
    }
  } catch { /* silent — no history data */ }

  // Use plain text (no Markdown) to avoid parse errors from special chars
  const sendOpts: SendTelegramOptions = { parseMode: "" };
  if (options.fetchFn !== undefined) sendOpts.fetchFn = options.fetchFn;
  return sendTelegramMessage(text, sendOpts);
}

/**
 * Sends a Telegram notification when a new SSC document is discovered.
 *
 * Template:
 *   *New BCTC Filing: STOCK_CODE*
 *   Title: DOCUMENT_TITLE
 *   Published: PUBLISHED_AT
 *
 * @param doc     - The new SSC document metadata.
 * @param options - Injectable fetch function for tests.
 * @returns true if message was sent, false on any failure.
 */
export async function notifyTelegramDocument(
  doc: { actionCode: string; title: string; publishedAt: string },
  options: NotifyOptions = {},
): Promise<boolean> {
  const text = `*New BCTC Filing: ${doc.actionCode}*\nTitle: ${doc.title}\nPublished: ${doc.publishedAt}`;
  const sendOpts: SendTelegramOptions = { parseMode: "Markdown" };
  if (options.fetchFn !== undefined) sendOpts.fetchFn = options.fetchFn;
  return sendTelegramMessage(text, sendOpts);
}

/** Convenience alias used by alertDigestJob (task 188) */
export async function sendTelegram(text: string): Promise<boolean> {
  return sendTelegramMessage(text);
}
