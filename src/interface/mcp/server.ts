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
import { loadConfig } from "../../infrastructure/config.js";
import { createLogger } from "../../infrastructure/logger.js";
import { SseSessionManager } from "./transport.js";
import {
  registerWatchlistTools,
  registerReportTools,
  registerAlertTools,
  registerAnalysisTools,
  registerMarketTools,
} from "./tools/index.js";
import { registerPharmaTools } from "./tools/pharmaTools.js";

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

  // ── Instantiate McpServer ───────────────────────────────────────────────
  const mcpServer = new McpServer(
    { name: "vn-market-intelligence", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  // ── Register all MCP tool groups ────────────────────────────────────────
  registerWatchlistTools(mcpServer);
  registerReportTools(mcpServer);
  registerAlertTools(mcpServer);
  registerAnalysisTools(mcpServer);
  registerMarketTools(mcpServer); // task 084: get_market_snapshot, get_patterns
  registerPharmaTools(mcpServer);  // Sprint 044: get_pharma_signals

  // Count registered tools via the SDK's internal registry
  const registeredToolsMap = (
    mcpServer as unknown as { _registeredTools: Record<string, unknown> }
  )._registeredTools;
  const toolCount = Object.keys(registeredToolsMap ?? {}).length;
  log.info("[createBunServer] Tools registered", { toolCount });

  // ── Session manager handles SSE + message routing ──────────────────────
  const sessions = new SseSessionManager(mcpServer, log);

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
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, mcp-session-id",
    );

    if (method === "OPTIONS") {
      res.writeHead(204);
      res.end();
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
      log.info("[createBunServer] MCP server ready", { port, host });
      resolve();
    });
  });

  // ── Return the instance handle ──────────────────────────────────────────
  return {
    port,
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
