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
 * FIX-ERRAUDIT-W2-MCP-DATALAYER: uses safeQuery to discriminate db-error from
 * genuine no-rows. DB error → returns { ok:false, reason:'db-error' } logged via
 * failLoud. Genuine no-rows → returns { ok:false, reason:'no-rows' }. Both return
 * undefined to callers so the IMF dimension is DROPPED, not faked as neutral (0).
 *
 * Layer: application/services
 *   - Imports domain/services (pure classifier) — allowed
 *   - Imports domain/models (types) — allowed
 *   - Imports domain/utils/safeQuery — allowed (domain/utils is domain-layer)
 *   - Does NOT import interface/ — DDD rule
 *   - Does NOT call getDb() — ports pattern: db instance is injected by caller
 *
 * @module application/services/imfConvictionBridge
 */

import type { Database } from "bun:sqlite";
import { classifyImfIndicators } from "../../domain/services/imfDataClassifier.js";
import type { ImfIndicator } from "../../domain/models/imfIndicators.js";
import { IMF_HISTORICAL_BASELINE } from "../../domain/models/imfIndicators.js";
import { safeQuery } from "../../domain/utils/safeQuery.js";

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
 * FIX-ERRAUDIT-W2-MCP-DATALAYER: returns undefined (drop-dimension) instead of 0
 * on DB error or genuine no-rows, so callers can omit the IMF dimension entirely
 * rather than injecting a fabricated neutral score.
 *
 * Returns undefined when:
 *   - Any DB error (fail-loud via safeQuery/failLoud, then drop-dimension)
 *   - Table is empty or all rows stale (genuine no-rows — legit-empty path)
 *
 * Returns number (sentiment in [-1, +1]) when fresh rows exist and classify successfully.
 *
 * @param db - SQLite Database instance (injectable for tests — ports pattern)
 * @returns sentiment score in [-1, +1], or undefined if dimension unavailable
 */
export function getImfMacroScoreForConviction(db: Database): number | undefined {
  const result = safeQuery<ImfIndicatorRow>(
    db,
    `SELECT code, name, value, published_at, age_in_days,
            prev_value, yoy_change, source, confidence, fetched_at
       FROM imf_indicators
      WHERE fetched_at >= datetime('now', ? || ' hours')
      ORDER BY fetched_at DESC`,
    [`-${IMF_STALENESS_HOURS}`],
    "imfConvictionBridge.getImfMacroScoreForConviction",
  );

  // Both db-error and genuine no-rows → drop dimension (never fabricate 0/neutral)
  if (!result.ok) return undefined;

  const indicators: ImfIndicator[] = result.rows.map((row) => ({
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

  const classification = classifyImfIndicators({
    indicators,
    historicalBaseline: IMF_HISTORICAL_BASELINE,
  });

  return classification.sentiment;
}
