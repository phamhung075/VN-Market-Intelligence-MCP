/**
 * Interface — MCP Server factory + Bun HTTP entry point
 *
 * Responsibilities:
 *   1. Instantiate the McpServer (tools registered later by task 082+)
 *   2. Create a Bun HTTP server with routes: GET /sse, POST /messages,
 *      GET /health, GET /
 *   3. Return a BunServerInstance that exposes port + close()
 *
 * Routes:
 *   GET  /sse                        — opens an SSE stream for Claude
 *   POST /messages?sessionId=<id>    — Claude sends tool calls here
 *   GET  /health                     — liveness probe (JSON)
 *   GET  /                           — endpoint info (JSON)
 *
 * Usage (entry point):
 *   import { createBunServer } from './src/interface/mcp/server.js'
 *   const srv = await createBunServer({ port: 3000 })
 *   // ...
 *   await srv.close()
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { loadConfig } from "../../infrastructure/config.js";
import { createLogger } from "../../infrastructure/logger.js";
import { SseSessionManager } from "./transport.js";
import { sendTelegramWork } from "../../infrastructure/notifiers/telegram.js";
import { getDb } from "../../infrastructure/db/schema.js";
import { toolRegistry } from "./tools/registry.js";
import { getToolsForSkills } from "./bootstrap/agentBootstrap.js";
import { sessionToolCache } from "../../infrastructure/cache/sessionToolCache.js";
export { sessionToolCache } from "../../infrastructure/cache/sessionToolCache.js";
import { safeLogVpsPush, type VpsPushLogEntry } from "../../infrastructure/db/vpsPushLogStore.js";
import { buildForeignFlowStatusResponse } from "./foreignFlowStatusHandler.js";
import { ensurePoisonedQueueCleanup } from "./server-startup.js";
export {
  _staleTickers_lastNotifiedDate,
  _resetStaleTickers_lastNotifiedDate,
  isVnTradingWindowUtc,
} from "./server-startup.js";
import { handlePushPrices } from "./routes/pushPricesHandler.js";
import { handlePushForeignFlow } from "./routes/pushForeignFlowHandler.js";
import { handleWebhook } from "./routes/webhookHandler.js";
import { handlePushNews } from "./routes/pushNewsHandler.js";
import { handleVpsNewsHealth } from "./routes/vpsNewsHealthHandler.js";
import { handleNewsFetchLive } from "./routes/newsFetchLiveHandler.js";
import { handleNewsFetchDashboard } from "./routes/newsFetchDashboardHandler.js";
import {
  handleBctcInspectPage,
  handleBctcInspectDocs,
  handleBctcInspectPdf,
  handleBctcInspectOcr,
  handleBctcInspectTable,
  handleBctcInspectZones,
} from "./routes/bctcInspectHandler.js";
import { handlePushBctcTable } from "./routes/pushBctcTableHandler.js";
import { handlePushBctcMdTables } from "./routes/pushBctcMdTablesHandler.js";
import { handleBctcInspectMd } from "./routes/bctcInspectMdHandler.js";
import { handlePushBctcLayout } from "./routes/pushBctcLayoutHandler.js";
import { backfillBctcPdfPaths } from "../../application/usecases/backfillBctcPdfPaths.js";
import { getAccuracyStats, getSystemAccuracyDigestStats } from "../../infrastructure/db/signalOutcomeStore.js";

/**
 * Cloudflare Routing — Path Prefix Stripping Middleware
 * Handles Cloudflare routing: zenmidi.com/vn-market/* → localhost:3000/*
 * Strips /vn-market prefix from incoming requests so route handlers work correctly
 * for both production (with prefix) and local dev (without prefix)
 */
function stripCloudflarePathPrefix(pathname: string): string {
  const prefix = "/vn-market";
  if (pathname.startsWith(prefix + "/") || pathname === prefix) {
    return pathname === prefix ? "/" : pathname.slice(prefix.length) || "/";
  }
  return pathname;
}


// ─────────────────────────────────────────────────────────────────────────────
// Task 1112 — Minimal multipart/form-data parser for push-bctc-pdf
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse multipart/form-data body into a Map of field name → value.
 * Text fields return string values; file fields return Buffer values.
 */
function parseMultipartFields(body: Buffer, boundary: string): Map<string, string | Buffer> {
  const fields = new Map<string, string | Buffer>();
  const sep = Buffer.from(`--${boundary}`);

  // Split body by boundary
  let start = 0;
  const parts: Buffer[] = [];
  while (true) {
    const idx = body.indexOf(sep, start);
    if (idx === -1) break;
    if (start > 0) {
      // Remove trailing \r\n before boundary
      const end = idx - 2 >= start ? idx - 2 : idx;
      parts.push(body.subarray(start, end));
    }
    start = idx + sep.length;
    // Skip \r\n after boundary
    if (body[start] === 0x0d && body[start + 1] === 0x0a) start += 2;
    // Check for closing --
    if (body[start] === 0x2d && body[start + 1] === 0x2d) break;
  }

  for (const part of parts) {
    // Find double CRLF separating headers from body
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd === -1) continue;
    const headerStr = part.subarray(0, headerEnd).toString("utf-8");
    const bodyContent = part.subarray(headerEnd + 4);

    const nameMatch = headerStr.match(/name="([^"]+)"/);
    if (!nameMatch?.[1]) continue;
    const name = nameMatch[1];

    const isFile = headerStr.includes("filename=");
    fields.set(name, isFile ? Buffer.from(bodyContent) : bodyContent.toString("utf-8"));
  }

  return fields;
}

/** Options for starting the Bun HTTP server. */
export interface BunServerOptions {
  /** TCP port to listen on. Falls back to PORT env var, then 3000. */
  port?: number;
  /** Host/interface to bind to. Defaults to '127.0.0.1'. */
  host?: string;
}

/**
 * A running server handle returned by createBunServer.
 * Allows the caller to inspect the bound port and perform a clean shutdown.
 */
export interface BunServerInstance {
  /** The TCP port the server is listening on. */
  readonly port: number;
  /**
   * The number of MCP tools registered on this server instance.
   * Exposed here so tests and monitoring can verify wiring without an HTTP round-trip.
   */
  readonly toolCount: number;
  /** Gracefully stops the HTTP server. Resolves when all connections are closed. */
  close(): Promise<void>;
}

/**
 * Creates and starts the Bun/Node HTTP server for the MCP interface.
 *
 * @param options - Optional overrides for port and host.
 * @returns A BunServerInstance with port info and a close() method.
 */
