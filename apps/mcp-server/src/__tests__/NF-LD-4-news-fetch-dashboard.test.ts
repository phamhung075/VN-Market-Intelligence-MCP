/**
 * NF-LD-4-dev-A — TDD tests for GET /dashboards/news-fetch/* static handler
 *
 * Tests:
 *   (a) GET /dashboards/news-fetch/ (asset=null) → 200, text/html, contains id="panel-live-data"
 *   (b) GET /dashboards/news-fetch/index.html   → 200, text/html
 *   (c) GET /dashboards/news-fetch/data.js      → 200, text/javascript
 *   (d) GET /dashboards/news-fetch/results.json → 200, application/json
 *   (e) Path traversal: asset containing ".."   → 400
 *   (f) Path traversal: asset containing "/"    → 400
 *   (g) Unknown asset                           → 404
 *   (h) Relative ENDPOINT: served index.html has no "localhost:3000" in ENDPOINT var
 *   (i) Relative ENDPOINT: served index.html has '/api/news-fetch/live' as ENDPOINT
 *   (j) file:// degrade branch present in served index.html
 *   (k) No credentials in served index.html
 */

import { describe, test, expect } from "bun:test";
import type { IncomingMessage, ServerResponse } from "node:http";
import { handleNewsFetchDashboard } from "../interface/mcp/routes/newsFetchDashboardHandler.js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — minimal mock IncomingMessage / ServerResponse
// ─────────────────────────────────────────────────────────────────────────────

function mockResponse(): {
  res: ServerResponse;
  statusCode: () => number;
  headers: () => Record<string, string>;
  body: () => string;
} {
  let _statusCode = 0;
  let _headers: Record<string, string> = {};
  let _body = "";

  const res = {
    writeHead(code: number, hdrs?: Record<string, string>) {
      _statusCode = code;
      if (hdrs) _headers = { ..._headers, ...hdrs };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    end(data?: any) {
      if (data !== undefined && data !== null) {
        _body = typeof data === "string" ? data : String(data);
      }
    },
  } as unknown as ServerResponse;

  return {
    res,
    statusCode: () => _statusCode,
    headers: () => _headers,
    body: () => _body,
  };
}

const DUMMY_REQ = {} as IncomingMessage;

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("NF-LD-4 — handleNewsFetchDashboard", () => {
  // (a) Root path → index.html
  test("(a) asset=null returns 200 text/html with panel-live-data", () => {
    const { res, statusCode, headers, body } = mockResponse();
    handleNewsFetchDashboard(DUMMY_REQ, res, null);
    expect(statusCode()).toBe(200);
    expect(headers()["Content-Type"]).toContain("text/html");
    const html = body();
    expect(html).toContain('id="panel-live-data"');
    expect(html).toContain('id="panel-primitives"');
    expect(html).toContain('id="panel-module"');
    expect(html).toContain('id="panel-microservice"');
  });

  // (b) index.html asset
  test("(b) asset='index.html' returns 200 text/html", () => {
    const { res, statusCode, headers } = mockResponse();
    handleNewsFetchDashboard(DUMMY_REQ, res, "index.html");
    expect(statusCode()).toBe(200);
    expect(headers()["Content-Type"]).toContain("text/html");
  });

  // (c) data.js asset
  test("(c) asset='data.js' returns 200 text/javascript", () => {
    const { res, statusCode, headers, body } = mockResponse();
    handleNewsFetchDashboard(DUMMY_REQ, res, "data.js");
    expect(statusCode()).toBe(200);
    expect(headers()["Content-Type"]).toContain("text/javascript");
    expect(body()).toContain("window.__NEWS_FETCH_DATA__");
  });

  // (d) results.json asset
  test("(d) asset='results.json' returns 200 application/json", () => {
    const { res, statusCode, headers, body } = mockResponse();
    handleNewsFetchDashboard(DUMMY_REQ, res, "results.json");
    expect(statusCode()).toBe(200);
    expect(headers()["Content-Type"]).toContain("application/json");
    // Verify it is valid JSON
    const parsed = JSON.parse(body().toString());
    expect(parsed).toHaveProperty("runAt");
  });

  // (e) Path traversal with ".."
  test("(e) asset containing '..' returns 400", () => {
    const { res, statusCode } = mockResponse();
    handleNewsFetchDashboard(DUMMY_REQ, res, "../../../etc/passwd");
    expect(statusCode()).toBe(400);
  });

  // (f) Path traversal with "/"
  test("(f) asset containing '/' returns 400", () => {
    const { res, statusCode } = mockResponse();
    handleNewsFetchDashboard(DUMMY_REQ, res, "subdir/evil.js");
    expect(statusCode()).toBe(400);
  });

  // (g) Unknown asset → 404
  test("(g) unknown asset returns 404", () => {
    const { res, statusCode } = mockResponse();
    handleNewsFetchDashboard(DUMMY_REQ, res, "nonexistent-file-xyzzy.js");
    expect(statusCode()).toBe(404);
  });

  // (h) No absolute localhost:3000 in ENDPOINT var
  test("(h) served index.html has no 'localhost:3000' in ENDPOINT variable", () => {
    const { res, body } = mockResponse();
    handleNewsFetchDashboard(DUMMY_REQ, res, null);
    const html = body();
    // Find the ENDPOINT variable line — must NOT contain localhost:3000
    const endpointLine = html.split("\n").find((l) => l.includes("var ENDPOINT"));
    expect(endpointLine).toBeDefined();
    expect(endpointLine).not.toContain("localhost:3000");
  });

  // (i) Relative ENDPOINT present
  test("(i) served index.html ENDPOINT is relative '/api/news-fetch/live...'", () => {
    const { res, body } = mockResponse();
    handleNewsFetchDashboard(DUMMY_REQ, res, null);
    const html = body();
    expect(html).toContain("var ENDPOINT = '/api/news-fetch/live");
  });

  // (j) file:// degrade branch present
  test("(j) served index.html contains file:// degrade check", () => {
    const { res, body } = mockResponse();
    handleNewsFetchDashboard(DUMMY_REQ, res, null);
    const html = body();
    expect(html).toContain("window.location.protocol === 'file:'");
  });

  // (k) No credentials in served index.html
  test("(k) served index.html contains no credentials", () => {
    const { res, body } = mockResponse();
    handleNewsFetchDashboard(DUMMY_REQ, res, null);
    const html = body();
    expect(html).not.toMatch(/VPS_PUSH_API_KEY|x-api-key|Authorization|Bearer|DB_PATH|process\.env|Bun\.env/);
  });
});
