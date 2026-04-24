/**
 * Technical Analysis Application — DTOs
 *
 * Input/output data contracts for the use case layer.
 */

export interface ComputeTARequest {
  code: string;
  days: number;
}

export interface ComputeTAResponse {
  code: string;
  rsi: number | null;
  macd: { line: number; signal: number; histogram: number } | null;
  movingAverages: { ma5: number | null; ma20: number | null; ma50: number | null };
  bollingerBands: { upper: number; mid: number; lower: number } | null;
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  computedAt: string;  // ISO timestamp
}
