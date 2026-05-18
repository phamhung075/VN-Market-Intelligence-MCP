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
 *   GET /proxy/ssc-insider
 *     → forwards to https://congbothongtin.ssc.gov.vn/faces/oracle/webcenter/portalapp/pages/giaodichnoibo/ketquagiaodich.jspx
 *     → returns the HTML response verbatim (text/html)
 *     → Auth: X-API-Key required
 *     → Added: 1922a (fixes insider_transactions 0 rows — SSC portal geo-blocked from France)
 *
 *   GET /proxy/muasamcong
 *     → forwards to https://muasamcong.mpi.gov.vn[?path=<path>]
 *     → accepts optional ?path= query param appended to upstream URL
 *     → returns the HTML response verbatim (text/html)
 *     → Auth: X-API-Key required
 *     → Added: muasamcong (Vietnamese government procurement portal)
 *
 *   GET /proxy/bctc-discover/:ticker
 *     → shells out to /root/discover-bctc-urls-browser.py <TICKER> [<YEAR> [<QUARTER>]]
 *     → returns JSON envelope: { results: [{url: string, source: string, confidence: number}], error: null }
 *     → returns { results: [], error: null } on script failure, empty result, or timeout (never 5xx for empty)
 *     → Auth: X-API-Key required
 *     → TICKER must match /^[A-Z0-9]{1,10}$/i; year/quarter are optional query params
 *     → Added: 1916a-vps-part (fixes bctcQueueEnricherJob Strategy 0 dead route)
 *     → Shape fix: 1944a-vps (bare string[] → envelope, matches extractVpsPlaywrightUrls() parser)
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
const { spawn } = require("child_process");

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
 * SSC insider transaction portal URL — geo-blocked outside Vietnam.
 * Proxied at /proxy/ssc-insider (Task 1922a).
 */
const SSC_INSIDER_UPSTREAM =
  "https://congbothongtin.ssc.gov.vn/faces/oracle/webcenter/portalapp/pages/giaodichnoibo/ketquagiaodich.jspx";

/** Path for the SSC insider proxy endpoint. */
const SSC_INSIDER_PROXY_PATH = "/proxy/ssc-insider";

/**
 * Muasamcong (Vietnamese government procurement portal) upstream base URL.
 * Geo-blocked outside Vietnam. Proxied at /proxy/muasamcong.
 */
const MUASAMCONG_UPSTREAM = "https://muasamcong.mpi.gov.vn";

/** Path for the muasamcong proxy endpoint. */
const MUASAMCONG_PROXY_PATH = "/proxy/muasamcong";

/**
 * Static file serving for cached BCTC PDFs.
 * Path pattern: /bctc-files/:code/:filename
 * Files are stored at BCTC_CACHE_DIR/<code>/<filename> by mcp-server BCTC discovery.
 */
const BCTC_FILES_PREFIX = "/bctc-files/";

/** Root directory for BCTC PDF cache. Configurable via env var. */
const BCTC_CACHE_DIR = process.env.BCTC_CACHE_DIR || "/root/bctc-cache";

/**
 * Path to the BCTC URL discovery script on the VPS.
 * Used by /proxy/bctc-discover/:ticker (Strategy 0 for bctcQueueEnricherJob).
 * Configurable via env var so tests / alternate installs can override.
 */
const BCTC_DISCOVER_SCRIPT = process.env.BCTC_DISCOVER_SCRIPT || "/root/discover-bctc-urls-browser.py";

/** Prefix path for the bctc-discover endpoint. */
const BCTC_DISCOVER_PREFIX = "/proxy/bctc-discover/";

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

/**
 * Run the BCTC URL discovery Python script and return an array of PDF URLs.
 *
 * The script is called as:
 *   python3 /root/discover-bctc-urls-browser.py <TICKER> [<YEAR>] [<QUARTER>]
 *
 * It emits JSON to stdout: { "results": [{ "url": "...", "local_path": "..." }, ...], "error": "..." }
 * This function parses that output and returns string[] of URL values.
 * Returns [] on any failure (script error, timeout, parse failure, empty results).
 *
 * @param {string} ticker - Uppercase ticker symbol (already validated by caller)
 * @param {string|null} year - Optional year string (e.g. "2025")
 * @param {string|null} quarter - Optional quarter string (e.g. "4")
 * @param {number} timeoutMs - Kill script after this many ms (default 120_000)
 * @returns {Promise<string[]>} Array of discovered PDF URLs
 */
