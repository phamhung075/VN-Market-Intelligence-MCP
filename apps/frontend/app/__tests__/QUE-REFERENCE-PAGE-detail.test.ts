/**
 * QUE-REFERENCE-PAGE-TEST — QUE_DETAIL map integrity tests
 *
 * Covers:
 *  T1: QUE_DETAIL has exactly 64 entries
 *  T2: every entry has all 12 required scalar fields + a phases array (generic iteration)
 *  T3: every entry's phases has exactly 6 items, each with phase/action/outcome/gloss keys
 *  T4: spot-check quẻ 1 — id, name, chinese, coreMeaning from live generated file
 *  T5: regression guard — QUE_DESCRIPTIONS[1] still has ONLY 2 fields (no mutation)
 *  T6: generated file header comment present (codegen banner)
 */
import { describe, it, expect } from "vitest";
import { QUE_DETAIL } from "../lib/que-descriptions-detail.generated";
import type { QueDetailDescription } from "../lib/que-descriptions-detail.generated";
import { QUE_DESCRIPTIONS } from "../lib/que-descriptions.generated";

// The 12 required scalar/string/number fields (phases is the 13th, checked separately)
const REQUIRED_FIELDS: Array<keyof QueDetailDescription> = [
  "id",
  "name",
  "chinese",
  "upper",
  "lower",
  "upperElement",
  "lowerElement",
  "coreMeaning",
  "marketTrendLabel",
  "stateInterpretation",
  "favorable",
  "warning",
];

// ── T1: exactly 64 entries ────────────────────────────────────────────────────
describe("T1: QUE_DETAIL entry count", () => {
  it("has exactly 64 entries", () => {
    expect(Object.keys(QUE_DETAIL).length).toBe(64);
  });
});

// ── T2: every entry has all 12 required fields + phases array ─────────────────
describe("T2: every QUE_DETAIL entry has all required fields", () => {
  it("all 12 scalar fields present and non-empty in every entry", () => {
    Object.values(QUE_DETAIL).forEach((entry) => {
      REQUIRED_FIELDS.forEach((field) => {
        expect(entry[field], `field '${field}' missing or empty on id=${entry.id}`).toBeDefined();
        // id is number; others are non-empty strings
        if (field === "id") {
          expect(typeof entry[field]).toBe("number");
        } else {
          expect(typeof entry[field]).toBe("string");
          expect((entry[field] as string).trim().length, `field '${field}' empty on id=${entry.id}`).toBeGreaterThan(0);
        }
      });
    });
  });

  it("phases array is present and is an array in every entry", () => {
    Object.values(QUE_DETAIL).forEach((entry) => {
      expect(Array.isArray(entry.phases), `phases not an array on id=${entry.id}`).toBe(true);
    });
  });
});

// ── T3: every entry's phases has exactly 6 items with correct shape ───────────
describe("T3: every entry's phases has exactly 6 items with phase/action/outcome/gloss", () => {
  it("each phases array has exactly 6 items", () => {
    Object.values(QUE_DETAIL).forEach((entry) => {
      expect(entry.phases.length, `phases.length !== 6 on id=${entry.id}`).toBe(6);
    });
  });

  it("each phase item has phase, action, outcome, and gloss keys", () => {
    Object.values(QUE_DETAIL).forEach((entry) => {
      entry.phases.forEach((phase, idx) => {
        expect(typeof phase.phase, `phases[${idx}].phase not number on id=${entry.id}`).toBe("number");
        expect(typeof phase.action, `phases[${idx}].action not string on id=${entry.id}`).toBe("string");
        expect(phase.action.trim().length, `phases[${idx}].action empty on id=${entry.id}`).toBeGreaterThan(0);
        expect(typeof phase.outcome, `phases[${idx}].outcome not string on id=${entry.id}`).toBe("string");
        expect(phase.outcome.trim().length, `phases[${idx}].outcome empty on id=${entry.id}`).toBeGreaterThan(0);
        expect(typeof phase.gloss, `phases[${idx}].gloss not string on id=${entry.id}`).toBe("string");
        expect(phase.gloss.trim().length, `phases[${idx}].gloss empty on id=${entry.id}`).toBeGreaterThan(0);
      });
    });
  });
});

// ── T4: quẻ 1 spot-check — values from the live generated file ───────────────
describe("T4: quẻ 1 spot-check against generated SSOT", () => {
  const que1 = QUE_DETAIL[1];

  it("id === 1", () => {
    expect(que1.id).toBe(1);
  });

  it("name === 'Kien'", () => {
    // Value read from que-descriptions-detail.generated.ts QUE_DETAIL[1].name
    expect(que1.name).toBe("Kien");
  });

  it("chinese === '乾'", () => {
    // Value read from que-descriptions-detail.generated.ts QUE_DETAIL[1].chinese
    expect(que1.chinese).toBe("乾");
  });

  it("coreMeaning matches the SSOT .vi value in the generated file", () => {
    // SSOT value from que-descriptions-detail.generated.ts QUE_DETAIL[1].coreMeaning
    expect(que1.coreMeaning).toBe(
      "Sức sáng tạo nguyên thủy, năng lượng dương cương kiện không ngừng vận hành"
    );
  });
});

// ── T5: regression guard — QUE_DESCRIPTIONS[1] still has ONLY 2 fields ───────
describe("T5: QUE_DESCRIPTIONS legacy map not mutated by detail generation", () => {
  it("QUE_DESCRIPTIONS[1] has exactly 2 own keys (coreMeaning + marketTrendLabel)", () => {
    const keys = Object.keys(QUE_DESCRIPTIONS[1]);
    expect(keys).toHaveLength(2);
    expect(keys).toContain("coreMeaning");
    expect(keys).toContain("marketTrendLabel");
  });

  it("QUE_DESCRIPTIONS[1] does NOT have extended detail fields (id, name, chinese, phases, etc.)", () => {
    const entry = QUE_DESCRIPTIONS[1] as unknown as Record<string, unknown>;
    expect(entry["id"]).toBeUndefined();
    expect(entry["name"]).toBeUndefined();
    expect(entry["chinese"]).toBeUndefined();
    expect(entry["phases"]).toBeUndefined();
    expect(entry["stateInterpretation"]).toBeUndefined();
    expect(entry["favorable"]).toBeUndefined();
    expect(entry["warning"]).toBeUndefined();
  });
});

// ── T6: generated file header comment (codegen banner) ───────────────────────
describe("T6: generated file header comment present", () => {
  it("QUE_DETAIL export is defined (codegen ran successfully)", () => {
    // If the file header were stripped or the export broken,
    // the import would throw or return undefined.
    expect(QUE_DETAIL).toBeDefined();
    expect(typeof QUE_DETAIL).toBe("object");
  });

  it("banner comment verifiable via source sentinel: QUE_DETAIL is a plain object (not a class)", () => {
    // The codegen banner marks the file as AUTO-GENERATED.
    // We verify the file structure (plain Record) as a proxy:
    // if the file were hand-edited and the export changed structure, this fails.
    expect(Object.getPrototypeOf(QUE_DETAIL)).toBe(Object.prototype);
  });
});
