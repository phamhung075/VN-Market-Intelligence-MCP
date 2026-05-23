/**
 * Unit tests for hao-encoder primitive
 *
 * Covers: LAO_DUONG / THIEU_DUONG / LAO_AM / THIEU_AM state buckets,
 * threshold boundaries, encodeHaos 6-element array, input validation,
 * and the clamping behaviour for out-of-range inputs.
 *
 * AC-2: ≥6 test cases required.  This file ships 12.
 */

import { describe, it, expect } from 'bun:test';
import { classifyHao, encodeHaos } from './index.js';

// ── classifyHao ───────────────────────────────────────────────────────────────

describe('classifyHao', () => {
  // AC-2 test 1: score > 0.75 → LAO_DUONG (binary=1, isChanging=true)
  it('returns LAO_DUONG for score > LAO_DUONG_THRESHOLD (0.75)', () => {
    const result = classifyHao(0.9);
    expect(result.state).toBe('LAO_DUONG');
    expect(result.binary).toBe(1);
    expect(result.isChanging).toBe(true);
    expect(typeof result.label).toBe('string');
    expect(result.label.length).toBeGreaterThan(0);
  });

  // AC-2 test 2: 0.10 ≤ score ≤ 0.75 → THIEU_DUONG (binary=1, isChanging=false)
  it('returns THIEU_DUONG for score in [THIEU_DUONG_THRESHOLD, LAO_DUONG_THRESHOLD]: 0.4', () => {
    const result = classifyHao(0.4);
    expect(result.state).toBe('THIEU_DUONG');
    expect(result.binary).toBe(1);
    expect(result.isChanging).toBe(false);
  });

  // AC-2 test 3: score < -0.75 → LAO_AM (binary=0, isChanging=true)
  it('returns LAO_AM for score < LAO_AM_THRESHOLD (-0.75)', () => {
    const result = classifyHao(-0.9);
    expect(result.state).toBe('LAO_AM');
    expect(result.binary).toBe(0);
    expect(result.isChanging).toBe(true);
  });

  // AC-2 test 4: remaining range → THIEU_AM (binary=0, isChanging=false)
  it('returns THIEU_AM for score in remaining range: 0.0', () => {
    const result = classifyHao(0.0);
    expect(result.state).toBe('THIEU_AM');
    expect(result.binary).toBe(0);
    expect(result.isChanging).toBe(false);
  });

  // Threshold boundary: exact 0.75 → THIEU_DUONG (not LAO_DUONG — must be strictly greater)
  it('returns THIEU_DUONG at exact LAO_DUONG_THRESHOLD (0.75) — boundary is exclusive', () => {
    const result = classifyHao(0.75);
    expect(result.state).toBe('THIEU_DUONG');
    expect(result.binary).toBe(1);
    expect(result.isChanging).toBe(false);
  });

  // Threshold boundary: exact 0.10 → THIEU_DUONG (inclusive lower bound)
  it('returns THIEU_DUONG at exact THIEU_DUONG_THRESHOLD (0.10)', () => {
    const result = classifyHao(0.10);
    expect(result.state).toBe('THIEU_DUONG');
    expect(result.binary).toBe(1);
    expect(result.isChanging).toBe(false);
  });

  // Threshold boundary: exact -0.75 → THIEU_AM (not LAO_AM — must be strictly less)
  it('returns THIEU_AM at exact LAO_AM_THRESHOLD (-0.75) — boundary is exclusive', () => {
    const result = classifyHao(-0.75);
    expect(result.state).toBe('THIEU_AM');
    expect(result.binary).toBe(0);
    expect(result.isChanging).toBe(false);
  });

  // Out-of-range input (> 1.0) is clamped to 1.0 → LAO_DUONG
  it('clamps score > 1.0 to 1.0 → LAO_DUONG', () => {
    const result = classifyHao(1.5);
    expect(result.state).toBe('LAO_DUONG');
    expect(result.binary).toBe(1);
    expect(result.isChanging).toBe(true);
  });

  // Out-of-range input (< -1.0) is clamped to -1.0 → LAO_AM
  it('clamps score < -1.0 to -1.0 → LAO_AM', () => {
    const result = classifyHao(-1.5);
    expect(result.state).toBe('LAO_AM');
    expect(result.binary).toBe(0);
    expect(result.isChanging).toBe(true);
  });
});

