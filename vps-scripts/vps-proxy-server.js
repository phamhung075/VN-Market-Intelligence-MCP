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
 *   GET /proxy/agm-plan?ticker=<TICKER>
 *     → shells out to /root/vietstock-agm-plan.py --ticker <TICKER>
 *     → returns JSON: { status, tickers_ok, tickers_fallback, tickers_error, data, fetched_at }
 *     → data.<TICKER>.planned = [{stock_code, ptid, pt_name, year, value_raw, value_ty}]
 *     → data.<TICKER>.actuals = [{stock_code, year, report_term_id, report_norm_id, ptid, value_raw, value_ty}]
 *     → Auth: X-API-Key required
 *     → Batch: /proxy/agm-plan?batch=FPT,VIC,ACB (comma-separated, max 30)
 *     → Added: RAPID-DATA-LAYER / FIX-G (2026-06-04)
 *
 *   GET /proxy/board-details?ticker=<TICKER>
 *     → shells out to /root/vietstock-board-details.py --ticker <TICKER>
 *     → returns JSON: { status, tickers_ok, tickers_error, data, fetched_at }
 *     → data.<TICKER> = [{name, position_text, appointment_year, closed_date,
 *                          year_of_birth, independence, total_shares}]
 *     → appointment_year: integer year or null (N/A → null, never fabricated)
 *     → Auth: X-API-Key required
 *     → Batch: /proxy/board-details?batch=FPT,VCB,VNM (comma-separated, max 33)
 *     → Added: RAPID-DATA-LAYER / FIX-I-A (2026-06-04)
 *
 *   GET /proxy/article-body?url=<article-url>
 *     → shells out to /root/article-body-fetcher.py --url <url>
 *     → allowed domains: cafef.vn, vneconomy.vn, vnexpress.net
 *     → returns JSON: { status, url, source_domain, title, body_text, published_at, fetched_at }
 *     → HTTP-only (no Chromium) — all sites return 200 from Vietnam IP with browser headers
 *     → Auth: X-API-Key required
 *     → Added: VPS-NEWS-CAFEF-VNECO (P2 article body feature)
 *     → Extended: DFR-P2-VPS / DEEPFETCH-RAG-REDESIGN 2026-06-08 (added vnexpress.net)
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

/**
 * Path to the article body fetcher Python script.
 * Supports cafef.vn and vneconomy.vn article pages (HTTP-only, no Playwright).
 */
const ARTICLE_BODY_SCRIPT = process.env.ARTICLE_BODY_SCRIPT || "/root/article-body-fetcher.py";

/** Path for the article-body endpoint. */
const ARTICLE_BODY_PATH = "/proxy/article-body";

/** Domains allowed for article-body fetching (whitelist — prevents open proxy). */
const ARTICLE_BODY_ALLOWED_DOMAINS = new Set(["cafef.vn", "vneconomy.vn", "vnexpress.net"]);

/**
 * Path to the Vietstock AGM plan scraper Python script.
 * Fetches planned targets + actuals from finance.vietstock.vn.
 * Added: RAPID-DATA-LAYER / FIX-G (2026-06-04)
 */
const AGM_PLAN_SCRIPT = process.env.AGM_PLAN_SCRIPT || "/root/vietstock-agm-plan.py";

/** Path prefix for the agm-plan endpoint. */
const AGM_PLAN_PATH = "/proxy/agm-plan";

/** Maximum tickers per batch request. */
const AGM_PLAN_MAX_BATCH = 30;

/**
 * Path to the Vietstock board-details scraper Python script.
 * Fetches current-term officer appointment years from finance.vietstock.vn/data/boarddetails.
 * Added: RAPID-DATA-LAYER / FIX-I-A (2026-06-04)
 */
const BOARD_DETAILS_SCRIPT = process.env.BOARD_DETAILS_SCRIPT || "/root/vietstock-board-details.py";

/** Path prefix for the board-details endpoint. */
const BOARD_DETAILS_PATH = "/proxy/board-details";

/** Maximum tickers per batch request for board-details. */
const BOARD_DETAILS_MAX_BATCH = 33;

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

/**
 * Run the Vietstock AGM plan scraper for a single ticker or batch.
 *
 * The script is called as:
 *   python3 /root/vietstock-agm-plan.py --ticker <TICKER>
 *   python3 /root/vietstock-agm-plan.py --batch <T1,T2,...>
 *
 * It emits JSON to stdout: { status, tickers_ok, tickers_fallback, tickers_error, data, fetched_at }
 * Returns parsed result object on success, or { status: "error", reason: "..." } on failure.
 *
 * @param {string[]} tickers - Validated ticker list (max AGM_PLAN_MAX_BATCH)
 * @param {number} timeoutMs - Kill script after this many ms (default 60_000 for batch)
 * @returns {Promise<object>} Parsed JSON result from the script
 */
