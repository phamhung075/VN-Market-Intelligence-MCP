/**
 * Infrastructure — Market Message Store (Sprint 068)
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
