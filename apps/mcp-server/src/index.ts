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
if (!Bun.env.RUST_LOG) Bun.env.RUST_LOG = "error";
if (!Bun.env.LANCEDB_LOG_LEVEL) Bun.env.LANCEDB_LOG_LEVEL = "warn";

import { loadConfig, loadMcpConfig } from "./infrastructure/config.js";
import { createLogger } from "./infrastructure/logger.js";
import { initDatabase } from "./infrastructure/db/index.js";
import { createBunServer } from "./interface/mcp/server.js";
import { startScheduler } from "./scheduler/jobs.js";
import { registerWebhook } from "./infrastructure/notifiers/telegramWebhookSetup.js";
import { runEnvCheck } from "./infrastructure/envCheck.js";

const cfg = loadConfig();
const log = createLogger(cfg.logLevel);

log.info("[bootstrap] Starting VN Market Intelligence MCP...");

// ── 0. Env self-check (task 1026) — logs ERROR + WORK alert if vars missing ──
await runEnvCheck(log);

// ── 1. SQLite tables ───────────────────────────────────────────────────────
await initDatabase();
// Vnstock tables + idempotent migrations (e.g. trading_stats date column,
// added in Loop #20). Previously only ran when syncSectorPeers fired during
// the intelligence cycle, leaving the migration dormant on pre-market boots.
const { runVnstockMigrations } = await import("./infrastructure/db/vnstockStore.js");
runVnstockMigrations();
// Replay any leftover WAL from a previous crash — ensures no committed
// transactions are lost when the prior process was killed mid-write
// (reports #1086/#1088: financial_reports rows vanished after restarts).
try {
  const { getDb } = await import("./infrastructure/db/schema.js");
  getDb().exec("PRAGMA wal_checkpoint(TRUNCATE)");
  log.info("[bootstrap] WAL checkpoint (startup replay) complete");
} catch { /* best-effort */ }
log.info("[bootstrap] Database ready");

// ── 1b. Seed trade relationship profiles (first run only) ────────────────
// Sprint 053: ticker list now comes from mcp.config.json market.watchlist
// (single source of truth) instead of the old hard-coded
// ["VNM","FPT","VCB","HPG","VEA"]. Any code in the watchlist that has no
// tradeRelationships profile is silently skipped by the filter below.
try {
  const { seedTradeProfiles } = await import("./infrastructure/db/tradeStore.js");
  const profiles = await import("./domain/services/tradeRelationships.js");
  const mcp = loadMcpConfig();
  const allProfiles = mcp.market.watchlist
    .map((code: string) => profiles.getTradeProfile(code))
    .filter((p): p is NonNullable<typeof p> => p !== null);
  seedTradeProfiles(allProfiles);
} catch { /* best-effort — trade analysis will work without seed data */ }

// ── 2. Bun HTTP server + SSE transport ────────────────────────────────────
const srv = await createBunServer({ port: cfg.port, host: cfg.host });
log.info("[bootstrap] MCP server ready", { port: srv.port });
log.info("[bootstrap] Endpoints", {
  sse: `http://127.0.0.1:${srv.port}/sse`,
  health: `http://127.0.0.1:${srv.port}/health`,
});

// ── 3. Telegram env liveness check — fail loudly, never silently ─────────
// A prior regression silently skipped all Telegram sends when env vars were
// missing, producing false-positive "Telegram broken" reports. Log loudly at
// bootstrap so any future env regression is immediately visible in the log.
{
  const telegramEnabled = (Bun.env.TELEGRAM_ENABLED ?? "true").toLowerCase() !== "false";
  const tokenSet = ((Bun.env.TELEGRAM_BOT_TOKEN ?? "").length > 0);
  const marketSet = ((Bun.env.TELEGRAM_INFO_MARKET_GROUP_ID ?? "").length > 0);
  const workSet = ((Bun.env.TELEGRAM_INFO_WORK_CHANNEL_ID ?? "").length > 0);
  const bugSet = ((Bun.env.TELEGRAM_REPORT_BUG_CHANNEL_ID ?? "").length > 0);
  if (telegramEnabled && (!tokenSet || !marketSet || !workSet || !bugSet)) {
    log.warn("[bootstrap] Telegram env incomplete — sends will be skipped", {
      TELEGRAM_BOT_TOKEN: tokenSet ? "set" : "MISSING",
      TELEGRAM_INFO_MARKET_GROUP_ID: marketSet ? "set" : "MISSING",
      TELEGRAM_INFO_WORK_CHANNEL_ID: workSet ? "set" : "MISSING",
      TELEGRAM_REPORT_BUG_CHANNEL_ID: bugSet ? "set" : "MISSING",
    });
  } else if (telegramEnabled) {
    log.info("[bootstrap] Telegram env OK (token + market + work + bug all set)");
  } else {
    log.info("[bootstrap] Telegram disabled via TELEGRAM_ENABLED=false");
  }
}

// ── 3. Telegram webhook registration (if env vars set) ───────────────────
const webhookRegistered = await registerWebhook();
if (webhookRegistered) {
  log.info("[bootstrap] Telegram webhook registered");
} else {
  log.info("[bootstrap] Telegram webhook skipped (TELEGRAM_WEBHOOK_URL not set or no token)");
}

// ── 3b. pdf-extractor microservice health check (Task 1352b) ─────────────
// Non-fatal: logs warn if service unavailable, never crashes the server.
// pybctc runs in Docker and may not be reachable in development environments.
try {
  const { checkPdfExtractorHealth } = await import("./infrastructure/fetchers/pdfExtractorClient.js");
  const pdfExtractorOk = await checkPdfExtractorHealth();
  if (pdfExtractorOk) {
    log.info("[bootstrap] pdf-extractor health check OK", {
      available: true,
      endpoint: Bun.env.PDF_EXTRACTOR_URL ?? "http://localhost:5001",
      mode: "microservice primary (pybctc tables)",
    });
  } else {
    log.warn("[bootstrap] pdf-extractor unavailable — OCR fallback only", {
      available: false,
      endpoint: Bun.env.PDF_EXTRACTOR_URL ?? "http://localhost:5001",
      fallback: "OCR (pdftoppm + tesseract)",
    });
  }
} catch {
  log.warn("[bootstrap] pdf-extractor health check failed — continuing without it");
}

// ── 4. Cron scheduler ─────────────────────────────────────────────────────
startScheduler();
log.info("[bootstrap] Scheduler started — cron jobs active");

// ── 4. Background OCR for unprocessed PDFs ────────────────────────────────
setTimeout(async () => {
  try {
    const { mkdirSync, readdirSync } = await import("node:fs");
    const { resolve, join } = await import("node:path");
    const { extractAndStorePdfPages, isOcrAvailable } = await import("./infrastructure/fetchers/pdfOcrWorker.js");

    if (!isOcrAvailable()) {
      log.info("[bootstrap] OCR not available (tesseract/pdftoppm) — skipping");
      return;
    }

    const pdfDir = resolve(process.cwd(), "data", "pdfs");
    // Ensure the PDF directory exists on a fresh named volume (no-op if already present).
    mkdirSync(pdfDir, { recursive: true });
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
  // G5b (P2-F): rag-service owns LanceDB lifecycle (R-1 resolved). No vector store to close here.
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

// Bug 1254: safety net — log unhandled rejections instead of crashing.
// All cron callbacks now have try/catch, but this catches any remaining gaps.
process.on("unhandledRejection", (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  log.error("[bootstrap] unhandledRejection — bug 1254 safety net", { error: msg });
});
