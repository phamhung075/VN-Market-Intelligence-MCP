/**
 * Technical Analysis Domain — Models
 *
 * Value Objects + Entities for technical indicator computation.
 * Zero imports from infrastructure/ or interface/.
 */

/** One daily price candle. */
export interface CandleStick {
  date: string;   // "YYYY-MM-DD"
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Full technical indicator result. */
export interface TechnicalIndicators {
  rsi: number | null;
  macd: {
    line: number;
    signal: number;
    histogram: number;
  } | null;
  movingAverages: {
    ma5: number | null;
    ma20: number | null;
    ma50: number | null;
  };
  bollingerBands: {
    upper: number;
    mid: number;
    lower: number;
  } | null;
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}
