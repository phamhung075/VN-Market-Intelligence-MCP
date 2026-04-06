/**
 * VPS Proxy Watchdog — self-heals the Vultr price-proxy cron.
 *
 * Problem this solves:
 *   The VPS price proxy (Vultr host, /root/fetch-prices.sh on cron) is the
 *   ONLY path for VN stock prices — the MCP host is geo-blocked from the
 *   upstream data feeds. On 2026-03-27 the VPS crontab silently disappeared
 *   and market_prices went stale for 10 days before anyone noticed.
 *   `deploy-vps-proxy.sh` was already an operator tool, but nothing running
 *   inside the Bun process owned the liveness guarantee.
 *
 * What this job does:
 *   Every 10 minutes during VN market hours:
 *     1. Read `market_prices.updated_at` — the most recent VPS push.
 *     2. If the freshest row is older than STALE_THRESHOLD_MS, assume the
 *        VPS cron is missing or broken.
 *     3. SSH into the VPS (sshpass + credentials from .env), check
 *        `crontab -l`, re-install the fetch-prices cron if it is empty
 *        or missing the fetch-prices.sh entry, and trigger one immediate
 *        test run of /root/fetch-prices.sh.
 *     4. Send a Telegram alert to the Chat Channel describing the action.
 *
 * Required env vars (already in .env for deploy-vps-proxy.sh):
 *   VULTR_IP            — VPS public IP
 *   VULTR_PASSWORD      — root password
 *   VULTR_USERNAME      — optional, defaults to "root"
 *   VPS_PUSH_API_KEY    — required so the re-install can echo the API key
 *                         into the fetch script if it is missing on the VPS
 *
 * Preconditions on the VPS:
 *   /root/fetch-prices.sh already exists and is executable. If it is not,
 *   operator must run deploy-vps-proxy.sh from a developer machine — this
 *   watchdog only restores the crontab, not the script contents.
 *
 * Safety:
 *   - Only runs during VN market hours (Mon-Fri 02:00-08:59 UTC).
 *   - Dedups re-installs via a 15-minute in-memory cooldown so a long VPS
 *     outage does not spam SSH connects or Telegram messages.
 *   - Every failure is logged via the shared logger and never throws out.
 *
 * @module scheduler/vpsProxyWatchdogJob
 */

import { spawn } from "node:child_process";
import { getDb } from "../infrastructure/db/schema.js";
import { sendTelegramMessage } from "../infrastructure/notifiers/telegram.js";
import { logger } from "../infrastructure/logger.js";

/** If the newest market_prices row is older than this, treat VPS as stale. */
const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

/** Desired crontab entry — matches the VN-market-hours-only schedule. */
const DESIRED_CRON = "* 2-8 * * 1-5 /root/fetch-prices.sh";

/** Cooldown between re-install attempts to avoid SSH/Telegram spam. */
const REINSTALL_COOLDOWN_MS = 15 * 60 * 1000;

let lastReinstallAt = 0;

/**
 * Returns true if the current UTC instant is inside VN market hours
 * (Mon-Fri 02:00-08:59 UTC, matching the installed VPS crontab window).
 */
export function isVnMarketHoursUtc(now: Date = new Date()): boolean {
  const day = now.getUTCDay(); // 0 = Sun, 6 = Sat
  if (day === 0 || day === 6) return false;
  const h = now.getUTCHours();
  return h >= 2 && h <= 8;
}

/**
 * Most recent `market_prices.updated_at` as a Date, or null if table empty.
 * Exported for unit tests that inject their own DB.
 */
