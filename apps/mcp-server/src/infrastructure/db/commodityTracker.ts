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
import { currentDataEnv } from "../envCheck.js";

// ─────────────────────────────────────────────────────────────────────────────
// Schema note (Task 1039)
// ─────────────────────────────────────────────────────────────────────────────
// The `tracked_indicators` table DDL lives canonically in
// src/infrastructure/db/schema.ts:initDatabase() (Task 1039 dedup, code-janitor
// finding 2026-04-08). The local lazy `ensureTable()` helper that used to live
// here was removed because it duplicated the schema and risked drift on column
// changes. initDatabase() runs at process boot before any commodityTracker call,
// so the table is guaranteed to exist by the time we read or write here.

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
  /**
   * If true, this indicator is country-specific (CPI, GDP, interest rate).
   * Only extract from VN news sources or when text mentions Vietnam context.
   * Prevents "US inflation 4.3%" from being stored as VN inflation.
   */
  countrySpecific?: boolean;
}

/**
 * Patterns to auto-extract commodity/indicator prices from news text.
 * Ordered by specificity (most specific first).
 */
const EXTRACTION_PATTERNS: ExtractionPattern[] = [
  // Sprint 052 / backlog 921: Brent extraction from news is REMOVED.
  // yahooFinance.ts now mirrors snapshot.brentCrudeUSD into market_prices('BRENT')
  // and is the single source of truth. News-mined brent values were drifting
  // $3+ above the live yahoo price (signal #509 case) because they captured
  // article-quoted spot prices, not the current futures bid.
  // WTI is still extracted from news because no live fetcher covers it.
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

  // Inflation / CPI — country-specific: only extract from VN sources or VN-context text
  { regex: /(?:cpi|inflation rate|lạm phát)[\s\S]{0,30}?([\d.]+)\s*%/i, indicator: "inflation_pct", unit: "%", countrySpecific: true },

  // GDP — country-specific, tightened to require Vietnamese context IMMEDIATELY
  // adjacent to "GDP". Removed English "gdp growth rate" branch (report #1102:
  // oscillation 2↔10 persisted because VN news articles discussing both US and
  // VN GDP matched the English branch). Negative lookahead excludes foreign
  // country names (Mỹ, Trung Quốc, Nhật, Hàn, EU, US, China, etc.) appearing
  // right after "GDP" to prevent "tăng trưởng GDP Mỹ 2%" contamination.
  { regex: /(?:gdp\s+(?:việt|vn|quốc\s*nội)|tăng\s+trưởng\s+gdp(?!\s*(?:mỹ|trung|nhật|hàn|eu|us|china|ấn|anh|pháp|đức|nga|úc|thế\s*giới|toàn\s*cầu)))[\s\S]{0,30}?([\d.]+)\s*%/i, indicator: "gdp_growth_pct", unit: "%", countrySpecific: true },

  // Interest rate — country-specific
  { regex: /(?:interest rate|lãi suất|fed funds rate|policy rate)[\s\S]{0,20}?([\d.]+)\s*%/i, indicator: "interest_rate_pct", unit: "%", countrySpecific: true },

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
/** Vietnamese news sources — country-specific indicators are safe to extract from these. */
const VN_SOURCES = new Set(["cafef", "vnexpress", "vneconomy"]);

/** Keywords that indicate the text is about Vietnam (case-insensitive check). */
const VN_CONTEXT_RE = /\b(?:vi[eệ]t\s*nam|vn-index|vnindex|hose|hnx|upcom|sbv|ngân hàng nhà nước|bộ tài chính|tổng cục thống kê)\b/i;

export function extractAndStoreIndicators(
  text: string,
  source: string,
): ExtractedIndicator[] {
  const extracted: ExtractedIndicator[] = [];
  const seen = new Set<string>();

  // Pre-compute VN context check once per text
  const isVnSource = VN_SOURCES.has(source);
  const hasVnContext = isVnSource || VN_CONTEXT_RE.test(text);

  for (const pattern of EXTRACTION_PATTERNS) {
    // Country-specific indicators: skip if text is not about Vietnam
    if (pattern.countrySpecific && !hasVnContext) continue;

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
      interest_rate_pct: 0.1, // Base rates never below 0.1%
      inflation_pct: 0,
      gdp_growth_pct: -20,
      natgas_usd_mmbtu: 0.5,
      soybean_usd_bushel: 5,
      coffee_usd: 0.5,
    };
    const MAX_VALUES: Record<string, number> = {
      interest_rate_pct: 15,  // Base/policy rates never above 15%
      inflation_pct: 30,      // CPI never above 30%
      gdp_growth_pct: 20,     // GDP growth never above 20%
      brent_crude_usd: 300,
      wti_crude_usd: 300,
      gold_usd_oz: 10000,
      natgas_usd_mmbtu: 30,
      wheat_usd_bushel: 20,
      soybean_usd_bushel: 30,
      copper_usd: 20,
      coffee_usd: 500,
    };
    const minVal = MIN_VALUES[pattern.indicator];
    if (minVal !== undefined && value < minVal) continue;
    const maxVal = MAX_VALUES[pattern.indicator];
    if (maxVal !== undefined && value > maxVal) continue;

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
      const db = getDb();
      const now = new Date().toISOString();
      const dataEnv = currentDataEnv();
      const stmt = db.prepare(
        `INSERT INTO tracked_indicators (indicator, value, unit, source, extracted_at, data_env)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );

      const insertAll = db.transaction((items: ExtractedIndicator[]) => {
        for (const item of items) {
          stmt.run(item.indicator, item.value, item.unit, source, now, dataEnv);
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
