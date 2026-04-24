// src/__tests__/301-hexagram-library-rebuild.test.ts
// Task 301 — Rebuild hexagramLibrary.ts QUE_DATA from 64 markdown source files
import { describe, it, expect } from "bun:test";
import { QUE_DATA, QUE_META } from "../domain/services/kinhDich/hexagramLibrary.js";

const VALID_OUTCOMES = ["CÁT", "HUNG", "VÔ CỬU", "HỐI", "LẬN", "LỆ"];
const VALID_ACTIONS = ["TIẾN", "LUI", "GIỮ", "CHỜ", "THẬN"];
const VALID_TRENDS = ["THUẬN LỢI", "BẤT LỢI", "TRUNG TÍNH"];

describe("Task 301 — Hexagram Library Rebuild", () => {
  it("QUE_DATA has exactly 64 entries", () => {
    expect(Object.keys(QUE_DATA).length).toBe(64);
  });

  it("keys span 1–64 with no gaps", () => {
    for (let i = 1; i <= 64; i++) {
      expect(QUE_DATA[i], `QUE_DATA[${i}] must exist`).toBeDefined();
    }
  });

  it("each entry has a non-empty coreMeaning", () => {
    for (let i = 1; i <= 64; i++) {
      expect(QUE_DATA[i]!.coreMeaning.length, `[${i}] coreMeaning`).toBeGreaterThan(5);
    }
  });

  it("each entry has judgment with chinese, vietnamese, interpretation", () => {
    for (let i = 1; i <= 64; i++) {
      const j = QUE_DATA[i]!.judgment;
      expect(j.chinese.length, `[${i}] judgment.chinese`).toBeGreaterThan(0);
      expect(j.vietnamese.length, `[${i}] judgment.vietnamese`).toBeGreaterThan(0);
      expect(j.interpretation.length, `[${i}] judgment.interpretation`).toBeGreaterThan(10);
    }
  });

  it("each entry has image with description and action", () => {
    for (let i = 1; i <= 64; i++) {
      const img = QUE_DATA[i]!.image;
      expect(img.description.length, `[${i}] image.description`).toBeGreaterThan(5);
      expect(img.action.length, `[${i}] image.action`).toBeGreaterThan(5);
    }
  });

  it("state.trend contains THUẬN LỢI, BẤT LỢI, or TRUNG TÍNH for all 64", () => {
    for (let i = 1; i <= 64; i++) {
      const trend = QUE_DATA[i]!.state.trend.toUpperCase();
      const hasValidTrend = VALID_TRENDS.some((t) => trend.includes(t));
      expect(hasValidTrend, `[${i}] state.trend="${QUE_DATA[i]!.state.trend}" must contain a valid trend keyword`).toBe(true);
    }
  });

  it("state.warning is non-empty for all 64", () => {
    for (let i = 1; i <= 64; i++) {
      expect(QUE_DATA[i]!.state.warning.length, `[${i}] state.warning`).toBeGreaterThan(5);
    }
  });

  it("each entry has exactly 6 lines", () => {
    for (let i = 1; i <= 64; i++) {
      expect(QUE_DATA[i]!.lines.length, `[${i}] must have 6 lines`).toBe(6);
    }
  });

  it("line positions are 1–6 in order", () => {
    for (let i = 1; i <= 64; i++) {
      QUE_DATA[i]!.lines.forEach((line, idx) => {
        expect(line.position, `[${i}] line[${idx}].position`).toBe(idx + 1);
      });
    }
  });

  it("line.type is 'yang' or 'yin' for all lines", () => {
    for (let i = 1; i <= 64; i++) {
      for (const line of QUE_DATA[i]!.lines) {
        expect(
          line.type === "yang" || line.type === "yin",
          `[${i}] line ${line.position} type="${line.type}"`,
        ).toBe(true);
      }
    }
  });

  it("line.outcome contains a known outcome keyword for all lines", () => {
    const failures: string[] = [];
    for (let i = 1; i <= 64; i++) {
      for (const line of QUE_DATA[i]!.lines) {
        const upper = line.outcome.toUpperCase();
        const valid = VALID_OUTCOMES.some((o) => upper.includes(o));
        if (!valid) {
          failures.push(`[${i}] line ${line.position}: "${line.outcome}"`);
        }
      }
    }
    expect(failures, `Lines with unrecognized outcomes:\n${failures.join("\n")}`).toEqual([]);
  });

  it("line.action contains a known action keyword for all lines", () => {
    const failures: string[] = [];
    for (let i = 1; i <= 64; i++) {
      for (const line of QUE_DATA[i]!.lines) {
        const upper = line.action.toUpperCase();
        const valid = VALID_ACTIONS.some((a) => upper.includes(a));
        if (!valid) {
          failures.push(`[${i}] line ${line.position}: "${line.action}"`);
        }
      }
    }
    expect(failures, `Lines with unrecognized actions:\n${failures.join("\n")}`).toEqual([]);
  });

  it("line.interpretation is non-empty for all lines", () => {
    for (let i = 1; i <= 64; i++) {
      for (const line of QUE_DATA[i]!.lines) {
        expect(line.interpretation.length, `[${i}] line ${line.position} interpretation`).toBeGreaterThan(10);
      }
    }
  });

  it("hexagram 1 (Kiền) has correct coreMeaning from markdown", () => {
    expect(QUE_DATA[1]!.coreMeaning).toContain("Sức sáng tạo nguyên thủy");
  });

  it("hexagram 15 (Khiêm) coreMeaning mentions khiêm nhường", () => {
    expect(QUE_DATA[15]!.coreMeaning.toLowerCase()).toContain("khiêm nhường");
  });

  it("hexagram 29 (Tập Khảm) state.trend is BẤT LỢI", () => {
    expect(QUE_DATA[29]!.state.trend.toUpperCase()).toContain("BẤT LỢI");
  });

  it("hexagram 15 (Khiêm) all 6 lines have CÁT outcome (unique property of Khiêm)", () => {
    const lines = QUE_DATA[15]!.lines;
    for (const line of lines) {
      expect(line.outcome.toUpperCase()).toContain("CÁT");
    }
  });

  it("hexagram 1 line 1 outcome contains VÔ CỬU", () => {
    expect(QUE_DATA[1]!.lines[0]!.outcome.toUpperCase()).toContain("VÔ CỬU");
  });

  it("hexagram 1 line 6 outcome contains HỐI", () => {
    expect(QUE_DATA[1]!.lines[5]!.outcome.toUpperCase()).toContain("HỐI");
  });

  it("coreMeanings are distinct (no two hexagrams share the same coreMeaning)", () => {
    const meanings = new Set<string>();
    for (let i = 1; i <= 64; i++) {
      const m = QUE_DATA[i]!.coreMeaning;
      expect(meanings.has(m), `Duplicate coreMeaning at hexagram ${i}`).toBe(false);
      meanings.add(m);
    }
  });

  it("no coreMeaning contains a raw blockquote '>' character (parsed correctly)", () => {
    for (let i = 1; i <= 64; i++) {
      expect(QUE_DATA[i]!.coreMeaning.startsWith(">"), `[${i}] coreMeaning should not start with >`).toBe(false);
      expect(QUE_DATA[i]!.coreMeaning.startsWith("**"), `[${i}] coreMeaning should not start with **`).toBe(false);
    }
  });

  it("QUE_META and QUE_DATA keys are aligned (same 1-64 IDs)", () => {
    expect(QUE_META.length).toBe(64);
    for (const meta of QUE_META) {
      expect(QUE_DATA[meta.id], `QUE_DATA[${meta.id}] for ${meta.name}`).toBeDefined();
    }
  });
});
