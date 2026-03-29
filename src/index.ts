/**
 * VN Market Intelligence MCP — Bun Entry Point
 * ─────────────────────────────────────────────────────────────────────────
 * Bootstraps:
 *   1. SQLite schema (task 002)
 *   2. Bun HTTP server + MCP SSE transport (task 081)
 *   3. Scheduled cron jobs (task 101-105)
 *
 * Start:
 *   bun run src/index.ts
 *   bun --watch src/index.ts    ← development with hot reload
 *
 * Claude Desktop config (~/claude_desktop_config.json):
 *   {
 *     "mcpServers": {
 *       "vn-market": {
 *         "url": "http://localhost:3000/sse"
 *       }
 *     }
 *   }
 * ─────────────────────────────────────────────────────────────────────────
 */

import { loadConfig } from "./infrastructure/config.js";
import { createLogger } from "./infrastructure/logger.js";
import { initDatabase } from "./infrastructure/db/index.js";
import { createBunServer } from "./interface/mcp/server.js";
import { startScheduler } from "./scheduler/jobs.js";

const cfg = loadConfig();
const log = createLogger(cfg.logLevel);

log.info("[bootstrap] Starting VN Market Intelligence MCP...");

// ── 1. SQLite tables ───────────────────────────────────────────────────────
await initDatabase();
log.info("[bootstrap] Database ready");

// ── 2. Bun HTTP server + SSE transport ────────────────────────────────────
const srv = await createBunServer({ port: cfg.port });
log.info("[bootstrap] MCP server ready", { port: srv.port });
log.info("[bootstrap] Endpoints", {
  sse: `http://127.0.0.1:${srv.port}/sse`,
  health: `http://127.0.0.1:${srv.port}/health`,
});

// ── 3. Cron scheduler ─────────────────────────────────────────────────────
startScheduler();
log.info("[bootstrap] Scheduler started — cron jobs active");

// ── 4. Background OCR for unprocessed PDFs ────────────────────────────────
setTimeout(async () => {
  try {
    const { readdirSync } = await import("node:fs");
    const { resolve, join } = await import("node:path");
    const { extractAndStorePdfPages, isOcrAvailable } = await import("./infrastructure/fetchers/pdfOcrWorker.js");

    if (!isOcrAvailable()) {
      log.info("[bootstrap] OCR not available (tesseract/pdftoppm) — skipping");
      return;
    }

    const pdfDir = resolve(process.cwd(), "data", "pdfs");
    const pdfs = readdirSync(pdfDir).filter(f => f.endsWith(".pdf"));
    log.info("[bootstrap] checking PDFs for OCR extraction", { count: pdfs.length });

    for (const pdf of pdfs) {
      // Fire-and-forget: extractAndStorePdfPages is now async, errors are swallowed
      extractAndStorePdfPages(join(pdfDir, pdf), pdf).catch((err) => {
        log.warn("[bootstrap] OCR extraction error", {
          pdf,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }
  } catch (err) {
    log.warn("[bootstrap] background OCR check failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}, 10_000); // Start 10s after boot to not block startup

// ── 5. Graceful shutdown ───────────────────────────────────────────────────
async function shutdown(signal: string) {
  log.info(`[bootstrap] Received ${signal} — shutting down...`);
  // Clean up Chrome browser instances first to prevent zombie processes
  const { cleanupBrowsers } = await import("./infrastructure/fetchers/ssc.js");
  cleanupBrowsers();
  // Close LanceDB vector store
  const { closeVectorStore } = await import("./infrastructure/rag/vectorstore.js");
  await closeVectorStore().catch(() => {});
  // Close SQLite database
  const { closeDb } = await import("./infrastructure/db/schema.js");
  closeDb();
  // Stop HTTP server
  await srv.close();
  log.info("[bootstrap] Shutdown complete");
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
