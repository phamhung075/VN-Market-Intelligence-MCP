/**
 * Infrastructure — Market Message Store (Sprint 068 + 069)
 *
 * CRUD helpers for the `market_messages` SQLite table.
 * Stores all MARKET channel Telegram sends for quality review.
 *
 * Design rules:
 *   - All functions accept an explicit `db` parameter (no global singleton)
 *     so they can be used in tests with an in-memory database.
 *   - `insertMarketMessage` never throws — returns 0 on any failure (best-effort).
 *   - `reviewMarketMessage` validates verdict at runtime; throws Error("Invalid verdict")
 *     for any value outside "signal" | "noise".
 *   - `batchReviewMarketMessages` validates verdict and wraps all updates in a
 *     single SQLite transaction; throws Error("Invalid verdict") for bad verdicts.
 *   - `getMarketMessageDigest` is read-only; never modifies rows.
 *
 * The DDL for `market_messages` lives in `src/infrastructure/db/schema.ts`
 * inside `initDatabase()`. Callers must ensure `initDatabase()` has run before
 * invoking any function here.
 *
 * @module infrastructure/db/marketMessageStore
 */

import type { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Identifies the scheduler job or MCP tool that sent the MARKET message.
 * Use "unknown" as the fallback for call sites not yet migrated.
 */
export type MarketMessageAgent =
  | "morning-briefing"
  | "evening-summary"
  | "alert-commander"
  | "alert-digest"
  | "france-summary"
  | "pattern-watch"
  | "calibration-report"
  | "prediction-market"
  | "weather-check"
  | "weekly-portfolio"
  | "mcp-user"
  | "unknown";

/**
 * Semantic category of the MARKET message content.
 * Use "unknown" as the fallback for call sites not yet migrated.
 */
export type MarketMessageType =
  | "morning_briefing"
  | "evening_summary"
  | "alert"
  | "alert_digest"
  | "france_summary"
  | "pattern_watch"
  | "calibration_report"
  | "prediction_signal"
  | "weather"
  | "weekly_portfolio"
  | "user_ask_reply"
  | "unknown";

/** A row from the `market_messages` table. */
export interface MarketMessageRow {
  id: number;
  from_agent: string;
  message_type: string;
  ticker: string | null;
  content: string;
  sent_at: string;
  verdict: string | null;
  verdict_note: string | null;
  reviewed_at: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inserts a new market message row.
 *
 * Wrapped in try/catch — returns `0` on any exception so that a persistence
 * failure never breaks the message delivery path.
 *
 * @param db     - SQLite database instance
 * @param params - Message metadata and content
 * @returns Inserted row id (>= 1), or `0` on failure
 */
export function insertMarketMessage(
  db: Database,
  params: {
    from_agent: MarketMessageAgent | string;
    message_type: MarketMessageType | string;
    ticker?: string | null;
    content: string;
  },
): number {
  try {
    const result = db
      .prepare(
        `INSERT INTO market_messages (from_agent, message_type, ticker, content)
         VALUES (?, ?, ?, ?)`,
      )
      .run(
        params.from_agent,
        params.message_type,
        params.ticker ?? null,
        params.content,
      );
    return Number(result.lastInsertRowid);
  } catch {
    return 0;
  }
}

/**
 * Returns unreviewed market messages (verdict IS NULL), ordered newest first.
 *
 * @param db     - SQLite database instance
 * @param limit  - Maximum rows to return (default 20, clamped to 1–100)
 * @param ticker - Optional ticker filter; pass null or undefined to return all
 * @returns Array of unreviewed rows, newest first
 */
export function getUnreviewedMarketMessages(
  db: Database,
  limit?: number,
  ticker?: string | null,
): MarketMessageRow[] {
  const clampedLimit = Math.min(100, Math.max(1, limit ?? 20));

  if (ticker != null) {
    return db
      .prepare<MarketMessageRow, [string, number]>(
        `SELECT id, from_agent, message_type, ticker, content,
                sent_at, verdict, verdict_note, reviewed_at
         FROM market_messages
         WHERE verdict IS NULL
           AND ticker = ?
         ORDER BY sent_at DESC
         LIMIT ?`,
      )
      .all(ticker, clampedLimit);
  }

  return db
    .prepare<MarketMessageRow, [number]>(
      `SELECT id, from_agent, message_type, ticker, content,
              sent_at, verdict, verdict_note, reviewed_at
       FROM market_messages
       WHERE verdict IS NULL
       ORDER BY sent_at DESC
       LIMIT ?`,
    )
    .all(clampedLimit);
}

/**
 * Sets the verdict and optional note on a market message row.
 *
 * Idempotent: calling twice overwrites the previous verdict and note without
 * error. `reviewed_at` is set to `datetime('now')` on every call.
 *
 * @param db      - SQLite database instance
 * @param id      - Primary key of the row to review
 * @param verdict - Must be "signal" or "noise"; throws Error("Invalid verdict") for any other value
 * @param note    - Optional free-text note (stored in `verdict_note`)
 * @returns `true` if the row was found and updated; `false` if the id does not exist
 */
export function reviewMarketMessage(
  db: Database,
  id: number,
  verdict: "signal" | "noise",
  note?: string | null,
): boolean {
  if (verdict !== "signal" && verdict !== "noise") {
    throw new Error("Invalid verdict");
  }

  const result = db
    .prepare(
      `UPDATE market_messages
       SET verdict = ?, verdict_note = ?, reviewed_at = datetime('now')
       WHERE id = ?`,
    )
    .run(verdict, note ?? null, id);

  return result.changes > 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 069 — Digest + Batch Review
// ─────────────────────────────────────────────────────────────────────────────

/** A single entry in the digest: one from_agent on one calendar date. */
export interface MarketMessageDigestEntry {
  /** UTC calendar date, YYYY-MM-DD format (derived from sent_at) */
  date: string;
  /** Agent that sent the messages */
  from_agent: string;
  /** Total unreviewed messages from this agent on this date */
  count: number;
  /** Array of unreviewed message ids (for passing to batchReviewMarketMessages) */
  ids: number[];
  /** Preview of the first message: first 120 chars of content */
  preview: string;
}

/** Return value of batchReviewMarketMessages. */
export interface BatchReviewResult {
  /** Number of rows with changes > 0 */
  updated: number;
  /** Input ids that did not match any market_messages row */
  notFound: number[];
}

/** Raw SQLite row shape from the GROUP BY digest query. */
type RawDigestRow = {
  date: string;
  from_agent: string;
  count: number;
  id_list: string;
  preview: string;
};

/**
 * Returns a grouped digest of unreviewed market_messages rows,
 * grouped by UTC calendar date and from_agent.
 *
 * Read-only. Never modifies rows.
 *
 * @param db         - SQLite database instance
 * @param limit_days - How many calendar days back to look (default 7, clamped 1–30)
 * @returns Array of digest entries, ordered date DESC, agent ASC
 */
export function getMarketMessageDigest(
  db: Database,
  limit_days?: number,
): MarketMessageDigestEntry[] {
  const days = Math.min(30, Math.max(1, limit_days ?? 7));

  const rows = db
    .prepare<RawDigestRow, [number]>(
      `SELECT
         date(sent_at)                AS date,
         from_agent,
         COUNT(*)                     AS count,
         GROUP_CONCAT(id)             AS id_list,
         MIN(substr(content, 1, 120)) AS preview
       FROM market_messages
       WHERE verdict IS NULL
         AND sent_at >= date('now', '-' || ? || ' days')
       GROUP BY date(sent_at), from_agent
       ORDER BY date(sent_at) DESC, from_agent ASC`,
    )
    .all(days);

  return rows.map((row) => ({
    date: row.date,
    from_agent: row.from_agent,
    count: row.count,
    ids: (row.id_list ?? "").split(",").map(Number).filter(Boolean),
    preview: row.preview,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 070 — Label Accuracy Report
// ─────────────────────────────────────────────────────────────────────────────

/** Per-agent accuracy statistics derived from human verdict labels. */
export interface LabelAccuracyRow {
  from_agent: string;
  total_reviewed: number;
  signal_count: number;
  noise_count: number;
  /** signal_count / total_reviewed. Null only as a guard; WHERE clause prevents it in practice. */
  signal_rate: number | null;
  last_reviewed_at: string | null;
}

/** Raw SQLite row shape from the GROUP BY label accuracy query. */
type RawLabelAccuracyRow = {
  from_agent: string;
  total_reviewed: number | bigint;
  signal_count: number | bigint;
  noise_count: number | bigint;
  signal_rate: number | null;
  last_reviewed_at: string | null;
};

/**
 * Returns per-agent signal accuracy computed from human verdict labels.
 * Read-only. Groups market_messages WHERE verdict IS NOT NULL by from_agent.
 *
 * @param db         - SQLite database instance
 * @param since_days - Lookback window in calendar days (default 90, clamped 1-365)
 * @returns LabelAccuracyRow[] ordered by signal_rate DESC, total_reviewed DESC
 */
export function getLabelAccuracyReport(
  db: Database,
  since_days?: number,
): LabelAccuracyRow[] {
  const clampedDays = Math.min(365, Math.max(1, since_days ?? 90));

  const rows = db
    .prepare<RawLabelAccuracyRow, [number]>(
      `SELECT
         from_agent,
         COUNT(*)                                            AS total_reviewed,
         SUM(CASE WHEN verdict = 'signal' THEN 1 ELSE 0 END) AS signal_count,
         SUM(CASE WHEN verdict = 'noise'  THEN 1 ELSE 0 END) AS noise_count,
         CAST(SUM(CASE WHEN verdict = 'signal' THEN 1 ELSE 0 END) AS REAL)
           / COUNT(*)                                        AS signal_rate,
         MAX(reviewed_at)                                    AS last_reviewed_at
       FROM market_messages
       WHERE verdict IS NOT NULL
         AND reviewed_at >= date('now', '-' || ? || ' days')
       GROUP BY from_agent
       ORDER BY signal_rate DESC, total_reviewed DESC`,
    )
    .all(clampedDays);

  return rows.map((row) => ({
    from_agent: row.from_agent,
    total_reviewed: Number(row.total_reviewed),
    signal_count: Number(row.signal_count),
    noise_count: Number(row.noise_count),
    signal_rate: row.signal_rate,
    last_reviewed_at: row.last_reviewed_at,
  }));
}

/**
 * Applies a single verdict to a list of message IDs in one SQLite transaction.
 *
 * Idempotent per row: overwrites any previous verdict.
 * Partial success is normal: ids not found are reported in notFound.
 *
 * @param db      - SQLite database instance
 * @param ids     - Message ids to update (pass empty array for no-op)
 * @param verdict - Must be "signal" or "noise"; throws Error("Invalid verdict") otherwise
 * @param note    - Optional note applied to all rows in the batch
 * @returns BatchReviewResult with updated count and notFound id list
 */
export function batchReviewMarketMessages(
  db: Database,
  ids: number[],
  verdict: "signal" | "noise",
  note?: string | null,
): BatchReviewResult {
  if (verdict !== "signal" && verdict !== "noise") {
    throw new Error("Invalid verdict");
  }

  if (ids.length === 0) {
    return { updated: 0, notFound: [] };
  }

  const stmt = db.prepare(
    `UPDATE market_messages
     SET verdict = ?, verdict_note = ?, reviewed_at = datetime('now')
     WHERE id = ?`,
  );

  const notFound: number[] = [];
  let updated = 0;

  const txn = db.transaction(() => {
    for (const id of ids) {
      const result = stmt.run(verdict, note ?? null, id);
      if (result.changes > 0) {
        updated++;
      } else {
        notFound.push(id);
      }
    }
  });

  txn();

  return { updated, notFound };
}
