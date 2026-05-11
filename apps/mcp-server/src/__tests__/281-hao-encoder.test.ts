// src/__tests__/281-hao-encoder.test.ts
import { describe, it, expect } from "bun:test";
import {
  classifyHao,
  encodeHaos,
  haosToSignals,
} from "../domain/services/kinhDich/haoEncoder.js";

describe("Task 281 — Hao Encoder", () => {
  // ── classifyHao: basic state classification ─────────────────────────────────

  describe("classifyHao", () => {
    it("returns LAO_DUONG for score above 0.75 threshold", () => {
      expect(classifyHao(0.8)).toBe("LAO_DUONG");
      expect(classifyHao(1.0)).toBe("LAO_DUONG");
      expect(classifyHao(0.76)).toBe("LAO_DUONG");
    });

    it("returns THIEU_DUONG for score between 0.10 and 0.75 (inclusive)", () => {
      expect(classifyHao(0.5)).toBe("THIEU_DUONG");
      expect(classifyHao(0.10)).toBe("THIEU_DUONG");
      expect(classifyHao(0.75)).toBe("THIEU_DUONG");
      expect(classifyHao(0.11)).toBe("THIEU_DUONG");
    });

    it("returns THIEU_AM for score between -0.75 and +0.10 (exclusive upper)", () => {
      expect(classifyHao(0.05)).toBe("THIEU_AM");
      expect(classifyHao(0.0)).toBe("THIEU_AM");
      expect(classifyHao(-0.3)).toBe("THIEU_AM");
      expect(classifyHao(-0.74)).toBe("THIEU_AM");
      expect(classifyHao(-0.75)).toBe("THIEU_AM");
    });

    it("returns LAO_AM for score below -0.75 threshold", () => {
      expect(classifyHao(-0.9)).toBe("LAO_AM");
      expect(classifyHao(-1.0)).toBe("LAO_AM");
      expect(classifyHao(-0.76)).toBe("LAO_AM");
    });

    // Boundary conditions
    it("treats score exactly at +0.75 as THIEU_DUONG (not LAO_DUONG)", () => {
      expect(classifyHao(0.75)).toBe("THIEU_DUONG");
    });

    it("treats score exactly at +0.10 as THIEU_DUONG (threshold inclusive)", () => {
      expect(classifyHao(0.10)).toBe("THIEU_DUONG");
    });

    it("treats score exactly at -0.75 as THIEU_AM (not LAO_AM)", () => {
      expect(classifyHao(-0.75)).toBe("THIEU_AM");
    });

    it("treats score just above LAO_AM threshold as THIEU_AM", () => {
      expect(classifyHao(-0.749)).toBe("THIEU_AM");
    });
  });

  // ── Binary and isChanging mapping ───────────────────────────────────────────

  describe("binary and isChanging mapping", () => {
    it("LAO_DUONG → binary=1, isChanging=true", () => {
      const haos = encodeHaos([0.8, 0, 0, 0, 0, 0]);
      const h = haos[0]!;
      expect(h.state).toBe("LAO_DUONG");
      expect(h.binary).toBe(1);
      expect(h.isChanging).toBe(true);
    });

    it("THIEU_DUONG → binary=1, isChanging=false", () => {
      const haos = encodeHaos([0.5, 0, 0, 0, 0, 0]);
      const h = haos[0]!;
      expect(h.state).toBe("THIEU_DUONG");
      expect(h.binary).toBe(1);
      expect(h.isChanging).toBe(false);
    });

    it("THIEU_AM → binary=0, isChanging=false", () => {
      const haos = encodeHaos([-0.3, 0, 0, 0, 0, 0]);
      const h = haos[0]!;
      expect(h.state).toBe("THIEU_AM");
      expect(h.binary).toBe(0);
      expect(h.isChanging).toBe(false);
    });

    it("LAO_AM → binary=0, isChanging=true", () => {
      const haos = encodeHaos([-0.9, 0, 0, 0, 0, 0]);
      const h = haos[0]!;
      expect(h.state).toBe("LAO_AM");
      expect(h.binary).toBe(0);
      expect(h.isChanging).toBe(true);
    });
  });

  // ── encodeHaos: 6 readings returned correctly ───────────────────────────────

  describe("encodeHaos", () => {
    it("returns an array of exactly 6 HaoReadings", () => {
      const result = encodeHaos([0.8, 0.5, 0.05, -0.3, -0.9, 0.1]);
      expect(result).toHaveLength(6);
    });

    it("assigns positions 1 through 6 in order", () => {
      const result = encodeHaos([0.8, 0.5, 0.05, -0.3, -0.9, 0.1]);
      for (let i = 0; i < 6; i++) {
        expect(result[i]!.position).toBe((i + 1) as 1|2|3|4|5|6);
      }
    });

    it("assigns correct states for each score in a mixed array", () => {
      const scores = [0.8, 0.5, 0.05, -0.3, -0.9, 0.75];
      const result = encodeHaos(scores);

      expect(result[0]!.state).toBe("LAO_DUONG");   // 0.8
      expect(result[1]!.state).toBe("THIEU_DUONG"); // 0.5
      expect(result[2]!.state).toBe("THIEU_AM");    // 0.05
      expect(result[3]!.state).toBe("THIEU_AM");    // -0.3
      expect(result[4]!.state).toBe("LAO_AM");      // -0.9
      expect(result[5]!.state).toBe("THIEU_DUONG"); // 0.75 (boundary: THIEU_DUONG)
    });

    it("stores the rawScore value accurately", () => {
      const scores = [0.8, 0.5, 0.05, -0.3, -0.9, 0.1];
      const result = encodeHaos(scores);
      for (let i = 0; i < 6; i++) {
        expect(result[i]!.rawScore).toBeCloseTo(scores[i]!, 10);
      }
    });

    it("assigns correct labels for all 6 positions", () => {
      const result = encodeHaos([0, 0, 0, 0, 0, 0]);
      expect(result[0]!.label).toContain("So hao");
      expect(result[1]!.label).toContain("Nhi hao");
      expect(result[2]!.label).toContain("Tam hao");
      expect(result[3]!.label).toContain("Tu hao");
      expect(result[4]!.label).toContain("Ngu hao");
      expect(result[5]!.label).toContain("Thuong hao");
    });

    it("throws when fewer than 6 scores are provided", () => {
      expect(() => encodeHaos([0.1, 0.2])).toThrow();
    });

    it("throws when more than 6 scores are provided", () => {
      expect(() => encodeHaos([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7])).toThrow();
    });

    it("clamps scores above +1.0 to +1.0 (treated as LAO_DUONG)", () => {
      const result = encodeHaos([1.5, 0, 0, 0, 0, 0]);
      expect(result[0]!.state).toBe("LAO_DUONG");
      expect(result[0]!.rawScore).toBe(1.0);
    });

    it("clamps scores below -1.0 to -1.0 (treated as LAO_AM)", () => {
      const result = encodeHaos([-1.5, 0, 0, 0, 0, 0]);
      expect(result[0]!.state).toBe("LAO_AM");
      expect(result[0]!.rawScore).toBe(-1.0);
    });

    it("all-Yang: 6 scores all above LAO_DUONG threshold → all LAO_DUONG", () => {
      const result = encodeHaos([0.9, 0.9, 0.9, 0.9, 0.9, 0.9]);
      for (const hao of result) {
        expect(hao.state).toBe("LAO_DUONG");
        expect(hao.binary).toBe(1);
        expect(hao.isChanging).toBe(true);
      }
    });

    it("all-Yin: 6 scores all below LAO_AM threshold → all LAO_AM", () => {
      const result = encodeHaos([-0.9, -0.9, -0.9, -0.9, -0.9, -0.9]);
      for (const hao of result) {
        expect(hao.state).toBe("LAO_AM");
        expect(hao.binary).toBe(0);
        expect(hao.isChanging).toBe(true);
      }
    });
  });

  // ── haosToSignals ────────────────────────────────────────────────────────────

  describe("haosToSignals", () => {
    it("extracts binary values in order from a HaoReading array", () => {
      const haos = encodeHaos([0.8, 0.5, -0.3, -0.9, 0.2, -0.8]);
      const signals = haosToSignals(haos);
      expect(signals).toEqual([1, 1, 0, 0, 1, 0]);
    });

    it("returns array of length 6", () => {
      const haos = encodeHaos([0, 0, 0, 0, 0, 0]);
      expect(haosToSignals(haos)).toHaveLength(6);
    });

    it("all Yang signals when all haos are Yang states", () => {
      const haos = encodeHaos([0.9, 0.5, 0.5, 0.9, 0.3, 0.2]);
      expect(haosToSignals(haos)).toEqual([1, 1, 1, 1, 1, 1]);
    });

    it("all Yin signals when all haos are Yin states", () => {
      const haos = encodeHaos([-0.9, -0.5, -0.5, -0.9, -0.3, -0.2]);
      expect(haosToSignals(haos)).toEqual([0, 0, 0, 0, 0, 0]);
    });

    it("binary values from haosToSignals are valid input for resolveHexagram", () => {
      // Integration check: result must be 0s and 1s only
      const haos = encodeHaos([0.8, 0.5, 0.05, -0.3, -0.9, 0.1]);
      const signals = haosToSignals(haos);
      for (const s of signals) {
        expect(s === 0 || s === 1).toBe(true);
      }
    });
  });
});
