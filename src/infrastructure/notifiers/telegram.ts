/**
 * Infrastructure — Telegram Bot Notifier (three-channel hard cutover, Sprint 051)
 *
 * Sends notifications to one of THREE Telegram destinations:
 *
 *   - MARKET (TELEGRAM_INFO_MARKET_GROUP_ID): user-facing market alerts/briefings
 *   - WORK   (TELEGRAM_INFO_WORK_CHANNEL_ID): dev/analysis status, refresh asks
 *   - BUG    (TELEGRAM_REPORT_BUG_CHANNEL_ID): analysis → dev bug reports
 *
 * The legacy single-chat / report-channel split is GONE. There are no aliases.
 *
 * DDD layer: infrastructure/notifiers
 *
 * Design rules:
 *   - Never throws — all errors are caught and returned as false / 0
 *   - Reads TELEGRAM_BOT_TOKEN + the three destination IDs from Bun.env
 *   - All env vars are optional — missing config silently no-ops
 *   - TELEGRAM_BOT_TOKEN is NEVER logged (security)
 */

import type { Alert } from "../../domain/services/alertGenerator.js";
import { detectSensitiveDates } from "../../domain/services/priceNewsValidator.js";
import { createLogger } from "../logger.js";
import { getPatternSummary } from "../../application/usecases/getPatternSummary.js";
import { getDb } from "../db/index.js";
import { insertReport } from "../db/telegramReportStore.js";

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
 * Options for the channel send functions.
 */
