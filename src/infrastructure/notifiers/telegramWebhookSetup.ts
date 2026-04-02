/**
 * Infrastructure — Telegram Webhook Registration + Security
 *
 * Provides:
 *   - registerWebhook()        — registers the bot webhook URL with Telegram
 *   - validateWebhookRequest() — validates the X-Telegram-Bot-Api-Secret-Token header
 *
 * DDD layer: infrastructure/notifiers
 *
 * Design rules:
 *   - Never throws — all errors are caught and returned as false / logged
 *   - registerWebhook() is a no-op (returns false) when TELEGRAM_WEBHOOK_URL is not set
 *   - validateWebhookRequest() accepts all requests when no secret is configured (dev mode)
 *   - TELEGRAM_BOT_TOKEN is NEVER logged (security)
 */

import { createLogger } from "../logger.js";

const log = createLogger("info");

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Injectable fetch function type — a minimal subset of the full Fetch API.
 * Allows test injection without requiring the full `typeof fetch` signature.
 */
export type WebhookFetchFn = (url: string, init?: RequestInit) => Promise<Response>;

/** Options for registerWebhook — allows injecting a custom fetch for tests. */
export interface RegisterWebhookOptions {
  /**
   * Override the webhook URL. If omitted, reads TELEGRAM_WEBHOOK_URL from env.
   */
  webhookUrl?: string;
  /**
   * A random string used to validate incoming webhook requests.
   * Passed as `secret_token` to the Telegram setWebhook call.
   * If omitted, a secret is NOT sent (Telegram will not validate requests).
   */
  secretToken?: string;
  /**
   * Injectable fetch function for tests. Defaults to globalThis.fetch.
   */
  fetchFn?: WebhookFetchFn;
}

// ─────────────────────────────────────────────────────────────────────────────
// registerWebhook
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Registers the Telegram bot webhook URL via the `setWebhook` API.
 *
 * Reads from environment:
 *   - TELEGRAM_BOT_TOKEN — required; skips if not set
 *   - TELEGRAM_WEBHOOK_URL — required; returns false (no-op) if not set
 *
 * @param options - Optional overrides: webhookUrl, secretToken, fetchFn.
 * @returns true if Telegram responded with HTTP 200, false otherwise (never throws).
 *
 * @example
 * // Production startup:
 * await registerWebhook();
 *
 * @example
 * // Test with injected fetch:
 * const ok = await registerWebhook({ fetchFn: mockFetch });
 */
export async function registerWebhook(
  options: RegisterWebhookOptions = {},
): Promise<boolean> {
  const botToken = Bun.env.TELEGRAM_BOT_TOKEN ?? "";
  const webhookUrl =
    options.webhookUrl ?? Bun.env.TELEGRAM_WEBHOOK_URL ?? "";

  // No-op when webhook URL not configured (local dev without webhook)
  if (!webhookUrl) {
    log.info("[telegramWebhook] TELEGRAM_WEBHOOK_URL not set — skipping webhook registration");
    return false;
  }

  // Cannot register without a bot token
  if (!botToken) {
    log.warn("[telegramWebhook] TELEGRAM_BOT_TOKEN is not set — cannot register webhook");
    return false;
  }

  const fetchFn: WebhookFetchFn = options.fetchFn ?? globalThis.fetch;
  const url = `https://api.telegram.org/bot${botToken}/setWebhook`;

  const payload: Record<string, unknown> = {
    url: webhookUrl,
    allowed_updates: ["message"],
  };

  if (options.secretToken) {
    payload.secret_token = options.secretToken;
  }

  try {
    const response = await fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      log.warn("[telegramWebhook] setWebhook failed", {
        status: response.status,
        webhookUrl,
      });
      return false;
    }

    log.info("[telegramWebhook] Webhook registered successfully", { webhookUrl });
    return true;
  } catch (err) {
    log.warn("[telegramWebhook] setWebhook network error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// validateWebhookRequest
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates an incoming Telegram webhook request by checking the
 * `X-Telegram-Bot-Api-Secret-Token` header.
 *
 * Security model:
 *   - If `secretToken` is empty (""), the function returns true — dev mode, accepts all.
 *   - If `secretToken` is set, the header must match exactly (case-sensitive).
 *   - A missing header is treated as invalid when a secret is configured.
 *
 * @param headers     - The HTTP request headers.
 * @param secretToken - The expected secret token (empty = dev mode, allow all).
 * @returns true if the request is valid, false otherwise.
 *
 * @example
 * // In the /webhook handler:
 * const secret = Bun.env.TELEGRAM_WEBHOOK_SECRET ?? "";
 * if (!validateWebhookRequest(req.headers, secret)) {
 *   return new Response("Forbidden", { status: 403 });
 * }
 */
export function validateWebhookRequest(
  headers: Headers,
  secretToken: string,
): boolean {
  // Dev mode — no secret configured, accept all requests
  if (!secretToken) {
    return true;
  }

  const incoming = headers.get("x-telegram-bot-api-secret-token");
  if (!incoming) {
    return false;
  }

  // Constant-time comparison is not strictly necessary here because
  // Telegram's token is already a random string, but we keep it simple.
  return incoming === secretToken;
}
