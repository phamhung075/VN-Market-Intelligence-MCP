/**
 * Unit tests — CalculateTAService
 *
 * Mocks both ports (PriceHistoryRepository + TAIndicatorCalculator).
 * Tests domain logic: compute() orchestration, trend determination.
 */

import { describe, it, expect, mock } from 'bun:test';
import { CalculateTAService } from '../../src/domain/services.js';
import type { PriceHistoryRepository, TAIndicatorCalculator } from '../../src/domain/repositories.js';
import type { CandleStick } from '../../src/domain/models.js';

function makeCandles(closes: number[]): CandleStick[] {
  return closes.map((close, i) => ({
    date: `2026-01-${String(i + 1).padStart(2, '0')}`,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1000,
  }));
}

function makeMockRepo(candles: CandleStick[]): PriceHistoryRepository {
  return {
    getHistory: mock(async () => candles),
  };
}

function makeMockCalc(overrides: Partial<TAIndicatorCalculator> = {}): TAIndicatorCalculator {
  return {
    calculateRSI: mock(() => 65),
    calculateMACD: mock(() => ({ line: 0.5, signal: 0.3, histogram: 0.2 })),
    calculateMA: mock(() => 100),
    calculateBB: mock(() => ({ upper: 105, mid: 100, lower: 95 })),
    ...overrides,
  };
}

describe('CalculateTAService', () => {
  it('calls priceRepo.getHistory with correct args', async () => {
    const candles = makeCandles([100, 102, 105]);
    const repo = makeMockRepo(candles);
    const calc = makeMockCalc();
    const service = new CalculateTAService(repo, calc);

    await service.compute('VCB', 60);

    expect(repo.getHistory).toHaveBeenCalledWith('VCB', 60);
  });

  it('calls all calculator methods with close prices', async () => {
    const closes = [100, 102, 105];
    const candles = makeCandles(closes);
    const repo = makeMockRepo(candles);
    const calc = makeMockCalc();
    const service = new CalculateTAService(repo, calc);

    await service.compute('VCB', 60);

    expect(calc.calculateRSI).toHaveBeenCalledWith(closes);
    expect(calc.calculateMACD).toHaveBeenCalledWith(closes);
    expect(calc.calculateMA).toHaveBeenCalledWith(closes, 5);
    expect(calc.calculateMA).toHaveBeenCalledWith(closes, 20);
    expect(calc.calculateMA).toHaveBeenCalledWith(closes, 50);
    expect(calc.calculateBB).toHaveBeenCalledWith(closes);
  });

  it('returns BULLISH trend when RSI>70 and MACD histogram>0', async () => {
    const repo = makeMockRepo(makeCandles([100, 102]));
    const calc = makeMockCalc({
      calculateRSI: mock(() => 75),
      calculateMACD: mock(() => ({ line: 1.0, signal: 0.5, histogram: 0.5 })),
    });
    const service = new CalculateTAService(repo, calc);

    const result = await service.compute('VCB', 60);

    expect(result.trend).toBe('BULLISH');
  });

  it('returns BEARISH trend when RSI<30 and MACD histogram<0', async () => {
    const repo = makeMockRepo(makeCandles([100, 99]));
    const calc = makeMockCalc({
      calculateRSI: mock(() => 25),
      calculateMACD: mock(() => ({ line: -1.0, signal: -0.5, histogram: -0.5 })),
    });
    const service = new CalculateTAService(repo, calc);

    const result = await service.compute('VCB', 60);

    expect(result.trend).toBe('BEARISH');
  });

  it('returns NEUTRAL when RSI is mid-range', async () => {
    const repo = makeMockRepo(makeCandles([100, 100]));
    const calc = makeMockCalc({
      calculateRSI: mock(() => 50),
      calculateMACD: mock(() => ({ line: 0.0, signal: 0.0, histogram: 0.0 })),
    });
    const service = new CalculateTAService(repo, calc);

    const result = await service.compute('VCB', 60);

    expect(result.trend).toBe('NEUTRAL');
  });

  it('includes all indicator fields in result', async () => {
    const repo = makeMockRepo(makeCandles([100, 102]));
    const calc = makeMockCalc();
    const service = new CalculateTAService(repo, calc);

    const result = await service.compute('VCB', 30);

    expect(result).toHaveProperty('rsi');
    expect(result).toHaveProperty('macd');
    expect(result).toHaveProperty('movingAverages');
    expect(result.movingAverages).toHaveProperty('ma5');
    expect(result.movingAverages).toHaveProperty('ma20');
    expect(result.movingAverages).toHaveProperty('ma50');
    expect(result).toHaveProperty('bollingerBands');
    expect(result).toHaveProperty('trend');
  });

  it('handles null indicators gracefully when calculator returns null', async () => {
    const repo = makeMockRepo(makeCandles([100]));
    const calc = makeMockCalc({
      calculateRSI: mock(() => null),
      calculateMACD: mock(() => null),
      calculateMA: mock(() => null),
      calculateBB: mock(() => null),
    });
    const service = new CalculateTAService(repo, calc);

    const result = await service.compute('VCB', 5);

    expect(result.rsi).toBeNull();
    expect(result.macd).toBeNull();
    expect(result.bollingerBands).toBeNull();
    expect(result.movingAverages.ma5).toBeNull();
    expect(result.trend).toBe('NEUTRAL');
  });
});
