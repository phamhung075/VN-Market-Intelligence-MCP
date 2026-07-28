/**
 * Morning Briefing — Step 3: top 5 stories since midnight GMT+7.
 *
 * Extracted from assembleBriefing.ts _assembleBriefingImpl (FACTORY-APP-split-assembleBriefing).
 *
 * Layer: application/usecases/briefing — pure query, no side effects.
 */
import type { Database } from "bun:sqlite";
import type { TopStory } from "./types.js";

interface RagRow {
  source_title: string | null;
  level: string;
  sentiment: string | null;
  impact_score: number | null;
}

/**
 * Query top 5 rag_analyses since `midnight`, sorted by impact_score DESC.
 *
 * @param db       - Active SQLite Database.
 * @param midnight - ISO 8601 midnight-Vietnam-as-UTC boundary (shared with queryNewReports).
 */
export function queryTopStories(db: Database, midnight: string): TopStory[] {
  const ragRows = db
    .prepare<RagRow, [string]>(`
      SELECT source_title, level, sentiment, impact_score
      FROM rag_analyses
      WHERE created_at >= ?
      ORDER BY impact_score DESC
      LIMIT 5
    `)
    .all(midnight);

  return ragRows.map((row) => ({
    title: row.source_title ?? "(no title)",
    level: row.level,
    sentiment: row.sentiment ?? "neutral",
    impactScore: row.impact_score ?? 0,
  }));
}
