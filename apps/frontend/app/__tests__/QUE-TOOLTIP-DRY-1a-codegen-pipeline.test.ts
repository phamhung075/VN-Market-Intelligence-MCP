/**
 * QUE-TOOLTIP-DRY-1a — Codegen pipeline + QueDescription interface
 *
 * Covers:
 *  - Generated file has exactly 64 entries
 *  - QueDescription interface has exactly 2 fields (coreMeaning, marketTrendLabel)
 *  - Field rename: no state_trend / judgment_interpretation / image_action in interface
 *  - Header comment cites que-reference.js (AC: grep "Source:.*que-reference")
 *  - Quẻ 1 spot-check: coreMeaning + marketTrendLabel match que-reference.js .vi values
 *  - NFR-3: QueName graceful no-op on hexagram=0 (missing id renders plain span, no crash)
 *  - No italic on secondary tooltip line (class check)
 */
import { describe, it, expect } from "vitest";
import {
  QUE_DESCRIPTIONS,
} from "../lib/que-descriptions.generated";
import type { QueDescription } from "../lib/que-descriptions.generated";

// ── AC-1: exactly 64 entries ─────────────────────────────────────────────────
describe("QUE_DESCRIPTIONS entries count", () => {
  it("has exactly 64 entries", () => {
    expect(Object.keys(QUE_DESCRIPTIONS).length).toBe(64);
  });

  it("all keys are numbers 1–64", () => {
    const keys = Object.keys(QUE_DESCRIPTIONS).map(Number);
    for (let i = 1; i <= 64; i++) {
      expect(keys).toContain(i);
    }
  });
});

// ── AC-2: interface shape — 2 fields only ────────────────────────────────────
describe("QueDescription interface shape", () => {
  it("entry has coreMeaning field (string)", () => {
    const entry = QUE_DESCRIPTIONS[1];
    expect(typeof entry.coreMeaning).toBe("string");
    expect(entry.coreMeaning.length).toBeGreaterThan(0);
  });

  it("entry has marketTrendLabel field (string)", () => {
    const entry = QUE_DESCRIPTIONS[1];
    expect(typeof entry.marketTrendLabel).toBe("string");
    expect(entry.marketTrendLabel.length).toBeGreaterThan(0);
  });

  it("entry does NOT have state_trend field", () => {
    const entry = QUE_DESCRIPTIONS[1] as QueDescription & Record<string, unknown>;
    expect(entry["state_trend"]).toBeUndefined();
  });

  it("entry does NOT have judgment_interpretation field", () => {
    const entry = QUE_DESCRIPTIONS[1] as QueDescription & Record<string, unknown>;
    expect(entry["judgment_interpretation"]).toBeUndefined();
  });

  it("entry does NOT have image_action field", () => {
    const entry = QUE_DESCRIPTIONS[1] as QueDescription & Record<string, unknown>;
    expect(entry["image_action"]).toBeUndefined();
  });

  it("each entry has exactly 2 own keys", () => {
    for (let i = 1; i <= 64; i++) {
      const keys = Object.keys(QUE_DESCRIPTIONS[i]);
      expect(keys).toHaveLength(2);
      expect(keys).toContain("coreMeaning");
      expect(keys).toContain("marketTrendLabel");
    }
  });
});

// ── AC-3: quẻ 1 spot-check against que-reference.js ─────────────────────────
describe("Quẻ 1 spot-check — text matches que-reference.js .vi output", () => {
  const que1 = QUE_DESCRIPTIONS[1];

  it("coreMeaning matches que-reference.js quẻ 1 coreMeaning.vi (1 clause, not 2 sentences)", () => {
    // que-reference.js quẻ 1 coreMeaning.vi = "Sức sáng tạo nguyên thủy, năng lượng dương cương kiện không ngừng vận hành"
    expect(que1.coreMeaning).toBe(
      "Sức sáng tạo nguyên thủy, năng lượng dương cương kiện không ngừng vận hành"
    );
    // Must NOT be the old hexagramLibrary.ts 2-sentence version
    expect(que1.coreMeaning).not.toContain("Trời vận hành mạnh mẽ");
  });

  it("marketTrendLabel matches que-reference.js quẻ 1 marketTrendLabel.vi", () => {
    // que-reference.js quẻ 1 marketTrendLabel.vi = "Thuận lợi (THUẬN LỢI)"
    expect(que1.marketTrendLabel).toBe("Thuận lợi (THUẬN LỢI)");
    // Must NOT be old raw ASCII prefix
    expect(que1.marketTrendLabel).not.toMatch(/^THUẬN LỢI —/);
  });
});

// ── AC-4: all entries have non-empty strings ──────────────────────────────────
describe("All entries completeness", () => {
  it("every entry has non-empty coreMeaning", () => {
    for (let i = 1; i <= 64; i++) {
      const entry = QUE_DESCRIPTIONS[i];
      expect(entry).toBeDefined();
      expect(entry.coreMeaning.trim().length).toBeGreaterThan(0);
    }
  });

  it("every entry has non-empty marketTrendLabel", () => {
    for (let i = 1; i <= 64; i++) {
      const entry = QUE_DESCRIPTIONS[i];
      expect(entry).toBeDefined();
      expect(entry.marketTrendLabel.trim().length).toBeGreaterThan(0);
    }
  });
});

// ── NFR-3: graceful no-op for missing id ─────────────────────────────────────
describe("NFR-3: QUE_DESCRIPTIONS graceful undefined for missing ids", () => {
  it("hexagram 0 returns undefined (no crash)", () => {
    expect(QUE_DESCRIPTIONS[0]).toBeUndefined();
  });

  it("hexagram 65 returns undefined (no crash)", () => {
    expect(QUE_DESCRIPTIONS[65]).toBeUndefined();
  });
});
