/**
 * Intelligence Cycle Job — Task 106 (interface/scheduler layer)
 *
 * Unified 15-minute intelligence cycle that replaces the standalone 30-min
 * news-poll cron. During market hours (09:00–15:30 GMT+7, Mon–Fri) it runs
 * the full 7-step cycle; outside market hours it runs the reduced news-only
 * cycle (step A only, typically called every 60 min via the same 15-min cron).
 *
 * Cycle steps:
 *   A. pollNews()            — always (market hours + off-hours)
 *   B. listSscDocuments()    — market hours only (lightweight list, no parse)
 *   C. fetchHosePrices()     — market hours only
 *   D. runImpactChain()      — market hours only (new news entries from A)
 *   E. sendAlerts()          — market hours only (HIGH/CRITICAL → Telegram)
 *   F. answerUserRequests()  — always (not gated on market hours)
 *   G. chainSynthesis()      — always (server-side, zero Claude API tokens)
 *
 * A module-level concurrency guard prevents overlapping runs.
 * A duration warning is logged when the cycle exceeds 12 minutes.
 *
 * Layer: interface/scheduler — imports from application/usecases and
 * infrastructure only. Must not import directly from domain/.
 */

import { logger } from "../../infrastructure/logger.js";
import { mcpConfig } from "../../infrastructure/config.js";
import { VN_OFFSET_MS } from "../../domain/services/timeConstants.js";
import type { PollNewsResult } from "../../application/usecases/pollNews.js";
import type { SscDocument } from "../../infrastructure/fetchers/ssc.js";
import type { Alert } from "../../domain/services/alertGenerator.js";

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
 * @property hexagramsComputed   - Number of Kinh Dich readings stored in Step A4 (Task 303)
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
  /** Count of hexagram readings auto-computed and stored in this cycle (Step A4). */
  hexagramsComputed: number;
  errors: number;
}

/**
 * Injectable sub-job functions for testing.
 * All default to real production implementations via dynamic import.
 *
 * @property pollNewsFn               - Override for the news poll step
 * @property listSscDocsFn            - Override for SSC document listing (one stock code)
 * @property fetchPricesFn            - Override for HOSE price fetcher (returns count)
 * @property runImpactChainFn         - Override for impact chain runner (returns count)
 * @property sendAlertsFn             - Override for Telegram alert sender (returns sent count)
 * @property getWatchlistCodesFn      - Override for watchlist code lookup
 * @property isMarketHoursFn          - Override for market-hours check (for test determinism)
 * @property readUnnotifiedAlertsFn   - Override for reading unnotified HIGH/CRITICAL alerts from DB
 * @property markAlertNotifiedFn      - Override for marking a single alert as Telegram-notified
 * @property fakeDurationMs           - Inject a fake elapsed duration (for warning test)
 */
