/**
 * Price-News Validator — Domain Service
 *
 * Core principle: "Tin tức có thể giả nhưng giá phản ánh tất cả"
 *
 * This service cross-validates news sentiment against actual price action.
 * When they diverge, it flags the alert with a warning — because:
 *   - Bullish news + falling price → "smart money" may know something negative
 *   - Bearish news + rising price  → market has already priced in the bad news
 *   - Volume spike + no news       → possible insider activity before announcement
 *
 * Also detects historical pattern parallels from RAG memory:
 *   - "Lần cuối dầu tăng +2σ (03/2022), ngành HK giảm 15% trong 2 tuần"
 *
 * Layer: domain/services — pure logic, no I/O.
 */

import type { SentimentDirection } from "../sentimentClassifier.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Price action summary for a stock. */
export interface PriceAction {
  code: string;
  changePct: number;
  volume: number;
  avgVolume: number;
}

/** News sentiment summary for a stock. */
export interface NewsSentiment {
  code: string;
  direction: SentimentDirection;
  confidence: number;
  articleCount: number;
}

/** Divergence classification. */
export type DivergenceType =
  | "confirmed"           // news and price agree
  | "news_bullish_price_bearish"  // bullish news but price drops → CAUTION
  | "news_bearish_price_bullish"  // bearish news but price rises → may be priced in
  | "volume_no_news"      // volume spike with no news → possible insider activity
  | "no_data";            // insufficient data to compare

/** Result of the price-news validation. */
export interface ValidationResult {
  code: string;
  divergence: DivergenceType;
  /** Vietnamese warning/insight message. */
  insight: string;
  /** Severity: info (confirmed), warn (divergence), alert (strong divergence) */
  severity: "info" | "warn" | "alert";
}

