/**
 * Interface — MCP SSE Transport Manager
 *
 * Manages a map of active SSE sessions (sessionId → SSEServerTransport).
 * Each GET /sse connection creates a new session; each POST /messages
 * dispatch is routed to the correct session via the sessionId query param.
 *
 * This module is a thin wrapper; the actual SSE protocol framing is
 * handled by @modelcontextprotocol/sdk SSEServerTransport.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Logger } from "../../infrastructure/logger.js";

/**
 * Manages the set of active SSE sessions and routes POST messages to them.
 */
export class SseSessionManager {
  private readonly sessions = new Map<string, SSEServerTransport>();

  constructor(
    private readonly mcpServer: McpServer,
    private readonly log: Logger,
  ) {}

  /**
   * Handles GET /sse — opens an SSE stream and registers the session.
   *
   * @param req - Incoming HTTP request
   * @param res - Outgoing HTTP response (kept open as SSE stream)
   */
  async handleSse(req: IncomingMessage, res: ServerResponse): Promise<void> {
    this.log.info("[SseSessionManager] New SSE connection");

    const transport = new SSEServerTransport("/messages", res);

    this.sessions.set(transport.sessionId, transport);
    this.log.debug("[SseSessionManager] Session registered", {
      sessionId: transport.sessionId,
    });

    // Clean up when the client disconnects
    res.on("close", () => {
      this.sessions.delete(transport.sessionId);
      this.log.debug("[SseSessionManager] Session removed", {
        sessionId: transport.sessionId,
      });
    });

    // Wire transport to the MCP server — starts the SSE stream
    await this.mcpServer.connect(transport);
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
      res.end(JSON.stringify({ error: `Session not found: ${sessionId}` }));
      return;
    }

    await transport.handlePostMessage(req, res);
  }

  /** Returns the current number of active SSE sessions. */
  get sessionCount(): number {
    return this.sessions.size;
  }
}
