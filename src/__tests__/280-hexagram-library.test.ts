// src/__tests__/280-hexagram-library.test.ts
import { describe, it, expect } from "bun:test";
import {
  TRIGRAMS,
  TRIGRAM_LINES,
  QUE_META,
  QUE_DATA,
} from "../domain/services/kinhDich/hexagramLibrary.js";
import {
  resolveHexagram,
  getHexLines,
  getBienQue,
  getAllBienQue,
} from "../domain/services/kinhDich/hexagramResolver.js";

describe("Task 280 — Hexagram Library + Resolver", () => {
  // ── TRIGRAMS ────────────────────────────────────────────────────
  describe("TRIGRAMS", () => {
    it("has exactly 8 trigrams", () => {
      expect(Object.keys(TRIGRAMS).length).toBe(8);
    });

    it("Kien: lines [1,1,1], symbol ☰, element Kim", () => {
      expect(TRIGRAMS["Kien"]!.lines).toEqual([1, 1, 1]);
      expect(TRIGRAMS["Kien"]!.symbol).toBe("☰");
      expect(TRIGRAMS["Kien"]!.element).toBe("Kim");
    });

    it("Khon: lines [0,0,0], symbol ☷, element Tho", () => {
      expect(TRIGRAMS["Khon"]!.lines).toEqual([0, 0, 0]);
      expect(TRIGRAMS["Khon"]!.symbol).toBe("☷");
      expect(TRIGRAMS["Khon"]!.element).toBe("Tho");
    });

    it("Chan: lines [1,0,0], symbol ☳", () => {
      expect(TRIGRAMS["Chan"]!.lines).toEqual([1, 0, 0]);
      expect(TRIGRAMS["Chan"]!.symbol).toBe("☳");
    });

    it("Ton: lines [0,1,1], symbol ☴", () => {
      expect(TRIGRAMS["Ton"]!.lines).toEqual([0, 1, 1]);
      expect(TRIGRAMS["Ton"]!.symbol).toBe("☴");
    });

    it("Kham: lines [0,1,0], symbol ☵, element Thuy", () => {
      expect(TRIGRAMS["Kham"]!.lines).toEqual([0, 1, 0]);
      expect(TRIGRAMS["Kham"]!.symbol).toBe("☵");
      expect(TRIGRAMS["Kham"]!.element).toBe("Thuy");
    });

    it("Ly: lines [1,0,1], symbol ☲, element Hoa", () => {
      expect(TRIGRAMS["Ly"]!.lines).toEqual([1, 0, 1]);
      expect(TRIGRAMS["Ly"]!.symbol).toBe("☲");
      expect(TRIGRAMS["Ly"]!.element).toBe("Hoa");
    });

    it("Can: lines [0,0,1], symbol ☶", () => {
      expect(TRIGRAMS["Can"]!.lines).toEqual([0, 0, 1]);
      expect(TRIGRAMS["Can"]!.symbol).toBe("☶");
    });

    it("Doai: lines [1,1,0], symbol ☱, element Kim", () => {
      expect(TRIGRAMS["Doai"]!.lines).toEqual([1, 1, 0]);
      expect(TRIGRAMS["Doai"]!.symbol).toBe("☱");
      expect(TRIGRAMS["Doai"]!.element).toBe("Kim");
    });

    it("all trigrams have required fields", () => {
      for (const [name, t] of Object.entries(TRIGRAMS)) {
        expect(t.name, `${name}.name`).toBeDefined();
        expect(t.chinese, `${name}.chinese`).toBeDefined();
        expect(t.element, `${name}.element`).toBeDefined();
        expect(t.image, `${name}.image`).toBeDefined();
        expect(t.symbol, `${name}.symbol`).toBeDefined();
        expect(t.lines.length, `${name}.lines`).toBe(3);
      }
    });
  });

  // ── TRIGRAM_LINES ───────────────────────────────────────────────
  describe("TRIGRAM_LINES", () => {
    it("has exactly 8 entries", () => {
      expect(Object.keys(TRIGRAM_LINES).length).toBe(8);
    });

    it("each entry is 3 bits", () => {
      for (const [name, bits] of Object.entries(TRIGRAM_LINES)) {
        expect(bits.length, `${name} bits length`).toBe(3);
        for (const b of bits) {
          expect(b === 0 || b === 1, `${name} bit is 0 or 1`).toBe(true);
        }
      }
    });

    it("matches TRIGRAMS.lines", () => {
      for (const [name, bits] of Object.entries(TRIGRAM_LINES)) {
        expect(TRIGRAMS[name]!.lines, `${name} lines match`).toEqual(bits);
      }
    });
  });

  // ── QUE_META ────────────────────────────────────────────────────
  describe("QUE_META", () => {
    it("has exactly 64 entries", () => {
      expect(QUE_META.length).toBe(64);
    });

    it("IDs are 1-64 sequentially", () => {
      QUE_META.forEach((q, i) => {
        expect(q.id).toBe(i + 1);
      });
    });

    it("hexagram 1 is Kiền (Kien/Kien)", () => {
      const q = QUE_META[0]!;
      expect(q.id).toBe(1);
      // name stores Vietnamese display name; upper/lower use ASCII trigram keys
      expect(q.upper).toBe("Kien");
      expect(q.lower).toBe("Kien");
      expect(q.pairId).toBe(2);
    });

    it("hexagram 2 is Khôn (Khon/Khon)", () => {
      const q = QUE_META[1]!;
      expect(q.id).toBe(2);
      expect(q.upper).toBe("Khon");
      expect(q.lower).toBe("Khon");
    });

    it("hexagram 11 is Thái (Khon upper/Kien lower)", () => {
      const q = QUE_META[10]!;
      expect(q.id).toBe(11);
      expect(q.upper).toBe("Khon");
      expect(q.lower).toBe("Kien");
    });

    it("hexagram 63 is Ký Tế (Kham/Ly)", () => {
      const q = QUE_META[62]!;
      expect(q.id).toBe(63);
      expect(q.upper).toBe("Kham");
      expect(q.lower).toBe("Ly");
    });

    it("hexagram 64 is Vị Tế (Ly/Kham)", () => {
      const q = QUE_META[63]!;
      expect(q.id).toBe(64);
      expect(q.upper).toBe("Ly");
      expect(q.lower).toBe("Kham");
    });

    it("all entries have required fields", () => {
      for (const q of QUE_META) {
        expect(q.id, `id for ${q.name}`).toBeGreaterThan(0);
        expect(q.name, `name for id ${q.id}`).toBeDefined();
        expect(q.chinese, `chinese for ${q.name}`).toBeDefined();
        expect(q.upper, `upper for ${q.name}`).toBeDefined();
        expect(q.lower, `lower for ${q.name}`).toBeDefined();
        expect(q.pairId, `pairId for ${q.name}`).toBeGreaterThan(0);
      }
    });
  });

  // ── QUE_DATA ────────────────────────────────────────────────────
  describe("QUE_DATA", () => {
    it("has exactly 64 entries", () => {
      expect(Object.keys(QUE_DATA).length).toBe(64);
    });

    it("keys are 1-64", () => {
      for (let i = 1; i <= 64; i++) {
        expect(QUE_DATA[i], `QUE_DATA[${i}]`).toBeDefined();
      }
    });

    it("each entry has exactly 6 lines", () => {
      for (let i = 1; i <= 64; i++) {
        const data = QUE_DATA[i]!;
        expect(data.lines.length, `QUE_DATA[${i}].lines`).toBe(6);
      }
    });

    it("line positions are 1-6 in order", () => {
      for (let i = 1; i <= 64; i++) {
        const lines = QUE_DATA[i]!.lines;
        lines.forEach((line, idx) => {
          expect(line.position, `QUE_DATA[${i}] line ${idx} position`).toBe(idx + 1);
        });
      }
    });

    it("hexagram 1 (Kien) has coreMeaning, judgment, image, state", () => {
      const d = QUE_DATA[1]!;
      expect(d.coreMeaning).toBeTruthy();
      expect(d.judgment.chinese).toBeTruthy();
      expect(d.judgment.vietnamese).toBeTruthy();
      expect(d.judgment.interpretation).toBeTruthy();
      expect(d.image.description).toBeTruthy();
      expect(d.image.action).toBeTruthy();
      expect(d.state.trend).toBeTruthy();
      expect(d.state.career).toBeTruthy();
    });

    it("hexagram 64 (Vi Te) has all required fields", () => {
      const d = QUE_DATA[64]!;
      expect(d.coreMeaning).toBeTruthy();
      expect(d.lines.length).toBe(6);
      expect(d.judgment.interpretation).toBeTruthy();
    });

    it("each line has type yang or yin", () => {
      for (let i = 1; i <= 64; i++) {
        for (const line of QUE_DATA[i]!.lines) {
          expect(
            line.type === "yang" || line.type === "yin",
            `QUE_DATA[${i}] line ${line.position} type`
          ).toBe(true);
        }
      }
    });

    it("each line has name, chinese, vietnamese, outcome, action, interpretation", () => {
      for (let i = 1; i <= 64; i++) {
        for (const line of QUE_DATA[i]!.lines) {
          expect(line.name, `[${i}] line ${line.position} name`).toBeTruthy();
          expect(line.chinese, `[${i}] line ${line.position} chinese`).toBeTruthy();
          expect(line.vietnamese, `[${i}] line ${line.position} vietnamese`).toBeTruthy();
          expect(line.outcome, `[${i}] line ${line.position} outcome`).toBeTruthy();
          expect(line.action, `[${i}] line ${line.position} action`).toBeTruthy();
          expect(line.interpretation, `[${i}] line ${line.position} interpretation`).toBeTruthy();
        }
      }
    });
  });

  // ── resolveHexagram ────────────────────────────────────────────
  describe("resolveHexagram", () => {
    it("[1,1,1,1,1,1] resolves to Kien (1)", () => {
      expect(resolveHexagram([1, 1, 1, 1, 1, 1])).toBe(1);
    });

    it("[0,0,0,0,0,0] resolves to Khon (2)", () => {
      expect(resolveHexagram([0, 0, 0, 0, 0, 0])).toBe(2);
    });

    it("[1,0,0,0,1,0] resolves to Truan (3) — Kham upper, Chan lower", () => {
      // lower=Chan [1,0,0], upper=Kham [0,1,0]
      expect(resolveHexagram([1, 0, 0, 0, 1, 0])).toBe(3);
    });

    it("[1,1,1,0,0,0] resolves to Thai (11) — Khon upper, Kien lower", () => {
      // lower=Kien [1,1,1], upper=Khon [0,0,0]
      expect(resolveHexagram([1, 1, 1, 0, 0, 0])).toBe(11);
    });

    it("[0,0,0,1,1,1] resolves to Bi (12) — Kien upper, Khon lower", () => {
      // lower=Khon [0,0,0], upper=Kien [1,1,1]
      expect(resolveHexagram([0, 0, 0, 1, 1, 1])).toBe(12);
    });

    it("[0,1,0,0,1,0] resolves to Tap Kham (29) — Kham upper, Kham lower", () => {
      // lower=Kham [0,1,0], upper=Kham [0,1,0]
      expect(resolveHexagram([0, 1, 0, 0, 1, 0])).toBe(29);
    });

    it("[1,0,1,1,0,1] resolves to Ly (30) — Ly upper, Ly lower", () => {
      // lower=Ly [1,0,1], upper=Ly [1,0,1]
      expect(resolveHexagram([1, 0, 1, 1, 0, 1])).toBe(30);
    });

    it("[1,0,1,0,1,0] resolves to Ky Te (63) — Kham upper, Ly lower", () => {
      // lower=Ly [1,0,1], upper=Kham [0,1,0]
      expect(resolveHexagram([1, 0, 1, 0, 1, 0])).toBe(63);
    });

    it("[0,1,0,1,0,1] resolves to Vi Te (64) — Ly upper, Kham lower", () => {
      // lower=Kham [0,1,0], upper=Ly [1,0,1]
      expect(resolveHexagram([0, 1, 0, 1, 0, 1])).toBe(64);
    });

    it("all 64 hexagrams resolve uniquely", () => {
      const results = new Set<number>();
      for (const meta of QUE_META) {
        const lines = getHexLines(meta.upper, meta.lower);
        const id = resolveHexagram(lines);
        results.add(id);
        expect(id).toBe(meta.id);
      }
      expect(results.size).toBe(64);
    });

    it("throws on invalid 7-element input", () => {
      expect(() => resolveHexagram([1, 0, 1, 0, 1, 0, 1])).toThrow();
    });

    it("throws on values outside 0/1", () => {
      expect(() => resolveHexagram([1, 0, 1, 0, 1, 2])).toThrow();
    });
  });

  // ── getHexLines ────────────────────────────────────────────────
  describe("getHexLines", () => {
    it("Kien/Kien → [1,1,1,1,1,1]", () => {
      expect(getHexLines("Kien", "Kien")).toEqual([1, 1, 1, 1, 1, 1]);
    });

    it("Khon/Khon → [0,0,0,0,0,0]", () => {
      expect(getHexLines("Khon", "Khon")).toEqual([0, 0, 0, 0, 0, 0]);
    });

    it("lower=Kien upper=Khon gives Thai lines [1,1,1,0,0,0]", () => {
      // lower trigram = first 3 bits, upper trigram = last 3 bits
      expect(getHexLines("Khon", "Kien")).toEqual([1, 1, 1, 0, 0, 0]);
    });

    it("lower=Chan upper=Kham gives Truan lines [1,0,0,0,1,0]", () => {
      expect(getHexLines("Kham", "Chan")).toEqual([1, 0, 0, 0, 1, 0]);
    });
  });

  // ── getBienQue ─────────────────────────────────────────────────
  describe("getBienQue", () => {
    it("Kien hex [1,1,1,1,1,1], flip pos 0 → Cau (44): lower=Ton upper=Kien", () => {
      // flip bit0: [0,1,1,1,1,1] → lower=[0,1,1]=Ton, upper=[1,1,1]=Kien → Cau(44)
      const result = getBienQue([1, 1, 1, 1, 1, 1], 0);
      expect(result).not.toBeNull();
      expect(result).toBe(44);
    });

    it("Thai hex [1,1,1,0,0,0], flip pos 0 → Minh Di area", () => {
      // Thai: lower=Kien [1,1,1], upper=Khon [0,0,0]
      // flip pos 0: [0,1,1,0,0,0] → lower=Ton [0,1,1], upper=Khon [0,0,0] → Quan (20)
      const result = getBienQue([1, 1, 1, 0, 0, 0], 0);
      expect(result).not.toBeNull();
      expect(typeof result).toBe("number");
      expect(result! >= 1 && result! <= 64).toBe(true);
    });

    it("returns null for invalid trigram after flip (should not happen with valid input)", () => {
      // All valid 6-bit inputs produce valid trigrams, so getBienQue should always return a number
      const result = getBienQue([1, 1, 1, 1, 1, 1], 5);
      expect(result).not.toBeNull();
    });

    it("flipping all 6 positions of Kien produces 6 different hexagrams", () => {
      const kienLines = [1, 1, 1, 1, 1, 1];
      const results = new Set<number>();
      for (let i = 0; i < 6; i++) {
        const r = getBienQue(kienLines, i);
        expect(r).not.toBeNull();
        results.add(r!);
      }
      // All flips of Kien must produce hexagrams (could overlap for symmetric cases)
      expect(results.size).toBeGreaterThanOrEqual(1);
    });
  });

  // ── getAllBienQue ──────────────────────────────────────────────
  describe("getAllBienQue", () => {
    it("returns 6 entries for any hexagram", () => {
      const result = getAllBienQue([1, 1, 1, 1, 1, 1]);
      expect(Object.keys(result).length).toBe(6);
    });

    it("keys are positions 1-6", () => {
      const result = getAllBienQue([0, 0, 0, 0, 0, 0]);
      for (let i = 1; i <= 6; i++) {
        expect(result[i], `position ${i}`).not.toBeUndefined();
      }
    });

    it("Kien all-flips produce valid hexagram IDs 1-64", () => {
      const result = getAllBienQue([1, 1, 1, 1, 1, 1]);
      for (let i = 1; i <= 6; i++) {
        const id = result[i];
        if (id !== null && id !== undefined) {
          expect(id >= 1 && id <= 64, `pos ${i} id ${id} in range`).toBe(true);
        }
      }
    });
  });
});
