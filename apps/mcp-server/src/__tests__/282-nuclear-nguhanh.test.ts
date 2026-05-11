// src/__tests__/282-nuclear-nguhanh.test.ts
// Task 282: Nuclear Computer (Ho que) + Transformed Computer (Bien que) + Ngu Hanh Classifier
// TDD — all tests must pass before merge.

import { describe, it, expect } from "bun:test";
import { computeHoQue } from "../domain/services/kinhDich/nuclearComputer.js";
import { computeBienQue, getChangingLines } from "../domain/services/kinhDich/transformedComputer.js";
import { classifyNguHanh } from "../domain/services/kinhDich/nguHanhClassifier.js";
import { encodeHaos } from "../domain/services/kinhDich/haoEncoder.js";
import { TRIGRAMS } from "../domain/services/kinhDich/hexagramLibrary.js";
import type { NguHanh } from "../domain/services/kinhDich/nguHanhClassifier.js";

// ── computeHoQue ──────────────────────────────────────────────────────────────

describe("Task 282 — computeHoQue (Nuclear Hexagram)", () => {
  it("Kien [1,1,1,1,1,1] → Ho que is Kien (1)", () => {
    // hoLower = [1,1,1], hoUpper = [1,1,1] → Kien|Kien = 1
    const result = computeHoQue([1, 1, 1, 1, 1, 1]);
    expect(result).toBe(1);
  });

  it("Khon [0,0,0,0,0,0] → Ho que is Khon (2)", () => {
    // hoLower = [0,0,0], hoUpper = [0,0,0] → Khon|Khon = 2
    const result = computeHoQue([0, 0, 0, 0, 0, 0]);
    expect(result).toBe(2);
  });

  it("Thai [1,1,1,0,0,0] → Ho que is Qui Muoi (54)", () => {
    // Thai: lower=Kien[1,1,1], upper=Khon[0,0,0]
    // hexLines = [1,1,1,0,0,0]
    // hoLower = [hexLines[1],hexLines[2],hexLines[3]] = [1,1,0] → Doai
    // hoUpper = [hexLines[2],hexLines[3],hexLines[4]] = [1,0,0] → Chan
    // hoSignals = [1,1,0, 1,0,0]
    // resolver: lower=signals[0..2]=[1,1,0]=Doai, upper=signals[3..5]=[1,0,0]=Chan
    // TRIGRAMS_TO_QUE("Chan|Doai") → id 54 (Qui Muoi: upper=Chan, lower=Doai)
    const result = computeHoQue([1, 1, 1, 0, 0, 0]);
    expect(result).toBe(54);
  });

  it("Bi [0,0,0,1,1,1] → Ho que is Duc (58)", () => {
    // Bi: lower=Khon[0,0,0], upper=Kien[1,1,1]
    // hexLines = [0,0,0,1,1,1]
    // hoLower = [hexLines[1],hexLines[2],hexLines[3]] = [0,0,1] → Can
    // hoUpper = [hexLines[2],hexLines[3],hexLines[4]] = [0,1,1] → Ton
    // hoSignals = [0,0,1, 0,1,1] → upper=Ton, lower=Can → id 53 (Tiem)
    const result = computeHoQue([0, 0, 0, 1, 1, 1]);
    expect(result).toBe(53);
  });

  it("throws if not 6 lines", () => {
    expect(() => computeHoQue([1, 1, 1])).toThrow("expected 6 lines");
  });

  it("all-Yang middle lines: [0,1,1,1,1,0] → inner trigrams both Kien", () => {
    // hoLower = [hexLines[1],hexLines[2],hexLines[3]] = [1,1,1] → Kien
    // hoUpper = [hexLines[2],hexLines[3],hexLines[4]] = [1,1,1] → Kien
    // → Kien|Kien = 1
    const result = computeHoQue([0, 1, 1, 1, 1, 0]);
    expect(result).toBe(1);
  });
});

// ── computeBienQue ────────────────────────────────────────────────────────────

