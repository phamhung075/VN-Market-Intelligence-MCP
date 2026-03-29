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
import { createLogger } from "../logger.js";

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
  });

  try {
    const response = await fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    if (!response.ok) {
      log.warn("[telegram] sendMessage failed", {
        status: response.status,
        chatId,
      });
      return false;
    }

    return true;
  } catch (err) {
    log.warn("[telegram] sendMessage network error", {
      error: err instanceof Error ? err.message : String(err),
      chatId,
    });
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Alert formatter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Formats an Alert into a Telegram Markdown message.
 *
 * Template:
 *   *[SEVERITY] STOCK_CODE*
 *   Signal: signal_type1, signal_type2
 *   Summary: one-line message (max 120 chars)
 *   Time: DD/MM/YYYY HH:MM (GMT+7)
 */
function formatAlertMessage(alert: Alert): string {
  const severity = alert.severity.toUpperCase();
  const stockCode = alert.actionCode;
  const signalTypes = alert.signals.map((s) => s.type).join(", ");
  const summary = alert.message.slice(0, 120);

  // Format timestamp in GMT+7
  const now = new Date(alert.createdAt);
  const gmt7 = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const dd = String(gmt7.getUTCDate()).padStart(2, "0");
  const mm = String(gmt7.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = gmt7.getUTCFullYear();
  const hh = String(gmt7.getUTCHours()).padStart(2, "0");
  const min = String(gmt7.getUTCMinutes()).padStart(2, "0");
  const timestamp = `${dd}/${mm}/${yyyy} ${hh}:${min} (GMT+7)`;

  return `*[${severity}] ${stockCode}*\nSignal: ${signalTypes}\nSummary: ${summary}\nTime: ${timestamp}`;
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

  const text = formatAlertMessage(alert);
  const sendOpts: SendTelegramOptions = { parseMode: "Markdown" };
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
