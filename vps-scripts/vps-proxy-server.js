#!/usr/bin/env node
/**
 * VPS HTTP Proxy Server
 *
 * Lightweight Node.js HTTP server running on Vinahost Vietnam VPS.
 * Provides proxy endpoints for VN financial portals that are geo-blocked
 * or unreachable from France/Docker.
 *
 * Endpoints:
 *
 *   GET /proxy/ssc-iboard/dcm/financials/ticker/:ticker
 *     → forwards to https://iboard-query.ssc.vn/dcm/financials/ticker/:ticker
 *     → returns the JSON response verbatim
 *     NOTE: iboard-query.ssc.vn is NXDOMAIN as of 2026-04-27 (dead domain).
 *     Endpoint kept for forward-compatibility if domain is restored.
 *
 *   GET /bctc-files/:code/:filename
 *     → serves /root/bctc-cache/<code>/<filename> as application/pdf
 *     → PDFs are downloaded by mcp-server BCTC discovery (task 1822d-a);
 *       URL stored in bctc_vps_queue.source_url as http://<VPS_IP>:8765/bctc-files/<CODE>/<filename>
 *     → Auth: X-API-Key required (same as other endpoints)
 *     → Dir configurable via BCTC_CACHE_DIR env var (default: /root/bctc-cache)
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
const fs = require("fs");
const path = require("path");

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.VPS_PROXY_PORT || "8765", 10);
const API_KEY = process.env.VPS_API_KEY || process.env.VPS_PUSH_API_KEY || "";

/** Upstream iboard base URL — never changes. The whole point is to proxy this. */
const IBOARD_UPSTREAM = "https://iboard-query.ssc.vn";

/** Allowed proxy prefix path. Only this path is proxied. */
const SSC_PROXY_PREFIX = "/proxy/ssc-iboard";

/**
 * Static file serving for cached BCTC PDFs.
 * Path pattern: /bctc-files/:code/:filename
 * Files are stored at BCTC_CACHE_DIR/<code>/<filename> by mcp-server BCTC discovery.
 */
const BCTC_FILES_PREFIX = "/bctc-files/";

/** Root directory for BCTC PDF cache. Configurable via env var. */
const BCTC_CACHE_DIR = process.env.BCTC_CACHE_DIR || "/root/bctc-cache";

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
      upstreams: {
        ssc_iboard: IBOARD_UPSTREAM,
        bctc_cache: BCTC_CACHE_DIR,
      },
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

  // BCTC file serving
  //   Incoming: /bctc-files/<CODE>/<filename>
  //   Serves:   BCTC_CACHE_DIR/<code>/<filename> (PDF downloaded by mcp-server BCTC discovery)
  if (url.startsWith(BCTC_FILES_PREFIX)) {
    // Strip prefix: /bctc-files/VCB/some-file.pdf → VCB/some-file.pdf
    const subPath = url.slice(BCTC_FILES_PREFIX.length).split("?")[0];
    // Decode percent-encoding (ticker and filename from Python urllib.parse.quote)
    let decodedSubPath;
    try {
      decodedSubPath = decodeURIComponent(subPath);
    } catch (_e) {
      return jsonResponse(res, 400, { error: "Invalid URL encoding", path: url });
    }

    // Security: path must be <CODE>/<filename>, no directory traversal
    const parts = decodedSubPath.split("/").filter(Boolean);
    if (parts.length !== 2) {
      return jsonResponse(res, 400, { error: "Path must be /bctc-files/<code>/<filename>" });
    }
    const [codeSegment, filenameSegment] = parts;

    // Validate: ticker is uppercase letters+digits (3-10 chars)
    if (!/^[A-Z0-9]{1,10}$/i.test(codeSegment)) {
      return jsonResponse(res, 400, { error: "Invalid ticker in path", code: codeSegment });
    }
    // Validate: filename must end with .pdf, no path separators
    if (!/\.pdf$/i.test(filenameSegment) || filenameSegment.includes("/") || filenameSegment.includes("..")) {
      return jsonResponse(res, 400, { error: "Filename must be a .pdf, no traversal", filename: filenameSegment });
    }

    const filePath = path.join(BCTC_CACHE_DIR, codeSegment.toUpperCase(), filenameSegment);

    // Ensure resolved path is still inside BCTC_CACHE_DIR (defence-in-depth)
    const resolvedCache = path.resolve(BCTC_CACHE_DIR);
    const resolvedFile = path.resolve(filePath);
    if (!resolvedFile.startsWith(resolvedCache + path.sep)) {
      log("WARN", `Path traversal attempt blocked: ${resolvedFile}`);
      return jsonResponse(res, 403, { error: "Forbidden" });
    }

    if (!fs.existsSync(resolvedFile)) {
      log("WARN", `BCTC file not found: ${resolvedFile}`);
      return jsonResponse(res, 404, { error: "File not found", code: codeSegment, filename: filenameSegment });
    }

    const stat = fs.statSync(resolvedFile);
    log("INFO", `BCTC file serve: ${resolvedFile} (${stat.size}B)`);
    res.writeHead(200, {
      "Content-Type": "application/pdf",
      "Content-Length": stat.size,
      "Content-Disposition": `attachment; filename="${filenameSegment}"`,
      "Cache-Control": "public, max-age=86400",
      "X-Proxy-Source": "bctc-cache",
    });
    fs.createReadStream(resolvedFile).pipe(res);
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
  log("INFO", `BCTC files:       GET /bctc-files/:code/:filename (serves cached PDFs)`);
  log("INFO", `Health check:     GET /health`);
  log("INFO", `BCTC cache dir:   ${BCTC_CACHE_DIR}`);
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
