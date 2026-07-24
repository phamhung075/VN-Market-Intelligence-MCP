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
import { Readable } from "node:stream";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
// FIX-MCP-500-SYMBOL-TO-STRING: use WebStandardStreamableHTTPServerTransport directly.
// StreamableHTTPServerTransport wraps @hono/node-server which uses 13 Symbol-keyed
// prototype properties on its fake Request object. Under Bun 1.3.13 JIT corruption
// (triggered after ~80 min heavy processing), accessing those Symbol keys attempts a
// Symbol→string coercion that throws TypeError "Cannot convert a symbol to a string".
// WebStandardStreamableHTTPServerTransport uses native Bun Web Standard APIs (no hono),
// eliminating the Symbol-keyed property access from the /mcp hot path entirely.
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { loadConfig } from "../../infrastructure/config.js";
import { createLogger } from "../../infrastructure/logger.js";
import { SseSessionManager } from "./transport.js";
import { sendTelegramWork } from "../../infrastructure/notifiers/telegram.js";
import { getDb } from "../../infrastructure/db/schema.js";
import { toolRegistry } from "./tools/registry.js";
import { getToolsForSkills } from "./bootstrap/agentBootstrap.js";
import { sessionToolCache } from "../../infrastructure/cache/sessionToolCache.js";
export { sessionToolCache } from "../../infrastructure/cache/sessionToolCache.js";
import { incrementTool } from "../../infrastructure/telemetry/perCallCounterStore.js";
import { buildForeignFlowStatusResponse } from "./foreignFlowStatusHandler.js";
import { ensurePoisonedQueueCleanup } from "./server-startup.js";
import { startPeriodicReaper } from "../../infrastructure/db/coordinationStore.js";
export {
  _staleTickers_lastNotifiedDate,
  _resetStaleTickers_lastNotifiedDate,
  isVnTradingWindowUtc,
} from "./server-startup.js";
import { handlePushPrices } from "./routes/pushPricesHandler.js";
import { handlePushForeignFlow } from "./routes/pushForeignFlowHandler.js";
import { requireVpsApiKey } from "./routes/_shared/requireVpsApiKey.js";
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
  handleBctcInspectPageImage,
  handleBctcInspectPageWindow,
} from "./routes/bctcInspectHandler.js";
import { handlePushBctcTable } from "./routes/pushBctcTableHandler.js";
import { handlePushBctcMdTables } from "./routes/pushBctcMdTablesHandler.js";
import { handleBctcInspectMd } from "./routes/bctcInspectMdHandler.js";
import { handlePushBctcLayout } from "./routes/pushBctcLayoutHandler.js";
import { backfillBctcPdfPaths } from "../../application/usecases/backfillBctcPdfPaths.js";
import { getAccuracyStats, getSystemAccuracyDigestStats } from "../../infrastructure/db/signalOutcomeStore.js";
import { handleBctcEvalList } from "./routes/bctcEvalListHandler.js";
import { handleBctcEvalDetail } from "./routes/bctcEvalDetailHandler.js";
import { handleBctcEvalRecompute } from "./routes/bctcEvalRecomputeHandler.js";
import { handleBctcEvalThresholds } from "./routes/bctcEvalThresholdsHandler.js";
import { handleBctcEvalPushStage } from "./routes/bctcEvalPushStageHandler.js";
import { bctcEvalPageHandler } from "./routes/bctcEvalPageHandler.js";
import { loadBctcEvalThresholds } from "../../application/usecases/computeBctcEval.js";
import { handleBctcRefineOnDemand } from "./routes/bctcRefineHandler.js"; // BCTC-AGENTIC-REFINE FR-12: POST /api/refine-bctc/{report_id}
import { handleBctcInspectFlags } from "./routes/bctcFlagsHandler.js"; // HC-DEV-3: GET /api/bctc-inspect/flags/{doc_id}
import { handleBctcInspectCorrect } from "./routes/bctcCorrectHandler.js"; // HC-DEV-3: POST /api/bctc-inspect/correct/{doc_id}
import { handleBctcInspectConfirm, handleBctcInspectConfirmReset } from "./routes/bctcConfirmHandler.js"; // HC-DEV-3: POST /api/bctc-inspect/confirm/{doc_id}[/reset]
import { handleGetOrchestration } from "./routes/orchestrationHandler.js"; // OSC-4a: GET /api/orchestration
import { handleGetCronStatus } from "./routes/cronStatusHandler.js"; // TASK-DASH-CRON-1: GET /api/cron-status
import { getOrchStatePath } from "../../infrastructure/orchStateStore.js";
import { handleGetQualityChecklist } from "./routes/qualityChecklistHandler.js"; // QUALITY-AUDIT Phase 1: GET /api/quality-checklist
// FE-REROUTE Phase 1+2: new REST read endpoints for frontend pages (FE-RR-1..6 + FE-RR-13/14)
import { handleKinhDichReading } from "./routes/kinhDichReadingHandler.js";
import { handleKinhDichMarket } from "./routes/kinhDichMarketHandler.js";
import { handlePriceHistory } from "./routes/priceHistoryHandler.js";
import { handlePriceBatch } from "./routes/priceBatchHandler.js";
import { handleNewsHeadlines } from "./routes/newsHeadlinesHandler.js";
import { handleVpsProxyHealth } from "./routes/vpsProxyHealthHandler.js";
import { handleFetchStatus } from "./routes/fetchStatusHandler.js";
import { handlePushSbvRates } from "./routes/pushSbvRatesHandler.js";
// MAW-P0-2: GET /api/market-digest — last 3 CHEF synthesis dishes
import { handleGetMarketDigest } from "./routes/marketDigestHandler.js";
// MAW-P0-3: GET /api/analysis-brief/:ticker — per-ticker analysis brief
import { handleGetAnalysisBrief } from "./routes/analysisBriefHandler.js";
// TASK-17 P1-3a: GET /api/analysis-briefs — catalogue index of all briefs
import { handleGetAnalysisBriefIndex } from "./routes/analysisBriefIndexHandler.js";
// MAW-P1-1a: GET /api/news-sentiment — synthesised news + sentiment items
import { handleGetNewsSentiment } from "./routes/newsSentimentHandler.js";
// TASK-17 P1-2a: GET /api/macro-regime — macro snapshot reshaped for frontend
import { handleGetMacroRegime } from "./routes/macroRegimeHandler.js";
// IND-P1-MCP-REST-GAUGES-ENDPOINT: GET /api/indicator-gauges — 5 P0 indicators aggregated
import { handleGetIndicatorGauges } from "./routes/indicatorGaugesHandler.js";
// TASK-501-MOMENTUM-API-HANDLER: GET /api/momentum-indicators — 4 P1 momentum sources aggregated
import { handleGetMomentumIndicators } from "./routes/momentumIndicatorsHandler.js";
// MONEY-RADAR-P0-T3B-REST-API: GET /api/money-radar — Money Radar composite score REST bridge
import { handleGetMoneyRadar } from "./routes/moneyRadarHandler.js";
// TASK-17 P2-1a: GET /api/price-history/:ticker — OHLC history DTO for frontend
import { handleGetPriceHistory } from "./routes/priceHistoryServeHandler.js";
// TASK-17 Alerts ENDPOINT WAVE: GET /api/alerts — live alerts table for dashboard
import { handleGetAlerts } from "./routes/alertsHandler.js";
// TASK17-FOREIGN-FLOW: GET /api/foreign-flow — latest-day foreign net buy/sell
import { handleGetForeignFlow } from "./routes/foreignFlowHandler.js";
// TASK17-AGM: GET /api/agm-plan-actual — AGM plan-vs-actual delivery analysis
import { handleGetAgmPlanActual } from "./routes/agmPlanActualHandler.js";
// TASK17-PRED: GET /api/prediction-claims — AI prediction accountability / calibration ledger
import { handleGetPredictionClaims } from "./routes/predictionClaimsHandler.js";
// TASK17-CONVICTION: GET /api/conviction-history — AI conviction tracker per stock
import { handleGetConvictionHistory } from "./routes/convictionHistoryHandler.js";
// TASK17-SUMMARIES: GET /api/market-summaries — CHEF daily/weekly/monthly synthesised market intelligence archive
import { handleGetMarketSummaries } from "./routes/marketSummaryHandler.js";
// TASK17-PAGE9: GET /api/sector-rotation — Sector Money Flow ("Dòng tiền theo ngành"), stored-data-only
import { handleGetSectorRotation } from "./routes/sectorRotationHandler.js";
// TASK17-PAGE10: GET /api/sector-cascade — Sector Cascade Signals ("Tín hiệu dây chuyền theo ngành"), stored-data-only
import { handleGetSectorCascade } from "./routes/cascadeSignalHandler.js";
// TASK17-PAGE11: GET /api/kinh-dich-signals — Kinh Dịch hexagram trading signals per stock, stored-data-only
import { handleGetKinhDichSignals } from "./routes/kinhDichSignalsHandler.js";
// TASK17-PAGE12: GET /api/global-markets — Global Market Context / World Risk Barometer, stored-data-only
import { handleGetGlobalMarkets } from "./routes/globalMarketsHandler.js";
// TASK17-PAGE13: GET /api/corporate-events — Recent Corporate Actions Monitor, stored-data-only
import { handleGetCorporateEvents } from "./routes/corporateEventsHandler.js";
// TASK17-PAGE14: GET /api/shareholders — Major-holder ownership structure snapshot, stored-data-only
import { handleGetShareholdersHttp } from "./routes/shareholdersHandler.js";
// TASK17-PAGE15: GET /api/officers — Board of Directors & Management ("Ban lãnh đạo & quản trị"), stored-data-only
import { handleGetOfficersHttp } from "./routes/officersHandler.js";
// TASK17-PAGE16: GET /api/financials — Cross-sectional Valuation & Fundamentals Screener, stored-data-only
import { handleGetFinancialsHttp } from "./routes/financialsHandler.js";
// TASK17-PAGE17: GET /api/fed-rates — US Fed EFFR/IORB liquidity spread time-series
import { handleGetFedRatesHttp } from "./routes/fedRatesHandler.js";
// TASK17-PAGE18: GET /api/reputation — Corporate-reputation (news-sentiment) risk leaderboard
import { handleGetReputationHttp } from "./routes/reputationHandler.js";
// TASK17-PAGE19: GET /api/news-buzz — News-buzz / mention-velocity leaderboard
import { handleGetNewsBuzzHttp } from "./routes/newsBuzzHandler.js";
// FIX-SIGNALS-STOCK-FULL-DETAIL: full finding_data + ISO created_at for GET /api/signals/stock/:code
import { querySignalsForStock } from "./routes/stockSignalsHandler.js";
// FACTORY-INTERFACE-split-server-ts Stage 1: ops debug-trigger routes (trigger-bctc/price/news/sbv/foreign-flow-debug)
import {
  handleTriggerBctcDebugRoute,
  handleTriggerPriceDebugRoute,
  handleTriggerNewsDebugRoute,
  handleTriggerSbvDebugRoute,
  handleTriggerForeignFlowDebugRoute,
} from "./routes/debugTriggerRoutes.js";
// FACTORY-INTERFACE-split-server-ts Stage 2: macro/news VPS-push routes (push-reuters/tradingeconomics/gso)
import { handlePushTradingEconomics, handlePushGso, handlePushReuters } from "./routes/macroPushHandler.js";
// FACTORY-INTERFACE-split-server-ts Stage 3: OHLCV backfill VPS lifecycle routes
// FIX-FOREIGN-FLOW-COVERAGE: + handleOhlcvCodes (GET /api/ohlcv-codes — full daily_ohlcv traded universe)
import { handlePushOhlcvHistory, handleOhlcvBackfillQueue, handleOhlcvBackfillDone, handleOhlcvCodes } from "./routes/ohlcvBackfillHandler.js";
// FACTORY-INTERFACE-split-server-ts Stage 4: BCTC VPS proxy ingestion + queue-management routes
import { handleBctcFetchQueue, handleEnrichQueueItem } from "./routes/bctcVpsQueueHandler.js";
import { handlePushBctcPdf, handleTriggerPekExtract } from "./routes/bctcVpsIngestHandler.js";

