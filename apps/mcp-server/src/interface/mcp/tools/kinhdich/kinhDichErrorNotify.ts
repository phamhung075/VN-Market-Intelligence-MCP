/**
 * KD-OBS-01-FIX — Kinh Dich genuine-error → BUG channel notifier.
 *
 * Problem (KD-OBS-01): when a kinh-dich MCP tool or HTTP handler hits a
 * genuine data error (HTTP/DB failure caught by the outer try/catch of the
 * caller), the error was only sent to the structured logger — never
 * surfaced to a human. Benign "no data yet" / data-short states are NOT in
 * scope here: each caller already returns a graceful text/JSON response for
 * those *before* ever reaching its catch block, so every call site that
 * invokes this helper is, by construction, a genuine unexpected error.
 *
 * Design:
 *   - Never throws. Any failure inside `sendBugFn` (Telegram API, DB dedup
 *     check, etc.) is swallowed — the caller's tool/HTTP response must never
 *     be blocked or broken by a notification failure. Same non-fatal
 *     contract as the Telegram-send wrapper in accuracyDigestJob.ts.
 *   - Callers fire-and-forget (`void notifyKinhDichError(...)`) — this
 *     helper is never awaited on the response-critical path, so it adds no
 *     latency to the tool/HTTP response.
 *   - `category` becomes the message's 📋 marker, which sendTelegramBug()
 *     uses for its built-in 4h dedup window (telegramReportStore ⁠—
 *     isDuplicateReport). Repeated failures of the SAME kind (e.g.
 *     kinh-dich-service down) collapse into one BUG report instead of
 *     flooding the channel — no extra dedup machinery needed here.
 *
 * Layer: interface/mcp/tools/kinhdich (imports infrastructure/notifiers —
 * a valid interface → infrastructure direction, same as ohlcvBackfillHandler.ts).
 */

/** Injectable BUG-channel sender — defaults to the real sendTelegramBug (dynamic import). */
export type SendBugFn = (text: string) => Promise<number>;

/**
 * Notify the BUG channel of a genuine kinh-dich data error. Non-fatal —
 * never rejects, regardless of `sendBugFn` outcome.
 *
 * @param source   - tool/handler name, e.g. "get_kinhdich_reading"
 * @param category - single-token dedup category (no whitespace), e.g. "kinhdich-reading-error"
 * @param detail   - human-readable error detail (identifying context + message)
 * @param sendBugFn - injectable for testing; defaults to sendTelegramBug via dynamic import
 *                    (keeps this module free of a static infra dependency at load time,
 *                    matching the dynamic-import convention used across scheduler/*.ts jobs)
 */
export async function notifyKinhDichError(
  source: string,
  category: string,
  detail: string,
  sendBugFn?: SendBugFn,
): Promise<void> {
  try {
    const sendFn: SendBugFn =
      sendBugFn ??
      (async (text: string) => {
        const { sendTelegramBug } = await import(
          "../../../../infrastructure/notifiers/telegram.js"
        );
        return sendTelegramBug(text);
      });
    await sendFn(`[kinh-dich] ${source} failed: ${detail}\n📋 ${category}`);
  } catch {
    // non-fatal — a Telegram/DB failure here must never propagate to the caller
  }
}