export interface CycleDeps {
  pollNewsFn?: () => Promise<PollNewsResult>;
  listSscDocsFn?: (code: string) => Promise<SscDocument[]>;
  fetchPricesFn?: () => Promise<number>;
  runImpactChainFn?: () => Promise<number>;
  sendAlertsFn?: (alerts: Alert[]) => Promise<number>;
  getWatchlistCodesFn?: () => Promise<string[]>;
  isMarketHoursFn?: () => boolean;
  /**
   * Read unnotified HIGH/CRITICAL alerts from DB within the given window.
   * @param windowMs - Look-back window in milliseconds (e.g. 16 * 60 * 1000)
   */
  readUnnotifiedAlertsFn?: (windowMs: number) => Promise<Alert[]>;
  /**
   * Mark a single alert as successfully sent to Telegram.
   * @param alertId - The id of the alert to mark notified
   */
  markAlertNotifiedFn?: (alertId: string) => Promise<void>;
  /** For testing only: override the measured durationMs (triggers warning if > 12 min) */
  fakeDurationMs?: number;
  /**
   * Optional sector peer sync hook (Task 278).
   * Called with watchlist entries after price fetch to refresh peer data.
   * Defaults to the real syncSectorPeers use case when not injected.
   */
  syncSectorPeersFn?: (
    entries: { actionCode: string; domain: string }[],
  ) => Promise<{ synced: number; skipped: number; apiCalls: number }>;
  /**
   * Task 303 — Step A4: injectable hexagram batch function.
   * Receives the list of watchlist codes to process; returns the count of
   * readings successfully stored. When not injected, runs the production
   * implementation (computeHaoScores → computeReading → storeReading).
   * Inject in tests to avoid real SQLite + domain side effects.
   */
  computeHexagramsFn?: (codes: string[]) => Promise<number>;
  /**
   * Task 1281 — Cooldown config for step E alert suppression.
   * When not injected, reads from `mcpConfig.alertQuality` (mcp.config.json).
   * Replaces the former hardcoded `{ cooldownMinutes: 60, maxAlertsPerStockPerDay: 3 }`.
   */
  cooldownConfig?: import("../../domain/services/alertCooldown.js").CooldownConfig;
  /**
   * Task 1281 — Override recent alert history fetch for step E (test isolation).
   * When not injected, step E queries the DB directly.
   * Signature matches the in-memory history format used by shouldSuppressAlert.
   */
  getRecentAlertHistoryFn?: () => Promise<Array<{ stocks: string; signalTypes: string; triggeredAt: string }>>;
  /**
   * Task 1345d — Injectable market summary sender for test isolation.
   * When provided, used instead of the real `sendTelegramMarket` for the
   * market-wide cascade pre-pass summary in step E.
   * In production, defaults to the real `sendTelegramMarket` import.
   */
  sendMarketFn?: (text: string, opts?: Record<string, unknown>) => Promise<boolean>;
  /**
   * Task 1920g — Injectable prediction claim insert function for test isolation.
   * When not injected, defaults to `insertPredictionClaim(db, params)` using
   * the cycle's DB connection.
   * Signature: (params: PredictionClaimInput) => number
   */
  insertClaimFn?: (params: import("../../infrastructure/db/predictionClaimStore.js").PredictionClaimInput) => number;
  /**
   * CI-RED-8081e584-FIX (round 2) — Injectable macro fetch hook for test isolation.
   * When not injected, step A2 runs the real Yahoo Finance + SBV HTTP calls.
   * Inject `async () => {}` in tests to skip real network calls and prevent
   * 30 s bun test timeout in CI where outbound HTTP may be throttled/blocked.
   */
  macroFetchFn?: () => Promise<void>;
  /**
   * CI-RED-8081e584-FIX (round 2) — Injectable vnstock sync hook for test isolation.
   * When not injected, step A3 runs the real syncVnstockData call.
   * Inject `async () => {}` in tests to skip real network calls and prevent
   * 30 s bun test timeout in CI where outbound HTTP may be throttled/blocked.
   */
  vnstockSyncFn?: (codes: string[]) => Promise<void>;
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
 *
 * `cycleStartedAt` records when the current cycle began. If a cycle has been
 * running longer than CYCLE_MAX_RUNTIME_MS (14 min), the guard auto-releases
 * to prevent a hung step from blocking all future cycles permanently.
 */
let cycleRunning = false;
let cycleStartedAt = 0;
/** Timestamp of last off-hours cycle completion (for 60-min throttle). */
let _lastOffHoursRunAt = 0;
/** Date string (YYYY-MM-DD) of last SSC scan — skip intraday repeats. */
let _lastSscScanDate = "";

/** 14 minutes — max allowed runtime before the guard force-releases. */
const CYCLE_MAX_RUNTIME_MS = 14 * 60 * 1000;

/**
 * Reset the concurrency guard (for test isolation only).
 * Not exported to production consumers; test files import this via named export.
 *
 * @internal
 */
export function resetCycleGuard(): void {
  cycleRunning = false;
  cycleStartedAt = 0;
  _lastOffHoursRunAt = 0;
  _lastSscScanDate = "";
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
  const gmt7 = new Date(date.getTime() + VN_OFFSET_MS);
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
  const { pollNews } = await import("../../application/usecases/pollNews.js");
  // Task 1228: ALL news sources are now delivered exclusively via POST /api/push-news
  // from the Vinahost VPS (vn-news-fetch.service, 10 sources, 226 items/15min).
  //
  // Previous behavior: CafeF/VnExpress/VnEconomy were stubbed (task 1187), but
  // Reuters and Trading Economics were still fetched directly. In practice Reuters
  // is also unreliable from France (geo-block or rate-limit), producing repeated
  // "step A failed — pollNews error" entries in system_logs and rows_written=0
  // on every scheduled tick (task 1228).
  //
  // Fix: stub ALL news sources. The scheduled intelligenceCycleJob pollNews
  // call is now a no-op fetcher; all real ingestion happens via the VPS push path
  // in server.ts. This eliminates startup errors and noise in cron_job_runs.
  //
  // Task 1843: teChromiumNews (added in Task 1799) was missing from this stub
  // list. Every 15-minute intelligence cycle tick was launching a real
  // Playwright/Chromium browser process, causing:
  //   - Repeated ~2-second retries (cold-start retry in pollNews)
  //   - Runaway alert entries (1,227 across 255 minute-windows in 2 days)
  //   - CPU/memory waste from orphaned Playwright processes
  // VPS vn-news-fetch.service handles all news sources including Trading
  // Economics; no local fetcher should run from the scheduled cycle.

  // Task 1855a: read VPS news push health to suppress false all-sources-dark
  // alerts. Since all local fetchers are stubbed, a 0-item scheduled cycle is
  // expected when the VPS push pipeline is healthy (last push within 2h).
  // If the DB query fails for any reason, pass null → alert fires (safe default).
  let vpsNewsLastPushTs: Date | null = null;
  try {
    const { getDb } = await import("../../infrastructure/db/schema.js");
    const db = getDb();
    const row = db.prepare(
      `SELECT MAX(pushed_at) AS ts FROM vps_push_log WHERE service = 'news' AND status = 'ok'`,
    ).get() as { ts: string | null } | undefined;
    if (row?.ts) vpsNewsLastPushTs = new Date(row.ts);
  } catch {
    // DB unavailable or table missing — fall through with null (conservative: alert fires)
  }

  return pollNews({
    fetchers: {
      cafef:            async () => [],
      vnexpress:        async () => [],
      vneconomy:        async () => [],
      reuters:          async () => [],  // Task 1228: VPS handles Reuters too
      tradingeconomics: async () => [],  // Task 1228: VPS handles TE too
      teChromiumNews:   async () => [],  // Task 1843: VPS handles TE Chromium news too
    },
    vpsNewsLastPushTs,  // Task 1855a: suppress false alert when VPS push is healthy
  });
}

async function defaultListSscDocs(code: string): Promise<SscDocument[]> {
  const { listSscDocuments } = await import("../../infrastructure/fetchers/ssc.js");
  const year = new Date().getFullYear();
  return listSscDocuments(code, "quarterly", year);
}

async function defaultFetchPrices(codes: string[]): Promise<number> {
  if (codes.length === 0) return 0;

  // Classify stocks by exchange from watchlist domain
  const { getDb } = await import("../../infrastructure/db/schema.js");
  const db = getDb();
  let upcomCodes: string[] = [];
  let hoseCodes: string[] = [];
  try {
    const rows = db.prepare("SELECT code, exchange FROM watchlist").all() as Array<{ code: string; exchange: string }>;
    for (const r of rows) {
      if (r.exchange === "UPCOM") upcomCodes.push(r.code);
      else hoseCodes.push(r.code);
    }
  } catch {
    hoseCodes = codes; // fallback: treat all as HOSE
  }

  let total = 0;

  // Fetch HOSE stocks (VnDirect → CafeF fallback)
  if (hoseCodes.length > 0) {
    const { fetchHosePrices } = await import("../../infrastructure/fetchers/hose.js");
    const prices = await fetchHosePrices(hoseCodes);
    if (prices.length > 0) {
      const { storeMarketPrices } = await import("../../infrastructure/fetchers/hose.js");
      await storeMarketPrices(prices);
    }
    total += prices.length;
  }

  // Fetch UPCOM stocks (VnDirect stock_prices fallback)
  if (upcomCodes.length > 0) {
    const { fetchUpcomPrices } = await import("../../infrastructure/fetchers/hnx.js");
    const { storeMarketPrices } = await import("../../infrastructure/fetchers/hose.js");
    const prices = await fetchUpcomPrices(upcomCodes);
    if (prices.length > 0) await storeMarketPrices(prices);
    total += prices.length;
  }

  return total;
}

async function defaultRunImpactChain(): Promise<number> {
  // Impact chain now runs inside pollNews per-entry (via runImpactChain with macro context).
  // Step D returns 0 because the work is embedded in Step A — this is by design, not a stub.
  return 0;
}

async function defaultSendAlerts(alerts: Alert[]): Promise<number> {
  if (alerts.length === 0) return 0;
  try {
    const { notifyTelegramAlert } = await import("../../infrastructure/notifiers/telegram.js");
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
  const { getDb } = await import("../../infrastructure/db/schema.js");
  const db = getDb();
  const rows = db.prepare("SELECT code FROM watchlist").all() as Array<{ code: string }>;
  return rows.map((r) => r.code);
}

/**
 * Step E look-back window for unnotified HIGH/CRITICAL alerts.
 *
 * Sprint 053 / report 1024: the previous 16-minute window ("15-min cycle + 1
 * overlap") was too tight. Any alert whose first send failed (token miss,
 * network blip, Telegram 429, post-restart race) was orphaned after the
 * second cycle — the window moved forward and the alert was no longer
 * included in subsequent `readUnnotifiedAlerts` reads. User-visible impact:
 * VEA news_mention alert stuck `notified_telegram=0` for 1h+ while the
 * ticker kept moving.
 *
 * New policy: retry any unnotified HIGH/CRITICAL alert up to 24h old. The
 * dedup guard on the downstream `sendAlert` path already prevents
 * double-notify if a prior attempt actually succeeded.
 */
const ALERT_WINDOW_MS = 24 * 60 * 60 * 1000;

async function defaultReadUnnotifiedAlerts(windowMs: number): Promise<Alert[]> {
  const { readUnnotifiedAlerts } = await import("../../infrastructure/db/alertStore.js");
  const windowMinutes = windowMs / 60_000;
  return readUnnotifiedAlerts(windowMinutes);
}

async function defaultMarkAlertNotified(alertId: string): Promise<void> {
  const { markAlertNotified } = await import("../../infrastructure/db/alertStore.js");
  markAlertNotified(alertId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Task 1501 — Per-stock 15-minute hexagram cooldown
// Prevents re-computing a reading for the same stock more than once per 15 min.
// ─────────────────────────────────────────────────────────────────────────────

const _lastHexagramComputedAt: Record<string, number> = {};
const HEXAGRAM_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes

/** Reset the per-stock cooldown map (for test isolation). */
export function resetHexagramCooldown(): void {
  for (const key of Object.keys(_lastHexagramComputedAt)) {
    delete _lastHexagramComputedAt[key];
  }
}

/**
 * Task 303 — Step A4 production implementation.
 *
 * For each watchlist code:
 *   1. Load the previous reading (for Markov transition recording)
 *   2. Compute 6 hao scores from local SQLite (no HTTP)
 *   3. Compute a preliminary reading to get the current hexagram number
 *   4. Fetch Markov transition data for the current hexagram
 *   5. Compute the final reading with Markov context
 *   6. Store the reading with source='cycle'
 *   7. Record the hexagram transition (if a previous reading exists)
 *
 * Per-stock errors are caught and logged at WARN level; the loop continues
 * for remaining codes. The returned count reflects only successful stores.
 *
 * Mirrors the pattern used in the `get_kinhdich_reading` MCP tool.
 */
async function defaultComputeHexagrams(codes: string[]): Promise<number> {
  const { computeHaoScores } = await import(
    "../../interface/mcp/tools/kinhdich/kinhDichTools.js"
  );
  const { computeReading } = await import(
    "../../domain/services/kinhDich/kinhDichReading.js"
  );
  const { getTopTransitions } = await import(
    "../../infrastructure/db/hexagramStore.js"
  );
  const { QUE_META } = await import(
    "../../domain/services/kinhDich/hexagramLibrary.js"
  );
  const {
    getLatestReading,
    storeReading,
    recordTransition,
  } = await import("../../infrastructure/db/hexagramStore.js");

  let computed = 0;

  for (const code of codes) {
    // Task 1501: per-stock 15-min cooldown — skip if computed recently
    const lastAt = _lastHexagramComputedAt[code] ?? 0;
    if (lastAt > 0 && Date.now() - lastAt < HEXAGRAM_COOLDOWN_MS) {
      logger.debug("[intelligence-cycle] step A4 — cooldown active, skipping stock", { code });
      continue;
    }

    try {
      // 1. Previous reading (for Markov)
      const previousReading = getLatestReading(code);

      // 2. Compute 6 hao scores from local SQLite
      const scores = computeHaoScores(code);

      // 3. Preliminary reading to get current hexagram number
      const prelimReading = computeReading(code, scores, null);
      const currentHexagram = prelimReading.queChiNh.number;

      // 4. Markov transition data
      let markovData = null;
      try {
        const tops = getTopTransitions(currentHexagram, code, 1);
        if (tops.length > 0 && tops[0]!.probability > 0) {
          const meta = QUE_META.find((q) => q.id === tops[0]!.toHexagram);
          markovData = {
            nextMostLikely: tops[0]!.toHexagram,
            nextName: meta?.name ?? `Que ${tops[0]!.toHexagram}`,
            probability: tops[0]!.probability,
          };
        }
      } catch { /* best-effort — no Markov data on first run */ }

      // 5. Final reading with Markov context
      const reading = computeReading(code, scores, markovData);

      // 6. Store with source='cycle'
      storeReading({
        stockCode: code,
        hexagramNumber: reading.queChiNh.number,
        hoQueNumber: reading.hoQue.number,
        bienQueNumber: reading.bienQue.number,
        haoStates: JSON.stringify(reading.haos.map((h) => h.state)),
        rawScores: JSON.stringify(scores),
        nguHanhDynamic: reading.nguHanh.dynamic,
        tradingSignal: reading.queChiNh.tradingSignal,
        confidence: reading.queChiNh.confidence,
        actionNote: reading.actionNote,
        source: 'cycle',
      });

      // 7. Record transition if previous reading exists
      if (previousReading) {
        recordTransition(
          previousReading.hexagramNumber,
          reading.queChiNh.number,
          code,
        );
      }

      _lastHexagramComputedAt[code] = Date.now();
      computed++;
    } catch (err) {
      logger.warn("[intelligence-cycle] step A4 — failed for stock", {
        code,
        error: err instanceof Error ? err.message : String(err),
      });
      // Per-stock errors are non-fatal; the outer batch-level try/catch
      // handles timeouts and increments the cycle's `errors` counter.
    }
  }

  return computed;
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-step timeout helper
// ─────────────────────────────────────────────────────────────────────────────

/** 2 minutes — max allowed runtime for any single cycle step. */
const STEP_TIMEOUT_MS = 2 * 60 * 1000;

/**
 * 5 minutes — max allowed runtime for step A (pollNews). pollNews does far
 * more work than other steps: 5 RSS fetches + normalize + sentiment classify
 * + per-entry cascade + trade-relationship analysis + per-entry RAG retrieval
 * + alert generation + persistence. Empirically the 95th percentile sits
 * around 10–15 s, but a slow upstream (CafeF rate-limit, Reuters hang) combined
 * with a batch of 100 first-run inserts can push past 120 s. Report 1062 (2026-04-08)
 * captured one such timeout at 06:47 UTC. Bumping to 5 min gives pollNews
 * headroom without letting a truly hung run block later cycles (outer 14-min
 * cycle guard still protects against permanent hangs).
 */
const POLL_NEWS_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * 5 minutes — max allowed runtime for step C2 (syncSectorPeers). Task 1006
 * raised MAX_PEER_SYNCS_PER_CYCLE to 40, so on the first intelligence cycle
 * of a market-open day the peer fan-out (price + financials per peer across
 * banking/real-estate/steel/consumer) regularly exceeds the generic 120 s
 * step cap. Report 1073 (2026-04-10 09:06 VN) captured one such timeout on
 * the first post-open cycle. Mirrors fix 1062's pollNews treatment.
 */
const SYNC_PEERS_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * 3 minutes — max allowed runtime for each individual step B SSC fetch.
 * The SSC portal (congbothongtin.ssc.gov.vn) is slow under concurrent load:
 * when 10+ watchlist tickers fire Promise.all simultaneously, each individual
 * fetch can exceed the generic 120 s cap. Report 1076 raised to 3 min, but
 * report 1082 (2026-04-10 08:35 UTC) showed 10 tickers still timing out at
 * 180 s during post-market-open cycle. Raised to 5 min to match syncPeers.
 */
const STEP_B_SSC_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Runs a promise with a timeout. If the promise doesn't resolve within
 * `timeoutMs`, rejects with a timeout error and the step is skipped.
 */
function withTimeout<T>(promise: Promise<T>, label: string, timeoutMs = STEP_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);

    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
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
  let hexagramsComputed = 0;

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
    const pollResult = await withTimeout(pollNewsFn(), "step A pollNews", POLL_NEWS_TIMEOUT_MS);
    newsFetched = pollResult.fetched;
    logger.debug("[intelligence-cycle] step A complete — news polled", {
      fetched: pollResult.fetched,
      inserted: pollResult.inserted,
      alerts: pollResult.alerts,
    });
  } catch (err) {
    errors++;
    // Surface FULL exception context so operators can diagnose without guessing.
    // Reports 1065/1066 (2026-04-08) both cited opaque "pollNews error" with no
    // root cause — this block previously swallowed stack + cause. Keep the
    // message prefix stable for log-grep but enrich the context payload.
    const errName = err instanceof Error ? err.name : typeof err;
    const errMsg = err instanceof Error ? err.message : String(err);
    const errStack = err instanceof Error ? err.stack : undefined;
    const errCause = err instanceof Error && "cause" in err ? String((err as { cause?: unknown }).cause) : undefined;
    logger.error("[intelligence-cycle] step A failed — pollNews error", {
      step: "A.pollNews",
      errName,
      error: errMsg,
      stack: errStack,
      cause: errCause,
    });
  }

  // Step A2: Fetch macro data (always — builds σ history 24/7)
  // macroFetchFn is injectable for test isolation (prevents real HTTP calls in CI).
  try {
    const macroFetchFn = deps.macroFetchFn ?? (async () => {
      try {
        const { fetchYahooFinancePrices, storeCommoditySnapshot } = await import("../../infrastructure/fetchers/yahooFinance.js");
        const commodity = await fetchYahooFinancePrices();
        if (commodity) await storeCommoditySnapshot(commodity);
      } catch { /* best-effort */ }
      try {
        const { fetchSbvRates, storeSbvSnapshot } = await import("../../infrastructure/fetchers/sbv.js");
        const sbv = await fetchSbvRates();
        if (sbv) await storeSbvSnapshot(sbv);
      } catch { /* best-effort */ }
    });
    await withTimeout(macroFetchFn(), "step A2 macroFetch");
  } catch { /* non-fatal */ }

  // Step A2.5: Macro deviation alerts (Backlog 765 fix — Loop #29)
  // Classify rolling-stats deviations; persist synthetic HIGH/CRITICAL alerts for
  // high/extreme breaches so the alert-trigger pipeline (Step E) actually fires.
  // Deterministic id = date + indicator + level → INSERT OR IGNORE dedups one
  // alert per indicator per level per UTC day (natural cooldown).
  //
  // Anti-spam guards (Task 1291-follow-up):
  //   1. usdVndOfficial is skipped — it duplicates usdVndRate (same source, near-identical σ).
  //   2. Before inserting, skip any indicator that already has a sent alert today
  //      (notified_telegram=1, id LIKE 'macro-{today}-{name}-%'). This prevents
  //      level-drift (extreme→high) from re-firing the same condition hours later.
  try {
    await withTimeout((async () => {
    const { getAllMacroStats } = await import("../../infrastructure/db/macroStatsStore.js");
    const { classifyDeviation } = await import("../../domain/services/macroThresholds.js");
    const { storeAlerts } = await import("../../infrastructure/db/alertStore.js");
    const { getDb: getDatabase } = await import("../../infrastructure/db/schema.js");
    const stats = getAllMacroStats();
    const today = new Date().toISOString().slice(0, 10);
    const nowIso = new Date().toISOString();
    const db = getDatabase();
    const macroAlerts: Alert[] = [];
    for (const s of stats) {
      // Skip usdVndOfficial — duplicates usdVndRate (same USD/VND condition, near-identical σ)
      if (s.name === "usdVndOfficial") continue;

      const dev = classifyDeviation(s);
      if (dev.level !== "high" && dev.level !== "extreme") continue;

      // Skip if any alert for this indicator was already STORED today — prevents
      // level-drift (e.g. extreme→high) from re-firing the same condition hours later.
      // Do NOT filter by notified_telegram: a stored-but-unsent row still represents
      // the same economic event and must suppress the duplicate (task 1307a).
      const alreadySentToday = db.prepare(
        `SELECT 1 FROM alerts WHERE id LIKE ? LIMIT 1`
      ).get(`macro-${today}-${dev.name}-%`) as { 1: number } | undefined;
      if (alreadySentToday) continue;

      const severity = dev.level === "extreme" ? "critical" : "high";
      macroAlerts.push({
        id: `macro-${today}-${dev.name}-${dev.level}`,
        actionCode: "MACRO",
        signals: [{
          actionCode: "MACRO",
          type: "macro_deviation",
          severity,
          message: dev.summary,
          timestamp: nowIso,
        // biome-ignore lint/suspicious/noExplicitAny: Signal type cross-imported
        } as any],
        severity,
        message: `Macro alert [${dev.level.toUpperCase()}]: ${dev.summary}`,
        isRead: false,
        createdAt: nowIso,
      });
    }
    if (macroAlerts.length > 0) {
      storeAlerts(macroAlerts, db);
      logger.info("[intelligence-cycle] step A2.5 — macro alerts persisted", {
        count: macroAlerts.length,
        ids: macroAlerts.map((a) => a.id),
      });
    }
    })(), "step A2.5 macroAlerts");
  } catch (err) {
    logger.warn("[intelligence-cycle] step A2.5 macro alert generation failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Step A3: vnstock lazy sync (background — respects rate limits + staleness cache)
  // Runs for all watchlist stocks, skips if data is still fresh.
  // vnstockSyncFn is injectable for test isolation (prevents real HTTP calls in CI).
  try {
    await withTimeout((async () => {
      if (deps.vnstockSyncFn) {
        // Injected in tests to skip real vnstock HTTP calls
        const { getDb: getDatabase } = await import("../../infrastructure/db/schema.js");
        const watchlistRows = getDatabase()
          .prepare("SELECT code FROM watchlist")
          .all() as Array<{ code: string }>;
        const codes = watchlistRows.map((r: { code: string }) => r.code);
        await deps.vnstockSyncFn(codes);
      } else {
        const { syncVnstockData } = await import("../../application/usecases/syncVnstockData.js");
        const { getDb: getDatabase } = await import("../../infrastructure/db/schema.js");
        const watchlistRows = getDatabase()
          .prepare("SELECT code FROM watchlist")
          .all() as Array<{ code: string }>;
        const codes = watchlistRows.map((r: { code: string }) => r.code);
        if (codes.length > 0) {
          await syncVnstockData(codes);
        }
      }
    })(), "step A3 vnstockSync");
  } catch { /* non-fatal — vnstock is best-effort */ }

  // Step A4: Auto-compute Kinh Dich hexagram reading per watchlist stock (Task 303).
  // Gated on market hours (09:00–15:30 GMT+7, Mon–Fri) — Task 1501.
  // Off-hours readings are meaningless (no price action) and waste CPU.
  if (!marketHours) {
    logger.debug("[intelligence-cycle] step A4 skipped — outside market hours");
  } else {
    try {
      const getWatchlistCodesFn = deps.getWatchlistCodesFn ?? defaultGetWatchlistCodes;
      const codesToProcess =
        watchlistCodes.length > 0 ? watchlistCodes : await getWatchlistCodesFn();

      if (codesToProcess.length === 0) {
        logger.debug("[intelligence-cycle] step A4 — watchlist empty, skipping hexagram batch");
      } else {
        const computeHexagramsFn =
          deps.computeHexagramsFn ?? defaultComputeHexagrams;
        hexagramsComputed = await withTimeout(
          computeHexagramsFn(codesToProcess),
          "step A4 hexagramBatch",
          STEP_TIMEOUT_MS,
        );
        logger.debug("[intelligence-cycle] step A4 complete — hexagrams computed", {
          hexagramsComputed,
          codes: codesToProcess,
        });
      }
    } catch (err) {
      errors++;
      hexagramsComputed = 0;
      logger.warn("[intelligence-cycle] step A4 failed — hexagram batch error", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (marketHours) {
    // Step B: List SSC documents — skip if already scanned today (task 153)
    // SSC docs don't change intraday, so scan once per day max.
    const today = new Date().toISOString().slice(0, 10);
    const shouldScanSsc = _lastSscScanDate !== today;

    if (shouldScanSsc) {
    try {
      const sscPromises = watchlistCodes.map(async (code) => {
        try {
          const docs = await withTimeout(listSscDocsFn(code), `step B SSC ${code}`, STEP_B_SSC_TIMEOUT_MS);
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
      _lastSscScanDate = today;
      logger.debug("[intelligence-cycle] step B complete — SSC docs listed", {
        sscDocsFound,
      });
    } catch (err) {
      errors++;
      logger.error("[intelligence-cycle] step B failed — SSC list error", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    } else {
      logger.debug("[intelligence-cycle] step B skipped — already scanned today");
    }

    // Step C: Fetch HOSE prices for watchlist
    try {
      const fetchPricesFn = deps.fetchPricesFn ?? (() => defaultFetchPrices(watchlistCodes));
      pricesFetched = await withTimeout(fetchPricesFn(), "step C fetchPrices");
      logger.debug("[intelligence-cycle] step C complete — prices fetched", {
        pricesFetched,
      });
    } catch (err) {
      errors++;
      logger.error("[intelligence-cycle] step C failed — fetchPrices error", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Step C2 (task 701): Sync sector peer financials so get_sector_comparison
    // can show real PE/PB/ROE for benchmark stocks instead of N/A. Best-effort
    // — failure here never aborts the cycle. Reads watchlist domains, picks
    // up to 5 peers per domain via syncSectorPeers, calls syncStockLight for
    // each (trading_stats + financials + balance_sheet, relaxed staleness).
    try {
      const syncFn = deps.syncSectorPeersFn ?? (async (entries) => {
        const { syncSectorPeers } = await import("../../application/usecases/syncSectorPeers.js");
        // syncSectorPeers expects DomainType — we pass watchlist domain strings as-is
        return syncSectorPeers(entries as { actionCode: string; domain: import("../../../bctc-schema.js").DomainType }[]);
      });

      const { getDb: getCycleDb } = await import("../../infrastructure/db/schema.js");
      const cycleDb = getCycleDb();
      const watchlistRows = cycleDb
        .prepare("SELECT code, domain FROM watchlist")
        .all() as Array<{ code: string; domain: string }>;
      // If DB returns rows, use them (includes domain). Otherwise fall back to
      // the already-loaded watchlistCodes (step 0) so injected getWatchlistCodesFn
      // in tests is honoured and syncSectorPeersFn gets called.
      const entries: Array<{ actionCode: string; domain: string }> =
        watchlistRows.length > 0
          ? watchlistRows.map((r) => ({ actionCode: r.code, domain: r.domain }))
          : watchlistCodes.map((c) => ({ actionCode: c, domain: "" }));

      if (entries.length > 0) {
        const result = await withTimeout(syncFn(entries), "step C2 syncPeers", SYNC_PEERS_TIMEOUT_MS);
        logger.debug("[intelligence-cycle] step C2 complete — sector peer sync", result);
      }
    } catch (err) {
      // Non-fatal — peer sync is best-effort, but count errors for visibility
      errors++;
      logger.warn("[intelligence-cycle] step C2 sector peer sync failed (non-fatal)", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Step D: Run impact chain on new news entries
    try {
      impactEventsRan = await withTimeout(runImpactChainFn(), "step D impactChain");
      logger.debug("[intelligence-cycle] step D complete — impact chain ran", {
        impactEventsRan,
      });
    } catch (err) {
      errors++;
      logger.error("[intelligence-cycle] step D failed — runImpactChain error", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Step E (market hours): kept as placeholder — moved outside this block (Task 1255)
    // See step E below, now unconditional.
  }

  // Step E: Send HIGH/CRITICAL alerts to Telegram — unconditional (Task 1255)
  // Previously gated by `if (marketHours)` which caused off-hours sigma alerts
  // (USD/VND, gold, macro) generated by step A2.5 (runs 24/7) to never fire.
  // Fix: run step E every cycle regardless of market hours.
  try {
      const readUnnotifiedAlertsFn =
        deps.readUnnotifiedAlertsFn ?? ((windowMs) => defaultReadUnnotifiedAlerts(windowMs));
      const markAlertNotifiedFn =
        deps.markAlertNotifiedFn ?? ((id) => defaultMarkAlertNotified(id));

      // Read unnotified HIGH/CRITICAL alerts from DB within the 16-minute window.
      // This window matches the 15-minute cron cadence with 1-minute overlap for drift.
      const unnotifiedAlerts = await withTimeout(readUnnotifiedAlertsFn(ALERT_WINDOW_MS), "step E readAlerts");

      // Apply cooldown: suppress same stock+signal combo within the configured window.
      // Prevents VEA getting 6 alerts in 2 hours for unrelated articles.
      // cooldownMinutes is read from mcp.config.json `alertQuality.cooldownMinutes` (Task 1281).
      // Task 1276: MACRO alerts use macroCooldownMinutes (default 360 = 6h) — USD/VND and
      // commodity deviations are persistent conditions that must not fire every 15-min cycle.
      const { shouldSuppressAlert } = await import("../../domain/services/alertCooldown.js");
      const baseCooldownConfig = deps.cooldownConfig ?? {
        cooldownMinutes: mcpConfig.alertQuality.cooldownMinutes,
        maxAlertsPerStockPerDay: mcpConfig.alertQuality.maxAlertsPerStockPerDay,
      };
      const macroCooldownMinutes = mcpConfig.alertQuality.macroCooldownMinutes;
      const macroCooldownConfig = deps.cooldownConfig ?? {
        cooldownMinutes: macroCooldownMinutes,
        maxAlertsPerStockPerDay: mcpConfig.alertQuality.maxAlertsPerStockPerDay,
      };

      // Task 1276: history query window must cover the macro cooldown window (6h + 1h buffer).
      // Previous 2h window was shorter than the 6h cooldown — MACRO alerts always appeared
      // "no recent history" and fired every 15-min cycle regardless of the cooldown config.
      const historyWindowHours = Math.ceil(macroCooldownMinutes / 60) + 1;
      let recentAlertHistory: Array<{ stocks: string; signalTypes: string; triggeredAt: string }> = [];
      if (deps.getRecentAlertHistoryFn) {
        try { recentAlertHistory = await deps.getRecentAlertHistoryFn(); } catch { /* best-effort */ }
      } else {
        const { getDb: getCooldownDb } = await import("../../infrastructure/db/schema.js");
        try {
          const db = getCooldownDb();
          const rows = db.prepare(
            `SELECT affected_actions_json, signals_json, triggered_at
             FROM alerts WHERE triggered_at > datetime('now', ? || ' hours')`
          ).all(`-${historyWindowHours}`) as Array<{ affected_actions_json: string; signals_json: string; triggered_at: string }>;
          recentAlertHistory = rows.map((r) => ({
            stocks: r.affected_actions_json ? JSON.parse(r.affected_actions_json)?.[0]?.code ?? "" : "",
            signalTypes: r.signals_json ? JSON.parse(r.signals_json).map((s: { type: string }) => s.type).join(",") : "",
            triggeredAt: r.triggered_at,
          }));
        } catch { /* best-effort */ }
      }

      // ── Step E pre-pass (Task 1345d): market-wide cascade summary ──────────
      // Before routing each alert individually to the BUG channel, check whether
      // this batch contains a market-wide cascade event. If >= 2 distinct stocks
      // each have a signal message containing "market-wide cascade", compose a
      // Vietnamese summary and send it once to the MARKET channel.
      //
      // This is ADDITIVE — the per-stock loop below is unchanged.
      // sendMarketFn is injected in tests; defaults to real sendTelegramMarket.
      try {
        /** All alerts that carry at least one market-wide cascade signal. */
        const cascadeAlerts = unnotifiedAlerts.filter((a) =>
          a.signals.some((s) => s.message?.includes("market-wide cascade")),
        );
        /** De-duplicated list of affected stock codes. */
        const distinctCodes = [...new Set(cascadeAlerts.map((a) => a.actionCode))];

        if (distinctCodes.length >= 2) {
          // Severity: critical if any cascade alert is critical, else high.
          const hasCritical = cascadeAlerts.some((a) => a.severity === "critical");
          const summaryLevel = hasCritical ? "CRITICAL" : "HIGH";

          const summaryMsg =
            `[VN-Index] Tác động toàn thị trường — ${summaryLevel}\n` +
            `Cổ phiếu bị ảnh hưởng: ${distinctCodes.join(", ")}\n` +
            `Nguồn: market-wide cascade event`;

          /** Resolve the market send function (injected in tests, real in prod). */
          const resolvedSendMarket: (text: string, opts?: Record<string, unknown>) => Promise<boolean> =
            deps.sendMarketFn ??
            (async (text, opts) => {
              const { sendTelegramMarket } = await import(
                "../../infrastructure/notifiers/telegram.js"
              );
              return sendTelegramMarket(text, opts ?? {});
            });

          await resolvedSendMarket(summaryMsg, {
            persist: {
              from_agent: "intelligence-cycle",
              message_type: "market_wide_cascade",
            },
          });

          logger.info("[intelligence-cycle] step E pre-pass — market-wide cascade summary sent", {
            distinctCodes,
            summaryLevel,
            cascadeCount: cascadeAlerts.length,
          });
        }
      } catch (cascadeErr) {
        // Non-fatal: market summary failure must not abort the per-stock loop.
        logger.warn("[intelligence-cycle] step E pre-pass — market summary send failed (non-fatal)", {
          error: cascadeErr instanceof Error ? cascadeErr.message : String(cascadeErr),
        });
      }
      // ────────────────────────────────────────────────────────────────────────

      // Send each alert individually with cooldown check.
      // The history snapshot is mutated after each send so back-to-back
      // alerts in the same cycle can see siblings that were just sent —
      // prevents the "10 volume_spike alerts in 5 min for FPT/VCB/VNM" burst.
      for (const alert of unnotifiedAlerts) {
        // Check cooldown — MACRO alerts bypass shouldSuppressAlert entirely:
        // step A2.5 INSERT OR IGNORE already guarantees at most one alert per
        // indicator per day, so cooldown would only prevent the first (and only)
        // send attempt. Task 1383: macro CRITICAL alerts stuck notified_telegram=0.
        const isMacroAlert = alert.actionCode === "MACRO";
        const effectiveCooldownConfig = isMacroAlert ? macroCooldownConfig : baseCooldownConfig;
        const suppress = isMacroAlert ? false : shouldSuppressAlert(
          { stocks: [alert.actionCode], signalTypes: alert.signals.map((s) => s.type), severity: alert.severity, actionCode: alert.actionCode },
          recentAlertHistory,
          effectiveCooldownConfig,
        );
        if (suppress) {
          // Mark as notified without sending — suppressed by cooldown
          try { await markAlertNotifiedFn(alert.id); } catch { /* ok */ }
          logger.debug("[intelligence-cycle] step E — alert suppressed by cooldown", {
            alertId: alert.id,
            stock: alert.actionCode,
            severity: alert.severity,
            signals: alert.signals.map((s) => s.type),
          });
          continue;
        }

        const sent = await sendAlertsFn([alert]);
        logger.debug("[intelligence-cycle] step E — alert sent to Telegram", {
          alertId: alert.id,
          stock: alert.actionCode,
          severity: alert.severity,
          signals: alert.signals.map((s) => s.type),
          sent,
        });

        if (sent > 0) {
          telegramAlertsSent += sent;
          try {
            await markAlertNotifiedFn(alert.id);
          } catch (markErr) {
            logger.warn("[intelligence-cycle] step E — failed to mark alert notified", {
              alertId: alert.id,
              error: markErr instanceof Error ? markErr.message : String(markErr),
            });
          }
        }
        // Always append into the in-memory cooldown snapshot regardless of
        // whether the Telegram send succeeded (sent > 0) or failed (sent === 0).
        // This prevents same-cycle sibling alerts from firing when Telegram is down.
        recentAlertHistory.push({
          stocks: alert.actionCode,
          signalTypes: alert.signals.map((s) => s.type).join(","),
          triggeredAt: new Date().toISOString(),
        });
      }

      logger.debug("[intelligence-cycle] step E complete — alerts sent", {
        telegramAlertsSent,
        unnotifiedCount: unnotifiedAlerts.length,
      });
    } catch (err) {
      errors++;
      logger.error("[intelligence-cycle] step E failed — sendAlerts error", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

  // Step F removed (task 1063) — /ask and /why commands deleted.

  // Step G: Chain synthesis (server-side, zero Claude API tokens)
  // Groups agent_signals by stock within the current 15-min cycle window.
  // When 2+ agents have posted findings for the same stock, the chain synthesizer
  // produces a SynthesizedChain. High-conviction chains (>= 0.7) are posted back
  // as verified_chain signals for the Alert Commander.
  // Task 1920g: insertClaimFn from CycleDeps is forwarded for test isolation.
  try {
    const chainDeps: ChainSynthesisDeps = {};
    if (deps.insertClaimFn) chainDeps.insertClaimFn = deps.insertClaimFn;
    await withTimeout(runChainSynthesis(chainDeps), "step G chainSynthesis");
  } catch (err) {
    // Non-fatal — chain synthesis failure should not block the cycle
    logger.warn("[intelligence-cycle] step G failed (non-fatal) — chainSynthesis", {
      error: err instanceof Error ? err.message : String(err),
    });
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
    hexagramsComputed,
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
    const elapsed = Date.now() - cycleStartedAt;
    if (elapsed < CYCLE_MAX_RUNTIME_MS) {
      logger.warn("[intelligence-cycle] previous cycle still running — skipped", {
        elapsedMs: elapsed,
      });
      return null;
    }
    // Guard is stale — a previous cycle hung. Force-release and continue.
    logger.error("[intelligence-cycle] previous cycle appears hung — force-releasing guard", {
      elapsedMs: elapsed,
      maxRuntimeMs: CYCLE_MAX_RUNTIME_MS,
    });
    cycleRunning = false;
  }

  // Off-hours throttle: skip if last off-hours run was < 60 min ago
  if (!isMarketHours() && !deps?.isMarketHoursFn) {
    const elapsed = Date.now() - _lastOffHoursRunAt;
    const offHoursIntervalMs = 60 * 60 * 1000; // 60 minutes
    if (_lastOffHoursRunAt > 0 && elapsed < offHoursIntervalMs) {
      logger.debug("[intelligence-cycle] off-hours throttle — skipping", {
        elapsedMin: Math.round(elapsed / 60_000),
        nextInMin: Math.round((offHoursIntervalMs - elapsed) / 60_000),
      });
      return null;
    }
  }

  cycleRunning = true;
  cycleStartedAt = Date.now();

  try {
    const result = await _runCycle(deps);
    // Track off-hours runs for throttling
    if (result && !result.isMarketHours) {
      _lastOffHoursRunAt = Date.now();
    }
    return result;
  } finally {
    cycleRunning = false;
    cycleStartedAt = 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Step G: Chain Synthesis helpers (Task 1920g)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Task 1920g — FR-3: Map SynthesizedChain.action to ClaimDirection.
 *
 * Pure function — no I/O, safe to call in tests without mocking.
 *
 * @param action - Chain action from synthesizeChain() output
 * @returns "bullish" | "bearish" | "neutral"
 */
export function mapChainAction(action: string): "bullish" | "bearish" | "neutral" {
  if (action === "BUY") return "bullish";
  if (action === "SELL") return "bearish";
  return "neutral"; // MONITOR, HOLD, WATCH, or any unknown value
}

/**
 * Task 1920g — FR-4: Return ISO date string n days from now (UTC).
 *
 * Pure function — no I/O. Result format: YYYY-MM-DD.
 *
 * @param n - Number of days to add (e.g. 7)
 * @returns ISO 8601 date string, e.g. "2026-05-23"
 */
export function isoDatePlusDays(n: number): string {
  return new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// Step G: Chain Synthesis (enrichment chain extension)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Injectable deps for runChainSynthesis (Task 1920g test isolation).
 *
 * @property insertClaimFn - Override for the prediction claim insert (test isolation)
 * @property _db           - Override DB connection (test isolation — uses in-memory DB)
 */
export interface ChainSynthesisDeps {
  insertClaimFn?: (params: import("../../infrastructure/db/predictionClaimStore.js").PredictionClaimInput) => number;
  /** @internal Test only: inject an in-memory DB to avoid real schema.getDb() */
  _db?: import("bun:sqlite").Database;
}

/**
 * Server-side chain synthesis.
 *
 * Groups all agent_signals in the current 15-min cycle window by stock_code.
 * For any stock with 2+ independent agent findings, runs synthesizeChain().
 * High-conviction chains (>= 0.7) are posted as verified_chain signals for
 * the Alert Commander.
 *
 * Task 1920g: After postSignal, for conviction >= 0.7 chains, calls
 * insertClaimFn (or the real insertPredictionClaim) to auto-populate
 * prediction_claims. Claim write failure is non-fatal (try/catch + console.warn).
 *
 * This runs with zero Claude API tokens — purely rule-based domain logic.
 *
 * @param deps - Optional injectable sub-functions for test isolation
 */
export async function runChainSynthesis(deps: ChainSynthesisDeps = {}): Promise<void> {
  const { getDb } = await import("../../infrastructure/db/schema.js");
  const {
    getChainFindings,
    postSignal,
    computeCycleId,
  } = await import("../../infrastructure/db/agentSignalStore.js");
  const { synthesizeChain } = await import("../../domain/services/chainSynthesizer.js");

  const db = deps._db ?? getDb();
  const cycleId = computeCycleId();

  const findings = getChainFindings(db, cycleId);
  if (findings.length === 0) return;

  // Group by stock_code (skip null)
  const byStock = new Map<string, typeof findings>();
  for (const f of findings) {
    if (!f.stockCode) continue;
    const arr = byStock.get(f.stockCode) ?? [];
    arr.push(f);
    byStock.set(f.stockCode, arr);
  }

  let synthesized = 0;

  for (const [stock, links] of byStock) {
    if (links.length < 2) continue;

    const chain = synthesizeChain(
      links.map(f => ({
        id: f.id,
        agent: f.fromAgent,
        signalType: f.signalType,
        stockCode: f.stockCode,
        findingData: f.findingData,
        depth: f.chainDepth,
        createdAt: f.createdAt,
      })),
    );

    if (!chain) continue;

    if (chain.conviction >= 0.7) {
      postSignal(db, {
        fromAgent: "chain-synthesizer",
        toAgent: "alert-commander",
        signalType: "verified_chain",
        stockCode: stock,
        payload: {
          title: chain.narrative.slice(0, 100),
          detail: chain.narrative,
        },
        findingData: chain as unknown as Record<string, unknown>,
        cycleId,
        chainDepth: 3,
        ttlMinutes: 60,
      });
      synthesized++;

      logger.info("[chainSynthesis] verified_chain posted", {
        stock,
        conviction: chain.conviction,
        action: chain.action,
        chainLength: chain.chainLength,
        agents: chain.agents,
      });

      // Task 1920g — FR-2: Auto-populate prediction_claims for high-conviction chains.
      // Claim write failure is non-fatal (try/catch + console.warn). Must not throw
      // or increment cycle errors counter (AC-6).
      try {
        const claimParams: import("../../infrastructure/db/predictionClaimStore.js").PredictionClaimInput = {
          stock,
          agent_id: "chain-synthesizer",
          claim_text: chain.narrative.slice(0, 255),
          direction: mapChainAction(chain.action),
          target_price: null,
          creation_price: null,
          resolution_date: isoDatePlusDays(7),
          confidence: chain.conviction,
        };

        if (deps.insertClaimFn) {
          deps.insertClaimFn(claimParams);
        } else {
          const { insertPredictionClaim } = await import(
            "../../infrastructure/db/predictionClaimStore.js"
          );
          insertPredictionClaim(db, claimParams);
        }

        logger.debug("[chainSynthesis] prediction_claim inserted", {
          stock,
          conviction: chain.conviction,
          direction: claimParams.direction,
          resolution_date: claimParams.resolution_date,
        });
      } catch (claimErr) {
        console.warn(
          `[chainSynthesis] prediction_claim insert failed for ${stock} (non-fatal):`,
          claimErr instanceof Error ? claimErr.message : String(claimErr),
        );
      }
    }
  }

  if (synthesized > 0) {
    logger.info("[chainSynthesis] cycle complete", {
      cycleId,
      totalFindings: findings.length,
      stocksWithChains: byStock.size,
      synthesized,
    });
  }
}
