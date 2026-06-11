/**
 * newsBuzzHandler.ts — GET /api/news-buzz
 *
 * TASK17-PAGE19 endpoint:
 * News-buzz / mention-velocity leaderboard — "what's being talked about"
 * plus negative-mention early-warning signal.
 *
 * Source table: mention_velocity (hourly, real-time updating).
 * Read path: getNewsBuzzWindow (infrastructure/db/mentionVelocityStore).
 * NO SQL in this handler — db injected by server.ts.
 * This handler ONLY maps + aggregates — SQL lives in the store.
 *
 * Window contract (data-anchored, NOT now-relative):
 *   windowEnd   = MAX(hour) from the table
 *   windowStart = datetime(windowEnd, '-7 days')
 *   Rows: hour > windowStart (exclusive lower bound)
 *
 * Response shape (200 OK):
 *   {
 *     generatedAt: string,                  // ISO 8601 server clock
 *     windowStart: string | null,           // resolved window start (null when empty)
 *     windowEnd:   string | null,           // resolved window end (null when empty)
 *     summary:     NewsBuzzSummary,         // aggregate counts
 *     leaderboard: NewsBuzzLeaderboardEntry[] // ordered mentions DESC, code ASC
 *   }
 *
 * 200 + honest empty-state when table has no rows (NO error).
 * 405 on non-GET methods.
 * 500 JSON {error:"db_error", detail} on DB error.
 *
 * DDD Layer: interface — db injected by server.ts (no getDb() here).
 * Imports ONLY from mentionVelocityStore (infrastructure/db) — no domain imports.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";
import {
  getNewsBuzzWindow,
} from "../../../infrastructure/db/mentionVelocityStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Local helper
// ─────────────────────────────────────────────────────────────────────────────

/** Round to at most `dp` decimal places (same pattern as fedRatesHandler/reputationHandler). */
function roundDp(value: number, dp: number): number {
  const factor = Math.pow(10, dp);
  return Math.round(value * factor) / factor;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Aggregate summary block for the full window. */
export interface NewsBuzzSummary {
  distinctCodes: number;
  totalMentions: number;
  totalNegative: number;
  totalSources: number;
}

/** One leaderboard entry (already ordered by the store query). */
export interface NewsBuzzLeaderboardEntry {
  code: string;
  mentions: number;
  negative: number;
  sources: number;
  hoursActive: number;
  negativeRatio: number;
}

/** Full response body for GET /api/news-buzz. */
export interface NewsBuzzResponse {
  generatedAt: string;
  windowStart: string | null;
  windowEnd: string | null;
  summary: NewsBuzzSummary;
  leaderboard: NewsBuzzLeaderboardEntry[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler orchestration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Orchestrate the GET /api/news-buzz response.
 * Called by the HTTP handler with an injected DB instance.
 * NO SQL here — all DB access goes through store functions.
 *
 * @param db - SQLite database instance (injected by server.ts — NO getDb() here)
 * @returns NewsBuzzResponse object (caller serialises to JSON)
 */
export function handleGetNewsBuzz(db: Database): NewsBuzzResponse {
  const generatedAt = new Date().toISOString();

  const { windowStart, windowEnd, rows } = getNewsBuzzWindow(db, 7);

  // Empty-state guard — do NOT throw when table has no rows.
  if (rows.length === 0) {
    return {
      generatedAt,
      windowStart: null,
      windowEnd: null,
      summary: {
        distinctCodes: 0,
        totalMentions: 0,
        totalNegative: 0,
        totalSources: 0,
      },
      leaderboard: [],
    };
  }

  // Summary aggregates
  const distinctCodes = rows.length;
  const totalMentions = rows.reduce((acc, r) => acc + r.mentions, 0);
  const totalNegative = rows.reduce((acc, r) => acc + r.negative, 0);
  const totalSources = rows.reduce((acc, r) => acc + r.sources, 0);

  // Leaderboard — preserve store order (mentions DESC, code ASC)
  const leaderboard: NewsBuzzLeaderboardEntry[] = rows.map((r) => ({
    code: r.code,
    mentions: r.mentions,
    negative: r.negative,
    sources: r.sources,
    hoursActive: r.hoursActive,
    negativeRatio: r.mentions > 0 ? roundDp(r.negative / r.mentions, 2) : 0,
  }));

  return {
    generatedAt,
    windowStart,
    windowEnd,
    summary: { distinctCodes, totalMentions, totalNegative, totalSources },
    leaderboard,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle GET /api/news-buzz.
 * Only GET is served; other methods → 405 Method Not Allowed.
 *
 * @param req - Incoming HTTP request
 * @param res - HTTP response
 * @param db  - SQLite database instance (injected by server.ts)
 */
export function handleGetNewsBuzzHttp(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
): void {
  if (req.method !== "GET") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method Not Allowed" }));
    return;
  }

  try {
    const body = handleGetNewsBuzz(db);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "db_error",
        detail: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}
