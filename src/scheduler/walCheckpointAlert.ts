/**
 * walCheckpointAlert — WORK channel alert when WAL checkpoint leaves
 * more than 50,000 frames un-flushed.
 *
 * Extracted as a pure helper so it can be unit-tested without importing
 * the full jobs.ts scheduler tree (task 1476).
 *
 * Layer: scheduler (calls infrastructure/notifiers via dynamic import)
 */

const WAL_STUCK_THRESHOLD = 50_000;

/**
 * Sends a WORK Telegram alert if the WAL checkpoint result shows more
 * than 50,000 remaining frames.
 *
 * @param result    — { walSize, checkpointed } from runWalCheckpoint()
 * @param sendWorkFn — injectable for tests; defaults to sendTelegramWork
 */
export async function walCheckpointAlert(
  result: { walSize: number; checkpointed: number },
  sendWorkFn?: (msg: string) => Promise<void>,
): Promise<void> {
  const remaining = result.walSize - result.checkpointed;

  if (remaining <= WAL_STUCK_THRESHOLD) return;

  const send =
    sendWorkFn ??
    (async (msg: string) => {
      const { sendTelegramWork } = await import(
        "../infrastructure/notifiers/telegram.js"
      );
      await sendTelegramWork(msg, { parseMode: "" });
    });

  await send(
    `WAL stuck: ${remaining} frames not checkpointed — manual restart may be needed`,
  );
}
