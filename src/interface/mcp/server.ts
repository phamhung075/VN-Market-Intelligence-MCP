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
import { logVpsPush } from "../../infrastructure/db/vpsPushLogStore.js";
import { upsertForeignFlow, type ForeignFlowUpsertItem } from "../../infrastructure/db/vnstockStore.js";
import { buildForeignFlowStatusResponse } from "./foreignFlowStatusHandler.js";

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
          logVpsPush({ service: "prices", itemsCount: 0, status: "error", errorMsg: "Empty request body" });
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Empty request body" }));
          return;
        }
        const prices: Array<{
          code: string;
          price: number;
          high?: string;
          low?: string;
          open?: string;
          close?: string;
          volume?: number;
          change_pct?: string;
          ref_price?: string;
          fetched_at?: string;
          type?: "stock" | "index" | "global_index";
        }> = JSON.parse(body);

        if (!Array.isArray(prices) || prices.length === 0) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Expected non-empty array" }));
          return;
        }

        // 1193: Capture handler start time BEFORE the upsert loop for lag_ms measurement
        const startMs = Date.now();

        const db = getDb();
        const upsert = db.prepare(`
          INSERT OR REPLACE INTO market_prices (code, price, change_pct, volume, updated_at)
          VALUES (?, ?, ?, ?, ?)
        `);

        const now = new Date().toISOString();
        const vnDate = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
        let count = 0;
        for (const p of prices) {
          if (!p.code || p.price == null) continue;
          // VN stocks: VPS API returns price in thousands (57.7 = 57,700 VND)
          // Indices + global: price is already in correct unit
          const isStock = !p.type || p.type === "stock";
          const priceVal = isStock ? p.price * 1000 : p.price;
          // Prefer computing change_pct from ref_price (exchange reference/previous
          // close) — VPS API .changePc may have wrong sign (report #1078: FPT
          // showed +0.64% instead of -0.64%). ref_price is .r from VPS API.
          // Fallback chain: ref_price → yesterday's OHLCV close → raw VPS change_pct.
          let changePct: number | null = null;
          const refPrice = p.ref_price ? parseFloat(p.ref_price) : 0;
          if (isStock && refPrice > 0) {
            const refPriceVnd = refPrice * 1000;
            changePct = Math.round(((priceVal - refPriceVnd) / refPriceVnd) * 10000) / 100;
          } else if (isStock) {
            // Before VPS redeploy: compute from yesterday's close in daily_ohlcv
            try {
              const prevRow = db.prepare<{ close: number }, [string, string]>(
                `SELECT close FROM daily_ohlcv WHERE code = ? AND date < ? ORDER BY date DESC LIMIT 1`,
              ).get(p.code, vnDate);
              if (prevRow && prevRow.close > 0) {
                changePct = Math.round(((priceVal - prevRow.close) / prevRow.close) * 10000) / 100;
              } else {
                changePct = p.change_pct ? parseFloat(p.change_pct) : null;
              }
            } catch {
              changePct = p.change_pct ? parseFloat(p.change_pct) : null;
            }
          } else {
            changePct = p.change_pct ? parseFloat(p.change_pct) : null;
          }
          // Task 1208: use server receive time (now), not VPS API timestamp (p.fetched_at)
          upsert.run(p.code, priceVal, changePct, p.volume ?? 0, now);
          count++;
        }

        // 1193: Post-upsert verification — catch DB singleton stale-FD failures.
        // Runs synchronously before sending the HTTP response so any write failure
        // is surfaced in the server log immediately (not deferred to next cycle).
        try {
          const verified = db.prepare(
            `SELECT COUNT(*) AS n FROM market_prices WHERE updated_at >= ?`,
          ).get(new Date(Date.now() - 5000).toISOString()) as { n: number };
          log.info("[push-prices] post-upsert verify", {
            inserted: count,
            visible: verified.n,
            lag_ms: Date.now() - startMs,
          });
          if (verified.n === 0 && count > 0) {
            log.error("[push-prices] WRITE INVISIBLE — DB singleton may be stale", {
              db_path: Bun.env["DB_PATH"] ?? "(unset)",
            });
          }
        } catch (verifyErr) {
          log.warn("[push-prices] post-upsert verify failed", {
            error: verifyErr instanceof Error ? verifyErr.message : String(verifyErr),
          });
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
        logVpsPush({ service: "prices", itemsCount: count, status: "ok" });
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
              // Compute previous price from ref_price (exchange reference) if available,
              // otherwise fall back to VPS change_pct (may have wrong sign — report #1078)
              const refP = p.ref_price ? parseFloat(p.ref_price) : 0;
              let previousPrice: number;
              if (refP > 0) {
                previousPrice = refP * 1000; // ref_price is in thousands like price
              } else {
                const pctFallback = p.change_pct ? parseFloat(p.change_pct) : 0;
                previousPrice = pctFallback !== 0 ? priceVnd / (1 + pctFallback / 100) : priceVnd;
              }
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
                      await sendTelegramMarket(msg, {
                        persist: { from_agent: "mcp-user", message_type: "user_ask_reply" },
                      });
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
                  await sendTelegramMarket(msg, {
                    persist: { from_agent: "mcp-user", message_type: "user_ask_reply" },
                  });
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
        logVpsPush({ service: "prices", itemsCount: 0, status: "error", errorMsg: err instanceof Error ? err.message : String(err) });
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
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

      let body = "";
      for await (const chunk of req) body += chunk;
      try {
        if (!body.trim()) {
          logVpsPush({ service: "foreign-flow", itemsCount: 0, status: "error", errorMsg: "Empty request body" });
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Empty request body" }));
          return;
        }

        const rawItems: unknown[] = JSON.parse(body);

        if (!Array.isArray(rawItems) || rawItems.length === 0) {
          logVpsPush({ service: "foreign-flow", itemsCount: 0, status: "error", errorMsg: "Expected non-empty array" });
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Expected non-empty array" }));
          return;
        }

        // Normalise VPS payload format → ForeignFlowUpsertItem.
        // VPS script (fetch-foreign-flow.sh) sends camelCase fields without `date`:
        //   { code, foreignBuyVol, foreignSellVol, foreignRoom }
        // ForeignFlowUpsertItem expects snake_case + date:
        //   { code, date, foreign_volume, foreign_room, holding_ratio, fetched_at }
        const todayUtc = new Date().toISOString().slice(0, 10);
        const items: ForeignFlowUpsertItem[] = (rawItems as Record<string, unknown>[]).map((raw) => {
          const buyVol  = typeof raw.foreignBuyVol  === "number" ? raw.foreignBuyVol  : 0;
          const sellVol = typeof raw.foreignSellVol === "number" ? raw.foreignSellVol : 0;
          return {
            code:            typeof raw.code           === "string" ? raw.code           : String(raw.code ?? ""),
            date:            (typeof raw.date          === "string" && raw.date) ? raw.date : todayUtc,
            foreign_volume:  typeof raw.foreign_volume === "number" ? raw.foreign_volume : (buyVol - sellVol),
            foreign_room:    typeof raw.foreign_room   === "number" ? raw.foreign_room
                           : typeof raw.foreignRoom    === "number" ? raw.foreignRoom
                           : null,
            holding_ratio:   typeof raw.holding_ratio  === "number" ? raw.holding_ratio  : null,
            fetched_at:      typeof raw.fetched_at     === "string" ? raw.fetched_at     : null,
          };
        });

        const upserted = upsertForeignFlow(items);
        log.info("[push-foreign-flow] upserted rows", { count: upserted, source: "vps-proxy" });
        logVpsPush({ service: "foreign-flow", itemsCount: upserted, status: "ok" });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, upserted }));
      } catch (err) {
        log.error("[push-foreign-flow] parse error", { error: err instanceof Error ? err.message : String(err) });
        logVpsPush({ service: "foreign-flow", itemsCount: 0, status: "error", errorMsg: err instanceof Error ? err.message : String(err) });
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
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

        logVpsPush({ service: "news", itemsCount: items.length, status: "ok" });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, received: items.length }));
      } catch (err) {
        log.error("[push-news] parse error", { error: err instanceof Error ? err.message : String(err) });
        logVpsPush({ service: "news", itemsCount: 0, status: "error", errorMsg: err instanceof Error ? err.message : String(err) });
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
        // so VPS can fetch directly without re-discovery
        const { enrichQueueWithPdfUrls, buildQueueSourceHints } = await import(
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

        const enriched = await enrichQueueWithPdfUrls(
          pendingRows.map((r) => ({
            action_code: r.action_code,
            period_year: r.period_year,
            period_quarter: r.period_quarter,
            source_url: r.source_url,
          })),
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

        const queue = enriched.map((r) => ({
          action_code: r.action_code,
          period_year: r.period_year,
          period_quarter: r.period_quarter,
          source_hints: buildQueueSourceHints(r),
        }));

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ queue, total: queue.length }));
      } catch (err) {
        log.error("[bctc-fetch-queue] error", { error: err instanceof Error ? err.message : String(err) });
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
        if (!pdfBuffer || !(pdfBuffer instanceof Buffer) || pdfBuffer.length < 100) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing or empty pdf file" }));
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
        log.error("[push-bctc-pdf] error", { error: err instanceof Error ? err.message : String(err) });
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