export async function createBunServer(
  options: BunServerOptions = {},
): Promise<BunServerInstance> {
  const cfg = loadConfig();
  const port = options.port ?? cfg.port;
  const host = options.host ?? cfg.host ?? "0.0.0.0";
  const log = createLogger(cfg.logLevel);

  // ── McpServer factory — one instance per SSE session ────────────────────
  function createMcpServerInstance(skills?: string[], sessionId?: string): McpServer {
    const server = new McpServer(
      { name: "vn-market-intelligence", version: "1.0.0" },
      { capabilities: { tools: {} } },
    );
    const fns = skills ? getToolsForSkills(skills) : toolRegistry;
    fns.forEach((fn) => fn(server));

    // Populate session cache after tool resolution (observable-only, not on hot path).
    // Fire-and-forget: probe server to collect registered tool names, then cache.
    if (sessionId && skills) {
      try {
        const registeredToolsMap = (server as unknown as { _registeredTools?: Record<string, unknown> })._registeredTools;
        const toolNames = registeredToolsMap ? Object.keys(registeredToolsMap) : [];
        sessionToolCache.set(sessionId, { skills, toolNames, loadedAt: Date.now() });
      } catch {
        // Cache population is best-effort — never block server creation
      }
    }

    return server;
  }

  // Count tools from a probe instance (not connected to any transport)
  const probeServer = createMcpServerInstance();
  const registeredToolsMap = (
    probeServer as unknown as { _registeredTools: Record<string, unknown> }
  )._registeredTools;
  const toolCount = Object.keys(registeredToolsMap ?? {}).length;
  log.info("[createBunServer] Tools registered", { toolCount });

  // FIX-BCTC-SIZE-GUARD: reset 4 poisoned 'done' queue entries once at startup
  ensurePoisonedQueueCleanup();

  // ── Task 1839a Phase 2: single DB handle for all HTTP route handlers ─────
  // One shared DB instance for all route handlers — opened once at startup.
  // Eliminates 16 per-request calls; server lifetime matches startScheduler.
  const db = getDb();

  // ── REOPEN-2: Backfill pdf_path for financial_reports rows where pdf_path IS NULL ─
  // Idempotent: only touches NULL rows; same input → same result.
  // Links 14 real rows (inserted via news-inference fallback) to on-disk PDFs
  // so GET /api/bctc-inspect/docs returns real data instead of count:0.
  // pdfDir matches the convention used by bctcPdfPullJob + push-bctc-pdf handler.
  try {
    const { resolve } = await import("node:path");
    const pdfDir = resolve(process.cwd(), "data", "pdfs");
    const backfillResult = backfillBctcPdfPaths(db, pdfDir);
    log.info("[startup] backfillBctcPdfPaths complete", backfillResult as unknown as Record<string, unknown>);
  } catch (backfillErr) {
    // Non-fatal: log and continue — inspector still shows rows with has_pdf:false
    log.warn("[startup] backfillBctcPdfPaths failed (non-fatal)", {
      error: backfillErr instanceof Error ? backfillErr.message : String(backfillErr),
    });
  }

  // ── Session manager handles SSE + message routing ──────────────────────
  // Detect path prefix for Cloudflare Tunnel (e.g., "/vn-market")
  // When behind Cloudflare, the SSE endpoint response must include the full path
  // so clients POST to the correct address through the tunnel
  const pathPrefix = process.env.CLOUDFLARE_PATH_PREFIX || "";
  const sessions = new SseSessionManager(createMcpServerInstance, log, pathPrefix);

  // ── Streamable HTTP: stateless mode (one server+transport per request) ──

  // ── HTTP request handler ────────────────────────────────────────────────
  async function handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const url = new URL(req.url ?? "/", `http://${host}`);
    // Strip Cloudflare path prefix if present (/vn-market/api/* → /api/*)
    // Falls through if no prefix (local dev routes work unchanged)
    const pathname = stripCloudflarePathPrefix(url.pathname);
    const method = req.method ?? "GET";

    // CORS — allow Claude Desktop and web clients
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, mcp-session-id",
    );
    res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");

    if (method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // ── /mcp — Streamable HTTP for Claude.ai connectors ───────────────
    if (pathname === "/mcp") {
      // Disable buffering for SSE streaming through proxies
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("X-Accel-Buffering", "no");

      // Stateless: create fresh server + transport per request
      // The SDK's handleRequest will read the body itself, so we don't pre-parse
      const reqTransport = new StreamableHTTPServerTransport({});
      const reqMcp = createMcpServerInstance();
      await reqMcp.connect(reqTransport as unknown as import("@modelcontextprotocol/sdk/shared/transport.js").Transport);
      try {
        await reqTransport.handleRequest(req, res);
      } finally {
        // Explicit cleanup prevents memory leak on long-running servers
        await reqTransport.close().catch(() => {});
        await reqMcp.close().catch(() => {});
      }
      return;
    }

    // ── GET /sse ──────────────────────────────────────────────────────────
    if (method === "GET" && pathname === "/sse") {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("X-Accel-Buffering", "no");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Transfer-Encoding", "chunked");
      await sessions.handleSse(req, res);
      return;
    }
    // ── POST /messages ────────────────────────────────────────────────────
    if (method === "POST" && pathname === "/messages") {
      const sessionId = url.searchParams.get("sessionId");

      if (!sessionId) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing sessionId query param" }));
        return;
      }

      await sessions.handleMessage(req, res, sessionId);
      return;
    }

    // ── GET /health ───────────────────────────────────────────────────────
    if (method === "GET" && pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          name: "vn-market",
          version: "1.0.0",
          toolCount,
          sessions: sessions.sessionCount,
          uptime: process.uptime(),
        }),
      );
      return;
    }

    // ── GET /api/health/vps-news — VPS news push liveness (no auth) ─────────
    if (method === "GET" && pathname === "/api/health/vps-news") {
      handleVpsNewsHealth(req, res, db);
      return;
    }

    // ── GET /api/news-fetch/live — live DB inspection view (no auth) ─────────
    if (method === "GET" && pathname === "/api/news-fetch/live") {
      handleNewsFetchLive(req, res, db);
      return;
    }

    // ── GET /dashboards/news-fetch/* — static dashboard (NF-LD-4) ─────────────
    // Serves the news-fetch pilot dashboard (sandbox + live panels) same-origin.
    // Files live in apps/mcp-server/src/interface/news-fetch-dashboard/.
    // Included automatically by the existing COPY apps/mcp-server/src/ ./src/ Dockerfile line.
    if (method === "GET" && (pathname === "/dashboards/news-fetch/" ||
        pathname === "/dashboards/news-fetch/index.html")) {
      handleNewsFetchDashboard(req, res, null);
      return;
    }
    if (method === "GET" && pathname.startsWith("/dashboards/news-fetch/")) {
      const asset = pathname.slice("/dashboards/news-fetch/".length);
      handleNewsFetchDashboard(req, res, asset);
      return;
    }

    // ── BCTC Inspector — Sprint PDF-INSPECT redo (SI-2 boundary) ─────────────
    // GET /api/bctc-inspect                  — HTML viewer page
    // GET /api/bctc-inspect/docs             — document list (financial_reports)
    // GET /api/bctc-inspect/pdf/{doc_id}     — stream PDF bytes
    // GET /api/bctc-inspect/ocr/{doc_id}     — OCR text pages (pdf_extracted_text)
    if (method === "GET" && pathname === "/api/bctc-inspect") {
      handleBctcInspectPage(req, res);
      return;
    }
    if (method === "GET" && pathname === "/api/bctc-inspect/docs") {
      handleBctcInspectDocs(req, res, db);
      return;
    }
    if (method === "GET" && pathname.startsWith("/api/bctc-inspect/pdf/")) {
      const docId = pathname.slice("/api/bctc-inspect/pdf/".length);
      handleBctcInspectPdf(req, res, db, docId);
      return;
    }
    if (method === "GET" && pathname.startsWith("/api/bctc-inspect/ocr/")) {
      const docId = pathname.slice("/api/bctc-inspect/ocr/".length);
      handleBctcInspectOcr(req, res, db, docId);
      return;
    }
    // BT-3i-B: Get structured table rows for inspector render
    if (method === "GET" && pathname.startsWith("/api/bctc-inspect/table/")) {
      const docId = pathname.slice("/api/bctc-inspect/table/".length);
      await handleBctcInspectTable(req, res, db, docId);
      return;
    }
    // BT-3i-A: Push structured table rows from pdf-extractor
    if (method === "POST" && pathname === "/api/push-bctc-table") {
      await handlePushBctcTable(req, res, db);
      return;
    }
    // MD-INSPECT: Push generic markdown tables from pdf-extractor
    if (method === "POST" && pathname === "/api/push-bctc-md-tables") {
      await handlePushBctcMdTables(req, res, db);
      return;
    }
    // MD-INSPECT: Get generic markdown tables for inspector render
    if (method === "GET" && pathname.startsWith("/api/bctc-inspect/md/")) {
      const docId = pathname.slice("/api/bctc-inspect/md/".length);
      await handleBctcInspectMd(req, res, db, docId);
      return;
    }
    // LF-OVERLAY: Push layout-first extraction payload from pdf-extractor
    if (method === "POST" && pathname === "/api/push-bctc-layout") {
      await handlePushBctcLayout(req, res, db);
      return;
    }
    // PEK-RENDER-SEAM: Trigger PEK re-extraction for a report (§5 brief)
    // POST /api/trigger-pek-extract — accepts { report_id }, looks up pdf_path,
    // calls pdf-extractor:5001/pek-extract with { report_id, pdf_path }.
    // Returns 202 on success, 404 when pdf_path IS NULL, 503 from pdf-extractor (market hours).
    // No change to PekExtractRequestSchema — pdf_path stays mandatory on pdf-extractor side.
    if (method === "POST" && pathname === "/api/trigger-pek-extract") {
      let body = "";
      for await (const chunk of req) body += chunk;

      let payload: { report_id?: unknown } = {};
      try {
        if (body.trim()) payload = JSON.parse(body) as { report_id?: unknown };
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON body" }));
        return;
      }

      const reportId = typeof payload.report_id === "string" ? payload.report_id.trim() : null;
      if (!reportId) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing required field: report_id (string)" }));
        return;
      }

      // Look up pdf_path from financial_reports (mcp-server owns the DB)
      const pdfPathRow = db
        .prepare<{ pdf_path: string | null }, [string]>(
          `SELECT pdf_path FROM financial_reports WHERE id = ?`,
        )
        .get(reportId) as { pdf_path: string | null } | null;

      if (!pdfPathRow) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "report_not_found", report_id: reportId }));
        return;
      }

      const pdfPath = pdfPathRow.pdf_path;
      if (!pdfPath) {
        // Two known cases: VCB Q1/Q4 geo-restricted — never trigger PEK for these
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "pdf_path_null", report_id: reportId, detail: "PDF not downloaded (geo-restricted or not available)" }));
        return;
      }

      // Call pdf-extractor with both report_id and pdf_path (PekExtractRequestSchema requires both)
      try {
        const pekUrl = "http://pdf-extractor:5001/pek-extract";
        const pekResp = await fetch(pekUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ report_id: reportId, pdf_path: pdfPath }),
        });

        // Propagate 503 (market hours guard) verbatim
        if (pekResp.status === 503) {
          res.writeHead(503, { "Content-Type": "application/json" });
          const pekBody = await pekResp.text();
          res.end(pekBody || JSON.stringify({ error: "market_open", detail: "pdf-extractor returned 503 (VN market hours guard)" }));
          return;
        }

        if (!pekResp.ok) {
          const pekBody = await pekResp.text();
          log.error("[trigger-pek-extract] pdf-extractor error", { status: pekResp.status, reportId, body: pekBody });
          res.writeHead(502, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "pdf_extractor_error", status: pekResp.status, detail: pekBody }));
          return;
        }

        log.info("[trigger-pek-extract] extraction triggered", { reportId, pdfPath });
        res.writeHead(202, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, report_id: reportId, pdf_path: pdfPath, status: "extraction_queued" }));
      } catch (fetchErr) {
        log.error("[trigger-pek-extract] fetch error", { error: fetchErr instanceof Error ? fetchErr.message : String(fetchErr), reportId });
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "pdf_extractor_unreachable", detail: fetchErr instanceof Error ? fetchErr.message : String(fetchErr) }));
      }
      return;
    }

    // LF-OVERLAY: Get zone-geometry for a specific doc + page (overlay read path)
    if (method === "GET" && pathname.startsWith("/api/bctc-inspect/zones/")) {
      const docId = pathname.slice("/api/bctc-inspect/zones/".length);
      handleBctcInspectZones(req, res, db, docId);
      return;
    }

    // ── GET / — info ──────────────────────────────────────────────────────
    if (method === "GET" && pathname === "/") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          name: "VN Market Intelligence MCP",
          version: "1.0.0",
          endpoints: {
            sse: "GET  /sse                      — connect Claude here",
            messages:
              "POST /messages?sessionId=<id>  — send tool calls / responses",
            health: "GET  /health                   — liveness probe",
          },
        }),
      );
      return;
    }

    // ── POST /webhook — Telegram bot command webhook ──────────────────────
    if (method === "POST" && pathname === "/webhook") {
      await handleWebhook(req, res, db, log);
      return;
    }

    // ── Push Prices from VPS proxy ────────────────────────────────────────
    if (method === "POST" && pathname === "/api/push-prices") {
      await handlePushPrices(req, res, db, log);
      return;
    }

    // ── Push Foreign Flow from VPS proxy ────────────────────────────────────
    if (method === "POST" && pathname === "/api/push-foreign-flow") {
      await handlePushForeignFlow(req, res, db, log);
      return;
    }

    // ── Foreign flow diagnostic endpoint ─────────────────────────────────────
    if (method === "GET" && pathname === "/api/foreign-flow-status") {
      const apiKey = Bun.env.VPS_PUSH_API_KEY;
      const authHeader =
        (req.headers["x-api-key"] as string | undefined) ||
        (req.headers["authorization"] as string | undefined)?.replace("Bearer ", "");
      const result = buildForeignFlowStatusResponse({
        db,
        apiKey,
        requestApiKey: authHeader,
      });
      res.writeHead(result.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result.body));
      return;
    }

    // ── Get all stock codes for VPS proxy (watchlist + reference stocks) ────
    if (method === "GET" && pathname === "/api/watchlist") {
      const apiKey = Bun.env.VPS_PUSH_API_KEY;
      const authHeader = req.headers["x-api-key"] || req.headers["authorization"]?.replace("Bearer ", "");
      if (!apiKey || authHeader !== apiKey) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }
      try {
        // Watchlist stocks (user's portfolio)
        const rows = db.prepare("SELECT code FROM watchlist ORDER BY code").all() as { code: string }[];
        const watchlistCodes = rows.map((r) => r.code);

        // Reference stocks + global indices from mcp.config.json
        const { readFileSync } = await import("node:fs");
        const { resolve } = await import("node:path");
        let refCodes: string[] = [];
        let globalIndices: Record<string, string> = {};
        try {
          const cfgRaw = JSON.parse(readFileSync(resolve(process.cwd(), "mcp.config.json"), "utf-8"));
          const refStocks: Record<string, string[]> = cfgRaw?.market?.referenceStocks ?? {};
          refCodes = Object.values(refStocks).flat();
          globalIndices = cfgRaw?.market?.globalIndices ?? {};
        } catch { /* config read failed — use watchlist only */ }

        // Deduplicate: watchlist + all reference codes
        const allCodes = [...new Set([...watchlistCodes, ...refCodes])].sort();

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          codes: allCodes,
          watchlist: watchlistCodes,
          globalIndices,
        }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "DB error" }));
      }
      return;
    }

    // ── VPS push: VN news (CafeF, VnExpress, VnEconomy RSS) ────────────────
    if (method === "POST" && pathname === "/api/push-news") {
      await handlePushNews(req, res, db, log);
      return;
    }

    // ── VPS push: SBV / VCB FX rates ────────────────────────────────────────
    if (method === "POST" && pathname === "/api/push-sbv-rates") {
      const apiKey = Bun.env.VPS_PUSH_API_KEY;
      const authHeader = req.headers["x-api-key"] || req.headers["authorization"]?.replace("Bearer ", "");
      if (!apiKey || authHeader !== apiKey) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }

      let body = "";
      for await (const chunk of req) body += chunk;
      try {
        if (!body.trim()) {
          safeLogVpsPush({ service: "sbv", itemsCount: 0, status: "error", errorMsg: "Empty request body" }, db);
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Empty request body" }));
          return;
        }
        const snapshot: {
          overnightRatePct?: number;
          refinancingRatePct?: number;
          usdVndOfficial: number;
          discountRatePct?: number;
          maxDepositRatePct?: number;
          maxLendingRatePct?: number;
          interbankOvernightPct?: number;
          fetchedAt?: string;
        } = JSON.parse(body);

        if (typeof snapshot.usdVndOfficial !== "number" || snapshot.usdVndOfficial <= 0) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid usdVndOfficial (positive number required)" }));
          return;
        }

        const { storeSbvSnapshot } = await import("../../infrastructure/fetchers/sbv.js");
        const finalSnapshot = {
          overnightRatePct: snapshot.overnightRatePct ?? 0,
          refinancingRatePct: snapshot.refinancingRatePct ?? 0,
          usdVndOfficial: snapshot.usdVndOfficial,
          discountRatePct: snapshot.discountRatePct ?? 0,
          maxDepositRatePct: snapshot.maxDepositRatePct ?? 0,
          maxLendingRatePct: snapshot.maxLendingRatePct ?? 0,
          interbankOvernightPct: snapshot.interbankOvernightPct ?? 0,
          fetchedAt: snapshot.fetchedAt ?? new Date().toISOString(),
        };

        storeSbvSnapshot(finalSnapshot);

        log.info("[push-sbv-rates] stored VCB FX rate from VPS", {
          usdVnd: finalSnapshot.usdVndOfficial,
          fetchedAt: finalSnapshot.fetchedAt,
        });
        safeLogVpsPush({ service: "sbv", itemsCount: 1, status: "ok" }, db);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, usdVnd: finalSnapshot.usdVndOfficial }));
      } catch (err) {
        log.error("[push-sbv-rates] error", { error: err instanceof Error ? err.message : String(err) });
        safeLogVpsPush({ service: "sbv", itemsCount: 0, status: "error", errorMsg: err instanceof Error ? err.message : String(err) }, db);
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
      return;
    }

    // ── Task 1112: BCTC VPS proxy — fetch queue ────────────────────────────
    if (method === "GET" && pathname === "/api/bctc-fetch-queue") {
      const apiKey = Bun.env.VPS_PUSH_API_KEY;
      const authHeader = req.headers["x-api-key"] || req.headers["authorization"]?.replace("Bearer ", "");
      if (!apiKey || authHeader !== apiKey) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }
      try {
        // Get current reporting period (most recent quarter)
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1; // 1-indexed

        // 1201: Correct SSC filing deadline boundaries.
        // Vietnamese SSC filing deadlines:
        //   Q4 (Oct–Dec) filings due ~30 Mar  → collect Q4 during Jan–Apr
        //   Q1 (Jan–Mar) filings due ~30 Apr  → collect Q1 during May–Jul
        //   Q2 (Apr–Jun) filings due ~30 Jul  → collect Q2 during Aug–Oct
        //   Q3 (Jul–Sep) filings due ~30 Oct  → collect Q3 during Nov–Dec
        //
        // Bug was: else if (currentMonth <= 6) → Q1, which fired in April (month 4)
        // giving Q1-2026 instead of the correct Q4-2025.
        let targetYear = currentYear;
        let targetQuarter: string;
        if (currentMonth <= 4) {
          // Jan–Apr: collect Q4 of previous year (filed by ~30 March, stragglers through April)
          targetYear = currentYear - 1;
          targetQuarter = "Q4";
        } else if (currentMonth <= 7) {
          // May–Jul: collect Q1 of current year
          targetQuarter = "Q1";
        } else if (currentMonth <= 10) {
          // Aug–Oct: collect Q2 of current year
          targetQuarter = "Q2";
        } else {
          // Nov–Dec: collect Q3 of current year
          targetQuarter = "Q3";
        }

        // Get watchlist tickers
        const watchlistRows = db.prepare("SELECT code FROM watchlist ORDER BY code").all() as { code: string }[];
        const watchlistCodes = watchlistRows.map((r) => r.code);

        // Find tickers missing from financial_reports for the target period
        const existingRows = db.prepare(
          `SELECT action_code FROM financial_reports WHERE period_year = ? AND period_type = ?`,
        ).all(targetYear, targetQuarter) as { action_code: string }[];
        const existing = new Set(existingRows.map((r) => r.action_code));

        const missing = watchlistCodes.filter((c) => !existing.has(c));

        // Revive stale skipped rows so VPS can reattempt discovery.
        // INSERT OR IGNORE would silently ignore existing 'skipped' rows, leaving
        // them permanently blocked. The UPDATE runs first to reset them to 'pending'.
        db.prepare(
          `UPDATE bctc_vps_queue SET status='pending'
           WHERE status='skipped' AND source_url IS NULL`,
        ).run();

        // Upsert queue rows for missing tickers
        const insertStmt = db.prepare(
          `INSERT OR IGNORE INTO bctc_vps_queue (action_code, period_year, period_quarter) VALUES (?, ?, ?)`,
        );
        for (const code of missing) {
          insertStmt.run(code, targetYear, targetQuarter);
        }

        // Return pending queue items (max 10) — include cached source_url
        const pendingRows = db.prepare(
          `SELECT action_code, period_year, period_quarter, source_url FROM bctc_vps_queue
           WHERE status = 'pending' AND attempts < 5
           ORDER BY created_at ASC LIMIT 10`,
        ).all() as { action_code: string; period_year: number; period_quarter: string; source_url: string | null }[];

        // Task 1218: enrich pending items with PDF URLs from SSC portal
        // so VPS can fetch directly without re-discovery.
        // Task 1280: Add skip_enrichment param for emergency VPS timeouts.
        const { buildQueueSourceHints } = await import(
          "../../application/usecases/bctcQueueEnricher.js"
        );

        // Parse query parameter: skip enrichment if VPS is timing out
        const url = new URL(req.url!, "http://localhost");
        const skipEnrichment = url.searchParams.get("skip_enrichment") === "true";

        let enriched = pendingRows.map((r) => ({
          action_code: r.action_code,
          period_year: r.period_year,
          period_quarter: r.period_quarter,
          source_url: r.source_url,
        }));

        // Only enrich if requested (default behavior for normal VPS operation)
        if (!skipEnrichment) {
          const { enrichQueueWithPdfUrls } = await import(
            "../../application/usecases/bctcQueueEnricher.js"
          );

          // Injectable listDocs for production (uses listSscDocuments)
          const listDocsForEnrich = async (code: string, quarter: string, year: number) => {
            try {
              const { listSscDocuments } = await import("../../infrastructure/fetchers/ssc.js");
              return listSscDocuments(code, "quarterly", year);
            } catch {
              return [];
            }
          };

          enriched = await enrichQueueWithPdfUrls(
            enriched,
            listDocsForEnrich,
          );

          // Persist discovered PDF URLs back to the queue table
          const updateSourceUrl = db.prepare(
            `UPDATE bctc_vps_queue SET source_url = ? WHERE action_code = ? AND period_year = ? AND period_quarter = ? AND source_url IS NULL`,
          );
          for (const item of enriched) {
            if (item.source_url) {
              updateSourceUrl.run(item.source_url, item.action_code, item.period_year, item.period_quarter);
            }
          }
        }

        const queue = enriched.map((r) => ({
          action_code: r.action_code,
          period_year: r.period_year,
          period_quarter: r.period_quarter,
          source_hints: buildQueueSourceHints(r),
        }));

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ queue, total: queue.length }));
      } catch (err) {
        // HOTFIX 1288c: Suppress query errors (main server no longer enriches)
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Server error" }));
      }
      return;
    }

    // ── Task 1112: BCTC VPS proxy — push PDF ─────────────────────────────────
    if (method === "POST" && pathname === "/api/push-bctc-pdf") {
      const apiKey = Bun.env.VPS_PUSH_API_KEY;
      const authHeader = req.headers["x-api-key"] || req.headers["authorization"]?.replace("Bearer ", "");
      if (!apiKey || authHeader !== apiKey) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }

      // Size limit: 52 MB
      const contentLength = parseInt(req.headers["content-length"] ?? "0", 10);
      if (contentLength > 52_428_800) {
        res.writeHead(413, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "PDF too large (max 50 MB)" }));
        return;
      }

      try {
        // Read raw body
        const chunks: Buffer[] = [];
        let totalBytes = 0;
        for await (const chunk of req) {
          totalBytes += chunk.length;
          if (totalBytes > 52_428_800) {
            res.writeHead(413, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "PDF too large (max 50 MB)" }));
            return;
          }
          chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
        }
        const body = Buffer.concat(chunks);

        // Parse multipart/form-data
        const contentType = req.headers["content-type"] ?? "";
        const boundaryMatch = contentType.match(/boundary=(.+?)(?:;|$)/);
        if (!boundaryMatch) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing multipart boundary" }));
          return;
        }

        const boundary = boundaryMatch[1]!;
        const fields = parseMultipartFields(body, boundary);

        const actionCode = fields.get("action_code")?.toString().toUpperCase().trim();
        const periodYear = parseInt(fields.get("period_year")?.toString() ?? "", 10);
        const periodQuarter = fields.get("period_quarter")?.toString().toUpperCase().trim();
        const sourceUrl = fields.get("source_url")?.toString() ?? "";
        const pdfBuffer = fields.get("pdf");

        // Validate required fields
        if (!actionCode || !/^[A-Z0-9]{2,10}$/.test(actionCode)) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid action_code" }));
          return;
        }
        if (isNaN(periodYear) || periodYear < 2000 || periodYear > 2099) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid period_year" }));
          return;
        }
        if (!periodQuarter || !["Q1", "Q2", "Q3", "Q4"].includes(periodQuarter)) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid period_quarter" }));
          return;
        }
        if (!pdfBuffer || !(pdfBuffer instanceof Buffer) || pdfBuffer.length < 10_240) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            error: `PDF too small: ${pdfBuffer instanceof Buffer ? pdfBuffer.length : 0} bytes (minimum 10240 bytes / 10 KB). Real BCTC PDFs are never under 10 KB.`,
          }));
          return;
        }

        // Check if already done
        const existingRow = db.prepare(
          `SELECT status FROM bctc_vps_queue WHERE action_code = ? AND period_year = ? AND period_quarter = ?`,
        ).get(actionCode, periodYear, periodQuarter) as { status: string } | null;
        if (existingRow?.status === "done") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, skipped: true }));
          return;
        }

        // Write PDF to disk
        const { normaliseFilename } = await import("../../application/usecases/fetchParseAndStoreBctc.js");
        const filename = normaliseFilename(sourceUrl || `${actionCode}.pdf`, actionCode, periodYear, periodQuarter as any);
        const { resolve } = await import("node:path");
        const { mkdirSync, writeFileSync } = await import("node:fs");
        const pdfDir = resolve(process.cwd(), "data", "pdfs");
        mkdirSync(pdfDir, { recursive: true });
        const pdfPath = resolve(pdfDir, filename);
        writeFileSync(pdfPath, pdfBuffer);

        log.info("[push-bctc-pdf] PDF saved", { actionCode, periodYear, periodQuarter, filename, bytes: pdfBuffer.length });
        safeLogVpsPush({ service: "bctc", itemsCount: 1, status: "ok" }, db);

        // Update queue status
        db.prepare(
          `INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, source_url, attempts, last_attempt)
           VALUES (?, ?, ?, 'fetching', ?, 1, datetime('now'))
           ON CONFLICT(action_code, period_year, period_quarter)
           DO UPDATE SET status = 'fetching', source_url = ?, attempts = attempts + 1, last_attempt = datetime('now')`,
        ).run(actionCode, periodYear, periodQuarter, sourceUrl, sourceUrl);

        // Fire-and-forget: trigger BCTC text extraction + parse pipeline.
        // Task 1945d GAP-B fix: the previous implementation called
        // fetchParseAndStoreBctc with only pdfUrl (no pdfTextOverride), which
        // caused it to try downloading from the SSC/VPS URL without auth headers.
        // The geo-blocked download failed silently → financial_reports never written.
        // Fix: extract text locally first via triggerPushBctcExtraction (same
        // pattern as bctcPdfPullJob.triggerExtraction), then call pipeline with
        // pdfTextOverride so the network download step is fully bypassed.
        setImmediate(async () => {
          try {
            const { triggerPushBctcExtraction } = await import("../../scheduler/financial-reports/pushBctcExtraction.js");
            await triggerPushBctcExtraction({
              actionCode,
              year: periodYear,
              quarter: periodQuarter as "Q1" | "Q2" | "Q3" | "Q4",
              filePath: pdfPath,
              filename,
              pdfUrl: sourceUrl || `file://${pdfPath}`,
            });
            db.prepare(
              `UPDATE bctc_vps_queue SET status = 'done' WHERE action_code = ? AND period_year = ? AND period_quarter = ?`,
            ).run(actionCode, periodYear, periodQuarter);
            log.info("[push-bctc-pdf] pipeline complete", { actionCode, periodYear, periodQuarter });
          } catch (err) {
            db.prepare(
              `UPDATE bctc_vps_queue SET status = 'failed' WHERE action_code = ? AND period_year = ? AND period_quarter = ?`,
            ).run(actionCode, periodYear, periodQuarter);
            log.error("[push-bctc-pdf] pipeline failed", {
              actionCode,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        });

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, queued: `${actionCode}-${periodYear}-${periodQuarter}` }));
      } catch (err) {
        // HOTFIX 1288c: Suppress request validation errors (main server just receives)
        // VPS push failures are logged by VPS at line 1415
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Server error" }));
      }
      return;
    }


    // ── Task 1289 — VPS Queue Enrichment Endpoint ────────────────────────────
    // VPS scheduler job POSTs discovered PDF URLs here.
    // Receives: { action_code, period_year, period_quarter, source_url }
    // Updates bctc_vps_queue.source_url for matching item
    if (method === "POST" && pathname === "/api/enrich-queue-item") {
      const apiKey = Bun.env.VPS_PUSH_API_KEY;
      const authHeader = req.headers["x-api-key"] || req.headers["authorization"]?.replace("Bearer ", "");
      if (!apiKey || authHeader !== apiKey) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }

      let body = "";
      for await (const chunk of req) body += chunk;
      try {
        const payload = JSON.parse(body) as Record<string, unknown>;

        const actionCode = payload.action_code;
        const periodYear = payload.period_year;
        const periodQuarter = payload.period_quarter;
        const sourceUrl = payload.source_url;

        if (typeof actionCode !== "string" || !actionCode) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing required field: action_code (string)" }));
          return;
        }
        if (typeof periodYear !== "number" || periodYear < 2000) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing required field: period_year (number)" }));
          return;
        }
        if (typeof periodQuarter !== "string" || !periodQuarter) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing required field: period_quarter (string)" }));
          return;
        }
        if (typeof sourceUrl !== "string" || !sourceUrl) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing required field: source_url (string)" }));
          return;
        }

        const stmt = db.prepare(
          `UPDATE bctc_vps_queue
           SET source_url = ?
           WHERE action_code = ? AND period_year = ? AND period_quarter = ? AND source_url IS NULL`
        );
        const result = stmt.run(sourceUrl, actionCode, periodYear, periodQuarter);

        log.info("[enrich-queue-item] URL enriched", {
          actionCode,
          periodYear,
          periodQuarter,
          sourceUrl,
          updated: (result.changes ?? 0) > 0,
        });

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, updated: (result.changes ?? 0) > 0 }));
      } catch (err) {
        log.error("[enrich-queue-item] error", {
          error: err instanceof Error ? err.message : String(err),
        });
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Server error" }));
      }
      return;
    }


    // ── Push OHLCV history from VPS one-time backfill script ────────────────
    if (method === "POST" && pathname === "/api/push-ohlcv-history") {
      const apiKey = Bun.env.VPS_PUSH_API_KEY;
      const authHeader = req.headers["x-api-key"] || req.headers["authorization"]?.replace("Bearer ", "");
      if (!apiKey || authHeader !== apiKey) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }

      let body = "";
      for await (const chunk of req) body += chunk;
      try {
        const parsed: unknown = JSON.parse(body);
        const payload = parsed as Record<string, unknown>;

        if (typeof payload.code !== "string" || !payload.code) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing required field: code (string)" }));
          return;
        }

        if (!Array.isArray(payload.bars)) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing required field: bars (array)" }));
          return;
        }

        const code = payload.code;
        const bars = payload.bars as Record<string, unknown>[];

        if (bars.length === 0) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, inserted: 0, code }));
          return;
        }

        const now = new Date().toISOString();
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        let inserted = 0;
        const upsertAll = db.transaction(() => {
          for (const bar of bars) {
            const open  = typeof bar.open  === "number" ? bar.open  : 0;
            const close = typeof bar.close === "number" ? bar.close : 0;
            if (open <= 0 || close <= 0) continue;
            const date   = typeof bar.date   === "string" ? bar.date   : "";
            const high   = typeof bar.high   === "number" ? bar.high   : open;
            const low    = typeof bar.low    === "number" ? bar.low    : open;
            const volume = typeof bar.volume === "number" ? bar.volume : 0;
            stmt.run(code, date, open, high, low, close, volume, now);
            inserted++;
          }
        });
        upsertAll();

        log.info("[push-ohlcv-history] inserted bars", { code, count: inserted });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, inserted, code }));
      } catch (err) {
        log.error("[push-ohlcv-history] parse error", { error: err instanceof Error ? err.message : String(err) });
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
      return;
    }

    // ── Task 1361: GET /api/ohlcv-backfill-queue — VPS polls for pending backfill ──
    if (method === "GET" && pathname === "/api/ohlcv-backfill-queue") {
      const apiKey = Bun.env.VPS_PUSH_API_KEY;
      const authHeader = req.headers["x-api-key"] || req.headers["authorization"]?.replace("Bearer ", "");
      if (!apiKey || authHeader !== apiKey) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }
      try {
        const row = db.prepare<{ id: number }, []>(
          "SELECT id FROM ohlcv_backfill_queue WHERE done = 0 LIMIT 1"
        ).get();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ pending: row !== null }));
      } catch (err) {
        log.error("[ohlcv-backfill-queue] error", { error: err instanceof Error ? err.message : String(err) });
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Server error" }));
      }
      return;
    }

    // ── GET /api/signals/stock/:code — per-stock agent signals for frontend ────
    // Returns last N agent_signals rows for a specific stock_code.
    // Non-authenticated — read-only query, no sensitive data.
    if (method === "GET" && pathname.startsWith("/api/signals/stock/")) {
      const code = decodeURIComponent((pathname.slice("/api/signals/stock/".length).split("?")[0]) ?? "");
      const limitParam = url.searchParams.get("limit");
      const limit = Math.min(Math.max(1, parseInt(limitParam ?? "10", 10) || 10), 50);

      if (!code) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing stock code" }));
        return;
      }

      try {
        // Check which optional columns exist (schema evolution guard)
        let hasConfidenceScore = false;
        let hasFindingData = false;
        try {
          db.prepare("SELECT confidence_score FROM agent_signals LIMIT 0").all();
          hasConfidenceScore = true;
        } catch { /* column absent — older schema */ }
        try {
          db.prepare("SELECT finding_data FROM agent_signals LIMIT 0").all();
          hasFindingData = true;
        } catch { /* column absent */ }

        const confidenceCol = hasConfidenceScore ? ", confidence_score" : "";
        const findingCol = hasFindingData ? ", finding_data" : "";

        type SignalRow = {
          id: number;
          stock_code: string | null;
          signal_type: string;
          payload: string;
          created_at: string;
          confidence_score?: number;
          finding_data?: string | null;
        };

        const rows = db
          .prepare<SignalRow, [string, number]>(
            `SELECT id, stock_code, signal_type, payload, created_at${confidenceCol}${findingCol}
             FROM agent_signals
             WHERE stock_code = ?
             ORDER BY created_at DESC
             LIMIT ?`,
          )
          .all(code, limit) as SignalRow[];

        // Shape each row for the frontend: extract direction + detail from payload/finding_data
        const signals = rows.map((row) => {
          let payload: Record<string, unknown> = {};
          let findingData: Record<string, unknown> = {};
          try { payload = JSON.parse(row.payload) as Record<string, unknown>; } catch {}
          if (row.finding_data) {
            try { findingData = JSON.parse(row.finding_data) as Record<string, unknown>; } catch {}
          }

          const direction =
            typeof findingData["direction"] === "string" ? findingData["direction"] :
            typeof findingData["catalyst_direction"] === "string" ? findingData["catalyst_direction"] :
            typeof payload["direction"] === "string" ? payload["direction"] :
            "NEUTRAL";

          const detail =
            typeof payload["detail"] === "string" ? payload["detail"] :
            typeof findingData["summary"] === "string" ? findingData["summary"] :
            typeof payload["title"] === "string" ? payload["title"] :
            "";

          return {
            id: row.id,
            stock_code: row.stock_code,
            signal_type: row.signal_type,
            direction,
            confidence_score: row.confidence_score ?? 50,
            detail,
            created_at: row.created_at,
          };
        });

        // Build accuracy map: one entry per distinct signal_type in returned signals.
        // Guard: if signal_outcomes table does not exist yet, skip accuracy key.
        let accuracy: Record<string, { accuracy_rate: number | null; sample_count: number }> = {};
        try {
          db.prepare("SELECT id FROM signal_outcomes LIMIT 0").all();
          // Table exists — query accuracy stats for this stock
          const accuracyRows = getAccuracyStats(db, { stockCode: code, days: 30 });
          const distinctTypes = [...new Set(signals.map((s) => s.signal_type))];
          for (const signalType of distinctTypes) {
            const row = accuracyRows.find((r) => r.signal_type === signalType);
            accuracy[signalType] = {
              accuracy_rate: row?.accuracy_rate ?? null,
              sample_count: row?.sample_count ?? 0,
            };
          }
        } catch {
          // signal_outcomes table absent — skip accuracy map
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ signals, code, count: signals.length, accuracy }));
      } catch (err) {
        log.error("[signals/stock] query error", { error: err instanceof Error ? err.message : String(err) });
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Server error" }));
      }
      return;
    }

    // ── GET /api/accuracy/digest — system-level accuracy digest for frontend ─
    // Returns getSystemAccuracyDigestStats aggregated over `days` look-back.
    // Non-authenticated — read-only, no sensitive data.
    // days param: integer, default 30, clamped [1, 90] (R-4).
    if (method === "GET" && pathname === "/api/accuracy/digest") {
      const daysParam = url.searchParams.get("days");
      const _daysParsed = parseInt(daysParam ?? "30", 10);
      const days = Math.min(Math.max(isNaN(_daysParsed) ? 30 : _daysParsed, 1), 90);
      try {
        const stats = getSystemAccuracyDigestStats(db, days);
        const body = { ...stats, generatedAt: new Date().toISOString() };
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(body));
      } catch (err) {
        log.error("[accuracy/digest] query error", { error: err instanceof Error ? err.message : String(err) });
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "internal error" }));
      }
      return;
    }

    // ── Task 1361: POST /api/ohlcv-backfill-done — VPS signals backfill complete ──
    if (method === "POST" && pathname === "/api/ohlcv-backfill-done") {
      const apiKey = Bun.env.VPS_PUSH_API_KEY;
      const authHeader = req.headers["x-api-key"] || req.headers["authorization"]?.replace("Bearer ", "");
      if (!apiKey || authHeader !== apiKey) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }
      try {
        db.prepare(
          "UPDATE ohlcv_backfill_queue SET done = 1 WHERE done = 0"
        ).run();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        log.error("[ohlcv-backfill-done] error", { error: err instanceof Error ? err.message : String(err) });
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Server error" }));
      }
      return;
    }

    // ── Task 1494: POST /api/push-reuters — VPS RSS push ─────────────────
    if (method === "POST" && pathname === "/api/push-reuters") {
      const apiKey = Bun.env.VPS_PUSH_API_KEY;
      const authHeader = req.headers["x-api-key"] || req.headers["authorization"]?.replace("Bearer ", "");
      if (!apiKey || authHeader !== apiKey) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }

      let body = "";
      for await (const chunk of req) body += chunk;
      try {
        const payload = JSON.parse(body) as { items?: unknown };
        const rawItems = Array.isArray(payload?.items) ? payload.items : [];

        const stmt = db.prepare(`
          INSERT OR IGNORE INTO rag_analyses
            (id, created_at, level, source_url, source_title, source_type,
             published_at, sentiment, impact_score, impact_direction, confidence,
             time_horizon, summary, reasoning, affected_countries, affected_domains,
             affected_actions, parent_ids, tags, embedding_text)
          VALUES
            (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
        `);

        let inserted = 0;
        let duplicate = 0;
        const now = new Date().toISOString();

        for (const raw of rawItems as Record<string, unknown>[]) {
          const url = typeof raw.url === "string" ? raw.url : null;
          const title = typeof raw.title === "string" ? raw.title : "";
          const publishedAt = typeof raw.published_at === "string" ? raw.published_at : now;
          // Use crypto hash of url (or title+now) so IDs are unique even for similar URLs
          const hashInput = url ?? (title + now);
          const hashBuf = new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(hashInput)));
          const hashHex = Array.from(hashBuf).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
          const id = `reuters-${hashHex}`;

          const result = stmt.run(
            id, now, "global",
            url, title, "news",
            publishedAt, "neutral", null, "neutral", null,
            "short", title, null,
            JSON.stringify(["VN"]), JSON.stringify([]), JSON.stringify([]),
            JSON.stringify([]), JSON.stringify(["reuters"]),
          );
          if ((result.changes as number) > 0) {
            inserted++;
          } else {
            duplicate++;
          }
        }

        log.info("[push-reuters] items processed", { inserted, duplicate });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, inserted, duplicate }));
      } catch (err) {
        log.error("[push-reuters] error", { error: err instanceof Error ? err.message : String(err) });
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
      return;
    }

    // ── Task 1495: POST /api/push-tradingeconomics — VPS macro push ──────────
    if (method === "POST" && pathname === "/api/push-tradingeconomics") {
      const apiKey = Bun.env.VPS_PUSH_API_KEY;
      const authHeader = req.headers["x-api-key"] || req.headers["authorization"]?.replace("Bearer ", "");
      if (!apiKey || authHeader !== apiKey) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }
      let body = "";
      for await (const chunk of req) body += chunk;
      try {
        const payload = JSON.parse(body) as {
          country?: string;
          indicators?: Array<{ name: string; value: number; unit?: string; fetched_at?: string }>;
        };
        const country = typeof payload.country === "string" ? payload.country : "VN";
        const rawIndicators = Array.isArray(payload.indicators) ? payload.indicators : [];

        // Allowlist: maps TE indicator name → macro_indicators column
        const TE_COLUMN_MAP: Record<string, string> = {
          cpi:                 "cpi",
          gdp_growth:          "gdp_growth",
          interest_rate:       "interest_rate",
          unemployment_rate:   "unemployment_rate",
          inflation_rate:      "inflation_rate",
          trade_balance:       "trade_balance",
          current_account:     "current_account",
          government_debt:     "government_debt",
          budget_deficit:      "budget_deficit",
          manufacturing_pmi:   "manufacturing_pmi",
          consumer_confidence: "consumer_confidence",
          retail_sales:        "retail_sales",
        };

        // Filter to known columns only
        const known = rawIndicators.filter(
          (i) => typeof i.name === "string" && i.name in TE_COLUMN_MAP && typeof i.value === "number"
        );

        const now = new Date().toISOString();

        if (known.length === 0) {
          // Ensure row exists for country; upsert with no col updates
          db.prepare(
            `INSERT INTO macro_indicators (country, fetched_at) VALUES (?, ?)
             ON CONFLICT(country) DO UPDATE SET fetched_at = excluded.fetched_at`
          ).run(country, now);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, country, updated_cols: 0 }));
          return;
        }

        // Build dynamic UPDATE SET clause (safe: keys are from TE_COLUMN_MAP only)
        const setClauses = known.map((i) => `${TE_COLUMN_MAP[i.name]} = ?`).join(", ");
        const values = known.map((i) => i.value);

        // Upsert: insert or update on conflict
        db.prepare(
          `INSERT INTO macro_indicators (country, fetched_at) VALUES (?, ?)
           ON CONFLICT(country) DO UPDATE SET fetched_at = excluded.fetched_at`
        ).run(country, now);
        db.prepare(
          `UPDATE macro_indicators SET ${setClauses}, fetched_at = ? WHERE country = ?`
        ).run(...values, now, country);

        log.info("[push-tradingeconomics] updated macro_indicators", { country, updated_cols: known.length });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, country, updated_cols: known.length }));
      } catch (err) {
        log.error("[push-tradingeconomics] error", { error: err instanceof Error ? err.message : String(err) });
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
      return;
    }

    // ── Task 1499: POST /api/push-gso — VPS GSO macro push ────────────────
    if (method === "POST" && pathname === "/api/push-gso") {
      const apiKey = Bun.env.VPS_PUSH_API_KEY;
      const authHeader = req.headers["x-api-key"] || req.headers["authorization"]?.replace("Bearer ", "");
      if (!apiKey || authHeader !== apiKey) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }
      let body = "";
      for await (const chunk of req) body += chunk;
      let payload: { country?: string; indicators?: unknown };
      try {
        payload = JSON.parse(body) as { country?: string; indicators?: unknown };
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
        return;
      }
      if (!Array.isArray(payload.indicators)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "indicators must be an array" }));
        return;
      }
      const country = typeof payload.country === "string" ? payload.country : "VN";
      const rawIndicators = payload.indicators as Array<{ name: string; value: number; unit?: string; fetched_at?: string }>;

      // Allowlist: GSO indicator name → macro_indicators column
      const GSO_ALLOWED_COLS: Record<string, string> = {
        cpi:                 "cpi",
        gdp_growth:          "gdp_growth",
        unemployment_rate:   "unemployment_rate",
        inflation_rate:      "inflation_rate",
        retail_sales:        "retail_sales",
        trade_balance:       "trade_balance",
        consumer_confidence: "consumer_confidence",
        manufacturing_pmi:   "manufacturing_pmi",
        government_debt:     "government_debt",
        budget_deficit:      "budget_deficit",
        current_account:     "current_account",
      };

      // Filter to known columns only; unknown cols are silently ignored
      const known = rawIndicators.filter(
        (i) => typeof i.name === "string" && i.name in GSO_ALLOWED_COLS && typeof i.value === "number"
      );

      const now = new Date().toISOString();

      // INSERT OR IGNORE to create row if absent (preserves existing columns)
      db.prepare(
        `INSERT OR IGNORE INTO macro_indicators (country, fetched_at) VALUES (?, ?)`
      ).run(country, now);

      if (known.length > 0) {
        // Dynamic UPDATE: only update known GSO columns + fetched_at
        const setClauses = known.map((i) => `${GSO_ALLOWED_COLS[i.name]} = ?`).join(", ");
        const values = known.map((i) => i.value);
        db.prepare(
          `UPDATE macro_indicators SET ${setClauses}, fetched_at = ? WHERE country = ?`
        ).run(...values, now, country);
      } else {
        // No known cols — still update fetched_at to mark row as refreshed
        db.prepare(
          `UPDATE macro_indicators SET fetched_at = ? WHERE country = ?`
        ).run(now, country);
      }

      log.info("[push-gso] upserted macro_indicators", { country, updated_cols: known.length });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, country, upserted: true }));
      return;
    }

    // ── POST /api/trigger-bctc-debug — manual BCTC fetch debug trigger ───────
    if (method === "POST" && pathname === "/api/trigger-bctc-debug") {
      const apiKey = Bun.env.VPS_PUSH_API_KEY;
      const authHeader = req.headers["x-api-key"] || req.headers["authorization"]?.replace("Bearer ", "");
      if (!apiKey || authHeader !== apiKey) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }

      let body = "";
      for await (const chunk of req) body += chunk;

      let payload: { tickers?: string[]; verbose?: boolean; dry_run?: boolean } = {};
      if (body.trim()) {
        try {
          payload = JSON.parse(body) as typeof payload;
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid JSON body" }));
          return;
        }
      }

      try {
        const { handleTriggerBctcDebug } = await import("./bctcDebugTriggerHandler.js");
        const result = await handleTriggerBctcDebug(
          {
            tickers: Array.isArray(payload.tickers) ? payload.tickers : undefined,
            verbose: payload.verbose !== false,
            dry_run: payload.dry_run === true,
          },
          db,
        );

        // If live mode, queue SSH trigger (fire-and-forget, non-blocking)
        if (!result.dry_run) {
          const vinahostIp = Bun.env["VINAHOST_IP"];
          if (vinahostIp) {
            const tickerArgs =
              Array.isArray(payload.tickers) && payload.tickers.length > 0
                ? payload.tickers.map((t) => `--ticker ${t}`).join(" ")
                : "";
            const verboseFlag = payload.verbose !== false ? "--verbose" : "";
            const cmd = `ssh root@${vinahostIp} /root/run-bctc-debug.sh ${tickerArgs} ${verboseFlag}`.trim();
            result.log_tail += `\n[SSH] Command: ${cmd}`;
            log.info("[trigger-bctc-debug] SSH trigger queued", { cmd });
          } else {
            result.log_tail += `\n[WARN] VINAHOST_IP not set — SSH trigger skipped`;
            log.warn("[trigger-bctc-debug] VINAHOST_IP not set, skipping SSH");
          }
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (err) {
        log.error("[trigger-bctc-debug] handler error", {
          error: err instanceof Error ? err.message : String(err),
        });
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
      }
      return;
    }

    // ── POST /api/trigger-price-debug — manual price fetch debug trigger ────
    if (method === "POST" && pathname === "/api/trigger-price-debug") {
      const apiKey = Bun.env.VPS_PUSH_API_KEY;
      const authHeader = req.headers["x-api-key"] || req.headers["authorization"]?.replace("Bearer ", "");
      if (!apiKey || authHeader !== apiKey) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }

      let body = "";
      for await (const chunk of req) body += chunk;

      let payload: { tickers?: string[]; verbose?: boolean; dry_run?: boolean } = {};
      if (body.trim()) {
        try {
          payload = JSON.parse(body) as typeof payload;
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid JSON body" }));
          return;
        }
      }

      try {
        const { handleTriggerPriceDebug } = await import("./priceDebugTriggerHandler.js");
        const result = await handleTriggerPriceDebug({
          tickers: Array.isArray(payload.tickers) ? payload.tickers : undefined,
          verbose: payload.verbose !== false,
          dry_run: payload.dry_run === true,
        });

        if (!result.dry_run) {
          const vinahostIp = Bun.env["VINAHOST_IP"];
          if (vinahostIp) {
            const tickerArgs =
              Array.isArray(payload.tickers) && payload.tickers.length > 0
                ? payload.tickers.map((t) => `--ticker ${t}`).join(" ")
                : "";
            const verboseFlag = payload.verbose !== false ? "--verbose" : "";
            const cmd = `ssh root@${vinahostIp} /root/run-price-debug.sh ${tickerArgs} ${verboseFlag}`.trim();
            result.log_tail += `\n[SSH] Command: ${cmd}`;
            log.info("[trigger-price-debug] SSH trigger queued", { cmd });
          } else {
            result.log_tail += `\n[WARN] VINAHOST_IP not set — SSH trigger skipped`;
            log.warn("[trigger-price-debug] VINAHOST_IP not set, skipping SSH");
          }
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (err) {
        log.error("[trigger-price-debug] handler error", {
          error: err instanceof Error ? err.message : String(err),
        });
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
      }
      return;
    }

    // ── POST /api/trigger-news-debug — manual news fetch debug trigger ───────
    if (method === "POST" && pathname === "/api/trigger-news-debug") {
      const apiKey = Bun.env.VPS_PUSH_API_KEY;
      const authHeader = req.headers["x-api-key"] || req.headers["authorization"]?.replace("Bearer ", "");
      if (!apiKey || authHeader !== apiKey) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }

      let body = "";
      for await (const chunk of req) body += chunk;

      let payload: { verbose?: boolean; dry_run?: boolean } = {};
      if (body.trim()) {
        try {
          payload = JSON.parse(body) as typeof payload;
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid JSON body" }));
          return;
        }
      }

      try {
        const { handleTriggerNewsDebug } = await import("./newsDebugTriggerHandler.js");
        const result = await handleTriggerNewsDebug({
          verbose: payload.verbose !== false,
          dry_run: payload.dry_run === true,
        });

        if (!result.dry_run) {
          const vinahostIp = Bun.env["VINAHOST_IP"];
          if (vinahostIp) {
            const verboseFlag = payload.verbose !== false ? "--verbose" : "";
            const cmd = `ssh root@${vinahostIp} /root/run-news-debug.sh ${verboseFlag}`.trim();
            result.log_tail += `\n[SSH] Command: ${cmd}`;
            log.info("[trigger-news-debug] SSH trigger queued", { cmd });
          } else {
            result.log_tail += `\n[WARN] VINAHOST_IP not set — SSH trigger skipped`;
            log.warn("[trigger-news-debug] VINAHOST_IP not set, skipping SSH");
          }
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (err) {
        log.error("[trigger-news-debug] handler error", {
          error: err instanceof Error ? err.message : String(err),
        });
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
      }
      return;
    }

    // ── POST /api/trigger-sbv-debug — manual SBV/FX rate debug trigger ───────
    if (method === "POST" && pathname === "/api/trigger-sbv-debug") {
      const apiKey = Bun.env.VPS_PUSH_API_KEY;
      const authHeader = req.headers["x-api-key"] || req.headers["authorization"]?.replace("Bearer ", "");
      if (!apiKey || authHeader !== apiKey) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }

      let body = "";
      for await (const chunk of req) body += chunk;

      let payload: { verbose?: boolean; dry_run?: boolean } = {};
      if (body.trim()) {
        try {
          payload = JSON.parse(body) as typeof payload;
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid JSON body" }));
          return;
        }
      }

      try {
        const { handleTriggerSbvDebug } = await import("./sbvDebugTriggerHandler.js");
        const result = await handleTriggerSbvDebug({
          verbose: payload.verbose !== false,
          dry_run: payload.dry_run === true,
        });

        if (!result.dry_run) {
          const vinahostIp = Bun.env["VINAHOST_IP"];
          if (vinahostIp) {
            const verboseFlag = payload.verbose !== false ? "--verbose" : "";
            const cmd = `ssh root@${vinahostIp} /root/run-sbv-debug.sh ${verboseFlag}`.trim();
            result.log_tail += `\n[SSH] Command: ${cmd}`;
            log.info("[trigger-sbv-debug] SSH trigger queued", { cmd });
          } else {
            result.log_tail += `\n[WARN] VINAHOST_IP not set — SSH trigger skipped`;
            log.warn("[trigger-sbv-debug] VINAHOST_IP not set, skipping SSH");
          }
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (err) {
        log.error("[trigger-sbv-debug] handler error", {
          error: err instanceof Error ? err.message : String(err),
        });
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
      }
      return;
    }

    // ── POST /api/trigger-foreign-flow-debug — manual foreign flow debug trigger
    if (method === "POST" && pathname === "/api/trigger-foreign-flow-debug") {
      const apiKey = Bun.env.VPS_PUSH_API_KEY;
      const authHeader = req.headers["x-api-key"] || req.headers["authorization"]?.replace("Bearer ", "");
      if (!apiKey || authHeader !== apiKey) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }

      let body = "";
      for await (const chunk of req) body += chunk;

      let payload: { tickers?: string[]; verbose?: boolean; dry_run?: boolean } = {};
      if (body.trim()) {
        try {
          payload = JSON.parse(body) as typeof payload;
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid JSON body" }));
          return;
        }
      }

      try {
        const { handleTriggerForeignFlowDebug } = await import("./foreignFlowDebugTriggerHandler.js");
        const result = await handleTriggerForeignFlowDebug({
          tickers: Array.isArray(payload.tickers) ? payload.tickers : undefined,
          verbose: payload.verbose !== false,
          dry_run: payload.dry_run === true,
        });

        if (!result.dry_run) {
          const vinahostIp = Bun.env["VINAHOST_IP"];
          if (vinahostIp) {
            const tickerArgs =
              Array.isArray(payload.tickers) && payload.tickers.length > 0
                ? payload.tickers.map((t) => `--ticker ${t}`).join(" ")
                : "";
            const verboseFlag = payload.verbose !== false ? "--verbose" : "";
            const cmd = `ssh root@${vinahostIp} /root/run-foreign-flow-debug.sh ${tickerArgs} ${verboseFlag}`.trim();
            result.log_tail += `\n[SSH] Command: ${cmd}`;
            log.info("[trigger-foreign-flow-debug] SSH trigger queued", { cmd });
          } else {
            result.log_tail += `\n[WARN] VINAHOST_IP not set — SSH trigger skipped`;
            log.warn("[trigger-foreign-flow-debug] VINAHOST_IP not set, skipping SSH");
          }
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (err) {
        log.error("[trigger-foreign-flow-debug] handler error", {
          error: err instanceof Error ? err.message : String(err),
        });
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
      }
      return;
    }

    // ── 404 ───────────────────────────────────────────────────────────────
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found", path: pathname }));
  }

  // ── Start node:http server ──────────────────────────────────────────────
  const httpServer = createServer((req, res) => {
    handleRequest(req, res).catch((err) => {
      log.error("[createBunServer] Unhandled request error", {
        error: err instanceof Error ? err.message : String(err),
      });
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
      }
    });
  });

  // Wait until the server is bound and ready
  await new Promise<void>((resolve, reject) => {
    httpServer.on("error", reject);
    httpServer.listen(port, host, () => {
      // When port 0 was requested the OS assigns an ephemeral port; read it back.
      const addr = httpServer.address();
      const boundPort = addr && typeof addr === "object" ? addr.port : port;
      log.info("[createBunServer] MCP server ready", { port: boundPort, host });
      resolve();
    });
  });

  // Read the actual bound port (may differ from requested port when port=0)
  const addr = httpServer.address();
  const boundPort = addr && typeof addr === "object" ? addr.port : port;

  // ── Return the instance handle ──────────────────────────────────────────
  return {
    port: boundPort,
    toolCount,
    close(): Promise<void> {
      return new Promise<void>((resolve, reject) => {
        httpServer.close((err) => {
          if (err) {
            reject(err);
          } else {
            log.info("[createBunServer] HTTP server closed");
            resolve();
          }
        });
      });
    },
  };
}
