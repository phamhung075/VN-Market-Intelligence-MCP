/**
 * Macro Indicators Domain — Repository Ports (Abstract)
 */

import type { ScoredIndicator } from './models.js';

/** Port: fetch commodity prices (oil, gold, USD/VND). */
export interface CommodityFetcherPort {
  fetchOilUsd(): Promise<number | null>;
  fetchGoldUsd(): Promise<number | null>;
  fetchUsdVnd(): Promise<number | null>;
}

/** Port: fetch VN-specific data (VN-Index, SBV rates). */
export interface SBVRatePort {
  fetchVnIndex(): Promise<number | null>;
  fetchSBVRates(): Promise<Record<string, number>>;
}

/** Port: load cached macro indicators from DB. */
export interface MacroIndicatorRepository {
  getLatest(limit: number): Promise<ScoredIndicator[]>;
}

// ── New external-source ports (sprint 2026-05-13) ─────────────────────────

/** Single annual macro data point returned by World Bank API. */
export interface WorldBankDataPoint {
  indicator: string;   // e.g. "NY.GDP.MKTP.CD"
  indicatorName: string;
  date: string;        // year as string "2024"
  value: number | null;
}

/** Port: fetch VN annual macro series from World Bank Open Data API. */
export interface WorldBankMacroPort {
  fetchVnIndicator(indicatorCode: string, mostRecentN?: number): Promise<WorldBankDataPoint[]>;
  fetchVnMacroBatch(): Promise<Record<string, WorldBankDataPoint[]>>;
}

/** FX rate or global index quote. */
export interface YahooQuote {
  symbol: string;
  price: number;
  currency: string;
  exchangeName: string;
  dayHigh: number | null;
  dayLow: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  lastUpdated: string; // ISO
}

/** Port: fetch FX rates and global indices from Yahoo Finance v8 chart API. */
export interface YahooFxIndicesPort {
  fetchSymbol(symbol: string): Promise<YahooQuote | null>;
  fetchBatch(symbols: string[]): Promise<Record<string, YahooQuote | null>>;
}

/** CNBC index quote. */
export interface CnbcQuote {
  symbol: string;
  last: string;
  change: string;
  changePct: string;
  open: string;
  fetchedAt: string;
}

/** Port: fetch global index quotes from CNBC quote API. */
export interface CnbcWorldMarketsPort {
  fetchQuote(symbol: string): Promise<CnbcQuote | null>;
  fetchBatch(symbols: string[]): Promise<Record<string, CnbcQuote | null>>;
}

/** Trading Economics VN indicator from schema.org JSON-LD. */
export interface TradingEconomicsIndicator {
  name: string;       // e.g. "Vietnam GDP"
  latestValue: string; // raw text from meta description
  temporalCoverage: string;
  dateModified: string;
  fetchedAt: string;
}

/** Port: fetch VN macro indicator pages from Trading Economics. */
export interface TradingEconomicsVnPort {
  fetchIndicator(slug: string): Promise<TradingEconomicsIndicator | null>;
  fetchVnMacroBatch(): Promise<Record<string, TradingEconomicsIndicator | null>>;
}

/** FRED series observation. */
export interface FredObservation {
  date: string;    // YYYY-MM-DD
  value: string;   // numeric string or "." for missing
}

/** Result for a single FRED series fetch. */
export interface FredSeriesResult {
  seriesId: string;
  observations: FredObservation[];
  fetchedAt: string;
}

/** Port: fetch US macro series from FRED API. */
export interface FredMacroPort {
  isAvailable(): boolean;
  fetchSeries(seriesId: string, limit?: number): Promise<FredSeriesResult | null>;
  fetchAllMacro(): Promise<Record<string, FredSeriesResult | null>>;
}

/** Economic calendar event from Investing.com. */
export interface EconomicCalendarEvent {
  time: string;
  country: string;
  event: string;
  actual: string;
  forecast: string;
  previous: string;
  impact: string; // "low" | "medium" | "high" — parsed from bull-icon class
}

/** Port: fetch economic calendar data from Investing.com. */
export interface InvestingCalendarPort {
  fetchCalendar(countryId?: string): Promise<EconomicCalendarEvent[]>;
}

// ── ADB KIDB port (sprint 2026-05-13, Phase 2 direct API) ─────────────────

/** Single annual data point from ADB Key Indicators Database. */
export interface AdbKidbDataPoint {
  year: string;    // e.g. "2024"
  value: number;
}

/** Port: fetch VN macro indicators from ADB KIDB SDMX v4 API. */
export interface AdbKidbPort {
  fetchIndicator(dataflow: string, indicator: string): Promise<AdbKidbDataPoint[]>;
  fetchVnMacroBatch(): Promise<Record<string, AdbKidbDataPoint[]>>;
}

// ── IMF WEO port (sprint 2026-05-13, api.imf.org SDMX 3.0) ───────────────

/** Single annual WEO data point (historical or IMF forecast). */
export interface ImfWeoDataPoint {
  year: string;    // e.g. "2025" — may be a forecast year
  value: number;
}

/** Port: fetch VN WEO indicators from IMF api.imf.org SDMX 3.0. */
export interface ImfWeoPort {
  fetchIndicator(indicatorCode: string): Promise<ImfWeoDataPoint[]>;
  fetchVnWeoMacroBatch(): Promise<Record<string, ImfWeoDataPoint[]>>;
}
