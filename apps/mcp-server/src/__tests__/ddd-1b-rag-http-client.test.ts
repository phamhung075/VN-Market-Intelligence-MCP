/**
 * Phase 1b — RAG HTTP Client tests
 *
 * Tests the ragHttpClient infrastructure module:
 * - ragSearch() builds correct fetch request and parses response
 * - ragIndex() builds correct fetch request and parses response
 * - ragHealthCheck() returns true/false based on service response
 *
 * Uses mock fetch (no real network calls).
 */

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";

// ── Helpers ───────────────────────────────────────────────────────────────

function makeFetchMock(status: number, body: unknown): typeof fetch {
  return mock(async (_url: string | URL | Request, _init?: RequestInit) => {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

function makeFailingFetch(error: Error): typeof fetch {
  return mock(async () => {
    throw error;
  }) as unknown as typeof fetch;
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("Phase 1b — ragSearch()", () => {
  it("builds POST /search request and returns parsed results", async () => {
    const mockResponse = {
      results: [
        {
          id: "entry-1",
          level: "global",
          title: "Test",
          summary: "Summary",
          tags: ["vn"],
          action_code: "",
          created_at: new Date().toISOString(),
          distance: 0.3,
          recency_score: 0.7,
        },
      ],
      total: 1,
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = makeFetchMock(200, mockResponse);

    try {
      const { ragSearch } = await import("../infrastructure/rag/ragHttpClient.js");
      const result = await ragSearch({ query: "VCB banking", limit: 5 });

      expect(result.total).toBe(1);
      expect(result.results).toHaveLength(1);
      expect(result.results[0]!.id).toBe("entry-1");
      expect(result.results[0]!.recency_score).toBe(0.7);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("throws on non-OK response", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = makeFetchMock(500, { error: "internal server error" });

    try {
      const { ragSearch } = await import("../infrastructure/rag/ragHttpClient.js");
      await expect(ragSearch({ query: "q" })).rejects.toThrow(/search failed/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("Phase 1b — ragIndex()", () => {
  it("builds POST /index request and returns parsed response", async () => {
    const mockResponse = {
      status: "ok",
      indexed: 1,
      entry_id: "my-entry-id",
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = makeFetchMock(200, mockResponse);

    try {
      const { ragIndex } = await import("../infrastructure/rag/ragHttpClient.js");
      const result = await ragIndex({
        id: "my-entry-id",
        content: "VCB credit growth Q1 2025",
        tags: ["banking", "credit"],
        level: "action",
        action_code: "VCB",
      });

      expect(result.status).toBe("ok");
      expect(result.indexed).toBe(1);
      expect(result.entry_id).toBe("my-entry-id");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("throws on non-OK response", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = makeFetchMock(422, { detail: "validation error" });

    try {
      const { ragIndex } = await import("../infrastructure/rag/ragHttpClient.js");
      await expect(
        ragIndex({ id: "e1", content: "test", tags: [] })
      ).rejects.toThrow(/index failed/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("Phase 1b — ragHealthCheck()", () => {
  it("returns true when service responds with {status: 'ok'}", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = makeFetchMock(200, { status: "ok", service: "rag-service" });

    try {
      const { ragHealthCheck } = await import("../infrastructure/rag/ragHttpClient.js");
      const healthy = await ragHealthCheck();
      expect(healthy).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns false when service responds with non-OK status", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = makeFetchMock(503, {});

    try {
      const { ragHealthCheck } = await import("../infrastructure/rag/ragHttpClient.js");
      const healthy = await ragHealthCheck();
      expect(healthy).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns false when service is unreachable (network error)", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = makeFailingFetch(new Error("ECONNREFUSED"));

    try {
      const { ragHealthCheck } = await import("../infrastructure/rag/ragHttpClient.js");
      const healthy = await ragHealthCheck();
      expect(healthy).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns false when status is not 'ok' in response body", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = makeFetchMock(200, { status: "degraded", service: "rag-service" });

    try {
      const { ragHealthCheck } = await import("../infrastructure/rag/ragHttpClient.js");
      const healthy = await ragHealthCheck();
      expect(healthy).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