// ─────────────────────────────────────────────────────────────────────────────
// FIX-MCP-500-SYMBOL-TO-STRING: Bun-native Node.js ↔ Web Standard conversion
// ─────────────────────────────────────────────────────────────────────────────
// These helpers convert between Node.js `IncomingMessage`/`ServerResponse` and
// the Web Standard `Request`/`Response` used by WebStandardStreamableHTTPServerTransport
// WITHOUT going through @hono/node-server (which uses Symbol-keyed prototype
// properties that trigger Bun 1.3.13 JIT corruption after ~80 min heavy use).

/**
 * Convert a Node.js IncomingMessage to a Web Standard Request.
 * Uses Bun's native Request API — no hono bridge, no Symbol property access.
 */
async function incomingToWebRequest(req: IncomingMessage): Promise<Request> {
  const host = req.headers.host ?? "localhost";
  const url = new URL(req.url ?? "/", `http://${host}`);

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") {
      headers.set(key, value);
    } else if (Array.isArray(value)) {
      for (const v of value) {
        headers.append(key, v);
      }
    }
  }

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  // Cast through unknown to reconcile node:stream/web vs global ReadableStream types.
  // At runtime under Bun, both refer to the same native implementation.
  const body = hasBody
    ? (Readable.toWeb(req as NodeJS.ReadableStream) as unknown as ReadableStream<Uint8Array>)
    : undefined;

  return new Request(url.href, {
    method: req.method ?? "GET",
    headers,
    body,
    // duplex is required by some runtimes when body is a stream
    ...(body ? { duplex: "half" } : {}),
  } as RequestInit);
}