// ── encodeHaos ────────────────────────────────────────────────────────────────

describe('encodeHaos', () => {
  // AC-2 test 5: typical 6-element input → correct states per score
  it('maps 6 scores to 6 HaoReadings with correct states: [0.8, 0.4, -0.8, 0.1, -0.5, 0.6]', () => {
    // 0.8  > 0.75  → LAO_DUONG
    // 0.4  in [0.10, 0.75] → THIEU_DUONG
    // -0.8 < -0.75 → LAO_AM
    // 0.1  = THIEU_DUONG_THRESHOLD → THIEU_DUONG
    // -0.5 in (-0.75, 0.10) → THIEU_AM
    // 0.6  in [0.10, 0.75] → THIEU_DUONG
    const result = encodeHaos([0.8, 0.4, -0.8, 0.1, -0.5, 0.6]);
    expect(result).toHaveLength(6);
    expect(result[0]!.state).toBe('LAO_DUONG');
    expect(result[1]!.state).toBe('THIEU_DUONG');
    expect(result[2]!.state).toBe('LAO_AM');
    expect(result[3]!.state).toBe('THIEU_DUONG');
    expect(result[4]!.state).toBe('THIEU_AM');
    expect(result[5]!.state).toBe('THIEU_DUONG');
  });

  // AC-2 test 5b: handoff example [1, 0, -1, 0.5, -0.5, 0.8]
  it('encodes the handoff AC-2 example: [1, 0, -1, 0.5, -0.5, 0.8]', () => {
    // 1.0 → LAO_DUONG, 0.0 → THIEU_AM, -1.0 → LAO_AM
    // 0.5 → THIEU_DUONG, -0.5 → THIEU_AM, 0.8 → LAO_DUONG
    const result = encodeHaos([1, 0, -1, 0.5, -0.5, 0.8]);
    expect(result).toHaveLength(6);
    expect(result[0]!.state).toBe('LAO_DUONG');
    expect(result[0]!.binary).toBe(1);
    expect(result[0]!.isChanging).toBe(true);
    expect(result[1]!.state).toBe('THIEU_AM');
    expect(result[1]!.binary).toBe(0);
    expect(result[1]!.isChanging).toBe(false);
    expect(result[2]!.state).toBe('LAO_AM');
    expect(result[2]!.binary).toBe(0);
    expect(result[2]!.isChanging).toBe(true);
    expect(result[3]!.state).toBe('THIEU_DUONG');
    expect(result[4]!.state).toBe('THIEU_AM');
    expect(result[5]!.state).toBe('LAO_DUONG');
  });

  // AC-2 test 6: length !== 6 → throws Error
  it('throws Error when scores.length !== 6 (length 5)', () => {
    expect(() => encodeHaos([0.8, 0.4, -0.8, 0.1, -0.5])).toThrow();
  });

  // Additional: length 0 → throws
  it('throws Error when scores is empty array (length 0)', () => {
    expect(() => encodeHaos([])).toThrow();
  });

  // Additional: length 7 → throws
  it('throws Error when scores.length is 7 (too many)', () => {
    expect(() => encodeHaos([0, 0, 0, 0, 0, 0, 0])).toThrow();
  });

  // All readings have non-empty labels
  it('attaches a non-empty label to each HaoReading', () => {
    const result = encodeHaos([0.8, 0.4, -0.8, 0.1, -0.5, 0.6]);
    for (const hao of result) {
      expect(typeof hao.label).toBe('string');
      expect(hao.label.length).toBeGreaterThan(0);
    }
  });

  // All binary values are 0 or 1
  it('binary field is always 0 or 1 for all valid inputs', () => {
    const result = encodeHaos([0.8, 0.4, -0.8, 0.1, -0.5, 0.6]);
    for (const hao of result) {
      expect(hao.binary === 0 || hao.binary === 1).toBe(true);
    }
  });

  // isChanging is boolean
  it('isChanging field is always boolean for all valid inputs', () => {
    const result = encodeHaos([0.8, 0.4, -0.8, 0.1, -0.5, 0.6]);
    for (const hao of result) {
      expect(typeof hao.isChanging).toBe('boolean');
    }
  });
});
