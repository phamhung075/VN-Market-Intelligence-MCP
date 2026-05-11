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
