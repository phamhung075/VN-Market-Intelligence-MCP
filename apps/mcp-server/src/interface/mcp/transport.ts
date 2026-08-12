/**
 * Interface — MCP SSE Transport Manager
 *
 * size-justification: 241L — single cohesive SSE session-lifecycle
 * manager: one `SessionRecord` map, one reaper (idle + max-age), and one
 * `evictSession()` method that every trigger (client close, heartbeat-write
 * failure, idle reap, max-age reap, explicit DELETE) funnels through, so
 * `mcpServer.close()` (cascades to `transport.close()`, confirmed via
 * installed SDK source) is never missed. This consolidation REPLACED two
 * parallel Maps + two duplicated inline cleanup blocks
 * (FIX-MCP-SSE-SESSION-MANAGER-PERCONN-LEAK-NO-REAPER, 2026-08-08) that had
 * leaked ~22% of sessions' McpServer instances (183-tool registration graph
 * each) and killed the container in <7h. Splitting the map/reaper/handlers
 * across files would force >=2 call sites back onto shared session state —
 * reintroducing exactly the missed-eviction-path bug this file exists to
 * close, for zero cohesion benefit. Full design + fix history (incl. the
 * FIX-SSE-SOAK-VERIFY-DEPENDS-ON-SHARED-CONTAINER-UPTIME-3RD-RESET
 * injectable-clock follow-up, 2026-08-09):
 * docs/architecture-briefs/2026-08-07-fix-mcp-sse-session-manager-reaper.md
 * (`git log -- <this file>` for the full commit-by-commit narrative).
 *
 * Manages a map of active SSE sessions (sessionId → SessionRecord). Each
 * GET /sse connection creates a new session; each POST /messages dispatch
 * is routed to the correct session via the sessionId query param. This
 * module is a thin wrapper — the actual SSE protocol framing is handled by
 * @modelcontextprotocol/sdk's SSEServerTransport. Heartbeats every 30s
 * prevent connection timeouts through proxies/Cloudflare. `_now` is an
 * injectable clock (default `Date.now`, same override idiom as
 * `_heartbeatIntervalMs`/`_idleTimeoutMs`/`_maxAgeMs`/`_reaperIntervalMs`)
 * so tests can advance a fake clock past the real 4h max-age threshold
 * instantly instead of needing real wall-clock/container uptime — see
 * T13/T14 in `1862c-transport-session-eviction.test.ts`.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Logger } from "../../infrastructure/logger.js";

/** Factory function that creates a fresh McpServer with all tools registered. */
export type McpServerFactory = () => McpServer;

/** Per-session state — one record per active SSE connection. */
interface SessionRecord {
  transport: SSEServerTransport;
  mcpServer: McpServer;
  heartbeatInterval: ReturnType<typeof setInterval>;
  /** Epoch ms — max-age basis (independent of activity). */
  createdAt: number;
  /** Epoch ms — idle-timeout basis, bumped by every handleMessage() call. */
  lastActivityAt: number;
}

/**
 * Manages the set of active SSE sessions and routes POST messages to them.
 * Each session gets its own McpServer instance (MCP SDK limitation:
 * one transport per server).
 *
 * A single background reaper sweeps for idle/max-age sessions on a fixed
 * cadence, and every eviction trigger (client close, heartbeat failure,
 * idle reap, max-age reap, explicit DELETE) funnels through one
 * `evictSession()` method so `mcpServer.close()` is never missed again.
 */
export class SseSessionManager {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly reaperInterval: ReturnType<typeof setInterval>;
  private readonly HEARTBEAT_INTERVAL: number;
  private readonly IDLE_TIMEOUT: number;
  private readonly MAX_AGE: number;
  private readonly now: () => number;

