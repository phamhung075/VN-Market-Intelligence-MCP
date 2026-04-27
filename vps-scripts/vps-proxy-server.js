#!/usr/bin/env node
/**
 * VPS HTTP Proxy Server — fix/bctc-ssc-vps-proxy
 *
 * Lightweight Node.js HTTP server running on Vinahost Vietnam VPS.
 * Provides a single proxy endpoint that forwards iboard-query.ssc.vn
 * API calls from the geo-blocked MCP server (France/Docker) through
 * the VPS (Vietnam IP, no geo-block).
 *
 * Endpoint:
 *   GET /proxy/ssc-iboard/dcm/financials/ticker/:ticker
 *     → forwards to https://iboard-query.ssc.vn/dcm/financials/ticker/:ticker
 *     → returns the JSON response verbatim
 *
 * Health:
 *   GET /health → 200 { ok: true, service: "vps-proxy" }
 *
 * Port: 8765 (configurable via VPS_PROXY_PORT env var)
 *
 * Security:
 *   - Only accepts requests with X-API-Key header matching VPS_API_KEY.
 *     (same key used by other VPS services, stored in .env on VPS)
 *   - Only proxies to the iboard-query.ssc.vn domain (no open proxy).
 *   - No TLS termination (VPS is accessed over private channel by IP).
 *
 * Deployment:
 *   Managed by vn-vps-proxy.service (systemd, Restart=always).
 *   Deploy via: ./scripts/deploy-vinahost.sh
 *
 * @module vps-scripts/vps-proxy-server
 */

"use strict";

const http = require("http");
const https = require("https");

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.VPS_PROXY_PORT || "8765", 10);
const API_KEY = process.env.VPS_API_KEY || process.env.VPS_PUSH_API_KEY || "";

/** Upstream iboard base URL — never changes. The whole point is to proxy this. */
const IBOARD_UPSTREAM = "https://iboard-query.ssc.vn";

/** Allowed proxy prefix path. Only this path is proxied. */
const SSC_PROXY_PREFIX = "/proxy/ssc-iboard";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch a URL via HTTPS and return the body as a string.
 * Rejects on HTTP error or timeout.
 */
function fetchUpstream(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      req.destroy(new Error(`Upstream timeout after ${timeoutMs}ms: ${url}`));
    }, timeoutMs);

    const req = https.get(
      url,
      {
        headers: {
          "User-Agent": BROWSER_UA,
          Accept: "application/json, */*",
        },
      },
      (res) => {
        clearTimeout(timer);
        if (res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          reject(new Error(`Upstream HTTP ${res.statusCode} from ${url}`));
          return;
        }
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        res.on("error", reject);
      },
    );

    req.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function jsonResponse(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function log(level, msg, extra) {
  const ts = new Date().toISOString();
  const line = extra
    ? `${ts} [PROXY] ${level}  ${msg} | ${JSON.stringify(extra)}`
    : `${ts} [PROXY] ${level}  ${msg}`;
  process.stdout.write(line + "\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Request handler
// ─────────────────────────────────────────────────────────────────────────────

async function handleRequest(req, res) {
  const url = req.url || "/";

  // Health check — no auth required
  if (url === "/health" || url === "/health/") {
    return jsonResponse(res, 200, {
      ok: true,
      service: "vps-proxy",
      upstreams: { ssc_iboard: IBOARD_UPSTREAM },
    });
  }

  // API key check — required for all proxy paths
  if (API_KEY) {
    const key = req.headers["x-api-key"] || req.headers["x-api-Key"] || "";
    if (key !== API_KEY) {
      log("WARN", `401 Unauthorized from ${req.socket.remoteAddress}`);
      return jsonResponse(res, 401, { error: "Unauthorized" });
    }
  }

  // SSC iboard proxy
  //   Incoming: /proxy/ssc-iboard/dcm/financials/ticker/<TICKER>
  //   Upstream: https://iboard-query.ssc.vn/dcm/financials/ticker/<TICKER>
  if (url.startsWith(SSC_PROXY_PREFIX)) {
    const upstreamPath = url.slice(SSC_PROXY_PREFIX.length); // /dcm/financials/ticker/<TICKER>
    const upstreamUrl = `${IBOARD_UPSTREAM}${upstreamPath}`;

    log("INFO", `SSC proxy: GET ${upstreamUrl}`);

    try {
      const body = await fetchUpstream(upstreamUrl, 10_000);
      const payload = Buffer.from(body, "utf8");
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Content-Length": payload.byteLength,
        "X-Proxy-Source": "iboard-query.ssc.vn",
      });
      res.end(payload);
      log("INFO", `SSC proxy OK: ${upstreamUrl} (${payload.byteLength}B)`);
    } catch (err) {
      log("ERROR", `SSC proxy FAIL: ${upstreamUrl}`, { error: err.message });
      jsonResponse(res, 502, { error: "Bad gateway", detail: err.message });
    }
    return;
  }

  // Unknown route
  jsonResponse(res, 404, { error: "Not found", path: url });
}

// ─────────────────────────────────────────────────────────────────────────────
// Server
// ─────────────────────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((err) => {
    log("ERROR", "Unhandled handler error", { error: err.message });
    if (!res.headersSent) {
      jsonResponse(res, 500, { error: "Internal server error" });
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  log("INFO", `VPS proxy server listening on 0.0.0.0:${PORT}`);
  log("INFO", `SSC iboard proxy: GET /proxy/ssc-iboard/dcm/financials/ticker/:ticker`);
  log("INFO", `Health check:     GET /health`);
  if (!API_KEY) {
    log("WARN", "VPS_API_KEY is not set — proxy accepts all requests (insecure)");
  }
});

server.on("error", (err) => {
  log("ERROR", "Server error", { error: err.message });
  process.exit(1);
});

process.on("SIGTERM", () => {
  log("INFO", "SIGTERM received — shutting down");
  server.close(() => process.exit(0));
});

process.on("SIGINT", () => {
  log("INFO", "SIGINT received — shutting down");
  server.close(() => process.exit(0));
});
