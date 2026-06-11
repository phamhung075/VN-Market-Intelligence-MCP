/**
 * Reputation Compute Job — Task 1922d
 *
 * Daily cron job (08:30 UTC, `30 8 * * *`) that iterates the watchlist,
 * aggregates 7-day mention_velocity + agent_signals data per ticker, and
 * persists reputation_scores via saveReputation().
 *
 * Scoring model (task 1922d spec):
 *   base = 50
 *   score = base - negative_mention_ratio * 30 + signal_hit_count * 2 (capped at +20)
 *
 * Risk level:
 *   score < 30  → "danger"  (mapped to task spec "HIGH")
 *   30-60       → "warning" or "watch" (from reputationScorer domain)
 *   > 60        → "safe"    (mapped to task spec "LOW")
 *
 * Trend (uses domain buildReputationScore convention):
 *   "improving"     — new score > prior + 1
 *   "deteriorating" — new score < prior - 1
 *   "stable"        — otherwise
 *
 * Fail-loud: sends WORK telegram on job-level error.
 * Per-ticker failures are logged non-fatally and counted in tickersFailed.
 *
 * DDD Layer: interface/scheduler — imports from infrastructure + domain only.
 *
 * @module scheduler/news/reputationComputeJob
 */

import type { Database } from "bun:sqlite";
import { getDb } from "../../infrastructure/db/schema.js";
import {
  saveReputation,
  getReputationPrior,
} from "../../infrastructure/db/reputationStore.js";
import { classifyRiskLevel } from "../../domain/services/reputationScorer.js";
import type { ReputationScore } from "../../domain/services/reputationScorer.js";
import { sendTelegramWork } from "../../infrastructure/notifiers/telegram.js";
import { logger } from "../../infrastructure/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const JOB_NAME = "reputationComputeJob";

/** Look-back window for mention_velocity and agent_signals (7 days) */
const LOOKBACK_DAYS = 7;

/** Base score for all tickers */
const BASE_SCORE = 50;

/** Weight applied to negative mention ratio */
const NEGATIVE_WEIGHT = 30;

/** Boost per signal hit */
const SIGNAL_HIT_BOOST = 2;

/** Maximum total signal boost */
const MAX_SIGNAL_BOOST = 20;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ReputationComputeResult {
  tickersProcessed: number;
  tickersFailed: number;
}

export type ComputeFn = (db: Database, code: string, priorScore?: number) => ReputationScore;