  constructor(
    private readonly createServer: McpServerFactory,
    private readonly log: Logger,
    private readonly pathPrefix: string = "", // Cloudflare path prefix (e.g. "/vn-market")
    _heartbeatIntervalMs: number = 30_000, // Overridable in tests; default 30s
    // Idle/max-age thresholds are informed-not-derived defaults (same override
    // idiom as _heartbeatIntervalMs) — see design brief §2.2 for rationale.
    _idleTimeoutMs: number = 15 * 60_000, // 15 min — generous headroom above plausible human think-time
    _maxAgeMs: number = 4 * 60 * 60_000, // 4h — hard backstop independent of activity
    _reaperIntervalMs: number = 60_000, // Reaper sweep cadence
    // Injectable clock (FIX-SSE-SOAK-VERIFY-DEPENDS-ON-SHARED-CONTAINER-UPTIME-3RD-RESET,
    // 2026-08-09): defaults to the real wall clock; tests override with a
    // fake, test-controlled clock so the >=4h max-age branch can be proven
    // by advancing time instantly instead of requiring >=4h of real
    // wall-clock/container uptime. Same override idiom as the params above.
    _now: () => number = Date.now,
  ) {
    this.HEARTBEAT_INTERVAL = _heartbeatIntervalMs;
    this.IDLE_TIMEOUT = _idleTimeoutMs;
    this.MAX_AGE = _maxAgeMs;
    this.now = _now;
    this.reaperInterval = setInterval(() => this.reapStaleSessions(), _reaperIntervalMs);
    // Don't hold the event loop open on the reaper alone (mirrors the
    // periodic-reaper pattern already used by startPeriodicReaper()).
    this.reaperInterval.unref?.();
  }

  /**
   * Single eviction path — every trigger (res.close / heartbeat-fail /
   * idle-reap / max-age-reap / DELETE) calls this. Idempotent: a
   * concurrently-firing second trigger for the same sessionId is a no-op.
   */
  private async evictSession(sessionId: string, reason: string): Promise<void> {
    const record = this.sessions.get(sessionId);
    if (!record) return; // already evicted by another trigger — safe no-op
    this.sessions.delete(sessionId);
    clearInterval(record.heartbeatInterval);
    this.log.info("[SseSessionManager] Session evicted", { sessionId, reason });
    try {
      // mcpServer.close() cascades to transport.close() (ends the SSE
      // response stream) — no need to also call transport.close() separately.
      await record.mcpServer.close();
    } catch (err) {
      this.log.warn("[SseSessionManager] mcpServer.close() failed during eviction (non-fatal)", {
        sessionId,
        reason,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /** Sweeps all sessions for idle-timeout or max-age expiry. Runs on `reaperInterval`. */
  private reapStaleSessions(): void {
    const now = this.now();
    for (const [sessionId, record] of this.sessions) {
      const ageFor = now - record.createdAt;
      const idleFor = now - record.lastActivityAt;
      if (ageFor > this.MAX_AGE) {
        void this.evictSession(sessionId, "max_age");
      } else if (idleFor > this.IDLE_TIMEOUT) {
        void this.evictSession(sessionId, "idle_timeout");
      }
    }
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
    const now = this.now();

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
        void this.evictSession(sessionId, "heartbeat_write_failure");
      }
    }, this.HEARTBEAT_INTERVAL);

    // Each session gets its own McpServer instance
    const mcpServer = this.createServer();

    this.sessions.set(sessionId, {
      transport,
      mcpServer,
      heartbeatInterval,
      createdAt: now,
      lastActivityAt: now,
    });

    // Clean up when the client disconnects
    res.on("close", () => {
      this.log.info("[SseSessionManager] Session closed", { sessionId });
      void this.evictSession(sessionId, "connection_closed");
    });

    await mcpServer.connect(transport);
  }

  /**
   * Handles POST /messages — dispatches a JSON-RPC message to the correct session.
   * Bumps the session's lastActivityAt — this is the idle-timeout basis.
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
    const record = this.sessions.get(sessionId);

    if (!record) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "session_not_found", sessionId }));
      return;
    }

    record.lastActivityAt = this.now();
    await record.transport.handlePostMessage(req, res);
  }

  /**
   * Explicit client-initiated teardown — DELETE /sse?sessionId=<id> or
   * DELETE /messages?sessionId=<id>. Defense-in-depth, not the primary fix:
   * the dominant caller (gateway MCP server) is out-of-repo and cannot be
   * made to send this; the idle/max-age reaper is what actually bounds the
   * leak regardless of caller behavior.
   *
   * @returns true if a session existed and was evicted, false if unknown.
   */
  async closeSession(sessionId: string): Promise<boolean> {
    const existed = this.sessions.has(sessionId);
    if (existed) await this.evictSession(sessionId, "client_delete");
    return existed;
  }

  /** Returns the current number of active SSE sessions. */
  get sessionCount(): number {
    return this.sessions.size;
  }

  /** Stops the reaper timer — graceful shutdown / test teardown. */
  stopReaper(): void {
    clearInterval(this.reaperInterval);
  }
}