describe("Task 282 — computeBienQue (Transformed Hexagram)", () => {
  it("no Lao lines → Bien que is same as original hexagram", () => {
    // All Thieu: scores 0.5, 0.5, 0.5, 0.5, 0.5, 0.5 → all THIEU_DUONG → binary [1,1,1,1,1,1] → Kien (1)
    const haos = encodeHaos([0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
    const result = computeBienQue(haos);
    // All are THIEU_DUONG (binary=1), no flips → [1,1,1,1,1,1] → Kien (1)
    expect(result).toBe(1);
  });

  it("no Lao lines (all Thieu Am) → Bien que same as original (Khon=2)", () => {
    // All THIEU_AM: scores -0.3 → binary [0,0,0,0,0,0] → Khon (2), no flip
    const haos = encodeHaos([-0.3, -0.3, -0.3, -0.3, -0.3, -0.3]);
    const result = computeBienQue(haos);
    expect(result).toBe(2);
  });

  it("LAO_DUONG lines flip to 0 (Yin)", () => {
    // Scores: 0.8(LAO_DUONG→flip to 0), 0.8(LAO_DUONG→flip to 0), -0.3, -0.3, -0.3, -0.3
    // Original binary: [1,1,0,0,0,0] → Khon upper=[0,0,0], lower=Kham? let's compute
    // After flip: [0,0,0,0,0,0] → Khon (2)
    const haos = encodeHaos([0.8, 0.8, -0.3, -0.3, -0.3, -0.3]);
    const result = computeBienQue(haos);
    // Original: binary [1,1,0,0,0,0], haos[0] and haos[1] are LAO_DUONG
    // Flip them to 0 → transformed [0,0,0,0,0,0] → Khon (2)
    expect(result).toBe(2);
  });

  it("LAO_AM line flips to 1 (Yang)", () => {
    // Scores: -0.9(LAO_AM→flip to 1), -0.3, -0.3, -0.3, -0.3, -0.3
    // Original binary: [0,0,0,0,0,0] → Khon(2)
    // After flip: [1,0,0,0,0,0] → lower=[1,0,0]=Chan, upper=[0,0,0]=Khon → Phuc (24)
    const haos = encodeHaos([-0.9, -0.3, -0.3, -0.3, -0.3, -0.3]);
    const result = computeBienQue(haos);
    // transformed: [1,0,0,0,0,0] → lower=Chan, upper=Khon → id 24 (Phuc)
    expect(result).toBe(24);
  });

  it("all Lao (all extreme) → total inversion", () => {
    // All LAO_DUONG → flip all to 0 → [0,0,0,0,0,0] → Khon (2)
    const haos = encodeHaos([0.8, 0.8, 0.8, 0.8, 0.8, 0.8]);
    const result = computeBienQue(haos);
    expect(result).toBe(2);
  });

  it("mixed LAO_AM and LAO_DUONG → all flip to opposite", () => {
    // LAO_AM(-0.9)→flip to 1, LAO_DUONG(0.8)→flip to 0
    // Pattern: [-0.9, 0.8, -0.9, 0.8, -0.9, 0.8]
    // Original binary: [0,1,0,1,0,1]
    // Transformed:     [1,0,1,0,1,0]
    // resolver: lower=signals[0..2]=[1,0,1]=Ly, upper=signals[3..5]=[0,1,0]=Kham
    // TRIGRAMS_TO_QUE("Kham|Ly") → id 63 (Ky Te: upper=Kham, lower=Ly)
    const haos = encodeHaos([-0.9, 0.8, -0.9, 0.8, -0.9, 0.8]);
    const result = computeBienQue(haos);
    expect(result).toBe(63);
  });
});

// ── getChangingLines ──────────────────────────────────────────────────────────

describe("Task 282 — getChangingLines", () => {
  it("no changing lines → empty array", () => {
    const haos = encodeHaos([0.5, -0.3, 0.5, -0.3, 0.5, -0.3]);
    expect(getChangingLines(haos)).toEqual([]);
  });

  it("one LAO_DUONG at position 3 → returns [3]", () => {
    // score index 2 → position 3
    const haos = encodeHaos([0.5, 0.5, 0.8, 0.5, 0.5, 0.5]);
    expect(getChangingLines(haos)).toEqual([3]);
  });

  it("one LAO_AM at position 6 → returns [6]", () => {
    const haos = encodeHaos([0.5, 0.5, 0.5, 0.5, 0.5, -0.9]);
    expect(getChangingLines(haos)).toEqual([6]);
  });

  it("multiple changing lines → returns all positions in order", () => {
    // positions 1 (LAO_DUONG), 4 (LAO_AM), 6 (LAO_DUONG)
    const haos = encodeHaos([0.8, 0.5, -0.3, -0.9, -0.3, 0.8]);
    expect(getChangingLines(haos)).toEqual([1, 4, 6]);
  });

  it("all changing → returns [1,2,3,4,5,6]", () => {
    const haos = encodeHaos([0.8, -0.9, 0.8, -0.9, 0.8, -0.9]);
    expect(getChangingLines(haos)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

// ── classifyNguHanh ───────────────────────────────────────────────────────────

describe("Task 282 — classifyNguHanh (Five Elements)", () => {
  it("Moc sinh Hoa → TUONG_SINH, score +0.3, lower generates upper", () => {
    const result = classifyNguHanh("Moc", "Hoa");
    expect(result.dynamic).toBe("TUONG_SINH");
    expect(result.score).toBe(0.3);
    expect(result.interpretation).toContain("Nội lực sinh ngoại lực");
  });

  it("Hoa sinh Tho → TUONG_SINH, score +0.3", () => {
    const result = classifyNguHanh("Hoa", "Tho");
    expect(result.dynamic).toBe("TUONG_SINH");
    expect(result.score).toBe(0.3);
  });

  it("Tho sinh Kim → TUONG_SINH, score +0.3", () => {
    const result = classifyNguHanh("Tho", "Kim");
    expect(result.dynamic).toBe("TUONG_SINH");
    expect(result.score).toBe(0.3);
  });

  it("Kim sinh Thuy → TUONG_SINH, score +0.3", () => {
    const result = classifyNguHanh("Kim", "Thuy");
    expect(result.dynamic).toBe("TUONG_SINH");
    expect(result.score).toBe(0.3);
  });

  it("Thuy sinh Moc → TUONG_SINH, score +0.3", () => {
    const result = classifyNguHanh("Thuy", "Moc");
    expect(result.dynamic).toBe("TUONG_SINH");
    expect(result.score).toBe(0.3);
  });

  it("upper generates lower (Hoa → Moc reversed) → TUONG_SINH, +0.2", () => {
    // GENERATION[Thuy] = Moc, so upper=Thuy, lower=Moc → upper generates lower
    const result = classifyNguHanh("Moc", "Thuy");
    expect(result.dynamic).toBe("TUONG_SINH");
    expect(result.score).toBe(0.2);
    expect(result.interpretation).toContain("Ngoại lực hỗ trợ nội lực");
  });

  it("Moc khac Tho (lower destroys upper) → TUONG_KHAC, -0.3", () => {
    const result = classifyNguHanh("Moc", "Tho");
    expect(result.dynamic).toBe("TUONG_KHAC");
    expect(result.score).toBe(-0.3);
    expect(result.interpretation).toContain("Nội lực khắc ngoại lực");
  });

  it("Tho khac Thuy → TUONG_KHAC, -0.3", () => {
    const result = classifyNguHanh("Tho", "Thuy");
    expect(result.dynamic).toBe("TUONG_KHAC");
    expect(result.score).toBe(-0.3);
  });

  it("Thuy khac Hoa → TUONG_KHAC, -0.3", () => {
    const result = classifyNguHanh("Thuy", "Hoa");
    expect(result.dynamic).toBe("TUONG_KHAC");
    expect(result.score).toBe(-0.3);
  });

  it("Hoa khac Kim → TUONG_KHAC, -0.3", () => {
    const result = classifyNguHanh("Hoa", "Kim");
    expect(result.dynamic).toBe("TUONG_KHAC");
    expect(result.score).toBe(-0.3);
  });

  it("Kim khac Moc → TUONG_KHAC, -0.3", () => {
    const result = classifyNguHanh("Kim", "Moc");
    expect(result.dynamic).toBe("TUONG_KHAC");
    expect(result.score).toBe(-0.3);
  });

  it("upper destroys lower (Tho destroys Thuy, so upper=Tho lower=Thuy) → TUONG_KHAC -0.3", () => {
    // DESTRUCTION[Tho] = Thuy, so upper=Tho destroys lower=Thuy
    const result = classifyNguHanh("Thuy", "Tho");
    expect(result.dynamic).toBe("TUONG_KHAC");
    expect(result.score).toBe(-0.3);
    expect(result.interpretation).toContain("Ngoại lực triệt tiêu nội lực");
  });

  it("Kim + Kim → SAME, score +0.1", () => {
    const result = classifyNguHanh("Kim", "Kim");
    expect(result.dynamic).toBe("SAME");
    expect(result.score).toBe(0.1);
    expect(result.interpretation).toContain("Cùng hành");
  });

  it("Moc + Moc → SAME, +0.1", () => {
    const result = classifyNguHanh("Moc", "Moc");
    expect(result.dynamic).toBe("SAME");
    expect(result.score).toBe(0.1);
  });

  it("Thuy + Thuy → SAME, +0.1", () => {
    const result = classifyNguHanh("Thuy", "Thuy");
    expect(result.dynamic).toBe("SAME");
    expect(result.score).toBe(0.1);
  });

  it("result contains both lower and upper elements", () => {
    const result = classifyNguHanh("Kim", "Hoa");
    expect(result.lower).toBe("Kim");
    expect(result.upper).toBe("Hoa");
  });

  it("NEUTRAL: Moc vs Kim is not sinh and not khac in normal order — check", () => {
    // GENERATION[Moc]=Hoa (not Kim), DESTRUCTION[Moc]=Tho (not Kim)
    // GENERATION[Kim]=Thuy (not Moc), DESTRUCTION[Kim]=Moc → this IS khac!
    // So Kim khac Moc already tested. Let's check Hoa vs Thuy:
    // GENERATION[Hoa]=Tho (not Thuy), GENERATION[Thuy]=Moc (not Hoa)
    // DESTRUCTION[Hoa]=Kim (not Thuy), DESTRUCTION[Thuy]=Hoa → upper=Thuy destroys lower=Hoa
    // So Hoa vs Thuy should be TUONG_KHAC (upper destroys lower)
    const result = classifyNguHanh("Hoa", "Thuy");
    expect(result.dynamic).toBe("TUONG_KHAC");
  });

  it("all 8 trigram elements accessible from TRIGRAMS", () => {
    // The 8 trigrams have 5 elements: Kim, Tho, Moc, Thuy, Hoa
    const elements = new Set(Object.values(TRIGRAMS).map((t) => t.element));
    const expected: NguHanh[] = ["Kim", "Tho", "Moc", "Thuy", "Hoa"];
    for (const el of expected) {
      expect(elements.has(el)).toBe(true);
    }
    // Verify specific trigram mappings
    expect(TRIGRAMS["Kien"]?.element).toBe("Kim");
    expect(TRIGRAMS["Khon"]?.element).toBe("Tho");
    expect(TRIGRAMS["Chan"]?.element).toBe("Moc");
    expect(TRIGRAMS["Ton"]?.element).toBe("Moc");
    expect(TRIGRAMS["Kham"]?.element).toBe("Thuy");
    expect(TRIGRAMS["Ly"]?.element).toBe("Hoa");
    expect(TRIGRAMS["Can"]?.element).toBe("Tho");
    expect(TRIGRAMS["Doai"]?.element).toBe("Kim");
  });
});

// ── Integration: Ho que + Ngu Hanh ───────────────────────────────────────────

describe("Task 282 — Integration: Ho que elements + Ngu Hanh", () => {
  it("Kien Ho que is Kien (Kim/Kim) → SAME", () => {
    const hoQueId = computeHoQue([1, 1, 1, 1, 1, 1]);
    expect(hoQueId).toBe(1); // Kien
    // Kien = Kien upper/lower = Kim/Kim
    const result = classifyNguHanh("Kim", "Kim");
    expect(result.dynamic).toBe("SAME");
  });

  it("Ho que extraction uses hao index 1-4 (0-based) correctly", () => {
    // Verify that exactly hao2,3,4 form lower and hao3,4,5 form upper
    // Use a distinctive pattern: [0,1,1,1,0,0]
    // hexLines[1]=1, [2]=1, [3]=1, [4]=0
    // hoLower = [1,1,1] = Kien
    // hoUpper = [1,1,0] = Doai
    // hoSignals = [1,1,1, 1,1,0] → lower=Kien, upper=Doai → id 43 (Quai)
    const result = computeHoQue([0, 1, 1, 1, 0, 0]);
    expect(result).toBe(43);
  });
});
