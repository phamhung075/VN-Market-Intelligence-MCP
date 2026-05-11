/**
 * Integration tests — ComputeTAUseCase
 *
 * Uses real TACalculatorImpl, mocked PriceHistoryRepository.
 * Tests the full use case flow: request → domain → response.
 */

import { describe, it, expect, mock } from 'bun:test';
import { ComputeTAUseCase } from '../../src/application/usecases.js';
import { CalculateTAService } from '../../src/domain/services.js';
import { TACalculatorImpl } from '../../src/infrastructure/calculator.js';
import type { PriceHistoryRepository } from '../../src/domain/repositories.js';
import type { CandleStick } from '../../src/domain/models.js';

function buildCandles(closes: number[]): CandleStick[] {
  return closes.map((close, i) => ({
    date: `2026-01-${String(i + 1).padStart(2, '0')}`,
    open: close, high: close, low: close, close, volume: 5000,
  }));
}

describe('ComputeTAUseCase (integration)', () => {
  it('returns ComputeTAResponse with correct code and timestamp', async () => {
    const repo: PriceHistoryRepository = { getHistory: mock(async () => buildCandles([100, 102, 104])) };
    const service = new CalculateTAService(repo, new TACalculatorImpl());
    const useCase = new ComputeTAUseCase(service);

    const response = await useCase.execute({ code: 'VCB', days: 30 });

    expect(response.code).toBe('VCB');
    expect(response.computedAt).toBeTruthy();
    expect(new Date(response.computedAt).toISOString()).toBe(response.computedAt);
  });

  it('returns null indicators for insufficient data (< 15 candles)', async () => {
    const repo: PriceHistoryRepository = { getHistory: mock(async () => buildCandles([100, 102, 104])) };
    const service = new CalculateTAService(repo, new TACalculatorImpl());
    const useCase = new ComputeTAUseCase(service);

    const response = await useCase.execute({ code: 'VCB', days: 3 });

    expect(response.rsi).toBeNull();
    expect(response.macd).toBeNull();
  });

  it('computes valid indicators for 60+ candles', async () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i * 0.3) * 10 + i * 0.1);
    const repo: PriceHistoryRepository = { getHistory: mock(async () => buildCandles(closes)) };
    const service = new CalculateTAService(repo, new TACalculatorImpl());
    const useCase = new ComputeTAUseCase(service);

    const response = await useCase.execute({ code: 'HPG', days: 60 });

    expect(response.rsi).not.toBeNull();
    expect(response.rsi!).toBeGreaterThanOrEqual(0);
    expect(response.rsi!).toBeLessThanOrEqual(100);
    expect(response.macd).not.toBeNull();
    expect(response.bollingerBands).not.toBeNull();
    expect(['BULLISH', 'BEARISH', 'NEUTRAL']).toContain(response.trend);
  });

  it('returns NEUTRAL trend for flat prices', async () => {
    const closes = Array.from({ length: 60 }, () => 100);
    const repo: PriceHistoryRepository = { getHistory: mock(async () => buildCandles(closes)) };
    const service = new CalculateTAService(repo, new TACalculatorImpl());
    const useCase = new ComputeTAUseCase(service);

    const response = await useCase.execute({ code: 'MSN', days: 60 });

    expect(response.trend).toBe('NEUTRAL');
  });
});
