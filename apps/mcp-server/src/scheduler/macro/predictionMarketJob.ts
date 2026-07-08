/**
 * Prediction Market Poll Job — Task 167 (Interface / Scheduler Layer)
 *
 * Thin cron wrapper that:
 *   1. Reads config (predictionMarkets.enabled)
 *   2. Calls fetchPolymarkets() to get the current snapshot
 *   3. Loads the previous snapshot from SQLite prediction_markets table
 *   4. Calls detectPredictionSignals() to generate PredictionSignal[]
 *   5. Stores signals in prediction_signals table
 *   6. Converts PredictionSignal[] → Signal[] and generates Alert[] via generateAlerts()
 *   7. Stores alerts via storeAlerts()
 *   8. Sends HIGH/CRITICAL alerts to Telegram
 *   9. Logs a summary
 *
 * Registered in `jobs.ts` at CRONS.predictionMarketPoll (default: every 30 min).
 *
 * A concurrency guard prevents a second invocation from starting while the
 * previous poll cycle is still running.
 *
 * Layer: interface/scheduler — may import from infrastructure and domain.
 * Dependency injection: all I/O dependencies can be overridden for testing.
 */

import { logger } from "../../infrastructure/logger.js";
import { getDb, initDatabase } from "../../infrastructure/db/schema.js";
import { sqlInClause } from "../../infrastructure/db/sqlHelpers.js";
import type { Database } from "bun:sqlite";
import type {
  PredictionMarket,
  PredictionSignal,
  PredictionSignalConfig,
  RecentSentimentEntry,
} from "../../domain/services/predictionSignalDetector.js";

// ─────────────────────────────────────────────────────────────────────────────
// Public options type for dependency injection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Options bag for `runPredictionMarketPoll`.
 * All fields are optional in tests (sensible defaults apply).
 */