export interface SendTelegramOptions {
  /** Telegram parse mode. Default: "" (plain text). */
  parseMode?: string;
  /** Injectable fetch function for tests. Default: globalThis.fetch. */
  fetchFn?: FetchFn;
  /**
   * Override the destination chat ID (e.g. for webhook replies to a specific user).
   * When omitted, falls back to the channel-specific env var.
   */
  chatId?: number;
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
 */
export interface TelegramNotifier {
  sendTelegramMarket(text: string, options?: SendTelegramOptions): Promise<boolean>;
  sendTelegramWork(text: string, options?: SendTelegramOptions): Promise<boolean>;
  sendTelegramBug(text: string, options?: SendTelegramOptions): Promise<number>;
  notifyTelegramAlert(alert: Alert, options?: NotifyOptions): Promise<boolean>;
  notifyTelegramDocument(
    doc: { actionCode: string; title: string; publishedAt: string },
    options?: NotifyOptions,
  ): Promise<boolean>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Channel resolution
// ─────────────────────────────────────────────────────────────────────────────

/** Three-channel destination identifier. */
export type TelegramChannel = "market" | "work" | "bug";

const ENV_VAR_BY_CHANNEL: Record<TelegramChannel, string> = {
  market: "TELEGRAM_INFO_MARKET_GROUP_ID",
  work: "TELEGRAM_INFO_WORK_CHANNEL_ID",
  bug: "TELEGRAM_REPORT_BUG_CHANNEL_ID",
};

function readEnv(name: string): string {
  return Bun.env[name] ?? "";
}

function resolveChatId(channel: TelegramChannel): string {
  return readEnv(ENV_VAR_BY_CHANNEL[channel]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Core send (internal)
// ─────────────────────────────────────────────────────────────────────────────

/** Telegram API message length limit */
const TELEGRAM_MAX_LENGTH = 4096;

/**
 * Splits a long message into chunks that fit within Telegram's 4096-char limit.
 * Splits on newlines when possible to preserve formatting.
 */
function splitMessage(text: string, maxLen: number = TELEGRAM_MAX_LENGTH): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    let splitIdx = remaining.lastIndexOf("\n", maxLen);
    if (splitIdx <= 0) splitIdx = maxLen;
    chunks.push(remaining.slice(0, splitIdx));
    remaining = remaining.slice(splitIdx).replace(/^\n/, "");
  }

  return chunks;
}

interface CoreSendResult {
  ok: boolean;
  /** Last chunk's message_id, or 0 on failure / no parse. */
  messageId: number;
}

async function coreSend(
  channel: TelegramChannel,
  text: string,
  options: SendTelegramOptions,
): Promise<CoreSendResult> {
  const botToken = readEnv("TELEGRAM_BOT_TOKEN");
  const chatId =
    options.chatId != null ? String(options.chatId) : resolveChatId(channel);

  if (!botToken) {
    log.warn("[telegram] TELEGRAM_BOT_TOKEN is not set — skipping send", { channel });
    return { ok: false, messageId: 0 };
  }
  if (!chatId) {
    log.warn(`[telegram] ${ENV_VAR_BY_CHANNEL[channel]} is not set — skipping send`, { channel });
    return { ok: false, messageId: 0 };
  }

  const parseMode = options.parseMode ?? "";
  const fetchFn = options.fetchFn ?? (globalThis.fetch as FetchFn);
  const chunks = splitMessage(text);
  let lastMessageId = 0;

  for (const chunk of chunks) {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const body = JSON.stringify({
      chat_id: chatId,
      text: chunk,
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
        const status = response.status;
        if (status === 400 && parseMode !== "") {
          log.warn("[telegram] Markdown parse failed — retrying as plain text", { channel, chatId });
          clearTimeout(timeoutId);
          return coreSend(channel, text, { ...options, parseMode: "" });
        }
        log.warn("[telegram] sendMessage failed", { status, channel, chatId });
        return { ok: false, messageId: 0 };
      }

      try {
        const json = (await response.json()) as { result?: { message_id?: number } };
        lastMessageId = json.result?.message_id ?? lastMessageId;
      } catch { /* ignore */ }
    } catch (err) {
      log.warn("[telegram] sendMessage network error", {
        error: err instanceof Error ? err.message : String(err),
        channel,
        chatId,
      });
      return { ok: false, messageId: 0 };
    } finally {
      clearTimeout(timeoutId);
    }

    if (chunks.length > 1) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  return { ok: true, messageId: lastMessageId };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public per-channel send functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sends a text message to the MARKET channel (TELEGRAM_INFO_MARKET_GROUP_ID).
 * User-facing market alerts, briefings and analysis.
 *
 * @returns true on success, false on any failure.
 */
export async function sendTelegramMarket(
  text: string,
  options: SendTelegramOptions = {},
): Promise<boolean> {
  const result = await coreSend("market", text, options);
  return result.ok;
}

/**
 * Sends a text message to the WORK channel (TELEGRAM_INFO_WORK_CHANNEL_ID).
 * Dev/analysis status, fix-shipped notices, agent refresh asks.
 *
 * @returns true on success, false on any failure.
 */
export async function sendTelegramWork(
  text: string,
  options: SendTelegramOptions = {},
): Promise<boolean> {
  const result = await coreSend("work", text, options);
  return result.ok;
}

/**
 * Sends a text message to the BUG channel (TELEGRAM_REPORT_BUG_CHANNEL_ID).
 * Analysis → dev bug reports. Persists the message in the telegram_reports
 * table so the Dev Team autonomous loop can pick it up.
 *
 * @returns the Telegram message_id on success (for later deletion), 0 on failure.
 */
export async function sendTelegramBug(
  text: string,
  options: SendTelegramOptions = {},
): Promise<number> {
  const result = await coreSend("bug", text, options);
  if (!result.ok || result.messageId <= 0) return 0;

  // Persist for the Dev Team autonomous loop. Best-effort.
  try {
    const db = getDb();
    insertReport(db, text, "analysis-agent", result.messageId, "normal");
  } catch (err) {
    log.warn("[telegram] insertReport failed — bug was sent but not persisted", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return result.messageId;
}

/**
 * Deletes a message from the BUG channel by message_id.
 * Used to clean up resolved bug reports.
 *
 * @returns true if deleted, false on failure.
 */
export async function deleteTelegramBug(
  messageId: number,
  options: { fetchFn?: FetchFn } = {},
): Promise<boolean> {
  const botToken = readEnv("TELEGRAM_BOT_TOKEN");
  const bugChatId = resolveChatId("bug");

  if (!botToken || !bugChatId || messageId <= 0) return false;

  const fetchFn = options.fetchFn ?? (globalThis.fetch as FetchFn);
  const url = `https://api.telegram.org/bot${botToken}/deleteMessage`;
  const body = JSON.stringify({ chat_id: bugChatId, message_id: messageId });

  try {
    const response = await fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    return response.ok;
  } catch {
    return false;
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

function formatSignalVi(sig: { type: string; message: string }): string {
  const label = SIGNAL_TYPE_VI[sig.type] ?? sig.type;
  const msg = sig.message;

  const pricePctMatch = msg.match(/([\d.]+)%.*?([\d,.]+)\s*→\s*([\d,.]+)\s*VND/);
  if (pricePctMatch && (sig.type === "price_drop" || sig.type === "price_surge")) {
    const dir = sig.type === "price_drop" ? "↓" : "↑";
    return `${label} ${dir}${pricePctMatch[1]}% (${pricePctMatch[2]} → ${pricePctMatch[3]} VND)`;
  }

  const volMatch = msg.match(/([\d.]+)×.*?\(([\d,]+)\s*vs\s*avg\s*([\d,]+)\)/);
  if (volMatch && sig.type === "volume_spike") {
    return `${label} ${volMatch[1]}× TB (${volMatch[2]} / TB ${volMatch[3]})`;
  }

  if (sig.type === "report_new") {
    return `${label} — vừa công bố`;
  }

  const newsMatch = msg.match(/mentioned in (\d+) article/);
  if (newsMatch) {
    const headlinePart = msg.split(" — ").slice(1).join(" — ").slice(0, 80);
    return `${label} (${newsMatch[1]} bài) — ${headlinePart || "xem chi tiết"}`;
  }

  const tradeMatch = msg.match(/^(.{10,60})\s*—\s*(\w{2,4})\s+có\s+(\d+)%\s+doanh thu từ\s+(\w+)\s*\((.{5,40})/);
  if (tradeMatch) {
    const headline = tradeMatch[1]!.trim().slice(0, 40);
    const pct = tradeMatch[3];
    const market = tradeMatch[4];
    const detail = tradeMatch[5]!.trim();
    return `${label} — ${headline}\n    → ${pct}% doanh thu từ ${market} (${detail})`;
  }

  if (msg.includes("💎") || msg.includes("📊") || msg.includes("⚠️")) {
    const convPart = msg.split(" | ").find((p) => p.includes("💎") || p.includes("📊") || p.includes("⚠️"));
    if (convPart) return convPart.trim().slice(0, 80);
  }

  const parts = msg.split(" — ");
  if (parts.length >= 2) {
    return `${label} — ${parts[parts.length - 1]!.slice(0, 70)}`;
  }
  return `${label} — ${msg.slice(0, 80)}`;
}

function formatAlertMessage(alert: Alert): string {
  const severity = alert.severity.toLowerCase();
  const { emoji, label } = SEVERITY_LABEL[severity] ?? { emoji: "🔔", label: severity.toUpperCase() };
  const stockCode = alert.actionCode;

  const now = new Date(alert.createdAt);
  const gmt7 = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const dd = String(gmt7.getUTCDate()).padStart(2, "0");
  const mm = String(gmt7.getUTCMonth() + 1).padStart(2, "0");
  const hh = String(gmt7.getUTCHours()).padStart(2, "0");
  const min = String(gmt7.getUTCMinutes()).padStart(2, "0");
  const timestamp = `${dd}/${mm} ${hh}:${min}`;

  const signalLines = alert.signals.map((s) => formatSignalVi(s));
  const header = `${emoji} ${stockCode} — ${label}`;

  let body: string;
  if (signalLines.length === 1) {
    body = signalLines[0]!;
  } else {
    body = signalLines.map((l) => `• ${l}`).join("\n");
  }

  const sensitiveWarnings = detectSensitiveDates();
  const warningLine = sensitiveWarnings.length > 0 ? `\n${sensitiveWarnings[0]}` : "";

  return `${header}\n${body}${warningLine}\n🕐 ${timestamp}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// High-level notifiers (always route to MARKET — user-facing)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sends a Telegram notification to the MARKET channel for a HIGH or CRITICAL alert.
 * Silently skips LOW and MEDIUM severity alerts.
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

  try {
    const signalType = alert.signals[0]?.type ?? "";
    const keyword =
      signalType === "price_drop" ? "giảm giá"
      : signalType === "price_surge" ? "tăng giá"
      : signalType === "volume_spike" ? "khối lượng"
      : alert.actionCode;
    const pattern = await getPatternSummary(alert.actionCode, keyword, 720);
    if (pattern && pattern.precedents.length > 0) {
      const p = pattern.precedents[0]!;
      const dir = p.impactDirection === "up" ? "↑" : p.impactDirection === "down" ? "↓" : "→";
      const date = p.date.slice(0, 10);
      text = text.replace(/\n🕐/, `\n📜 Tiền lệ ${date}: ${dir} score ${p.impactScore}/10\n🕐`);
    }
  } catch { /* silent */ }

  const sendOpts: SendTelegramOptions = { parseMode: "" };
  if (options.fetchFn !== undefined) sendOpts.fetchFn = options.fetchFn;
  return sendTelegramMarket(text, sendOpts);
}

/**
 * Sends a Telegram notification to the MARKET channel when a new SSC document
 * is discovered.
 */
export async function notifyTelegramDocument(
  doc: { actionCode: string; title: string; publishedAt: string },
  options: NotifyOptions = {},
): Promise<boolean> {
  const text = `*New BCTC Filing: ${doc.actionCode}*\nTitle: ${doc.title}\nPublished: ${doc.publishedAt}`;
  const sendOpts: SendTelegramOptions = { parseMode: "Markdown" };
  if (options.fetchFn !== undefined) sendOpts.fetchFn = options.fetchFn;
  return sendTelegramMarket(text, sendOpts);
}

/** Convenience alias used by alertDigestJob — routes digests to MARKET. */
export async function sendTelegram(text: string): Promise<boolean> {
  return sendTelegramMarket(text);
}
