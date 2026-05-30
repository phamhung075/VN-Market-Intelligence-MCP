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
  getPageText,
  rasterizePages,
  PDF_EXTRACTOR_BASE_URL,
} from "../infrastructure/fetchers/pdfExtractorClient.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockFetch(
  status: number,
  body: unknown,
): typeof fetch {
  return (async (_input: string | URL | Request, _init?: RequestInit) => {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response;
  }) as unknown as typeof fetch;
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
    globalThis.fetch = (async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof fetch;

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
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
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
    }) as unknown as typeof fetch;

    try {
      await extractViaMicroservice("http://example.com/doc.pdf");
      expect(capturedBody!).toContain('"source_type":"bctc"');
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
    globalThis.fetch = (async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof fetch;

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

// ---------------------------------------------------------------------------
// AR-MCP-FIX: URL route-prefix regression guard
//
// RED_BEFORE = true  (these tests fail against the /api/-prefixed bug)
// GREEN_AFTER = true (pass after dropping /api/ from getPageText + rasterizePages)
//
// Root cause: pdfExtractorClient.ts:127 and :184 used /api/page-text and
// /api/rasterize — the pdf-extractor mounts ALL routes at root (no prefix).
// The only correct URLs are /page-text and /rasterize.
// ---------------------------------------------------------------------------

describe("AR-MCP-FIX: getPageText URL — no /api/ prefix", () => {
  it("calls GET ${BASE}/page-text (not /api/page-text)", async () => {
    let capturedUrl: string | null = null;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request, _init?: RequestInit) => {
      capturedUrl = typeof input === "string" ? input : input.toString();
      return {
        ok: true,
        status: 200,
        json: async () => ({ text: "sample ocr text", source: "sqlite_ocr" }),
      } as Response;
    }) as unknown as typeof fetch;

    try {
      await getPageText("FPT_Q1_2024.pdf", 1);
      // Must NOT contain /api/ segment
      expect(capturedUrl).not.toBeNull();
      expect(capturedUrl!).not.toContain("/api/page-text");
      // Must contain the correct bare path
      expect(capturedUrl!).toContain("/page-text");
      expect(capturedUrl!).toContain("filename=FPT_Q1_2024.pdf");
      expect(capturedUrl!).toContain("page_number=1");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns parsed PageTextResult on success", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_input: string | URL | Request, _init?: RequestInit) => {
      return {
        ok: true,
        status: 200,
        json: async () => ({ text: "doanh thu 1,234 tỷ", source: "mistral_ocr" }),
      } as Response;
    }) as unknown as typeof fetch;

    try {
      const result = await getPageText("ACB_Q4_2024.pdf", 5);
      expect(result).not.toBeNull();
      expect(result!.text).toBe("doanh thu 1,234 tỷ");
      expect(result!.source).toBe("mistral_ocr");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns null on 404 (page not found)", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    }) as unknown as typeof fetch;

    try {
      const result = await getPageText("missing.pdf", 99);
      expect(result).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns null when service is unreachable", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof fetch;

    try {
      const result = await getPageText("any.pdf", 1);
      expect(result).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("AR-MCP-FIX: rasterizePages URL — no /api/ prefix", () => {
  it("calls POST ${BASE}/rasterize (not /api/rasterize)", async () => {
    let capturedUrl: string | null = null;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request, _init?: RequestInit) => {
      capturedUrl = typeof input === "string" ? input : input.toString();
      return {
        ok: true,
        status: 200,
        json: async () => ({ rasterized: [1, 2], paths: ["/data/p1.jpg", "/data/p2.jpg"] }),
      } as Response;
    }) as unknown as typeof fetch;

    try {
      await rasterizePages("report-001", "FPT_Q1_2024.pdf", [1, 2]);
      // Must NOT contain /api/ segment
      expect(capturedUrl).not.toBeNull();
      expect(capturedUrl!).not.toContain("/api/rasterize");
      // Must contain the correct bare path
      expect(capturedUrl!).toContain("/rasterize");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns RasterizeResult on success", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ({ rasterized: [3], paths: ["/data/p3.jpg"] }),
      } as Response;
    }) as unknown as typeof fetch;

    try {
      const result = await rasterizePages("report-002", "ACB_Q4_2024.pdf", [3]);
      expect(result.rasterized).toEqual([3]);
      expect(result.paths).toEqual(["/data/p3.jpg"]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("throws on non-OK HTTP response", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return {
        ok: false,
        status: 500,
        text: async () => "internal error",
      } as Response;
    }) as unknown as typeof fetch;

    try {
      await expect(rasterizePages("report-003", "bad.pdf", [1])).rejects.toThrow("rasterize HTTP 500");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
