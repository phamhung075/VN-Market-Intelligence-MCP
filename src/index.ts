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

// Suppress verbose LanceDB/Rust TRACE logs — only show errors
// Must be set before any LanceDB import (Bun reads .env at startup too)
if (!process.env.RUST_LOG) process.env.RUST_LOG = "error";
if (!process.env.LANCEDB_LOG_LEVEL) process.env.LANCEDB_LOG_LEVEL = "warn";

import { loadConfig } from "./infrastructure/config.js";
import { createLogger } from "./infrastructure/logger.js";
import { initDatabase } from "./infrastructure/db/index.js";
import { createBunServer } from "./interface/mcp/server.js";
import { startScheduler } from "./scheduler/jobs.js";
import { registerWebhook } from "./infrastructure/notifiers/telegramWebhookSetup.js";

const cfg = loadConfig();
const log = createLogger(cfg.logLevel);

log.info("[bootstrap] Starting VN Market Intelligence MCP...");

// ── 1. SQLite tables ───────────────────────────────────────────────────────
await initDatabase();
log.info("[bootstrap] Database ready");

// ── 1b. Seed trade relationship profiles (first run only) ────────────────
try {
  const { seedTradeProfiles } = await import("./infrastructure/db/tradeStore.js");
  // Import seed data from domain — only inserts if table is empty
  const profiles = await import("./domain/services/tradeRelationships.js");
  const allProfiles = ["VNM", "FPT", "VCB", "HPG", "VEA"]
    .map((code) => profiles.getTradeProfile(code))
    .filter((p): p is NonNullable<typeof p> => p !== null);
  seedTradeProfiles(allProfiles);
} catch { /* best-effort — trade analysis will work without seed data */ }

// ── 2. Bun HTTP server + SSE transport ────────────────────────────────────
const srv = await createBunServer({ port: cfg.port });
log.info("[bootstrap] MCP server ready", { port: srv.port });
log.info("[bootstrap] Endpoints", {
  sse: `http://127.0.0.1:${srv.port}/sse`,
  health: `http://127.0.0.1:${srv.port}/health`,
});

// ── 3. Telegram webhook registration (if env vars set) ───────────────────
const webhookRegistered = await registerWebhook();
if (webhookRegistered) {
  log.info("[bootstrap] Telegram webhook registered");
} else {
  log.info("[bootstrap] Telegram webhook skipped (TELEGRAM_WEBHOOK_URL not set or no token)");
}

// ── 4. Cron scheduler ─────────────────────────────────────────────────────
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

    await Promise.allSettled(
      pdfs.map(pdf => extractAndStorePdfPages(join(pdfDir, pdf), pdf))
    ).then(results => {
      results.forEach((r, i) => {
        if (r.status === "rejected") {
          log.warn("[bootstrap] OCR failed for PDF", { pdf: pdfs[i], error: String(r.reason) });
        }
      });
    });
  } catch (err) {
    log.warn("[bootstrap] background OCR check failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}, 10_000);

// ── 5. Graceful shutdown ───────────────────────────────────────────────────
async function shutdown(signal: string) {
  log.info(`[bootstrap] Received ${signal} — shutting down...`);
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
