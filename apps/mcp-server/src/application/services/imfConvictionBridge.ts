/**
 * Application Service — IMF Conviction Bridge (Task 1329f)
 *
 * Reads imf_indicators rows from the DB and converts them to a single
 * macro sentiment score in [-1, +1] for injection into computeConviction().
 *
 * Design contract (NFR-IMF-1):
 *   - computeConviction() stays pure — no I/O, no async.
 *   - This bridge is called by the application/interface layer BEFORE
 *     calling computeConviction(), injecting the result as imfMacroScore.
 *
 * Staleness: rows with fetched_at older than IMF_STALENESS_HOURS are ignored.
 *   Default: 24h (IMF poller runs every 6h — max 1 missed cycle = 12h old).
 *   Configurable: Bun.env.IMF_STALENESS_HOURS (Architect decision Q-IMF-3).
 *
 * Layer: application/services
 *   - Imports domain/services (pure classifier) — allowed
 *   - Imports domain/models (types) — allowed
 *   - Does NOT import interface/ — DDD rule
 *   - Does NOT call getDb() — ports pattern: db instance is injected by caller
 *
 * @module application/services/imfConvictionBridge
 */

import type { Database } from "bun:sqlite";
import { classifyImfIndicators } from "../../domain/services/imfDataClassifier.js";
import type { ImfIndicator } from "../../domain/models/imfIndicators.js";

/** Default staleness window in hours (configurable via env) */
const IMF_STALENESS_HOURS = Number(Bun.env.IMF_STALENESS_HOURS ?? 24);

/** Row shape from imf_indicators table */
interface ImfIndicatorRow {
  code:         string;
  name:         string;
  value:        number;
  published_at: string;
  age_in_days:  number;
  prev_value:   number | null;
  yoy_change:   number | null;
  source:       string;
  confidence:   number;
  fetched_at:   string;
}

/**
 * Reads all imf_indicators rows fetched within the staleness window,
 * runs classifyImfIndicators(), and returns sentiment in [-1, +1].
 *
 * Returns 0 (neutral) when:
 *   - Table is empty
 *   - All rows are stale (fetched_at > IMF_STALENESS_HOURS ago)
 *   - Any DB error (fail-silent per NFR-IMF-3)
 *
 * @param db - SQLite Database instance (injectable for tests — ports pattern)
 * @returns sentiment score in [-1, +1]
 */
export function getImfMacroScoreForConviction(db: Database): number {
  try {
    const rows = db
      .query<ImfIndicatorRow, [string]>(
        `SELECT code, name, value, published_at, age_in_days,
                prev_value, yoy_change, source, confidence, fetched_at
           FROM imf_indicators
          WHERE fetched_at >= datetime('now', ? || ' hours')
          ORDER BY fetched_at DESC`,
      )
      .all(`-${IMF_STALENESS_HOURS}`);

    if (rows.length === 0) return 0;

    const indicators: ImfIndicator[] = rows.map((row) => ({
      code:          row.code,
      name:          row.name,
      value:         row.value,
      publishedAt:   row.published_at,
      ageInDays:     row.age_in_days,
      previousValue: row.prev_value ?? null,
      yoyChange:     row.yoy_change ?? null,
      source:        row.source as "imf_api" | "imf_scrape",
      confidence:    row.confidence,
    }));

    const result = classifyImfIndicators({
      indicators,
      historicalBaseline: 3.0, // IMF global growth baseline (%), consistent with imfIndicatorPollerJob.ts:59
    });

    return result.sentiment;
  } catch {
    // Fail-silent: stale/missing/closed DB → neutral, never throw
    return 0;
  }
}
