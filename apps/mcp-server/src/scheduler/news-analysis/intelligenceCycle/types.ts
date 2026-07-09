/**
 * Intelligence Cycle — Shared Contracts (CycleResult / CycleDeps)
 *
 * FACTORY-SCHEDULER-split-intelligenceCycleJob: extracted from
 * intelligenceCycleJob.ts so the DI seam (`deps.*Fn` pattern) and the cycle
 * summary shape have ONE canonical definition, shared by the orchestrator
 * (`intelligenceCycleJob.ts`) and every `defaults/*.ts` production impl.
 *
 * Re-exported from intelligenceCycleJob.ts for backward-compatible import
 * paths (existing tests import `CycleDeps`/`CycleResult` from there,
 * unchanged — zero call-site churn).
 *
 * Layer: interface/scheduler — type-only module, no runtime imports beyond
 * the type positions below.
 */

import type { PollNewsResult } from "../../../application/usecases/pollNews.js";
import type { SscDocument } from "../../../infrastructure/fetchers/ssc.js";
import type { Alert } from "../../../domain/services/alertGenerator.js";

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
  cooldownConfig?: import("../../../domain/services/alertCooldown.js").CooldownConfig;
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
  insertClaimFn?: (params: import("../../../infrastructure/db/predictionClaimStore.js").PredictionClaimInput) => number;
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
