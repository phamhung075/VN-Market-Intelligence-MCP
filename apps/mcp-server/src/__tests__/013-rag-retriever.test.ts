/**
 * Task 013 — RAG Multi-Level Retriever
 *
 * Tests for searchContext() and insertAnalysis() in retriever.ts.
 * Uses an isolated in-memory (temp dir) LanceDB store per test suite.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
// G5a (P2-F): legacy LanceDB implementation moved to _deprecated/; tests preserved as regression anchors.
import { initVectorStore, closeVectorStore } from "../infrastructure/rag/_deprecated/vectorstore.js";
import { searchContext, insertAnalysis } from "../infrastructure/rag/_deprecated/retriever.js";

// ── Helpers ────────────────────────────────────────────────────────────────

let tmpDir: string;

beforeAll(async () => {
  // Create a fresh temp directory for this test run so tests are isolated
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rag-retriever-test-"));
  await initVectorStore(tmpDir);

  // Seed: insert several entries across levels and actionCodes
  await insertAnalysis({
    id: "global-001",
    level: "global",
    title: "Fed raises rates by 50bp",
    summary: "The Federal Reserve increased the benchmark rate, tightening global liquidity.",
    tags: ["fed", "rates", "global"],
  });

  await insertAnalysis({
    id: "country-001",
    level: "country",
    title: "VN-Index drops on foreign sell-off",
    summary: "Foreign investors net-sold 500 billion VND on HOSE, pressuring VN-Index.",
    tags: ["vn-index", "foreign", "sell-off"],
  });

  await insertAnalysis({
    id: "domain-001",
    level: "domain",
    title: "Banking sector tightens credit",
    summary: "SBV directive limits credit growth in the banking sector for H2.",
    tags: ["banking", "credit", "sbv"],
  });

  await insertAnalysis({
    id: "action-vcb-001",
    level: "action",
    title: "VCB Q2 profit beats estimates",
    summary: "Vietcombank reported Q2 net profit of 12,000 billion VND, up 18% YoY.",
    tags: ["vcb", "profit", "q2"],
    actionCode: "VCB",
  });

  await insertAnalysis({
    id: "action-vcb-002",
    level: "action",
    title: "VCB raises lending rates",
    summary: "Vietcombank increased average lending rates by 0.5% across retail products.",
    tags: ["vcb", "lending", "rates"],
    actionCode: "VCB",
  });

  await insertAnalysis({
    id: "action-gas-001",
    level: "action",
    title: "GAS pipeline expansion approved",
    summary: "PV GAS received government approval for a 400km pipeline expansion in the south.",
    tags: ["gas", "pipeline", "expansion"],
    actionCode: "GAS",
  });
}, 60_000); // allow time for model load

afterAll(async () => {
  await closeVectorStore();
  // Clean up temp db
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe("Task 013 — RAG Multi-Level Retriever", () => {
  describe("searchContext — basic search", () => {
    it("returns results from the store for a relevant query", async () => {
      const results = await searchContext("interest rates monetary policy", { maxDistance: 2.0 });
      expect(results.length).toBeGreaterThan(0);
    });

    it("returns SearchResult objects with the expected shape", async () => {
      const results = await searchContext("banking credit Vietnam", { k: 3, maxDistance: 2.0 });
      expect(results.length).toBeGreaterThan(0);
      const first = results[0]!;
      expect(typeof first.id).toBe("string");
      expect(typeof first.level).toBe("string");
      expect(typeof first.title).toBe("string");
      expect(typeof first.summary).toBe("string");
      expect(Array.isArray(first.tags)).toBe(true);
      expect(typeof first.distance).toBe("number");
    });
  });

  describe("searchContext — k parameter", () => {
    it("limits results to k=1", async () => {
      const results = await searchContext("market news", { k: 1 , maxDistance: 2.0});
      expect(results.length).toBeLessThanOrEqual(1);
    });

    it("limits results to k=2", async () => {
      const results = await searchContext("Vietnam stock market", { k: 2 , maxDistance: 2.0});
      expect(results.length).toBeLessThanOrEqual(2);
    });
  });

  describe("searchContext — level filter", () => {
    it("returns only entries with level='action' when filtered", async () => {
      const results = await searchContext("VCB Vietcombank profit", {
        level: "action",
        k: 10,
        maxDistance: 2.0,
      });
      expect(results.length).toBeGreaterThan(0);
      for (const r of results) {
        expect(r.level).toBe("action");
      }
    });

    it("returns only entries with level='global' when filtered", async () => {
      const results = await searchContext("Federal Reserve interest rates", {
        level: "global",
        k: 10,
        maxDistance: 2.0,
      });
      expect(results.length).toBeGreaterThan(0);
      for (const r of results) {
        expect(r.level).toBe("global");
      }
    });

    it("level filter excludes wrong-level results", async () => {
      const results = await searchContext("rates credit banking", {
        level: "domain",
        k: 10,
        maxDistance: 2.0,
      });
      for (const r of results) {
        expect(r.level).toBe("domain");
        expect(r.level).not.toBe("global");
        expect(r.level).not.toBe("action");
      }
    });
  });

  describe("searchContext — actionCode filter", () => {
    it("returns only entries with actionCode='VCB' when filtered", async () => {
      const results = await searchContext("bank profit lending", {
        actionCode: "VCB",
        k: 10,
        maxDistance: 2.0,
      });
      expect(results.length).toBeGreaterThan(0);
      for (const r of results) {
        expect(r.actionCode).toBe("VCB");
      }
    });

    it("does not return GAS entries when actionCode='VCB'", async () => {
      const results = await searchContext("pipeline expansion", {
        actionCode: "VCB",
        k: 10,
        maxDistance: 2.0,
      });
      for (const r of results) {
        expect(r.actionCode).not.toBe("GAS");
      }
    });

    it("returns only entries with actionCode='GAS' when filtered", async () => {
      const results = await searchContext("pipeline expansion PV GAS", {
        actionCode: "GAS",
        k: 10,
        maxDistance: 2.0,
      });
      expect(results.length).toBeGreaterThan(0);
      for (const r of results) {
        expect(r.actionCode).toBe("GAS");
      }
    });
  });

  describe("searchContext — combined filters", () => {
    it("filters by both level and actionCode simultaneously", async () => {
      const results = await searchContext("VCB news", {
        level: "action",
        actionCode: "VCB",
        k: 10,
        maxDistance: 2.0,
      });
      expect(results.length).toBeGreaterThan(0);
      for (const r of results) {
        expect(r.level).toBe("action");
        expect(r.actionCode).toBe("VCB");
      }
    });
  });

  describe("insertAnalysis — stores and makes searchable", () => {
    it("inserted entry appears in subsequent search results", async () => {
      await insertAnalysis({
        id: "country-002",
        level: "country",
        title: "Vietnam GDP growth accelerates Q3",
        summary: "GSO reported GDP growth of 7.4% in Q3, beating consensus forecast of 6.8%.",
        tags: ["gdp", "growth", "gso"],
      });

      const results = await searchContext("Vietnam GDP economic growth", { k: 10 , maxDistance: 2.0});
      const ids = results.map((r) => r.id);
      expect(ids).toContain("country-002");
    });

    it("inserted entry with actionCode is retrievable by actionCode filter", async () => {
      await insertAnalysis({
        id: "action-vcb-003",
        level: "action",
        title: "VCB dividend announcement",
        summary: "Vietcombank board approved a 10% cash dividend for FY2025.",
        tags: ["vcb", "dividend"],
        actionCode: "VCB",
      });

      const results = await searchContext("dividend announcement Vietcombank", {
        actionCode: "VCB",
        k: 10,
        maxDistance: 2.0,
      });
      const ids = results.map((r) => r.id);
      expect(ids).toContain("action-vcb-003");
    });
  });
});
