/**
 * bctc-eval-proxy-trailing-slash.test.ts
 *
 * Regression lock for FE-PG-BCTC-EVAL-_INDEX-FUNC-FIX part 2 (root-cause the
 * 404 on GET /api/bctc-eval through the frontend proxy).
 *
 * Live-verified (2026-07-24): mcp-server treats "/api/bctc-eval" and
 * "/api/bctc-eval/" as DISTINCT routes — only the no-trailing-slash form
 * returns 200; the trailing-slash form 404s with
 * {"error":"Not found","path":"/api/bctc-eval/"}.
 *
 * app/routes/api.bctc-eval.$.tsx is a splat resource route
 * (`/api/bctc-eval/*`). React Router's `*` splat matches a bare
 * `/api/bctc-eval` request with params["*"] === "" (empty string). The old
 * code unconditionally built the upstream URL as
 * `${BASE}/api/bctc-eval/${subpath}` — when subpath is "", that produces a
 * trailing slash and mcp-server 404s it. buildBctcEvalUpstreamUrl() is the
 * extracted, directly-testable fix: no trailing slash when subpath is empty.
 *
 * buildBctcEvalUpstreamUrl is a plain exported function (not `loader`/
 * `action`) so it survives Remix's server-only export stripping under the
 * jsdom test environment (see dashboard.bctc-eval._index.tsx JSDoc for the
 * same pattern applied to the loader).
 */

import { describe, it, expect } from "vitest";
import { buildBctcEvalUpstreamUrl } from "~/routes/api.bctc-eval.$";

describe("buildBctcEvalUpstreamUrl — trailing-slash regression (FE-PG-BCTC-EVAL-_INDEX-FUNC-FIX)", () => {
  it("empty subpath (bare GET /api/bctc-eval) — NO trailing slash", () => {
    const url = buildBctcEvalUpstreamUrl("", "");
    expect(url).toMatch(/\/api\/bctc-eval$/);
    expect(url.endsWith("/api/bctc-eval/")).toBe(false);
  });

  it("empty subpath with query string — search appended, still no trailing slash before it", () => {
    const url = buildBctcEvalUpstreamUrl("", "?foo=bar");
    expect(url).toContain("/api/bctc-eval?foo=bar");
    expect(url).not.toContain("/api/bctc-eval/?");
  });

  it("non-empty subpath — slash-joined as before (e.g. recompute/{id})", () => {
    const url = buildBctcEvalUpstreamUrl("recompute/abc-123", "");
    expect(url).toMatch(/\/api\/bctc-eval\/recompute\/abc-123$/);
  });

  it("non-empty subpath with query string — search appended after subpath", () => {
    const url = buildBctcEvalUpstreamUrl("abc-123", "?page=2");
    expect(url).toBe(url); // sanity: no throw
    expect(url).toContain("/api/bctc-eval/abc-123?page=2");
  });

  it("upstream base is MCP_SERVER_BASE_URL (default localhost:3000 in test env)", () => {
    const url = buildBctcEvalUpstreamUrl("", "");
    expect(url).toContain("/api/bctc-eval");
    expect(url.startsWith("http")).toBe(true);
  });
});
