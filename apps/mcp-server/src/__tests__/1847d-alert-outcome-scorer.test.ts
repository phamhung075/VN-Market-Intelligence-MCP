/**
 * 1847d-alert-outcome-scorer.test.ts
 * Unit tests for pure domain functions: classifyAlertType, scoreAlertOutcome
 * No DB, no HTTP — pure function testing.
 * Task: 1847d-B (14 tests)
 */
import { describe, it, expect } from 'bun:test';
import {
  classifyAlertType,
  scoreAlertOutcome,
} from '../domain/services/alertOutcomeScorer.js';
import type { PricePoint } from '../domain/services/alertOutcomeScorer.js';

describe('alertOutcomeScorer', () => {
  describe('classifyAlertType', () => {
    it('TEST-1: classifies position-danger when signals_json contains position-danger', () => {
      const signals = JSON.stringify([{ type: 'position-danger' }]);
      const result = classifyAlertType(signals, 'alert message');
      expect(result.alertClass).toBe('position-danger');
      expect(result.evalWindowDays).toBe(5);
      expect(result.direction).toBe('down');
    });

    it('TEST-2: classifies watchlist-opportunity when signals_json contains watchlist-opportunity', () => {
      const signals = JSON.stringify([{ type: 'watchlist-opportunity' }]);
      const result = classifyAlertType(signals, 'alert message');
      expect(result.alertClass).toBe('watchlist-opportunity');
      expect(result.evalWindowDays).toBe(7);
      expect(result.direction).toBe('up');
    });

    it('TEST-3: classifies price-signal for price_drop', () => {
      const signals = JSON.stringify([{ type: 'price_drop' }]);
      const result = classifyAlertType(signals, null);
      expect(result.alertClass).toBe('price-signal');
      expect(result.direction).toBe('down');
    });

    it('TEST-4: classifies unscoreable when signals_json is null', () => {
      const result = classifyAlertType(null, 'legacy narrative alert');
      expect(result.alertClass).toBe('unscoreable');
      expect(result.direction).toBe('neutral');
    });

    it('TEST-5: classifies composite for multi-signal non-policy type', () => {
      const signals = JSON.stringify([{ type: 'price_drop' }, { type: 'volume_spike' }]);
      const result = classifyAlertType(signals, null);
      expect(result.alertClass).toBe('composite');
    });
  });

  describe('scoreAlertOutcome - position-danger', () => {
    const positionDangerClass = {
      alertClass: 'position-danger' as const,
      evalWindowDays: 5,
      hitThresholdPct: 0,
      direction: 'down' as const,
    };

    it('TEST-6: position-danger HIT when all prices ≤ alertPrice', () => {
      const alertPrice = 100;
      const windowPrices: PricePoint[] = [
        { price: 98, fetchedAt: '2026-05-06T10:00:00Z' },
        { price: 95, fetchedAt: '2026-05-06T15:00:00Z' },
        { price: 99, fetchedAt: '2026-05-07T10:00:00Z' },
      ];
      const result = scoreAlertOutcome(positionDangerClass, alertPrice, windowPrices, 3);
      expect(result.outcome).toBe('hit');
    });

    it('TEST-7: position-danger MISS when max price > alertPrice * 1.02', () => {
      const alertPrice = 100;
      const windowPrices: PricePoint[] = [
        { price: 98, fetchedAt: '2026-05-06T10:00:00Z' },
        { price: 103, fetchedAt: '2026-05-06T15:00:00Z' },
      ];
      const result = scoreAlertOutcome(positionDangerClass, alertPrice, windowPrices, 3);
      expect(result.outcome).toBe('miss');
    });

    it('TEST-8: position-danger UNKNOWN in ±2% band', () => {
      const alertPrice = 100;
      const windowPrices: PricePoint[] = [
        { price: 100.5, fetchedAt: '2026-05-06T10:00:00Z' },
        { price: 101.5, fetchedAt: '2026-05-06T15:00:00Z' },
      ];
      const result = scoreAlertOutcome(positionDangerClass, alertPrice, windowPrices, 3);
      expect(result.outcome).toBe('unknown');
    });
  });

  describe('scoreAlertOutcome - watchlist-opportunity', () => {
    const watchlistOpportunityClass = {
      alertClass: 'watchlist-opportunity' as const,
      evalWindowDays: 7,
      hitThresholdPct: 1.0,
      direction: 'up' as const,
    };

    it('TEST-9: watchlist-opportunity HIT when max price ≥ alertPrice * 1.01', () => {
      const alertPrice = 100;
      const windowPrices: PricePoint[] = [
        { price: 100.5, fetchedAt: '2026-05-06T10:00:00Z' },
        { price: 101.2, fetchedAt: '2026-05-07T10:00:00Z' },
      ];
      const result = scoreAlertOutcome(watchlistOpportunityClass, alertPrice, windowPrices, 5);
      expect(result.outcome).toBe('hit');
    });

    it('TEST-10: watchlist-opportunity MISS when end-of-window price ≤ alertPrice * 0.99', () => {
      const alertPrice = 100;
      const windowPrices: PricePoint[] = [
        { price: 100.5, fetchedAt: '2026-05-06T10:00:00Z' },
        { price: 98.5, fetchedAt: '2026-05-07T10:00:00Z' },
      ];
      const result = scoreAlertOutcome(watchlistOpportunityClass, alertPrice, windowPrices, 5);
      expect(result.outcome).toBe('miss');
    });
  });

  describe('scoreAlertOutcome - edge cases', () => {
    it('TEST-11: unscoreable always returns unknown', () => {
      const unscoreableClass = {
        alertClass: 'unscoreable' as const,
        evalWindowDays: 999,
        hitThresholdPct: 0,
        direction: 'neutral' as const,
      };
      const result = scoreAlertOutcome(unscoreableClass, 100, [], 10);
      expect(result.outcome).toBe('unknown');
    });

    it('TEST-12: no price data returns unknown', () => {
      const positionDangerClass = {
        alertClass: 'position-danger' as const,
        evalWindowDays: 5,
        hitThresholdPct: 0,
        direction: 'down' as const,
      };
      const result = scoreAlertOutcome(positionDangerClass, null, [], 2);
      expect(result.outcome).toBe('unknown');
      expect(result.detail).toContain('no price data');
    });

    it('TEST-13: calDays ≥ 14 with no data returns data timeout', () => {
      const positionDangerClass = {
        alertClass: 'position-danger' as const,
        evalWindowDays: 5,
        hitThresholdPct: 0,
        direction: 'down' as const,
      };
      const result = scoreAlertOutcome(positionDangerClass, null, [], 14);
      expect(result.outcome).toBe('unknown');
      expect(result.detail).toContain('data timeout');
    });

    it('TEST-14: price-signal reuses existing HIT/MISS logic', () => {
      const priceSignalClass = {
        alertClass: 'price-signal' as const,
        evalWindowDays: 3,
        hitThresholdPct: 0.1,
        direction: 'up' as const,
      };
      const alertPrice = 100;
      const windowPrices: PricePoint[] = [
        { price: 100.15, fetchedAt: '2026-05-06T10:00:00Z' },
      ];
      const result = scoreAlertOutcome(priceSignalClass, alertPrice, windowPrices, 2);
      expect(result.outcome).toBe('hit');
    });
  });
});