/**
 * Pipe a Web Standard Response into a Node.js ServerResponse.
 * Streams the body chunk-by-chunk to support SSE and chunked responses.
 */
async function pipeWebResponseToNode(webRes: Response, res: ServerResponse): Promise<void> {
  // Build Node.js-compatible header object
  const headerObj: Record<string, string | string[]> = {};
  webRes.headers.forEach((value, key) => {
    const existing = headerObj[key];
    if (existing !== undefined) {
      headerObj[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
    } else {
      headerObj[key] = value;
    }
  });
  res.writeHead(webRes.status, headerObj);

  if (webRes.body) {
    const reader = webRes.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  res.end();
}

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

    // TSU-DEV-U1: Wrap registered tool handlers for per-call telemetry.
    // Gateway dials a new SSE connection per-call (sessionId never fires) —
    // this proxy is the only reliable invocation counter in that model.
    // incrementTool is synchronous Map.set() — zero I/O, zero latency impact.
    try {
      const registeredToolsMap = (server as unknown as { _registeredTools?: Record<string, { handler: (args: unknown) => unknown }> })._registeredTools;
      if (registeredToolsMap) {
        for (const [toolName, toolDef] of Object.entries(registeredToolsMap)) {
          const originalHandler = toolDef.handler;
          toolDef.handler = async (args: unknown) => {
            incrementTool(toolName);
            return originalHandler(args);
          };
        }
      }
    } catch {
      // Proxy installation is best-effort — never block server creation
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

  // P1.5-MCP-3 (TASK_1984): Server-side periodic reaper — emits orphan-signals
  // for expired adoptable locks every 600s so dead-session orphans are detected
  // WITHOUT any client present (the "all sessions dead" case per §6.5.1).
  // Grace window = 300s (5 min past expiry before a row is eligible).
  // Fires even when no task_claim arrives — belt-and-suspenders beyond the
  // opportunistic per-claim GC in claimTask.
  const reaperIntervalId = startPeriodicReaper();

  // ── Task 1839a Phase 2: single DB handle for all HTTP route handlers ─────
  // One shared DB instance for all route handlers — opened once at startup.
  // Eliminates 16 per-request calls; server lifetime matches startScheduler.
  const db = getDb();

  // ── BCTC-EVAL-SUBSTRATE: Load thresholds SSOT at startup ─────────────────
  // Loaded once; injected into recompute handler so no per-request file reads.
  // Non-fatal if file absent — handler returns 500 on missing thresholds.
  const bctcEvalProjectRoot = process.cwd();
  let bctcEvalThresholds: ReturnType<typeof loadBctcEvalThresholds> | null = null;
  try {
    bctcEvalThresholds = loadBctcEvalThresholds(bctcEvalProjectRoot);
  } catch (thresholdsErr) {
    log.warn("[startup] bctc-eval-thresholds.json not found — recompute handler will return 500", {
      error: thresholdsErr instanceof Error ? thresholdsErr.message : String(thresholdsErr),
    });
  }

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

      // FIX-MCP-500-SYMBOL-TO-STRING: use WebStandardStreamableHTTPServerTransport
      // directly instead of StreamableHTTPServerTransport (which bridges through
      // @hono/node-server using 13 Symbol-keyed prototype properties that Bun 1.3.13
      // JIT corrupts after ~80 min heavy processing, causing TypeError
      // "Cannot convert a symbol to a string" on every /mcp request).
      //
      // We convert IncomingMessage → native Web Standard Request using Bun's own
      // Request/Response APIs (no hono bridge, no Symbol property access), then
      // pipe the Web Standard Response back to ServerResponse.
      const reqTransport = new WebStandardStreamableHTTPServerTransport({});
      const reqMcp = createMcpServerInstance();
      await reqMcp.connect(reqTransport as unknown as import("@modelcontextprotocol/sdk/shared/transport.js").Transport);
      try {
        const webRequest = await incomingToWebRequest(req);
        const webResponse = await reqTransport.handleRequest(webRequest);
        await pipeWebResponseToNode(webResponse, res);
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
      await handleTriggerPekExtract(req, res, db, log);
      return;
    }

    // LF-OVERLAY: Get zone-geometry for a specific doc + page (overlay read path)
    if (method === "GET" && pathname.startsWith("/api/bctc-inspect/zones/")) {
      const docId = pathname.slice("/api/bctc-inspect/zones/".length);
      handleBctcInspectZones(req, res, db, docId);
      return;
    }

    // AIT-DEV: AI Input Tab — serve agent-input page PNG
    if (method === "GET" && pathname.startsWith("/api/bctc-inspect/page-image/")) {
      const docId = pathname.slice("/api/bctc-inspect/page-image/".length);
      handleBctcInspectPageImage(req, res, db, docId);
      return;
    }

    // AIT-DEV: AI Input Tab — page-window context from bctc_refined_units
    if (method === "GET" && pathname.startsWith("/api/bctc-inspect/page-window/")) {
      const docId = pathname.slice("/api/bctc-inspect/page-window/".length);
      handleBctcInspectPageWindow(req, res, db, docId);
      return;
    }

    // HC-DEV-3: BCTC Human-Confirm endpoints ─────────────────────────────────
    // GET  /api/bctc-inspect/flags/{doc_id}          — flagged cell list
    // POST /api/bctc-inspect/correct/{doc_id}        — submit correction
    // POST /api/bctc-inspect/confirm/{doc_id}        — lock as CONFIRMED
    // POST /api/bctc-inspect/confirm/{doc_id}/reset  — reset to PENDING
    if (method === "GET" && pathname.startsWith("/api/bctc-inspect/flags/")) {
      const docId = pathname.slice("/api/bctc-inspect/flags/".length);
      await handleBctcInspectFlags(req, res, db, docId);
      return;
    }
    if (method === "POST" && pathname.startsWith("/api/bctc-inspect/correct/")) {
      const docId = pathname.slice("/api/bctc-inspect/correct/".length);
      await handleBctcInspectCorrect(req, res, db, docId);
      return;
    }
    if (method === "POST" && pathname.startsWith("/api/bctc-inspect/confirm/")) {
      const parts = pathname.split("/");
      if (parts[parts.length - 1] === "reset") {
        const docId = parts[parts.length - 2] ?? "";
        await handleBctcInspectConfirmReset(req, res, db, docId);
      } else {
        const docId = parts[parts.length - 1] ?? "";
        await handleBctcInspectConfirm(req, res, db, docId);
      }
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
      if (!requireVpsApiKey(req, res)) return;
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
      await handlePushSbvRates(req, res, db, log);
      return;
    }

    // ── Task 1112: BCTC VPS proxy — fetch queue ────────────────────────────
    if (method === "GET" && pathname === "/api/bctc-fetch-queue") {
      await handleBctcFetchQueue(req, res, db, log);
      return;
    }

    // ── Task 1112: BCTC VPS proxy — push PDF ─────────────────────────────────
    if (method === "POST" && pathname === "/api/push-bctc-pdf") {
      await handlePushBctcPdf(req, res, db, log);
      return;
    }


    // ── Task 1289 — VPS Queue Enrichment Endpoint ────────────────────────────
    // VPS scheduler job POSTs discovered PDF URLs here.
    // Receives: { action_code, period_year, period_quarter, source_url }
    // Updates bctc_vps_queue.source_url for matching item
    if (method === "POST" && pathname === "/api/enrich-queue-item") {
      await handleEnrichQueueItem(req, res, db, log);
      return;
    }


    // ── Push OHLCV history from VPS one-time backfill script ────────────────
    if (method === "POST" && pathname === "/api/push-ohlcv-history") {
      await handlePushOhlcvHistory(req, res, db, log);
      return;
    }

    // ── Task 1361: GET /api/ohlcv-backfill-queue — VPS polls for pending backfill ──
    if (method === "GET" && pathname === "/api/ohlcv-backfill-queue") {
      await handleOhlcvBackfillQueue(req, res, db, log);
      return;
    }

    // ── FIX-FOREIGN-FLOW-COVERAGE: GET /api/ohlcv-codes — full daily_ohlcv traded universe ──
    // Consumed by fetch-foreign-flow.sh (CODES source, replacing 111-code watchlist+ref subset)
    // and fetch-ohlcv-backfill.sh (R-2 fallback chain — this was the endpoint that already
    // existed in the script but had never been implemented server-side).
    if (method === "GET" && pathname === "/api/ohlcv-codes") {
      await handleOhlcvCodes(req, res, db, log);
      return;
    }

    // ── GET /api/signals/stock/:code — per-stock agent signals for frontend ────
    // Returns last N agent_signals rows for a specific stock_code.
    // Non-authenticated — read-only query, no sensitive data.
    if (method === "GET" && pathname.startsWith("/api/signals/stock/")) {
      const code = decodeURIComponent((pathname.slice("/api/signals/stock/".length).split("?")[0]) ?? "");
      const limitParam = url.searchParams.get("limit");
      const limit = Math.min(Math.max(1, parseInt(limitParam ?? "10", 10) || 10), 50);
      // D-1 FIX-CASCADE-MACRO-CARD-REAL-DETAIL: extract ?type param and pass to handler.
      // e.g. ?type=chain_catalyst → handler expands to ['chain_catalyst','urgent_news']
      const typeParam = url.searchParams.get("type");
      const signalTypes = typeParam ? typeParam.split(",").map((s) => s.trim()).filter(Boolean) : undefined;

      if (!code) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing stock code" }));
        return;
      }

      try {
        // FIX-SIGNALS-STOCK-FULL-DETAIL: delegate to stockSignalsHandler.
        // Returns full structured finding_data + payload + source + ISO created_at.
        // Generic across all signal types — no special-casing.
        const signals = querySignalsForStock(db, code, limit, signalTypes);

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

    // ── Task 1361 / SUBTASK-B: POST /api/ohlcv-backfill-done — VPS signals backfill complete ──
    // Accepts optional body: {"bars_pushed_total": N}
    // Poll script secondary call sends empty body — idempotent (marks done=1 again, depth probe
    // runs again; if already ≥252 bars no re-queue). R-5 retry-storm cap: retry_count ≥ 5 → BUG.
    if (method === "POST" && pathname === "/api/ohlcv-backfill-done") {
      await handleOhlcvBackfillDone(req, res, db, log);
      return;
    }

    // ── Task 1494: POST /api/push-reuters — VPS RSS push ─────────────────
    if (method === "POST" && pathname === "/api/push-reuters") {
      await handlePushReuters(req, res, db, log);
      return;
    }

    // ── Task 1495: POST /api/push-tradingeconomics — VPS macro push ──────────
    if (method === "POST" && pathname === "/api/push-tradingeconomics") {
      await handlePushTradingEconomics(req, res, db, log);
      return;
    }

    // ── Task 1499: POST /api/push-gso — VPS GSO macro push ────────────────
    if (method === "POST" && pathname === "/api/push-gso") {
      await handlePushGso(req, res, db, log);
      return;
    }

    // ── POST /api/trigger-bctc-debug — manual BCTC fetch debug trigger ───────
    if (method === "POST" && pathname === "/api/trigger-bctc-debug") {
      await handleTriggerBctcDebugRoute(req, res, db, log);
      return;
    }

    // ── POST /api/trigger-price-debug — manual price fetch debug trigger ────
    if (method === "POST" && pathname === "/api/trigger-price-debug") {
      await handleTriggerPriceDebugRoute(req, res, db, log);
      return;
    }

    // ── POST /api/trigger-news-debug — manual news fetch debug trigger ───────
    if (method === "POST" && pathname === "/api/trigger-news-debug") {
      await handleTriggerNewsDebugRoute(req, res, db, log);
      return;
    }

    // ── POST /api/trigger-sbv-debug — manual SBV/FX rate debug trigger ───────
    if (method === "POST" && pathname === "/api/trigger-sbv-debug") {
      await handleTriggerSbvDebugRoute(req, res, db, log);
      return;
    }

    // ── POST /api/trigger-foreign-flow-debug — manual foreign flow debug trigger
    if (method === "POST" && pathname === "/api/trigger-foreign-flow-debug") {
      await handleTriggerForeignFlowDebugRoute(req, res, db, log);
      return;
    }

    // ── BCTC-EVAL-SUBSTRATE routes (Sprint BCTC-EVAL-SUBSTRATE) ─────────────
    // GET /api/bctc-eval                        — list all reports (trust-ascending sort)
    // GET /api/bctc-eval/thresholds             — SSOT thresholds JSON (MUST precede dynamic /:id route)
    // GET /api/bctc-eval/{uuid}/page/{N}        — page-scoped eval strip (BCTC-EVAL-INSPECT-MERGE)
    // GET /api/bctc-eval/:id                    — full detail for one report
    // POST /api/bctc-eval/recompute/:id         — recompute stages 4-6 for one report
    // POST /api/bctc-eval/push-stage            — receive stages 1-3 from pdf-extractor
    if (method === "GET" && pathname === "/api/bctc-eval") {
      handleBctcEvalList(req, res, db);
      return;
    }
    // thresholds BEFORE dynamic /:id to avoid ambiguous match
    if (method === "GET" && pathname === "/api/bctc-eval/thresholds") {
      handleBctcEvalThresholds(req, res, bctcEvalProjectRoot);
      return;
    }
    // BCTC-EVAL-INSPECT-MERGE: page-scoped eval strip (MUST precede UUID-only catch)
    {
      const pageMatch = pathname.match(/^\/api\/bctc-eval\/([^/]+)\/page\/(\d+)$/);
      if (method === "GET" && pageMatch) {
        const [, evalReportId, pageStr] = pageMatch;
        return bctcEvalPageHandler(req, res, db, evalReportId!, parseInt(pageStr!, 10));
      }
    }
    if (method === "GET" && pathname.startsWith("/api/bctc-eval/") && !pathname.startsWith("/api/bctc-eval/recompute/")) {
      const evalReportId = pathname.slice("/api/bctc-eval/".length);
      if (evalReportId) {
        handleBctcEvalDetail(req, res, db, evalReportId);
        return;
      }
    }
    if (method === "POST" && pathname.startsWith("/api/bctc-eval/recompute/")) {
      const evalReportId = pathname.slice("/api/bctc-eval/recompute/".length);
      if (evalReportId) {
        if (!bctcEvalThresholds) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "BCTC eval thresholds not loaded at startup", code: "THRESHOLDS_UNREADABLE" }));
          return;
        }
        await handleBctcEvalRecompute(req, res, db, evalReportId, bctcEvalThresholds);
        return;
      }
    }
    if (method === "POST" && pathname === "/api/bctc-eval/push-stage") {
      await handleBctcEvalPushStage(req, res, db);
      return;
    }

    // ── BCTC-AGENTIC-REFINE FR-12: POST /api/refine-bctc/{report_id} ─────────
    // On-demand refine trigger for a single report. Responds 202 immediately;
    // refineOneReport() runs async in background (fire-and-forget).
    // report_id is parsed from path after /api/refine-bctc/
    if (method === "POST" && pathname.startsWith("/api/refine-bctc/")) {
      const reportId = pathname.slice("/api/refine-bctc/".length);
      const handlerResp = await handleBctcRefineOnDemand(reportId || undefined);
      const body = await handlerResp.text();
      res.writeHead(handlerResp.status, { "Content-Type": "application/json" });
      res.end(body);
      return;
    }

    // ── OSC-4a: GET /api/orchestration — read-only orch-state.json projection ──
    // HC-2 SAFETY: only safe fields exposed (see orchestrationHandler.ts).
    // Returns 200+DTO on success; 503 if orch-state.json missing/unreadable.
    if (method === "GET" && pathname === "/api/orchestration") {
      const orchPath = getOrchStatePath(process.cwd());
      handleGetOrchestration(req, res, orchPath);
      return;
    }

    // ── TASK-DASH-CRON-1: GET /api/cron-status — Layer-A + Layer-B cron liveness ──
    // Read-only (NFR-4). Shares no mutable state with GET /api/orchestration (AC-25).
    // Returns 200+DTO on success; 503 JSON {error} on any unhandled exception (FR-3.4).
    if (method === "GET" && pathname === "/api/cron-status") {
      handleGetCronStatus(req, res, db);
      return;
    }

    // ── QUALITY-AUDIT Phase 1: GET /api/quality-checklist — read-only artifact ──
    // Serves docs/data/quality-checklist.json for the quality-audit dashboard consumer.
    // Returns 200+JSON on success; 500 if file missing or unreadable.
    if (method === "GET" && pathname === "/api/quality-checklist") {
      const { resolve } = await import("node:path");
      const checklistPath = resolve(process.cwd(), "docs", "data", "quality-checklist.json");
      handleGetQualityChecklist(req, res, checklistPath);
      return;
    }

    // ── VPT-1: GET /api/vps-proxy-health — machine-readable VPS health for dashboard ──
    // Returns per-service push freshness (stale boolean, pushes_24h, errors_24h, last_push)
    // so the /dashboard/vps panel can display UP/STALE/DOWN truthfully.
    // Data source: vpsPushLogStore.getVpsProxyHealth() — same store as get_vps_proxy_health MCP tool.
    // No authentication required — read-only, no sensitive data.
    if (method === "GET" && pathname === "/api/vps-proxy-health") {
      handleVpsProxyHealth(req, res, db);
      return;
    }

    // ── F-1: GET /api/fetch-status — aggregated fetch operations status ──────
    // Aggregates per-source article freshness from rag_analyses, VPS proxy health,
    // and BCTC queue counts for the dashboard enrich panel.
    // Route: /api/ prefix (NOT /mcp/api/) — uses "api" virtual alias (NoProbe=true)
    // so the full path is preserved through the gateway. No auth required (read-only).
    if (method === "GET" && pathname === "/api/fetch-status") {
      handleFetchStatus(req, res, db);
      return;
    }

    // ── FE-REROUTE Phase 1: Kinh Dich REST endpoints (FE-RR-1/2/3) ─────────
    // GET /mcp/api/kinh-dich/reading/:code — latest reading for a stock
    // GET /mcp/api/kinh-dich/market        — derived aggregate market signal
    // NOTE: /market MUST be checked before /:code to avoid shadowing.
    if (method === "GET" && pathname === "/mcp/api/kinh-dich/market") {
      handleKinhDichMarket(req, res, db);
      return;
    }
    if (method === "GET" && pathname.startsWith("/mcp/api/kinh-dich/reading/")) {
      const code = decodeURIComponent(pathname.slice("/mcp/api/kinh-dich/reading/".length).split("?")[0] ?? "");
      handleKinhDichReading(req, res, db, code);
      return;
    }
    // F-4 additive aliases: gateway strips /mcp → /api/kinh-dich/* (direct proxy path)
    if (method === "GET" && pathname === "/api/kinh-dich/market") {
      handleKinhDichMarket(req, res, db);
      return;
    }
    if (method === "GET" && pathname.startsWith("/api/kinh-dich/reading/")) {
      const code = decodeURIComponent(pathname.slice("/api/kinh-dich/reading/".length).split("?")[0] ?? "");
      handleKinhDichReading(req, res, db, code);
      return;
    }

    // ── FE-REROUTE Phase 1: Price REST endpoints (FE-RR-4/5/6) ────────────
    // GET /mcp/api/prices/history?code=X&days=N — OHLCV history
    // GET /mcp/api/prices/batch?tickers=X,Y     — latest price batch
    if (method === "GET" && pathname === "/mcp/api/prices/history") {
      handlePriceHistory(req, res, db);
      return;
    }
    if (method === "GET" && pathname === "/mcp/api/prices/batch") {
      handlePriceBatch(req, res, db);
      return;
    }
    // F-4 additive aliases: gateway strips /mcp → /api/prices/* (direct proxy path)
    if (method === "GET" && pathname === "/api/prices/history") {
      handlePriceHistory(req, res, db);
      return;
    }
    if (method === "GET" && pathname === "/api/prices/batch") {
      handlePriceBatch(req, res, db);
      return;
    }

    // ── FE-REROUTE Phase 2: News headlines REST endpoint (FE-RR-13/14) ────
    // GET /mcp/api/news/headlines?source=reuters&limit=15 — articles envelope
    if (method === "GET" && pathname === "/mcp/api/news/headlines") {
      handleNewsHeadlines(req, res, db);
      return;
    }
    // F-4 additive alias: gateway strips /mcp → /api/news/headlines (direct proxy path)
    if (method === "GET" && pathname === "/api/news/headlines") {
      handleNewsHeadlines(req, res, db);
      return;
    }

    // ── MAW-P0-2: GET /api/market-digest — last 3 CHEF synthesis dishes ──
    if (method === "GET" && pathname === "/api/market-digest") {
      handleGetMarketDigest(req, res, db);
      return;
    }

    // ── TASK-17 P1-3a: GET /api/analysis-briefs — catalogue index of ALL briefs ──
    // Exact match MUST come before the /api/analysis-brief/:ticker prefix match.
    if (method === "GET" && pathname === "/api/analysis-briefs") {
      handleGetAnalysisBriefIndex(req, res, process.cwd());
      return;
    }

    // ── MAW-P0-3: GET /api/analysis-brief/:ticker — per-ticker brief ──────
    // Matches /api/analysis-brief/<TICKER> (one path segment after prefix)
    if (method === "GET" && pathname.startsWith("/api/analysis-brief/")) {
      const ticker = pathname.slice("/api/analysis-brief/".length);
      handleGetAnalysisBrief(req, res, ticker, process.cwd());
      return;
    }

    // ── MAW-P1-1a: GET /api/news-sentiment — synthesised news + sentiment ──
    if (method === "GET" && pathname === "/api/news-sentiment") {
      handleGetNewsSentiment(req, res, db);
      return;
    }

    // ── TASK-17 P1-2a: GET /api/macro-regime — macro snapshot for frontend ──
    if (method === "GET" && pathname === "/api/macro-regime") {
      await handleGetMacroRegime(req, res);
      return;
    }

    // ── IND-P1-MCP-REST-GAUGES-ENDPOINT: GET /api/indicator-gauges ──────────
    // Aggregates the 5 P0 indicator sources (volatility, sentiment, breadth,
    // foreign_room, liquidity) into a single IndicatorGaugesDto response.
    // Promise.allSettled: section-isolated — one failure degrades ONLY that section.
    // Always returns 200; generated_at always set; honest-NULL per section.
    if (method === "GET" && pathname === "/api/indicator-gauges") {
      await handleGetIndicatorGauges(req, res, db);
      return;
    }

    // ── TASK-501-MOMENTUM-API-HANDLER: GET /api/momentum-indicators ──────────
    // Aggregates the 4 P1 momentum sources (ROC, RS, 52W, foreign accum) into a
    // single MomentumIndicatorsDto response.
    // Promise.allSettled: section-isolated — one failure degrades ONLY that section.
    // Always returns 200; generated_at always set; honest-NULL per section.
    // NO db arg: all 4 sources are remote HTTP via clients.ts (ARCH-RATIFY M3).
    if (method === "GET" && pathname === "/api/momentum-indicators") {
      await handleGetMomentumIndicators(req, res);
      return;
    }

    // ── MONEY-RADAR-P0-T3B-REST-API: GET /api/money-radar ────────────────────
    // REST bridge for the Money Radar composite score — calls the SAME
    // getMoneyRadarComposite usecase used by the get_money_radar_composite MCP
    // tool (moneyRadarTools.ts), so the frontend dashboard and the MCP tool
    // never diverge. Always returns 200; honest-NULL passthrough (HN-1..HN-7);
    // generated_at always set.
    if (method === "GET" && pathname === "/api/money-radar") {
      await handleGetMoneyRadar(req, res, db);
      return;
    }

    // ── TASK-17 P2-1a: GET /api/price-history/:ticker — OHLC history DTO ──
    // Matches /api/price-history/<TICKER> (one path segment after prefix).
    // Proxies stock-price Go service; never serves DB directly; 502 on failure.
    if (method === "GET" && pathname.startsWith("/api/price-history/")) {
      const ticker = decodeURIComponent(pathname.slice("/api/price-history/".length).split("?")[0] ?? "");
      await handleGetPriceHistory(req, res, ticker);
      return;
    }

    // ── TASK-17 Alerts ENDPOINT WAVE: GET /api/alerts ────────────────────
    // Serves the live alerts table for the dashboard Alerts page.
    // Supports ?limit= (default 50, max 200) and optional ?severity= filter.
    if (method === "GET" && pathname === "/api/alerts") {
      handleGetAlerts(req, res, db);
      return;
    }

    // ── TASK17-FOREIGN-FLOW: GET /api/foreign-flow ────────────────────────
    // Serves latest trading day's foreign net buy/sell from vnstock_trading_stats.
    // Public endpoint (no auth). Supports ?limit= (default 200, max 500).
    if (method === "GET" && pathname === "/api/foreign-flow") {
      handleGetForeignFlow(req, res, db);
      return;
    }

    // ── TASK17-AGM: GET /api/agm-plan-actual ──────────────────────────────
    // Serves AGM plan-vs-actual delivery analysis for "Kế hoạch vs Thực hiện" page.
    // Public endpoint (no auth). Supports ?year=YYYY (default = latest closed year)
    // and ?limit=N (default 200, max 500).
    if (method === "GET" && pathname === "/api/agm-plan-actual") {
      handleGetAgmPlanActual(req, res, db);
      return;
    }

    // ── TASK17-PRED: GET /api/prediction-claims ───────────────────────────
    // Serves AI prediction accountability / calibration ledger for "Dự báo AI & Kết quả" page.
    // Public endpoint (no auth). Supports ?limit=N (default 100, max 500)
    // and ?outcome=correct|wrong|pending (optional filter).
    if (method === "GET" && pathname === "/api/prediction-claims") {
      handleGetPredictionClaims(req, res, db);
      return;
    }

    // ── TASK17-CONVICTION: GET /api/conviction-history ────────────────────
    // Serves AI conviction tracker ("Niềm tin AI theo cổ phiếu") per stock.
    // Public endpoint (no auth). Supports ?limit=N (default 2000, max 2000).
    if (method === "GET" && pathname === "/api/conviction-history") {
      handleGetConvictionHistory(req, res, db);
      return;
    }

    // ── TASK17-SUMMARIES: GET /api/market-summaries ───────────────────────
    // Serves CHEF market intelligence archive (daily/weekly/monthly/quarterly/yearly).
    // Public endpoint (no auth).
    // ?id=<id> → detail mode (full summary_text + parsed json arrays).
    // ?period=daily|weekly|... → list filter (invalid ignored).
    // ?limit=N → default 60, clamp [1,200].
    if (method === "GET" && pathname === "/api/market-summaries") {
      handleGetMarketSummaries(req, res, db);
      return;
    }

    // ── TASK17-PAGE9: GET /api/sector-rotation ────────────────────────────
    // Serves Sector Money Flow ("Dòng tiền theo ngành") analyst page.
    // Stored-data-only (NO live fan-out) — fast, deterministic, structured JSON.
    // Reuses detectSectorRotation() domain service; different from get_sector_rotation MCP tool.
    // Public endpoint (no auth).
    if (method === "GET" && pathname === "/api/sector-rotation") {
      handleGetSectorRotation(req, res, db);
      return;
    }

    // ── TASK17-PAGE10: GET /api/sector-cascade ───────────────────────────
    // Serves Sector Cascade Signals ("Tín hiệu dây chuyền theo ngành") analyst page.
    // Aggregates cascade_rule_hits by sector, computes netBias (up−down), sorted DESC.
    // Stored-data-only (NO live fan-out) — fast, deterministic, structured JSON.
    // Public endpoint (no auth).
    if (method === "GET" && pathname === "/api/sector-cascade") {
      handleGetSectorCascade(req, res, db);
      return;
    }

    // ── TASK17-PAGE11: GET /api/kinh-dich-signals ─────────────────────────
    // Serves Kinh Dịch hexagram trading signals ("Tín hiệu Kinh Dịch") per stock.
    // Latest reading per symbol, signal-flip detection, actionPriority sort.
    // Stored-data-only (NO live fan-out, NO kinh-dich-service call).
    // Query param: ?source=cycle|manual|all (default "cycle").
    // Public endpoint (no auth).
    if (method === "GET" && pathname === "/api/kinh-dich-signals") {
      handleGetKinhDichSignals(req, res, db);
      return;
    }

    // ── TASK17-PAGE12: GET /api/global-markets ────────────────────────────
    // Serves Global Market Context / World Risk Barometer ("Bối cảnh thị trường toàn cầu").
    // 12 world-market indicators from commodity_prices_history: current + delta + direction.
    // Query param: ?window=N (sparkline days, default 7, clamp [1,30]).
    // Stored-data-only (NO live network/microservice calls).
    // Public endpoint (no auth).
    if (method === "GET" && pathname === "/api/global-markets") {
      handleGetGlobalMarkets(req, res, db);
      return;
    }

    // ── TASK17-PAGE13: GET /api/corporate-events ──────────────────────────
    // Serves Recent Corporate Actions Monitor ("Sự kiện doanh nghiệp gần đây").
    // Backward-looking activity monitor from vnstock_events table.
    // Query params: ?days=N (look-back window, default 90, clamp [7,365])
    //               ?type=T (optional event_type filter, e.g. "DIV", "AGME")
    // Stored-data-only (NO live network/microservice calls).
    // Public endpoint (no auth).
    if (method === "GET" && pathname === "/api/corporate-events") {
      handleGetCorporateEvents(req, res, db);
      return;
    }

    // ── TASK17-PAGE14: GET /api/shareholders ──────────────────────────────
    // Serves Major-holder Ownership Structure ("Cơ cấu cổ đông tại thời điểm công bố").
    // Snapshot capability — data from vnstock_shareholders table.
    // Query params: ?code=XXX (optional ticker, case-insensitive; invalid/absent → first code)
    // Stored-data-only (NO live network/microservice calls).
    // Public endpoint (no auth).
    if (method === "GET" && pathname === "/api/shareholders") {
      handleGetShareholdersHttp(req, res, db);
      return;
    }

    // ── TASK17-PAGE15: GET /api/officers ──────────────────────────────────
    // Serves Board of Directors & Management ("Ban lãnh đạo & quản trị").
    // Governance counterpart to the shareholders endpoint.
    // Query params: ?code=XXX (optional ticker, case-insensitive; invalid/absent → first code)
    // Stored-data-only (NO live network/microservice calls).
    // Public endpoint (no auth).
    if (method === "GET" && pathname === "/api/officers") {
      handleGetOfficersHttp(req, res, db);
      return;
    }

    // ── TASK17-PAGE16: GET /api/financials ────────────────────────────────
    // Serves Cross-sectional Valuation & Fundamentals Screener.
    // One row per code (latest period), full universe — no query params.
    // Returns rows + summary medians (pe/pb/roe) + top-5 rankings.
    // Stored-data-only (NO live network/microservice calls).
    // Public endpoint (no auth).
    if (method === "GET" && pathname === "/api/financials") {
      handleGetFinancialsHttp(req, res, db);
      return;
    }

    // ── TASK17-PAGE17: GET /api/fed-rates ────────────────────────────────
    // Serves US Fed EFFR/IORB liquidity spread time-series ("Lãi suất Fed Mỹ").
    // 180-day fixed lookback; returns latest effr/iorb/spread + trend30d + series[].
    // Stored-data-only (fred_series_daily table via fetchEffrIorbSamples).
    // Public endpoint (no auth). Only GET served (others → 405).
    if (method === "GET" && pathname === "/api/fed-rates") {
      handleGetFedRatesHttp(req, res, db);
      return;
    }

    // ── TASK17-PAGE18: GET /api/reputation ───────────────────────────────
    // Serves corporate-reputation (news-sentiment) risk leaderboard.
    // Full-universe snapshot at the latest scored date plus per-code history.
    // Stored-data-only (reputation_scores table via store queries).
    // Public endpoint (no auth). Only GET served (others → 405).
    if (method === "GET" && pathname === "/api/reputation") {
      handleGetReputationHttp(req, res, db);
      return;
    }

    // ── TASK17-PAGE19: GET /api/news-buzz ────────────────────────────────
    // News-buzz / mention-velocity leaderboard over the live mention_velocity table.
    // Data-anchored 7-day window (windowEnd = MAX(hour)). Only GET served (others → 405).
    if (method === "GET" && pathname === "/api/news-buzz") {
      handleGetNewsBuzzHttp(req, res, db);
      return;
    }

    // ── 404 ───────────────────────────────────────────────────────────────
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found", path: pathname }));
  }

  // ── Start node:http server ──────────────────────────────────────────────
  const httpServer = createServer((req, res) => {
    handleRequest(req, res).catch((err) => {
      // FIX-MCP-500-SYMBOL-TO-STRING: include url + stack to pinpoint throw site
      log.error("[createBunServer] Unhandled request error", {
        error: err instanceof Error ? err.message : String(err),
        url: req.url,
        stack: err instanceof Error ? err.stack : undefined,
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
      // P1.5-MCP-3: clear the periodic reaper before closing so no stray ticks
      // fire after the server shuts down (prevents timer-leak in tests and
      // prevents DB access after the server lifetime ends).
      clearInterval(reaperIntervalId);
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
