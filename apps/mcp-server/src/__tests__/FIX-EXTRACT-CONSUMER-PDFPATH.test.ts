/**
 * FIX-EXTRACT-CONSUMER-PDFPATH — consumer-side wiring of FEAT-PDF-EXTRACTOR-LOCAL-INPUT
 *
 * Verifies that the mcp-server extraction call sites correctly use the new
 * pdf_path body mode (POST /extract with {"pdf_path": ..., "source_type": "bctc"})
 * when a locally-stored PDF file path is available.
 *
 * Background: apps/pdf-extractor commit 8c12b970 added POST /extract support for
 *   {"pdf_path": "/app/data/pdfs/<file>.pdf", "source_type": "bctc"}
 * Both containers share ./data/pdfs:/app/data/pdfs. Sending pdf_path bypasses HTTP
 * fetch entirely — no 401 from VPS, real OCR pipeline for scanned PDFs.
 *
 * Three RED→GREEN tests:
 *
 *   TC-PDFPATH-1 (body shape):
 *     extractViaMicroservice("", "bctc", "/app/data/pdfs/VNM_2025_Q4.pdf") sends
 *     body = {"pdf_path": "/app/data/pdfs/VNM_2025_Q4.pdf", "source_type": "bctc"}
 *     with NO "url" key anywhere in the body.
 *
 *   TC-PDFPATH-2 (URL mode regression):
 *     extractViaMicroservice("http://example.com/doc.pdf", "bctc") (no pdfPath arg)
 *     sends body = {"url": "http://example.com/doc.pdf", "source_type": "bctc"}
 *     with NO "pdf_path" key in the body.
 *
 *   TC-PDFPATH-3 (tier order — pdf_path Tier 1 attempted before Tier 3 pdf-parse):
 *     triggerPushBctcExtraction with filePath + extractViaServicePdfPath dep:
 *     When extractViaServicePdfPath succeeds (Tier 1), Tier 3 (pdf-parse) must NOT
 *     be called. The tier ordering is pdf_path → URL → pdf-parse.
 */

import { describe, it, expect } from "bun:test";
import { extractViaMicroservice } from "../infrastructure/fetchers/pdfExtractorClient.js";
import {
  triggerPushBctcExtraction,
  type PushBctcExtractionDeps,
} from "../scheduler/financial-reports/pushBctcExtraction.js";

