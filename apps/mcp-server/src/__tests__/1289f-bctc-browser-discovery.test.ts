import { describe, it, expect, beforeEach } from "bun:test";
import { discoverBctcPdfUrlWithBrowser } from "../application/usecases/discoverBctcPdfUrlBrowser.js";

describe("BCTC Browser-Based Discovery (Playwright)", () => {
  // Mock browser for testing
  const mockBrowserFetch = async (
    url: string,
    _timeout?: number
  ): Promise<string> => {
    // Simulate rendered HTML from portals
    if (url.includes("hsx.vn") && url.includes("VCB")) {
      return `
        <html><body>
          <div class="bctc-list">
            <a href="/Modules/CMS/Web/Article/BCTC_Q1_2024.pdf">BCTC Q1 2024</a>
            <a href="/Modules/CMS/Web/Article/BCTC_Q4_2025.pdf">BCTC Q4 2025</a>
          </div>
        </body></html>
      `;
    }
    if (url.includes("hnx.vn") && url.includes("HPG")) {
      return `
        <html><body>
          <div class="financial-reports">
            <a href="/Assets/Download/2024_Q1_HPG.pdf">BCTC Quý 1 2024</a>
            <a href="/Assets/Download/2025_Q4_HPG.pdf">Báo cáo tài chính Q4 2025</a>
          </div>
        </body></html>
      `;
    }
    return "<html><body>No PDFs found</body></html>";
  };

  describe("HOSE Portal", () => {
    it("should discover PDF from HOSE with Playwright rendering", async () => {
      const result = await discoverBctcPdfUrlWithBrowser(
        "VCB",
        2024,
        "Q1",
        mockBrowserFetch
      );
      expect(result.url).toBeTruthy();
      expect(result.source).toBe("HOSE");
      expect(result.confidence).toBeGreaterThan(0.9);
      expect(result.url).toContain(".pdf");
    });

    it("should handle quarter search in rendered HTML", async () => {
      // Custom mock that returns Q4 2025
      const q4MockFetch = async (url: string) => {
        if (url.includes("hsx.vn") && url.includes("VCB")) {
          return `
            <html><body>
              <div class="bctc-list">
                <a href="/Modules/CMS/Web/Article/BCTC_Q4_2025.pdf">BCTC Q4 2025</a>
              </div>
            </body></html>
          `;
        }
        return "<html></html>";
      };

      const result = await discoverBctcPdfUrlWithBrowser(
        "VCB",
        2025,
        "Q4",
        q4MockFetch
      );
      expect(result.url).toBeTruthy();
      expect(result.url).toContain("Q4_2025");
    });
  });

  describe("HNX Portal", () => {
    it("should discover PDF from HNX portal", async () => {
      const result = await discoverBctcPdfUrlWithBrowser(
        "HPG",
        2024,
        "Q1",
        mockBrowserFetch
      );
      expect(result.url).toBeTruthy();
      expect(result.source).toBe("HNX");
      expect(result.confidence).toBeGreaterThanOrEqual(0.85);
    });
  });

  describe("Fallback Chain", () => {
    it("should try HOSE → HNX → UPCOM in order", async () => {
      const callOrder: string[] = [];
      const trackerFetcher = async (url: string) => {
        if (url.includes("hsx.vn")) {
          callOrder.push("HOSE");
          // HOSE has no PDFs
          return `<html><body><a href="/test.pdf">Not matching</a></body></html>`;
        } else if (url.includes("hnx.vn") && !url.includes("upcom")) {
          callOrder.push("HNX");
          // HNX has no PDFs
          return `<html><body><a href="/test.pdf">Not matching</a></body></html>`;
        } else if (url.includes("upcom")) {
          callOrder.push("UPCOM");
          // UPCOM also has no PDFs
          return `<html><body><a href="/test.pdf">Not matching</a></body></html>`;
        }
        return "<html></html>";
      };

      await discoverBctcPdfUrlWithBrowser(
        "TEST",
        2024,
        "Q1",
        trackerFetcher
      );

      expect(callOrder[0]).toBe("HOSE");
      expect(callOrder[1]).toBe("HNX");
      expect(callOrder[2]).toBe("UPCOM");
    });
  });

  describe("Error Handling", () => {
    it("should handle rendering timeout", async () => {
      const timeoutFetcher = async () => {
        throw new Error("Page timeout after 30s");
      };

      const result = await discoverBctcPdfUrlWithBrowser(
        "VCB",
        2024,
        "Q1",
        timeoutFetcher
      );

      expect(result.url).toBeNull();
      // Timeout is caught in HOSE, then continues to HNX and UPCOM
      // Eventually all fail, so we get "No PDF found" as final error
      expect(result.error).toBeTruthy();
    });

    it("should handle all portals failing", async () => {
      const failFetcher = async () => "<html><body>No PDFs</body></html>";

      const result = await discoverBctcPdfUrlWithBrowser(
        "NOTFOUND",
        2024,
        "Q1",
        failFetcher
      );

      expect(result.url).toBeNull();
      expect(result.error).toContain("No PDF found");
    });
  });

  describe("URL Validation", () => {
    it("should resolve relative URLs to absolute", async () => {
      const result = await discoverBctcPdfUrlWithBrowser(
        "VCB",
        2024,
        "Q1",
        mockBrowserFetch
      );

      if (result.url) {
        expect(result.url).toMatch(/^https?:\/\//);
      }
    });

    it("should reject malicious URLs", async () => {
      const maliciousFetcher = async () => `
        <html><body>
          <a href="javascript:alert('xss')">Bad</a>
          <a href="/safe.pdf">BCTC Q1 2024</a>
        </body></html>
      `;

      const result = await discoverBctcPdfUrlWithBrowser(
        "VCB",
        2024,
        "Q1",
        maliciousFetcher
      );

      if (result.url) {
        expect(result.url).not.toContain("javascript:");
      }
    });
  });
});
