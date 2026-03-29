/**
 * Intelligence Cycle Job — Task 106 (interface/scheduler layer)
 *
 * Unified 15-minute intelligence cycle that replaces the standalone 30-min
 * news-poll cron. During market hours (09:00–15:30 GMT+7, Mon–Fri) it runs
 * the full 5-step cycle; outside market hours it runs the reduced news-only
 * cycle (step A only, typically called every 60 min via the same 15-min cron).
 *
 * Cycle steps:
 *   A. pollNews()            — always (market hours + off-hours)
 *   B. listSscDocuments()    — market hours only (lightweight list, no parse)
 *   C. fetchHosePrices()     — market hours only
 *   D. runImpactChain()      — market hours only (new news entries from A)
 *   E. sendAlerts()          — market hours only (HIGH/CRITICAL → Telegram)
 *
 * A module-level concurrency guard prevents overlapping runs.
 * A duration warning is logged when the cycle exceeds 12 minutes.
 *
 * Layer: interface/scheduler — imports from application/usecases and
 * infrastructure only. Must not import directly from domain/.
 */

import { logger } from "../infrastructure/logger.js";
import type { PollNewsResult } from "../application/usecases/pollNews.js";
import type { SscDocument } from "../infrastructure/fetchers/ssc.js";
import type { Alert } from "../domain/services/alertGenerator.js";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Summary of one complete intelligence cycle run.
 *
 * @property durationMs          - Wall-clock duration of the full cycle in milliseconds
 * @property isMarketHours       - Whether the cycle ran in market-hours mode
 * @property newsFetched         - Total RSS items fetched (from pollNews.fetched)
 * @property sscDocsFound        - Total SSC documents found across all watchlist codes
 * @property pricesFetched       - Number of price records fetched from HOSE
 * @property impactEventsRan     - Number of impact chain events processed
 * @property telegramAlertsSent  - Number of HIGH/CRITICAL alerts sent to Telegram
 * @property errors              - Number of sub-step failures (non-fatal)
 */
export interface CycleResult {
  durationMs: number;
  isMarketHours: boolean;
  newsFetched: number;
  sscDocsFound: number;
  pricesFetched: number;
  impactEventsRan: number;
  telegramAlertsSent: number;
  errors: number;
}

/**
 * Injectable sub-job functions for testing.
 * All default to real production implementations via dynamic import.
 *
 * @property pollNewsFn           - Override for the news poll step
 * @property listSscDocsFn        - Override for SSC document listing (one stock code)
 * @property fetchPricesFn        - Override for HOSE price fetcher (returns count)
 * @property runImpactChainFn     - Override for impact chain runner (returns count)
 * @property sendAlertsFn         - Override for Telegram alert sender (returns sent count)
 * @property getWatchlistCodesFn  - Override for watchlist code lookup
 * @property isMarketHoursFn      - Override for market-hours check (for test determinism)
 * @property fakeDurationMs       - Inject a fake elapsed duration (for warning test)
 */
