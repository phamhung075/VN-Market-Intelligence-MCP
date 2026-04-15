/**
 * France Summary Job — Task 1290 (Interface / Scheduler Layer)
 *
 * Sends a morning digest of overnight VN market signals to the WORK channel
 * at 07:00 UTC = 08:00 CET (before Paris market open). Relevant to the
 * France-based user who monitors Vietnam markets from UTC+1/+2.
 *
 * Logic:
 *   1. Query rag_analyses for the last 8h — captures VN market session
 *      (09:00-15:30 GMT+7 = 02:00-08:30 UTC the same day)
 *   2. If no rows found → return { sent: false, signalCount: 0 } (silent)
 *   3. Select top 3 signals by impact_score
 *   4. Format a brief plain-text English digest
 *   5. Send to WORK channel via sendTelegramWork
 *
 * DDD Layer: interface/scheduler — may import from infrastructure only.
 *
 * All dependencies are injectable for TDD (db, sendFn).
 */

import type { Database } from "bun:sqlite"
import { logger } from "../infrastructure/logger.js"

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/** Injectable Telegram send function. */
export type SendFn = (text: string) => Promise<boolean>

/** Result of runFranceSummary. */
export interface FranceSummaryResult {
  /** Whether a message was sent to Telegram. */
  sent: boolean
  /** Total number of signals found in the look-back window. */
  signalCount: number
}

/** Options for runFranceSummary (injectable for TDD). */
export interface FranceSummaryOptions {
  /** SQLite DB (defaults to getDb() singleton). */
  db?: Database
  /** Telegram send function (defaults to sendTelegramWork). */
  sendFn?: SendFn
  /** Look-back window in hours (default: 8). */
  windowHours?: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal types
// ─────────────────────────────────────────────────────────────────────────────

interface SignalRow {
  id: string
  sentiment: string | null
  impact_score: number | null
  summary: string | null
  level: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_WINDOW_HOURS = 8
const TOP_SIGNAL_COUNT = 3

// ─────────────────────────────────────────────────────────────────────────────
// Core helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches recent signals from rag_analyses within the last N hours.
 *
 * @param db          - SQLite database
 * @param windowHours - Look-back window in hours
 * @returns Array of signal rows ordered by impact_score DESC
 */
export function fetchRecentSignals(db: Database, windowHours: number): SignalRow[] {
  const cutoff = new Date(Date.now() - windowHours * 3_600_000)
    .toISOString()
    .slice(0, 19)

  return db
    .prepare<SignalRow, [string]>(`
      SELECT id, sentiment, impact_score, summary, level
      FROM rag_analyses
      WHERE created_at >= ?
        AND summary IS NOT NULL
        AND summary != ''
      ORDER BY impact_score DESC
    `)
    .all(cutoff)
}

/**
 * Formats the France morning digest message.
 *
 * @param signals    - All signals found in the window
 * @param topSignals - Top 3 signals by impact_score to include in digest
 * @returns Formatted plain-text message string
 */
export function formatFranceSummary(signals: SignalRow[], topSignals: SignalRow[]): string {
  const dateStr = new Date().toISOString().slice(0, 10)
  const lines: string[] = []

  lines.push(`France Summary — VN Overnight Signals (${dateStr})`)
  lines.push(`Total signals (last 8h): ${signals.length}`)
  lines.push("")

  if (topSignals.length === 0) {
    lines.push("No notable signals.")
    return lines.join("\n")
  }

  lines.push(`Top ${topSignals.length} signals by impact:`)
  for (const sig of topSignals) {
    const sentiment = sig.sentiment ?? "neutral"
    const score = sig.impact_score != null ? sig.impact_score.toFixed(1) : "n/a"
    const summary = (sig.summary ?? "").slice(0, 120)
    lines.push(`  [${sentiment.toUpperCase()}] score=${score} — ${summary}`)
  }

  return lines.join("\n")
}

// ─────────────────────────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runs the France morning summary job.
 *
 * Queries recent rag_analyses entries and sends a brief digest to the WORK
 * channel. Silent when no signals found (returns { sent: false, signalCount: 0 }).
 *
 * Never throws — all errors are caught and logged.
 *
 * @param opts - Injectable dependencies for testability
 */
export async function runFranceSummary(opts: FranceSummaryOptions = {}): Promise<FranceSummaryResult> {
  const windowHours = opts.windowHours ?? DEFAULT_WINDOW_HOURS

  // Resolve DB
  let resolvedDb: Database
  if (opts.db) {
    resolvedDb = opts.db
  } else {
    const { getDb } = await import("../infrastructure/db/schema.js")
    resolvedDb = getDb()
  }

  // Resolve send function
  let resolvedSend: SendFn
  if (opts.sendFn) {
    resolvedSend = opts.sendFn
  } else {
    const { sendTelegramWork } = await import("../infrastructure/notifiers/telegram.js")
    resolvedSend = (text: string) => sendTelegramWork(text, { parseMode: "" })
  }

  // Fetch recent signals
  let signals: SignalRow[]
  try {
    signals = fetchRecentSignals(resolvedDb, windowHours)
  } catch (err) {
    logger.warn("[franceSummaryJob] DB query failed — skipping", {
      error: err instanceof Error ? err.message : String(err),
    })
    return { sent: false, signalCount: 0 }
  }

  if (signals.length === 0) {
    return { sent: false, signalCount: 0 }
  }

  const topSignals = signals.slice(0, TOP_SIGNAL_COUNT)
  const message = formatFranceSummary(signals, topSignals)

  try {
    await resolvedSend(message)
    return { sent: true, signalCount: signals.length }
  } catch (err) {
    logger.warn("[franceSummaryJob] Telegram send failed", {
      error: err instanceof Error ? err.message : String(err),
    })
    return { sent: false, signalCount: signals.length }
  }
}
