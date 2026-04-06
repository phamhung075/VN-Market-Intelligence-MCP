// src/__tests__/284-reading-orchestrator.test.ts
// Task 284 — Kinh Dich Reading Orchestrator + Vietnamese Formatter

import { describe, it, expect } from "bun:test";
import { computeReading, type KinhDichReading, type MarkovData } from "../domain/services/kinhDich/kinhDichReading.js";
import { formatReading } from "../domain/services/kinhDich/kinhDichFormatter.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

/** All-positive scores → each hao between THIEU_DUONG and LAO_DUONG */
const POSITIVE_SCORES = [0.9, 0.8, 0.5, 0.6, 0.3, 0.7];

/** All-negative scores → each hao between THIEU_AM and LAO_AM */
const NEGATIVE_SCORES = [-0.9, -0.8, -0.5, -0.6, -0.3, -0.7];

/** Mixed scores: some Lao, some Thieu */
const MIXED_SCORES = [0.85, -0.85, 0.4, -0.2, 0.76, -0.1];

const MARKOV: MarkovData = {
  nextMostLikely: 11,
  nextName: "Thai",
  probability: 0.72,
};

// ── computeReading ─────────────────────────────────────────────────────────────

describe("Task 284 — computeReading", () => {
  it("returns a KinhDichReading with all required fields (all-positive scores)", () => {
    const reading = computeReading("VCB", POSITIVE_SCORES);

    expect(reading.stockCode).toBe("VCB");
    expect(typeof reading.timestamp).toBe("string");
    expect(reading.timestamp.length).toBeGreaterThan(10);

    // haos
    expect(Array.isArray(reading.haos)).toBe(true);
    expect(reading.haos).toHaveLength(6);

    // trigrams
    expect(typeof reading.lowerTrigram.name).toBe("string");
    expect(reading.lowerTrigram.name.length).toBeGreaterThan(0);
    expect(typeof reading.lowerTrigram.element).toBe("string");
    expect(typeof reading.lowerTrigram.symbol).toBe("string");
    expect(typeof reading.upperTrigram.name).toBe("string");
    expect(reading.upperTrigram.name.length).toBeGreaterThan(0);

    // queChiNh
    expect(reading.queChiNh.number).toBeGreaterThanOrEqual(1);
    expect(reading.queChiNh.number).toBeLessThanOrEqual(64);
    expect(typeof reading.queChiNh.name).toBe("string");
    expect(typeof reading.queChiNh.chinese).toBe("string");
    expect(typeof reading.queChiNh.coreMeaning).toBe("string");
    expect(reading.queChiNh.coreMeaning.length).toBeGreaterThan(0);
    expect(typeof reading.queChiNh.trend).toBe("string");
    expect(typeof reading.queChiNh.tradingSignal).toBe("string");
    expect(reading.queChiNh.confidence).toBeGreaterThanOrEqual(0);
    expect(reading.queChiNh.confidence).toBeLessThanOrEqual(1);

    // hoQue
    expect(reading.hoQue.number).toBeGreaterThanOrEqual(1);
    expect(reading.hoQue.number).toBeLessThanOrEqual(64);
    expect(typeof reading.hoQue.coreMeaning).toBe("string");

    // bienQue
    expect(reading.bienQue.number).toBeGreaterThanOrEqual(1);
    expect(reading.bienQue.number).toBeLessThanOrEqual(64);

    // nguHanh
    expect(reading.nguHanh).toBeDefined();
    expect(["TUONG_SINH", "TUONG_KHAC", "SAME", "NEUTRAL"]).toContain(reading.nguHanh.dynamic);

    // changingLines
    expect(Array.isArray(reading.changingLines)).toBe(true);

    // markov null when not provided
    expect(reading.markov).toBeNull();

    // actionNote + overallReading
    expect(typeof reading.actionNote).toBe("string");
    expect(reading.actionNote.length).toBeGreaterThan(0);
    expect(typeof reading.overallReading).toBe("string");
    expect(reading.overallReading.length).toBeGreaterThan(0);
  });

  it("returns a valid reading with all-negative scores", () => {
    const reading = computeReading("VNM", NEGATIVE_SCORES);

    expect(reading.stockCode).toBe("VNM");
    expect(reading.queChiNh.number).toBeGreaterThanOrEqual(1);
    expect(reading.queChiNh.confidence).toBeGreaterThanOrEqual(0);
    expect(reading.queChiNh.confidence).toBeLessThanOrEqual(1);

    // All-negative → all lines are LAO_AM or THIEU_AM → binary all 0 → Khon (2)
    for (const hao of reading.haos) {
      expect(hao.binary).toBe(0);
    }
    // Khon is hexagram 2 (all Yin)
    expect(reading.queChiNh.number).toBe(2);
  });

  it("returns a valid reading with mixed scores (some Lao, some Thieu)", () => {
    const reading = computeReading("FPT", MIXED_SCORES);

    expect(reading.stockCode).toBe("FPT");
    expect(reading.queChiNh.number).toBeGreaterThanOrEqual(1);
    expect(reading.queChiNh.number).toBeLessThanOrEqual(64);

    // Mixed scores produce some changing lines
    // scores[0]=0.85 → LAO_DUONG, scores[1]=-0.85 → LAO_AM → both changing
    expect(reading.changingLines).toContain(1);
    expect(reading.changingLines).toContain(2);
  });

  it("queChiNh resolves to correct hexagram from all-1 signals (Kien = 1)", () => {
    // All scores > 0.75 → LAO_DUONG → binary=1 → Kien/Kien → que 1
    const scores = [0.9, 0.9, 0.9, 0.9, 0.9, 0.9];
    const reading = computeReading("TEST", scores);
    expect(reading.queChiNh.number).toBe(1);
  });

  it("hoQue correctly computed from inner lines (Kien gives hoQue=1)", () => {
    // All-1 signals → Kien. Ho que uses lines[1,2,3,2,3,4] = all 1s = Kien = 1
    const scores = [0.9, 0.9, 0.9, 0.9, 0.9, 0.9];
    const reading = computeReading("TEST", scores);
    expect(reading.hoQue.number).toBe(1);
  });

  it("hoQue correctly computed for Khon (all 0s)", () => {
    // All-negative scores → all-0 → Khon. Ho que also all 0s = Khon = 2
    const scores = [-0.9, -0.9, -0.9, -0.9, -0.9, -0.9];
    const reading = computeReading("TEST", scores);
    expect(reading.hoQue.number).toBe(2);
  });

  it("bienQue computed from Lao line flips", () => {
    // scores[0]=0.9 (LAO_DUONG=1 flips to 0), rest all stable Yang (THIEU_DUONG)
    const scores = [0.9, 0.5, 0.5, 0.5, 0.5, 0.5];
    const reading = computeReading("TEST", scores);

    // There should be 1 changing line at position 1
    expect(reading.changingLines).toHaveLength(1);
    expect(reading.changingLines[0]).toBe(1);

    // bienQue ≠ queChiNh (because one line was flipped)
    expect(reading.bienQue.number).not.toBe(reading.queChiNh.number);
  });

  it("bienQue equals queChiNh when no Lao lines (no changes)", () => {
    // All scores in THIEU range: no LAO → no changing → bienQue = queChiNh
    const scores = [0.5, 0.3, 0.2, 0.4, 0.3, 0.5];
    const reading = computeReading("TEST", scores);

    expect(reading.changingLines).toHaveLength(0);
    expect(reading.bienQue.number).toBe(reading.queChiNh.number);
  });

  it("nguHanh populated with correct elements from trigrams", () => {
    // All-1 → Kien (upper=Kien/element=Kim, lower=Kien/element=Kim) → SAME
    const scores = [0.9, 0.9, 0.9, 0.9, 0.9, 0.9];
    const reading = computeReading("TEST", scores);

    expect(reading.nguHanh.lower).toBe("Kim");
    expect(reading.nguHanh.upper).toBe("Kim");
    expect(reading.nguHanh.dynamic).toBe("SAME");
  });

  it("changingLines matches Lao positions", () => {
    // scores[0]=0.9→LAO_DUONG(1), scores[3]=-0.8→LAO_AM(3) → positions 1 and 4
    const scores = [0.9, 0.3, -0.2, -0.8, 0.3, -0.2];
    const reading = computeReading("TEST", scores);

    expect(reading.changingLines).toContain(1);
    expect(reading.changingLines).toContain(4);
    expect(reading.changingLines).toHaveLength(2);
  });

  it("tradingSignal extracted from hexagram data is non-empty", () => {
    const reading = computeReading("VCB", POSITIVE_SCORES);
    expect(reading.queChiNh.tradingSignal.length).toBeGreaterThan(0);

    // Should contain one of the expected action keywords
    const signal = reading.queChiNh.tradingSignal.toUpperCase();
    const validActions = ["MUA", "BAN", "GIU", "CHO", "THAN TRONG"];
    const hasValidAction = validActions.some((a) => signal.includes(a));
    expect(hasValidAction).toBe(true);
  });

  it("actionNote contains Vietnamese recommendation keyword", () => {
    const reading = computeReading("VCB", POSITIVE_SCORES);
    expect(reading.actionNote).toContain("KHUYEN NGHI:");

    const note = reading.actionNote.toUpperCase();
    const validActions = ["MUA", "BAN", "GIU", "CHO", "THAN TRONG"];
    const hasValidAction = validActions.some((a) => note.includes(a));
    expect(hasValidAction).toBe(true);
  });

  it("with markov data: confidence is adjusted and markov field is populated", () => {
    const reading = computeReading("VCB", POSITIVE_SCORES, MARKOV);

    // Markov field present
    expect(reading.markov).not.toBeNull();
    expect(reading.markov?.nextMostLikely).toBe(11);
    expect(reading.markov?.nextName).toBe("Thai");
    expect(reading.markov?.probability).toBe(0.72);

    // Confidence adjusted (should differ from without markov)
    const readingWithout = computeReading("VCB", POSITIVE_SCORES);
    // With markov prob=0.72, confidence is blended with it — likely higher
    // Just check it's still in valid range
    expect(reading.queChiNh.confidence).toBeGreaterThanOrEqual(0);
    expect(reading.queChiNh.confidence).toBeLessThanOrEqual(1);

    // Verify blend formula: c_new = c_old*0.7 + 0.72*0.3 — result will differ
    expect(reading.queChiNh.confidence).not.toBe(readingWithout.queChiNh.confidence);
  });

  it("without markov data: markov is null", () => {
    const reading = computeReading("VCB", POSITIVE_SCORES);
    expect(reading.markov).toBeNull();
  });

  it("throws if scores array has wrong length", () => {
    expect(() => computeReading("VCB", [0.5, 0.5])).toThrow();
  });
});

