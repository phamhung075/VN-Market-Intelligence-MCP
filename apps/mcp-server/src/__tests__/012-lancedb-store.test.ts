/**
 * Task 012 — LanceDB vector store (read/write/search)
 *
 * Verifies:
 *   1. insertVector stores an entry successfully
 *   2. searchSimilar returns results sorted by similarity
 *   3. Insert then search by same text returns it as #1
 *   4. searchSimilar with k=5 returns at most 5 results
 *   5. Search with level filter works correctly
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
// G5a (P2-F): legacy LanceDB implementation moved to _deprecated/; tests preserved as regression anchors.
import {
  initVectorStore,
  insertVector,
  searchSimilar,
  closeVectorStore,
} from "../infrastructure/rag/_deprecated/vectorstore.js";
import { embed } from "../infrastructure/rag/_deprecated/embeddings.js";

const TEST_DB_PATH = path.join(import.meta.dir, "../../data/test-lancedb-012");
const DIMS = 384;

// Helper: create a random-ish vector
function randomVector(): Float32Array {
  const v = new Float32Array(DIMS);
  for (let i = 0; i < DIMS; i++) v[i] = Math.random() - 0.5;
  return v;
}

// Helper: normalize a vector (LanceDB uses L2 distance, normalized vectors give cosine-like behavior)
function normalize(v: Float32Array): Float32Array {
  let mag = 0;
  for (let i = 0; i < v.length; i++) mag += v[i]! * v[i]!;
  mag = Math.sqrt(mag);
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i]! / mag;
  return out;
}

describe("Task 012 — LanceDB vector store", () => {
  beforeAll(async () => {
    // Clean up any previous test DB
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.rmSync(TEST_DB_PATH, { recursive: true, force: true });
    }
    await initVectorStore(TEST_DB_PATH);
  });

  afterAll(async () => {
    await closeVectorStore();
    // Clean up
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.rmSync(TEST_DB_PATH, { recursive: true, force: true });
    }
  });

  // ── 1. insertVector stores an entry ──────────────────────────────────────

  it("insertVector stores an entry successfully", async () => {
    const id = randomUUID();
    const vector = normalize(randomVector());

    await insertVector({
      id,
      level: "global",
      title: "Test entry",
      summary: "A test summary for insertion",
      vector,
      tags: ["test", "insert"],
      createdAt: new Date().toISOString(),
    });

    // Verify by searching with the same vector — should find it
    const results = await searchSimilar(vector, 1);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]!.id).toBe(id);
  });

  // ── 2. searchSimilar returns results sorted by similarity ──────────────

  it("searchSimilar returns results sorted by similarity", async () => {
    // Insert entries with known vectors
    const baseVector = normalize(randomVector());

    // Create a similar vector (small perturbation)
    const similarVector = normalize(
      new Float32Array(baseVector.map((v, i) => v + (i % 2 === 0 ? 0.01 : -0.01)))
    );

    // Create a very different vector (negate)
    const differentVector = normalize(
      new Float32Array(baseVector.map((v) => -v + (Math.random() * 0.1 - 0.05)))
    );

    await insertVector({
      id: randomUUID(),
      level: "country",
      title: "Similar entry",
      summary: "Similar to query",
      vector: similarVector,
      tags: ["similar"],
      createdAt: new Date().toISOString(),
    });

    await insertVector({
      id: randomUUID(),
      level: "country",
      title: "Different entry",
      summary: "Very different from query",
      vector: differentVector,
      tags: ["different"],
      createdAt: new Date().toISOString(),
    });

    const results = await searchSimilar(baseVector, 10);
    expect(results.length).toBeGreaterThanOrEqual(2);

    // Results should be sorted: lower _distance = more similar
    for (let i = 1; i < results.length; i++) {
      expect(results[i]!.distance).toBeGreaterThanOrEqual(results[i - 1]!.distance);
    }
  });

  // ── 3. Insert then search by same text returns it as #1 ────────────────

  it("insert then search by same text returns it as #1", async () => {
    const text = "Báo cáo tài chính VCB Q1 2025 doanh thu thuần tăng mạnh";
    const vector = await embed(text);
    const id = randomUUID();

    await insertVector({
      id,
      level: "action",
      title: "VCB Q1 2025 report",
      summary: text,
      vector,
      tags: ["VCB", "BCTC", "Q1-2025"],
      actionCode: "VCB",
      createdAt: new Date().toISOString(),
    });

    const queryVector = await embed(text);
    const results = await searchSimilar(queryVector, 5);

    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]!.id).toBe(id);
    expect(results[0]!.distance).toBeCloseTo(0, 1); // near-zero distance for same text
  }, 120_000);

  // ── 4. searchSimilar with k=5 returns at most 5 results ────────────────

  it("searchSimilar with k=5 returns at most 5 results", async () => {
    // Insert 8 entries
    for (let i = 0; i < 8; i++) {
      await insertVector({
        id: randomUUID(),
        level: "domain",
        title: `Bulk entry ${i}`,
        summary: `Bulk test entry number ${i}`,
        vector: normalize(randomVector()),
        tags: ["bulk"],
        createdAt: new Date().toISOString(),
      });
    }

    const queryVector = normalize(randomVector());
    const results = await searchSimilar(queryVector, 5);

    expect(results.length).toBeLessThanOrEqual(5);
    expect(results.length).toBe(5);
  });

  // ── 5. Search with level filter works correctly ─────────────────────────

  it("search with level filter works correctly", async () => {
    const vector = normalize(randomVector());
    const filteredId = randomUUID();

    await insertVector({
      id: filteredId,
      level: "domain",
      title: "Filtered entry",
      summary: "This entry has a unique level",
      vector,
      tags: ["filter-test"],
      createdAt: new Date().toISOString(),
    });

    // Search with matching level filter
    const results = await searchSimilar(vector, 10, { level: "domain" });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.every((r) => r.level === "domain")).toBe(true);

    // Search with non-matching level filter
    const noResults = await searchSimilar(vector, 10, { level: "global" });
    // May return 0 if no global entries, or some — just verify no crash
  });

  // ── 6. Search with actionCode filter works ──────────────────────────────

  it("search with actionCode filter works correctly", async () => {
    const vector = normalize(randomVector());
    const id = randomUUID();

    await insertVector({
      id,
      level: "action",
      title: "HPG entry",
      summary: "HPG steel company analysis",
      vector,
      tags: ["HPG"],
      actionCode: "HPG",
      createdAt: new Date().toISOString(),
    });

    const results = await searchSimilar(vector, 5, { actionCode: "HPG" });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]!.id).toBe(id);
    expect(results[0]!.actionCode).toBe("HPG");
  });
});
