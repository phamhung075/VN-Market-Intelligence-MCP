/**
 * Infrastructure — Startup env self-check (Task 1026)
 *
 * Validates required environment variables are set before the first cron fires.
 * The server still boots in degraded mode if vars are missing, but logs ERROR
 * and sends a plain-text WORK channel alert via a direct HTTP POST (not via
 * sendTelegram to avoid circular dep with telegram notifier).
 */

/** Required env vars for core Telegram functionality. */
export const REQUIRED_ENV_VARS: string[] = [
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_INFO_MARKET_GROUP_ID",
  "TELEGRAM_INFO_WORK_CHANNEL_ID",
  "TELEGRAM_REPORT_BUG_CHANNEL_ID",
];

/**
 * Check which required env vars are missing or blank.
 * @param env - environment record to check (defaults to Bun.env)
 * @returns array of missing/blank var names (empty = all present)
 */
export function checkRequiredEnv(env: Record<string, string | undefined> = Bun.env): string[] {
  return REQUIRED_ENV_VARS.filter((name) => {
    const val = env[name];
    return val === undefined || val === "";
  });
}

/**
 * Format a plain-text warning message for missing env vars.
 * Returns empty string if the missing list is empty.
 *
 * Plain text only — no Markdown (avoids Telegram parse errors in degraded mode).
 * @param missing - list of missing var names
 */
export function formatEnvWarning(missing: string[]): string {
  if (missing.length === 0) return "";
  const list = missing.map((v) => `  - ${v}`).join("\n");
  return (
    `[WARN] VN Market MCP started in DEGRADED MODE\n` +
    `Missing required env vars:\n${list}\n` +
    `Telegram alerts will fail until these are set.`
  );
}

/**
 * Run the startup env check. Logs ERROR for each missing var and optionally
 * sends a WORK channel notice via direct HTTP (bypasses sendTelegram to avoid
 * circular dep). Server continues booting regardless (degraded mode).
 *
 * @param log - logger with .warn() method
 */
export async function runEnvCheck(log: { warn: (msg: string, meta?: Record<string, unknown>) => void }): Promise<void> {
  const missing = checkRequiredEnv();
  if (missing.length === 0) return;

  const msg = formatEnvWarning(missing);
  log.warn("[envCheck] " + msg, { missingVars: missing });

  // Attempt a direct HTTP POST to Telegram WORK channel.
  // Uses raw fetch to avoid circular dep with the Telegram notifier.
  const token = Bun.env.TELEGRAM_BOT_TOKEN;
  const workId = Bun.env.TELEGRAM_INFO_WORK_CHANNEL_ID;
  if (!token || !workId) {
    // Can't even send the warning — just log
    return;
  }

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: workId,
        text: msg,
        parse_mode: undefined, // plain text
      }),
    });
  } catch {
    // Best-effort only — degraded mode means Telegram may not work anyway
  }
}