// ─────────────────────────────────────────────────────────────────────────────
// TC-PDFPATH-1: client sends {pdf_path, source_type} with NO url key
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-PDFPATH-1: extractViaMicroservice sends pdf_path body with NO url key", () => {
  it("body shape is EXACTLY {pdf_path, source_type} when pdfPath is provided", async () => {
    let capturedBody: Record<string, unknown> | null = null;
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string ?? "{}") as Record<string, unknown>;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          document_id: "uuid-local",
          tables: [],
          text_content: "Báo cáo tài chính " + "X".repeat(200),
          ocr_confidence: 0.9,
          status: "success",
        }),
      } as Response;
    }) as unknown as typeof fetch;

    try {
      const result = await extractViaMicroservice(
        "",           // url is empty when pdf_path is used
        "bctc",
        "/app/data/pdfs/VNM_2025_Q4.pdf",
      );

      // Result must be parsed correctly
      expect(result).not.toBeNull();
      expect(result!.status).toBe("success");

      // Body must contain pdf_path
      expect(capturedBody).not.toBeNull();
      expect(capturedBody!["pdf_path"]).toBe("/app/data/pdfs/VNM_2025_Q4.pdf");
      expect(capturedBody!["source_type"]).toBe("bctc");

      // Body must NOT contain url key
      expect(Object.prototype.hasOwnProperty.call(capturedBody, "url")).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("trims whitespace from pdfPath before sending", async () => {
    let capturedBody: Record<string, unknown> | null = null;
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string ?? "{}") as Record<string, unknown>;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          document_id: "x",
          tables: [],
          text_content: "",
          ocr_confidence: 0,
          status: "success",
        }),
      } as Response;
    }) as unknown as typeof fetch;

    try {
      await extractViaMicroservice("", "bctc", "  /app/data/pdfs/HPG_2025_Q4.pdf  ");
      expect(capturedBody!["pdf_path"]).toBe("/app/data/pdfs/HPG_2025_Q4.pdf");
      expect(Object.prototype.hasOwnProperty.call(capturedBody, "url")).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-PDFPATH-2: URL mode regression — existing callers unchanged
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-PDFPATH-2: URL mode regression — body is {url, source_type} with NO pdf_path key", () => {
  it("body shape is {url, source_type} when pdfPath is absent", async () => {
    let capturedBody: Record<string, unknown> | null = null;
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string ?? "{}") as Record<string, unknown>;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          document_id: "uuid-url",
          tables: [],
          text_content: "VNM revenue 1000",
          ocr_confidence: 0.8,
          status: "success",
        }),
      } as Response;
    }) as unknown as typeof fetch;

    try {
      const result = await extractViaMicroservice(
        "http://example.com/VNM_2025_Q4.pdf",
        "bctc",
        // pdfPath omitted — URL mode
      );

      expect(result).not.toBeNull();

      // Body must contain url
      expect(capturedBody).not.toBeNull();
      expect(capturedBody!["url"]).toBe("http://example.com/VNM_2025_Q4.pdf");
      expect(capturedBody!["source_type"]).toBe("bctc");

      // Body must NOT contain pdf_path key
      expect(Object.prototype.hasOwnProperty.call(capturedBody, "pdf_path")).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("empty string pdfPath falls back to URL mode", async () => {
    let capturedBody: Record<string, unknown> | null = null;
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string ?? "{}") as Record<string, unknown>;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          document_id: "x",
          tables: [],
          text_content: "",
          ocr_confidence: 0,
          status: "success",
        }),
      } as Response;
    }) as unknown as typeof fetch;

    try {
      await extractViaMicroservice("http://example.com/doc.pdf", "bctc", "");
      // Empty pdfPath must not override URL mode
      expect(capturedBody!["url"]).toBe("http://example.com/doc.pdf");
      expect(Object.prototype.hasOwnProperty.call(capturedBody, "pdf_path")).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("whitespace-only pdfPath falls back to URL mode", async () => {
    let capturedBody: Record<string, unknown> | null = null;
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string ?? "{}") as Record<string, unknown>;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          document_id: "x",
          tables: [],
          text_content: "",
          ocr_confidence: 0,
          status: "success",
        }),
      } as Response;
    }) as unknown as typeof fetch;

    try {
      await extractViaMicroservice("http://example.com/doc.pdf", "bctc", "   ");
      expect(capturedBody!["url"]).toBe("http://example.com/doc.pdf");
      expect(Object.prototype.hasOwnProperty.call(capturedBody, "pdf_path")).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-PDFPATH-3: tier order — pdf_path Tier 1 before Tier 3 pdf-parse
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-PDFPATH-3: tier order — extractViaServicePdfPath (Tier 1) before pdf-parse (Tier 3)", () => {
  it("Tier 3 (pdf-parse) NOT called when Tier 1 (pdf_path) succeeds", async () => {
    const pdfPathText = "Bảng cân đối kế toán VNM 2025 " + "A".repeat(200);
    let pdfPathCalled = false;
    let pdfParseCalled = false;
    const pipelineArgs: unknown[] = [];

    const deps: PushBctcExtractionDeps = {
      // Tier 1: pdf_path mode succeeds
      extractViaServicePdfPath: async (_pdfPath: string) => {
        pdfPathCalled = true;
        return {
          documentId: "doc-pdfpath",
          tables: [],
          textContent: pdfPathText,
          ocrConfidence: 0.9,
          status: "success" as const,
        };
      },
      // Tier 2: URL mode — should not matter
      extractViaService: async (_url: string) => null,
      runPipeline: async (params: unknown): Promise<{ id: string } | null> => {
        pipelineArgs.push(params);
        return { id: "vnm-q4-2025" };
      },
      // Tier 3: pdf-parse — must NOT be called
      extractText: async (_buf: Buffer): Promise<{ text: string; confidence: number }> => {
        pdfParseCalled = true;
        return { text: pdfPathText, confidence: 0.8 };
      },
      readFile: (_path: string): Buffer => {
        return Buffer.from("fake-pdf");
      },
    };

    await triggerPushBctcExtraction({
      actionCode: "VNM",
      year: 2025,
      quarter: "Q4",
      filePath: "/app/data/pdfs/VNM_2025_Q4.pdf",
      filename: "VNM_2025_Q4.pdf",
      pdfUrl: "http://125.212.251.27:8765/bctc-files/VNM/VNM_2025_Q4.pdf",
      deps,
    });

    // Tier 1 must have been attempted
    expect(pdfPathCalled).toBe(true);
    // Tier 3 must NOT have been called (Tier 1 succeeded)
    expect(pdfParseCalled).toBe(false);
    // Pipeline must have been called with Tier 1 text
    expect(pipelineArgs.length).toBe(1);
  });

  it("Tier 1 absent → Tier 2 URL fails → Tier 3 pdf-parse IS called", async () => {
    // Regression: when Tier 1 dep is absent and Tier 2 URL also fails,
    // Tier 3 (pdf-parse) must be the last resort.
    const pdfParseText = "Kết quả kinh doanh HPG Q4 2025 " + "B".repeat(200);
    let pdfParseCalled = false;
    const pipelineArgs: unknown[] = [];

    const deps: PushBctcExtractionDeps = {
      // No extractViaServicePdfPath (Tier 1 absent)
      extractViaService: async (_url: string) => null, // Tier 2 fails
      runPipeline: async (params: unknown): Promise<{ id: string } | null> => {
        pipelineArgs.push(params);
        return { id: "hpg-q4-2025" };
      },
      extractText: async (_buf: Buffer): Promise<{ text: string; confidence: number }> => {
        pdfParseCalled = true;
        return { text: pdfParseText, confidence: 0.7 };
      },
      readFile: (_path: string): Buffer => Buffer.from("fake-hpg-pdf"),
    };

    await triggerPushBctcExtraction({
      actionCode: "HPG",
      year: 2025,
      quarter: "Q4",
      filePath: "/app/data/pdfs/HPG_2025_Q4.pdf",
      filename: "HPG_2025_Q4.pdf",
      pdfUrl: "http://125.212.251.27:8765/bctc-files/HPG/HPG_2025_Q4.pdf",
      deps,
    });

    expect(pdfParseCalled).toBe(true);
    expect(pipelineArgs.length).toBe(1);
  });

  it("Tier 1 fails → Tier 2 URL succeeds → Tier 3 pdf-parse NOT called", async () => {
    const urlText = "Thu nhập lãi thuần ACB Q4 2025 " + "C".repeat(200);
    let pdfParseCalled = false;
    let tier1Called = false;
    let tier2Called = false;
    const pipelineArgs: unknown[] = [];

    const deps: PushBctcExtractionDeps = {
      extractViaServicePdfPath: async (_pdfPath: string) => {
        tier1Called = true;
        return null; // Tier 1 fails
      },
      extractViaService: async (_url: string) => {
        tier2Called = true;
        return {
          documentId: "doc-url",
          tables: [],
          textContent: urlText,
          ocrConfidence: 0.75,
          status: "success" as const,
        };
      },
      runPipeline: async (params: unknown): Promise<{ id: string } | null> => {
        pipelineArgs.push(params);
        return { id: "acb-q4-2025" };
      },
      extractText: async (_buf: Buffer): Promise<{ text: string; confidence: number }> => {
        pdfParseCalled = true;
        return { text: "", confidence: 0 };
      },
      readFile: (_path: string): Buffer => Buffer.from("fake-acb-pdf"),
    };

    await triggerPushBctcExtraction({
      actionCode: "ACB",
      year: 2025,
      quarter: "Q4",
      filePath: "/app/data/pdfs/ACB_2025_Q4.pdf",
      filename: "ACB_2025_Q4.pdf",
      pdfUrl: "http://125.212.251.27:8765/bctc-files/ACB/ACB_2025_Q4.pdf",
      deps,
    });

    expect(tier1Called).toBe(true);    // Tier 1 was attempted
    expect(tier2Called).toBe(true);    // Tier 2 was attempted (Tier 1 failed)
    expect(pdfParseCalled).toBe(false); // Tier 3 NOT called (Tier 2 succeeded)
    expect(pipelineArgs.length).toBe(1);
  });
});
