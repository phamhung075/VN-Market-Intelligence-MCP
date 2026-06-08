Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1352b — PDF Extractor Microservice Wiring Tests
 *
 * 14 test cases covering:
 *
 *   Suite A — checkPdfExtractorHealth (3 cases)
 *     A1: health endpoint returns {status:"ok"} → true
 *     A2: health endpoint returns non-ok body → false
 *     A3: fetch throws (service down) → false
 *
 *   Suite B — extractViaMicroservice (4 cases)
 *     B1: POST /extract success with tables → PdfExtractorResult
 *     B2: POST /extract success text-only (no tables) → PdfExtractorResult
 *     B3: HTTP non-ok response → null
 *     B4: fetch throws → null
 *
 *   Suite C — pdf.ts downloadAndExtractPdfWithMicroserviceFallback (4 cases)
 *     C1: pdf-parse high confidence → returns immediately, no microservice call
 *     C2: pdf-parse low confidence, microservice succeeds with tables →
 *         extraction_method='pybctc_tables'
 *     C3: pdf-parse low confidence, microservice succeeds text-only →
 *         extraction_method='pybctc_text'
 *     C4: pdf-parse low confidence, microservice returns null →
 *         returns pdf-parse result unchanged
 *
 *   Suite D — fetchParseAndStoreBctc microservice path (3 cases)
 *     D1: microservice used when OCR confidence < 0.5 → extraction_method stamped 'pybctc_tables'
 *     D2: microservice unavailable (returns null) → pipeline uses OCR result as-is
 *     D3: pdfTextOverride bypasses microservice entirely
 *
 * Mock strategy:
 *   - Suites A+B: inject mock fetch into pdfExtractorClient via environment override
 *   - Suite C: inject mock httpClient + mock microservice client via ports
 *   - Suite D: inject pdfTextOverride / mock microservice client
 *
 * @module __tests__/1352b-pdf-extractor-wiring
 */

import { describe, it, expect, mock, beforeAll, afterAll } from "bun:test";
import {
  checkPdfExtractorHealth,
  extractViaMicroservice,
  PDF_EXTRACTOR_BASE_URL,
  type PdfExtractorResult,
} from "../infrastructure/fetchers/pdfExtractorClient.js";
import {
  downloadAndExtractPdf,
  PDF_CONFIDENCE_HIGH_THRESHOLD,
  type PdfExtractionResult,
  type PdfMicroserviceClient,
} from "../infrastructure/fetchers/pdf.js";
import { initDatabase, closeDb } from "../infrastructure/db/schema.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

// Bun's typeof fetch includes a `preconnect` property. Cast via unknown to
// avoid having to replicate the full Bun-specific fetch type signature.
function makeFetchOk(body: unknown, status = 200): typeof fetch {
  const fn = async (_url: string | URL | Request, _init?: RequestInit) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  return fn as unknown as typeof fetch;
}

function makeFetchThrows(msg: string): typeof fetch {
  const fn = async () => {
    throw new Error(msg);
  };
  return fn as unknown as typeof fetch;
}

/** Minimal PDF buffer with enough text to be high-confidence */
function highTextBuffer(): Buffer {
  const text = "A".repeat(PDF_CONFIDENCE_HIGH_THRESHOLD + 10);
  return Buffer.from(`%PDF-1.4\n${text}`);
}

/** Mock PDF buffer that produces near-empty text when parsed */
function emptyTextBuffer(): Buffer {
  return Buffer.from("%PDF-1.4\n(no text)");
}

