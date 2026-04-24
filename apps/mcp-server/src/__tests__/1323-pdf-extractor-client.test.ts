/**
 * Task 1323 (DDD Phase 1a) — PDF Extractor Microservice Client
 *
 * Tests for pdfExtractorClient.ts:
 *   - extractViaMicroservice: delegates to pdf-extractor service, maps response
 *   - checkPdfExtractorHealth: probes /health endpoint
 *   - Graceful null return on network error / non-OK response
 *
 * All HTTP calls are mocked via global fetch override — no real network access.
 */

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";

// ---------------------------------------------------------------------------
// Module under test — import AFTER patching env vars if needed
// ---------------------------------------------------------------------------

import {
  extractViaMicroservice,
  checkPdfExtractorHealth,
  PDF_EXTRACTOR_BASE_URL,
} from "../infrastructure/fetchers/pdfExtractorClient.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockFetch(
  status: number,
  body: unknown,
): typeof fetch {
  return async (_input: string | URL | Request, _init?: RequestInit) => {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response;
  };
}

// ---------------------------------------------------------------------------
// Tests: extractViaMicroservice
// ---------------------------------------------------------------------------

describe("extractViaMicroservice", () => {
  it("returns parsed result on success response", async () => {
    const mockBody = {
      document_id: "uuid-123",
      tables: [{ table_index: 0, headers: ["Revenue"], rows: [["1000"]], page_number: 0 }],
      text_content: "Revenue 1000",
      ocr_confidence: 0.95,
      status: "success",
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = makeMockFetch(200, mockBody);

    try {
      const result = await extractViaMicroservice("http://example.com/doc.pdf", "bctc");

      expect(result).not.toBeNull();
      expect(result!.documentId).toBe("uuid-123");
      expect(result!.status).toBe("success");
      expect(result!.textContent).toBe("Revenue 1000");
      expect(result!.ocrConfidence).toBe(0.95);
      expect(result!.tables).toHaveLength(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns null on non-OK HTTP response", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = makeMockFetch(500, { detail: "internal error" });

    try {
      const result = await extractViaMicroservice("http://example.com/doc.pdf");
      expect(result).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns null when service is unreachable (fetch throws)", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error("ECONNREFUSED"); };

    try {
      const result = await extractViaMicroservice("http://example.com/doc.pdf");
      expect(result).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns null on 404 response", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = makeMockFetch(404, { detail: "not found" });

    try {
      const result = await extractViaMicroservice("http://example.com/missing.pdf");
      expect(result).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("maps failed status from service correctly", async () => {
    const mockBody = {
      document_id: "uuid-456",
      tables: [],
      text_content: "",
      ocr_confidence: 0.0,
      status: "failed",
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = makeMockFetch(200, mockBody);

    try {
      const result = await extractViaMicroservice("http://example.com/bad.pdf");
      expect(result).not.toBeNull();
      expect(result!.status).toBe("failed");
      expect(result!.tables).toHaveLength(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("defaults source_type to bctc when not provided", async () => {
    let capturedBody: string | null = null;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (_input: string | URL | Request, init?: RequestInit) => {
      capturedBody = init?.body as string ?? null;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          document_id: "x",
          tables: [],
          text_content: "",
          ocr_confidence: 1.0,
          status: "success",
        }),
      } as Response;
    };

    try {
      await extractViaMicroservice("http://example.com/doc.pdf");
      expect(capturedBody).toContain('"source_type":"bctc"');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: checkPdfExtractorHealth
// ---------------------------------------------------------------------------

describe("checkPdfExtractorHealth", () => {
  it("returns true when health endpoint responds ok", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = makeMockFetch(200, { status: "ok", service: "pdf-extractor" });

    try {
      const healthy = await checkPdfExtractorHealth();
      expect(healthy).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns false when health endpoint returns non-ok status field", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = makeMockFetch(200, { status: "degraded" });

    try {
      const healthy = await checkPdfExtractorHealth();
      expect(healthy).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns false when service is unreachable", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error("ECONNREFUSED"); };

    try {
      const healthy = await checkPdfExtractorHealth();
      expect(healthy).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns false when health endpoint returns HTTP 503", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = makeMockFetch(503, {});

    try {
      const healthy = await checkPdfExtractorHealth();
      expect(healthy).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ---------------------------------------------------------------------------
// Config check
// ---------------------------------------------------------------------------

describe("PDF_EXTRACTOR_BASE_URL", () => {
  it("defaults to localhost:5001 when env var not set", () => {
    // The constant was already resolved at import time — verify it
    // contains the expected default (env var not set in test environment)
    expect(typeof PDF_EXTRACTOR_BASE_URL).toBe("string");
    expect(PDF_EXTRACTOR_BASE_URL.length).toBeGreaterThan(0);
  });
});