function runAgmPlanScript(tickers, timeoutMs = 60_000) {
  return new Promise((resolve) => {
    const isBatch = tickers.length > 1;
    const args = isBatch
      ? [AGM_PLAN_SCRIPT, "--batch", tickers.join(",")]
      : [AGM_PLAN_SCRIPT, "--ticker", tickers[0]];

    log("INFO", `agm-plan: spawning scraper for [${tickers.join(",")}]`);

    const child = spawn("python3", args, {
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

      if (!stdout) {
        log("WARN", `agm-plan: empty stdout`, { code, stderr: stderr.slice(0, 300) });
        resolve({ status: "error", reason: "Script produced no output", tickers });
        return;
      }

      let parsed;
      try {
        parsed = JSON.parse(stdout);
      } catch (e) {
        log("WARN", `agm-plan: JSON parse failed`, { stdout: stdout.slice(0, 200) });
        resolve({ status: "error", reason: "Invalid JSON from script", tickers });
        return;
      }

      log("INFO", `agm-plan: done — ok=${(parsed.tickers_ok || []).length} fallback=${(parsed.tickers_fallback || []).length} error=${(parsed.tickers_error || []).length}`);
      resolve(parsed);
    });

    child.on("error", (err) => {
      log("ERROR", `agm-plan: spawn error`, { error: err.message });
      resolve({ status: "error", reason: `Spawn error: ${err.message}`, tickers });
    });
  });
}

/**
 * Run the Vietstock board-details scraper for a single ticker or batch.
 *
 * The script is called as:
 *   python3 /root/vietstock-board-details.py --ticker <TICKER>
 *   python3 /root/vietstock-board-details.py --batch <T1,T2,...>
 *
 * It emits JSON to stdout:
 *   { status, tickers_ok, tickers_error, data, fetched_at }
 *   data.<TICKER> = [{name, position_text, appointment_year, closed_date,
 *                     year_of_birth, independence, total_shares}]
 *
 * Returns parsed result object on success, or { status: "error", reason: "..." } on failure.
 *
 * @param {string[]} tickers - Validated ticker list (max BOARD_DETAILS_MAX_BATCH)
 * @param {number} timeoutMs - Kill script after this many ms
 * @returns {Promise<object>} Parsed JSON result from the script
 */
function runBoardDetailsScript(tickers, timeoutMs = 120_000) {
  return new Promise((resolve) => {
    const isBatch = tickers.length > 1;
    const args = isBatch
      ? [BOARD_DETAILS_SCRIPT, "--batch", tickers.join(",")]
      : [BOARD_DETAILS_SCRIPT, "--ticker", tickers[0]];

    log("INFO", `board-details: spawning scraper for [${tickers.join(",")}]`);

    const child = spawn("python3", args, {
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

      if (!stdout) {
        log("WARN", `board-details: empty stdout`, { code, stderr: stderr.slice(0, 300) });
        resolve({ status: "error", reason: "Script produced no output", tickers });
        return;
      }

      let parsed;
      try {
        parsed = JSON.parse(stdout);
      } catch (e) {
        log("WARN", `board-details: JSON parse failed`, { stdout: stdout.slice(0, 200) });
        resolve({ status: "error", reason: "Invalid JSON from script", tickers });
        return;
      }

      log(
        "INFO",
        `board-details: done — ok=${(parsed.tickers_ok || []).length} error=${(parsed.tickers_error || []).length}`,
      );
      resolve(parsed);
    });

    child.on("error", (err) => {
      log("ERROR", `board-details: spawn error`, { error: err.message });
      resolve({ status: "error", reason: `Spawn error: ${err.message}`, tickers });
    });
  });
}

/**
 * Run the article body fetcher Python script for a given URL.
 *
 * The script is called as:
 *   python3 /root/article-body-fetcher.py --url <article-url>
 *
 * It emits JSON to stdout: { status, url, source_domain, title, body_text, published_at, fetched_at }
 * Returns parsed result object on success, or { status: "error", reason: "..." } on any failure.
 *
 * @param {string} articleUrl - Article URL (already validated by caller — allowed domain only)
 * @param {number} timeoutMs - Kill script after this many ms (default 20_000)
 * @returns {Promise<object>} Parsed JSON result from the script
 */
