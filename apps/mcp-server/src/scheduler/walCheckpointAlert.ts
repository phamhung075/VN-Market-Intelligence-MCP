/**
 * walCheckpointAlert — WORK channel alert when WAL checkpoint leaves
 * un-flushed frames above warning or critical thresholds.
 *
 * Two-tier alert (task 1329b):
 *   > 5,000 frames (~20 MB) : WARNING — monitoring
 *   > 10,000 frames (~40 MB): CRITICAL — manual restart may be needed
 *                              (incident happened at ~11,000 frames / 44 MB)
 *
 * Extracted as a pure helper so it can be unit-tested without importing
 * the full jobs.ts scheduler tree (task 1476).
 *
 * Layer: scheduler (calls infrastructure/notifiers via dynamic import)
 */

const WAL_WARN_THRESHOLD  = 5_000;   // ~20 MB — warning
const WAL_STUCK_THRESHOLD = 10_000;  // ~40 MB — critical (incident happened at ~11,000)

/**
 * Sends a WORK Telegram alert if the WAL checkpoint result shows un-flushed
 * frames above the warning threshold (5,000) or critical threshold (10,000).
 *
 * @param result    — { walSize, checkpointed } from runWalCheckpoint()
 * @param sendWorkFn — injectable for tests; defaults to sendTelegramWork
 */
export async function walCheckpointAlert(
  result: { walSize: number; checkpointed: number },
  sendWorkFn?: (msg: string) => Promise<void>,
): Promise<void> {
  const remaining = result.walSize - result.checkpointed;

  if (remaining <= WAL_WARN_THRESHOLD) return;

  const isCritical = remaining > WAL_STUCK_THRESHOLD;
  const prefix = isCritical ? "WAL CRITICAL" : "WAL WARNING";
  const message =
    `${prefix}: ${remaining} frames un-flushed` +
    ` (WAL=${result.walSize}, checkpointed=${result.checkpointed})` +
    (isCritical ? " — manual restart may be needed" : " — monitoring");

  const send =
    sendWorkFn ??
    (async (msg: string) => {
      const { sendTelegramWork } = await import(
        "../infrastructure/notifiers/telegram.js"
      );
      await sendTelegramWork(msg, { parseMode: "" });
    });

  try {
    await send(message);
  } catch (err) {
    // Log to stderr so launchd captures it — do not re-throw (alert must not crash cron job)
    console.error("[walCheckpointAlert] failed to send Telegram alert:", err);
  }
}
