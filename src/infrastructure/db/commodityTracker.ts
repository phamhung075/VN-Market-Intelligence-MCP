/**
 * Infrastructure — Commodity Auto-Tracker
 *
 * Extracts commodity/indicator prices from news text (TE stream, RSS)
 * and stores them in a dedicated `tracked_indicators` table.
 *
 * Auto-discovers new indicators: when a news item mentions a commodity
 * price (e.g., "Wheat $6.1/bushel", "Brent $107/bbl"), it stores the
 * value with a timestamp. Over time, this builds a historical dataset
 * for any commodity/indicator mentioned in the news — without needing
 * a dedicated API per indicator.
 *
 * The σ-based macro threshold system can then use this data for
 * rolling mean/stdDev calculations on ANY tracked indicator.
 *
 * Layer: infrastructure/db — reads/writes SQLite.
 */

import { getDb } from "./schema.js";
import { logger } from "../logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ensures the `tracked_indicators` table exists.
 * Called lazily on first use.
 */
let _tableCreated = false;

function ensureTable(): void {
  if (_tableCreated) return;
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS tracked_indicators (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      indicator    TEXT NOT NULL,
      value        REAL NOT NULL,
      unit         TEXT NOT NULL DEFAULT '',
      source       TEXT NOT NULL DEFAULT '',
      extracted_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tracked_ind_name_time
      ON tracked_indicators(indicator, extracted_at DESC);
  `);
  _tableCreated = true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Price extraction patterns
// ─────────────────────────────────────────────────────────────────────────────

interface ExtractionPattern {
  /** Regex to find the price mention. Group 1 = value. */
  regex: RegExp;
  /** Indicator name to store as. */
  indicator: string;
  /** Unit label. */
  unit: string;
}

/**
 * Patterns to auto-extract commodity/indicator prices from news text.
 * Ordered by specificity (most specific first).
 */
const EXTRACTION_PATTERNS: ExtractionPattern[] = [
  // Oil — flexible pattern: any context mentioning brent/crude + $NUMBER + /bbl or barrel
  { regex: /(?:brent|crude oil?)[\s\S]{0,40}?\$\s*([\d,.]+)\s*(?:\/bbl|per barrel|a barrel)/i, indicator: "brent_crude_usd", unit: "$/bbl" },
  { regex: /(?:brent|crude oil?)[\s\S]{0,40}?([\d,.]+)\s*(?:dollars?\s+(?:per|a)\s+barrel)/i, indicator: "brent_crude_usd", unit: "$/bbl" },
  { regex: /(?:wti|us crude)[\s\S]{0,30}?\$\s*([\d,.]+)\s*(?:\/bbl|per barrel)/i, indicator: "wti_crude_usd", unit: "$/bbl" },

  // Gold — flexible: gold + $NUMBER + /oz or ounce
  { regex: /gold[\s\S]{0,30}?\$\s*([\d,.]+)\s*(?:\/oz|per ounce|an ounce)/i, indicator: "gold_usd_oz", unit: "$/oz" },
  { regex: /giá vàng[\s\S]{0,30}?([\d,.]+)\s*(?:USD|triệu)/i, indicator: "gold_usd_oz", unit: "$/oz" },

  // Wheat / Grains — flexible
  { regex: /wheat[\s\S]{0,30}?\$\s*([\d,.]+)\s*(?:\/bushel|per bushel|a bushel)/i, indicator: "wheat_usd_bushel", unit: "$/bushel" },
  { regex: /wheat[\s\S]{0,30}?([\d,.]+)\s*(?:dollars?\s+per\s+bushel)/i, indicator: "wheat_usd_bushel", unit: "$/bushel" },
  { regex: /(?:soybean|soybeans)[\s\S]{0,30}?([\d,.]+)\s*(?:dollars?\s+per\s+bushel|\$[\s\S]*?\/bushel)/i, indicator: "soybean_usd_bushel", unit: "$/bushel" },
  { regex: /corn[\s\S]{0,30}?\$\s*([\d,.]+)\s*(?:\/bushel|per bushel)/i, indicator: "corn_usd_bushel", unit: "$/bushel" },

  // Copper
  { regex: /copper[\s\S]{0,30}?\$\s*([\d,.]+)\s*(?:\/lb|per pound|\/ton|per ton)/i, indicator: "copper_usd", unit: "$/unit" },

  // Natural gas
  { regex: /natural gas[\s\S]{0,30}?\$\s*([\d,.]+)\s*(?:\/mmbtu|per mmbtu)/i, indicator: "natgas_usd_mmbtu", unit: "$/MMBtu" },

  // Rice (Vietnam relevant)
  { regex: /(?:rice|gạo)[\s\S]{0,30}?\$\s*([\d,.]+)\s*(?:\/ton|per ton)/i, indicator: "rice_usd_ton", unit: "$/ton" },

  // Coffee (Vietnam #2 producer)
  { regex: /(?:coffee|robusta|cà phê)[\s\S]{0,30}?\$?\s*([\d,.]+)\s*(?:\/ton|per ton|\/lb)/i, indicator: "coffee_usd", unit: "$/unit" },

  // Rubber (Vietnam top 3)
  { regex: /(?:rubber|cao su)[\s\S]{0,20}?([\d,.]+)\s*(?:\/kg|per kg|yen|JPY)/i, indicator: "rubber_price", unit: "unit" },

  // Inflation / CPI
  { regex: /(?:cpi|inflation rate|lạm phát)[\s\S]{0,30}?([\d.]+)\s*%/i, indicator: "inflation_pct", unit: "%" },

  // GDP
  { regex: /gdp[\s\S]{0,20}?([\d.]+)\s*%/i, indicator: "gdp_growth_pct", unit: "%" },

  // Interest rate
  { regex: /(?:interest rate|lãi suất|fed funds rate|policy rate)[\s\S]{0,20}?([\d.]+)\s*%/i, indicator: "interest_rate_pct", unit: "%" },

  // Stock indices — must match 4+ digit numbers (indices are 1000+), skip percentages
  { regex: /s&p\s*500[\s\S]{0,40}?(?:to|at|hit|near)\s+([\d,]{4,}(?:\.\d+)?)/i, indicator: "sp500", unit: "points" },
  { regex: /(?:dow jones|dow)[\s\S]{0,40}?(?:to|at|hit|near)\s+([\d,]{4,}(?:\.\d+)?)/i, indicator: "dow_jones", unit: "points" },
  { regex: /nasdaq[\s\S]{0,40}?(?:to|at|hit|near)\s+([\d,]{4,}(?:\.\d+)?)/i, indicator: "nasdaq", unit: "points" },
  { regex: /(?:vn-index|vnindex)[\s\S]{0,30}?(?:to|at|đạt|lên|về)\s+([\d,]{4,}(?:\.\d+)?)/i, indicator: "vnindex", unit: "points" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/** A single extracted indicator value. */
export interface ExtractedIndicator {
  indicator: string;
  value: number;
  unit: string;
}

/**
 * Extracts commodity/indicator prices from text and stores them.
 *
 * @param text   - News text to scan for prices
 * @param source - Source identifier (e.g. "tradingeconomics", "cafef")
 * @returns Array of extracted indicators
 */
export function extractAndStoreIndicators(
  text: string,
  source: string,
): ExtractedIndicator[] {
  const extracted: ExtractedIndicator[] = [];
  const seen = new Set<string>();

  for (const pattern of EXTRACTION_PATTERNS) {
    const match = text.match(pattern.regex);
    if (!match || !match[1]) continue;
    if (seen.has(pattern.indicator)) continue; // one per indicator per text

    const rawValue = match[1].replace(/,/g, "");
    const value = parseFloat(rawValue);
    if (isNaN(value) || value <= 0) continue;

    // Sanity check: reject obviously wrong values
    const MIN_VALUES: Record<string, number> = {
      gold_usd_oz: 500,       // Gold never below $500
      brent_crude_usd: 20,    // Brent never below $20
      wti_crude_usd: 20,
      sp500: 1000,            // S&P never below 1000
      dow_jones: 10000,       // Dow never below 10000
      nasdaq: 5000,           // Nasdaq never below 5000
      vnindex: 500,           // VN-Index never below 500
      wheat_usd_bushel: 3,
      copper_usd: 1,
    };
    const minVal = MIN_VALUES[pattern.indicator];
    if (minVal !== undefined && value < minVal) continue;

    seen.add(pattern.indicator);
    extracted.push({
      indicator: pattern.indicator,
      value,
      unit: pattern.unit,
    });
  }

  // Store to DB
  if (extracted.length > 0) {
    try {
      ensureTable();
      const db = getDb();
      const now = new Date().toISOString();
      const stmt = db.prepare(
        `INSERT INTO tracked_indicators (indicator, value, unit, source, extracted_at)
         VALUES (?, ?, ?, ?, ?)`,
      );

      const insertAll = db.transaction((items: ExtractedIndicator[]) => {
        for (const item of items) {
          stmt.run(item.indicator, item.value, item.unit, source, now);
        }
      });
      insertAll(extracted);

      logger.debug("[commodityTracker] stored indicators", {
        count: extracted.length,
        indicators: extracted.map((e) => `${e.indicator}=${e.value}`),
      });
    } catch (err) {
      logger.warn("[commodityTracker] failed to store", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return extracted;
}

/**
 * Returns rolling history for a tracked indicator.
 *
 * @param indicator - Indicator name (e.g. "brent_crude_usd")
 * @param limit     - Max rows to return (default: 30)
 * @returns Array of { value, extracted_at } ordered by time DESC
 */
export function getIndicatorHistory(
  indicator: string,
  limit = 30,
): { value: number; extractedAt: string }[] {
  try {
    ensureTable();
    const db = getDb();
    return db
      .query<{ value: number; extracted_at: string }, [string, number]>(
        `SELECT value, extracted_at
         FROM tracked_indicators
         WHERE indicator = ?
         ORDER BY extracted_at DESC
         LIMIT ?`,
      )
      .all(indicator, limit)
      .map((r) => ({ value: r.value, extractedAt: r.extracted_at }));
  } catch {
    return [];
  }
}

/**
 * Returns all unique tracked indicators with their latest value.
 *
 * @returns Array of { indicator, value, unit, lastSeen }
 */
export function listTrackedIndicators(): {
  indicator: string;
  value: number;
  unit: string;
  lastSeen: string;
  dataPoints: number;
}[] {
  try {
    ensureTable();
    const db = getDb();
    return db
      .query<
        { indicator: string; value: number; unit: string; last_seen: string; cnt: number },
        []
      >(
        `SELECT indicator, value, unit, extracted_at as last_seen,
                (SELECT COUNT(*) FROM tracked_indicators t2 WHERE t2.indicator = t1.indicator) as cnt
         FROM tracked_indicators t1
         WHERE extracted_at = (
           SELECT MAX(extracted_at) FROM tracked_indicators t3 WHERE t3.indicator = t1.indicator
         )
         GROUP BY indicator
         ORDER BY last_seen DESC`,
      )
      .all()
      .map((r) => ({
        indicator: r.indicator,
        value: r.value,
        unit: r.unit,
        lastSeen: r.last_seen,
        dataPoints: r.cnt,
      }));
  } catch {
    return [];
  }
}