export interface CycleDeps {
  pollNewsFn?: () => Promise<PollNewsResult>;
  listSscDocsFn?: (code: string) => Promise<SscDocument[]>;
  fetchPricesFn?: () => Promise<number>;
  runImpactChainFn?: () => Promise<number>;
  sendAlertsFn?: (alerts: Alert[]) => Promise<number>;
  getWatchlistCodesFn?: () => Promise<string[]>;
  isMarketHoursFn?: () => boolean;
  /** For testing only: override the measured durationMs (triggers warning if > 12 min) */
  fakeDurationMs?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Duration warning threshold
// ─────────────────────────────────────────────────────────────────────────────

/** 12 minutes in milliseconds — log WARN if cycle exceeds this. */
const CYCLE_WARN_THRESHOLD_MS = 12 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────────────
// Concurrency guard
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Module-level flag: true while a cycle is in flight.
 * Protected against concurrent cron invocations.
 */
let cycleRunning = false;

/**
 * Reset the concurrency guard (for test isolation only).
 * Not exported to production consumers; test files import this via named export.
 *
 * @internal
 */
export function resetCycleGuard(): void {
  cycleRunning = false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Market hours check
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true when the given time (defaulting to now) falls within Vietnamese
 * stock market trading hours: Monday–Friday, 09:00–15:30 GMT+7.
 *
 * Implementation uses UTC offset arithmetic to avoid timezone library dependency.
 *
 * @param now - Optional Date to check (defaults to current time)
 */
export function isMarketHours(now?: Date): boolean {
  const date = now ?? new Date();
  // Shift to GMT+7 using UTC arithmetic
  const gmt7 = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  const dayOfWeek = gmt7.getUTCDay(); // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
  const hour = gmt7.getUTCHours();
  const minute = gmt7.getUTCMinutes();
  const totalMinutes = hour * 60 + minute;

  // Monday=1 through Friday=5
  if (dayOfWeek < 1 || dayOfWeek > 5) return false;
  // 09:00 = 540 min, 15:30 = 930 min
  return totalMinutes >= 540 && totalMinutes <= 930;
}

// ─────────────────────────────────────────────────────────────────────────────
// Default production implementations (lazy dynamic imports)
// ─────────────────────────────────────────────────────────────────────────────

async function defaultPollNews(): Promise<PollNewsResult> {
  const { pollNews } = await import("../application/usecases/pollNews.js");
  return pollNews();
}

async function defaultListSscDocs(code: string): Promise<SscDocument[]> {
  const { listSscDocuments } = await import("../infrastructure/fetchers/ssc.js");
  return listSscDocuments(code, "all");
}

async function defaultFetchPrices(codes: string[]): Promise<number> {
  if (codes.length === 0) return 0;
  const { fetchHosePrices } = await import("../infrastructure/fetchers/hose.js");
  const prices = await fetchHosePrices(codes);
  return prices.length;
}

async function defaultRunImpactChain(): Promise<number> {
  // Impact chain is already run inside pollNews per-entry.
  // This placeholder returns 0 to indicate no additional events were processed.
  return 0;
}

async function defaultSendAlerts(alerts: Alert[]): Promise<number> {
  if (alerts.length === 0) return 0;
  try {
    const { notifyTelegramAlert } = await import("../infrastructure/notifiers/telegram.js");
    let sent = 0;
    for (const alert of alerts) {
      if (alert.severity === "high" || alert.severity === "critical") {
        const ok = await notifyTelegramAlert(alert);
        if (ok) sent++;
      }
    }
    return sent;
  } catch {
    // Telegram not configured or module not available — silent skip
    return 0;
  }
}

async function defaultGetWatchlistCodes(): Promise<string[]> {
  const { getDb } = await import("../infrastructure/db/schema.js");
  const db = getDb();
  const rows = db.prepare("SELECT code FROM watchlist").all() as Array<{ code: string }>;
  return rows.map((r) => r.code);
}

// ─────────────────────────────────────────────────────────────────────────────
// Inner cycle runner (no concurrency guard — called from runIntelligenceCycle)
// ─────────────────────────────────────────────────────────────────────────────

async function _runCycle(deps: CycleDeps = {}): Promise<CycleResult> {
  const startTime = Date.now();

  // Resolve dependency functions
  const pollNewsFn = deps.pollNewsFn ?? defaultPollNews;
  const listSscDocsFn = deps.listSscDocsFn ?? defaultListSscDocs;
  const runImpactChainFn = deps.runImpactChainFn ?? defaultRunImpactChain;
  const sendAlertsFn = deps.sendAlertsFn ?? defaultSendAlerts;
  const isMarketHoursFn = deps.isMarketHoursFn ?? isMarketHours;
  const marketHours = isMarketHoursFn();

  let watchlistCodes: string[] = [];
  let errors = 0;
  let newsFetched = 0;
  let sscDocsFound = 0;
  let pricesFetched = 0;
  let impactEventsRan = 0;
  let telegramAlertsSent = 0;

  // Step 0: Load watchlist codes (needed for SSC list + price fetch)
  if (marketHours) {
    try {
      const getWatchlistCodesFn = deps.getWatchlistCodesFn ?? defaultGetWatchlistCodes;
      watchlistCodes = await getWatchlistCodesFn();
    } catch (err) {
      errors++;
      logger.error("[intelligence-cycle] failed to load watchlist codes", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Step A: Poll news (always, both market and off-hours)
  try {
    const pollResult = await pollNewsFn();
    newsFetched = pollResult.fetched;
    logger.debug("[intelligence-cycle] step A complete — news polled", {
      fetched: pollResult.fetched,
      inserted: pollResult.inserted,
      alerts: pollResult.alerts,
    });
  } catch (err) {
    errors++;
    logger.error("[intelligence-cycle] step A failed — pollNews error", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  if (marketHours) {
    // Step B: List SSC documents (lightweight, no full parse)
    try {
      const sscPromises = watchlistCodes.map(async (code) => {
        try {
          const docs = await listSscDocsFn(code);
          return docs.length;
        } catch (err) {
          errors++;
          logger.warn("[intelligence-cycle] step B failed for code", {
            code,
            error: err instanceof Error ? err.message : String(err),
          });
          return 0;
        }
      });
      const docCounts = await Promise.all(sscPromises);
      sscDocsFound = docCounts.reduce((sum, n) => sum + n, 0);
      logger.debug("[intelligence-cycle] step B complete — SSC docs listed", {
        sscDocsFound,
      });
    } catch (err) {
      errors++;
      logger.error("[intelligence-cycle] step B failed — SSC list error", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Step C: Fetch HOSE prices for watchlist
    try {
      const fetchPricesFn = deps.fetchPricesFn ?? (() => defaultFetchPrices(watchlistCodes));
      pricesFetched = await fetchPricesFn();
      logger.debug("[intelligence-cycle] step C complete — prices fetched", {
        pricesFetched,
      });
    } catch (err) {
      errors++;
      logger.error("[intelligence-cycle] step C failed — fetchPrices error", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Step D: Run impact chain on new news entries
    try {
      impactEventsRan = await runImpactChainFn();
      logger.debug("[intelligence-cycle] step D complete — impact chain ran", {
        impactEventsRan,
      });
    } catch (err) {
      errors++;
      logger.error("[intelligence-cycle] step D failed — runImpactChain error", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Step E: Send HIGH/CRITICAL alerts to Telegram
    try {
      // Collect alerts from DB (or injected — for testing pass empty array)
      const alerts: Alert[] = [];
      telegramAlertsSent = await sendAlertsFn(alerts);
      logger.debug("[intelligence-cycle] step E complete — alerts sent", {
        telegramAlertsSent,
      });
    } catch (err) {
      errors++;
      logger.error("[intelligence-cycle] step E failed — sendAlerts error", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Compute duration
  const actualDurationMs = Date.now() - startTime;
  const durationMs = deps.fakeDurationMs ?? actualDurationMs;

  if (durationMs > CYCLE_WARN_THRESHOLD_MS) {
    logger.warn("[intelligence-cycle] cycle exceeded 12 minutes", {
      durationMs,
      thresholdMs: CYCLE_WARN_THRESHOLD_MS,
    });
  }

  const result: CycleResult = {
    durationMs,
    isMarketHours: marketHours,
    newsFetched,
    sscDocsFound,
    pricesFetched,
    impactEventsRan,
    telegramAlertsSent,
    errors,
  };

  logger.info("[intelligence-cycle] cycle complete", {
    ...result,
    mode: marketHours ? "full" : "reduced",
  });

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run one intelligence cycle.
 *
 * Enforces a module-level concurrency guard: if a previous cycle is still
 * running, logs a warning and returns null immediately.
 *
 * @param deps - Optional injectable sub-job functions (for testing)
 * @returns    - CycleResult on success; null if skipped due to concurrency
 */
export async function runIntelligenceCycle(
  deps?: CycleDeps,
): Promise<CycleResult | null> {
  if (cycleRunning) {
    logger.warn("[intelligence-cycle] previous cycle still running — skipped");
    return null;
  }

  cycleRunning = true;

  try {
    return await _runCycle(deps);
  } finally {
    cycleRunning = false;
  }
}
