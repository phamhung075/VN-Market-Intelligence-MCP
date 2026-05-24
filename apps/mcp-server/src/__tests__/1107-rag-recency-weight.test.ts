/**
 * Task 1107 — RAG Recency Weight
 *
 * Tests for the recencyWeighter domain service.
 *
 * Formula:
 *   recency_weight = max(0.1, 1.0 - (age_days / recency_days) * 0.9)
 *   final_score    = cosine_similarity * recency_weight
 *   (where cosine_similarity = 1 - distance for L2-normalised vectors,
 *    but in tests we pass similarity directly via the weigher)
 *
 * Results are re-sorted by final_score DESC.
 */

import { describe, it, expect } from "bun:test";
import {
  computeRecencyWeight,
  applyRecencyWeighting,
} from "../domain/services/recencyWeighter.js";
// G5a (P2-F): SearchResult type now in shared-types.ts (canonical domain type)
import type { SearchResult } from "../domain/models/shared-types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysAgo(n: number): string {
  const d = new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  return d.toISOString();
}

function makeResult(
  id: string,
  similarity: number,
  ageDays: number,
): SearchResult {
  return {
    id,
    level: "action",
    title: `Result ${id}`,
    summary: `Summary ${id}`,
    tags: [],
    actionCode: "",
    createdAt: daysAgo(ageDays),
    distance: 1 - similarity, // L2 distance ≈ 1 - cosine_similarity
  };
}

// ─── computeRecencyWeight ─────────────────────────────────────────────────────

describe("Task 1107 — computeRecencyWeight", () => {
  it("returns 1.0 for age_days = 0 (fresh result)", () => {
    const w = computeRecencyWeight(0, 90);
    expect(w).toBeCloseTo(1.0, 5);
  });

  it("returns 0.1 (floor) for very old results (age >> recency_days)", () => {
    // age=9999d >> recency_days=90 → formula gives a large negative clamped to 0.1
    const w = computeRecencyWeight(9999, 90);
    expect(w).toBe(0.1);
  });

  it("returns 0.1 (floor) for age exactly at floor boundary", () => {
    // floor triggers when 1.0 - (age/days)*0.9 <= 0.1
    // → age/days >= 1.0 → age = recency_days
    const w = computeRecencyWeight(90, 90);
    expect(w).toBeCloseTo(0.1, 5);
  });

  it("computes correct linear decay for age=45, recency_days=90", () => {
    // 1.0 - (45/90)*0.9 = 1.0 - 0.45 = 0.55
    const w = computeRecencyWeight(45, 90);
    expect(w).toBeCloseTo(0.55, 5);
  });

  it("uses recency_days=30 correctly", () => {
    // age=15, days=30 → 1.0 - (15/30)*0.9 = 1.0 - 0.45 = 0.55
    const w = computeRecencyWeight(15, 30);
    expect(w).toBeCloseTo(0.55, 5);
  });
});

// ─── applyRecencyWeighting ────────────────────────────────────────────────────

describe("Task 1107 — applyRecencyWeighting", () => {
  it("AC-C1: B (similarity=0.7, age=5d) ranks above A (similarity=0.9, age=200d) after weighting", () => {
    const resultA = makeResult("A", 0.9, 200);
    const resultB = makeResult("B", 0.7, 5);

    const ranked = applyRecencyWeighting([resultA, resultB], 90);

    // B should be first (higher final_score)
    expect(ranked[0]!.id).toBe("B");
    expect(ranked[1]!.id).toBe("A");

    // Sanity-check the scores
    // A: weight = max(0.1, 1.0 - (200/90)*0.9) = max(0.1, 1.0 - 2.0) = 0.1
    //    final = 0.9 * 0.1 = 0.09
    // B: weight = max(0.1, 1.0 - (5/90)*0.9) = max(0.1, 1.0 - 0.05) = 0.95
    //    final = 0.7 * 0.95 = 0.665
    expect(ranked[0]!.finalScore).toBeGreaterThan(ranked[1]!.finalScore!);
  });

  it("AC-C4: all results age=0 → recency_weight=1.0, ranking unchanged from cosine-only", () => {
    const r1 = makeResult("high", 0.9, 0);
    const r2 = makeResult("mid", 0.7, 0);
    const r3 = makeResult("low", 0.5, 0);

    const ranked = applyRecencyWeighting([r3, r1, r2], 90);

    expect(ranked[0]!.id).toBe("high");
    expect(ranked[1]!.id).toBe("mid");
    expect(ranked[2]!.id).toBe("low");

    // All recency weights should be 1.0
    for (const r of ranked) {
      expect(r.recencyWeight).toBeCloseTo(1.0, 4);
    }
  });

  it("recency_weight=1.0 for age=0 preserves original similarity", () => {
    const r = makeResult("fresh", 0.8, 0);
    const [ranked] = applyRecencyWeighting([r], 90);
    expect(ranked!.recencyWeight).toBeCloseTo(1.0, 5);
    expect(ranked!.finalScore).toBeCloseTo(0.8, 5);
  });

  it("very old results get recency_weight=0.1 (floor)", () => {
    const r = makeResult("ancient", 0.9, 9999);
    const [ranked] = applyRecencyWeighting([r], 90);
    expect(ranked!.recencyWeight).toBe(0.1);
    expect(ranked!.finalScore).toBeCloseTo(0.9 * 0.1, 5);
  });

  it("default recency_days=90 matches explicit recency_days=90", () => {
    const results = [makeResult("A", 0.8, 30), makeResult("B", 0.6, 5)];

    const withDefault = applyRecencyWeighting(results);
    const withExplicit = applyRecencyWeighting(results, 90);

    expect(withDefault.map((r) => r.id)).toEqual(withExplicit.map((r) => r.id));
    for (let i = 0; i < withDefault.length; i++) {
      expect(withDefault[i]!.finalScore).toBeCloseTo(withExplicit[i]!.finalScore!, 5);
    }
  });

  it("returns empty array for empty input", () => {
    expect(applyRecencyWeighting([], 90)).toEqual([]);
  });

  it("results are sorted DESC by finalScore", () => {
    const results = [
      makeResult("C", 0.5, 10),
      makeResult("A", 0.9, 5),
      makeResult("B", 0.7, 20),
    ];

    const ranked = applyRecencyWeighting(results, 90);

    for (let i = 0; i < ranked.length - 1; i++) {
      expect(ranked[i]!.finalScore).toBeGreaterThanOrEqual(ranked[i + 1]!.finalScore!);
    }
  });

  it("AC-C3: recency_days=30 applies tighter decay than recency_days=90", () => {
    // age=15d: decay with days=30 → weight=0.55 vs days=90 → weight=0.85
    const result = makeResult("X", 0.8, 15);

    const [withNarrow] = applyRecencyWeighting([result], 30);
    const [withWide] = applyRecencyWeighting([result], 90);

    // narrower window = more decay = lower weight = lower final score
    expect(withNarrow!.recencyWeight).toBeLessThan(withWide!.recencyWeight!);
    expect(withNarrow!.finalScore).toBeLessThan(withWide!.finalScore!);
  });
});