function mockExtractorResult(hasTables: boolean): PdfExtractorResult {
  return {
    documentId: "doc-abc",
    tables: hasTables
      ? [{ table_index: 0, headers: ["Chỉ tiêu", "Giá trị"], rows: [["Doanh thu", "5000"]], page_number: 1 }]
      : [],
    textContent: "Doanh thu thuần Q1 2025: 5,000 tỷ đồng",
    ocrConfidence: 0.82,
    status: "success",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite A — checkPdfExtractorHealth
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1352b — Suite A: checkPdfExtractorHealth", () => {
  it("A1: health endpoint returns {status:'ok'} → true", async () => {
    // Temporarily replace global fetch with a stub
    const origFetch = globalThis.fetch;
    globalThis.fetch = makeFetchOk({ status: "ok" }) as typeof fetch;
    try {
      const result = await checkPdfExtractorHealth();
      expect(result).toBe(true);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("A2: health endpoint returns non-ok body → false", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = makeFetchOk({ status: "degraded" }) as typeof fetch;
    try {
      const result = await checkPdfExtractorHealth();
      expect(result).toBe(false);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("A3: fetch throws (service down) → false (never throws)", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = makeFetchThrows("connection refused") as typeof fetch;
    try {
      const result = await checkPdfExtractorHealth();
      expect(result).toBe(false);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite B — extractViaMicroservice
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1352b — Suite B: extractViaMicroservice", () => {
  it("B1: POST /extract success with tables → PdfExtractorResult populated", async () => {
    const origFetch = globalThis.fetch;
    const responseBody = {
      document_id: "doc-b1",
      tables: [{ table_index: 0, headers: ["Col"], rows: [["Val"]], page_number: 1 }],
      text_content: "Financial data Q1",
      ocr_confidence: 0.9,
      status: "success",
    };
    globalThis.fetch = makeFetchOk(responseBody) as typeof fetch;
    try {
      const result = await extractViaMicroservice("https://example.com/report.pdf", "bctc");
      expect(result).not.toBeNull();
      expect(result!.status).toBe("success");
      expect(result!.tables).toHaveLength(1);
      expect(result!.textContent).toBe("Financial data Q1");
      expect(result!.ocrConfidence).toBe(0.9);
      expect(result!.documentId).toBe("doc-b1");
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("B2: POST /extract success text-only (no tables) → tables=[]", async () => {
    const origFetch = globalThis.fetch;
    const responseBody = {
      document_id: "doc-b2",
      tables: [],
      text_content: "Text only content",
      ocr_confidence: 0.75,
      status: "success",
    };
    globalThis.fetch = makeFetchOk(responseBody) as typeof fetch;
    try {
      const result = await extractViaMicroservice("https://example.com/report.pdf", "bctc");
      expect(result).not.toBeNull();
      expect(result!.tables).toHaveLength(0);
      expect(result!.textContent).toBe("Text only content");
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("B3: HTTP 500 response → null (no throw)", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = makeFetchOk({ error: "internal server error" }, 500) as typeof fetch;
    try {
      const result = await extractViaMicroservice("https://example.com/report.pdf", "bctc");
      expect(result).toBeNull();
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("B4: fetch throws → null (never throws)", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = makeFetchThrows("ECONNREFUSED") as typeof fetch;
    try {
      const result = await extractViaMicroservice("https://example.com/report.pdf", "bctc");
      expect(result).toBeNull();
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite C — downloadAndExtractPdf with service-first inversion (1954c G5b)
// ─────────────────────────────────────────────────────────────────────────────
//
// NEW pipeline order (service-first):
//   1. Call microservice FIRST. On success → return service result.
//   2. If service returns null/throws → fall back to pdf-parse (http download).
//
// NOTE: C1 behavior has changed: previously pdf-parse ran first and service was
// only called for low confidence. Now service is always primary. C1 now verifies
// that when service succeeds, its result is returned (regardless of pdf-parse).
//

describe("Task 1352b — Suite C: downloadAndExtractPdf service-first (1954c)", () => {
  /**
   * Mock HttpClient that returns a binary string representing the given buffer.
   */
  function makeHttpClientReturning(buf: Buffer) {
    return {
      get: async (_url: string) => buf.toString("binary"),
    };
  }

  it("C1: service succeeds → returns service result, pdf-parse NOT called", async () => {
    // Service-first: when the microservice succeeds, its result is returned
    // immediately without triggering an HTTP download or pdf-parse.
    let httpClientCalled = false;
    const httpClient = {
      get: async (_url: string) => {
        httpClientCalled = true;
        return Buffer.from("fake-pdf").toString("binary");
      },
    };
    const microResult = mockExtractorResult(true);

    const mockMicroserviceClient: PdfMicroserviceClient = {
      extract: async (_url, _sourceType) => microResult,
    };

    const result = await downloadAndExtractPdf("https://example.com/r.pdf", httpClient, undefined, mockMicroserviceClient);

    // Service result returned
    expect(result.extraction_method).toBe("pybctc_tables");
    expect(result.confidence).toBe(microResult.ocrConfidence);
    expect(result.text).toBe(microResult.textContent);
    // HTTP download NOT triggered (service is primary)
    expect(httpClientCalled).toBe(false);
  });

  it("C2: service returns null → falls back to pdf-parse, extraction_method absent", async () => {
    mock.module("pdf-parse", () => ({
      default: async (_buf: Buffer) => ({
        text: "sparse",
        numpages: 1,
      }),
    }));

    const httpClient = makeHttpClientReturning(Buffer.from("fake-pdf"));

    const mockMicroserviceClient: PdfMicroserviceClient = {
      extract: async (_url, _sourceType) => null,
    };

    const result = await downloadAndExtractPdf("https://example.com/r.pdf", httpClient, undefined, mockMicroserviceClient);

    // pdf-parse fallback result (confidence=0.3 for "sparse")
    expect(result.confidence).toBe(0.3);
    expect(result.text).toBe("sparse");
    expect(result.extraction_method).toBeUndefined();
  });

  it("C3: service success text-only (no tables) → extraction_method='pybctc_text'", async () => {
    const httpClient = makeHttpClientReturning(Buffer.from("fake-pdf"));
    const microResult = mockExtractorResult(false); // no tables

    const mockMicroserviceClient: PdfMicroserviceClient = {
      extract: async (_url, _sourceType) => microResult,
    };

    const result = await downloadAndExtractPdf("https://example.com/r.pdf", httpClient, undefined, mockMicroserviceClient);

    expect(result.extraction_method).toBe("pybctc_text");
    expect(result.text).toBe(microResult.textContent);
  });

  it("C4: service status='failed' → treated as null, falls back to pdf-parse", async () => {
    mock.module("pdf-parse", () => ({
      default: async (_buf: Buffer) => ({
        text: "fallback text",
        numpages: 1,
      }),
    }));

    const httpClient = makeHttpClientReturning(Buffer.from("fake-pdf"));

    const failedResult: PdfExtractorResult = {
      documentId: "doc-fail",
      tables: [],
      textContent: "",
      ocrConfidence: 0,
      status: "failed",
    };

    const mockMicroserviceClient: PdfMicroserviceClient = {
      extract: async (_url, _sourceType) => failedResult,
    };

    const result = await downloadAndExtractPdf("https://example.com/r.pdf", httpClient, undefined, mockMicroserviceClient);

    // status='failed' → treated as null → pdf-parse fallback
    expect(result.confidence).toBe(0.3);
    expect(result.extraction_method).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite D — pdf.ts port behaviour & extraction_method edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1352b — Suite D: extraction_method values and edge cases", () => {
  it("D1: microservice returns success=false → treated as null, original result kept", async () => {
    mock.module("pdf-parse", () => ({
      default: async () => ({ text: "brief", numpages: 1 }),
    }));

    const httpClient = { get: async (_url: string) => Buffer.from("pdf").toString("binary") };
    const failedResult: PdfExtractorResult = {
      documentId: "doc-fail",
      tables: [],
      textContent: "",
      ocrConfidence: 0,
      status: "failed",
    };
    const microClient: PdfMicroserviceClient = {
      extract: async () => failedResult,
    };

    const result = await downloadAndExtractPdf(
      "https://example.com/fail.pdf",
      httpClient,
      undefined,
      microClient,
    );

    // status='failed' → treated as null fallback → original pdf-parse result
    expect(result.confidence).toBe(0.3);
    expect(result.extraction_method).toBeUndefined();
  });

  it("D2: microservice returns null → original pdf-parse result unchanged", async () => {
    mock.module("pdf-parse", () => ({
      default: async () => ({ text: "short text", numpages: 1 }),
    }));

    const httpClient = { get: async (_url: string) => Buffer.from("pdf").toString("binary") };
    const microClient: PdfMicroserviceClient = {
      extract: async () => null,
    };

    const result = await downloadAndExtractPdf(
      "https://example.com/null.pdf",
      httpClient,
      undefined,
      microClient,
    );

    expect(result.confidence).toBe(0.3);
    expect(result.text).toBe("short text");
    expect(result.extraction_method).toBeUndefined();
  });

  it("D3: low-confidence + microservice tables → extraction_method='pybctc_tables', confidence=microservice value", async () => {
    mock.module("pdf-parse", () => ({
      default: async () => ({ text: "x", numpages: 1 }),
    }));

    const microResult = mockExtractorResult(true); // has tables

    const httpClient = { get: async (_url: string) => Buffer.from("pdf").toString("binary") };
    const microClient: PdfMicroserviceClient = {
      extract: async () => microResult,
    };

    const result = await downloadAndExtractPdf(
      "https://example.com/vcb-q1.pdf",
      httpClient,
      undefined,
      microClient,
    );

    expect(result.extraction_method).toBe("pybctc_tables");
    expect(result.confidence).toBe(microResult.ocrConfidence);
    expect(result.text).toBe(microResult.textContent);
  });
});
