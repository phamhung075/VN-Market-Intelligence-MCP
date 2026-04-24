/**
 * Task 1289f Refinement: Direct API Discovery Tests
 *
 * Tests the new Option B implementation that calls BCTC portal APIs directly
 * instead of using CSS selectors on rendered DOM.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { discoverBctcPdfUrlDirectApi } from "../application/usecases/discoverBctcPdfUrlDirectApi.js";

// Mock fetch responses for each portal
interface MockFetchSetup {
  url: string;
  response: Record<string, unknown>;
  timeout?: number;
}

let mockFetchSetups: MockFetchSetup[] = [];
let callLog: string[] = [];

// Override global fetch for testing
const originalFetch = global.fetch;

async function mockFetch(input: string | Request, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input.url;
  callLog.push(url);

  // Find matching mock setup
  const setup = mockFetchSetups.find((s) => url.includes(s.url));

  if (!setup) {
    return new Response(JSON.stringify({ error: "Not mocked" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (setup.timeout) {
    // Simulate timeout
    await new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), setup.timeout)
    );
  }

  return new Response(JSON.stringify(setup.response), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("BCTC Direct API Discovery (Option B)", () => {
  beforeEach(() => {
    mockFetchSetups = [];
    callLog = [];
    // @ts-expect-error - replacing global fetch for testing
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("Test 1: HOSE API Success", () => {
    it("should discover PDF from HOSE API with confidence 0.95", async () => {
      mockFetchSetups = [
        {
          url: "https://www.hsx.vn/api/bctc",
          response: {
            pdfs: [
              {
                url: "https://www.hsx.vn/download/BCTC_Q1_2024.pdf",
                title: "BCTC Q1 2024",
              },
            ],
          },
        },
      ];

      const result = await discoverBctcPdfUrlDirectApi("VCB", 2024, "Q1");

      expect(result.url).toBeTruthy();
      expect(result.source).toBe("HOSE");
      expect(result.confidence).toBe(0.95);
      expect(result.url).toContain(".pdf");
      expect(result.error).toBeUndefined();
    });
  });

  describe("Test 2: HNX Fallback", () => {
    it("should fallback to HNX when HOSE API returns empty", async () => {
      mockFetchSetups = [
        {
          url: "https://www.hsx.vn/api/bctc",
          response: { pdfs: [] },
        },
        {
          url: "https://hnx.vn/api/disclosures",
          response: {
            data: [
              {
                url: "https://hnx.vn/download/BCTC_Q1_2024.pdf",
                label: "BCTC Q1 2024",
              },
            ],
          },
        },
      ];

      const result = await discoverBctcPdfUrlDirectApi("VCB", 2024, "Q1");

      expect(result.source).toBe("HNX");
      expect(result.confidence).toBe(0.9);
      expect(result.url).toBeTruthy();
      expect(result.url).toContain(".pdf");
    });
  });

  describe("Test 3: All APIs Exhausted", () => {
    it("should return error when all APIs return empty", async () => {
      mockFetchSetups = [
        {
          url: "https://www.hsx.vn/api/bctc",
          response: { pdfs: [] },
        },
        {
          url: "https://hnx.vn/api/disclosures",
          response: { data: [] },
        },
        {
          url: "https://upcom.hnx.vn/api/disclosures",
          response: { data: [] },
        },
      ];

      const result = await discoverBctcPdfUrlDirectApi("DGC", 2024, "Q1");

      expect(result.url).toBeNull();
      expect(result.source).toBeNull();
      expect(result.error).toBeTruthy();
      expect(result.error).toContain("No PDF found");
    });
  });

  describe("Test 4: API Timeout", () => {
    it("should catch API timeout and return error", async () => {
      // Create a fetch that always throws a timeout error
      // @ts-expect-error - replacing global fetch for testing
      global.fetch = async () => {
        throw new Error("AbortError: The operation was aborted");
      };

      const result = await discoverBctcPdfUrlDirectApi("VCB", 2024, "Q1");

      expect(result.url).toBeNull();
      expect(result.error).toBeTruthy();
      expect(result.error).toContain("timeout");
    });
  });

  describe("Test 5: Quarter/Year Matching in API Response", () => {
    it("should filter PDFs by quarter and year in API response title", async () => {
      mockFetchSetups = [
        {
          url: "https://www.hsx.vn/api/bctc",
          response: {
            pdfs: [
              {
                url: "https://www.hsx.vn/download/Q1_2024.pdf",
                title: "BCTC Q1 2024",
              }, // match
              {
                url: "https://www.hsx.vn/download/Q2_2024.pdf",
                title: "BCTC Q2 2024",
              }, // no match
              {
                url: "https://www.hsx.vn/download/Q1_2025.pdf",
                title: "BCTC Q1 2025",
              }, // no match
            ],
          },
        },
      ];

      const result = await discoverBctcPdfUrlDirectApi("VCB", 2024, "Q1");

      expect(result.url).toBeTruthy();
      expect(result.url).toContain("Q1_2024.pdf");
      expect(result.source).toBe("HOSE");
      expect(result.confidence).toBe(0.95);
    });
  });

  describe("Integration: Fallback Chain Order", () => {
    it("should try HOSE → HNX → UPCOM in order", async () => {
      mockFetchSetups = [
        {
          url: "https://www.hsx.vn/api/bctc",
          response: { pdfs: [] },
        },
        {
          url: "https://hnx.vn/api/disclosures",
          response: { data: [] },
        },
        {
          url: "https://upcom.hnx.vn/api/disclosures",
          response: {
            data: [
              {
                url: "https://upcom.hnx.vn/download/BCTC_Q1_2024.pdf",
                label: "BCTC Q1 2024",
              },
            ],
          },
        },
      ];

      const result = await discoverBctcPdfUrlDirectApi("HPG", 2024, "Q1");

      expect(result.source).toBe("UPCOM");
      expect(result.confidence).toBe(0.85);
      expect(result.url).toBeTruthy();

      // Verify call order
      expect(callLog[0]).toContain("hsx.vn");
      expect(callLog[1]).toContain("hnx.vn");
      expect(callLog[2]).toContain("upcom");
    });
  });
});
