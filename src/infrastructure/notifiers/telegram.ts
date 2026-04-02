/**
 * Telegram Notifier — Stub (Task 188)
 *
 * Minimal stub that satisfies the TypeScript module resolution for
 * `sendTelegram`. The real implementation lives in a later sprint task
 * (task 034) on branches that have the full Telegram Bot API integration.
 *
 * This stub always returns `false` (not configured) so callers can gracefully
 * handle the "Telegram not configured" path without crashing.
 *
 * When the full telegram.ts is merged, this file will be replaced.
 *
 * @module infrastructure/notifiers/telegram
 */

/**
 * Send a message via Telegram Bot API.
 *
 * @param _text - The message text to send.
 * @returns Promise resolving to `true` when sent, `false` when not configured.
 */
export async function sendTelegram(_text: string): Promise<boolean> {
  const token = Bun.env["TELEGRAM_BOT_TOKEN"];
  const chatId = Bun.env["TELEGRAM_CHAT_ID"];

  if (!token || !chatId) {
    return false;
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: _text,
        parse_mode: undefined,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
