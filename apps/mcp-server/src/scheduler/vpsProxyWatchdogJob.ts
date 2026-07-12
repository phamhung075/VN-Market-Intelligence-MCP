/**
 * VPS Proxy Freshness Watchdog — observe-only alert.
 *
 * Problem:
 *   The VPS price proxy (Vinahost host) is the ONLY path for VN stock prices —
 *   the MCP host is geo-blocked from upstream feeds. On 2026-03-27 the VPS
 *   crontab silently disappeared and market_prices went stale for 10 days
 *   before anyone noticed.
 *
 * Design (chosen over an SSH self-healer):
 *   Liveness of the VPS is the VPS's own responsibility. On the Vinahost host
 *   the fetcher runs as a systemd service (`vn-price-fetch.service`) with
 *   `Restart=always`, which survives reboot, process crash, and accidental
 *   `crontab -r`. This file is the MCP-side observer: it watches
 *   `market_prices.updated_at` freshness and raises a Telegram alert when
 *   pushes stop during VN market hours. It does NOT try to heal the VPS —
 *   no SSH credentials ever touch the Bun process.
 *
 * What this job does:
 *   Every 10 min during VN market hours (02:00-08:59 UTC, Mon-Fri):
 *     1. Read MAX(market_prices.updated_at)
 *     2. If newer than STALE_THRESHOLD_MS → nothing to do
 *     3. Otherwise send one Telegram Chat alert, with dedup cooldown so a
 *        long outage produces a single message rather than a flood
 *
 * Operator action on the alert:
 *   SSH into the VPS and run `systemctl status vn-price-fetch` — the
 *   Telegram message includes the exact command. If the service is truly
 *   broken, redeploy via `./deploy-vinahost.sh` from a developer machine.
 *
 * @module scheduler/vpsProxyWatchdogJob
 */

import { getDb } from "../infrastructure/db/schema.js";
import { sendTelegramWork, sendTelegramMarket } from "../infrastructure/notifiers/telegram.js";
import { logger } from "../infrastructure/logger.js";

/** If the newest market_prices row is older than this, raise an alert.
 * VPS pushes every ~5-10 min. 45 min allows several missed pushes before
 * alerting — avoids false alarms on brief lulls or VPS reboot. */
const STALE_THRESHOLD_MS = 45 * 60 * 1000; // 45 minutes

/** If the newest insider_transactions row is older than this, raise an alert.
 * insiderCheckJob runs once daily (01:00 UTC) — not intraday like the other
 * 4 sources. 4 days is generous enough to tolerate occasional legitimate
 * zero-new-disclosure days while still catching a silent multi-day outage
 * (FIX for FR-2.2: insider_transactions had 0 rows across ~2 months of
 * "successful" daily runs — the VPS proxy's SSC-portal fetch was silently
 * 502ing on every run and nothing surfaced that fact). See
 * BA-PREDICTION-EVIDENCE-REVIVAL architecture brief §1 FR-2.2. */
const INSIDER_STALE_MS = 4 * 24 * 60 * 60 * 1000; // 4 days

/** Minimum wait between two stale-alerts during the same outage. */
const ALERT_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

let lastAlertAt = 0;
let lastWasStale = false;

/**
 * Test-only reset of the in-module cooldown timer.
 */
export function _resetWatchdogCooldown(): void {
  lastAlertAt = 0;
  lastWasStale = false;
}

/**
 * Test-only reset of the lastWasStale recovery flag.
 */
export function _resetWatchdogStaleFlag(): void {
  lastWasStale = false;
}

/**
 * Returns true if the current UTC instant is inside VN market hours
 * (Mon-Fri 02:00-08:59 UTC, matching the VPS systemd schedule window).
 */
export function isVnMarketHoursUtc(now: Date = new Date()): boolean {
  const day = now.getUTCDay(); // 0 = Sun, 6 = Sat
  if (day === 0 || day === 6) return false;
  const h = now.getUTCHours();
  return h >= 2 && h <= 8;
}