export function readLatestPriceTimestamp(): Date | null {
  try {
    const db = getDb();
    const row = db
      .query<{ ts: string | null }, []>(
        "SELECT MAX(updated_at) AS ts FROM market_prices",
      )
      .get();
    if (!row?.ts) return null;
    const d = new Date(row.ts);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

/**
 * Runs `sshpass -p <pw> ssh ... <remoteCommand>` and captures stdout+stderr.
 * Rejects on non-zero exit or timeout.
 */
function runSshCommand(
  ip: string,
  user: string,
  password: string,
  remoteCommand: string,
  timeoutMs = 20_000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      "-p",
      password,
      "ssh",
      "-o",
      "StrictHostKeyChecking=no",
      "-o",
      `ConnectTimeout=${Math.floor(timeoutMs / 1000)}`,
      "-o",
      "BatchMode=no",
      `${user}@${ip}`,
      remoteCommand,
    ];
    const child = spawn("sshpass", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const killer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`ssh timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.on("data", (b) => (stdout += b.toString()));
    child.stderr.on("data", (b) => (stderr += b.toString()));
    child.on("error", (err) => {
      clearTimeout(killer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(killer);
      if (code === 0) resolve(stdout);
      else reject(new Error(`ssh exit ${code}: ${stderr.trim() || stdout.trim()}`));
    });
  });
}

/**
 * One run of the watchdog loop. Exported for tests + manual invocation.
 *
 * Returns a status string for logging:
 *   "ok"                  — prices fresh, nothing to do
 *   "off-hours"           — outside VN market hours, skipped
 *   "cooldown"            — recent re-install within cooldown window
 *   "healed"              — stale detected, crontab re-installed successfully
 *   "missing-credentials" — env vars not set, cannot SSH
 *   "script-missing"      — /root/fetch-prices.sh absent on VPS, operator needed
 *   "failed:<reason>"     — SSH or command failure
 */
export async function runVpsProxyWatchdog(
  options: {
    now?: Date;
    sshExec?: (remoteCommand: string) => Promise<string>;
    notify?: (message: string) => Promise<unknown>;
  } = {},
): Promise<string> {
  const now = options.now ?? new Date();

  if (!isVnMarketHoursUtc(now)) {
    return "off-hours";
  }

  const latest = readLatestPriceTimestamp();
  const ageMs = latest ? now.getTime() - latest.getTime() : Number.POSITIVE_INFINITY;

  if (ageMs < STALE_THRESHOLD_MS) {
    return "ok";
  }

  // Cooldown gate — a long outage must not loop on SSH.
  if (now.getTime() - lastReinstallAt < REINSTALL_COOLDOWN_MS) {
    return "cooldown";
  }

  const ip = process.env["VULTR_IP"] ?? "";
  const user = process.env["VULTR_USERNAME"] ?? "root";
  const password = process.env["VULTR_PASSWORD"] ?? "";
  if (!ip || !password) {
    logger.warn("[vps-watchdog] missing VULTR_IP / VULTR_PASSWORD — cannot self-heal");
    return "missing-credentials";
  }

  const exec =
    options.sshExec ??
    ((cmd: string) => runSshCommand(ip, user, password, cmd));
  const notify =
    options.notify ??
    ((msg: string) => sendTelegramMessage(msg, { parseMode: "" }));

  lastReinstallAt = now.getTime();

  logger.warn("[vps-watchdog] market_prices stale — attempting VPS self-heal", {
    ageMinutes: Math.round(ageMs / 60000),
    latestUpdatedAt: latest?.toISOString() ?? null,
  });

  try {
    // 1. Confirm fetch-prices.sh still exists on the VPS.
    const probe = await exec(
      "test -x /root/fetch-prices.sh && echo present || echo missing",
    );
    if (!probe.includes("present")) {
      logger.error("[vps-watchdog] /root/fetch-prices.sh missing on VPS — operator must redeploy");
      await notify(
        "[VPS watchdog] FAIL — /root/fetch-prices.sh not found on Vultr. Run ./deploy-vps-proxy.sh from a dev machine.",
      );
      return "script-missing";
    }

    // 2. Reinstall the crontab unconditionally (cheap, idempotent).
    //    Single-line crontab replaces whatever is there.
    const installCmd = `echo '${DESIRED_CRON}' | crontab - && crontab -l`;
    const crontabOut = await exec(installCmd);

    if (!crontabOut.includes("fetch-prices.sh")) {
      throw new Error("crontab re-install did not take effect");
    }

    // 3. Fire one immediate test run so market_prices unfreezes inside
    //    the same cycle rather than waiting for the next minute tick.
    await exec("/root/fetch-prices.sh >> /var/log/vn-price-fetch.log 2>&1 && tail -1 /var/log/vn-price-fetch.log");

    logger.warn("[vps-watchdog] VPS cron restored + test run executed");
    await notify(
      `[VPS watchdog] Vultr cron missing — restored.\nCrontab: ${DESIRED_CRON}\nLast VPS push was ${Math.round(ageMs / 60000)} min ago. Test fetch triggered.`,
    );
    return "healed";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[vps-watchdog] self-heal failed", { error: msg });
    try {
      await notify(`[VPS watchdog] FAIL — self-heal error: ${msg.slice(0, 300)}`);
    } catch {
      /* best effort */
    }
    return `failed:${msg}`;
  }
}
