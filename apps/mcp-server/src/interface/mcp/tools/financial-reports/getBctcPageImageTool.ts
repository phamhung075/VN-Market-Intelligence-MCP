/**
 * MCP Tool: get_bctc_page_image — FR-4
 *
 * Sprint BCTC-AGENTIC-REFINE
 * DDD layer: interface (read-only file access acceptable for interface layer)
 *
 * Returns base64-encoded PNG images for specified pages of a BCTC report.
 * If a page PNG is missing, triggers on-demand rasterization via pdf-extractor.
 *
 * Hard cap: BCTC_IMAGE_PAGE_CAP env var (default 3). Over-limit → { error }.
 *
 * @module interface/mcp/tools/financial-reports/getBctcPageImageTool
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { getDb } from "../../../../infrastructure/db/schema.js";
import { rasterizePages } from "../../../../infrastructure/fetchers/pdfExtractorClient.js";
import { logger } from "../../../../infrastructure/logger.js";

// ── Config ────────────────────────────────────────────────────────────────────

const BCTC_IMAGE_PAGE_CAP = parseInt(Bun.env.BCTC_IMAGE_PAGE_CAP ?? "3", 10);

// ── Types ─────────────────────────────────────────────────────────────────────

interface PageImage {
  page: number;
  base64_png: string;
}

interface PageImageError {
  page: number;
  error: string;
}

interface ImageResult {
  images: Array<PageImage | PageImageError>;
}

interface ImageToolError {
  error: string;
}

// ── Zod input schema ──────────────────────────────────────────────────────────

const InputSchema = z.object({
  report_id: z.string().min(1).describe("Financial report ID"),
  pages: z
    .array(z.number().int().min(1))
    .min(1)
    .describe(`Page numbers to retrieve (1-indexed, max ${BCTC_IMAGE_PAGE_CAP})`),
});

// ── Helper: resolve PNG path ───────────────────────────────────────────────────

function getPngPath(reportId: string, pageNumber: number): string {
  const paddedPage = String(pageNumber).padStart(4, "0");
  return join(process.cwd(), "data", "bctc-page-images", reportId, `page_${paddedPage}.png`);
}

// ── Handler (testable with injected deps) ─────────────────────────────────────

export interface GetBctcPageImageDeps {
  getDb: () => ReturnType<typeof import("../../../../infrastructure/db/schema.js").getDb>;
  rasterize: (reportId: string, filename: string, pages: number[]) => Promise<void>;
  readPng: (path: string) => Buffer;
  fileExists: (path: string) => boolean;
}

const defaultDeps: GetBctcPageImageDeps = {
  getDb,
  rasterize: async (reportId, filename, pages) => {
    await rasterizePages(reportId, filename, pages);
  },
  readPng: (path) => readFileSync(path),
  fileExists: (path) => existsSync(path),
};

export async function handleGetBctcPageImage(
  reportId: string,
  pages: number[],
  deps: GetBctcPageImageDeps = defaultDeps,
): Promise<{ content: [{ type: "text"; text: string }] }> {
  // Cap enforcement
  if (pages.length > BCTC_IMAGE_PAGE_CAP) {
    const err: ImageToolError = {
      error: `pages array exceeds cap of ${BCTC_IMAGE_PAGE_CAP} (got ${pages.length})`,
    };
    return { content: [{ type: "text" as const, text: JSON.stringify(err) }] };
  }

  // Resolve report_id → pdf_path → filename (basename)
  const db = deps.getDb();
  const row = db
    .prepare<{ id: string; pdf_path: string | null }, [string]>(
      "SELECT id, pdf_path FROM financial_reports WHERE id = ? LIMIT 1",
    )
    .get(reportId);

  if (!row) {
    const err: ImageToolError = { error: `report_id not found: ${reportId}` };
    return { content: [{ type: "text" as const, text: JSON.stringify(err) }] };
  }

  if (!row.pdf_path) {
    const err: ImageToolError = { error: `no pdf_path for report_id: ${reportId}` };
    return { content: [{ type: "text" as const, text: JSON.stringify(err) }] };
  }

  const pdfFilename = basename(row.pdf_path);

  const results: Array<PageImage | PageImageError> = [];

  for (const pageNumber of pages) {
    const pngPath = getPngPath(reportId, pageNumber);

    try {
      // On-demand rasterization if PNG missing
      if (!deps.fileExists(pngPath)) {
        logger.info("[get_bctc_page_image] PNG missing — triggering rasterization", {
          reportId,
          pageNumber,
          pngPath,
        });
        await deps.rasterize(reportId, pdfFilename, [pageNumber]);
      }

      // Check again after rasterization attempt
      if (!deps.fileExists(pngPath)) {
        results.push({ page: pageNumber, error: "rasterization_failed: PNG not produced" });
        continue;
      }

      const buf = deps.readPng(pngPath);
      const base64 = buf.toString("base64");
      results.push({ page: pageNumber, base64_png: base64 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn("[get_bctc_page_image] page failed", { reportId, pageNumber, error: msg });
      results.push({ page: pageNumber, error: msg });
    }
  }

  const output: ImageResult = { images: results };
  return { content: [{ type: "text" as const, text: JSON.stringify(output) }] };
}

// ── MCP tool registration ─────────────────────────────────────────────────────

export function registerGetBctcPageImageTool(server: McpServer): void {
  server.tool(
    "get_bctc_page_image",
    "Return base64-encoded PNG images for specified pages of a BCTC financial report. " +
      `Hard cap: ${BCTC_IMAGE_PAGE_CAP} pages per call (BCTC_IMAGE_PAGE_CAP env var). ` +
      "If a page PNG is missing, triggers on-demand rasterization via pdf-extractor /api/rasterize. " +
      "Output: { images: Array<{ page, base64_png } | { page, error }> } or { error: string }. " +
      "Used by refine_bctc_md subagents for table-dense/continuation pages.",
    {
      report_id: z
        .string()
        .min(1)
        .describe("Financial report ID from financial_reports.id"),
      pages: z
        .array(z.number().int().min(1))
        .min(1)
        .describe(`Page numbers (1-indexed, max ${BCTC_IMAGE_PAGE_CAP})`),
    },
    async ({ report_id, pages }) => {
      return handleGetBctcPageImage(report_id, pages);
    },
  );
}