/** Historical parallel found in RAG memory. */
export interface HistoricalParallel {
  /** When it happened. */
  date: string;
  /** What happened. */
  description: string;
  /** What followed (the lesson). */
  outcome: string;
  /** How relevant (0-1). */
  relevance: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Thresholds
// ─────────────────────────────────────────────────────────────────────────────

/** Minimum price change to consider meaningful (filters noise). */
const MIN_PRICE_CHANGE_PCT = 1.0;

/** Minimum sentiment confidence to trust the classification. */
const MIN_SENTIMENT_CONFIDENCE = 0.4;

/** Volume multiplier to consider a "spike" (vs avgVolume). */
const VOLUME_SPIKE_THRESHOLD = 2.0;

// ─────────────────────────────────────────────────────────────────────────────
// Core validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates news sentiment against actual price action for a stock.
 *
 * @param price     - Current price action (changePct, volume)
 * @param sentiment - News sentiment summary (direction, confidence)
 * @returns ValidationResult with divergence type and Vietnamese insight
 */
export function validatePriceNews(
  price: PriceAction,
  sentiment: NewsSentiment | null,
): ValidationResult {
  const code = price.code;

  // Case 1: Volume spike with no/low news coverage
  if (
    sentiment === null ||
    sentiment.articleCount === 0
  ) {
    if (
      price.avgVolume > 0 &&
      price.volume >= price.avgVolume * VOLUME_SPIKE_THRESHOLD
    ) {
      const volRatio = (price.volume / price.avgVolume).toFixed(1);
      return {
        code,
        divergence: "volume_no_news",
        insight: `⚠️ ${code}: KL giao dịch gấp ${volRatio}× TB nhưng không có tin — có thể có thông tin nội bộ chưa công bố`,
        severity: "alert",
      };
    }
    return {
      code,
      divergence: "no_data",
      insight: "",
      severity: "info",
    };
  }

  // Case 2: Sentiment too weak to validate
  if (sentiment.confidence < MIN_SENTIMENT_CONFIDENCE) {
    return {
      code,
      divergence: "no_data",
      insight: "",
      severity: "info",
    };
  }

  const priceUp = price.changePct >= MIN_PRICE_CHANGE_PCT;
  const priceDown = price.changePct <= -MIN_PRICE_CHANGE_PCT;
  const sentimentBull = sentiment.direction === "bullish";
  const sentimentBear = sentiment.direction === "bearish";

  // Case 3: Bullish news but price is falling
  if (sentimentBull && priceDown) {
    return {
      code,
      divergence: "news_bullish_price_bearish",
      insight: `⚠️ ${code}: Tin tức tích cực (${sentiment.articleCount} bài) nhưng giá giảm ${Math.abs(price.changePct).toFixed(1)}% — thị trường không xác nhận, thận trọng`,
      severity: "warn",
    };
  }

  // Case 4: Bearish news but price is rising
  if (sentimentBear && priceUp) {
    return {
      code,
      divergence: "news_bearish_price_bullish",
      insight: `ℹ️ ${code}: Tin tiêu cực (${sentiment.articleCount} bài) nhưng giá tăng ${price.changePct.toFixed(1)}% — thị trường có thể đã chiết khấu tin xấu`,
      severity: "info",
    };
  }

  // Case 5: Confirmed — news and price agree
  if ((sentimentBull && priceUp) || (sentimentBear && priceDown)) {
    return {
      code,
      divergence: "confirmed",
      insight: `✅ ${code}: Giá xác nhận xu hướng tin tức (${sentiment.direction === "bullish" ? "tích cực" : "tiêu cực"})`,
      severity: "info",
    };
  }

  // Case 6: Price flat, no strong signal
  return {
    code,
    divergence: "no_data",
    insight: "",
    severity: "info",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Historical parallel extraction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extracts historical lessons from RAG search results.
 *
 * Looks for entries that match the current macro condition and extracts
 * the outcome/impact data to warn the user about potential repeats.
 *
 * @param ragResults - Search results from RAG retriever
 * @param currentCondition - Description of current macro condition (e.g. "oil +2σ")
 * @returns Array of HistoricalParallel with date, description, outcome
 */
export function extractHistoricalParallels(
  ragResults: { title: string; summary: string; distance: number; tags: string[] }[],
  currentCondition: string,
): HistoricalParallel[] {
  const parallels: HistoricalParallel[] = [];

  for (const result of ragResults) {
    // Only use results with reasonable similarity (distance < 0.8)
    if (result.distance > 0.8) continue;

    const relevance = Math.max(0, 1 - result.distance);

    // Extract date from tags or title
    const dateMatch = result.title.match(/\d{4}[-/]\d{2}[-/]\d{2}/) ||
                      result.summary.match(/\d{4}[-/]\d{2}[-/]\d{2}/);
    const date = dateMatch ? dateMatch[0] : "N/A";

    parallels.push({
      date,
      description: result.title.slice(0, 100),
      outcome: result.summary.slice(0, 150),
      relevance,
    });
  }

  // Sort by relevance descending, take top 3
  return parallels
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 3);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sensitive date detection
// ─────────────────────────────────────────────────────────────────────────────

/** Known recurring sensitive events that affect VN market. */
interface SensitiveEvent {
  name: string;
  /** Vietnamese description. */
  description: string;
  /** Check if the event is near the given date. */
  isNear: (date: Date) => boolean;
}

const SENSITIVE_EVENTS: SensitiveEvent[] = [
  {
    name: "VN_DERIVATIVE_EXPIRY",
    description: "Đáo hạn phái sinh VN30 (thứ 5 tuần 3 hàng tháng) — biến động mạnh thường xảy ra",
    isNear: (date) => {
      // 3rd Thursday of the month ± 1 day
      const day = date.getDate();
      const dow = date.getDay(); // 0=Sun, 4=Thu
      // 3rd Thu is between day 15-21
      return day >= 14 && day <= 22 && (dow === 4 || dow === 3 || dow === 5);
    },
  },
  {
    name: "BCTC_SEASON",
    description: "Mùa công bố BCTC quý — cổ phiếu có thể biến động mạnh theo kết quả",
    isNear: (date) => {
      const month = date.getMonth() + 1;
      const day = date.getDate();
      // Reports arrive mostly in the last 2 weeks of BCTC months
      return [1, 4, 7, 10].includes(month) && day >= 15 && day <= 28;
    },
  },
  {
    name: "FOMC_PROXIMITY",
    description: "FOMC meeting sắp diễn ra — thị trường có thể chờ đợi, giảm thanh khoản",
    isNear: (date) => {
      // FOMC typically meets 8 times/year, roughly every 6-7 weeks
      // This is a heuristic — for accuracy, should use a calendar
      const month = date.getMonth() + 1;
      const day = date.getDate();
      // Common FOMC months: Jan, Mar, May, Jun, Jul, Sep, Nov, Dec
      // Usually mid-month (days 14-20)
      return [1, 3, 5, 6, 7, 9, 11, 12].includes(month) && day >= 13 && day <= 21;
    },
  },
  {
    name: "YEAR_END_WINDOW",
    description: "Window dressing cuối năm (tuần cuối tháng 12) — quỹ đẩy giá để NAV đẹp",
    isNear: (date) => {
      return date.getMonth() === 11 && date.getDate() >= 20; // Dec 20+
    },
  },
  {
    name: "TET_HOLIDAY",
    description: "Trước Tết Nguyên Đán — thanh khoản giảm, nhà đầu tư bán chốt lời",
    isNear: (date) => {
      const month = date.getMonth() + 1;
      const day = date.getDate();
      return (month === 1 && day >= 15) || (month === 2 && day <= 15);
    },
  },
  {
    name: "QUARTER_END_REBALANCE",
    description: "Cuối quý — quỹ đầu tư tái cân bằng danh mục, thanh khoản có thể biến động",
    isNear: (date) => {
      const month = date.getMonth() + 1;
      const day = date.getDate();
      // Last 5 trading days of each quarter (Mar, Jun, Sep, Dec)
      return [3, 6, 9, 12].includes(month) && day >= 25;
    },
  },
];

/**
 * Returns upcoming sensitive events for the given date.
 *
 * @param date - Date to check (defaults to today)
 * @returns Array of event descriptions for events that are near
 */
export function detectSensitiveDates(date?: Date): string[] {
  const d = date ?? new Date();
  // Convert to GMT+7
  const gmt7 = new Date(d.getTime() + 7 * 60 * 60 * 1000);

  return SENSITIVE_EVENTS
    .filter((e) => e.isNear(gmt7))
    .map((e) => `📅 ${e.description}`);
}
