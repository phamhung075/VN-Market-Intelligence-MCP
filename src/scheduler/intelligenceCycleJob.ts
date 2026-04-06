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
  const year = new Date().getFullYear();
  return listSscDocuments(code, "quarterly", year);
}

async function defaultFetchPrices(codes: string[]): Promise<number> {
  if (codes.length === 0) return 0;

  // Classify stocks by exchange from watchlist domain
  const { getDb } = await import("../infrastructure/db/schema.js");
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
    const { fetchHosePrices } = await import("../infrastructure/fetchers/hose.js");
    const prices = await fetchHosePrices(hoseCodes);
    if (prices.length > 0) {
      const { storeMarketPrices } = await import("../infrastructure/fetchers/hose.js");
      await storeMarketPrices(prices);
    }
    total += prices.length;
  }

  // Fetch UPCOM stocks (VnDirect stock_prices fallback)
  if (upcomCodes.length > 0) {
    const { fetchUpcomPrices } = await import("../infrastructure/fetchers/hnx.js");
    const { storeMarketPrices } = await import("../infrastructure/fetchers/hose.js");
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

/** 16 minutes in milliseconds — Step E look-back window (15-min cycle + 1-min overlap) */
const ALERT_WINDOW_MS = 16 * 60 * 1000;

async function defaultReadUnnotifiedAlerts(windowMs: number): Promise<Alert[]> {
  const { readUnnotifiedAlerts } = await import("../infrastructure/db/alertStore.js");
  const windowMinutes = windowMs / 60_000;
  return readUnnotifiedAlerts(windowMinutes);
}

async function defaultMarkAlertNotified(alertId: string): Promise<void> {
  const { markAlertNotified } = await import("../infrastructure/db/alertStore.js");
  markAlertNotified(alertId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-step timeout helper
// ─────────────────────────────────────────────────────────────────────────────

/** 2 minutes — max allowed runtime for any single cycle step. */
const STEP_TIMEOUT_MS = 2 * 60 * 1000;

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
    const pollResult = await withTimeout(pollNewsFn(), "step A pollNews");
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

  // Step A2: Fetch macro data (always — builds σ history 24/7)
  try {
    await withTimeout((async () => {
      try {
        const { fetchYahooFinancePrices, storeCommoditySnapshot } = await import("../infrastructure/fetchers/yahooFinance.js");
        const commodity = await fetchYahooFinancePrices();
        if (commodity) await storeCommoditySnapshot(commodity);
      } catch { /* best-effort */ }
      try {
        const { fetchSbvRates, storeSbvSnapshot } = await import("../infrastructure/fetchers/sbv.js");
        const sbv = await fetchSbvRates();
        if (sbv) await storeSbvSnapshot(sbv);
      } catch { /* best-effort */ }
    })(), "step A2 macroFetch");
  } catch { /* non-fatal */ }

  // Step A3: vnstock lazy sync (background — respects rate limits + staleness cache)
  // Runs for all watchlist stocks, skips if data is still fresh.
  try {
    await withTimeout((async () => {
      const { syncVnstockData } = await import("../application/usecases/syncVnstockData.js");
      const { getDb: getDatabase } = await import("../infrastructure/db/schema.js");
      const watchlistRows = getDatabase()
        .prepare("SELECT code FROM watchlist")
        .all() as Array<{ code: string }>;
      const codes = watchlistRows.map((r: { code: string }) => r.code);
      if (codes.length > 0) {
        await syncVnstockData(codes);
      }
    })(), "step A3 vnstockSync");
  } catch { /* non-fatal — vnstock is best-effort */ }

  if (marketHours) {
    // Step B: List SSC documents — skip if already scanned today (task 153)
    // SSC docs don't change intraday, so scan once per day max.
    const today = new Date().toISOString().slice(0, 10);
    const shouldScanSsc = _lastSscScanDate !== today;

    if (shouldScanSsc) {
    try {
      const sscPromises = watchlistCodes.map(async (code) => {
        try {
          const docs = await withTimeout(listSscDocsFn(code), `step B SSC ${code}`);
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
        const { syncSectorPeers } = await import("../application/usecases/syncSectorPeers.js");
        // syncSectorPeers expects DomainType — we pass watchlist domain strings as-is
        return syncSectorPeers(entries as { actionCode: string; domain: import("../../bctc-schema.js").DomainType }[]);
      });

      const { getDb: getCycleDb } = await import("../infrastructure/db/schema.js");
      const cycleDb = getCycleDb();
      const watchlistRows = cycleDb
        .prepare("SELECT code, domain FROM watchlist")
        .all() as Array<{ code: string; domain: string }>;
      const entries = watchlistRows.map((r) => ({
        actionCode: r.code,
        domain: r.domain,
      }));

      if (entries.length > 0) {
        const result = await withTimeout(syncFn(entries), "step C2 syncPeers");
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

    // Step E: Send HIGH/CRITICAL alerts to Telegram
    try {
      const readUnnotifiedAlertsFn =
        deps.readUnnotifiedAlertsFn ?? ((windowMs) => defaultReadUnnotifiedAlerts(windowMs));
      const markAlertNotifiedFn =
        deps.markAlertNotifiedFn ?? ((id) => defaultMarkAlertNotified(id));

      // Read unnotified HIGH/CRITICAL alerts from DB within the 16-minute window.
      // This window matches the 15-minute cron cadence with 1-minute overlap for drift.
      const unnotifiedAlerts = await withTimeout(readUnnotifiedAlertsFn(ALERT_WINDOW_MS), "step E readAlerts");

      // Apply cooldown: suppress same stock+signal combo within 60 min
      // Prevents VEA getting 6 alerts in 2 hours for unrelated articles
      const { shouldSuppressAlert } = await import("../domain/services/alertCooldown.js");
      const { getDb: getCooldownDb } = await import("../infrastructure/db/schema.js");
      let recentAlertHistory: Array<{ stocks: string; signalTypes: string; triggeredAt: string }> = [];
      try {
        const db = getCooldownDb();
        const rows = db.prepare(
          `SELECT affected_actions_json, signals_json, triggered_at
           FROM alerts WHERE notified_telegram = 1 AND triggered_at > datetime('now', '-2 hours')`
        ).all() as Array<{ affected_actions_json: string; signals_json: string; triggered_at: string }>;
        recentAlertHistory = rows.map((r) => ({
          stocks: r.affected_actions_json ? JSON.parse(r.affected_actions_json)?.[0]?.code ?? "" : "",
          signalTypes: r.signals_json ? JSON.parse(r.signals_json).map((s: { type: string }) => s.type).join(",") : "",
          triggeredAt: r.triggered_at,
        }));
      } catch { /* best-effort */ }

      // Send each alert individually with cooldown check.
      // The history snapshot is mutated after each send so back-to-back
      // alerts in the same cycle can see siblings that were just sent —
      // prevents the "10 volume_spike alerts in 5 min for FPT/VCB/VNM" burst.
      for (const alert of unnotifiedAlerts) {
        // Check cooldown — same stock + same signal type within 60 min → skip
        const suppress = shouldSuppressAlert(
          { stocks: [alert.actionCode], signalTypes: alert.signals.map((s) => s.type), severity: alert.severity },
          recentAlertHistory,
          { cooldownMinutes: 60, maxAlertsPerStockPerDay: 3 },
        );
        if (suppress) {
          // Mark as notified without sending — suppressed by cooldown
          try { await markAlertNotifiedFn(alert.id); } catch { /* ok */ }
          logger.debug("[intelligence-cycle] step E — alert suppressed by cooldown", {
            alertId: alert.id, stock: alert.actionCode,
          });
          continue;
        }

        const sent = await sendAlertsFn([alert]);
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
          // Prepend the just-sent alert into the in-memory cooldown snapshot
          // so subsequent alerts in this same loop iteration see it.
          recentAlertHistory.push({
            stocks: alert.actionCode,
            signalTypes: alert.signals.map((s) => s.type).join(","),
            triggeredAt: new Date().toISOString(),
          });
        }
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
  }

  // Step F: Answer pending user requests (always — not gated on market hours)
  // Processes up to 3 pending /ask or /why requests per cycle via RAG search.
  try {
    const { getPendingRequests, markAnswered } = await import("../infrastructure/db/userRequestStore.js");
    const { getDb: getRequestDb } = await import("../infrastructure/db/schema.js");
    const requestDb = getRequestDb();
    const pending = getPendingRequests(requestDb, 3);

    if (pending.length > 0) {
      logger.debug("[intelligence-cycle] step F — processing user requests", {
        count: pending.length,
      });

      for (const req of pending) {
        try {
          // Use RAG retrieval to find relevant analysis entries
          const { searchContext } = await import("../infrastructure/rag/retriever.js");
          const results = await searchContext(req.payload, { k: 5 });

          // Build a concise answer from RAG results
          const answer = results.length > 0
            ? results
                .map(
                  (r, i) =>
                    `${i + 1}. [${r.level}] ${r.title} — ${r.summary.slice(0, 100)}`,
                )
                .join("\n")
            : "Khong tim thay du lieu lien quan. Thu lai voi cau hoi cu the hon.";

          const response = `Tra loi cho: "${req.payload}"\n\n${answer}`;

          // Send to Chat Channel
          const { sendTelegramMessage } = await import("../infrastructure/notifiers/telegram.js");
          await sendTelegramMessage(response);

          markAnswered(requestDb, req.id, response);

          logger.debug("[intelligence-cycle] step F — answered request", {
            requestId: req.id,
            ragResults: results.length,
          });
        } catch (reqErr) {
          const errMsg = reqErr instanceof Error ? reqErr.message : String(reqErr);
          try {
            const { markAnswered: markFailed } = await import("../infrastructure/db/userRequestStore.js");
            const { getDb: getErrDb } = await import("../infrastructure/db/schema.js");
            markFailed(getErrDb(), req.id, `Loi: ${errMsg}`);
          } catch { /* best-effort */ }
          logger.warn("[intelligence-cycle] step F — failed to answer request", {
            requestId: req.id,
            error: errMsg,
          });
        }
      }
    }
  } catch (err) {
    // Step F is best-effort — log but do not increment errors counter
    logger.warn("[intelligence-cycle] step F — user request processing error", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Step G: Chain synthesis (server-side, zero Claude API tokens)
  // Groups agent_signals by stock within the current 15-min cycle window.
  // When 2+ agents have posted findings for the same stock, the chain synthesizer
  // produces a SynthesizedChain. High-conviction chains (>= 0.7) are posted back
  // as verified_chain signals for the Alert Commander.
  try {
    await withTimeout(runChainSynthesis(), "step G chainSynthesis");
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
// Step G: Chain Synthesis (enrichment chain extension)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Server-side chain synthesis.
 *
 * Groups all agent_signals in the current 15-min cycle window by stock_code.
 * For any stock with 2+ independent agent findings, runs synthesizeChain().
 * High-conviction chains (>= 0.7) are posted as verified_chain signals for
 * the Alert Commander.
 *
 * This runs with zero Claude API tokens — purely rule-based domain logic.
 */
export async function runChainSynthesis(): Promise<void> {
  const { getDb } = await import("../infrastructure/db/schema.js");
  const {
    getChainFindings,
    postSignal,
    computeCycleId,
  } = await import("../infrastructure/db/agentSignalStore.js");
  const { synthesizeChain } = await import("../domain/services/chainSynthesizer.js");

  const db = getDb();
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