// ── formatReading ──────────────────────────────────────────────────────────────

describe("Task 284 — formatReading", () => {
  let reading: KinhDichReading;

  // Use a single reading for format tests
  reading = computeReading("VCB", POSITIVE_SCORES);

  it("produces a non-empty string", () => {
    const output = formatReading(reading);
    expect(typeof output).toBe("string");
    expect(output.length).toBeGreaterThan(100);
  });

  it("includes header with stock code and hexagram name", () => {
    const output = formatReading(reading);
    expect(output).toContain("KINH DICH:");
    expect(output).toContain("VCB");
    expect(output).toContain(reading.queChiNh.name);
    expect(output).toContain(String(reading.queChiNh.number));
  });

  it("includes que chinh section", () => {
    const output = formatReading(reading);
    expect(output).toContain("Que chinh:");
    expect(output).toContain("Xu huong:");
  });

  it("includes 6 hao section", () => {
    const output = formatReading(reading);
    expect(output).toContain("6 Hao:");
    expect(output).toContain("So hao");
    expect(output).toContain("Nhi hao");
    expect(output).toContain("Tam hao");
    expect(output).toContain("Tu hao");
    expect(output).toContain("Ngu hao");
    expect(output).toContain("Thuong hao");
  });

  it("includes Lao state indicator ⚡ for Lao haos", () => {
    // POSITIVE_SCORES has some LAO_DUONG scores (0.9, 0.8 > 0.75)
    const output = formatReading(reading);
    // At least one ⚡ should appear for LAO lines
    expect(output).toContain("⚡");
  });

  it("includes hao dong section", () => {
    const output = formatReading(reading);
    expect(output).toContain("Hao dong:");
  });

  it("includes ho que and bien que sections", () => {
    const output = formatReading(reading);
    expect(output).toContain("Ho que (an sau):");
    expect(output).toContain("Bien que (tuong lai):");
  });

  it("includes ngu hanh section", () => {
    const output = formatReading(reading);
    expect(output).toContain("Ngu Hanh:");
  });

  it("includes action note with KHUYEN NGHI", () => {
    const output = formatReading(reading);
    expect(output).toContain("KHUYEN NGHI:");
  });

  it("does NOT include Markov section when markov is null", () => {
    const r = computeReading("VCB", POSITIVE_SCORES);
    expect(r.markov).toBeNull();
    const output = formatReading(r);
    expect(output).not.toContain("Markov:");
  });

  it("includes Markov section when markov data present", () => {
    const r = computeReading("VCB", POSITIVE_SCORES, MARKOV);
    expect(r.markov).not.toBeNull();
    const output = formatReading(r);
    expect(output).toContain("Markov:");
    expect(output).toContain("Thai");
    expect(output).toContain("72%");
  });

  it("formatReading with all sections for mixed scores (some Lao)", () => {
    const r = computeReading("FPT", MIXED_SCORES);
    const output = formatReading(r);

    // All key sections must be present
    expect(output).toContain("=== KINH DICH:");
    expect(output).toContain("Que chinh:");
    expect(output).toContain("6 Hao:");
    expect(output).toContain("Hao dong:");
    expect(output).toContain("Ho que (an sau):");
    expect(output).toContain("Bien que (tuong lai):");
    expect(output).toContain("Ngu Hanh:");
    expect(output).toContain("KHUYEN NGHI:");
  });

  it("hao dong section mentions changing line positions when present", () => {
    // scores[0]=0.85→LAO_DUONG, scores[1]=-0.85→LAO_AM → hao dong at 1,2
    const r = computeReading("VCB", MIXED_SCORES);
    const output = formatReading(r);
    expect(output).toContain("Hao dong:");
    // Should mention at least one of the changing line positions
    const haoDongLine = output.split("\n").find((l) => l.startsWith("Hao dong:")) ?? "";
    // Positions 1 and 2 are changing
    expect(haoDongLine).toContain("1");
    expect(haoDongLine).toContain("2");
  });

  it("stable reading shows no-change message in hao dong", () => {
    // All THIEU scores → no Lao → no changing lines
    const r = computeReading("VCB", [0.5, 0.3, 0.2, 0.4, 0.3, 0.5]);
    const output = formatReading(r);
    const haoDongLine = output.split("\n").find((l) => l.startsWith("Hao dong:")) ?? "";
    expect(haoDongLine).toContain("Khong co hao dong");
  });
});
