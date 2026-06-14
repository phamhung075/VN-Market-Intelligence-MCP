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
import { runEnvCheck, assertEnvDbConsistency } from "./infrastructure/envCheck.js";
import { insertCronJobRunStart, updateCronJobRunEnd } from "./infrastructure/db/cronJobRunStore.js";

export async function bootstrapMcpServer(cfg: AppConfig, log: Logger): Promise<void> {
  // ── 0. Env self-check ─────────────────────────────────────────────────────
  // EI-P2-1: Hard assertion — kills process if APP_ENV/DB_PATH mismatch.
  // Runs before DB opens so a misconfigured dev container never writes prod data.
  assertEnvDbConsistency();
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

  // ── 1c. Startup sentinel — FIX-MCP-CRASH-LOOP A-1 ────────────────────────
  // Write a cron_job_runs row so the restart-cadence alert cron can detect
  // ≥2 restarts in a 4h window.  Best-effort: if the table is missing or the
  // write fails we continue normally — sentinel absence just means no alert.
  try {
    const { getDb } = await import("./infrastructure/db/schema.js");
    const _db = getDb();
    const sentinelId = insertCronJobRunStart(_db, "mcpServerStartup");
    updateCronJobRunEnd(_db, sentinelId, "success", null, null, 0);
    log.info("[bootstrap] mcpServerStartup sentinel written to cron_job_runs");
  } catch { /* best-effort — alert guardrail only, do not block startup */ }

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
  //
  // FIX-CTG-3-STEP-D (A): OCR → reparse ordering race.
  //
  // Prior behaviour: extractAndStorePdfPages ran for each PDF in parallel and
  // returned with no follow-up. If the reparse job had already run (Tier 3
  // cache miss) while OCR was still in flight, the financial_reports row was
  // never written. The next reparse opportunity was the daily 02:30 UTC cron.
  //
  // Fix: after OCR finishes for a PDF, immediately re-trigger the reparse for
  // that file so it can Tier-3-hit the warm cache synchronously. We re-use the
  // same reparseSingleWithOcrFallback function (injectable-deps design) wired
  // to the real production deps — identical to what bctcReparseJob uses.
  //
  // Guard: only trigger if OCR produced text (totalChars > 0) AND
  // financial_reports has no row for this ticker+period yet. This keeps the
  // hook idempotent: a PDF that was already fully parsed is never re-processed.
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

      // Process PDFs sequentially so the reparse hook can run in-order without
      // saturating resources (each OCR job is already CPU-heavy).
      for (const pdf of pdfs) {
        try {
          const result = await extractAndStorePdfPages(join(pdfDir, pdf), pdf);

          // FIX-CTG-3-STEP-D (A): post-OCR reparse hook.
          // Only fire when OCR produced text (avoids triggering on blank/corrupt PDFs).
          if (result.totalChars > 0) {
            try {
              const { getDb } = await import("./infrastructure/db/schema.js");
              const {
                parseYearQuarterFromFilename,
                tickerFromFilename,
                reparseSingleWithOcrFallback,
              } = await import("./scheduler/financial-reports/bctcReparseJob.js");
              const { extractPdfText } = await import("./infrastructure/fetchers/pdf.js");
              const { extractViaMicroservice } = await import("./infrastructure/fetchers/pdfExtractorClient.js");
              const { fetchParseAndStoreBctc } = await import("./application/usecases/fetchParseAndStoreBctc.js");
              const { getCachedPdfText } = await import("./infrastructure/fetchers/pdfOcrWorker.js");
              const { readFileSync, existsSync } = await import("node:fs");

              const ticker = tickerFromFilename(pdf);
              const yq = parseYearQuarterFromFilename(pdf);
              if (!ticker || !yq) {
                log.info("[bootstrap] post-OCR reparse: cannot parse ticker/period — skipping", { pdf });
                continue;
              }

              // Idempotency guard: skip if financial_reports row already present.
              const db = getDb();
              const existing = db.prepare(
                "SELECT COUNT(*) AS cnt FROM financial_reports WHERE action_code = ? AND period_year = ? AND period_type = ?",
              ).get(ticker, yq.year, yq.quarter) as { cnt: number } | null;
              if ((existing?.cnt ?? 0) > 0) {
                log.info("[bootstrap] post-OCR reparse: financial_reports row exists — skipping", { ticker, period: `${yq.year}-${yq.quarter}` });
                continue;
              }

              log.info("[bootstrap] post-OCR reparse: warm cache — triggering reparse", { ticker, period: `${yq.year}-${yq.quarter}`, pdf });
              const vpsBase = Bun.env.VPS_BCTC_BASE_URL ?? "http://125.212.251.27:8765/bctc-files";
              const filePath = join(pdfDir, pdf);
              await reparseSingleWithOcrFallback(
                { ticker, filename: pdf, filePath },
                {
                  extractViaService: async (url: string) => extractViaMicroservice(url, "bctc"),
                  extractText: async (buf: Buffer) => extractPdfText(buf),
                  getOcrCache: (filename: string) => getCachedPdfText(filename),
                  pipeline: async (params) => fetchParseAndStoreBctc(params),
                  fileExists: (path: string) => existsSync(path),
                  readFile: (path: string) => readFileSync(path),
                  insertFallbackRecord: async (fp) => {
                    // DA_NOP fallback — same implementation as makeProductionDeps in bctcReparseJob.
                    const { currentDataEnv } = await import("./infrastructure/envCheck.js");
                    const now = new Date().toISOString();
                    const sortKey = `${fp.year}-${fp.quarter}`;
                    db.prepare(`
                      INSERT OR IGNORE INTO financial_reports (
                        id, action_code, company_name, exchange, domain,
                        period_year, period_quarter, period_type,
                        period_start, period_end, sort_key, parsed_at,
                        extraction_confidence, data_env,
                        balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json
                      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `).run(
                      `fallback-${fp.ticker}-${sortKey}`,
                      fp.ticker, fp.ticker, "HOSE", "other",
                      fp.year, fp.quarter, fp.quarter,
                      `${fp.year}-01-01`, `${fp.year}-12-31`,
                      sortKey, now, 0, currentDataEnv(),
                      '{}', '{}', '{}', '{}',
                    );
                  },
                },
              );
              log.info("[bootstrap] post-OCR reparse: complete", { ticker, period: `${yq.year}-${yq.quarter}` });
            } catch (reparseErr) {
              log.warn("[bootstrap] post-OCR reparse: threw (non-fatal)", {
                pdf,
                error: reparseErr instanceof Error ? reparseErr.message : String(reparseErr),
              });
            }
          }
        } catch (ocrErr) {
          log.warn("[bootstrap] OCR failed", { pdf, error: String(ocrErr) });
        }
      }
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
