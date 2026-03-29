/**
 * Infrastructure — SSC Portal Scraper (Puppeteer)
 *
 * Fetches and parses the Vietnamese Securities Commission (SSC) disclosure
 * portal at congbothongtin.ssc.gov.vn using Puppeteer (headless Chrome).
 *
 * The SSC portal is an Oracle ADF application that requires JavaScript
 * execution. Plain HTTP scraping (the prior approach) no longer works
 * because the search form relies on ADF ViewState round-trips.
 *
 * Layer: infrastructure/fetchers — may use HTTP, must not import domain/.
 */

import { logger } from "../logger.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SSC_URL = "https://congbothongtin.ssc.gov.vn/faces/NewsSearch";

/**
 * Path to Chrome executable.
 * Falls back to common paths; override with CHROME_PATH env var.
 */
const CHROME_PATH =
  process.env["CHROME_PATH"] ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Minimal HTTP client interface — shared across fetchers for dependency injection.
 * Kept here for backward compatibility (many files import HttpClient from ssc.js).
 */
export interface HttpClient {
  /** Fetch the HTML body of the given URL. */
  get(url: string): Promise<string>;
}

/**
 * A single document entry returned by the SSC portal.
 */
export interface SscDocument {
  /** Document title as shown on the portal. */
  title: string;
  /** Absolute URL to the document (PDF or HTML). Empty when download is ADF-triggered. */
  url: string;
  /** Publication date string as found on the page (e.g. "15/04/2025"). */
  publishedAt: string;
  /** Report type: 'quarterly' | 'annual' | 'semi-annual' | 'other'. */
  reportType: string;
  /** Stock ticker code (e.g. "VCB"). */
  actionCode?: string;
  /** Company name from the portal. */
  companyName?: string;
  /** Exchange (HOSE / HNX / UPCOM / OTC). */
  exchange?: string;
  /** Full description line from the portal. */
  description?: string;
  /** PDF filename from Content-Disposition when downloaded. */
  pdfFilename?: string;
}

/**
 * Minimal browser page interface for dependency injection in tests.
 * Matches a subset of Puppeteer's Page API.
 */
export interface SscBrowserPage {
  goto(url: string, options?: { waitUntil?: string; timeout?: number }): Promise<unknown>;
  waitForSelector(selector: string, options?: { timeout?: number }): Promise<unknown>;
  click(selector: string, options?: { clickCount?: number }): Promise<void>;
  type(selector: string, text: string, options?: { delay?: number }): Promise<void>;
  evaluate<T>(fn: (...args: unknown[]) => T, ...args: unknown[]): Promise<T>;
  keyboard: { press(key: string): Promise<void> };
  on(event: string, handler: (...args: unknown[]) => void): void;
  close(): Promise<void>;
}

export interface SscBrowser {
  newPage(): Promise<SscBrowserPage>;
  close(): Promise<void>;
}

/**
 * Factory that creates a browser instance. Inject a mock in tests.
 */
export type BrowserFactory = () => Promise<SscBrowser>;

// ---------------------------------------------------------------------------
// Report type classification
// ---------------------------------------------------------------------------

/**
 * Classify a document title into a report type.
 */
function classifyReportType(title: string): string {
  const lower = title.toLowerCase();
  if (/quý|q\s*[1-4]/i.test(lower)) return "quarterly";
  if (/bán niên|ban nien|semi/i.test(lower)) return "semi-annual";
  if (/năm|annual|niên độ/i.test(lower)) return "annual";
  return "other";
}

/**
 * Check if a title matches the requested report type filter.
 */
function titleMatchesReportType(
  title: string,
  reportType: "quarterly" | "annual" | "all",
): boolean {
  if (reportType === "all") return true;
  const classified = classifyReportType(title);
  if (reportType === "quarterly") return classified === "quarterly";
  if (reportType === "annual") return classified === "annual" || classified === "semi-annual";
  return true;
}

// ---------------------------------------------------------------------------
// Default browser factory (real Puppeteer + Chrome)
// ---------------------------------------------------------------------------

async function defaultBrowserFactory(): Promise<SscBrowser> {
  const puppeteer = await import("puppeteer-core");
  const browser = await puppeteer.default.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  return browser as unknown as SscBrowser;
}

// ---------------------------------------------------------------------------
// Core search function
// ---------------------------------------------------------------------------

/**
 * Searches the SSC portal for documents matching a stock code.
 * Uses Puppeteer to drive the Oracle ADF search form.
 *
 * @param actionCode     - Stock ticker (e.g. "VCB", "VNM").
 * @param reportType     - "quarterly" | "annual" | "all" — filters results by title keywords.
 * @param _year          - Kept for backward compatibility but not used (portal returns all years).
 * @param browserFactory - Optional browser factory; defaults to real Puppeteer + Chrome.
 * @returns Promise resolving to an array of SscDocument (empty on error).
 */
