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
import { handleTelegramCommand } from "../../infrastructure/notifiers/telegramCommands.js";
import { sendTelegramMarket, sendTelegramWork } from "../../infrastructure/notifiers/telegram.js";
import { getDb } from "../../infrastructure/db/schema.js";
import { validateWebhookRequest } from "../../infrastructure/notifiers/telegramWebhookSetup.js";
import { insertReport } from "../../infrastructure/db/telegramReportStore.js";
import { toolRegistry } from "./tools/registry.js";
import { getToolsForSkills } from "./bootstrap/agentBootstrap.js";
import { sessionToolCache } from "../../infrastructure/cache/sessionToolCache.js";
export { sessionToolCache } from "../../infrastructure/cache/sessionToolCache.js";
import { logVpsPush, type VpsPushLogEntry } from "../../infrastructure/db/vpsPushLogStore.js";
import { upsertForeignFlow } from "../../infrastructure/db/vnstockStore.js";
import type { ForeignFlowUpsertItem, WriteForeignFlowItem } from "../../domain/models/shared-types.js";
import { writeForeignFlowToOhlcv } from "../../infrastructure/db/ohlcvForeignFlowStore.js";
import { buildForeignFlowStatusResponse } from "./foreignFlowStatusHandler.js";
import { validateForeignFlowPayload } from "../../domain/services/market-data/foreignFlowValidator.js";
import { breakers } from "../../infrastructure/circuitBreakerRegistry.js";
import { ensurePoisonedQueueCleanup, ensureForeignFlowMigration } from "./server-startup.js";
import { handlePushPrices } from "./routes/pushPricesHandler.js";

