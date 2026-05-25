/**
 * Composition Root — VN Market Intelligence MCP
 * Orchestration only: wires startup sections into bootstrapMcpServer().
 * Zero domain logic. Zero bare SQL. Only: import + call + log.
 * size-justification: single-function bootstrap; all sections mandatory here.
 */

import { loadMcpConfig } from "./infrastructure/config.js";
import type { AppConfig } from "./infrastructure/config.js";
import type { Logger } from "./infrastructure/logger.js";
import { initDatabase } from "./infrastructure/db/index.js";
import { createBunServer } from "./interface/mcp/server.js";
import { startScheduler } from "./scheduler/jobs.js";
import { registerWebhook } from "./infrastructure/notifiers/telegramWebhookSetup.js";
import { runEnvCheck } from "./infrastructure/envCheck.js";

export async function bootstrapMcpServer(cfg: AppConfig, log: Logger): Promise<void> {
  // ── 0. Env self-check ─────────────────────────────────────────────────────
  await runEnvCheck(log);

  // ── 1. SQLite tables + WAL + vnstock migrations ───────────────────────────
  await initDatabase();
  const { runVnstockMigrations } = await import("./infrastructure/db/vnstockStore.js");
  runVnstockMigrations();
  try { // Replay leftover WAL from previous crash (reports #1086/#1088).
    const { getDb } = await import("./infrastructure/db/schema.js");
    getDb().exec("PRAGMA wal_checkpoint(TRUNCATE)");
    log.info("[bootstrap] WAL checkpoint (startup replay) complete");
  } catch { /* best-effort */ }
  log.info("[bootstrap] Database ready");

  // ── 1b. Seed trade relationship profiles (first run only) ─────────────────
  try {
    const { seedTradeProfiles } = await import("./infrastructure/db/tradeStore.js");
    const profiles = await import("./domain/services/tradeRelationships.js");
    const mcp = loadMcpConfig();
    const allProfiles = mcp.market.watchlist
      .map((code: string) => profiles.getTradeProfile(code))
      .filter((p): p is NonNullable<typeof p> => p !== null);
    seedTradeProfiles(allProfiles);
  } catch { /* best-effort */ }

  // ── 2. Bun HTTP server + SSE transport ────────────────────────────────────
  const srv = await createBunServer({ port: cfg.port, host: cfg.host });
  log.info("[bootstrap] MCP server ready", { port: srv.port });
  log.info("[bootstrap] Endpoints", { sse: `http://127.0.0.1:${srv.port}/sse`, health: `http://127.0.0.1:${srv.port}/health` });

  // ── 3. Telegram env liveness check ───────────────────────────────────────
  {
    const enabled = (Bun.env.TELEGRAM_ENABLED ?? "true").toLowerCase() !== "false";
    const tokenSet = ((Bun.env.TELEGRAM_BOT_TOKEN ?? "").length > 0);
    const marketSet = ((Bun.env.TELEGRAM_INFO_MARKET_GROUP_ID ?? "").length > 0);
    const workSet = ((Bun.env.TELEGRAM_INFO_WORK_CHANNEL_ID ?? "").length > 0);
    const bugSet = ((Bun.env.TELEGRAM_REPORT_BUG_CHANNEL_ID ?? "").length > 0);
    if (enabled && (!tokenSet || !marketSet || !workSet || !bugSet)) {
      log.warn("[bootstrap] Telegram env incomplete — sends will be skipped", {
        TELEGRAM_BOT_TOKEN: tokenSet ? "set" : "MISSING", TELEGRAM_INFO_MARKET_GROUP_ID: marketSet ? "set" : "MISSING",
        TELEGRAM_INFO_WORK_CHANNEL_ID: workSet ? "set" : "MISSING", TELEGRAM_REPORT_BUG_CHANNEL_ID: bugSet ? "set" : "MISSING",
      });
    } else if (enabled) { log.info("[bootstrap] Telegram env OK (token + market + work + bug all set)");
    } else { log.info("[bootstrap] Telegram disabled via TELEGRAM_ENABLED=false"); }
  }

  // ── 3b. Telegram webhook registration ────────────────────────────────────
  const webhookOk = await registerWebhook();
  log.info(webhookOk ? "[bootstrap] Telegram webhook registered" : "[bootstrap] Telegram webhook skipped");

  // ── 3c. pdf-extractor microservice health check (Task 1352b) ─────────────
  try {
    const { checkPdfExtractorHealth } = await import("./infrastructure/fetchers/pdfExtractorClient.js");
    const pdfOk = await checkPdfExtractorHealth();
    if (pdfOk) {
      log.info("[bootstrap] pdf-extractor health check OK", { available: true, endpoint: Bun.env.PDF_EXTRACTOR_URL ?? "http://localhost:5001" });
    } else {
      log.warn("[bootstrap] pdf-extractor unavailable — OCR fallback only", { available: false, endpoint: Bun.env.PDF_EXTRACTOR_URL ?? "http://localhost:5001" });
    }
  } catch { log.warn("[bootstrap] pdf-extractor health check failed — continuing without it"); }

  // ── 4. Cron scheduler ─────────────────────────────────────────────────────
  startScheduler();
  log.info("[bootstrap] Scheduler started — cron jobs active");

  // ── 4b. Background OCR for unprocessed PDFs (G5-DEBT: 4 KEEP callers) ────
  setTimeout(async () => {
    try {
      const { mkdirSync, readdirSync } = await import("node:fs");
      const { join } = await import("node:path");
      const { extractAndStorePdfPages, isOcrAvailable } = await import("./infrastructure/fetchers/pdfOcrWorker.js");
      if (!isOcrAvailable()) { log.info("[bootstrap] OCR not available — skipping"); return; }
      const pdfDir = join(process.cwd(), "data", "pdfs"); // cwd() is always absolute; join() gives same result as path.join+cwd
      mkdirSync(pdfDir, { recursive: true });
      const pdfs = readdirSync(pdfDir).filter(f => f.endsWith(".pdf"));
      log.info("[bootstrap] checking PDFs for OCR extraction", { count: pdfs.length });
      await Promise.allSettled(pdfs.map(pdf => extractAndStorePdfPages(join(pdfDir, pdf), pdf)))
        .then(rs => rs.forEach((r, i) => {
          if (r.status === "rejected") log.warn("[bootstrap] OCR failed", { pdf: pdfs[i], error: String(r.reason) });
        }));
    } catch (err) {
      log.warn("[bootstrap] background OCR check failed", { error: err instanceof Error ? err.message : String(err) });
    }
  }, 10_000);

  // ── 5. Graceful shutdown + signal handlers ────────────────────────────────
  async function shutdown(signal: string) {
    log.info(`[bootstrap] Received ${signal} — shutting down...`);
    // G5b (P2-F): rag-service owns LanceDB lifecycle. No vector store to close here.
    const { closeDb } = await import("./infrastructure/db/schema.js");
    closeDb();
    await srv.close();
    log.info("[bootstrap] Shutdown complete");
    process.exit(0);
  }
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  // Bug 1254: log unhandled rejections instead of crashing.
  process.on("unhandledRejection", (reason) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    log.error("[bootstrap] unhandledRejection — bug 1254 safety net", { error: msg });
  });
}
