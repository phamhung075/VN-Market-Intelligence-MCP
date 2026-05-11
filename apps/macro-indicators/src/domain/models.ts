/**
 * Macro Indicators Domain — Models
 *
 * Value Objects for macro snapshot and pricing signals.
 */

export type SignalDirection = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

/** A single macro price signal. */
export interface PriceSignal {
  indicator: string;  // e.g. "oil_usd", "gold_usd", "usd_vnd"
  value: number;
  unit: string;       // e.g. "USD/barrel", "USD/oz", "VND/USD"
  direction: SignalDirection;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
}

/** Full macro snapshot for VN market. */
export interface MacroSnapshot {
  vnIndex: number | null;
  oilUsd: number | null;
  goldUsd: number | null;
  usdVnd: number | null;
  signals: PriceSignal[];
  fetchedAt: string;   // ISO timestamp
}

/** Macro indicator tier (matches existing macroIndicatorScorer.ts logic). */
export type MacroTier = 'VN_DIRECT' | 'REGIONAL' | 'US_DOMESTIC';

/** Scored indicator entry. */
export interface ScoredIndicator {
  name: string;
  value: number;
  tier: MacroTier;
  impactScore: number;   // 2–10
}