// Re-export startup state so existing test imports remain valid:
//   import { isVnTradingWindowUtc } from "../interface/mcp/server.js"
//   import { _resetStaleTickers_lastNotifiedDate } from "../interface/mcp/server.js"
export { _staleTickers_lastNotifiedDate, _resetStaleTickers_lastNotifiedDate, isVnTradingWindowUtc } from "./server-startup.js";

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
  const host = options.host ?? "127.0.0.1";
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

  // ── Session manager handles SSE + message routing ──────────────────────
  const sessions = new SseSessionManager(createMcpServerInstance, log);

  // ── Streamable HTTP: stateless mode (one server+transport per request) ──

  // ── HTTP request handler ────────────────────────────────────────────────
  async function handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const url = new URL(req.url ?? "/", `http://${host}`);
    const pathname = url.pathname;
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

      // Parse body for POST/PUT/DELETE
      let parsedBody: unknown = undefined;
      if (method === "POST" || method === "PUT" || method === "DELETE") {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
        }
        const raw = Buffer.concat(chunks).toString("utf-8");
        if (raw.length > 0) {
          try { parsedBody = JSON.parse(raw); } catch { /* leave undefined */ }
        }
      }
      // Stateless: create fresh server + transport per request
      const reqTransport = new StreamableHTTPServerTransport({});
      const reqMcp = createMcpServerInstance();
      await reqMcp.connect(reqTransport as unknown as import("@modelcontextprotocol/sdk/shared/transport.js").Transport);
      try {
        await reqTransport.handleRequest(req, res, parsedBody);
      } finally {
        // Explicit cleanup prevents memory leak on long-running servers
        await reqTransport.close().catch(() => {});
        await reqMcp.close().catch(() => {});
      }
      return;
    }

    // ── GET /sse ──────────────────────────────────────────────────────────
    if (method === "GET" && pathname === "/sse") {
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
          name: "vn-market-intelligence-mcp",
          version: "1.0.0",
          toolCount,
          sessions: sessions.sessionCount,
          uptime: process.uptime(),
        }),
      );
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
      // Validate webhook secret (skip if not configured — dev mode)
      const webhookSecret = Bun.env["TELEGRAM_WEBHOOK_SECRET"] ?? "";
      const reqHeaders = new Headers();
      for (const [name, value] of Object.entries(req.headers)) {
        if (typeof value === "string") reqHeaders.set(name, value);
        else if (Array.isArray(value)) reqHeaders.set(name, value.join(", "));
      }
      if (!validateWebhookRequest(reqHeaders, webhookSecret)) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Forbidden" }));
        return;
      }

      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      }
      const raw = Buffer.concat(chunks).toString("utf-8");
      let body: unknown;
      try {
        body = JSON.parse(raw);
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON body" }));
        return;
      }

      // ── BUG Channel branch ───────────────────────────────────────────────
      // If the message originates from TELEGRAM_REPORT_BUG_CHANNEL_ID (the BUG channel),
      // persist it in the telegram_reports table and return 200 immediately
      // without dispatching to the command router.
      const bugChatId = Bun.env["TELEGRAM_REPORT_BUG_CHANNEL_ID"] ?? "";
      const update = body as {
        message?: { chat?: { id?: number }; text?: string };
      };
      const incomingChatId = String(update?.message?.chat?.id ?? "");

      if (bugChatId && incomingChatId === bugChatId) {
        const text = update?.message?.text ?? "";
        try {
          insertReport(getDb(), text, "human", 0, "normal");
        } catch (err) {
          log.warn("[webhook] failed to insert report from BUG Channel", {
            error: err instanceof Error ? err.message : String(err),
          });
        }
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("ok");
        return;
      }

      // ── Standard command dispatch (MARKET channel — user replies) ────────
      try {
        const result = await handleTelegramCommand(
          body as Parameters<typeof handleTelegramCommand>[0],
          getDb(),
        );
        if (result) {
          await sendTelegramMarket(result.text, {
            parseMode: "",
            chatId: result.chatId,
            persist: { from_agent: "mcp-user", message_type: "user_ask_reply" },
          });
        }
      } catch (err) {
        log.warn("[webhook] command handling failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }

      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
      return;
    }

    // ── Push Prices from VPS proxy ────────────────────────────────────────
    if (method === "POST" && pathname === "/api/push-prices") {
      await handlePushPrices(req, res, getDb(), log);
      return;
    }

    // ── Push Foreign Flow from VPS proxy ────────────────────────────────────
    if (method === "POST" && pathname === "/api/push-foreign-flow") {
      const apiKey = Bun.env.VPS_PUSH_API_KEY;
      const authHeader = req.headers["x-api-key"] || req.headers["authorization"]?.replace("Bearer ", "");
      if (!apiKey || authHeader !== apiKey) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }

      const startTime = Date.now();
      let body = "";
      for await (const chunk of req) body += chunk;

      const MAX_PAYLOAD_SIZE = 1_000_000; // 1MB max
      let truncationDetected = false;
      let parseTimeMs = 0;
      let validationTimeMs = 0;
      let dbTimeMs = 0;

      try {
        // Step 1: Detect truncation — if body is huge and doesn't end with ']', likely truncated
        if (body.length >= MAX_PAYLOAD_SIZE && !body.trim().endsWith("]")) {
          truncationDetected = true;
          logVpsPush({
            service: "foreign-flow",
            itemsCount: 0,
            status: "error",
            errorMsg: "Payload truncated: exceeds max size and missing closing bracket",
            vpsResponseSizeBytes: body.length,
            truncationDetected: true,
          });
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Payload truncated" }));
          return;
        }

        if (body.trim().length <= 1) {
          logVpsPush({
            service: "foreign-flow",
            itemsCount: 0,
            status: "error",
            errorMsg: "Empty or truncated body",
            vpsResponseSizeBytes: body.length,
          });
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Empty or truncated body" }));
          return;
        }

        // Step 2: Parse JSON with timing
        const parseStart = Date.now();
        let rawItems: unknown[];
        try {
          rawItems = JSON.parse(body) as unknown[];
        } catch (parseErr) {
          parseTimeMs = Date.now() - parseStart;
          const errMsg =
            parseErr instanceof SyntaxError
              ? `JSON parse error at position ${parseErr.message}`
              : `JSON parse error: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`;

          logVpsPush({
            service: "foreign-flow",
            itemsCount: 0,
            status: "error",
            errorMsg: errMsg,
            vpsResponseSizeBytes: body.length,
            parseTimeMs,
          });
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid JSON" }));
          return;
        }
        parseTimeMs = Date.now() - parseStart;

        if (!Array.isArray(rawItems) || rawItems.length === 0) {
          logVpsPush({
            service: "foreign-flow",
            itemsCount: 0,
            status: "error",
            errorMsg: "Expected non-empty array",
            vpsResponseSizeBytes: body.length,
            parseTimeMs,
          });
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Expected non-empty array" }));
          return;
        }

        // Step 3a: Normalize VPS payload format → ForeignFlowUpsertItem
        // VPS script (fetch-foreign-flow.sh) sends camelCase fields without `date`:
        //   { code, foreignBuyVol, foreignSellVol, foreignRoom }
        // ForeignFlowUpsertItem expects snake_case + date:
        //   { code, date, foreign_volume, foreign_room, holding_ratio, fetched_at }
        const todayUtc = new Date().toISOString().slice(0, 10);
        const normalizedItems: unknown[] = (rawItems as Record<string, unknown>[]).map((raw) => {
          const buyVol = typeof raw.foreignBuyVol === "number" ? raw.foreignBuyVol : 0;
          const sellVol = typeof raw.foreignSellVol === "number" ? raw.foreignSellVol : 0;
          return {
            code: typeof raw.code === "string" ? raw.code : String(raw.code ?? ""),
            date: typeof raw.date === "string" && raw.date ? raw.date : todayUtc,
            foreign_volume: typeof raw.foreign_volume === "number" ? raw.foreign_volume : buyVol - sellVol,
            foreign_room:
              typeof raw.foreign_room === "number"
                ? raw.foreign_room
                : typeof raw.foreignRoom === "number"
                  ? raw.foreignRoom
                  : null,
            holding_ratio: typeof raw.holding_ratio === "number" ? raw.holding_ratio : null,
            fetched_at: typeof raw.fetched_at === "string" ? raw.fetched_at : null,
          };
        });

        // Step 3b: Validate normalized payload with timing
        const validationStart = Date.now();
        const validationResult = validateForeignFlowPayload(normalizedItems);
        validationTimeMs = Date.now() - validationStart;

        const { valid: validItems, errors: validationErrors } = validationResult;

        // Collect indices of failed items
        const failedIndices = validationErrors.map((e) => e.itemIndex);
        const failedItemIndices = failedIndices.length > 0 ? JSON.stringify(failedIndices) : null;

        // If validation failed on all items, return error early
        if (validItems.length === 0) {
          const logEntry: VpsPushLogEntry = {
            service: "foreign-flow",
            itemsCount: 0,
            status: "error",
            errorMsg: `All ${rawItems.length} items failed validation`,
            vpsResponseSizeBytes: body.length,
            parseTimeMs,
            validationTimeMs,
            schemaErrorsCount: validationErrors.length,
          };
          if (failedItemIndices) logEntry.failedItemIndices = failedItemIndices;
          logVpsPush(logEntry);
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Validation failed for all items", details: validationErrors }));
          return;
        }

        // Step 4: Check circuit breaker state before attempting DB write
        const circuitBreakerState = breakers.foreignFlow.stats.state;
        if (circuitBreakerState === "open") {
          logVpsPush({
            service: "foreign-flow",
            itemsCount: 0,
            status: "error",
            errorMsg: "Circuit breaker is open — backing off",
            vpsResponseSizeBytes: body.length,
            parseTimeMs,
            validationTimeMs,
            circuitBreakerState,
          });
          res.writeHead(503, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Service temporarily unavailable" }));
          return;
        }

        // Step 5: Upsert valid items to DB with timing.
        // Guard: ensure UNIQUE(code, date) migration has run before first write.
        // Wrap in breakers.foreignFlow.execute() so DB failures increment the
        // circuit breaker failure counter (previously the bare try/catch swallowed
        // errors without notifying the breaker — FIX: foreign-flow-unique-constraint).
        ensureForeignFlowMigration();
        const dbStart = Date.now();
        let upserted = 0;
        try {
          upserted = await breakers.foreignFlow.execute(async () => upsertForeignFlow(validItems));
        } catch (dbErr) {
          dbTimeMs = Date.now() - dbStart;
          const errMsg = dbErr instanceof Error ? dbErr.message : String(dbErr);

          const logEntry: VpsPushLogEntry = {
            service: "foreign-flow",
            itemsCount: 0,
            status: "error",
            errorMsg: `DB write failed: ${errMsg}`,
            vpsResponseSizeBytes: body.length,
            parseTimeMs,
            validationTimeMs,
            dbTimeMs,
            schemaErrorsCount: validationErrors.length,
            circuitBreakerState: breakers.foreignFlow.stats.state,
          };
          if (failedItemIndices) logEntry.failedItemIndices = failedItemIndices;
          logVpsPush(logEntry);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Database write failed" }));
          return;
        }
        dbTimeMs = Date.now() - dbStart;

        log.info("[push-foreign-flow] upserted rows", {
          count: upserted,
          source: "vps-proxy",
          validationErrors: validationErrors.length,
        });

        // Step 6: Write foreign flow cols to daily_ohlcv (Task 1503, 1288f) — best-effort, no crash on failure.
        // Use validated items from Step 3b; extract buy/sell volumes from raw payload at original indices.
        // Validate foreignBuyVol and foreignSellVol are present before writing (don't silently coerce to 0).
        let extractionErrors = 0;
        try {
          // Build a map of failed item indices for quick lookup
          const failedIndices = new Set(validationErrors.map((e) => e.itemIndex));

          // Map valid items to WriteForeignFlowItem format by extracting from raw payload
          const ohlcvItems: WriteForeignFlowItem[] = [];
          for (let i = 0; i < normalizedItems.length; i++) {
            // Skip items that failed validation
            if (failedIndices.has(i)) continue;

            const raw = (rawItems as Record<string, unknown>[])[i];
            if (!raw) continue;

            // Validate foreignBuyVol and foreignSellVol BEFORE extraction (don't coerce to 0)
            if (typeof raw.foreignBuyVol !== "number") {
              log.error("[push-foreign-flow] Step 6 extraction error: missing foreignBuyVol", {
                itemIndex: i,
                field: "foreignBuyVol",
                reason: `missing or non-numeric foreignBuyVol for ${raw.code}`,
                originalValue: raw.foreignBuyVol,
              });
              extractionErrors++;
              continue;
            }

            if (typeof raw.foreignSellVol !== "number") {
              log.error("[push-foreign-flow] Step 6 extraction error: missing foreignSellVol", {
                itemIndex: i,
                field: "foreignSellVol",
                reason: `missing or non-numeric foreignSellVol for ${raw.code}`,
                originalValue: raw.foreignSellVol,
              });
              extractionErrors++;
              continue;
            }

            ohlcvItems.push({
              code: typeof raw.code === "string" ? raw.code : String(raw.code ?? ""),
              date: typeof raw.date === "string" && raw.date ? raw.date : todayUtc,
              foreignBuyVol: raw.foreignBuyVol,
              foreignSellVol: raw.foreignSellVol,
              putThroughVol: typeof raw.putThroughVol === "number" ? raw.putThroughVol : 0,
            });
          }

          if (ohlcvItems.length > 0) {
            const ohlcvResult = await writeForeignFlowToOhlcv(ohlcvItems);
            log.info("[push-foreign-flow] ohlcv rows updated", { changes: ohlcvResult.changes });
          }

          if (extractionErrors > 0) {
            log.warn("[push-foreign-flow] Step 6 extraction errors found", {
              count: extractionErrors,
            });
          }
        } catch (ohlcvErr) {
          log.warn("[push-foreign-flow] writeForeignFlowToOhlcv failed (non-fatal)", {
            error: ohlcvErr instanceof Error ? ohlcvErr.message : String(ohlcvErr),
          });
        }

        // Step 7: Log success with full metrics
        const successLogEntry: VpsPushLogEntry = {
          service: "foreign-flow",
          itemsCount: upserted,
          status: "ok",
          vpsResponseSizeBytes: body.length,
          parseTimeMs,
          validationTimeMs,
          dbTimeMs,
          schemaErrorsCount: validationErrors.length,
          circuitBreakerState: breakers.foreignFlow.stats.state,
        };
        if (failedItemIndices) successLogEntry.failedItemIndices = failedItemIndices;
        logVpsPush(successLogEntry);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, upserted, validationErrors: validationErrors.length }));
      } catch (err) {
        const totalTime = Date.now() - startTime;
        log.error("[push-foreign-flow] unexpected error", {
          error: err instanceof Error ? err.message : String(err),
        });
        logVpsPush({
          service: "foreign-flow",
          itemsCount: 0,
          status: "error",
          errorMsg: err instanceof Error ? err.message : String(err),
          vpsResponseSizeBytes: body.length,
          parseTimeMs,
          validationTimeMs,
          dbTimeMs,
          circuitBreakerState: breakers.foreignFlow.stats.state,
        });
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
      }
      return;
    }

    // ── Foreign flow diagnostic endpoint ─────────────────────────────────────
    if (method === "GET" && pathname === "/api/foreign-flow-status") {
      const apiKey = Bun.env.VPS_PUSH_API_KEY;
      const authHeader =
        (req.headers["x-api-key"] as string | undefined) ||
        (req.headers["authorization"] as string | undefined)?.replace("Bearer ", "");
      const db = getDb();
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
        const db = getDb();
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
          logVpsPush({ service: "news", itemsCount: 0, status: "error", errorMsg: "Empty request body" });
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Empty request body" }));
          return;
        }
        const items: Array<{
          title: string;
          url: string;
          publishedAt: string;
          content: string;
          source: string;
        }> = JSON.parse(body);

        if (!Array.isArray(items) || items.length === 0) {
          logVpsPush({ service: "news", itemsCount: 0, status: "error", errorMsg: "Expected non-empty JSON array of RssItem" });
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Expected non-empty JSON array of RssItem" }));
          return;
        }

        // Group items by source for injection into pollNews
        const bySource: Record<string, typeof items> = {};
        for (const item of items) {
          const src = (item.source || "vps").toLowerCase();
          (bySource[src] ??= []).push(item);
        }

        log.info("[push-news] received VN news from VPS", {
          total: items.length,
          sources: Object.keys(bySource).map((s) => `${s}:${bySource[s]!.length}`),
        });

        // Fire-and-forget: run pollNews with VPS items injected as fetchers
        setImmediate(async () => {
          try {
            const { pollNews } = await import("../../application/usecases/pollNews.js");
            const { recordJobRun } = await import("../../infrastructure/db/cronJobRunStore.js");
            const { getDb } = await import("../../infrastructure/db/schema.js");
            await recordJobRun(getDb(), "pollNewsJob", async () => {
              const result = await pollNews({
                fetchers: {
                  // Build a fetcher for every key present in bySource.
                  // This forwards all 9 (or more) VPS-pushed source keys without
                  // maintaining a hardcoded list here.
                  ...Object.fromEntries(
                    Object.keys(bySource).map((src) => [src, async () => bySource[src] ?? []])
                  ),
                  // Non-VN sources: always no-op in push-news context.
                  // Placed after spread so they override any hypothetical key collision.
                  reuters:          async () => [],
                  tradingeconomics: async () => [],
                },
              });
              log.info("[push-news] pipeline complete", {
                fetched: result.fetched,
                inserted: result.inserted,
                duplicates: result.duplicates,
                alerts: result.alerts,
              });
            });
          } catch (err) {
            log.error("[push-news] pipeline failed", {
              error: err instanceof Error ? err.message : String(err),
            });
          }
        });

        // FIX-1405b: logVpsPush wrapped in try/catch — a log-write failure must
        // NEVER cause a 400/500 response to the VPS. If the DB singleton is on a
        // different path (container restart, volume remount), we still return 200
        // so the VPS does not back off.
        try {
          logVpsPush({ service: "news", itemsCount: items.length, status: "ok" });
        } catch (logErr) {
          log.warn("[push-news] logVpsPush failed (non-fatal) — news inserted, VPS gets 200", {
            error: logErr instanceof Error ? logErr.message : String(logErr),
          });
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, received: items.length }));
      } catch (err) {
        log.error("[push-news] parse error", { error: err instanceof Error ? err.message : String(err) });
        try {
          logVpsPush({ service: "news", itemsCount: 0, status: "error", errorMsg: err instanceof Error ? err.message : String(err) });
        } catch { /* non-fatal */ }
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
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
          logVpsPush({ service: "sbv", itemsCount: 0, status: "error", errorMsg: "Empty request body" });
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
        logVpsPush({ service: "sbv", itemsCount: 1, status: "ok" });

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, usdVnd: finalSnapshot.usdVndOfficial }));
      } catch (err) {
        log.error("[push-sbv-rates] error", { error: err instanceof Error ? err.message : String(err) });
        logVpsPush({ service: "sbv", itemsCount: 0, status: "error", errorMsg: err instanceof Error ? err.message : String(err) });
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
        const db = getDb();

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

        const db = getDb();

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
        logVpsPush({ service: "bctc", itemsCount: 1, status: "ok" });

        // Update queue status
        db.prepare(
          `INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, source_url, attempts, last_attempt)
           VALUES (?, ?, ?, 'fetching', ?, 1, datetime('now'))
           ON CONFLICT(action_code, period_year, period_quarter)
           DO UPDATE SET status = 'fetching', source_url = ?, attempts = attempts + 1, last_attempt = datetime('now')`,
        ).run(actionCode, periodYear, periodQuarter, sourceUrl, sourceUrl);

        // Fire-and-forget: trigger BCTC parse pipeline
        setImmediate(async () => {
          try {
            const { fetchParseAndStoreBctc } = await import("../../application/usecases/fetchParseAndStoreBctc.js");
            await fetchParseAndStoreBctc({
              actionCode,
              year: periodYear,
              quarter: periodQuarter as any,
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

        const db = getDb();
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

        const db = getDb();
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
        const db = getDb();
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
        const db = getDb();
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

        const db = getDb();
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

        const db = getDb();
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

      const db = getDb();
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
          getDb(),
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
