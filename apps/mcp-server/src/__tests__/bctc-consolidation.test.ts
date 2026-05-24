/**
 * 1954c (G5b) — BCTC Consolidation Integration Test (offline)
 *
 * Verifies that downloadAndExtractPdf routes to the pdf-extractor service
 * as the PRIMARY extraction path, and falls back to pdf-parse when the
 * service is unavailable.
 *
 * Design:
 *   - Spins up a Bun mock HTTP server on a dynamic port (no live VPS needed).
 *   - Sets PDF_EXTRACTOR_URL to the mock server URL via env override.
 *   - Calls downloadAndExtractPdf with the mock URL → asserts service result.
 *   - Shuts down mock server → calls again → asserts pdf-parse fallback.
 *
 * NO live VPS required. NO live pdf-extractor container required.
 * Runs fully offline.
 *
 * Task: 1954c-task-6 (G5b integration test)
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import {
  downloadAndExtractPdf,
  type PdfMicroserviceClient,
  type PdfExtractionResult,
} from "../infrastructure/fetchers/pdf.js";

// ---------------------------------------------------------------------------
// Fixture — mock PdfExtractorResult that the mock server returns
// ---------------------------------------------------------------------------

const FIXTURE_TEXT = "Báo cáo tài chính hợp nhất Quý 1 năm 2026 " + "X".repeat(300);

const FIXTURE_RESPONSE = {
  document_id: "test-bctc-consolidation-doc",
  tables: [
    {
      table_index: 0,
      headers: ["Chỉ tiêu", "Q1-2026", "Q1-2025"],
      rows: [
        ["Doanh thu thuần", "5000", "4500"],
        ["Lợi nhuận sau thuế", "800", "700"],
      ],
      page_number: 2,
    },
  ],
  text_content: FIXTURE_TEXT,
  ocr_confidence: 0.91,
  status: "success",
};

// ---------------------------------------------------------------------------
// Mock HTTP server helpers
// ---------------------------------------------------------------------------

/**
 * Start a Bun HTTP server on a random available port.
 * Returns the server and its base URL.
 */
function startMockExtractorServer(): { server: ReturnType<typeof Bun.serve>; baseUrl: string } {
  const server = Bun.serve({
    port: 0, // let OS pick a free port
    fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/extract" && req.method === "POST") {
        return new Response(JSON.stringify(FIXTURE_RESPONSE), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.pathname === "/health") {
        return new Response(JSON.stringify({ status: "ok" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("not found", { status: 404 });
    },
  });
  const baseUrl = `http://localhost:${server.port}`;
  return { server, baseUrl };
}

/**
 * Build a mock PdfMicroserviceClient that delegates to a given URL.
 * Uses globalThis.fetch so it goes through the actual HTTP layer.
 */
function makeMockClient(serviceUrl: string): PdfMicroserviceClient {
  return {
    extract: async (url: string, sourceType) => {
      try {
        const response = await fetch(`${serviceUrl}/extract`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, source_type: sourceType }),
          signal: AbortSignal.timeout(5_000),
        });
        if (!response.ok) return null;
        const data = await response.json() as {
          document_id: string;
          tables: typeof FIXTURE_RESPONSE.tables;
          text_content: string;
          ocr_confidence: number;
          status: "success" | "failed";
        };
        return {
          documentId: data.document_id,
          tables: data.tables ?? [],
          textContent: data.text_content ?? "",
          ocrConfidence: data.ocr_confidence ?? 0,
          status: data.status,
        };
      } catch {
        return null;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("1954c G5b — BCTC Consolidation Integration (offline mock :5001)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let server: ReturnType<typeof Bun.serve>;
  let baseUrl: string;

  beforeAll(() => {
    const started = startMockExtractorServer();
    server = started.server;
    baseUrl = started.baseUrl;
  });

  afterAll(async () => {
    await server.stop();
  });

  it("service-first: downloadAndExtractPdf returns service result when service is up", async () => {
    // Mock HTTP client that would normally download from VPS (should NOT be called)
    let httpClientCalled = false;
    const httpClient = {
      get: async (_url: string) => {
        httpClientCalled = true;
        return "%PDF-1.4\nfake"; // binary string
      },
    };

    const mockClient = makeMockClient(baseUrl);

    const result: PdfExtractionResult = await downloadAndExtractPdf(
      `${baseUrl}/bctc-files/VCB/VCB_2026_Q1.pdf`,
      httpClient,
      undefined,
      mockClient,
    );

    // Service result must be returned
    expect(result.text).toBe(FIXTURE_TEXT);
    expect(result.confidence).toBe(0.91);
    expect(result.extraction_method).toBe("pybctc_tables"); // fixture has 1 table
    // HTTP download client must NOT have been called (service is primary)
    expect(httpClientCalled).toBe(false);
  });

  it("fallback: service null → pdf-parse result returned (extraction_method absent)", async () => {
    // Inject a mock client that always returns null (service unavailable)
    const nullClient: PdfMicroserviceClient = {
      extract: async () => null,
    };

    // Mock HTTP client returning a minimal parseable PDF binary string
    // We use an empty-like content so pdf-parse returns low confidence (< 200 chars)
    const httpClient = {
      get: async (_url: string) => "%PDF-1.4\nno text here",
    };

    const result: PdfExtractionResult = await downloadAndExtractPdf(
      `${baseUrl}/bctc-files/HPG/HPG_2026_Q1.pdf`,
      httpClient,
      undefined,
      nullClient,
    );

    // Must fall back to pdf-parse result
    // extraction_method must be absent (pdf-parse path does not stamp it)
    expect(result.extraction_method).toBeUndefined();
    // confidence must be in [0, 1] — whatever pdf-parse returns
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("service result: extraction_method='pybctc_text' when service returns no tables", async () => {
    // Fixture with no tables → extraction_method should be 'pybctc_text'
    const noTablesServer: ReturnType<typeof Bun.serve> = Bun.serve({
      port: 0,
      fetch(_req) {
        return new Response(JSON.stringify({
          ...FIXTURE_RESPONSE,
          tables: [],
        }), { status: 200, headers: { "content-type": "application/json" } });
      },
    });

    try {
      const client = makeMockClient(`http://localhost:${noTablesServer.port}`);
      const httpClient = { get: async () => "%PDF-1.4\nfake" };

      const result = await downloadAndExtractPdf(
        `http://localhost:${noTablesServer.port}/bctc-files/VNM/VNM_2026_Q1.pdf`,
        httpClient,
        undefined,
        client,
      );

      expect(result.extraction_method).toBe("pybctc_text");
      expect(result.text).toBe(FIXTURE_TEXT);
    } finally {
      await noTablesServer.stop();
    }
  });
});
