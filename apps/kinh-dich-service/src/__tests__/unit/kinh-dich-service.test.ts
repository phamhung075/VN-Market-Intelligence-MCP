/**
 * Kinh Dich Service — Unit Tests (mock ports)
 *
 * Tests pure domain logic and use cases with mock repositories.
 */

import { describe, it, expect, mock } from 'bun:test';
import { computeReading, classifyNguHanh } from '../../domain/services.js';
import { ReadingUseCase, MarketHexagramUseCase } from '../../application/usecases.js';
import type { KinhDichRepositoryPort, PriceScorePort } from '../../domain/repositories.js';
import { HexagramNotFoundError, InsufficientDataError } from '../../domain/errors.js';

// ── Mock implementations ──────────────────────────────────────────────────────

function makeRepo(overrides?: Partial<KinhDichRepositoryPort>): KinhDichRepositoryPort {
  return {
    getLatestReading: mock(() => null),
    getMarkovData: mock(() => null),
    ...overrides,
  };
}

function makePricePort(scores?: number[] | null): PriceScorePort {
  return {
    computeScores: mock(() => scores ?? null),
  };
}

// ── Domain: computeReading ────────────────────────────────────────────────────

describe('computeReading', () => {
  it('returns a valid reading for 6 neutral scores', () => {
    const reading = computeReading('VCB', [0, 0, 0, 0, 0, 0]);
    expect(reading.stockCode).toBe('VCB');
    expect(reading.queChiNh.number).toBeGreaterThanOrEqual(1);
    expect(reading.queChiNh.number).toBeLessThanOrEqual(64);
    expect(reading.queChiNh.confidence).toBeGreaterThanOrEqual(0);
    expect(reading.queChiNh.confidence).toBeLessThanOrEqual(1);
    expect(reading.timestamp).toBeDefined();
  });

  it('throws if not given exactly 6 scores', () => {
    expect(() => computeReading('VCB', [0, 0, 0])).toThrow('6 scores');
  });

  it('clamps scores outside [-1, 1]', () => {
    const reading = computeReading('VCB', [2, -2, 2, -2, 2, -2]);
    expect(reading.haos.every((h) => Math.abs(h.rawScore) <= 1)).toBe(true);
  });

  it('produces BULLISH signal for all-positive scores', () => {
    const reading = computeReading('VCB', [0.8, 0.8, 0.8, 0.8, 0.8, 0.8]);
    expect(reading.queChiNh.tradingSignal).toContain('tích cực');
  });

  it('produces changing lines for extreme scores', () => {
    const reading = computeReading('VCB', [0.9, 0.9, 0.9, -0.9, -0.9, -0.9]);
    expect(reading.changingLines.length).toBeGreaterThan(0);
  });

  it('includes markov data when provided', () => {
    const markov = { nextMostLikely: 12, nextName: 'Pi', probability: 0.65 };
    const reading = computeReading('VCB', [0.2, 0.2, 0.2, 0.2, 0.2, 0.2], markov);
    expect(reading.markov).not.toBeNull();
    expect(reading.markov?.nextName).toBe('Pi');
  });
});

// ── Domain: classifyNguHanh ───────────────────────────────────────────────────

describe('classifyNguHanh', () => {
  it('detects SAME element', () => {
    const result = classifyNguHanh('Kim', 'Kim');
    expect(result.dynamic).toBe('SAME');
    expect(result.score).toBe(0.1);
  });

  it('detects TUONG_SINH when lower generates upper', () => {
    // Moc generates Hoa
    const result = classifyNguHanh('Moc', 'Hoa');
    expect(result.dynamic).toBe('TUONG_SINH');
    expect(result.score).toBe(0.3);
  });

  it('detects TUONG_KHAC when lower destroys upper', () => {
    // Moc destroys Tho
    const result = classifyNguHanh('Moc', 'Tho');
    expect(result.dynamic).toBe('TUONG_KHAC');
    expect(result.score).toBe(-0.3);
  });
});

// ── Application: ReadingUseCase ───────────────────────────────────────────────

describe('ReadingUseCase', () => {
  it('returns a reading when price scores are available', async () => {
    const scores = [0.2, 0.1, 0.3, -0.1, 0.15, 0.05];
    const useCase = new ReadingUseCase(makeRepo(), makePricePort(scores));
    const result = await useCase.execute({ stockCode: 'VCB', days: 30 });
    expect(result.stock).toBe('VCB');
    expect(result.hexagram).toBeGreaterThanOrEqual(1);
    expect(result.hexagram).toBeLessThanOrEqual(64);
  });

  it('falls back to stored reading when no price scores', async () => {
    const repo = makeRepo({
      getLatestReading: mock(() => ({
        hexagram_number: 11,
        bien_que_number: 12,
        trading_signal: 'GIU (tích cực)',
        confidence: 0.72,
      })),
    });
    const useCase = new ReadingUseCase(repo, makePricePort(null));
    const result = await useCase.execute({ stockCode: 'VCB', days: 30 });
    expect(result.hexagram).toBe(11);
    expect(result.signal).toBe('GIU (tích cực)');
    expect(result.confidence).toBe(0.72);
  });

  it('throws HexagramNotFoundError when no data at all', async () => {
    const useCase = new ReadingUseCase(makeRepo(), makePricePort(null));
    await expect(useCase.execute({ stockCode: 'UNKNOWN', days: 30 })).rejects.toThrow(
      HexagramNotFoundError,
    );
  });
});

// ── Application: MarketHexagramUseCase ───────────────────────────────────────

describe('MarketHexagramUseCase', () => {
  it('returns market reading when price data available', async () => {
    const scores = [0.1, -0.1, 0.05, 0.2, -0.05, 0.1];
    const useCase = new MarketHexagramUseCase(makeRepo(), makePricePort(scores));
    const result = await useCase.execute();
    expect(result.hexagram).toBeGreaterThanOrEqual(1);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
  });

  it('throws InsufficientDataError when no data for VNINDEX', async () => {
    const useCase = new MarketHexagramUseCase(makeRepo(), makePricePort(null));
    await expect(useCase.execute()).rejects.toThrow(InsufficientDataError);
  });
});