function runDiscoverScript(ticker, year, quarter, timeoutMs) {
  return new Promise((resolve) => {
    const args = ["python3", BCTC_DISCOVER_SCRIPT, ticker];
    if (year) args.push(year);
    if (quarter) args.push(quarter);

    log("INFO", `bctc-discover: spawning ${args.join(" ")}`);

    // spawn avoids shell interpolation — ticker already validated, but defence-in-depth
    const child = spawn(args[0], args.slice(1), {
      timeout: timeoutMs,
      env: { ...process.env },
    });

    const stdoutChunks = [];
    const stderrChunks = [];

    child.stdout.on("data", (chunk) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk) => stderrChunks.push(chunk));

    child.on("close", (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString("utf8").trim();
      const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();

      if (code !== 0) {
        log("WARN", `bctc-discover: script exited ${code} for ${ticker}`, { stderr: stderr.slice(0, 200) });
        resolve([]);
        return;
      }

      if (!stdout) {
        log("WARN", `bctc-discover: empty stdout for ${ticker}`);
        resolve([]);
        return;
      }

      let parsed;
      try {
        parsed = JSON.parse(stdout);
      } catch (e) {
        log("WARN", `bctc-discover: JSON parse failed for ${ticker}`, { stdout: stdout.slice(0, 200) });
        resolve([]);
        return;
      }

      const results = Array.isArray(parsed.results) ? parsed.results : [];
      const urls = results
        .map((r) => (r && typeof r.url === "string" ? r.url : null))
        .filter(Boolean);

      if (parsed.error && urls.length === 0) {
        log("WARN", `bctc-discover: script reported error for ${ticker}`, { error: parsed.error });
      }

      log("INFO", `bctc-discover: ${ticker} → ${urls.length} URL(s) found`);
      resolve(urls);
    });

    child.on("error", (err) => {
      log("ERROR", `bctc-discover: spawn error for ${ticker}`, { error: err.message });
      resolve([]);
    });
  });
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

  // BCTC URL discovery via discover-bctc-urls-browser.py
  //   Incoming: GET /proxy/bctc-discover/:ticker?year=YYYY&quarter=Q
  //   Shells out to: python3 /root/discover-bctc-urls-browser.py <TICKER> [<YEAR>] [<QUARTER>]
  //   Returns: { results: [{url, source, confidence}], error: null } (always 200, never 5xx for empty)
  //   Shape matches bctcDiscovery.ts extractVpsPlaywrightUrls() envelope expectation (Sprint 1944a-vps)
  if (url.startsWith(BCTC_DISCOVER_PREFIX)) {
    // Extract ticker from path: /proxy/bctc-discover/<TICKER>
    const afterPrefix = url.slice(BCTC_DISCOVER_PREFIX.length);
    // Split off any query string
    const [tickerRaw] = afterPrefix.split("?");
    const ticker = (tickerRaw || "").toUpperCase().trim();

    // Validate ticker: 1-10 alphanumeric chars only (no shell injection possible via spawn, but still validate)
    if (!/^[A-Z0-9]{1,10}$/.test(ticker)) {
      log("WARN", `bctc-discover: invalid ticker "${ticker}" from ${req.socket.remoteAddress}`);
      return jsonResponse(res, 400, { error: "Invalid ticker", ticker });
    }

    // Parse optional year / quarter query params
    let year = null;
    let quarter = null;
    const qIdx = afterPrefix.indexOf("?");
    if (qIdx !== -1) {
      const qs = new URLSearchParams(afterPrefix.slice(qIdx + 1));
      const rawYear = qs.get("year");
      const rawQtr = qs.get("quarter");
      // Validate: year = 4 digits, quarter = 1 digit
      if (rawYear && /^\d{4}$/.test(rawYear)) year = rawYear;
      if (rawQtr && /^\d$/.test(rawQtr)) quarter = rawQtr;
    }

    log("INFO", `bctc-discover: ${ticker} year=${year} quarter=${quarter} from ${req.socket.remoteAddress}`);

    // Script is slow (browser automation) — allow up to 120s
    const urls = await runDiscoverScript(ticker, year, quarter, 120_000);

    // Wrap string[] in envelope shape expected by bctcDiscovery.ts extractVpsPlaywrightUrls()
    // { results: [{url, source, confidence}], error: null }
    // Fix: Sprint 1944a-vps — bare string[] response silently failed Array.isArray(parsed.results) guard
    return jsonResponse(res, 200, {
      results: urls.map((u) => ({ url: u, source: "vps-playwright", confidence: 1.0 })),
      error: null,
    });
  }

  // SSC insider transaction portal proxy (Task 1922a)
  //   Incoming: GET /proxy/ssc-insider
  //   Upstream: https://congbothongtin.ssc.gov.vn/.../ketquagiaodich.jspx
  //   Returns:  HTML page verbatim (text/html)
  if (url === SSC_INSIDER_PROXY_PATH || url.startsWith(SSC_INSIDER_PROXY_PATH + "?")) {
    log("INFO", `SSC insider proxy: GET ${SSC_INSIDER_UPSTREAM}`);

    try {
      const body = await fetchUpstream(SSC_INSIDER_UPSTREAM, 15_000);
      const payload = Buffer.from(body, "utf8");
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Length": payload.byteLength,
        "X-Proxy-Source": "congbothongtin.ssc.gov.vn",
      });
      res.end(payload);
      log("INFO", `SSC insider proxy OK: ${payload.byteLength}B`);
    } catch (err) {
      log("ERROR", "SSC insider proxy FAIL", { error: err.message });
      jsonResponse(res, 502, { error: "Bad gateway", detail: err.message });
    }
    return;
  }

  // Muasamcong procurement portal proxy
  //   Incoming: GET /proxy/muasamcong[?path=<path>]
  //   Upstream: https://muasamcong.mpi.gov.vn[<path>]
  //   Returns:  HTML page verbatim (text/html)
  if (url === MUASAMCONG_PROXY_PATH || url.startsWith(MUASAMCONG_PROXY_PATH + "?")) {
    const qs = new URLSearchParams(url.includes("?") ? url.slice(url.indexOf("?") + 1) : "");
    const appendPath = qs.get("path") || "";
    const upstreamUrl = `${MUASAMCONG_UPSTREAM}${appendPath}`;

    log("INFO", `Muasamcong proxy: GET ${upstreamUrl}`);

    try {
      const body = await fetchUpstream(upstreamUrl, 15_000);
      const payload = Buffer.from(body, "utf8");
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Length": payload.byteLength,
        "X-Proxy-Source": "muasamcong.mpi.gov.vn",
      });
      res.end(payload);
      log("INFO", `Muasamcong proxy OK: ${payload.byteLength}B`);
    } catch (err) {
      log("ERROR", "Muasamcong proxy FAIL", { error: err.message });
      jsonResponse(res, 502, { error: "Bad gateway", detail: err.message });
    }
    return;
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
  log("INFO", `BCTC discover:    GET /proxy/bctc-discover/:ticker[?year=YYYY&quarter=Q] (runs discover-bctc-urls-browser.py)`);
  log("INFO", `SSC insider:      GET /proxy/ssc-insider (proxies congbothongtin.ssc.gov.vn insider table)`);
  log("INFO", `Muasamcong:       GET /proxy/muasamcong[?path=<path>] (proxies muasamcong.mpi.gov.vn)`);
  log("INFO", `SSC iboard proxy: GET /proxy/ssc-iboard/dcm/financials/ticker/:ticker`);
  log("INFO", `BCTC files:       GET /bctc-files/:code/:filename (serves cached PDFs)`);
  log("INFO", `Health check:     GET /health`);
  log("INFO", `BCTC cache dir:   ${BCTC_CACHE_DIR}`);
  log("INFO", `BCTC discover script: ${BCTC_DISCOVER_SCRIPT}`);
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
