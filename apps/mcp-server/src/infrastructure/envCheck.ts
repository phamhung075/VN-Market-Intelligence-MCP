/**
 * Infrastructure — Startup env self-check (Task 1026 + EI-P2-1)
 *
 * Task 1026: Validates required environment variables are set before the first
 * cron fires. Server boots in degraded mode if vars are missing.
 *
 * EI-P2-1: assertEnvDbConsistency() — hard startup assertion that kills the
 * process (process.exit(1)) if APP_ENV and DB_PATH are inconsistent.
 * Rule:
 *   APP_ENV=production (or unset) → DB_PATH must equal PROD_DB_PATH.
 *   APP_ENV=development/dev/test  → DB_PATH must NOT equal PROD_DB_PATH.
 * Unset APP_ENV is treated as "production" (safe default — won't break an
 * existing deploy that omits APP_ENV). This is documented as the safety choice.
 */

// ── EI-P2-1 — APP_ENV / DB_PATH consistency assertion ─────────────────────────

/** Canonical production DB path inside the container. */
export const PROD_DB_PATH = "/app/data/market.db";

/**
 * Non-production APP_ENV values (case-insensitive prefix match is intentional —
 * "dev", "development", "test", "testing" are all non-production).
 */
const DEV_ENV_VALUES = new Set(["development", "dev", "test", "testing"]);

/**
 * Determine if a given APP_ENV string is production-like.
 * Unset (undefined / empty) is treated as production (safety default).
 */
export function isProductionEnv(appEnv: string | undefined): boolean {
  if (!appEnv || appEnv.trim() === "") return true; // unset → prod (safe)
  return !DEV_ENV_VALUES.has(appEnv.trim().toLowerCase());
}

/**
 * Check whether the (APP_ENV, DB_PATH) pair is consistent.
 *
 * Returns null when consistent, or a descriptive error string when not.
 * Pure function — does NOT call process.exit so it can be unit-tested.
 *
 * @param appEnv  value of APP_ENV (undefined = unset)
 * @param dbPath  value of DB_PATH (undefined = unset → uses DEFAULT_DB_PATH fallback)
 * @param defaultDbPath  fallback DB path when DB_PATH is unset (for tests)
 */
export function checkEnvDbConsistency(
  appEnv: string | undefined,
  dbPath: string | undefined,
  defaultDbPath: string = PROD_DB_PATH,
): string | null {
  const resolvedDb = dbPath ?? defaultDbPath;
  const isProd = isProductionEnv(appEnv);

  if (isProd && resolvedDb !== PROD_DB_PATH) {
    return (
      `[EI-P2-1] STARTUP ASSERTION FAILED: APP_ENV="${appEnv ?? "(unset → production)"}" ` +
      `requires DB_PATH="${PROD_DB_PATH}" but got DB_PATH="${resolvedDb}". ` +
      `Refusing to start — a production process must not point at a non-production database.`
    );
  }

  if (!isProd && resolvedDb === PROD_DB_PATH) {
    return (
      `[EI-P2-1] STARTUP ASSERTION FAILED: APP_ENV="${appEnv}" ` +
      `(non-production) must not point at the production DB_PATH="${PROD_DB_PATH}". ` +
      `Set DB_PATH to a dev/test path (e.g. /app/data/market.dev.db).`
    );
  }

  return null; // consistent
}

/**
 * Hard startup assertion — call this BEFORE initDatabase().
 *
 * Calls process.exit(1) with a clear message if APP_ENV and DB_PATH are
 * inconsistent. No-op (returns) when the pair is consistent.
 *
 * Safety choice for unset APP_ENV: treated as production. This means an
 * existing container that never set APP_ENV will pass the check as long as
 * DB_PATH is the production path (or also unset → fallback prod path).
 * Documented in docs/protocols/dev-environment.md §8.
 *
 * @param env  environment record (defaults to Bun.env)
 */
export function assertEnvDbConsistency(
  env: Record<string, string | undefined> = Bun.env,
): void {
  // Skip the assertion for in-memory test databases — they are never prod.
  const dbPath = env["DB_PATH"];
  if (dbPath === ":memory:") return;

  const error = checkEnvDbConsistency(env["APP_ENV"], dbPath);
  if (error) {
    // Write to stderr so it appears before the process dies.
    process.stderr.write(error + "\n");
    process.exit(1);
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the current data environment label for stamping on ingest rows.
 * Reads APP_ENV at call time (not module load time) so tests can override it.
 * Unset APP_ENV → 'production' (safe default, consistent with assertEnvDbConsistency).
 *
 * @param env  environment record (defaults to Bun.env)
 */
export function currentDataEnv(env: Record<string, string | undefined> = Bun.env): string {
  return env["APP_ENV"] ?? "production";
}

// ─────────────────────────────────────────────────────────────────────────────

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
