/**
 * Infrastructure — Market Sentiment Store (P0-4-MARKET-SENTIMENT-INDEX)
 *
 * Read-only queries on `rag_analyses` table.
 * No writes — NFR-P04-1: tool is READ-ONLY on rag_analyses.
 *
 * The covering index `idx_rag_sentiment_covering` (created in schema-news.ts)
 * makes the 90-day GROUP-BY query an index-only scan — NFR-P04-2.
 *
 * DDD layer: infrastructure/db — may use Database; no domain or application logic.
 *
 * @module infrastructure/db/marketSentimentStore
 */

import type { Database } from "bun:sqlite";
import type { RagAnalysisRow } from "../../domain/services/news-analysis/marketSentimentCalculator.js";

// ---------------------------------------------------------------------------
// Raw DB row shape
// ---------------------------------------------------------------------------

interface RawRagRow {
  sentiment: string | null;
  confidence: number | null;
  impact_score: number | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Store function
// ---------------------------------------------------------------------------

/**
 * Fetch all rag_analyses rows from the last `days` calendar days.
 *
 * Returns ALL rows (not filtered by sentiment) so the caller can handle:
 *   - Valid-sentiment rows for daily score and dispersion computation
 *   - All rows (including null/unexpected sentiment) for article-volume spike
 *
 * Uses the covering index `idx_rag_sentiment_covering` on
 * (created_at DESC, sentiment, confidence, impact_score) — index-only scan.
 *
 * Returns [] on any error (table missing in fresh DBs, etc.).
 *
 * @param db   - SQLite database
 * @param days - Number of calendar days back from today (e.g. 90)
 */
export function getRagRowsForWindow(db: Database, days: number): RagAnalysisRow[] {
  // Compute cutoff: today minus `days` calendar days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10); // YYYY-MM-DD

  const rows = db
    .query<RawRagRow, [string]>(
      `SELECT sentiment, confidence, impact_score, created_at
       FROM   rag_analyses
       WHERE  created_at >= ?
       ORDER BY created_at ASC`,
    )
    .all(cutoffStr);

  return rows.map((r) => ({
    sentiment: r.sentiment,
    confidence: r.confidence,
    impact_score: r.impact_score,
    created_at: r.created_at,
  }));
}
