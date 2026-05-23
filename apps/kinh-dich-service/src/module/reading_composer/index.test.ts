/**
 * reading_composer — Unit Tests
 *
 * Tests for composeReading() module function.
 * Verifies: MarkovPort injection, full pipeline output, confidence blending.
 *
 * Uses bun:test — no additional dependencies required.
 * Fence-B compliant: imports only from src/module/reading_composer and stdlib.
 */

import { describe, expect, it } from 'bun:test';
import { composeReading } from './index.js';
import type { MarkovData, MarkovPort, ReadingComposerDependencies } from './index.js';

// ── Test fixtures ─────────────────────────────────────────────────────────────

/** Scores used in golden scenario and AC-7 fixture. */
const GOLDEN_SCORES = [0.8, -0.3, 0.6, 0.1, -0.7, 0.4];

/** Null Markov stub — returns no historical data. */
const nullMarkov: MarkovPort = {
  getMarkovData: (_: number): MarkovData | null => null,
};

/** Live Markov stub — returns non-null data for any hexagram. */
const liveMarkov: MarkovPort = {
  getMarkovData: (_: number): MarkovData | null => ({
    transitionProb: 0.75,
    historicalConfidence: 0.8,
  }),
};

function makeDeps(port: MarkovPort): ReadingComposerDependencies {
  return { markov: port };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('composeReading', () => {
  it('returns KinhDichReading with all fields populated (markovData=null)', async () => {
    const reading = await composeReading('VCB', GOLDEN_SCORES, makeDeps(nullMarkov));

    // All top-level fields must be present
    expect(reading.stockCode).toBe('VCB');
    expect(reading.haos).toHaveLength(6);
    expect(typeof reading.queChiNh.number).toBe('number');
    expect(reading.queChiNh.number).toBe(30); // Ly (Li|Li) — computed from [1,0,1,1,0,1]
    expect(reading.hoQue.number).toBe(28);    // Đại Quá
    expect(reading.bienQue.number).toBe(56);  // Lữ
    expect(reading.nguHanh).toBeDefined();
    expect(reading.changingLines).toBeArray();
    expect(reading.queChiNh.confidence).toBeGreaterThanOrEqual(0);
    expect(reading.queChiNh.confidence).toBeLessThanOrEqual(1);
    expect(reading.timestamp).toBeTruthy();
  });

  it('confidence differs from base when markovData is non-null (Markov blending active)', async () => {
    const noMarkovReading = await composeReading('VCB', GOLDEN_SCORES, makeDeps(nullMarkov));
    const withMarkovReading = await composeReading('VCB', GOLDEN_SCORES, makeDeps(liveMarkov));

    const baseConfidence = noMarkovReading.queChiNh.confidence;
    const blendedConfidence = withMarkovReading.queChiNh.confidence;

    // Both must be valid confidence values
    expect(blendedConfidence).toBeGreaterThanOrEqual(0);
    expect(blendedConfidence).toBeLessThanOrEqual(1);

    // Markov blending should change the confidence value
    expect(blendedConfidence).not.toBe(baseConfidence);

    // Expected blended = round(0.625 * 0.7 + 0.775 * 0.3, 3) = 0.67
    expect(blendedConfidence).toBe(0.67);
  });

  it('edge case: threshold boundary scores produce valid reading', async () => {
    // 0.10 = exactly THIEU_DUONG_THRESHOLD (binary=1), -0.75 = exactly LAO_AM boundary
    const boundaryScores = [0.10, -0.75, 0.75, 0.0, -0.10, 0.5];
    const reading = await composeReading('HPG', boundaryScores, makeDeps(nullMarkov));

    expect(reading.stockCode).toBe('HPG');
    expect(reading.haos).toHaveLength(6);

    // Verify boundary classifications
    expect(reading.haos[0]!.state).toBe('THIEU_DUONG'); // 0.10 >= THIEU_DUONG_THRESHOLD
    expect(reading.haos[1]!.state).toBe('THIEU_AM');    // -0.75: not < -0.75, not >= 0.10
    expect(reading.haos[2]!.state).toBe('THIEU_DUONG'); // 0.75: not > 0.75
    expect(reading.haos[3]!.state).toBe('THIEU_AM');    // 0.0: not >= 0.10
    expect(reading.haos[4]!.state).toBe('THIEU_AM');    // -0.10: not >= 0.10

    // Hexagram must be in valid range 1–64
    expect(reading.queChiNh.number).toBeGreaterThanOrEqual(1);
    expect(reading.queChiNh.number).toBeLessThanOrEqual(64);
    expect(reading.queChiNh.number).toBe(22); // Bí (Gen|Li) — computed from [1,0,1,0,0,1]
  });

  it('matches golden fixture: queChinhNumber=30, hoQue=28, bienQue=56', async () => {
    const reading = await composeReading('VCB', GOLDEN_SCORES, makeDeps(nullMarkov));

    // These are the actual computed values for scores [0.8, -0.3, 0.6, 0.1, -0.7, 0.4]
    // signals=[1,0,1,1,0,1] → lower=Li, upper=Li → hexagram 30 (Ly)
    expect(reading.queChiNh.number).toBe(30);
    expect(reading.hoQue.number).toBe(28);
    expect(reading.bienQue.number).toBe(56);

    // HAO-1 (score=0.8 > 0.75) → LAO_DUONG → isChanging=true
    expect(reading.haos[0]!.state).toBe('LAO_DUONG');
    expect(reading.haos[0]!.isChanging).toBe(true);
  });

  it('throws on invalid scores length', async () => {
    await expect(
      composeReading('VCB', [0.5, 0.3, -0.2], makeDeps(nullMarkov)),
    ).rejects.toThrow('expected exactly 6 scores');
  });

  it('MarkovPort is injected and getMarkovData is called with queChinhNumber', async () => {
    let capturedHexagram: number | null = null as number | null;

    const capturingMarkov: MarkovPort = {
      getMarkovData: (hex: number): MarkovData | null => {
        capturedHexagram = hex;
        return null;
      },
    };

    await composeReading('VCB', GOLDEN_SCORES, makeDeps(capturingMarkov));

    // Port must have been called with the resolved hexagram number
    expect(capturedHexagram).toBe(30);
  });
});
