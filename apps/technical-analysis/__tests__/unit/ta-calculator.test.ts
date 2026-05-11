/**
 * Unit tests — TACalculatorImpl
 *
 * Tests the actual math correctness of each indicator.
 * No mocks — tests the concrete calculator.
 */

import { describe, it, expect } from 'bun:test';
import { TACalculatorImpl } from '../../src/infrastructure/calculator.js';

const calc = new TACalculatorImpl();

describe('TACalculatorImpl', () => {
  describe('calculateMA', () => {
    it('returns null when insufficient data', () => {
      expect(calc.calculateMA([10, 20], 5)).toBeNull();
    });

    it('computes MA correctly', () => {
      const result = calc.calculateMA([10, 20, 30, 40, 50], 3);
      expect(result).toBeCloseTo(40.0);
    });

    it('uses last N prices', () => {
      // MA5 of [10,20,30,40,50] = (10+20+30+40+50)/5 = 30
      expect(calc.calculateMA([10, 20, 30, 40, 50], 5)).toBeCloseTo(30.0);
    });
  });

  describe('calculateRSI', () => {
    it('returns null when fewer than period+1 prices', () => {
      expect(calc.calculateRSI([10, 20], 14)).toBeNull();
    });

    it('returns 100 when no losses', () => {
      const rising = Array.from({ length: 20 }, (_, i) => 100 + i);
      const result = calc.calculateRSI(rising, 14);
      expect(result).toBe(100);
    });

    it('returns 0 when no gains', () => {
      const falling = Array.from({ length: 20 }, (_, i) => 100 - i);
      const result = calc.calculateRSI(falling, 14);
      expect(result).toBe(0);
    });

    it('returns value between 0 and 100 for mixed prices', () => {
      const prices = [100, 102, 101, 103, 102, 104, 103, 105, 104, 106, 105, 107, 106, 108, 107];
      const result = calc.calculateRSI(prices, 14);
      expect(result).not.toBeNull();
      expect(result!).toBeGreaterThanOrEqual(0);
      expect(result!).toBeLessThanOrEqual(100);
    });
  });

  describe('calculateMACD', () => {
    it('returns null when insufficient data', () => {
      expect(calc.calculateMACD([100, 102, 103])).toBeNull();
    });

    it('returns macd object with line/signal/histogram', () => {
      const prices = Array.from({ length: 40 }, (_, i) => 100 + Math.sin(i) * 5);
      const result = calc.calculateMACD(prices);
      expect(result).not.toBeNull();
      expect(result).toHaveProperty('line');
      expect(result).toHaveProperty('signal');
      expect(result).toHaveProperty('histogram');
    });

    it('histogram = line - signal', () => {
      const prices = Array.from({ length: 40 }, (_, i) => 100 + i * 0.5);
      const result = calc.calculateMACD(prices);
      expect(result).not.toBeNull();
      expect(result!.histogram).toBeCloseTo(result!.line - result!.signal, 5);
    });
  });

  describe('calculateBB', () => {
    it('returns null when insufficient data', () => {
      expect(calc.calculateBB([100, 102], 20)).toBeNull();
    });

    it('returns upper/mid/lower', () => {
      const prices = Array.from({ length: 25 }, (_, i) => 100 + (i % 5));
      const result = calc.calculateBB(prices, 20);
      expect(result).not.toBeNull();
      expect(result!.upper).toBeGreaterThan(result!.mid);
      expect(result!.lower).toBeLessThan(result!.mid);
    });

    it('upper = lower when all prices equal (zero sigma)', () => {
      const prices = Array.from({ length: 20 }, () => 100);
      const result = calc.calculateBB(prices, 20);
      expect(result).not.toBeNull();
      expect(result!.upper).toBeCloseTo(result!.mid);
      expect(result!.lower).toBeCloseTo(result!.mid);
    });
  });
});
