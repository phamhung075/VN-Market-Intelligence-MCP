/**
 * Technical Analysis Domain — Service
 *
 * Pure business logic: fetches price history via ports, computes all indicators,
 * determines trend signal.
 * Zero I/O — all side effects isolated behind injected ports.
 */

import type { TechnicalIndicators } from './models.js';
import type { PriceHistoryRepository, TAIndicatorCalculator } from './repositories.js';

export class CalculateTAService {
  constructor(
    private readonly priceRepo: PriceHistoryRepository,
    private readonly calculator: TAIndicatorCalculator,
  ) {}

  async compute(code: string, days: number): Promise<TechnicalIndicators> {
    const history = await this.priceRepo.getHistory(code, days);
    const closes = history.map((c) => c.close);

    const rsi = this.calculator.calculateRSI(closes);
    const macd = this.calculator.calculateMACD(closes);
    const ma5 = this.calculator.calculateMA(closes, 5);
    const ma20 = this.calculator.calculateMA(closes, 20);
    const ma50 = this.calculator.calculateMA(closes, 50);
    const bb = this.calculator.calculateBB(closes);

    const trend = this.determineTrend(rsi, macd?.histogram ?? null, closes);

    return {
      rsi,
      macd,
      movingAverages: { ma5, ma20, ma50 },
      bollingerBands: bb,
      trend,
    };
  }

  private determineTrend(
    rsi: number | null,
    macdHist: number | null,
    closes: number[],
  ): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
    if (rsi !== null && macdHist !== null) {
      if (rsi > 70 && macdHist > 0) return 'BULLISH';
      if (rsi < 30 && macdHist < 0) return 'BEARISH';
    }
    // Fallback: compare last 2 closes
    if (closes.length >= 2) {
      const last = closes[closes.length - 1]!;
      const prev = closes[closes.length - 2]!;
      if (last > prev * 1.01) return 'BULLISH';
      if (last < prev * 0.99) return 'BEARISH';
    }
    return 'NEUTRAL';
  }
}