/**
 * Most recent `market_prices.updated_at` as a Date, or null if table empty.
 * Exported for tests.
 */
export function readLatestPriceTimestamp(): Date | null {
  try {
    const db = getDb();
    const row = db
      .query<{ ts: string | null }, []>(
        "SELECT MAX(updated_at) AS ts FROM market_prices WHERE code NOT IN ('TEST','PROBE')",
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
 * Most recent `rag_analyses.created_at` as a Date, or null if table empty.
 * Exported for tests.
 */
export function readLatestNewsTimestamp(): Date | null {
  try {
    const db = getDb();
    const row = db
      .query<{ ts: string | null }, []>(
        "SELECT MAX(created_at) AS ts FROM rag_analyses",
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
 * Most recent `daily_foreign_flow.updated_at` where foreign_buy_vol is populated,
 * as a Date, or null if no foreign-flow rows exist.
 *
 * ARCH-DAILY-FOREIGN-FLOW-TABLE/TASK_2004 (SUBTASK-DAILY-FF-5, 2026-07-12): migrated
 * OFF legacy `daily_ohlcv.foreign_*` onto the new authoritative `daily_foreign_flow`
 * table, queried directly (NOT via the `daily_ohlcv_with_flow` compat view — the
 * view's COALESCE fallback to legacy `daily_ohlcv` columns would mask a stale/dead
 * foreign-flow writer behind a healthy-looking OHLCV row). This decouples
 * "is the foreign-flow VPS pipeline healthy" from "has the OHLCV pipeline also
 * written a row" — a stalled OHLCV writer no longer masquerades as
 * foreign-flow-stale. The vn-foreign-flow.service now writes exclusively to
 * `daily_foreign_flow` (unconditional upsert, TASK_2002); this reader detects when
 * that service last pushed data.
 * Exported for tests.
 */
export function readLatestForeignFlowTimestamp(): Date | null {
  try {
    const db = getDb();
    const row = db
      .query<{ ts: string | null }, []>(
        "SELECT MAX(updated_at) AS ts FROM daily_foreign_flow WHERE foreign_buy_vol IS NOT NULL",
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
 * Most recent `daily_ohlcv.date` as a Date, or null if table empty.
 * daily_ohlcv.date is TEXT ISO date ("2026-04-21") — parse via new Date().
 * Exported for tests.
 */
export function readLatestOhlcvTimestamp(): Date | null {
  try {
    const db = getDb();
    const row = db
      .query<{ ts: string | null }, []>(
        "SELECT MAX(date) AS ts FROM daily_ohlcv",
      )
      .get();
    if (!row?.ts) return null;
    // "2026-04-21" → treated as UTC midnight
    const d = new Date(row.ts + "T00:00:00Z");
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

/**
 * Most recent `insider_transactions.fetched_at` as a Date, or null if the
 * table has never received a row (mirrors readLatestPriceTimestamp's
 * try/catch-null pattern). FR-2.2 (BA-PREDICTION-EVIDENCE-REVIVAL hop1):
 * closes the observability gap on insiderCheckJob's silent-empty-success —
 * the job has recorded status='success' daily for ~2 months while the raw
 * SSC-portal fetch (via the VPS proxy) 502'd on every single run.
 * Exported for tests.
 */
export function readLatestInsiderTimestamp(): Date | null {
  try {
    const db = getDb();
    const row = db
      .query<{ ts: string | null }, []>(
        "SELECT MAX(fetched_at) AS ts FROM insider_transactions",
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
 * One run of the watchdog. Exported for tests + manual invocation.
 *
 * Return values:
 *   "ok"                  — prices fresh, nothing to do
 *   "off-hours"           — outside VN market hours, skipped
 *   "alert-sent"          — stale detected, operator notified
 *   "cooldown"            — stale but a recent alert already went out
 *   "notify-failed"       — telegram send returned false / threw
 */
export async function runVpsProxyWatchdog(
  options: {
    now?: Date;
    notify?: (message: string) => Promise<unknown>;
    notifyUser?: (message: string) => Promise<unknown>;
    readPrice?:       () => Date | null;
    readNews?:        () => Date | null;
    readOhlcv?:       () => Date | null;
    readForeignFlow?: () => Date | null;
    readReuters?:     () => Date | null;
    readTe?:          () => Date | null;
    readInsider?:     () => Date | null;
  } = {},
): Promise<string> {
  const now = options.now ?? new Date();

  // Off-hours guard: always first, regardless of source staleness
  if (!isVnMarketHoursUtc(now)) {
    return "off-hours";
  }

  // Resolve readers (DI for tests, real functions in production)
  const priceReader       = options.readPrice       ?? readLatestPriceTimestamp;
  const newsReader        = options.readNews        ?? readLatestNewsTimestamp;
  const ohlcvReader       = options.readOhlcv       ?? readLatestOhlcvTimestamp;
  const foreignFlowReader = options.readForeignFlow ?? readLatestForeignFlowTimestamp;
  const insiderReader     = options.readInsider     ?? readLatestInsiderTimestamp;
  const latestPrice       = priceReader();
  const latestNews        = newsReader();
  const latestOhlcv       = ohlcvReader();
  const latestForeignFlow = foreignFlowReader();
  const latestInsider     = insiderReader();

  const priceAgeMs       = latestPrice       ? now.getTime() - latestPrice.getTime()       : Infinity;
  const newsAgeMs        = latestNews        ? now.getTime() - latestNews.getTime()        : Infinity;
  // OHLCV is daily — stale threshold 26 h
  const ohlcvAgeMs       = latestOhlcv       ? now.getTime() - latestOhlcv.getTime()       : Infinity;
  // null = service has never written data (e.g. fresh deploy or empty DB) — treat as stale (Infinity), not fresh
  const foreignFlowAgeMs = latestForeignFlow ? now.getTime() - latestForeignFlow.getTime() : Infinity;
  // insiderCheckJob is daily too — null = never received a disclosure row (FR-2.2 silent-bug case)
  const insiderAgeMs     = latestInsider     ? now.getTime() - latestInsider.getTime()     : Infinity;

  const NEWS_STALE_MS         = STALE_THRESHOLD_MS;           // 45 min
  const OHLCV_STALE_MS        = 26 * 60 * 60 * 1000;         // 26 hours
  const FOREIGN_FLOW_STALE_MS = 90 * 60 * 1000;              // 90 minutes

  // Collect stale sources
  type StaleEntry = { service: string; latestStr: string; ageMin: number };
  const stale: StaleEntry[] = [];

  if (priceAgeMs >= STALE_THRESHOLD_MS) {
    stale.push({
      service: "vn-price-fetch",
      latestStr: latestPrice ? latestPrice.toISOString() : "never",
      ageMin: isFinite(priceAgeMs) ? Math.round(priceAgeMs / 60_000) : -1,
    });
  }
  if (newsAgeMs >= NEWS_STALE_MS) {
    stale.push({
      service: "vn-news-fetch",
      latestStr: latestNews ? latestNews.toISOString() : "never",
      ageMin: isFinite(newsAgeMs) ? Math.round(newsAgeMs / 60_000) : -1,
    });
  }
  if (ohlcvAgeMs >= OHLCV_STALE_MS) {
    stale.push({
      service: "vn-price-fetch",  // OHLCV is written by vn-price-fetch.service
      latestStr: latestOhlcv ? latestOhlcv.toISOString() : "never",
      ageMin: isFinite(ohlcvAgeMs) ? Math.round(ohlcvAgeMs / 60_000) : -1,
    });
  }
  if (foreignFlowAgeMs >= FOREIGN_FLOW_STALE_MS) {
    stale.push({
      service: "vn-foreign-flow",
      latestStr: latestForeignFlow ? latestForeignFlow.toISOString() : "never",
      ageMin: isFinite(foreignFlowAgeMs) ? Math.round(foreignFlowAgeMs / 60_000) : -1,
    });
  }
  if (insiderAgeMs >= INSIDER_STALE_MS) {
    stale.push({
      service: "vn-ssc-insider-fetch",
      latestStr: latestInsider ? latestInsider.toISOString() : "never",
      ageMin: isFinite(insiderAgeMs) ? Math.round(insiderAgeMs / 60_000) : -1,
    });
  }
  if (stale.length === 0) {
    if (lastWasStale) {
      lastWasStale = false;
      // Report #2596: recovery notification is dev-only too — WORK channel handled by notify() upstream
      return "restored";
    }
    return "ok";
  }

  if (now.getTime() - lastAlertAt < ALERT_COOLDOWN_MS) {
    return "cooldown";
  }

  // De-duplicate service names in log (OHLCV + price both map to vn-price-fetch)
  const serviceNames = [...new Set(stale.map((s) => s.service))].join(", ");

  logger.warn("[vps-watchdog] stale sources detected during VN market hours", {
    services: serviceNames,
    staleCount: stale.length,
  });

  // Build consolidated message
  const staleLines = stale
    .map((s) =>
      `  • ${s.service}: last=${s.latestStr}, stale=${s.ageMin >= 0 ? `${s.ageMin} min` : "no data since boot"}`,
    )
    .join("\n");

  const insiderStale = stale.some((s) => s.service === "vn-ssc-insider-fetch");
  const insiderNote = insiderStale
    ? `\n\n` +
      `vn-ssc-insider-fetch is NOT a VPS systemd unit — it is insiderCheckJob (mcp-server) ` +
      `calling the VPS proxy's /proxy/ssc-insider route, which fetches congbothongtin.ssc.gov.vn ` +
      `directly. A systemctl restart will not fix this. Root cause is tracked separately: ` +
      `BACKLOG FIX-VPS-SSC-INSIDER-502 (zone vps-scripts/, needs live VPS SSH diagnosis of the ` +
      `SSC portal fetch — may be an external outage/restructure, not code-fixable this sprint).`
    : "";

  const message =
    `[VPS watchdog] Stale data detected — ${stale.length} source(s):\n` +
    `${staleLines}\n` +
    `\n` +
    `Operator action:\n` +
    `  ssh root@$VINAHOST_IP\n` +
    `  systemctl status vn-price-fetch\n` +
    `  systemctl status vn-bctc-fetch\n` +
    `  systemctl status vn-news-fetch\n` +
    `  systemctl status vn-sbv-fetch\n` +
    `  systemctl status vn-foreign-flow\n` +
    `  journalctl -u vn-price-fetch -n 30\n` +
    `  journalctl -u vn-bctc-fetch -n 30\n` +
    `  journalctl -u vn-news-fetch -n 30\n` +
    `  journalctl -u vn-sbv-fetch -n 30\n` +
    `  journalctl -u vn-foreign-flow -n 30\n` +
    `\n` +
    `If units are broken, redeploy: ./deploy-vinahost.sh` +
    insiderNote;

  const notify =
    options.notify ??
    ((msg: string) => sendTelegramWork(msg, { parseMode: "" }));

  // Report #2596: VPS pipeline alerts are dev diagnostics — WORK channel only.
  // Default notifyUser is a no-op; inject for tests. Production no longer sends to MARKET.
  const notifyUser =
    options.notifyUser ??
    ((_msg: string) => Promise.resolve(undefined));

  try {
    const ok = await notify(message);
    if (ok === false) {
      return "notify-failed";
    }
    lastAlertAt = now.getTime();
    lastWasStale = true;
    // Call notifyUser (injectable for tests; production default is no-op)
    try {
      await notifyUser(
        `Data pipeline issue: ${[...new Set(stale.map((s) => s.service))].join(", ")} stale`,
      );
    } catch {
      // ignore
    }
    return "alert-sent";
  } catch (err) {
    logger.error("[vps-watchdog] alert send failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return "notify-failed";
  }
}
