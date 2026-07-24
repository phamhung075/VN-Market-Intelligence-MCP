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
import { isPlausibleIndicatorValue } from "./indicatorPlausibility.js";

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
  // FIX-DOWJONES-STALE-WRONG-VALUE: dow_jones news-mining REMOVED (matches the
  // brent_crude_usd precedent above — backlog 921). The loose "dow ... to/at/
  // hit/near ####" pattern was picking up wrong numbers from RSS article text
  // (observed in production tracked_indicators: 10604, 23750, 23807, 48221,
  // 76848 — all within the same week, real DJIA never moved like that). A
  // single-source-of-truth live fetch (Yahoo Finance ^DJI) now feeds
  // tracked_indicators instead — see infrastructure/fetchers/yahooFinance.ts
  // fetchDowJonesIndex()/storeDowJonesIndex(), wired into
  // commodityTrackerRefreshJob.ts. Both this file and that mirror path run
  // every dow_jones value through the shared isPlausibleIndicatorValue() gate
  // (indicatorPlausibility.ts) before a write — an out-of-band value is
  // rejected, never served silently (report 3237).
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

    // Sanity check: reject obviously wrong values. FIX-DOWJONES-STALE-WRONG-VALUE:
    // moved to the shared indicatorPlausibility.ts gate (was a local, one-off
    // MIN_VALUES/MAX_VALUES pair here) so EVERY writer of tracked_indicators —
    // this regex-extraction path AND yahooFinance.ts's live-API mirror path —
    // enforces the SAME band per indicator, generically, not a duplicated /
    // divergent one-off per writer.
    if (!isPlausibleIndicatorValue(pattern.indicator, value)) continue;

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

// ─────────────────────────────────────────────────────────────────────────────
// DSI-MACRO-PHANTOM-STALE-GUARD: staleness threshold for news-mined indicators
//
// News-mined prices (WTI, dow_jones, etc.) can cite historical prices from
// articles published days ago. A row with extracted_at=now may carry a price
// from a 2-month-old article. We treat any row whose extracted_at is older
// than TRACKED_INDICATOR_STALE_MS as stale and must NOT serve it as current.
//
// 4 hours = macro refresh job cadence. If a news article hasn't mentioned the
// indicator within 4h, assume the value is not representative of current market.
// ─────────────────────────────────────────────────────────────────────────────

/** Staleness threshold for news-mined price indicators: 4 hours. */
export const TRACKED_INDICATOR_STALE_MS = 4 * 60 * 60 * 1000;

/**
 * Returns all unique tracked indicators with their latest value + isStale flag.
 *
 * DSI-MACRO-PHANTOM-STALE-GUARD: each result carries isStale=true when
 * lastSeen is older than TRACKED_INDICATOR_STALE_MS (4 hours). Consumers
 * MUST surface or suppress stale values — never serve them as "current".
 *
 * @param db - SQLite Database instance (injected for testability)
 * @returns Array of { indicator, value, unit, lastSeen, dataPoints, isStale }
 */
export function listTrackedIndicatorsFromDb(db: import("bun:sqlite").Database): {
  indicator: string;
  value: number;
  unit: string;
  lastSeen: string;
  dataPoints: number;
  isStale: boolean;
}[] {
  const rows = db
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
    .all();

  const now = Date.now();
  return rows.map((r) => {
    const ageMs = now - new Date(r.last_seen).getTime();
    return {
      indicator: r.indicator,
      value: r.value,
      unit: r.unit,
      lastSeen: r.last_seen,
      dataPoints: r.cnt,
      isStale: ageMs >= TRACKED_INDICATOR_STALE_MS,
    };
  });
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
