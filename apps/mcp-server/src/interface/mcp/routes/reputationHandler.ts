/**
 * reputationHandler.ts — GET /api/reputation
 *
 * TASK17-PAGE18 endpoint:
 * Corporate-reputation (news-sentiment) risk leaderboard.
 * Full-universe snapshot at the latest scored date, plus per-code history
 * arrays for sparkline rendering.
 *
 * Source table: reputation_scores (stored-data-only; NO live network calls).
 * Read path: getLatestReputationSnapshot + getReputationHistory (infrastructure).
 * NO SQL in this handler — db injected by server.ts.
 * This handler ONLY maps + aggregates — db injected by server.ts.
 *
 * Live contract (probed 2026-06-09 against named-volume DB):
 *   41 tickers × 6 dates, latest 2026-06-09.
 *   asOf "2026-06-09"; summary.total 41; summary.avgScore 56.11.
 *   byRisk {safe:3, watch:37, warning:1, danger:0}.
 *   leaderboard[0] = CTG score 70 (ties CTG/SIS/TCH all 70, code ASC → CTG first).
 *   Lowest score: GAS 36.0 risk_level "warning".
 *
 * Response shape (200 OK):
 *   {
 *     generatedAt: string,             // ISO 8601 server clock
 *     asOf:        string | null,      // latest date in snapshot, null when empty
 *     summary:     ReputationSummary,  // total + avgScore + byRisk counts
 *     leaderboard: LeaderboardEntry[], // score DESC, code ASC
 *     history:     HistoryMap          // { [code]: [{date, score}, ...] } asc date
 *   }
 *
 * 200 + honest empty-state when table has no rows (NO error).
 * 405 on non-GET methods.
 * 500 JSON {error:"db_error"} on DB error.
 *
 * DDD Layer: interface — db injected by server.ts (no getDb() here).
 * Imports ONLY from reputationStore (infrastructure/db) — no domain imports.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";
import {
  getLatestReputationSnapshot,
  getReputationHistory,
} from "../../../infrastructure/db/reputationStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Risk-level bucket counts. All 4 buckets always present. */
export interface ByRiskCounts {
  safe: number;
  watch: number;
  warning: number;
  danger: number;
}

/** Summary block for the full snapshot universe. */
export interface ReputationSummary {
  total: number;
  avgScore: number | null;
  byRisk: ByRiskCounts;
}

/** One leaderboard entry (already ordered by the store query). */
export interface LeaderboardEntry {
  code: string;
  score: number;
  trend: string;
  riskLevel: string;
}

/** Ascending date+score pairs for a single ticker's sparkline. */
export interface HistoryEntry {
  date: string;
  score: number;
}

/** Map from ticker code to ascending history array. */
export type HistoryMap = Record<string, HistoryEntry[]>;

/** Full response body for GET /api/reputation. */
export interface ReputationResponse {
  generatedAt: string;
  asOf: string | null;
  summary: ReputationSummary;
  leaderboard: LeaderboardEntry[];
  history: HistoryMap;
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler orchestration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Orchestrate the GET /api/reputation response.
 * Called by the HTTP handler with an injected DB instance.
 * NO SQL here — all DB access goes through store functions.
 *
 * @param db - SQLite database instance (injected by server.ts — NO getDb() here)
 * @returns ReputationResponse object (caller serialises to JSON)
 */
export function handleGetReputation(db: Database): ReputationResponse {
  const generatedAt = new Date().toISOString();

  const snapshot = getLatestReputationSnapshot(db);

  // Empty-state guard — do NOT throw when table has no rows.
  if (snapshot.length === 0) {
    return {
      generatedAt,
      asOf: null,
      summary: {
        total: 0,
        avgScore: null,
        byRisk: { safe: 0, watch: 0, warning: 0, danger: 0 },
      },
      leaderboard: [],
      history: {},
    };
  }

  const asOf = snapshot[0]!.date;

  // summary.total
  const total = snapshot.length;

  // summary.avgScore — mean rounded to 2dp
  const scoreSum = snapshot.reduce((acc, r) => acc + r.score, 0);
  const avgScore = Math.round((scoreSum / total) * 100) / 100;

  // summary.byRisk — init all 4 buckets, increment, ignore unexpected values
  const byRisk: ByRiskCounts = { safe: 0, watch: 0, warning: 0, danger: 0 };
  for (const r of snapshot) {
    const level = r.riskLevel as keyof ByRiskCounts;
    if (level in byRisk) {
      byRisk[level]++;
    }
    // ANY unexpected value is silently ignored — never crash
  }

  // leaderboard — already ordered score DESC, code ASC by store query
  const leaderboard: LeaderboardEntry[] = snapshot.map((r) => ({
    code: r.code,
    score: r.score,
    trend: r.trend,
    riskLevel: r.riskLevel,
  }));

  // history — group getReputationHistory() into { [code]: [{date, score}...] } ascending date
  const historyRows = getReputationHistory(db);
  const history: HistoryMap = {};
  for (const r of historyRows) {
    if (!history[r.code]) {
      history[r.code] = [];
    }
    history[r.code]!.push({ date: r.date, score: r.score });
  }

  return {
    generatedAt,
    asOf,
    summary: { total, avgScore, byRisk },
    leaderboard,
    history,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle GET /api/reputation.
 * Only GET is served; other methods → 405 Method Not Allowed.
 *
 * @param req - Incoming HTTP request
 * @param res - HTTP response
 * @param db  - SQLite database instance (injected by server.ts)
 */
export function handleGetReputationHttp(
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
    const body = handleGetReputation(db);
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
