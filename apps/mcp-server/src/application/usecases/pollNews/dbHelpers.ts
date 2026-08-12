/**
 * DB helpers — Poll News (split via FACTORY-APP-split-pollNews)
 * size-justification: 185L — tryInsertEntry() carries a genuine
 * data_env-column try/catch fallback (two near-identical 20-column INSERT
 * statements — production path + pre-migration-schema path, see fredApi.ts
 * precedent cited inline) that cannot be deduplicated without losing the
 * graceful-degradation behaviour; the other 3 helpers are small and kept
 * co-located as the same "SQLite access for one poll cycle" concern.
 *
 * SQLite read/write helpers used by the poll cycle: title-fingerprint
 * duplicate detection, the tryInsertEntry() INSERT-OR-IGNORE + dedup path,
 * and the watchlist loader.
 *
 * Split out of pollNews.ts (FACTORY-APP-split-pollNews, staged god-file
 * split). `isTitleDuplicate`/`tryInsertEntry`/`loadWatchlist` are internal
 * helpers (imported, not re-exported, by pollNews.ts — no external callers
 * today). `titleFingerprint` is exported for direct unit testing even
 * though its only production caller is `isTitleDuplicate` in this file.
 *
 * Layer: application/usecases — may import from domain/ and infrastructure/.
 */

import type { Database } from "bun:sqlite";
import type { WatchlistEntry } from "../../../domain/services/cascadeEngine.js";
import { normalizeNews } from "../../../domain/services/newsNormalizer.js";
import { logger } from "../../../infrastructure/logger.js";
import { currentDataEnv } from "../../../infrastructure/envCheck.js";

/**
 * Compute a short title fingerprint: first 50 characters, lowercase, whitespace-normalised.
 * Used for title-based deduplication to catch identical stories published under
 * slightly different URLs (e.g. pagination parameters, tracking suffixes).
 */
export function titleFingerprint(title: string): string {
  return title.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 50);
}

/**
 * Returns true if a similar title (matching the first 50 chars) was already
 * stored in rag_analyses within the past 24 hours.
 * This catches re-published stories that differ only in URL.
 */
export function isTitleDuplicate(db: Database, title: string): boolean {
  if (!title || title.trim().length === 0) return false;
  const fp = titleFingerprint(title);
  if (fp.length < 10) return false; // too short to be meaningful

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const row = db
    .prepare(
      `SELECT 1 FROM rag_analyses
       WHERE LOWER(SUBSTR(REPLACE(source_title, '  ', ' '), 1, 50)) = ?
         AND created_at >= ?
       LIMIT 1`,
    )
    .get(fp, cutoff);
  return row != null;
}

/**
 * Attempt to insert one AnalysisEntry into rag_analyses.
 * Uses INSERT OR IGNORE (URL dedup) + title fingerprint dedup (24 h window).
 * Title dedup is only applied when the entry has a non-empty URL — empty-URL
 * items use a different storage path and must remain insertable on every call
 * (they have no URL uniqueness constraint to rely on).
 * Returns true if inserted, false if duplicate.
 */
export function tryInsertEntry(
  db: Database,
  entry: ReturnType<typeof normalizeNews>,
): boolean {
  // Guard: createdAt must be a non-empty ISO 8601 string.
  // normalizeNews() always sets this via new Date().toISOString(), but a defensive
  // check prevents silent row drops if a code path ever passes undefined.
  if (!entry.createdAt) {
    logger.warn("[tryInsertEntry] entry.createdAt is missing — substituting current UTC time", {
      entryId: entry.id,
      sourceUrl: entry.sourceUrl,
    });
    entry.createdAt = new Date().toISOString();
  }

  // Title-based dedup: only when entry has a URL (skip for no-URL items to
  // preserve the existing behaviour that empty-URL articles are always inserted)
  if (entry.sourceUrl && isTitleDuplicate(db, entry.sourceTitle)) {
    return false;
  }

  // Attempt insert with data_env first (production path); fall back without it
  // if the column does not yet exist (test in-memory DBs, pre-migration schemas).
  // Pattern mirrors fredApi.ts:188-211.
  let result: import("bun:sqlite").Changes | undefined;
  try {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO rag_analyses
        (id, created_at, level, source_url, source_title, source_type,
         published_at, sentiment, impact_score, impact_direction, confidence,
         time_horizon, summary, reasoning, affected_countries, affected_domains,
         affected_actions, parent_ids, tags, embedding_text, data_env)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
    `);
    result = stmt.run(
      entry.id,
      entry.createdAt,
      entry.level,
      entry.sourceUrl || null,          // NULL for empty URLs (partial index exemption)
      entry.sourceTitle,
      entry.sourceType,
      entry.publishedAt,
      entry.sentiment,
      entry.impactScore,
      entry.impactDirection,
      entry.confidence,
      entry.timeHorizon,
      entry.summary,
      entry.reasoning,
      JSON.stringify(entry.affectedCountries),
      JSON.stringify(entry.affectedDomains),
      JSON.stringify(entry.affectedActions),
      JSON.stringify(entry.parentIds),
      JSON.stringify(entry.tags),
      currentDataEnv(),
    );
  } catch (colErr: unknown) {
    const msg = colErr instanceof Error ? colErr.message : String(colErr);
    if (!msg.includes("data_env")) throw colErr; // re-throw unrelated errors
    // Fallback: insert without data_env for pre-migration schemas
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO rag_analyses
        (id, created_at, level, source_url, source_title, source_type,
         published_at, sentiment, impact_score, impact_direction, confidence,
         time_horizon, summary, reasoning, affected_countries, affected_domains,
         affected_actions, parent_ids, tags, embedding_text)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    `);
    result = stmt.run(
      entry.id,
      entry.createdAt,
      entry.level,
      entry.sourceUrl || null,
      entry.sourceTitle,
      entry.sourceType,
      entry.publishedAt,
      entry.sentiment,
      entry.impactScore,
      entry.impactDirection,
      entry.confidence,
      entry.timeHorizon,
      entry.summary,
      entry.reasoning,
      JSON.stringify(entry.affectedCountries),
      JSON.stringify(entry.affectedDomains),
      JSON.stringify(entry.affectedActions),
      JSON.stringify(entry.parentIds),
      JSON.stringify(entry.tags),
    );
  }

  // bun:sqlite RunResult.changes is 1 when a row was inserted, 0 when ignored
  return (result?.changes ?? 0) > 0;
}

/**
 * Load the current watchlist from DB as WatchlistEntry[].
 */
export function loadWatchlist(db: Database): WatchlistEntry[] {
  const rows = db
    .prepare(`SELECT code as actionCode, domain, exchange FROM watchlist`)
    .all() as WatchlistEntry[];
  return rows;
}
