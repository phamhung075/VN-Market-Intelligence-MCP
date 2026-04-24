/**
 * Task 065 — Historical Pattern Matcher
 *
 * Queries `rag_analyses` for historical precedents of an event affecting a
 * specific stock. Returns a `PatternSummary` with aggregate statistics, or
 * `null` when zero matching rows are found.
 *
 * DDD layer: application (orchestrates SQLite infrastructure, no domain imports)
 */

import type { Database } from "bun:sqlite";
import { getDb } from "../../infrastructure/db/schema.js";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface Precedent {
  /** ISO timestamp from created_at */
  date: string;
  /** source_title */
  headline: string;
  /** impact_score 0–10 */
  impactScore: number;
  impactDirection: "up" | "down" | "neutral";
}

export interface PatternSummary {
  stockCode: string;
  eventKeyword: string;
  precedents: Precedent[];
  /**
   * Arithmetic mean of all `impact_score` values (scale 0–10).
   * Note: returned as-is, not converted to %.
   */
  avgImpactPct: number;
  /** Most frequently occurring impact_direction. Tie-break: up > neutral > down */
  dominantDirection: "up" | "down" | "neutral";
  lookbackHours: number;
  /** ISO timestamp when this summary was generated */
  generatedAt: string;
}

// ── Internal row type ─────────────────────────────────────────────────────────

interface RagRow {
  id: string;
  created_at: string;
  source_title: string | null;
  impact_score: number | null;
  impact_direction: string | null;
}

// ── Core function ─────────────────────────────────────────────────────────────

/**
 * Query rag_analyses for historical precedents of an event affecting a stock.
 *
 * Returns null (never throws) when zero precedents are found.
 * Applies LIMIT 100 — uses the 100 most recent precedents only.
 *
 * The `affected_actions` column stores a JSON array string (e.g. `["GAS","PVD"]`).
 * The LIKE pattern `%"GAS"%` (with surrounding quotes) ensures exact token matching,
 * preventing false positives such as `"GASC"` matching a `"GAS"` query.
 *
 * @param stockCode      Stock ticker, e.g. "GAS"
 * @param eventKeyword   Event text to match in source_title or summary
 * @param lookbackHours  Hours to look back (default 168 = 1 week; 0 = no limit)
 * @param db             SQLite instance; defaults to getDb() if omitted
 */
export async function getPatternSummary(
  stockCode: string,
  eventKeyword: string,
  lookbackHours: number = 168,
  db?: Database,
): Promise<PatternSummary | null> {
  const database = db ?? getDb();

  // Compute lower bound timestamp
  // lookbackHours === 0 means no time constraint
  const lowerBound =
    lookbackHours === 0
      ? "1970-01-01T00:00:00.000Z"
      : new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();

  // Parameterised LIKE patterns (never string-interpolated into SQL)
  // Surrounding quotes in stockPattern prevent partial-code false positives
  const stockPattern = `%"${stockCode}"%`;
  const keywordPattern = `%${eventKeyword}%`;

  const rows = database
    .query<RagRow, [string, string, string, string]>(
      `SELECT id, created_at, source_title, impact_score, impact_direction
       FROM rag_analyses
       WHERE created_at >= ?
         AND affected_actions LIKE ?
         AND (source_title LIKE ? OR summary LIKE ?)
       ORDER BY created_at DESC
       LIMIT 100`,
    )
    .all(lowerBound, stockPattern, keywordPattern, keywordPattern);

  if (rows.length === 0) {
    return null;
  }

  const precedents: Precedent[] = rows.map((row) => ({
    date: row.created_at,
    headline: row.source_title ?? "",
    impactScore: row.impact_score ?? 0,
    impactDirection: normaliseDirection(row.impact_direction),
  }));

  const avgImpactPct = computeAvgImpact(precedents);
  const dominantDirection = computeDominantDirection(precedents);

  return {
    stockCode,
    eventKeyword,
    precedents,
    avgImpactPct,
    dominantDirection,
    lookbackHours,
    generatedAt: new Date().toISOString(),
  };
}

// ── Pure helpers ───────────────────────────────────────────────────────────────

/**
 * Normalise raw DB value to the canonical direction union.
 * NULL, empty string, or unrecognised values → "neutral".
 */
function normaliseDirection(raw: string | null): "up" | "down" | "neutral" {
  if (raw === "up") return "up";
  if (raw === "down") return "down";
  return "neutral";
}

/**
 * Arithmetic mean of all `impactScore` values.
 */
function computeAvgImpact(precedents: Precedent[]): number {
  if (precedents.length === 0) return 0;
  const total = precedents.reduce((sum, p) => sum + p.impactScore, 0);
  return total / precedents.length;
}

/**
 * Most frequently occurring `impactDirection`.
 * Tie-break rule (bullish bias): up > neutral > down.
 */
function computeDominantDirection(
  precedents: Precedent[],
): "up" | "down" | "neutral" {
  const counts: Record<"up" | "down" | "neutral", number> = {
    up: 0,
    down: 0,
    neutral: 0,
  };

  for (const p of precedents) {
    counts[p.impactDirection]++;
  }

  // Tie-break: up > neutral > down
  if (counts.up >= counts.neutral && counts.up >= counts.down) return "up";
  if (counts.neutral >= counts.down) return "neutral";
  return "down";
}
