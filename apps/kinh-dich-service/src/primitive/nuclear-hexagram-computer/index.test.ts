/**
 * nuclear-hexagram-computer — Unit Tests
 *
 * Tests for computeHoQue() and computeBienQue().
 * All inputs and expected values derived from resolveHexagram() calls.
 *
 * G7 zero-creds: pure compute — no I/O, no DB, no external APIs.
 * Fence-A: only imports sister primitives (cross-primitive OK, not application/infra/module).
 */

import { describe, it, expect } from 'bun:test';
import { computeHoQue, computeBienQue } from './index.js';
import { encodeHaos } from '../hao-encoder/index.js';

describe('nuclear-hexagram-computer', () => {

  describe('computeHoQue', () => {
    it('golden: all-yang signals [1,1,1,1,1,1] → nuclear hexagram 1 (Thuần Càn)', () => {
      // hoSignals = [1,1,1,1,1,1] → lower=Qian, upper=Qian → hexagram 1
      expect(computeHoQue([1, 1, 1, 1, 1, 1])).toBe(1);
    });

    it('edge: all-yin signals [0,0,0,0,0,0] → nuclear hexagram 2 (Thuần Khôn)', () => {
      // hoSignals = [0,0,0,0,0,0] → lower=Kun, upper=Kun → hexagram 2
      expect(computeHoQue([0, 0, 0, 0, 0, 0])).toBe(2);
    });

    it('golden: mixed signals — inner lines form distinct nuclear hexagram', () => {
      // signals[1..4] = [1,0,1,0] → hoSignals = [1,0,1,0,1,0] → resolves to non-trivial hexagram
      const signals = [1, 1, 0, 1, 0, 1];
      // hoSignals = [signals[1],signals[2],signals[3],signals[2],signals[3],signals[4]] = [1,0,1,0,1,0]
      const result = computeHoQue(signals);
      expect(result).toBeGreaterThanOrEqual(1);
      expect(result).toBeLessThanOrEqual(64);
    });

    it('failure: signals length !== 6 throws Error', () => {
      expect(() => computeHoQue([1, 0])).toThrow('computeHoQue requires exactly 6 signals, got 2');
    });

    it('failure: empty signals throws Error', () => {
      expect(() => computeHoQue([])).toThrow('computeHoQue requires exactly 6 signals, got 0');
    });
  });

  describe('computeBienQue', () => {
    it('golden: no changing lines → bienQue equals original hexagram', () => {
      // All THIEU_DUONG: binary=1, not changing → transformed=[1,1,1,1,1,1] → hexagram 1
      const haos = encodeHaos([0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
      expect(haos.every(h => h.state === 'THIEU_DUONG')).toBe(true);
      expect(computeBienQue(haos)).toBe(1); // same as original queChinh
    });

    it('golden: all-changing yang lines flip to yin → hexagram 2 (Thuần Khôn)', () => {
      // All LAO_DUONG: binary=1, flips to 0 → [0,0,0,0,0,0] → hexagram 2
      const haos = encodeHaos([0.9, 0.9, 0.9, 0.9, 0.9, 0.9]);
      expect(haos.every(h => h.state === 'LAO_DUONG')).toBe(true);
      expect(computeBienQue(haos)).toBe(2);
    });

    it('edge: mixed changing/stable lines → valid hexagram in 1–64', () => {
      const haos = encodeHaos([0.8, 0.4, -0.8, 0.1, -0.5, 0.6]);
      const result = computeBienQue(haos);
      expect(result).toBeGreaterThanOrEqual(1);
      expect(result).toBeLessThanOrEqual(64);
    });

    it('failure: haos length !== 6 throws Error', () => {
      const haos = encodeHaos([0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
      expect(() => computeBienQue(haos.slice(0, 2))).toThrow(
        'computeBienQue requires exactly 6 HaoReading objects, got 2'
      );
    });
  });

});