export async function listSscDocuments(
  actionCode: string,
  reportType: "quarterly" | "annual" | "all" = "all",
  _year?: number,
  browserFactory?: BrowserFactory,
): Promise<SscDocument[]> {
  const factory = browserFactory ?? defaultBrowserFactory;
  const code = actionCode.toUpperCase();

  logger.debug("[ssc] searching SSC portal", { actionCode: code, reportType });

  let browser: SscBrowser | null = null;
  try {
    browser = await factory();
    const page = await browser.newPage();

    try {
      // Navigate to SSC search page (60s timeout — SSC can be slow)
      await page.goto(SSC_URL, { waitUntil: "networkidle2", timeout: 60000 });

      // Wait for search form
      await page.waitForSelector('input[id$="it8112::content"]', { timeout: 30000 });

      // Fill stock code
      const inputSelector = 'input[id$="it8112::content"]';
      await page.click(inputSelector, { clickCount: 3 });
      await page.type(inputSelector, code, { delay: 80 });

      // Tab to trigger ADF value change event
      await new Promise((r) => setTimeout(r, 500));
      await page.keyboard.press("Tab");
      await new Promise((r) => setTimeout(r, 300));

      // Click search button
      await page.evaluate((() => {
        const links = Array.from(document.querySelectorAll("a"));
        for (let i = 0; i < links.length; i++) {
          const a = links[i]!;
          const span = a.querySelector("span");
          if (
            span &&
            (span.textContent?.includes("Tìm ki") ||
              span.textContent?.includes("Tim kiem"))
          ) {
            a.click();
            return;
          }
        }
      }) as () => void);

      // Wait for results to load
      await new Promise((r) => setTimeout(r, 5000));

      // Extract all matching rows
      const rawDocs = await page.evaluate((targetCode: unknown) => {
        const code = targetCode as string;
        const results: Array<{
          code: string;
          exchange: string;
          title: string;
          company: string;
          description: string;
          date: string;
          downloadId: string;
        }> = [];

        document.querySelectorAll("tr[_afrRK]").forEach((row) => {
          const cells = row.querySelectorAll("td");
          if (cells.length < 7) return;

          const rowCode = cells[2]?.textContent?.trim() || "";
          if (rowCode !== code) return;

          const downloadLink = cells[7]?.querySelector("a");

          results.push({
            code: rowCode,
            exchange: cells[1]?.textContent?.trim() || "",
            title: cells[3]?.textContent?.trim() || "",
            company: cells[4]?.textContent?.trim() || "",
            description: cells[5]?.textContent?.trim() || "",
            date: cells[6]?.textContent?.trim() || "",
            downloadId: downloadLink?.id || "",
          });
        });
        return results;
      }, code);

      // Convert to SscDocument[] (fast — no downloads, just metadata)
      const docs: SscDocument[] = rawDocs
        .filter((d) => titleMatchesReportType(d.title, reportType))
        .map((d, idx) => ({
          title: d.title,
          url: `ssc-download://${code}/${idx}/${d.downloadId || "unknown"}`,
          publishedAt: d.date,
          reportType: classifyReportType(d.title),
          actionCode: d.code,
          companyName: d.company,
          exchange: d.exchange,
          description: d.description,
        }));

      logger.info("[ssc] parsed documents", {
        actionCode: code,
        reportType,
        count: docs.length,
      });

      await page.close();
      return docs;
    } catch (err) {
      await page.close().catch(() => {});
      throw err;
    }
  } catch (err) {
    logger.error("[ssc] failed to fetch/parse SSC portal", {
      actionCode: code,
      reportType,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

/**
 * Downloads a document from the SSC portal by clicking the ADF download link.
 * Returns the PDF buffer and filename.
 *
 * @param actionCode     - Stock ticker to search for.
 * @param docIndex       - 0-based index of the document in the search results.
 * @param browserFactory - Optional browser factory for testing.
 * @returns PDF buffer + filename, or null if download fails.
 */
export async function downloadSscDocument(
  actionCode: string,
  docIndex: number = 0,
  browserFactory?: BrowserFactory,
): Promise<{ buffer: Buffer; filename: string } | null> {
  const factory = browserFactory ?? defaultBrowserFactory;
  const code = actionCode.toUpperCase();

  let browser: SscBrowser | null = null;
  try {
    browser = await factory();
    const page = await browser.newPage();

    try {
      await page.goto(SSC_URL, { waitUntil: "networkidle2", timeout: 60000 });
      await page.waitForSelector('input[id$="it8112::content"]', { timeout: 30000 });

      // Search
      const inputSelector = 'input[id$="it8112::content"]';
      await page.click(inputSelector, { clickCount: 3 });
      await page.type(inputSelector, code, { delay: 80 });
      await new Promise((r) => setTimeout(r, 500));
      await page.keyboard.press("Tab");
      await new Promise((r) => setTimeout(r, 300));

      await page.evaluate(() => {
        document.querySelectorAll("a").forEach((a) => {
          const span = a.querySelector("span");
          if (span?.textContent?.includes("Tìm ki")) (a as HTMLElement).click();
        });
      });

      await new Promise((r) => setTimeout(r, 5000));

      // Find the download link for the target row
      const downloadId = await page.evaluate(
        (targetCode: unknown, targetIdx: unknown) => {
          const code = targetCode as string;
          const idx = targetIdx as number;
          let matchCount = 0;

          const rows = Array.from(document.querySelectorAll("tr[_afrRK]"));
          for (let i = 0; i < rows.length; i++) {
            const row = rows[i]!;
            const cells = row.querySelectorAll("td");
            if (cells.length < 7) continue;
            const rowCode = cells[2]?.textContent?.trim() || "";
            if (rowCode !== code) continue;

            if (matchCount === idx) {
              const downloadLink = cells[7]?.querySelector("a");
              return downloadLink?.id || null;
            }
            matchCount++;
          }
          return null;
        },
        code,
        docIndex,
      );

      if (!downloadId) {
        logger.warn("[ssc] download link not found", { actionCode: code, docIndex });
        await page.close();
        return null;
      }

      // Use CDP to download the PDF to a temp directory
      const { mkdirSync, readdirSync, readFileSync, rmSync } = await import("node:fs");
      const { join } = await import("node:path");
      const downloadDir = `/tmp/ssc-dl-${Date.now()}-${code}`;
      mkdirSync(downloadDir, { recursive: true });

      const cdpSession = await (page as any).createCDPSession();
      await cdpSession.send("Page.setDownloadBehavior", {
        behavior: "allow",
        downloadPath: downloadDir,
      });

      // Click the download button
      logger.info("[ssc] clicking download button", { downloadId, actionCode: code });
      await page.click(`[id="${downloadId}"]`);

      // Poll for the PDF file (max 120s)
      let pdfBuffer: Buffer | null = null;
      let pdfFilename = `${code}_doc_${docIndex}.pdf`;

      for (let i = 0; i < 120; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const files = readdirSync(downloadDir);

        // Check for completed PDF
        const pdfFiles = files.filter((f) => f.endsWith(".pdf"));
        if (pdfFiles.length > 0) {
          pdfFilename = pdfFiles[0]!;
          pdfBuffer = readFileSync(join(downloadDir, pdfFilename));
          break;
        }

        // Check if .crdownload is stable (download done, just not renamed)
        const tempFiles = files.filter((f) => f.endsWith(".crdownload"));
        if (tempFiles.length > 0 && i > 10) {
          const tempPath = join(downloadDir, tempFiles[0]!);
          const size1 = readFileSync(tempPath).length;
          await new Promise((r) => setTimeout(r, 3000));
          i += 3;
          try {
            const size2 = readFileSync(tempPath).length;
            if (size2 === size1 && size2 > 1000) {
              pdfFilename = tempFiles[0]!.replace(".crdownload", "");
              pdfBuffer = readFileSync(tempPath);
              break;
            }
          } catch { /* file may have been renamed in the meantime */ }
        }
      }

      // Cleanup
      await cdpSession.detach().catch(() => {});
      try { rmSync(downloadDir, { recursive: true }); } catch { /* ignore */ }
      await page.close();

      if (pdfBuffer && pdfBuffer.length > 100) {
        // Verify it's a real PDF
        const header = pdfBuffer.slice(0, 5).toString();
        if (header === "%PDF-") {
          logger.info("[ssc] PDF downloaded successfully", {
            actionCode: code,
            docIndex,
            filename: pdfFilename,
            bytes: pdfBuffer.length,
          });
          return { buffer: pdfBuffer, filename: pdfFilename };
        }
        logger.warn("[ssc] downloaded file is not a valid PDF", { header, actionCode: code });
      }

      logger.warn("[ssc] download did not produce a file", { actionCode: code, docIndex });
      return null;
    } catch (err) {
      await page.close().catch(() => {});
      throw err;
    }
  } catch (err) {
    logger.error("[ssc] document download failed", {
      actionCode: code,
      docIndex,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

// ---------------------------------------------------------------------------
// Legacy exports (backward compatibility)
// ---------------------------------------------------------------------------

/** @deprecated Use listSscDocuments directly. */
export function buildSscSearchUrl(actionCode: string, _year: number): string {
  return `${SSC_URL}?keyword=${actionCode.toUpperCase()}`;
}

/** @deprecated The portal is now ADF-driven; HTML parsing alone doesn't work. */
export function parseSscHtml(
  _html: string,
  _reportType: "quarterly" | "annual",
): SscDocument[] {
  return [];
}
