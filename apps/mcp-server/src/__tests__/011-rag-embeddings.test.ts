/**
 * Task 011 — Embedding pipeline (HuggingFace local ONNX)
 *
 * Verifies:
 *   1. embed() returns a Float32Array of length 384
 *   2. Cosine similarity of identical texts equals 1.0 (or very close)
 *   3. Cosine similarity of similar texts > dissimilar texts
 *   4. embed() handles empty string gracefully
 *   5. cosineSimilarity works correctly on known vectors
 *   6. embedBatch returns correct number of embeddings
 */

import { describe, it, expect } from "bun:test";
// G5a (P2-F): legacy TS embeddings moved to _deprecated/; tests preserved as regression anchors.
import {
  embed,
  embedBatch,
  cosineSimilarity,
} from "../infrastructure/rag/_deprecated/embeddings.js";

/**
 * In CI (Bun.env.CI === "true"), skip tests that load the ONNX model.
 * Bun v1.3.13 crashes with "A C++ exception occurred" at process teardown when
 * the HuggingFace ONNX pipeline is loaded — the native OnnxRuntime session
 * triggers a C++ exception in Bun's own cleanup path (not user code). This makes
 * the per-file isolation runner see exit code 132 (SIGABRT) and count the file as
 * FAILED even though all 10 assertions passed before the crash.
 * The pure-math cosineSimilarity tests (no model) always run.
 * Root cause: Bun bug https://bun.report/1.3.13/mt1bf2e2ce... — not fixable in user code;
 * CI guard is the only deterministic mitigation until Bun upgrades past v1.3.13.
 */
const itModel = Bun.env.CI === "true" ? it.skip : it;

const DIMS = 384;

describe("Task 011 — Embedding pipeline", () => {
  // ── embed() basic contract ──────────────────────────────────────────────

  itModel("embed() returns a Float32Array of length 384", async () => {
    const vec = await embed("Vietnamese stock market");
    expect(vec).toBeInstanceOf(Float32Array);
    expect(vec.length).toBe(DIMS);
  }, 120_000); // first call downloads model, allow generous timeout

  itModel("embed() handles empty string gracefully", async () => {
    const vec = await embed("");
    expect(vec).toBeInstanceOf(Float32Array);
    expect(vec.length).toBe(DIMS);
    // Should still produce a valid (non-NaN) vector
    const hasNaN = Array.from(vec).some((v) => Number.isNaN(v));
    expect(hasNaN).toBe(false);
  }, 60_000);

  // ── Cosine similarity ──────────────────────────────────────────────────

  it("cosineSimilarity of identical vectors = 1.0", () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([1, 2, 3]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 5);
  });

  it("cosineSimilarity of orthogonal vectors = 0.0", () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([0, 1, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0, 5);
  });

  it("cosineSimilarity of opposite vectors = -1.0", () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([-1, -2, -3]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0, 5);
  });

  it("cosineSimilarity returns 0 for zero-length vectors", () => {
    const a = new Float32Array([0, 0, 0]);
    const b = new Float32Array([1, 2, 3]);
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  // ── Semantic similarity via real embeddings ────────────────────────────

  itModel("cosine similarity of identical texts ~= 1.0", async () => {
    const text = "Thị trường chứng khoán Việt Nam";
    const v1 = await embed(text);
    const v2 = await embed(text);
    const sim = cosineSimilarity(v1, v2);
    expect(sim).toBeGreaterThan(0.99);
  }, 60_000);

  itModel("similar texts have higher cosine similarity than dissimilar texts", async () => {
    const stockVn = await embed("Cổ phiếu ngân hàng Việt Nam tăng mạnh");
    const stockEn = await embed("Vietnamese bank stocks surge");
    const cookingEn = await embed("How to make chocolate cake recipe");

    const simSimilar = cosineSimilarity(stockVn, stockEn);
    const simDissimilar = cosineSimilarity(stockVn, cookingEn);

    expect(simSimilar).toBeGreaterThan(simDissimilar);
  }, 60_000);

  // ── Batch embedding ────────────────────────────────────────────────────

  itModel("embedBatch returns correct count of Float32Array vectors", async () => {
    const texts = ["hello", "world", "test"];
    const vecs = await embedBatch(texts);
    expect(vecs.length).toBe(3);
    for (const v of vecs) {
      expect(v).toBeInstanceOf(Float32Array);
      expect(v.length).toBe(DIMS);
    }
  }, 60_000);

  it("embedBatch([]) returns empty array", async () => {
    const vecs = await embedBatch([]);
    expect(vecs).toEqual([]);
  });
});
