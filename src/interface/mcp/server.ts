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
import { sendTelegramMarket } from "../../infrastructure/notifiers/telegram.js";
import { getDb } from "../../infrastructure/db/schema.js";
import { validateWebhookRequest } from "../../infrastructure/notifiers/telegramWebhookSetup.js";
import { insertReport } from "../../infrastructure/db/telegramReportStore.js";
import { toolRegistry } from "./tools/registry.js";

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
  function createMcpServerInstance(): McpServer {
    const server = new McpServer(
      { name: "vn-market-intelligence", version: "1.0.0" },
      { capabilities: { tools: {} } },
    );
    toolRegistry.forEach((fn) => fn(server));
    return server;
  }

  // Count tools from a probe instance (not connected to any transport)
  const probeServer = createMcpServerInstance();
  const registeredToolsMap = (
    probeServer as unknown as { _registeredTools: Record<string, unknown> }
  )._registeredTools;
  const toolCount = Object.keys(registeredToolsMap ?? {}).length;
  log.info("[createBunServer] Tools registered", { toolCount });

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
      const apiKey = process.env.VPS_PUSH_API_KEY;
      const authHeader = req.headers["x-api-key"] || req.headers["authorization"]?.replace("Bearer ", "");
      if (!apiKey || authHeader !== apiKey) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }

      let body = "";
      for await (const chunk of req) body += chunk;
      try {
        const prices: Array<{
          code: string;
          price: number;
          high?: string;
          low?: string;
          open?: string;
          close?: string;
          volume?: number;
          change_pct?: string;
          fetched_at?: string;
          type?: "stock" | "index" | "global_index";
        }> = JSON.parse(body);

        if (!Array.isArray(prices) || prices.length === 0) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Expected non-empty array" }));
          return;
        }

        const db = getDb();
        const upsert = db.prepare(`
          INSERT OR REPLACE INTO market_prices (code, price, change_pct, volume, updated_at)
          VALUES (?, ?, ?, ?, ?)
        `);

        const now = new Date().toISOString();
        let count = 0;
        for (const p of prices) {
          if (!p.code || p.price == null) continue;
          // VN stocks: VPS API returns price in thousands (57.7 = 57,700 VND)
          // Indices + global: price is already in correct unit
          const isStock = !p.type || p.type === "stock";
          const priceVal = isStock ? p.price * 1000 : p.price;
          const changePct = p.change_pct ? parseFloat(p.change_pct) : null;
          upsert.run(p.code, priceVal, changePct, p.volume ?? 0, p.fetched_at ?? now);
          count++;
        }

        // Store 1-min ticks (today only — for intraday review)
        const histInsert = db.prepare(`
          INSERT OR IGNORE INTO market_prices_history (code, price, volume, fetched_at)
          VALUES (?, ?, ?, ?)
        `);
        for (const p of prices) {
          if (!p.code || p.price == null) continue;
          const isStock = !p.type || p.type === "stock";
          const pv = isStock ? p.price * 1000 : p.price;
          histInsert.run(p.code, pv, p.volume ?? 0, p.fetched_at ?? now);
        }

        // Update daily OHLCV (kept 2+ years for volatility analysis)
        const vnDate = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
        const ohlcvUpsert = db.prepare(`
          INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(code, date) DO UPDATE SET
            high = MAX(daily_ohlcv.high, excluded.high),
            low = MIN(daily_ohlcv.low, excluded.low),
            close = excluded.close,
            volume = excluded.volume,
            updated_at = excluded.updated_at
        `);
        for (const p of prices) {
          if (!p.code || p.price == null) continue;
          const isStock = !p.type || p.type === "stock";
          const pv = isStock ? p.price * 1000 : p.price;
          const high = p.high ? parseFloat(p.high) * (isStock ? 1000 : 1) : pv;
          const low = p.low ? parseFloat(p.low) * (isStock ? 1000 : 1) : pv;
          ohlcvUpsert.run(p.code, vnDate, pv, high, low, pv, p.volume ?? 0, now);
        }

        // Consolidate: keep only the last 24 h of ticks, delete older ones.
        // (daily OHLCV already preserves the day summary for 2+ years)
        // NOTE: must be a rolling 24 h window — an earlier version used
        // `vnDate + "T00:00:00Z"` which is VN midnight expressed as a UTC
        // string. During VN morning hours (UTC previous day) that threshold
        // is in the FUTURE relative to the just-written rows, so every push
        // self-destructed and market_prices_history stayed permanently empty.
        try {
          const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
          db.prepare(`
            DELETE FROM market_prices_history WHERE fetched_at < ?
          `).run(cutoff);
        } catch { /* best effort */ }

        log.info("[push-prices] updated prices + OHLCV + ticks", { count, source: "vps-proxy" });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, updated: count }));

        // ── Async: run signal detection + price alerts after response ────
        // Fire-and-forget — don't block the HTTP response
        setImmediate(async () => {
          try {
            const { detectSignals } = await import("../../domain/services/signalDetector.js");
            const { generateAlerts } = await import("../../domain/services/alertGenerator.js");
            const { storeAlerts } = await import("../../infrastructure/db/alertStore.js");
            const { checkPriceAlerts } = await import("../../domain/services/priceAlertChecker.js");

            const signals: Array<import("../../domain/services/signalDetector.js").Signal> = [];
            const priceMap = new Map<string, number>();

            // Compute avg DAILY volume from market_prices_history.
            // NOTE: market_prices_history is appended every VPS push (intraday ticks),
            // and `volume` is the cumulative daily session volume. Averaging raw rows
            // would compare current cumulative vs an intraday running average, which
            // drifts upward identically for ALL stocks across the session and produces
            // bogus uniform "5.3× spikes" (backlog 878 / Loop #34 manifest).
            // Fix: take the MAX(volume) per trading day (= end-of-day cumulative),
            // exclude today, average the last 20 closed days.
            const avgVolMap = new Map<string, number>();
            const todayUtc = new Date().toISOString().slice(0, 10);
            for (const p of prices) {
              if (!p.code) continue;
              try {
                const row = db.prepare(`
                  SELECT AVG(day_vol) as avg_vol FROM (
                    SELECT MAX(volume) as day_vol
                    FROM market_prices_history
                    WHERE code = ? AND substr(fetched_at, 1, 10) < ?
                    GROUP BY substr(fetched_at, 1, 10)
                    ORDER BY substr(fetched_at, 1, 10) DESC
                    LIMIT 20
                  )
                `).get(p.code, todayUtc) as { avg_vol: number | null } | undefined;
                if (row?.avg_vol && row.avg_vol > 0) avgVolMap.set(p.code, row.avg_vol);
              } catch { /* best effort */ }
            }

            // Detect signals for each stock (skip indices)
            for (const p of prices) {
              if (!p.code || p.price == null) continue;
              const isStock = !p.type || p.type === "stock";
              if (!isStock) continue; // signals only for stocks, not indices
              const priceVnd = p.price * 1000;
              priceMap.set(p.code, priceVnd);
              const changePct = p.change_pct ? parseFloat(p.change_pct) : 0;

              // Use change_pct from VPS API to compute previous price
              const previousPrice = changePct !== 0 ? priceVnd / (1 + changePct / 100) : priceVnd;
              // No fallback: if we lack ≥1 closed-day baseline, set avgVolume=0 so
              // signalDetector suppresses volume_spike entirely (see SD-02).
              const avgVolume = avgVolMap.get(p.code) ?? 0;

              const stockSignals = detectSignals({
                actionCode: p.code,
                price: priceVnd,
                previousPrice,
                volume: p.volume ?? 0,
                avgVolume,
              });

              if (stockSignals.length > 0) {
                signals.push(...stockSignals);
                log.info("[push-prices] signals detected", {
                  code: p.code,
                  signals: stockSignals.map(s => `${s.type}(${s.severity})`).join(", "),
                });
              }
            }

            // Generate and store alerts from signals
            if (signals.length > 0) {
              const watchlistRows = db.prepare("SELECT code FROM watchlist").all() as { code: string }[];
              const watchlistEntries = watchlistRows.map(r => ({ actionCode: r.code }));
              const alerts = generateAlerts(signals, watchlistEntries);

              if (alerts.length > 0) {
                storeAlerts(alerts, db);
                log.info("[push-prices] alerts stored", { count: alerts.length });

                // Send HIGH/CRITICAL alerts to Telegram immediately
                for (const alert of alerts) {
                  if (alert.severity === "high" || alert.severity === "critical") {
                    try {
                      const sevLabel = alert.severity === "critical" ? "NGHIÊM TRỌNG" : "QUAN TRỌNG";
                      const msg = `[${sevLabel}] ${alert.message}`;
                      await sendTelegramMarket(msg);
                      // Mark as notified
                      db.prepare("UPDATE alerts SET notified_telegram = 1 WHERE id = ?").run(alert.id);
                      log.info("[push-prices] Telegram alert sent", { id: alert.id, severity: alert.severity });
                    } catch (tgErr) {
                      log.warn("[push-prices] Telegram send failed", {
                        error: tgErr instanceof Error ? tgErr.message : String(tgErr),
                      });
                    }
                  }
                }
              }
            }

            // Check user-defined price alerts (stop-loss / take-profit)
            try {
              const priceAlertRows = db.prepare(`
                SELECT id, code, alert_type, threshold FROM price_alerts WHERE status = 'active'
              `).all() as { id: number; code: string; alert_type: string; threshold: number }[];

              if (priceAlertRows.length > 0) {
                const triggered = checkPriceAlerts(
                  priceAlertRows.map(r => ({
                    id: r.id,
                    code: r.code,
                    alertType: r.alert_type,
                    threshold: r.threshold,
                  })),
                  priceMap,
                );

                for (const t of triggered) {
                  db.prepare("UPDATE price_alerts SET status = 'triggered', triggered_at = ? WHERE id = ?")
                    .run(new Date().toISOString(), t.alertId);

                  const typeLabel = t.alertType === "stop_loss" ? "CẮT LỖ" : "CHỐT LỜI";
                  const msg = `[${typeLabel}] ${t.code} đạt ngưỡng ${t.threshold.toLocaleString()} VND (hiện tại: ${t.currentPrice.toLocaleString()} VND)`;
                  await sendTelegramMarket(msg);
                  log.info("[push-prices] price alert fired", { code: t.code, type: t.alertType, threshold: t.threshold });
                }
              }
            } catch (paErr) {
              log.warn("[push-prices] price alert check failed", {
                error: paErr instanceof Error ? paErr.message : String(paErr),
              });
            }
          } catch (alertErr) {
            log.warn("[push-prices] post-push alert check failed", {
              error: alertErr instanceof Error ? alertErr.message : String(alertErr),
            });
          }
        });
      } catch (err) {
        log.error("[push-prices] parse error", { error: err instanceof Error ? err.message : String(err) });
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
      return;
    }

    // ── Get all stock codes for VPS proxy (watchlist + reference stocks) ────
    if (method === "GET" && pathname === "/api/watchlist") {
      const apiKey = process.env.VPS_PUSH_API_KEY;
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
