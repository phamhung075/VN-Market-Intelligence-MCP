/**
 * P2-F — RAG HTTP Rewire Integration Test
 *
 * Verifies G5b acceptance criteria (P2-F rag-service SCALE pilot):
 *   AC-3: callers no longer reference infrastructure/rag/retriever or vectorstore (live path)
 *   AC-4: analysis.ts uses ragSearch/ragIndex from ragHttpClient (HTTP client active)
 *   AC-5: R-1 resolved — no direct lancedb import in live path
 *   AC-7: mcp-server TS build/typecheck is clean (verified by bun tsc)
 *   AC-8: ragSearch via ragHttpClient.ts routes to port 5002 (mock boundary verified)
 *
 * If the live rag-service container is not running in this session, this test
 * uses mock fetch to verify the HTTP boundary is correct (not direct LanceDB).
 * Live e2e (port 5002 container) is user-verifiable once Docker is running.
 */

import { describe, it, expect } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";

// ── AC-3: Static import-path check ───────────────────────────────────────────

const SRC_ROOT = path.resolve(import.meta.dir, "..");

/** Read a source file and return its content. Returns "" if not found. */
function readSrc(relPath: string): string {
  try {
    return fs.readFileSync(path.join(SRC_ROOT, relPath), "utf8");
  } catch {
    return "";
  }
}

describe("P2-F G5b — callers rewired to ragHttpClient", () => {
  it("analysis.ts does NOT import from retriever.ts (live path)", () => {
    const src = readSrc("interface/mcp/tools/news-analysis/analysis.ts");
    // Must not have a live (non-_deprecated) import of retriever
    expect(src).not.toMatch(/from.*["'].*infrastructure\/rag\/retriever["']/);
    expect(src).not.toMatch(/from.*["'].*infrastructure\/rag\/vectorstore["']/);
    expect(src).not.toMatch(/from.*["'].*infrastructure\/rag\/embeddings["']/);
  });

  it("analysis.ts imports ragSearch and ragIndex from ragHttpClient", () => {
    const src = readSrc("interface/mcp/tools/news-analysis/analysis.ts");
    expect(src).toMatch(/ragSearch/);
    expect(src).toMatch(/ragIndex/);
    expect(src).toMatch(/ragHttpClient/);
  });

  it("dataAuditJob.ts does NOT import from vectorstore.ts (live path)", () => {
    const src = readSrc("scheduler/news-analysis/dataAuditJob.ts");
    // The dynamic import of vectorstore for getCount and compactVectorStore must be gone
    expect(src).not.toMatch(/import\(".*infrastructure\/rag\/vectorstore\.js"\)/);
  });

  it("index.ts does NOT import from vectorstore.ts (live path)", () => {
    const src = readSrc("index.ts");
    // No dynamic import of vectorstore.js from the live path
    expect(src).not.toMatch(/import\(".*infrastructure\/rag\/vectorstore\.js"\)/);
    expect(src).not.toMatch(/from.*["'].*infrastructure\/rag\/vectorstore["']/);
  });

  it("fetchParseAndStoreBctc.ts imports AnalysisInput from ragHttpClient (not retriever)", () => {
    const src = readSrc("application/usecases/fetchParseAndStoreBctc.ts");
    expect(src).not.toMatch(/from.*["'].*infrastructure\/rag\/retriever["']/);
    expect(src).toMatch(/ragHttpClient/);
  });
});

// ── AC-5: No direct lancedb import in live (non-_deprecated) path ─────────────

describe("P2-F G5b — R-1 resolved: no lancedb in live rag/ path", () => {
  it("live rag/ dir has no .ts files importing lancedb directly", () => {
    const ragDir = path.join(SRC_ROOT, "infrastructure/rag");
    const liveFiles = fs.readdirSync(ragDir)
      .filter((f) => f.endsWith(".ts") && !f.startsWith("_deprecated") && f !== "index.ts");

    const violations: string[] = [];
    for (const fname of liveFiles) {
      const content = readSrc(`infrastructure/rag/${fname}`);
      if (content.match(/from\s+["']@lancedb\/lancedb["']|import\s+\*\s+as\s+lancedb/)) {
        violations.push(fname);
      }
    }
    expect(violations).toEqual([]); // no direct lancedb imports in live path
  });
});

// ── AC-8: HTTP boundary mock test ─────────────────────────────────────────────

describe("P2-F G5b — ragSearch routes to port 5002 (mock boundary)", () => {
  it("ragSearch sends POST to /search endpoint (port 5002)", async () => {
    const mockBody = { results: [], total: 0 };
    let capturedUrl = "";
    let capturedMethod = "";

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = typeof url === "string" ? url : url.toString();
      capturedMethod = init?.method ?? "GET";
      return new Response(JSON.stringify(mockBody), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    try {
      const { ragSearch } = await import("../infrastructure/rag/ragHttpClient.js");
      await ragSearch({ query: "VCB earnings", limit: 5 });

      // Must call the rag-service /search endpoint (port 5002 or RAG_SERVICE_URL)
      expect(capturedUrl).toContain("/search");
      expect(capturedMethod).toBe("POST");
      // Default URL must include port 5002
      const defaultUrl = process.env["RAG_SERVICE_URL"] ?? "http://localhost:5002";
      expect(capturedUrl).toContain(defaultUrl.split("//")[1] ?? "localhost:5002");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("ragIndex sends POST to /index endpoint (port 5002)", async () => {
    const mockBody = { status: "ok", indexed: 1, entry_id: "test-id" };
    let capturedUrl = "";

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, _init?: RequestInit) => {
      capturedUrl = typeof url === "string" ? url : url.toString();
      return new Response(JSON.stringify(mockBody), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    try {
      const { ragIndex } = await import("../infrastructure/rag/ragHttpClient.js");
      await ragIndex({
        id: "test-001",
        content: "VCB credit growth Q1 2025",
        tags: ["banking"],
        level: "action",
        action_code: "VCB",
      });

      expect(capturedUrl).toContain("/index");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
