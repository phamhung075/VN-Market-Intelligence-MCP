/**
 * Domain Models — IMF Economic Indicators (Task 1296b)
 *
 * Pure types, constants, and decay functions for IMF indicator data.
 * No I/O, no async, no infrastructure imports.
 *
 * @module domain/models/imfIndicators
 */

// ── Core indicator interface ──────────────────────────────────────────────────

/**
 * A single IMF economic indicator reading fetched from the IMF REST API.
 */
export interface ImfIndicator {
  /** Unique IMF indicator code (e.g. "NGDP_RPCH") */
  code: string;

  /** Human-readable name (e.g. "Global GDP Growth (%)") */
  name: string;

  /** Latest published value (unit depends on code) */
  value: number;

  /** Publication date ISO 8601 */
  publishedAt: string;

  /** Days since publication (freshness metric) */
  ageInDays: number;

  /** Previous value for YoY change calculation; null if unavailable */
  previousValue: number | null;

  /** Percent change YoY (calculated); null if unavailable */
  yoyChange: number | null;

  /** Data source used to fetch this indicator */
  source: "imf_api" | "imf_scrape";

  /** Confidence in freshness: 0.0–1.0 (decays with age) */
  confidence: number;
}

// ── Named indicator code constants ────────────────────────────────────────────

/**
 * Named constants for IMF indicator codes.
 * Subset of 9 indicators most relevant to VN market (from research 1296a).
 */
export const IMF_INDICATORS = {
  // Growth forecasts
  WORLD_GROWTH: "NGDP_RPCH",           // Global GDP growth %
  EM_GROWTH: "NGDP_RPCH_EM",           // Emerging market GDP growth %
  ASEAN_GROWTH: "NGDP_RPCH_ASEAN",     // ASEAN aggregate growth %
  VN_GROWTH_FORECAST: "NGDP_RPCH_VNM", // Vietnam GDP growth %

  // Monetary policy
  GLOBAL_INFLATION: "PCPIPCH",         // Inflation rate, average consumer prices (global %)
  EM_INFLATION: "PCPI_EM",             // EM inflation %

  // Trade & capital flows
  FDI_OUTLOOK: "FDI_SCORE",            // FDI sentiment (ordinal 0–100)
  USD_STRENGTH: "DXY_IMF_PROXY",       // USD index equivalent

  // Commodity / external balance
  OIL_FORECAST: "BCA_NGDPD",          // Current account balance (% of GDP) — IMF DataMapper
  // NOTE: POILAPSP and PCPI_ADVEC are not valid IMF DataMapper codes (Task 1922h fix).
} as const;

export type ImfIndicatorKey = keyof typeof IMF_INDICATORS;

// ── Confidence decay ──────────────────────────────────────────────────────────

/**
 * Calculate confidence decay based on data age.
 *
 * IMF data is released on a 1–2 week lag; confidence decays as data ages.
 * Used by both fetcher (at fetch time) and classifier (at classification time).
 *
 * @param ageInDays - Number of days since publication
 * @returns Confidence multiplier in range [0.30, 0.95]
 */
/**
 * IMF global growth historical baseline (%).
 * ~3% reflects long-run IMF world GDP growth consensus.
 * Used by classifyImfIndicators() callers as the default historicalBaseline.
 */
export const IMF_HISTORICAL_BASELINE = 3.0;

export function calculateConfidenceDecay(ageInDays: number): number {
  if (ageInDays <= 7) return 0.95;   // Fresh: 95%
  if (ageInDays <= 14) return 0.85;  // Recent: 85%
  if (ageInDays <= 30) return 0.70;  // Moderate: 70%
  if (ageInDays <= 60) return 0.50;  // Stale: 50%
  return 0.30;                       // Very old: 30%
}

// ── Classifier input/output ───────────────────────────────────────────────────

/** Sector impact entry in classification output */
export interface SectorImpact {
  /** Sector name (e.g. "banking", "export", "real_estate") */
  sector: string;
  /** Directional bias */
  direction: "bullish" | "bearish" | "neutral";
  /** Signed impact score [-1, +1] */
  impactScore: number;
}

/**
 * Input to classifyImfIndicators(): list of indicators + baseline.
 */
export interface ImfClassificationInput {
  /** List of IMF indicator readings to classify */
  indicators: ImfIndicator[];
  /** Historical baseline growth rate (e.g. 5.0 for 5%) used for delta comparison */
  historicalBaseline: number;
}

/**
 * Output from classifyImfIndicators(): structured sentiment + sector impacts.
 */
export interface ImfClassificationOutput {
  /** Overall sentiment score: [-1, +1] */
  sentiment: number;

  /** Confidence in classification: [0, 1] */
  confidence: number;

  /** Classification type */
  classification: "imf_bullish" | "imf_bearish" | "imf_neutral";

  /** Human-readable explanation */
  reasoning: string;

  /** Per-sector directional impacts */
  sectorImpacts: SectorImpact[];
}
