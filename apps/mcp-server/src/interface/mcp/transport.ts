/**
 * Interface — MCP SSE Transport Manager
 *
 * Manages a map of active SSE sessions (sessionId → SSEServerTransport).
 * Each GET /sse connection creates a new session; each POST /messages
 * dispatch is routed to the correct session via the sessionId query param.
 *
 * This module is a thin wrapper; the actual SSE protocol framing is
 * handled by @modelcontextprotocol/sdk SSEServerTransport.
 *
 * HEARTBEAT FIX (2026-05-05): Added keep-alive heartbeat messages every 30s
 * to prevent connection timeouts through proxies/Cloudflare.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Logger } from "../../infrastructure/logger.js";

/** Factory function that creates a fresh McpServer with all tools registered. */
export type McpServerFactory = () => McpServer;

/**
 * Manages the set of active SSE sessions and routes POST messages to them.
 * Each session gets its own McpServer instance (MCP SDK limitation:
 * one transport per server).
 */
export class SseSessionManager {
  private readonly sessions = new Map<string, SSEServerTransport>();
  private readonly heartbeatIntervals = new Map<string, ReturnType<typeof setInterval>>();
  private readonly HEARTBEAT_INTERVAL: number;

  constructor(
    private readonly createServer: McpServerFactory,
    private readonly log: Logger,
    private readonly pathPrefix: string = "", // Cloudflare path prefix (e.g. "/vn-market")
    _heartbeatIntervalMs: number = 30_000, // Overridable in tests; default 30s
  ) {
    this.HEARTBEAT_INTERVAL = _heartbeatIntervalMs;
  }

  /**
   * Handles GET /sse — opens an SSE stream and registers the session.
   * Creates a dedicated McpServer instance per connection.
   *
   * @param req - Incoming HTTP request
   * @param res - Outgoing HTTP response (kept open as SSE stream)
   */
  async handleSse(req: IncomingMessage, res: ServerResponse): Promise<void> {
    this.log.info("[SseSessionManager] New SSE connection");

    // Include pathPrefix in the endpoint so clients can find the POST endpoint through Cloudflare
    const endpoint = `${this.pathPrefix}/messages`;
    const transport = new SSEServerTransport(endpoint, res);
    const sessionId = transport.sessionId;

    this.sessions.set(sessionId, transport);

    // Start heartbeat to keep connection alive through proxies
    this.log.info("[SseSessionManager] Setting up heartbeat", {
      sessionId,
      intervalMs: this.HEARTBEAT_INTERVAL,
    });
    
    const heartbeatInterval = setInterval(() => {
      try {
        // Send comment-only frame (ignored by clients but keeps connection alive)
        res.write(": keep-alive\n\n");
      } catch (err) {
        this.log.info("[SseSessionManager] Heartbeat write failed — client disconnected", {
          sessionId,
          error: err instanceof Error ? err.message : String(err),
        });
        clearInterval(heartbeatInterval);
        this.sessions.delete(sessionId);
        this.heartbeatIntervals.delete(sessionId);
        this.log.info("[SseSessionManager] Session evicted after heartbeat failure", { sessionId });
      }
    }, this.HEARTBEAT_INTERVAL);

    this.heartbeatIntervals.set(sessionId, heartbeatInterval);

    // Clean up when the client disconnects
    res.on("close", () => {
      this.sessions.delete(sessionId);
      const interval = this.heartbeatIntervals.get(sessionId);
      if (interval) {
        clearInterval(interval);
        this.heartbeatIntervals.delete(sessionId);
      }
      this.log.info("[SseSessionManager] Session closed", { sessionId });
    });

    // Each session gets its own McpServer instance
    const mcpServer = this.createServer();
    await mcpServer.connect(transport);
  }

  /**
   * Handles POST /messages — dispatches a JSON-RPC message to the correct session.
   *
   * @param req       - Incoming HTTP request (contains the JSON-RPC body)
   * @param res       - HTTP response (carries the acknowledgement)
   * @param sessionId - The session to route to (from ?sessionId= query param)
   */
  async handleMessage(
    req: IncomingMessage,
    res: ServerResponse,
    sessionId: string,
  ): Promise<void> {
    const transport = this.sessions.get(sessionId);

    if (!transport) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "session_not_found", sessionId }));
      return;
    }

    await transport.handlePostMessage(req, res);
  }

  /** Returns the current number of active SSE sessions. */
  get sessionCount(): number {
    return this.sessions.size;
  }
}