export interface ReputationComputeOptions {
  /** Injectable DB handle (defaults to getDb()) — for testing */
  _db?: Database;
  /** Injectable WORK telegram sender — for testing */
  _sendWorkFn?: (msg: string) => Promise<unknown>;
  /** Injectable compute function — for testing fault isolation */
  _computeFn?: ComputeFn;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core computation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute a reputation score for a single ticker using the last 7 days of
 * mention_velocity and agent_signals data.
 *
 * Pure in the sense that it only reads from DB (no writes).
 * Exported for unit testing.
 *
 * @param db         Active DB handle
 * @param code       Stock ticker
 * @param priorScore Prior week's score (for trend detection); undefined = stable
 * @returns          ReputationScore snapshot (not yet persisted)
 */
export function computeReputationForTicker(
  db: Database,
  code: string,
  priorScore?: number,
): ReputationScore {
  const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // ── mention_velocity aggregation ──────────────────────────────────────────
  const mentionRow = db.prepare(`
    SELECT
      COALESCE(SUM(mention_count), 0)  AS total_mentions,
      COALESCE(SUM(negative_count), 0) AS total_negatives
    FROM mention_velocity
    WHERE code = ? AND hour >= ?
  `).get(code, cutoff) as { total_mentions: number; total_negatives: number } | null;

  const totalMentions = mentionRow?.total_mentions ?? 0;
  const totalNegatives = mentionRow?.total_negatives ?? 0;
  const negativeMentionRatio = totalMentions > 0 ? totalNegatives / totalMentions : 0;

  // ── agent_signals hit count ───────────────────────────────────────────────
  // Count signals where payload contains the ticker code string
  const signalRow = db.prepare(`
    SELECT COUNT(*) AS hit_count
    FROM agent_signals
    WHERE created_at >= ?
      AND payload LIKE ?
  `).get(cutoff, `%${code}%`) as { hit_count: number } | null;

  const signalHitCount = signalRow?.hit_count ?? 0;

  // ── Score formula ─────────────────────────────────────────────────────────
  const negPenalty = negativeMentionRatio * NEGATIVE_WEIGHT;
  const sigBoost = Math.min(signalHitCount * SIGNAL_HIT_BOOST, MAX_SIGNAL_BOOST);
  const rawScore = Math.max(0, Math.min(100, BASE_SCORE - negPenalty + sigBoost));

  // ── Risk level ────────────────────────────────────────────────────────────
  const riskLevel = classifyRiskLevel(rawScore);

  // ── Trend ─────────────────────────────────────────────────────────────────
  let trend: "improving" | "stable" | "deteriorating" = "stable";
  if (priorScore !== undefined) {
    const delta = rawScore - priorScore;
    if (delta > 1) trend = "improving";
    else if (delta < -1) trend = "deteriorating";
  }

  return {
    stockCode: code,
    score: Math.round(rawScore * 100) / 100,
    riskLevel,
    trend,
    computedAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Job entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the reputation compute job.
 *
 * Iterates all watchlist tickers, computes daily reputation score for each,
 * and persists via saveReputation(). Per-ticker failures are logged and
 * counted non-fatally so a bad ticker doesn't block the rest of the watchlist.
 *
 * Job-level errors (e.g. DB connection failure, watchlist query failure) are
 * caught, reported to the WORK Telegram channel, and rethrown so
 * jobRunRepo.wrapRun() can record status='error'.
 *
 * @param options Injectable overrides for testing
 * @returns Counts of tickers processed and failed
 */
export async function runReputationComputeJob(
  options?: ReputationComputeOptions,
): Promise<ReputationComputeResult> {
  const db = options?._db ?? getDb();
  const sendWorkFn = options?._sendWorkFn ?? sendTelegramWork;
  const computeFn = options?._computeFn ?? computeReputationForTicker;

  let tickersProcessed = 0;
  let tickersFailed = 0;

  try {
    // ── Load watchlist ───────────────────────────────────────────────────────
    const watchlistRows = db.prepare(
      `SELECT code FROM watchlist ORDER BY code`
    ).all() as { code: string }[];

    const today = new Date().toISOString().slice(0, 10);

    for (const { code } of watchlistRows) {
      try {
        // Fetch most recent prior score for trend computation (may be null).
        // Uses getReputationPrior (date < today) instead of an exact -7d date
        // match, which always returned null due to irregular probe intervals
        // (rows land at 3d/4d/7d gaps, never exactly 7 calendar days prior).
        const priorRecord = getReputationPrior(db, code, today);
        const priorScore = priorRecord?.score;

        const rep = computeFn(db, code, priorScore);

        saveReputation(db, rep, today);
        tickersProcessed++;

        logger.debug(
          `[${JOB_NAME}] ${code} → score=${rep.score} risk=${rep.riskLevel} trend=${rep.trend}`,
        );
      } catch (tickerErr) {
        tickersFailed++;
        const msg = tickerErr instanceof Error ? tickerErr.message : String(tickerErr);
        logger.warn(`[${JOB_NAME}] ticker=${code} failed (non-fatal): ${msg}`);
      }
    }

    logger.info(
      `[${JOB_NAME}] complete — processed=${tickersProcessed} failed=${tickersFailed} date=${today}`,
    );
  } catch (jobErr) {
    const msg = jobErr instanceof Error ? jobErr.message : String(jobErr);
    logger.error(`[${JOB_NAME}] job-level error: ${msg}`);
    await sendWorkFn(`[${JOB_NAME}] job error: ${msg}`);
    throw jobErr;
  }

  return { tickersProcessed, tickersFailed };
}