export interface PredictionMarketPollOptions {
  /** When false, the job returns immediately without fetching. Default: reads from loadMcpConfig(). */
  enabled?: boolean;
  /** Override for fetchPolymarkets (injectable for tests). */
  fetchFn?: () => Promise<PredictionMarket[]>;
  /** Inject a test SQLite database (avoids using the real getDb() singleton). */
  db?: Database;
  /**
   * Previous markets snapshot (injectable for tests).
   * When provided, skips the DB lookup for previous rows.
   */
  previousMarkets?: PredictionMarket[];
  /** Signal detection thresholds override (tests). */
  signalConfig?: PredictionSignalConfig;
  /** Telegram send override (injectable for tests — suppresses real sends). */
  telegramFn?: (msg: string) => Promise<void>;
  /**
   * Override staleness threshold in hours (injectable for tests).
   * Set to 0 to force stale state immediately without waiting.
   * Default: reads from loadMcpConfig().predictionMarkets.staleThresholdHours (24).
   */
  staleThresholdHours?: number;
  /**
   * Test-only spy injected in place of detectPredictionSignals.
   * Allows tests to verify whether signal detection was called or skipped.
   */
  _signalDetectorSpy?: (
    current: PredictionMarket[],
    previous: PredictionMarket[],
    config: PredictionSignalConfig,
    hasRecentNews: Set<string>,
    recentSentiments: RecentSentimentEntry[],
  ) => PredictionSignal[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Concurrency guard
// ─────────────────────────────────────────────────────────────────────────────

let _isRunning = false;

// ─────────────────────────────────────────────────────────────────────────────
// Staleness alert cooldown (24h dedup — follows vpsProxyWatchdogJob.ts pattern)
// ─────────────────────────────────────────────────────────────────────────────

/** Unix ms timestamp of the last staleness Telegram bug alert sent. 0 = never. */
let _lastStalenessAlertAt = 0;

/** 24-hour cooldown between repeated staleness alerts (ms). */
const STALENESS_ALERT_COOLDOWN_MS = 24 * 3600 * 1000;

/**
 * Test-only: reset the in-module staleness alert cooldown timer.
 * Calling this between test cases ensures cooldown state does not leak.
 */
export function _resetStalenessAlertCooldown(): void {
  _lastStalenessAlertAt = 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Signal-detection default thresholds (FACTORY-SCHEDULER-prediction-default-dedup)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default prediction-market signal-detection thresholds.
 *
 * Provenance: these are the as-shipped Task 167 values — no later incident or
 * tuning session has changed them. Before this dedup they were hardcoded
 * twice in Step 6 below (once in the config-load-succeeded branch as a
 * per-field `?? literal` fallback, once again in the config-load-failed catch
 * branch), which meant the two paths could silently drift apart over time.
 * They also mirror (by design, kept in manual sync) the same three defaults
 * independently declared in the wider MCP config loader
 * (`infrastructure/config.ts` `PredictionMarketsConfig.volumeSpikeThresholdUsd`
 * / `.probabilityShiftPct` / `.minUniqueWallets`, already required —
 * non-optional — fields there); this module keeps its own copy because it
 * only needs the narrow 3-field `PredictionSignalConfig` subset the domain
 * detector consumes, resolved defensively via dynamic `import()` rather than
 * a static import of the config module's type.
 */
export const DEFAULT_PREDICTION_SIGNAL_CONFIG: PredictionSignalConfig = {
  volumeSpikeThresholdUsd: 50000,
  probabilityShiftPct: 5,
  minUniqueWallets: 10,
};

/**
 * Resolve the effective `PredictionSignalConfig` from a (possibly partial,
 * `null`, or absent) `predictionMarkets` config slice, falling back to
 * `DEFAULT_PREDICTION_SIGNAL_CONFIG` field-by-field for anything missing.
 *
 * Shared by BOTH the config-load-succeeded and config-load-failed branches in
 * `runPredictionMarketPoll` Step 6, so the two paths resolve through the same
 * single source of truth and can never silently diverge again.
 */
export function resolvePredictionSignalConfig(
  pm?: Partial<PredictionSignalConfig> | null,
): PredictionSignalConfig {
  return {
    volumeSpikeThresholdUsd:
      pm?.volumeSpikeThresholdUsd ??
      DEFAULT_PREDICTION_SIGNAL_CONFIG.volumeSpikeThresholdUsd,
    probabilityShiftPct:
      pm?.probabilityShiftPct ??
      DEFAULT_PREDICTION_SIGNAL_CONFIG.probabilityShiftPct,
    minUniqueWallets:
      pm?.minUniqueWallets ?? DEFAULT_PREDICTION_SIGNAL_CONFIG.minUniqueWallets,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Load current prediction_markets rows from SQLite as PredictionMarket[]. */
function loadPreviousSnapshot(db: Database): PredictionMarket[] {
  try {
    const rows = db
      .prepare(
        `SELECT id, question, end_date, yes_price, no_price, volume_24h,
                volume_total, liquidity, last_trade_price, unique_wallets,
                tags, fetched_at
           FROM prediction_markets`,
      )
      .all() as Array<{
      id: string;
      question: string;
      end_date: string;
      yes_price: number;
      no_price: number;
      volume_24h: number;
      volume_total: number;
      liquidity: number;
      last_trade_price: number;
      unique_wallets: number;
      tags: string;
      fetched_at: string;
    }>;

    return rows.map((r) => ({
      id: r.id,
      question: r.question,
      endDate: r.end_date,
      yesPrice: r.yes_price,
      noPrice: r.no_price,
      volume24h: r.volume_24h,
      volumeTotal: r.volume_total,
      liquidity: r.liquidity,
      lastTradePrice: r.last_trade_price,
      uniqueWalletsCount: r.unique_wallets,
      tags: (() => {
        try {
          return JSON.parse(r.tags) as string[];
        } catch {
          return [];
        }
      })(),
      fetchedAt: r.fetched_at,
    }));
  } catch (err) {
    logger.warn("[prediction-market-job] could not load previous snapshot", {
      error: String(err),
    });
    return [];
  }
}

/**
 * Check whether the prediction_markets data is stale by comparing
 * MAX(fetched_at) against the given threshold.
 *
 * Uses ISO 8601 timestamps stored in the `fetched_at` column.
 *
 * @param db           - SQLite database handle
 * @param thresholdHours - Maximum acceptable age in hours (e.g. 24)
 * @returns `{ isStale: true,  ageHours: Infinity }` when the table is empty.
 *          `{ isStale: boolean, ageHours: number }` when rows exist.
 */
export function checkStaleness(
  db: Database,
  thresholdHours: number,
): { isStale: boolean; ageHours: number } {
  try {
    const row = db
      .prepare(`SELECT MAX(fetched_at) AS max_fetched_at FROM prediction_markets`)
      .get() as { max_fetched_at: string | null } | undefined;

    const maxFetchedAt = row?.max_fetched_at ?? null;

    if (maxFetchedAt === null) {
      return { isStale: true, ageHours: Infinity };
    }

    const ageMs = Date.now() - new Date(maxFetchedAt).getTime();
    const ageHours = ageMs / (3600 * 1000);

    return { isStale: ageHours > thresholdHours, ageHours };
  } catch (err) {
    logger.warn("[prediction-market-job] checkStaleness query failed", {
      error: String(err),
    });
    // Fail-safe: treat as stale so signal detection is suppressed
    return { isStale: true, ageHours: Infinity };
  }
}

/** Upsert current markets snapshot into prediction_markets table. */
function storeSnapshot(markets: PredictionMarket[], db: Database): void {
  if (markets.length === 0) return;

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO prediction_markets
      (id, question, end_date, yes_price, no_price, volume_24h, volume_total,
       liquidity, last_trade_price, unique_wallets, tags, fetched_at, updated_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const now = new Date().toISOString();
  const insertMany = db.transaction((rows: PredictionMarket[]) => {
    for (const m of rows) {
      stmt.run(
        m.id,
        m.question,
        m.endDate,
        m.yesPrice,
        m.noPrice,
        m.volume24h,
        m.volumeTotal,
        m.liquidity,
        m.lastTradePrice,
        m.uniqueWalletsCount,
        JSON.stringify(m.tags),
        m.fetchedAt,
        now,
      );
    }
  });

  insertMany(markets);
}

/** Persist detected prediction signals (INSERT OR IGNORE for idempotency). */
function storePredictionSignals(
  signals: PredictionSignal[],
  db: Database,
): void {
  if (signals.length === 0) return;

  // Build a deterministic ID from marketId + signalType + detectedAt (truncated to minute)
  // so repeated calls with the same signal are idempotent.
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO prediction_signals
      (id, market_id, signal_type, severity,
       yes_price_prev, yes_price_curr, volume_24h, unique_wallets,
       confidence, mapped_sectors, mapped_stocks, reasoning, detected_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((rows: PredictionSignal[]) => {
    for (const s of rows) {
      // Deterministic ID: marketId + signalType + minute-level bucket
      const minuteBucket = s.detectedAt.slice(0, 16); // "YYYY-MM-DDTHH:mm"
      const rawId = `${s.marketId}|${s.signalType}|${minuteBucket}`;
      const id = btoa(rawId).replace(/[+/=]/g, "").slice(0, 40);

      stmt.run(
        id,
        s.marketId,
        s.signalType,
        s.severity,
        s.yesPricePrev ?? null,
        s.yesPriceCurr,
        s.volume24h,
        s.uniqueWalletsCount,
        s.confidence,
        "[]", // mapped_sectors — populated by cascade mapper (Task 165, not wired here)
        "[]", // mapped_stocks  — populated by cascade mapper
        s.reasoning,
        s.detectedAt,
      );
    }
  });

  insertMany(signals);
}

/**
 * Convert PredictionSignal[] to the generic Signal[] type expected by
 * `generateAlerts`. Each signal maps to one generic "news_mention" signal
 * attached to a pseudo stock-code derived from the market question keywords.
 *
 * We use the signal's own severity directly — generateAlerts will escalate
 * if multiple signals share the same stock code.
 */
function predictionSignalsToGenericSignals(
  signals: PredictionSignal[],
): Array<{
  type: string;
  severity: string;
  actionCode: string;
  message: string;
  confidence: number;
  detectedAt: string;
}> {
  return signals
    .filter((s) => s.severity === "high" || s.severity === "critical")
    .map((s) => ({
      type: "news_mention" as const,
      severity: s.severity,
      actionCode: "PREDICTION_MARKET",
      message: `[${s.signalType.toUpperCase()}] ${s.marketQuestion}: ${s.reasoning}`,
      confidence: s.confidence,
      detectedAt: s.detectedAt,
    }));
}

/** Build a Vietnamese Telegram message for a high/critical prediction signal. */
export function buildTelegramMessage(signal: PredictionSignal): string {
  const severityLabel =
    signal.severity === "critical"
      ? "NGHIÊM TRỌNG"
      : signal.severity === "high"
        ? "QUAN TRỌNG"
        : "LƯU Ý";

  const pctShift =
    signal.yesPricePrev !== null
      ? ` (dịch chuyển ${((signal.yesPriceCurr - (signal.yesPricePrev ?? 0)) * 100).toFixed(1)}%)`
      : "";

  return (
    `[POLYMARKET] ${severityLabel}\n` +
    `Thị trường: ${signal.marketQuestion}\n` +
    `Loại tín hiệu: ${signal.signalType}${pctShift}\n` +
    `Xác suất YES: ${(signal.yesPriceCurr * 100).toFixed(1)}%\n` +
    `Khối lượng 24h: $${signal.volume24h.toLocaleString("en-US")}\n` +
    `Độ tin cậy: ${(signal.confidence * 100).toFixed(0)}%\n` +
    `Phân tích: ${signal.reasoning}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute one prediction market poll cycle.
 *
 * All heavy dependencies are injectable for testing:
 *   - `enabled`            — boolean flag (default: from config)
 *   - `fetchFn`            — replace with mock to avoid real HTTP
 *   - `db`                 — in-memory SQLite for tests
 *   - `previousMarkets`    — pre-load previous snapshot (skips DB lookup)
 *   - `signalConfig`       — override detection thresholds
 *   - `telegramFn`         — suppress or capture Telegram sends in tests
 *   - `staleThresholdHours`— override staleness threshold (0 = always stale)
 *   - `_signalDetectorSpy` — spy on signal detection calls in tests
 *
 * The function NEVER throws. All errors are caught and logged.
 */
export async function runPredictionMarketPoll(
  opts: PredictionMarketPollOptions = {},
): Promise<void> {
  // ── Concurrency guard ──────────────────────────────────────────────────────
  if (_isRunning) {
    // Sprint 053 / report 1028: routine cycle-overlap, not a bug. The
    // 30-min cron + Polymarket fetch latency means an occasional skip is
    // normal. Demoted from warn to debug so it stops cluttering
    // RECENT ERRORS during upstream slowness.
    logger.debug(
      "[prediction-market-job] previous cycle still running — skipped",
    );
    return;
  }

  _isRunning = true;

  try {
    // ── Step 1: resolve enabled flag ──────────────────────────────────────
    let enabled = opts.enabled;
    if (enabled === undefined) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cfgMod = await import("../../infrastructure/config.js" as any);
        const cfg = (cfgMod as { loadMcpConfig?: () => { predictionMarkets?: { enabled?: boolean } } }).loadMcpConfig?.() ?? {};
        enabled = (cfg as { predictionMarkets?: { enabled?: boolean } }).predictionMarkets?.enabled ?? false;
      } catch {
        enabled = false;
      }
    }

    if (!enabled) {
      logger.info(
        "[prediction-market-job] prediction markets disabled — skipping poll",
      );
      return;
    }

    // ── Step 2: resolve DB ────────────────────────────────────────────────
    // Sprint 053 / report 1023: scheduler can fire on the exact :30 boundary
    // moments after launchd spawns the server, racing ahead of bootstrap's
    // own initDatabase() call. Running initDatabase() here (idempotent —
    // every statement is CREATE TABLE IF NOT EXISTS) guarantees the schema
    // is in place before the first snapshot read. Tests that inject opts.db
    // are unaffected because they bypass this branch entirely.
    let db: Database;
    if (opts.db) {
      db = opts.db;
    } else {
      await initDatabase();
      db = getDb();
    }

    // ── Step 3: fetch current markets ─────────────────────────────────────
    let currentMarkets: PredictionMarket[];
    try {
      if (opts.fetchFn) {
        currentMarkets = await opts.fetchFn();
      } else {
        // Dynamic imports for modules provided by dependency tasks (164, 169).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const polyMod = await import("../../infrastructure/fetchers/polymarket.js" as any);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cfgMod = await import("../../infrastructure/config.js" as any);
        const cfg = (cfgMod as { loadMcpConfig?: () => { predictionMarkets: Record<string, unknown> } }).loadMcpConfig?.() ?? {};
        currentMarkets = await (polyMod as { fetchPolymarkets: (cfg: unknown) => Promise<PredictionMarket[]> }).fetchPolymarkets(
          (cfg as { predictionMarkets?: unknown }).predictionMarkets ?? {},
        );
      }
    } catch (err) {
      logger.warn("[prediction-market-job] fetchPolymarkets failed — falling back to cached snapshot", {
        error: String(err),
      });
      currentMarkets = loadPreviousSnapshot(db);
      // fallthrough: signal detection continues against cached data
    }

    logger.info(
      `[prediction-market-job] fetched ${currentMarkets.length} markets`,
    );

    // ── Step 4: load previous snapshot ───────────────────────────────────
    const previousMarkets =
      opts.previousMarkets !== undefined
        ? opts.previousMarkets
        : loadPreviousSnapshot(db);

    // ── Step 5: store current snapshot ───────────────────────────────────
    storeSnapshot(currentMarkets, db);

    if (currentMarkets.length === 0) {
      logger.info("[prediction-market-job] no markets to process");
      return;
    }

    // ── Step 5b: staleness guard ──────────────────────────────────────────
    // Resolve threshold: opts injection (tests) > config > hardcoded default.
    let staleThresholdHours = opts.staleThresholdHours;
    if (staleThresholdHours === undefined) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cfgMod = await import("../../infrastructure/config.js" as any);
        const cfg = (cfgMod as { loadMcpConfig?: () => { predictionMarkets?: { staleThresholdHours?: number } } }).loadMcpConfig?.() ?? {};
        staleThresholdHours = (cfg as { predictionMarkets?: { staleThresholdHours?: number } }).predictionMarkets?.staleThresholdHours ?? 24;
      } catch {
        staleThresholdHours = 24;
      }
    }

    const stalenessResult = checkStaleness(db, staleThresholdHours);
    if (stalenessResult.isStale) {
      const ageLabel =
        stalenessResult.ageHours === Infinity
          ? "vô hạn (bảng trống)"
          : `${stalenessResult.ageHours.toFixed(1)}h`;

      logger.warn(
        `[prediction-market-job] prediction_markets stale (age: ${ageLabel}) — skipping signal detection`,
      );

      const now = Date.now();
      if (now - _lastStalenessAlertAt > STALENESS_ALERT_COOLDOWN_MS) {
        _lastStalenessAlertAt = now;
        const alertMsg =
          `[POLYMARKET] DU LIEU STALE\n` +
          `prediction_markets.fetched_at qua cu: ${ageLabel}\n` +
          `Nguong: ${staleThresholdHours}h\n` +
          `fetchPolymarkets() that bai — fallback sang cache.\n` +
          `Kiem tra: ket noi mang, CORS, API Polymarket con hoat dong.`;

        try {
          if (opts.telegramFn) {
            await opts.telegramFn(alertMsg);
          } else {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const notifierMod = await import("../../infrastructure/notifiers/telegram.js" as any);
            await (notifierMod as { sendTelegramBug?: (msg: string) => Promise<void>; sendTelegram?: (msg: string) => Promise<void> }).sendTelegramBug?.(alertMsg)
              ?? (notifierMod as { sendTelegram: (msg: string) => Promise<void> }).sendTelegram(alertMsg);
          }
        } catch (err) {
          logger.error("[prediction-market-job] staleness Telegram alert failed", {
            error: String(err),
          });
        }
      } else {
        logger.debug(
          "[prediction-market-job] staleness alert suppressed by 24h cooldown",
        );
      }

      // Fail-fast: skip signal detection on stale data
      return;
    }

    // ── Step 6: detect signals ────────────────────────────────────────────
    let detectPredictionSignals: (
      current: PredictionMarket[],
      previous: PredictionMarket[],
      config: PredictionSignalConfig,
      hasRecentNews: Set<string>,
      recentSentiments: RecentSentimentEntry[],
    ) => PredictionSignal[];

    if (opts._signalDetectorSpy) {
      detectPredictionSignals = opts._signalDetectorSpy;
    } else {
      const detectorMod = await import(
        "../../domain/services/predictionSignalDetector.js"
      );
      detectPredictionSignals = detectorMod.detectPredictionSignals;
    }

    let signalConfig: PredictionSignalConfig;
    if (opts.signalConfig) {
      signalConfig = opts.signalConfig;
    } else {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cfgMod = await import("../../infrastructure/config.js" as any);
        const cfg = (cfgMod as { loadMcpConfig?: () => { predictionMarkets: { volumeSpikeThresholdUsd: number; probabilityShiftPct: number; minUniqueWallets: number } } }).loadMcpConfig?.() ?? { predictionMarkets: null };
        const pm = (cfg as { predictionMarkets?: { volumeSpikeThresholdUsd?: number; probabilityShiftPct?: number; minUniqueWallets?: number } | null }).predictionMarkets;
        signalConfig = resolvePredictionSignalConfig(pm);
      } catch {
        signalConfig = resolvePredictionSignalConfig();
      }
    }

    const signals = detectPredictionSignals(
      currentMarkets,
      previousMarkets,
      signalConfig,
      new Set<string>(), // hasRecentNews — not wired here (would need RAG lookup)
      [], // recentSentiments — not wired here (would need cascade engine lookup)
    );

    logger.info(
      `[prediction-market-job] detected ${signals.length} signals`,
    );

    // ── Step 7: store signals ─────────────────────────────────────────────
    storePredictionSignals(signals, db);

    // ── Step 8: send Telegram for high/critical signals (with 2h dedup) ──
    const notifySignals = signals.filter(
      (s) => s.severity === "high" || s.severity === "critical",
    );

    if (notifySignals.length > 0) {
      // Dedup: check which market+signalType combos were already sent in last 2h
      const recentlySent = new Set<string>();
      try {
        const rows = db
          .prepare(
            `SELECT market_id, signal_type FROM prediction_signals
             WHERE detected_at > datetime('now', '-2 hours')
               AND severity IN ('high', 'critical')
               AND id NOT IN (${sqlInClause(signals.length)})`,
          )
          .all(
            ...signals.map((s) => {
              const minuteBucket = s.detectedAt.slice(0, 16);
              const rawId = `${s.marketId}|${s.signalType}|${minuteBucket}`;
              return btoa(rawId).replace(/[+/=]/g, "").slice(0, 40);
            }),
          ) as Array<{ market_id: string; signal_type: string }>;
        for (const r of rows) {
          recentlySent.add(`${r.market_id}|${r.signal_type}`);
        }
      } catch { /* best-effort — send all if query fails */ }

      for (const sig of notifySignals) {
        const dedupKey = `${sig.marketId}|${sig.signalType}`;
        if (recentlySent.has(dedupKey)) {
          logger.debug("[prediction-market-job] Telegram dedup — skipping", {
            marketId: sig.marketId,
            signalType: sig.signalType,
          });
          continue;
        }

        try {
          const msg = buildTelegramMessage(sig);
          if (opts.telegramFn) {
            await opts.telegramFn(msg);
          } else {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const notifierMod = await import("../../infrastructure/notifiers/telegram.js" as any);
            await (notifierMod as { sendTelegram: (msg: string) => Promise<void> }).sendTelegram(msg);
          }
        } catch (err) {
          logger.error(
            "[prediction-market-job] Telegram send failed for signal",
            { marketId: sig.marketId, error: String(err) },
          );
        }
      }
    }

    // ── Step 9: log summary ───────────────────────────────────────────────
    const bySeverity = signals.reduce(
      (acc, s) => {
        acc[s.severity] = (acc[s.severity] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    logger.info(
      `[prediction-market-job] cycle complete — ` +
        `markets: ${currentMarkets.length}, ` +
        `signals: ${signals.length}, ` +
        `high: ${bySeverity["high"] ?? 0}, ` +
        `critical: ${bySeverity["critical"] ?? 0}, ` +
        `notified: ${notifySignals.length}`,
    );
  } catch (err) {
    logger.error("[prediction-market-job] unhandled error in poll cycle", {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    _isRunning = false;
  }
}