function runArticleBodyScript(articleUrl, timeoutMs = 20_000) {
  return new Promise((resolve) => {
    log("INFO", `article-body: spawning fetcher for ${articleUrl}`);

    // spawn avoids shell interpolation — URL is passed as a separate argv element
    const child = spawn("python3", [ARTICLE_BODY_SCRIPT, "--url", articleUrl], {
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

      if (!stdout) {
        log("WARN", `article-body: empty stdout for ${articleUrl}`, { code, stderr: stderr.slice(0, 200) });
        resolve({ status: "error", reason: "Script produced no output", url: articleUrl });
        return;
      }

      let parsed;
      try {
        parsed = JSON.parse(stdout);
      } catch (e) {
        log("WARN", `article-body: JSON parse failed for ${articleUrl}`, { stdout: stdout.slice(0, 200) });
        resolve({ status: "error", reason: "Invalid JSON from script", url: articleUrl });
        return;
      }

      if (parsed.status !== "ok") {
        log("WARN", `article-body: script returned error for ${articleUrl}`, { reason: parsed.reason });
      } else {
        const bodyLen = (parsed.body_text || "").length;
        log("INFO", `article-body: OK for ${articleUrl} (title="${(parsed.title || "").slice(0, 60)}", body=${bodyLen}ch)`);
      }

      resolve(parsed);
    });

    child.on("error", (err) => {
      log("ERROR", `article-body: spawn error for ${articleUrl}`, { error: err.message });
      resolve({ status: "error", reason: `Spawn error: ${err.message}`, url: articleUrl });
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

  // AGM business plan fetch via vietstock-agm-plan.py
  //   Incoming: GET /proxy/agm-plan?ticker=FPT  OR  /proxy/agm-plan?batch=FPT,VIC,ACB
  //   Shells out to: python3 /root/vietstock-agm-plan.py --ticker <T> | --batch <T1,T2,...>
  //   Returns: { status, tickers_ok, tickers_fallback, tickers_error, data, fetched_at }
  //   Added: RAPID-DATA-LAYER / FIX-G (2026-06-04)
  if (url === AGM_PLAN_PATH || url.startsWith(AGM_PLAN_PATH + "?")) {
    const qs = new URLSearchParams(url.includes("?") ? url.slice(url.indexOf("?") + 1) : "");
    const rawTicker = qs.get("ticker") || "";
    const rawBatch = qs.get("batch") || "";

    if (!rawTicker && !rawBatch) {
      return jsonResponse(res, 400, { error: "Missing required query param: ticker or batch" });
    }

    // Validate and build ticker list
    const TICKER_RE = /^[A-Z0-9]{1,10}$/;
    let tickers;
    if (rawBatch) {
      tickers = rawBatch.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean);
    } else {
      tickers = [rawTicker.trim().toUpperCase()];
    }

    if (tickers.length === 0) {
      return jsonResponse(res, 400, { error: "No valid tickers provided" });
    }
    if (tickers.length > AGM_PLAN_MAX_BATCH) {
      return jsonResponse(res, 400, { error: `Batch size exceeds maximum (${AGM_PLAN_MAX_BATCH})`, got: tickers.length });
    }

    const invalid = tickers.filter((t) => !TICKER_RE.test(t));
    if (invalid.length > 0) {
      return jsonResponse(res, 400, { error: "Invalid ticker(s)", invalid });
    }

    log("INFO", `agm-plan: request for [${tickers.join(",")}] from ${req.socket.remoteAddress}`);

    // Allow 2s per ticker + 10s base (CSRF warmup per session, ~0.35s pacing between tickers)
    const timeoutMs = Math.min(10_000 + tickers.length * 4_000, 120_000);
    const result = await runAgmPlanScript(tickers, timeoutMs);
    const httpStatus = result.status === "ok" ? 200 : 502;
    return jsonResponse(res, httpStatus, result);
  }

  // Board-of-management officer details via vietstock-board-details.py
  //   Incoming: GET /proxy/board-details?ticker=FPT  OR  /proxy/board-details?batch=FPT,VCB,VNM
  //   Shells out to: python3 /root/vietstock-board-details.py --ticker <T> | --batch <T1,T2,...>
  //   Returns: { status, tickers_ok, tickers_error, data, fetched_at }
  //   data.<TICKER> = [{name, position_text, appointment_year, closed_date, year_of_birth, independence, total_shares}]
  //   appointment_year: integer year or null (N/A entries → null, NEVER fabricated)
  //   Added: RAPID-DATA-LAYER / FIX-I-A (2026-06-04)
  if (url === BOARD_DETAILS_PATH || url.startsWith(BOARD_DETAILS_PATH + "?")) {
    const qs = new URLSearchParams(url.includes("?") ? url.slice(url.indexOf("?") + 1) : "");
    const rawTicker = qs.get("ticker") || "";
    const rawBatch = qs.get("batch") || "";

    if (!rawTicker && !rawBatch) {
      return jsonResponse(res, 400, { error: "Missing required query param: ticker or batch" });
    }

    const TICKER_RE = /^[A-Z0-9]{1,10}$/;
    let tickers;
    if (rawBatch) {
      tickers = rawBatch.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean);
    } else {
      tickers = [rawTicker.trim().toUpperCase()];
    }

    if (tickers.length === 0) {
      return jsonResponse(res, 400, { error: "No valid tickers provided" });
    }
    if (tickers.length > BOARD_DETAILS_MAX_BATCH) {
      return jsonResponse(res, 400, {
        error: `Batch size exceeds maximum (${BOARD_DETAILS_MAX_BATCH})`,
        got: tickers.length,
      });
    }

    const invalid = tickers.filter((t) => !TICKER_RE.test(t));
    if (invalid.length > 0) {
      return jsonResponse(res, 400, { error: "Invalid ticker(s)", invalid });
    }

    log("INFO", `board-details: request for [${tickers.join(",")}] from ${req.socket.remoteAddress}`);

    // Allow 4s per ticker + 10s base (CSRF warmup per session)
    const timeoutMs = Math.min(10_000 + tickers.length * 4_000, 180_000);
    const result = await runBoardDetailsScript(tickers, timeoutMs);
    const httpStatus = result.status === "ok" ? 200 : 502;
    return jsonResponse(res, httpStatus, result);
  }

  // Article body fetch via article-body-fetcher.py
  //   Incoming: GET /proxy/article-body?url=<percent-encoded-article-url>
  //   Shells out to: python3 /root/article-body-fetcher.py --url <url>
  //   Returns: { status, url, source_domain, title, body_text, published_at, fetched_at }
  //   Allowed domains: cafef.vn, vneconomy.vn (whitelist enforced here AND in script)
  //   Added: VPS-NEWS-CAFEF-VNECO (P2 article body feature)
  if (url === ARTICLE_BODY_PATH || url.startsWith(ARTICLE_BODY_PATH + "?")) {
    const qs = new URLSearchParams(url.includes("?") ? url.slice(url.indexOf("?") + 1) : "");
    const rawUrl = qs.get("url") || "";

    if (!rawUrl) {
      return jsonResponse(res, 400, { error: "Missing required query param: url" });
    }

    // Validate URL is parseable
    let parsedArticleUrl;
    try {
      parsedArticleUrl = new URL(rawUrl);
    } catch (_e) {
      return jsonResponse(res, 400, { error: "Invalid URL", url: rawUrl });
    }

    // Whitelist check — strip www. prefix
    const articleDomain = parsedArticleUrl.hostname.replace(/^www\./, "");
    if (!ARTICLE_BODY_ALLOWED_DOMAINS.has(articleDomain)) {
      return jsonResponse(res, 400, {
        error: "Domain not allowed",
        domain: articleDomain,
        allowed: [...ARTICLE_BODY_ALLOWED_DOMAINS],
      });
    }

    // Must be HTTPS
    if (parsedArticleUrl.protocol !== "https:") {
      return jsonResponse(res, 400, { error: "URL must use HTTPS", url: rawUrl });
    }

    log("INFO", `article-body: request for ${rawUrl} from ${req.socket.remoteAddress}`);

    const result = await runArticleBodyScript(rawUrl, 20_000);
    const httpStatus = result.status === "ok" ? 200 : 502;
    return jsonResponse(res, httpStatus, result);
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
  log("INFO", `AGM plan:         GET /proxy/agm-plan?ticker=FPT | ?batch=FPT,VIC,ACB (runs vietstock-agm-plan.py)`);
  log("INFO", `Board details:    GET /proxy/board-details?ticker=FPT | ?batch=FPT,VCB,VNM (runs vietstock-board-details.py)`);
  log("INFO", `Article body:     GET /proxy/article-body?url=<https://cafef.vn/...|https://vnexpress.net/...> (runs article-body-fetcher.py)`);
  log("INFO", `BCTC discover:    GET /proxy/bctc-discover/:ticker[?year=YYYY&quarter=Q] (runs discover-bctc-urls-browser.py)`);
  log("INFO", `SSC insider:      GET /proxy/ssc-insider (proxies congbothongtin.ssc.gov.vn insider table)`);
  log("INFO", `Muasamcong:       GET /proxy/muasamcong[?path=<path>] (proxies muasamcong.mpi.gov.vn)`);
  log("INFO", `SSC iboard proxy: GET /proxy/ssc-iboard/dcm/financials/ticker/:ticker`);
  log("INFO", `BCTC files:       GET /bctc-files/:code/:filename (serves cached PDFs)`);
  log("INFO", `Health check:     GET /health`);
  log("INFO", `BCTC cache dir:   ${BCTC_CACHE_DIR}`);
  log("INFO", `BCTC discover script: ${BCTC_DISCOVER_SCRIPT}`);
  log("INFO", `Article body script:  ${ARTICLE_BODY_SCRIPT}`);
  log("INFO", `AGM plan script:      ${AGM_PLAN_SCRIPT}`);
  log("INFO", `Board details script: ${BOARD_DETAILS_SCRIPT}`);
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
